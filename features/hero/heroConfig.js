// ── Hero Config canonical model (schemaVersion 2) ───────────────────────────
// Pure helpers shared by the server endpoints (server.ts) and unit-tested via
// heroConfig.test.cjs.  No I/O happens here so every rule is deterministically
// testable.
//
// CANONICAL SHAPE stored in db.heroConfig and Firestore config/featured:
//   {
//     schemaVersion: 2,
//     configured: true,                       // Admin explicitly saved/cleared
//     video1: { url, videoId } | null,
//     video2: { url, videoId } | null,
//     heroRevision: "<count>-<timestamp>",    // unique per save, count-sortable
//     updatedAt: ISO string                   // created SERVER-side only
//   }
//
// Core rules enforced here:
//   1. Omitted field vs empty field are DIFFERENT operations:
//        - key absent from the request body  -> keep existing value untouched*
//        - key present as ""/null/whitespace -> DELETE that slot (null)
//        - key present with a valid URL      -> save normalized entry
//        (*the admin UI's dedicated endpoint requires BOTH keys — full form)
//   2. A non-empty value that is not a valid YouTube video URL REJECTS the
//      whole save (throws INVALID_HERO_URL) before any state mutates.
//   3. When both slots end up null the derived playlist is [] and NO fallback
//      of any kind may resurrect a video elsewhere.

"use strict";

const SCHEMA_VERSION = 2;

// ── YouTube URL parsing ─────────────────────────────────────────────────────
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Host allowlist — anything else is rejected outright.
const isYouTubeHost = (host) =>
  /(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host);

// Paths that identify a video ID directly on youtube.com / youtu.be.
const extractIdFromPath = (pathname) => {
  // youtu.be/<id>
  let m = pathname.match(/^\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
  if (m) return m[1];
  // youtube.com/(embed|v|shorts|live)/<id>
  m = pathname.match(/^\/(?:embed|v|shorts|live)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
  if (m) return m[1];
  return null;
};

/**
 * Extracts exactly ONE video id from a URL string, or returns null when the
 * URL must be REJECTED (playlist-only, channel, search, non-YouTube, garbage).
 * Tracking parameters (si, t, list, index, feature, start_radio, ...) are
 * ignored — they never influence extraction and never survive in output.
 */
const extractVideoIdStrict = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const decoded = decodeStoredUrl(rawUrl).trim();
  if (!decoded) return null;

  let parsed;
  try {
    parsed = new URL(decoded);
  } catch (_) {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  if (!isYouTubeHost(parsed.hostname.toLowerCase())) return null;

  const pathname = parsed.pathname;
  const params = parsed.searchParams;

  // Hard rejects — these contexts can NEVER yield a single deterministic video.
  const lowerPath = pathname.toLowerCase();
  if (
    lowerPath.startsWith("/playlist") ||
    lowerPath.startsWith("/channel/") ||
    lowerPath.startsWith("/user/") ||
    lowerPath.startsWith("/c/") ||
    lowerPath.startsWith("/results") ||
    lowerPath.startsWith("/feed/") ||
    lowerPath.startsWith("/@")
  ) {
    return null;
  }

  // watch?v=<id> wins over any list= context (a list param alongside v is a
  // tracking/recommendation hint and MUST be dropped, not followed).
  const vParam = params.get("v");
  if (vParam && YT_ID_RE.test(vParam.trim())) return vParam.trim();

  const fromPath = extractIdFromPath(pathname);
  if (fromPath) return fromPath;

  // A bare ?v= missing / list-only / unknown shape → reject.
  return null;
};

/** Legacy loose extractor kept for storage repair (never for validation). */
const YT_ID_PATTERNS = [
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/(?:embed|v|shorts|live)\/([A-Za-z0-9_-]{11})/,
  /[?&]v=([A-Za-z0-9_-]{11})/,
];
const extractYouTubeId = (url) => {
  if (!url || typeof url !== "string") return "";
  for (const pattern of YT_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return "";
};

// Admin input may pass through an HTML-escaping middleware that encodes "/" as
// &#x2F; (or &#47;) and "&" as &amp;. Decode those so stored URLs stay real URLs.
function decodeStoredUrl(value) {
  if (typeof value !== "string") return value;
  return String(value)
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
}

// Canonical stored form: https://youtu.be/<VIDEO_ID> (per canonical schema).
const canonicalUrlForId = (videoId) => `https://youtu.be/${videoId}`;

// ── normalizeHeroValue ──────────────────────────────────────────────────────
// "" | whitespace | null | undefined  -> null                    (clear slot)
// valid single-video YouTube URL      -> { url: canonical, videoId }
// anything else non-empty             -> THROWS "INVALID_HERO_URL"
const normalizeHeroValue = (rawValue) => {
  if (rawValue === null || rawValue === undefined) return null;
  const decoded = typeof rawValue === "string" ? decodeStoredUrl(rawValue) : rawValue;
  if (typeof decoded !== "string") throw new Error("INVALID_HERO_URL");
  const trimmed = decoded.trim();
  if (trimmed === "") return null;
  const videoId = extractVideoIdStrict(trimmed);
  if (!videoId) throw new Error("INVALID_HERO_URL");
  return { url: canonicalUrlForId(videoId), videoId };
};

// Re-normalizes a value read back FROM storage. Storage data was validated at
// write time, so this never throws — it repairs legacy shapes (plain strings,
// old loose URLs) into canonical entries or degrades them to null.
const sanitizeStoredEntry = (stored) => {
  if (stored === null || stored === undefined) return null;
  if (typeof stored === "string") {
    const trimmed = stored.trim();
    if (!trimmed) return null;
    // Repair path: accept any parseable YouTube video URL from old data.
    const strictId = extractVideoIdStrict(trimmed);
    if (strictId) return { url: canonicalUrlForId(strictId), videoId: strictId };
    const looseId = extractYouTubeId(trimmed);
    if (looseId && YT_ID_RE.test(looseId)) {
      return { url: canonicalUrlForId(looseId), videoId: looseId };
    }
    return null;
  }
  if (typeof stored === "object") {
    const url = typeof stored.url === "string" ? stored.url.trim() : "";
    if (!url) return null;
    const strictId = extractVideoIdStrict(url);
    const id = strictId || (YT_ID_RE.test(String(stored.videoId || "")) ? String(stored.videoId) : "");
    if (!id) return null;
    return { url: canonicalUrlForId(id), videoId: id };
  }
  return null;
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// ── computeHeroPairUpdate ───────────────────────────────────────────────────
// Applies hasOwnProperty semantics to the request body against the CURRENT
// canonical state.  Pure: reads state, never mutates it; validation errors
// throw BEFORE the caller commits anything (atomicity).
// Returns { next: {video1, video2}, touched: string[] }.
const computeHeroPairUpdate = (currentState, body = {}) => {
  const next = {
    video1: sanitizeStoredEntry(currentState?.video1),
    video2: sanitizeStoredEntry(currentState?.video2),
  };
  const touched = [];
  if (hasOwn(body, "video1")) {
    next.video1 = normalizeHeroValue(body.video1);
    touched.push("video1");
  }
  if (hasOwn(body, "video2")) {
    next.video2 = normalizeHeroValue(body.video2);
    touched.push("video2");
  }
  return { next, touched };
};

// Legacy clients still send heroPlaylist[] / heroVideoUrl. Map them onto the
// canonical pair so old callers keep working with identical persistence rules.
// An empty list means "clear everything".
const computeLegacyHeroUpdate = (_currentState, heroPlaylistRaw, heroSingleRaw) => {
  let list = [];
  if (Array.isArray(heroPlaylistRaw)) {
    list = heroPlaylistRaw.filter(
      (u) => typeof u === "string" && u.trim() !== ""
    );
  }
  // Single-URL fallback applies whenever the playlist yielded nothing —
  // mirrors the historical endpoint behaviour (empty playlist + a
  // heroVideoUrl still saved that one URL).
  if (
    !list.length &&
    typeof heroSingleRaw === "string" &&
    heroSingleRaw.trim() !== ""
  ) {
    list = [heroSingleRaw.trim()];
  }
  return {
    video1: list[0] !== undefined ? normalizeHeroValue(list[0]) : null,
    video2: list[1] !== undefined ? normalizeHeroValue(list[1]) : null,
  };
};

// True when the canonical pair holds no video at all.
const isHeroCleared = (canonicalPair) =>
  !canonicalPair?.video1 && !canonicalPair?.video2;

// ── Revision helpers ────────────────────────────────────────────────────────
// heroRevision is a unique STRING per save: "<count>-<millis>". The numeric
// prefix orders revisions; the timestamp guarantees global uniqueness even if
// two stores briefly hold equal counts. Legacy numeric revisions are accepted
// on read and upgraded on the next write.
const revisionCountOf = (revision) => {
  if (typeof revision === "number" && Number.isFinite(revision)) return Math.max(0, Math.floor(revision));
  if (typeof revision === "string") {
    const n = parseInt(revision, 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
};

const nextRevision = (previous) => `${revisionCountOf(previous) + 1}-${Date.now()}`;

// Builds the complete canonical document for an atomic write.
const buildCanonicalConfig = (video1, video2, previousRevision, nowIso) => ({
  schemaVersion: SCHEMA_VERSION,
  configured: true,
  video1: sanitizeStoredEntry(video1),
  video2: sanitizeStoredEntry(video2),
  heroRevision: nextRevision(previousRevision),
  updatedAt: nowIso || new Date().toISOString(),
});

// True when a persisted doc carries explicit canonical markers (schemaVersion
// 2+ / configured flag). Such docs — INCLUDING EMPTY ONES — completely block
// legacy migration/fallback at boot and on every read path.
const isCanonicalHeroDoc = (doc) => {
  if (!doc || typeof doc !== "object") return false;
  if (Number(doc.schemaVersion) >= SCHEMA_VERSION) return true;
  if (doc.configured === true) return true;
  // Docs written between the previous session and this one used a numeric
  // heroRevision with the slot model — treat them as canonical too.
  return typeof doc.heroRevision === "number";
};

// Read-after-write comparator. Returns null when EQUAL, otherwise a short
// description of the first mismatch found.
const verifyPersistedConfig = (persisted, intended) => {
  if (!persisted || typeof persisted !== "object") return "persisted config missing";
  if (Number(persisted.schemaVersion) !== SCHEMA_VERSION) {
    return `schemaVersion mismatch (got ${persisted.schemaVersion})`;
  }
  if (persisted.configured !== true) return "configured marker missing";
  for (const slot of ["video1", "video2"]) {
    const got = sanitizeStoredEntry(persisted[slot]);
    const want = intended[slot]; // already-normalized entry or null
    const gotId = got ? got.videoId : null;
    const wantId = want ? want.videoId : null;
    if (gotId !== wantId) {
      return `${slot} mismatch (want ${JSON.stringify(wantId)}, got ${JSON.stringify(gotId)})`;
    }
  }
  if (revisionCountOf(persisted.heroRevision) !== revisionCountOf(intended.heroRevision)) {
    return `heroRevision mismatch (got ${persisted.heroRevision})`;
  }
  return null;
};

// Derives the response/persistence view consumed by clients AND the admin UI.
// When cleared: heroVideoUrl === "" and heroPlaylist === []. The canonical
// slots always travel along so emptiness is observable, not inferred.
const deriveHeroView = (canonicalState) => {
  const v1 = sanitizeStoredEntry(canonicalState?.video1);
  const v2 = sanitizeStoredEntry(canonicalState?.video2);
  const playlist = [v1?.url, v2?.url].filter((u) => !!u);
  return {
    schemaVersion: Number(canonicalState?.schemaVersion) || SCHEMA_VERSION,
    configured: canonicalState?.configured === true,
    video1: v1,
    video2: v2,
    heroRevision:
      typeof canonicalState?.heroRevision === "string"
        ? canonicalState.heroRevision
        : String(revisionCountOf(canonicalState?.heroRevision)),
    updatedAt: canonicalState?.updatedAt || null,
    // Derived legacy fields (backward compatibility for old clients):
    heroVideoUrl: playlist[0] || "",
    heroPlaylist: playlist,
  };
};

// ── migrateLegacyHeroConfig ─────────────────────────────────────────────────
// Converts any historical shape into the canonical shape. Idempotent — safe to
// call on every access (getHeroState()). Never throws on dirty storage data;
// unparseable entries degrade to null instead of crashing boot.
const migrateLegacyHeroConfig = (raw) => {
  const base = {
    schemaVersion: SCHEMA_VERSION,
    configured: false,
    video1: null,
    video2: null,
    heroRevision: "0",
    updatedAt: null,
  };
  if (!raw || typeof raw !== "object") return base;

  if (hasOwn(raw, "video1") || hasOwn(raw, "video2")) {
    const hadExplicitSave =
      raw.configured === true ||
      Boolean(sanitizeStoredEntry(raw.video1)) ||
      Boolean(sanitizeStoredEntry(raw.video2));
    return {
      ...base,
      configured: hadExplicitSave,
      video1: sanitizeStoredEntry(raw.video1),
      video2: sanitizeStoredEntry(raw.video2),
      heroRevision:
        typeof raw.heroRevision === "string"
          ? raw.heroRevision
          : String(revisionCountOf(raw.heroRevision)),
      updatedAt: raw.updatedAt || null,
    };
  }

  // Legacy shape #1: heroPlaylist array + heroVideoUrl single (pre-canonical).
  if (Array.isArray(raw.heroPlaylist) && raw.heroPlaylist.length > 0) {
    const v1 = sanitizeStoredEntry(String(raw.heroPlaylist[0] || ""));
    const v2 = sanitizeStoredEntry(String(raw.heroPlaylist[1] || ""));
    if (v1 || v2) {
      return {
        ...base,
        configured: true, // an admin DID configure this content historically
        video1: v1,
        video2: v2,
        heroRevision: "1",
      };
    }
  }
  // Legacy shape #2: single heroVideoUrl string.
  if (typeof raw.heroVideoUrl === "string" && raw.heroVideoUrl.trim() !== "") {
    const v1 = sanitizeStoredEntry(raw.heroVideoUrl);
    if (v1) return { ...base, configured: true, video1: v1, heroRevision: "1" };
  }
  return base;
};

// Legacy keys written by older versions into the Firestore config/featured
// document. Every write-through NULLS them (via updateMask) so no stale link
// can ever be re-read by any client. NOTE: trailerUrl is intentionally NOT in
// this list — it is a per-movie field on movie documents, not a hero key.
const HERO_LEGACY_FS_FIELDS = [
  "heroPlaylistData",
  "video_trailers",
  "heroTrailers",
  "heroTrailer",
  "heroVideos",
  "primaryHeroVideo",
  "secondaryHeroVideo",
];

module.exports = {
  SCHEMA_VERSION,
  YT_ID_PATTERNS,
  extractYouTubeId,
  extractVideoIdStrict,
  decodeStoredUrl,
  canonicalUrlForId,
  normalizeHeroValue,
  sanitizeStoredEntry,
  computeHeroPairUpdate,
  computeLegacyHeroUpdate,
  isHeroCleared,
  buildCanonicalConfig,
  isCanonicalHeroDoc,
  verifyPersistedConfig,
  deriveHeroView,
  migrateLegacyHeroConfig,
  revisionCountOf,
  nextRevision,
  HERO_LEGACY_FS_FIELDS,
};
