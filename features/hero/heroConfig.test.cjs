// Unit tests for the canonical Hero config model (features/hero/heroConfig.js).
// Run: npm run test:hero   (node --test)
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SCHEMA_VERSION,
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
} = require("./heroConfig.js");

const A_ID = "dQw4w9WgXcQ";
const B_ID = "oHg5SJYRHA0";
const A_URL = `https://youtu.be/${A_ID}`;
const B_URL = `https://www.youtube.com/watch?v=${B_ID}`;

// ── YouTube extraction & rejection ──────────────────────────────────────────

test("extractVideoIdStrict accepts every supported single-video shape", () => {
  assert.equal(extractVideoIdStrict(`https://youtu.be/${A_ID}`), A_ID);
  assert.equal(extractVideoIdStrict(`https://www.youtube.com/watch?v=${A_ID}`), A_ID);
  assert.equal(extractVideoIdStrict(`https://youtube.com/embed/${A_ID}`), A_ID);
  assert.equal(extractVideoIdStrict(`https://www.youtube.com/shorts/${A_ID}`), A_ID);
  assert.equal(extractVideoIdStrict(`https://www.youtube.com/live/${A_ID}?feature=share`), A_ID);
  assert.equal(extractVideoIdStrict(`http://youtube.com/v/${A_ID}`), A_ID);
});

test("extractVideoIdStrict strips tracking/playlist parameters", () => {
  assert.equal(
    extractVideoIdStrict(`https://www.youtube.com/watch?v=${A_ID}&list=PL12345&index=2&t=42s&si=abc&feature=shared`),
    A_ID
  );
  assert.equal(extractVideoIdStrict(`https://youtu.be/${A_ID}?si=xyz&t=7`), A_ID);
  // ?v= wins over list context — recommendations must never leak in.
  assert.equal(
    extractVideoIdStrict(`https://www.youtube.com/watch?list=PL999&v=${A_ID}`),
    A_ID
  );
});

test("extractVideoIdStrict rejects playlist/channel/search/non-YouTube", () => {
  assert.equal(extractVideoIdStrict("https://www.youtube.com/playlist?list=PL12345"), null);
  assert.equal(extractVideoIdStrict(`https://www.youtube.com/watch?list=PL12345`), null);
  assert.equal(extractVideoIdStrict("https://www.youtube.com/channel/UCxxxxxxx"), null);
  assert.equal(extractVideoIdStrict("https://www.youtube.com/@somechannel"), null);
  assert.equal(extractVideoIdStrict("https://www.youtube.com/results?search_query=cats"), null);
  assert.equal(extractVideoIdStrict("https://www.youtube.com/feed/subscriptions"), null);
  assert.equal(extractVideoIdStrict("https://vimeo.com/12345"), null);
  assert.equal(extractVideoIdStrict("javascript:alert(1)"), null);
  assert.equal(extractVideoIdStrict(""), null);
  assert.equal(extractVideoIdStrict(null), null);
});

test("decodeStoredUrl repairs HTML-escaped URLs", () => {
  assert.equal(
    decodeStoredUrl(`https:&#x2F;&#x2F;www.youtube.com&#x2F;watch?v=${A_ID}&amp;t=1s`),
    `https://www.youtube.com/watch?v=${A_ID}&t=1s`
  );
});

// ── normalizeHeroValue ──────────────────────────────────────────────────────

test("normalizeHeroValue: empty-ish values become explicit deletes", () => {
  assert.equal(normalizeHeroValue(""), null);
  assert.equal(normalizeHeroValue("   "), null);
  assert.equal(normalizeHeroValue(null), null);
  assert.equal(normalizeHeroValue(undefined), null);
});

test("normalizeHeroValue: any valid YouTube URL normalizes to canonical form", () => {
  assert.deepEqual(normalizeHeroValue(` ${B_URL} `), {
    url: canonicalUrlForId(B_ID),
    videoId: B_ID,
  });
  // HTML-encoded input decodes, then extracts and canonicalizes.
  assert.deepEqual(
    normalizeHeroValue(`https:&#x2F;&#x2F;youtu.be&#x2F;${A_ID}?si=track`),
    { url: canonicalUrlForId(A_ID), videoId: A_ID }
  );
});

test("normalizeHeroValue: invalid non-empty values REJECT atomically-safe", () => {
  assert.throws(() => normalizeHeroValue("not a url"), /INVALID_HERO_URL/);
  assert.throws(() => normalizeHeroValue("https://cdn.example.com/promo.mp4"), /INVALID_HERO_URL/);
  assert.throws(() => normalizeHeroValue("https://www.youtube.com/playlist?list=PL1"), /INVALID_HERO_URL/);
  assert.throws(() => normalizeHeroValue(12345), /INVALID_HERO_URL/);
});

// ── Full-form semantics ─────────────────────────────────────────────────────

function stateWithAB() {
  return migrateLegacyHeroConfig({ heroPlaylist: [A_URL, B_URL] });
}

test("omitted vs empty: omitted key keeps value, empty string clears only that slot", () => {
  const current = stateWithAB();
  const { next } = computeHeroPairUpdate(current, { video2: "" });
  assert.equal(next.video1.videoId, A_ID);
  assert.equal(next.video2, null);
  assert.deepEqual(deriveHeroView(next).heroPlaylist, [canonicalUrlForId(A_ID)]);
});

test("field-1-empty-field-2-valid: slot roles swap cleanly", () => {
  const current = stateWithAB();
  const { next } = computeHeroPairUpdate(current, { video1: "", video2: B_URL });
  assert.equal(next.video1, null);
  assert.equal(next.video2.videoId, B_ID);
});

test("clearing both fields yields empty playlist and no fallback URL", () => {
  const current = stateWithAB();
  const { next } = computeHeroPairUpdate(current, { video1: "", video2: "" });
  assert.ok(isHeroCleared(next));
  const view = deriveHeroView(next);
  assert.equal(view.heroVideoUrl, "");
  assert.deepEqual(view.heroPlaylist, []);
  assert.equal(view.video1, null);
  assert.equal(view.video2, null);
});

test("invalid URL rejects atomically — nothing is computed for commit", () => {
  const current = stateWithAB();
  let result = null;
  assert.throws(() => {
    result = computeHeroPairUpdate(current, {
      video1: `https://youtu.be/${B_ID}`,
      video2: "::bad::",
    });
  }, /INVALID_HERO_URL/);
  assert.equal(result, null);
  assert.equal(current.video1.videoId, A_ID);
});

// ── Schema v2 document building & verification ──────────────────────────────

test("buildCanonicalConfig emits a complete schemaVersion-2 doc", () => {
  const prev = "3-1700000000000";
  const doc = buildCanonicalConfig(
    { url: A_URL, videoId: A_ID },
    null,
    prev,
    "2026-01-01T00:00:00.000Z"
  );
  assert.equal(doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(doc.configured, true);
  assert.equal(doc.video1.videoId, A_ID);
  assert.equal(doc.video2, null);
  assert.match(doc.heroRevision, /^4-\d{13}$/);
  assert.equal(doc.updatedAt, "2026-01-01T00:00:00.000Z");
});

test("nextRevision produces unique, count-increasing strings", () => {
  const r1 = nextRevision("0");
  const r2 = nextRevision(r1);
  const r3 = nextRevision(r2);
  assert.notEqual(r1, r2);
  assert.notEqual(r2, r3);
  assert.ok(revisionCountOf(r1) < revisionCountOf(r2));
  assert.equal(revisionCountOf(r3), 3);
  // Legacy numeric revisions are understood.
  assert.equal(revisionCountOf(5), 5);
});

test("isCanonicalHeroDoc gates legacy migration correctly", () => {
  assert.ok(isCanonicalHeroDoc({ schemaVersion: 2, configured: true, video1: null, video2: null }));
  assert.ok(isCanonicalHeroDoc({ configured: true }));
  assert.ok(isCanonicalHeroDoc({ heroRevision: 7 })); // previous-session slot model
  assert.ok(!isCanonicalHeroDoc({ heroVideoUrl: A_URL, heroPlaylist: [A_URL] }));
  assert.ok(!isCanonicalHeroDoc(null));
});

test("verifyPersistedConfig passes on exact match and flags every mismatch", () => {
  const intended = {
    schemaVersion: 2,
    configured: true,
    video1: { url: A_URL, videoId: A_ID },
    video2: null,
    heroRevision: "6-1700000000000",
  };
  assert.equal(verifyPersistedConfig(structuredClone(intended), intended), null);
  assert.match(String(verifyPersistedConfig(null, intended)), /missing/);
  const badSchema = { ...structuredClone(intended), schemaVersion: 1 };
  assert.match(String(verifyPersistedConfig(badSchema, intended)), /schemaVersion/);
  const notConfigured = { ...structuredClone(intended), configured: false };
  assert.match(String(verifyPersistedConfig(notConfigured, intended)), /configured/);
  const badSlot = { ...structuredClone(intended), video1: null };
  assert.match(String(verifyPersistedConfig(badSlot, intended)), /video1 mismatch/);
  const staleRev = { ...structuredClone(intended), heroRevision: "5-1699999999999" };
  assert.match(String(verifyPersistedConfig(staleRev, intended)), /heroRevision/);
});

// ── Legacy mapping ──────────────────────────────────────────────────────────

test("legacy heroPlaylist/heroVideoUrl payloads map onto the canonical pair", () => {
  const pair = computeLegacyHeroUpdate(null, [A_URL, B_URL], undefined);
  assert.equal(pair.video1.videoId, A_ID);
  assert.equal(pair.video2.videoId, B_ID);

  const single = computeLegacyHeroUpdate(null, undefined, A_URL);
  assert.equal(single.video1.videoId, A_ID);
  assert.equal(single.video2, null);

  const cleared = computeLegacyHeroUpdate(null, [], "");
  assert.equal(cleared.video1, null);
  assert.equal(cleared.video2, null);

  // Historical quirk preserved: empty playlist + single URL still saves it.
  const emptyListWithSingle = computeLegacyHeroUpdate(null, [], A_URL);
  assert.equal(emptyListWithSingle.video1.videoId, A_ID);

  assert.throws(() => computeLegacyHeroUpdate(null, ["garbage"], undefined), /INVALID_HERO_URL/);
});

// ── Migration ───────────────────────────────────────────────────────────────

test("migrateLegacyHeroConfig upgrades historical shapes without data loss", () => {
  const legacyList = migrateLegacyHeroConfig({
    heroVideoUrl: "",
    heroPlaylist: [A_URL, B_URL],
  });
  assert.equal(legacyList.configured, true);
  assert.equal(legacyList.video1.videoId, A_ID);
  assert.equal(legacyList.video2.videoId, B_ID);

  const legacySingle = migrateLegacyHeroConfig({ heroVideoUrl: A_URL });
  assert.equal(legacySingle.configured, true);
  assert.equal(legacySingle.video1.videoId, A_ID);

  const canonicalEmpty = migrateLegacyHeroConfig({
    schemaVersion: 2,
    configured: true,
    video1: null,
    video2: null,
    heroRevision: "9-1700000000000",
  });
  assert.equal(canonicalEmpty.configured, true);
  assert.equal(canonicalEmpty.video1, null);
  assert.equal(canonicalEmpty.heroRevision, "9-1700000000000");

  const dirty = migrateLegacyHeroConfig({ video1: "not-a-url", heroRevision: 7 });
  assert.equal(dirty.video1, null); // degrades, never crashes
  assert.equal(dirty.heroRevision, "7");
  assert.equal(dirty.configured, false);

  assert.equal(migrateLegacyHeroConfig(undefined).configured, false);
});

test("sanitizeStoredEntry repairs plain-string storage entries", () => {
  assert.deepEqual(sanitizeStoredEntry(B_URL), {
    url: canonicalUrlForId(B_ID),
    videoId: B_ID,
  });
  assert.equal(sanitizeStoredEntry(""), null);
  assert.equal(sanitizeStoredEntry("nope"), null);
  assert.equal(sanitizeStoredEntry(null), null);
});

// ── Legacy Firestore field list ─────────────────────────────────────────────

test("legacy Firestore field list covers proven hero keys and never trailerUrl", () => {
  for (const key of [
    "heroPlaylistData",
    "video_trailers",
    "heroTrailers",
    "heroTrailer",
    "heroVideos",
    "primaryHeroVideo",
    "secondaryHeroVideo",
  ]) {
    assert.ok(HERO_LEGACY_FS_FIELDS.includes(key), `missing ${key}`);
  }
  assert.ok(!HERO_LEGACY_FS_FIELDS.includes("trailerUrl"), "trailerUrl is a per-movie field");
});
