import {
  db,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
} from "../lib/firebase";
import { getYTId } from "../utils/youtube";

// Permanent "CinemaChat" two-person synchronized watch room.
//
// Firestore schema (dedicated, isolated — never mixes with syncGroups, VIP,
// friends_rooms or the main broadcast):
//   cinemaChatRoom/main_broadcast_room                    → room state: session,
//     pairing, mutual approvals, and the playback source of truth
//   cinemaChatRoom/main_broadcast_room/messages/{id}      → realtime text chat
//
// Identity: reuse the existing auth identity (fbUid from SocialAuthContext, or
// the persistent device id getDeviceId()) — phone numbers are never used as
// primary keys. Anonymous Firebase Auth is DISABLED on this project, so client
// writes are validated public writes (same documented pattern as the broadcast
// / friends_rooms modules); the security rules additionally require any state
// mutation to come from a registered session participant (host or guest).

export const CINEMA_CHAT_COLLECTION = "cinemaChatRoom";
export const CINEMA_CHAT_ROOM_ID = "main_broadcast_room";
export const CINEMA_CHAT_ROOM_NAME = "CinemaChat";

// Presence thresholds shared by the room and the global invite notification.
// A session is only marked DISCONNECTED when a participant's heartbeat has been
// silent for PRESENCE_STALE_MS; the notification keeps the HOST's heartbeat
// alive while they own an active session even when the room modal is closed, so
// a guest joining later still wakes the toast (the room itself only heartbeats
// while it is open).
export const PRESENCE_STALE_MS = 35000;
export const PRESENCE_HEARTBEAT_MS = 10000;

// --- Session state machine (spec states) ---
export const SESSION_STATES = {
  EMPTY: "EMPTY",
  WAITING_FOR_PARTNER: "WAITING_FOR_PARTNER",
  PAIRING: "PAIRING",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  READY: "READY",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  DISCONNECTED: "DISCONNECTED",
  ENDED: "ENDED",
} as const;
export type SessionState = (typeof SESSION_STATES)[keyof typeof SESSION_STATES];

export interface CinemaChatParticipant {
  id: string; // fbUid or persistent device id
  name: string;
  code: string; // social uniqueCode, or a short device code for guests
  avatarUrl?: string;
}

// Compact movie payload persisted in the room — the minimal field set the shared
// player needs (mirrors the app's getMovieSourceUrl candidate-source chain).
export interface CinemaChatMovieData {
  id: string;
  title: string;
  image?: string;
  embedUrl?: string;
  videoUrl?: string;
  hdtodayUrl?: string;
  vidsrcUrl?: string;
  vidmolyUrl?: string;
  streamwishUrl?: string;
  fileLrunUrl?: string;
  youtubeMovieUrl?: string;
  otherVideoUrl?: string;
  streamingUrl?: string;
  external_link?: string;
  externalMovieLink?: string;
  isYouTube?: boolean;
  videoId?: string | null;
  duration?: number;
}

export interface CinemaChatPlayback {
  /** The shared movie payload. ALWAYS null in Firestore — the movie lives in
   *  movieProposal.movieData only. Kept on the interface for the client model;
   *  patchCinemaChatState forces it back to null on every write (rules budget). */
  movieData: CinemaChatMovieData | null;
  movieId: string | null;
  isPlaying: boolean;
  currentTime: number; // seconds at updatedAt
  updatedAt: number; // epoch ms — the drift anchor for synchronized playback
  updatedBy: string; // participant id that last commanded playback
}

export interface CinemaChatMovieProposal {
  movieData: CinemaChatMovieData | null;
  hostApproved: boolean;
  guestApproved: boolean;
  proposedBy: string | null;
}

export interface CinemaChatRoomState {
  roomId: typeof CINEMA_CHAT_ROOM_ID;
  name: typeof CINEMA_CHAT_ROOM_NAME;
  isOfficial: boolean;
  sessionId: string | null;
  sessionState: SessionState;
  host: CinemaChatParticipant | null;
  guest: CinemaChatParticipant | null;
  joinCode: string | null;
  // Connection approvals — BOTH participants must accept before a session runs.
  hostApproved: boolean;
  guestApproved: boolean;
  // Movie proposal — both must accept the movie before playback starts.
  movieProposal: CinemaChatMovieProposal;
  playback: CinemaChatPlayback;
  // Per-participant presence heartbeats (epoch ms) used to detect a disconnect
  // and drive the DISCONNECTED session state / resume flow.
  hostLastSeen: number | null;
  guestLastSeen: number | null;
  updatedAt: number;
  updatedBy: string | null;
}

export type CinemaChatMessageKind = "text" | "voice";

export interface CinemaChatMessage {
  id?: string;
  senderId: string;
  senderName: string;
  senderCode: string;
  text: string;
  /** Message type — "text" by default, "voice" for recorded audio clips. */
  kind?: CinemaChatMessageKind;
  /** Base64 data-URL of the recorded clip (voice messages only). Kept short
   *  (the recorder caps clips at 12s @ 24kbps ≈ 50KB base64) so it stays far
   *  below the 1MiB Firestore document limit — no separate storage bucket or
   *  rules change is needed. */
  voiceDataUrl?: string;
  /** Clip length in seconds (voice messages only). */
  duration?: number;
  timestamp?: string;
}

export const defaultCinemaChatPlayback = (): CinemaChatPlayback => ({
  movieData: null,
  movieId: null,
  isPlaying: false,
  currentTime: 0,
  updatedAt: Date.now(),
  updatedBy: "",
});

export const defaultCinemaChatState = (): CinemaChatRoomState => ({
  roomId: CINEMA_CHAT_ROOM_ID,
  name: CINEMA_CHAT_ROOM_NAME,
  isOfficial: true,
  sessionId: null,
  sessionState: SESSION_STATES.EMPTY,
  host: null,
  guest: null,
  joinCode: null,
  hostApproved: false,
  guestApproved: false,
  movieProposal: {
    movieData: null,
    hostApproved: false,
    guestApproved: false,
    proposedBy: null,
  },
  playback: defaultCinemaChatPlayback(),
  hostLastSeen: null,
  guestLastSeen: null,
  updatedAt: Date.now(),
  updatedBy: null,
});

export const normalizeCinemaChatState = (data: any): CinemaChatRoomState => {
  const d = data || {};
  const defaultState = defaultCinemaChatState();
  return {
    roomId: CINEMA_CHAT_ROOM_ID,
    name: CINEMA_CHAT_ROOM_NAME,
    isOfficial: true,
    sessionId: d.sessionId ?? defaultState.sessionId,
    sessionState: SESSION_STATES[d.sessionState]
      ? d.sessionState
      : defaultState.sessionState,
    host: d.host ?? defaultState.host,
    guest: d.guest ?? defaultState.guest,
    joinCode: d.joinCode ?? defaultState.joinCode,
    hostApproved: !!d.hostApproved,
    guestApproved: !!d.guestApproved,
    movieProposal: {
      movieData: d.movieProposal?.movieData ?? defaultState.movieProposal.movieData,
      hostApproved: !!d.movieProposal?.hostApproved,
      guestApproved: !!d.movieProposal?.guestApproved,
      proposedBy: d.movieProposal?.proposedBy ?? null,
    },
    playback: {
      movieData: d.playback?.movieData ?? defaultState.playback.movieData,
      movieId: d.playback?.movieId ?? defaultState.playback.movieId,
      isPlaying: !!d.playback?.isPlaying,
      currentTime: typeof d.playback?.currentTime === "number" ? d.playback.currentTime : 0,
      updatedAt: typeof d.playback?.updatedAt === "number" ? d.playback.updatedAt : Date.now(),
      updatedBy: d.playback?.updatedBy ?? "",
    },
    hostLastSeen: typeof d.hostLastSeen === "number" ? d.hostLastSeen : null,
    guestLastSeen: typeof d.guestLastSeen === "number" ? d.guestLastSeen : null,
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
    updatedBy: d.updatedBy ?? null,
  };
};

// --- Resolve a catalog Movie down to the compact room payload ---

// Mirrors App.tsx getMovieSourceUrl (kept here so the room is self-contained).
export function resolveMovieSourceUrl(movie: any): string | null {
  if (!movie) return null;
  return (
    movie.embedUrl ||
    movie.videoUrl ||
    movie.hdtodayUrl ||
    movie.vidsrcUrl ||
    movie.vidmolyUrl ||
    movie.streamwishUrl ||
    movie.fileLrunUrl ||
    movie.youtubeMovieUrl ||
    movie.otherVideoUrl ||
    movie.streamingUrl ||
    movie.external_link ||
    movie.externalMovieLink ||
    null
  );
}

export const toCinemaChatMovieData = (movie: any): CinemaChatMovieData | null => {
  if (!movie || !movie.id) return null;
  const sourceUrl = resolveMovieSourceUrl(movie);
  const isYouTube = !!(sourceUrl && /youtube\.com|youtu\.be/i.test(sourceUrl));
  return {
    id: String(movie.id),
    title: movie.title || "بێ ناونیشان",
    image: movie.image || undefined,
    embedUrl: movie.embedUrl || undefined,
    videoUrl: movie.videoUrl || undefined,
    hdtodayUrl: movie.hdtodayUrl || undefined,
    vidsrcUrl: movie.vidsrcUrl || undefined,
    vidmolyUrl: movie.vidmolyUrl || undefined,
    streamwishUrl: movie.streamwishUrl || undefined,
    fileLrunUrl: movie.fileLrunUrl || undefined,
    youtubeMovieUrl: movie.youtubeMovieUrl || undefined,
    otherVideoUrl: movie.otherVideoUrl || undefined,
    streamingUrl: movie.streamingUrl || undefined,
    external_link: movie.external_link || undefined,
    externalMovieLink: movie.externalMovieLink || undefined,
    isYouTube,
    videoId: isYouTube && sourceUrl ? getYTId(sourceUrl) : null,
    duration: typeof movie.duration === "number" ? movie.duration : undefined,
  };
};

// --- State doc I/O ---

const stateRef = () => doc(db, CINEMA_CHAT_COLLECTION, CINEMA_CHAT_ROOM_ID);

export const subscribeCinemaChatState = (
  onChange: (state: CinemaChatRoomState) => void,
  onError?: (err: any) => void,
): (() => void) => {
  return onSnapshot(
    stateRef(),
    (snap) => {
      if (snap.exists()) onChange(normalizeCinemaChatState(snap.data()));
      else onChange(defaultCinemaChatState());
    },
    (err) => {
      if (onError) onError(err);
      else console.warn("cinemaChatRoom state listener failed:", err);
    },
  );
};

export const readCinemaChatState = async (): Promise<CinemaChatRoomState> => {
  try {
    const snap = await getDoc(stateRef());
    if (snap.exists()) return normalizeCinemaChatState(snap.data());
  } catch (err) {
    console.warn("readCinemaChatState failed:", err);
  }
  return defaultCinemaChatState();
};

// Firestore rejects undefined field values before any network round-trip
// (e.g. a guest participant with no avatar carries avatarUrl: undefined), so
// strip undefined entries recursively before writing.
const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = stripUndefined(item);
    }
    return out;
  }
  return value;
};

// Field-level merge: only the provided patch fields are written (never a stale
// read-modify-write spread), so a playback/approval write can never clobber the
// other participant's presence heartbeat and vice-versa. Every mutation is
// stamped with the acting participant.
// TEMP DIAGNOSTIC: record every write attempt into a window-global ring buffer
// so an E2E harness can read it back via page.evaluate (browsers do not forward
// console.* to the automation driver). Each entry's patch shape identifies the
// calling code path; this is used to prove which write can revert an approved
// READY session. Removed after the state-consistency race is fixed.
try {
  (window as any).__CINEMACHAT_MODULE = {
    loadedAt: Date.now(),
    hasRecorder: true,
  };
} catch {
  /* non-browser context */
}
const recordCinemaChatWrite = (kind: string, entry: Record<string, unknown>): void => {
  try {
    const w: Array<Record<string, unknown>> =
      (window as any).__cinemaChatWrites ||= [];
    if (w.length < 1000) w.push({ kind, t: Date.now(), ...entry });
  } catch {
    /* not running in a browser window */
  }
};

// TEMP DIAGNOSTIC: the app swallows setDoc rejections (.catch(() => {})), so
// surface the actual SDK error message onto a window-global for the E2E harness
// to read. Removed together with the other TEMP DIAGNOSTIC blocks.
const recordCinemaChatError = (kind: string, byId: string, err: unknown): void => {
  try {
    const e: Array<Record<string, unknown>> = (window as any).__cinemaChatErrors ||= [];
    if (e.length < 200) {
      e.push({
        kind,
        by: byId,
        t: Date.now(),
        code: (err as any)?.code || "",
        message: String((err as any)?.message || err),
      });
    }
  } catch {
    /* not running in a browser window */
  }
};

export const patchCinemaChatState = async (
  patch: Partial<CinemaChatRoomState>,
  byId: string,
): Promise<void> => {
  const payload = stripUndefined({
    ...patch,
    updatedAt: Date.now(),
    updatedBy: byId,
  }) as Record<string, unknown>;
  // INVARIANT: playback may only ever carry movieId — never the movie payload.
  // The Firestore rules engine has a 1000-expression budget per evaluation;
  // duplicating movieData (its base64 poster alone is ~57KB) into playback on
  // top of movieProposal.movieData exhausts that budget and the whole write is
  // silently rejected as permission-denied, which froze the room at
  // WAITING_FOR_APPROVAL. movieData lives only in movieProposal.movieData.
  if (payload.playback && typeof payload.playback === "object") {
    (payload.playback as Record<string, unknown>).movieData = null;
  }
  recordCinemaChatWrite("patch", { by: byId, patch: payload });
  try {
    await setDoc(stateRef(), payload, { merge: true });
  } catch (err) {
    recordCinemaChatError("patch", byId, err);
    throw err;
  }
};

// Per-participant presence heartbeat — a field-level update so it can never
// clobber playback/pairing fields written by the other participant.
export const touchCinemaChatPresence = async (
  field: "hostLastSeen" | "guestLastSeen",
  byId: string,
): Promise<void> => {
  recordCinemaChatWrite("presence", { by: byId, field });
  try {
    await updateDoc(stateRef(), {
      [field]: Date.now(),
      updatedAt: Date.now(),
      updatedBy: byId,
    });
  } catch (err) {
    recordCinemaChatError("presence", byId, err);
    throw err;
  }
};

// --- Realtime chat ---

export const subscribeCinemaChatMessages = (
  onChange: (messages: CinemaChatMessage[]) => void,
  onError?: (err: any) => void,
): (() => void) => {
  const q = query(
    collection(db, CINEMA_CHAT_COLLECTION, CINEMA_CHAT_ROOM_ID, "messages"),
    orderBy("createdAt", "asc"),
    limit(60),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      );
    },
    (err) => {
      if (onError) onError(err);
      else console.warn("cinemaChatRoom chat listener failed:", err);
    },
  );
};

export const sendCinemaChatMessage = async (
  msg: Omit<CinemaChatMessage, "id">,
): Promise<void> => {
  // Build the payload explicitly so voice fields are never written as
  // undefined (Firestore rejects undefined values before any round-trip).
  const payload: Record<string, unknown> = {
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderCode: msg.senderCode,
    text: msg.text || "",
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp(),
  };
  if (msg.kind === "voice") {
    payload.kind = "voice";
    payload.voiceDataUrl = msg.voiceDataUrl || "";
    payload.duration = typeof msg.duration === "number" ? msg.duration : 0;
  } else {
    payload.kind = "text";
  }
  await addDoc(
    collection(db, CINEMA_CHAT_COLLECTION, CINEMA_CHAT_ROOM_ID, "messages"),
    payload,
  );
};

// --- Optional phone-number invitation (UI/state/API contract) ---
//
// CinemaChat does NOT send SMS. This project has no SMS gateway wired up (no
// Firebase Phone Auth / RecaptchaVerifier, no Twilio/Vonage, and the server
// has no outbound-SMS endpoint), so the phone flow is implemented as a clean
// UI + client-side contract: a host can enter a phone number, compose the
// invite (safe link + join code) and copy/share it manually. The phone number
// is never persisted, never exposed in the room/chat, and is never treated as
// authentication — joining still requires the member code.
//
// To enable real SMS delivery later, add a backend endpoint and wire it here:
//
//   POST /api/cinemachat/phone-invite
//   body  { phone: string, room: "main_broadcast_room", code: string }
//   → requires a configured SMS provider (e.g. Firebase Auth phone provider,
//     Twilio/Vonage/Infobip) via env vars such as:
//     CINEMACHAT_SMS_PROVIDER=twilio
//     CINEMACHAT_SMS_ACCOUNT_SID=...
//     CINEMACHAT_SMS_AUTH_TOKEN=...
//     CINEMACHAT_SMS_FROM=...
//   Never send OTPs or credentials; the invite is a plain join-code message.
export const PHONE_INVITE_NOT_CONFIGURED =
  "سیستەمی ناردنی SMS نەکراوەتەوە — بانگهێشتەکە بە دەست کۆپی/بەشی بکە";

export const buildPhoneInviteText = (code: string | null, safeLink: string): string =>
  `بەشداری سەیرکردنی هاوبەش لەگەڵم بکە 🎬\nکۆدی بەشداری: ${code || ""}\nلینک: ${safeLink}`;

// --- Session / pairing / playback helpers (pure, shared by both participants) ---

// Drift-corrected local playback time. While playing, every client advances the
// shared currentTime by the elapsed wall-clock time since updatedAt; when paused
// the position is frozen at the anchor. This is the same drift model used by the
// existing SyncRoom (src/components/Social/SyncRoom.tsx).
export function computeLocalTime(state: CinemaChatRoomState, now: number = Date.now()): number {
  const t = state.playback.currentTime || 0;
  if (!state.playback.isPlaying) return t;
  return t + Math.max(0, (now - state.playback.updatedAt) / 1000);
}

export function randomJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// --- Shared pairing-request actions (used by BOTH the in-room approval card
// and the global "watch together" invite notification) ---
//
// Keeping the accept/decline logic in the service guarantees a single source
// of truth: the notification overlay and the room UI can never drift apart in
// rules, validation, or the persisted fields. No second pairing system exists —
// everything flows through the room's existing hostApproved/guestApproved
// approval cycle, so firestore.rules stays untouched.

// Accept the seated guest's watch-together request. Only the host of the active
// session may accept, the sender (guest) must actually be seated, and the
// pairing must not already be approved — a random user can never accept on
// someone else's behalf (Firestore rules additionally require updatedBy to
// match a registered participant id).
export const acceptCinemaChatPairingRequest = async (
  current: CinemaChatRoomState,
  byId: string,
): Promise<void> => {
  if (
    !current.host ||
    current.host.id !== byId ||
    !current.sessionId ||
    !current.guest?.id ||
    current.hostApproved ||
    current.sessionState === SESSION_STATES.ENDED
  ) {
    return;
  }
  await patchCinemaChatState(
    { hostApproved: true, sessionState: SESSION_STATES.WAITING_FOR_APPROVAL },
    byId,
  );
};

// Decline the seated guest's request — unseat the guest and safely return the
// session to WAITING_FOR_PARTNER so a new guest can join with the same code.
// Guarded so it can never wipe an already-approved pairing.
export const declineCinemaChatPairingRequest = async (
  current: CinemaChatRoomState,
  byId: string,
): Promise<void> => {
  if (
    !current.host ||
    current.host.id !== byId ||
    !current.guest?.id ||
    current.hostApproved
  ) {
    return;
  }
  await patchCinemaChatState(
    {
      guest: null,
      guestApproved: false,
      hostApproved: false,
      sessionState: SESSION_STATES.WAITING_FOR_PARTNER,
    },
    byId,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Account-based room invitations (host → guest, persisted in Firestore).
//
// The CinemaChat room already supports the passive path (the guest ENTERS or
// scans the host's join code/QR). This adds the active path required by the
// spec: the HOST identifies the recipient by their CinemaChat account code
// (CC-ID) or phone number, and a real invitation document is persisted in the
// existing `invitations` collection (rules: allow read/write) so it survives
// refresh/rejoin. The recipient's app listens for pending invitations (by
// their signed-in uid) and shows an unread Accept/Reject card; Accepting
// performs the exact same persisted join write as the in-room code/QR flow
// (guest + guestApproved + PAIRING), so there is still exactly ONE pairing
// system and firestore.rules stays untouched.
//
// Only account users can be invited (a device-only guest has no stable
// public identifier in the `users` collection). A recipient without an account
// can still join the usual way (code/QR), and the in-room account card helps
// them create one so they become invitable.
// ─────────────────────────────────────────────────────────────────────────────

const INVITATIONS_COL = "invitations";

export interface CinemaChatInvitation {
  id?: string;
  /** Marks these invitations as belonging to the CinemaChat room flow so they
   *  never collide with the older referral invitations (which key on
   *  receiverUniqueCode / targetCodeOrName). */
  kind: "cinemachat";
  status: "pending" | "accepted" | "declined";
  fromId: string;
  fromName: string;
  fromCode: string;
  /** Recipient account uid — the listener keyed on the signed-in identity. */
  toId: string;
  toName: string;
  toCode: string;
  roomId: string;
  roomName: string;
  sessionId: string;
  joinCode: string;
  movieTitle?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Persisted the first time the recipient's app surfaces the notification
   *  (read/unread state survives refresh). */
  readAt?: string | null;
}

/** Normalize member codes: strip every leading "CC-" group and uppercase, so
 *  "CC-CC-9803", "CC-9803" and "9803" all resolve to the same account. */
export const normalizeJoinCode = (raw: string): string => {
  let s = (raw || "").trim().toUpperCase();
  while (s.startsWith("CC-")) s = s.slice(3);
  return s;
};

export interface ResolvedInviteTarget {
  uid: string;
  name: string;
  uniqueCode: string;
  phone?: string;
  avatarUrl?: string;
  isOnline?: boolean;
  lastActive?: unknown;
  presenceStatus?: "online" | "offline" | "checking";
  presenceLabel?: string;
}

const LOCALIZED_DIGIT_MAP: Record<string, string> = {
  "٠": "0",
  "۰": "0",
  "١": "1",
  "۱": "1",
  "٢": "2",
  "۲": "2",
  "٣": "3",
  "۳": "3",
  "٤": "4",
  "۴": "4",
  "٥": "5",
  "۵": "5",
  "٦": "6",
  "۶": "6",
  "٧": "7",
  "۷": "7",
  "٨": "8",
  "۸": "8",
  "٩": "9",
  "۹": "9",
};

export const normalizeInvitePhoneInput = (value: string): string =>
  String(value || "")
    .replace(/[٠-٩۰-۹]/g, (digit) => LOCALIZED_DIGIT_MAP[digit] || "")
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");

export const formatInvitePhoneInput = (value: string): string => {
  const normalized = normalizeInvitePhoneInput(value);
  const prefix = normalized.startsWith("+") ? "+" : "";
  const digits = normalized.replace(/\D/g, "");
  const grouped = digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  return `${prefix}${grouped}`.trim();
};

export const validateInvitePhoneInput = (value: string): string | null => {
  const normalized = normalizeInvitePhoneInput(value);
  const digits = normalized.replace(/\D/g, "");
  if (!digits) return "ژمارەی مۆبایل بنووسە";
  if (digits.length < 8) return "ژمارەی مۆبایل زۆر کورتە";
  if (digits.length > 15) return "ژمارەی مۆبایل زۆر درێژە";
  if (/^(\d)\1{7,}$/.test(digits)) return "ژمارەی مۆبایل دروست نییە";
  return null;
};

export const maskInvitePhone = (value?: string): string => {
  const normalized = normalizeInvitePhoneInput(value || "");
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7) return "";
  const head = digits.slice(0, Math.min(4, digits.length - 3));
  const tail = digits.slice(-2);
  return `${normalized.startsWith("+") ? "+" : ""}${head} *** **${tail}`;
};

const toDateMs = (value: any): number | null => {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return null;
};

const getInvitePresence = (data: any): Pick<
  ResolvedInviteTarget,
  "isOnline" | "lastActive" | "presenceStatus" | "presenceLabel"
> => {
  const lastActive = data?.lastActive || data?.lastSeen || data?.lastLoginAt || null;
  const lastMs = toDateMs(lastActive);
  if (data?.isOnline === true) {
    return { isOnline: true, lastActive, presenceStatus: "online", presenceLabel: "Online" };
  }
  if (typeof lastMs === "number") {
    const diffMs = Math.max(0, Date.now() - lastMs);
    const minutes = Math.max(1, Math.round(diffMs / 60000));
    const label =
      minutes < 60
        ? `Offline · last active ${minutes}m ago`
        : `Offline · last active ${Math.round(minutes / 60)}h ago`;
    return { isOnline: false, lastActive, presenceStatus: "offline", presenceLabel: label };
  }
  return { isOnline: false, lastActive, presenceStatus: "offline", presenceLabel: "Offline" };
};

const userAllowsPhoneLookup = (data: any): boolean => {
  const privacy = data?.privacySettings || {};
  if (privacy.allowPhoneLookup === false) return false;
  if (privacy.lookupByPhone === false) return false;
  if (privacy.phoneLookup === false) return false;
  if (String(privacy.phoneLookupVisibility || "").toLowerCase() === "nobody") return false;
  return true;
};

const toInviteTarget = (
  uid: string,
  data: any,
  fallbackCode: string,
): ResolvedInviteTarget => ({
  uid,
  name: data?.name || data?.displayName || "بەکارهێنەر",
  uniqueCode: data?.uniqueCode || fallbackCode,
  phone: typeof data?.phone === "string" ? data.phone : typeof data?.phoneNumber === "string" ? data.phoneNumber : undefined,
  avatarUrl: typeof data?.avatarUrl === "string" ? data.avatarUrl : typeof data?.avatar === "string" ? data.avatar : undefined,
  ...getInvitePresence(data),
});

export const subscribeInviteTargetPresence = (
  uid: string,
  onChange: (
    presence: Pick<
      ResolvedInviteTarget,
      "isOnline" | "lastActive" | "presenceStatus" | "presenceLabel"
    >,
  ) => void,
  onError?: (err: unknown) => void,
): (() => void) => {
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      if (!snap.exists()) {
        onChange({
          isOnline: false,
          lastActive: null,
          presenceStatus: "offline",
          presenceLabel: "Offline",
        });
        return;
      }
      onChange(getInvitePresence(snap.data()));
    },
    (err) => {
      console.warn("invite target presence listener failed:", err);
      onError?.(err);
    },
  );
};

/** Resolve a host-typed invite target (account code CC-ID or phone) to a
 *  registered CinemaChat user. Tries the normalized uniqueCode first (a few
 *  CC- prefix spellings), then an exact phone match. */
export const resolveInviteTarget = async (
  input: string,
): Promise<ResolvedInviteTarget | null> => {
  const raw = (input || "").trim();
  if (!raw) return null;

  const core = normalizeJoinCode(raw);
  const codeCandidates = [core, `CC-${core}`, `CC-CC-${core}`].filter(
    (c, i, arr) => c && arr.indexOf(c) === i,
  );
  for (const c of codeCandidates) {
    try {
      const q = query(
        collection(db, "users"),
        where("uniqueCode", "==", c),
        limit(1),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0].data() as any;
        return toInviteTarget(snap.docs[0].id, d, c);
          return {
            uid: snap.docs[0].id,
          name: d?.name || "بەکارهێنەر",
          uniqueCode: d?.uniqueCode || c,
          phone: typeof d?.phone === "string" ? d.phone : undefined,
        };
      }
    } catch {
      /* keep trying */
    }
  }

  const normalizedPhone = normalizeInvitePhoneInput(raw);
  const normalizedPhoneDigits = normalizedPhone.replace(/\D/g, "");
  if (normalizedPhoneDigits.length >= 6) {
    const normalizedPhoneCandidates = [
      normalizedPhone,
      normalizedPhoneDigits,
      `+${normalizedPhoneDigits}`,
      normalizedPhoneDigits.startsWith("0") ? `+964${normalizedPhoneDigits.slice(1)}` : "",
      normalizedPhoneDigits.startsWith("964") ? `+${normalizedPhoneDigits}` : "",
    ].filter((p, i, arr) => p && arr.indexOf(p) === i);

    for (const phone of normalizedPhoneCandidates) {
      for (const field of ["phone", "phoneNumber"]) {
        try {
          const q = query(
            collection(db, "users"),
            where(field, "==", phone),
            limit(1),
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0].data() as any;
            if (!userAllowsPhoneLookup(d)) return null;
            return toInviteTarget(snap.docs[0].id, d, "");
          }
        } catch {
          /* keep trying normalized phone spellings */
        }
      }
    }
  }

  const digits = normalizedPhoneDigits || raw.replace(/\D/g, "");
  if (digits.length >= 6) {
    const phoneCandidates = [
      raw,
      raw.replace(/\s+/g, ""),
      digits,
      `+${digits}`,
    ].filter((p, i, arr) => p && arr.indexOf(p) === i);

    for (const phone of phoneCandidates) {
      try {
        const q = query(
          collection(db, "users"),
          where("phone", "==", phone),
          limit(1),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0].data() as any;
          return {
            uid: snap.docs[0].id,
          name: d?.name || "بەکارهێنەر",
            uniqueCode: d?.uniqueCode || "",
            phone: typeof d?.phone === "string" ? d.phone : undefined,
          };
        }
      } catch {
        /* keep trying phone spellings */
      }
    }
  }
  return null;
};

/** Persist a host→guest invitation. Returns the (possibly already-existing)
 *  invitation id and whether it was a duplicate of a pending one — no
 *  duplicate invitations are ever created for the same session + recipient. */
export const sendCinemaChatInvitation = async (params: {
  identity: CinemaChatParticipant;
  target: ResolvedInviteTarget;
  state: CinemaChatRoomState;
}): Promise<{ id: string; duplicate: boolean }> => {
  const { identity, target, state } = params;
  if (!state.sessionId || !state.joinCode) {
    throw new Error("no-active-session");
  }

  try {
    const q = query(
      collection(db, INVITATIONS_COL),
      where("kind", "==", "cinemachat"),
      where("toId", "==", target.uid),
      where("sessionId", "==", state.sessionId),
      where("status", "==", "pending"),
      limit(1),
    );
    const snap = await getDocs(q);
    if (!snap.empty) return { id: snap.docs[0].id, duplicate: true };
  } catch {
    /* dedupe check failed — proceed and let a duplicate be harmless */
  }

  const payload: Record<string, unknown> = {
    kind: "cinemachat",
    status: "pending",
    fromId: identity.id,
    fromName: identity.name,
    fromCode: identity.code,
    toId: target.uid,
    toName: target.name,
    toCode: target.uniqueCode,
    roomId: CINEMA_CHAT_ROOM_ID,
    roomName: CINEMA_CHAT_ROOM_NAME,
    sessionId: state.sessionId,
    joinCode: state.joinCode,
    createdAt: new Date().toISOString(),
  };
  const movieTitle = state.movieProposal?.movieData?.title;
  if (movieTitle) payload.movieTitle = movieTitle;

  const ref = await addDoc(collection(db, INVITATIONS_COL), payload);
  return { id: ref.id, duplicate: false };
};

/** Persist the recipient's Accept/Reject. Rejecting only closes the request —
 *  it never touches the room doc, so it can't corrupt the active session. */
export const respondToCinemaChatInvitation = async (
  inviteId: string,
  status: "accepted" | "declined",
): Promise<void> => {
  await updateDoc(doc(collection(db, INVITATIONS_COL), inviteId), {
    status,
    updatedAt: new Date().toISOString(),
  });
};

/** Mark the invitation as surfaced to the recipient (read state persisted). */
export const markCinemaChatInvitationRead = async (
  inviteId: string,
): Promise<void> => {
  await updateDoc(doc(collection(db, INVITATIONS_COL), inviteId), {
    readAt: new Date().toISOString(),
  }).catch(() => {});
};

/** Real-time listener for pending CinemaChat invitations addressed to the
 *  given account uid (the signed-in identity). No-op for device-only guests. */
export const subscribeCinemaChatInvitations = (
  toId: string,
  onChange: (invites: CinemaChatInvitation[]) => void,
): (() => void) => {
  if (!toId) return () => {};
  const q = query(
    collection(db, INVITATIONS_COL),
    where("kind", "==", "cinemachat"),
    where("toId", "==", toId),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    limit(20),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    },
    (err) => console.warn("cinemachat invitations listener failed:", err),
  );
};

/** Join the CinemaChat session from an accepted invitation. Replicates the
 *  EXACT persisted join write used by the in-room code/QR flow (guest +
 *  guestApproved + PAIRING) so the Firestore rules' isCinemaChatJoin branch is
 *  satisfied identically. Result:
 *   "joined"  — this client is now the seated guest
 *   "already" — this client already owns a host/guest slot
 *   "full"    — another guest is already seated (rules would reject)
 *   "invalid" — session/join-code mismatch or ended session
 *   "error"   — network/rules failure */
export const joinCinemaChatSession = async (
  identity: CinemaChatParticipant,
  joinCodeOrInvite: string | CinemaChatInvitation,
): Promise<"joined" | "already" | "full" | "invalid" | "error"> => {
  try {
    const current = await readCinemaChatState();
    if (!current.sessionId || !current.joinCode) return "invalid";
    const invite =
      typeof joinCodeOrInvite === "string" ? null : joinCodeOrInvite;
    const joinCode = invite ? invite.joinCode : String(joinCodeOrInvite);
    const myId = identity.id;
    const meIsHost = !!current.host && current.host.id === myId;
    const meIsGuest = !!current.guest && current.guest.id === myId;

    if (invite) {
      if (
        invite.status !== "pending" ||
        invite.roomId !== CINEMA_CHAT_ROOM_ID ||
        invite.sessionId !== current.sessionId ||
        invite.toId !== myId ||
        !current.host ||
        current.host.id !== invite.fromId
      ) {
        return "invalid";
      }
      if (meIsHost) return "already";
      if (current.guest && current.guest.id !== myId) return "full";
    } else {
      if (meIsHost || meIsGuest) return "already";
      if (current.guest) return "full";
    }

    if (normalizeJoinCode(joinCode) !== normalizeJoinCode(String(current.joinCode))) {
      return "invalid";
    }
    if (
      current.sessionState === SESSION_STATES.EMPTY ||
      current.sessionState === SESSION_STATES.ENDED
    ) {
      return "invalid";
    }
    await patchCinemaChatState(
      invite
        ? {
            guest: current.guest || identity,
            guestApproved: true,
            hostApproved: true,
            sessionState: SESSION_STATES.WAITING_FOR_APPROVAL,
            guestLastSeen: Date.now(),
          }
        : {
            guest: identity,
            guestApproved: true,
            sessionState: SESSION_STATES.PAIRING,
            guestLastSeen: Date.now(),
          },
      myId,
    );
    return "joined";
  } catch {
    return "error";
  }
};
