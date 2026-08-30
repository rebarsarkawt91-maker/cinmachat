/**
 * Friend → Connect private contact flow (CinemaChat).
 *
 * Replaces the old "SEND INVITATION into the shared broadcast room" model with
 * a real PRIVATE 1-to-1 connection between two account users. State (who asked,
 * who accepted) lives in `friend_connections/{pairKey}` — one document per
 * unordered user pair, so duplicates are impossible by construction.
 *
 *   friend_connections/{pairKey}   → connection metadata + status only
 *   (messages NEVER touch Firestore — they live only in the server's in-memory
 *   private session, see the /ws/private-chat handler in server.ts)
 *
 * Identity/routing is always the Firebase UID. Phone/email are only ever used
 * as SEARCH KEYS on the `users` collection — never as a room/session id.
 */
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
  where,
  limit,
} from "../lib/firebase";
import {
  normalizeJoinCode,
  normalizeInvitePhoneInput,
  maskInvitePhone,
} from "./cinemaChat";

export const FRIEND_CONNECTIONS_COLLECTION = "friend_connections";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FriendConnectionStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface FriendConnection {
  id: string;
  kind: "friend";
  /** Sorted [uidA, uidB] — lets every user query their own connections with a
   *  single `array-contains` and makes the doc id deterministic per pair. */
  participants: string[];
  requesterUid: string;
  requesterName: string;
  requesterCode: string;
  requesterAvatar?: string | null;
  targetUid: string;
  targetName: string;
  targetCode: string;
  targetAvatar?: string | null;
  status: FriendConnectionStatus;
  createdAt: string;
  updatedAt?: string;
  acceptedAt?: string | null;
}

export interface ContactSearchResult {
  uid: string;
  name: string;
  uniqueCode: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
}

export type ContactKind = "phone" | "email";

// ---------------------------------------------------------------------------
// Input normalization helpers (phone digits incl. Kurdish/Arabic → latin)
// ---------------------------------------------------------------------------

export const classifyContactInput = (raw: string): ContactKind =>
  String(raw || "").trim().includes("@") ? "email" : "phone";

export const normalizeEmailInput = (raw: string): string =>
  String(raw || "").trim().toLowerCase().replace(/\s+/g, "");

/** Pair key: lexicographically sorted UIDs joined by "__". One connection per
 *  unordered pair — duplicate invitations are impossible at the data layer. */
export const friendPairKey = (uidA: string, uidB: string): string =>
  [String(uidA), String(uidB)].sort().join("__");

/** Canonical phone identity key: pure digits with the local "0"/"964" prefixes
 *  stripped, so "+964 750 123 4567", "0750 123 4567" and "9647501234567" all
 *  resolve to the SAME contact key. Used to address and look up watch-call
 *  rings so the receiver's stored number and the sender's typed number always
 *  agree regardless of formatting. */
export const canonicalPhoneKey = (phone?: string | null): string => {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("964")) digits = digits.slice(3);
  while (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
};

/** Re-exported so the UI keeps one phone-masking implementation. */
export { maskInvitePhone, normalizeInvitePhoneInput };

// ---------------------------------------------------------------------------
// Search (phone or email) — NEVER used as an id, only as a lookup key
// ---------------------------------------------------------------------------

const userAllowsPhoneLookup = (data: any): boolean => {
  const privacy = data?.privacySettings || {};
  if (privacy.allowPhoneLookup === false) return false;
  if (privacy.lookupByPhone === false) return false;
  if (privacy.phoneLookup === false) return false;
  if (String(privacy.phoneLookupVisibility || "").toLowerCase() === "nobody") return false;
  return true;
};

const toContactResult = (uid: string, d: any): ContactSearchResult => ({
  uid,
  name: d?.name || d?.displayName || "بەکارهێنەر",
  uniqueCode: d?.uniqueCode || "",
  phone:
    typeof d?.phone === "string"
      ? d.phone
      : typeof d?.phoneNumber === "string"
        ? d.phoneNumber
        : undefined,
  email: typeof d?.email === "string" ? d.email : undefined,
  avatarUrl:
    typeof d?.avatarUrl === "string"
      ? d.avatarUrl
      : typeof d?.avatar === "string"
        ? d.avatar
        : undefined,
});

/** Resolve a phone number (any common Iraqi/Kurdish spelling) or an email to a
 *  registered account. Returns null when nothing matches or privacy blocks it. */
export const searchAccountByContact = async (
  raw: string,
): Promise<ContactSearchResult | null> => {
  const kind = classifyContactInput(raw);

  if (kind === "email") {
    const email = normalizeEmailInput(raw);
    if (!email || !email.includes("@")) return null;
    for (const field of ["email", "emailLower", "email_lower"]) {
      try {
        const q = query(collection(db, "users"), where(field, "==", email), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) return toContactResult(snap.docs[0].id, snap.docs[0].data());
      } catch {
        /* keep trying alternate field spellings */
      }
    }
    return null;
  }

  const normalized = normalizeInvitePhoneInput(raw);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;

  const phoneCandidates = [
    normalized,
    digits,
    `+${digits}`,
    digits.startsWith("0") ? `+964${digits.slice(1)}` : "",
    digits.startsWith("964") ? `+${digits}` : "",
    digits.startsWith("964") ? `0${digits.slice(3)}` : "",
  ].filter((p, i, arr) => p && arr.indexOf(p) === i);

  for (const phone of phoneCandidates) {
    for (const field of ["phone", "phoneNumber"]) {
      try {
        const q = query(collection(db, "users"), where(field, "==", phone), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0].data() as any;
          if (!userAllowsPhoneLookup(d)) return null;
          return toContactResult(snap.docs[0].id, d);
        }
      } catch {
        /* keep trying normalized phone spellings */
      }
    }
  }
  return null;
};

/** Resolve a CC-ID (any spelling: "CC-CC-9803", "CC-9803", "9803") to a
 *  registered account. Codes are public identifiers, so no privacy opt-in is
 *  required (unlike phone/email lookups). Returns null when nothing matches. */
export const searchAccountByCCId = async (
  raw: string,
): Promise<ContactSearchResult | null> => {
  const core = normalizeJoinCode(raw);
  if (!core) return null;
  const codeCandidates = [core, `CC-${core}`, `CC-CC-${core}`].filter(
    (c, i, arr) => c && arr.indexOf(c) === i,
  );
  for (const code of codeCandidates) {
    try {
      const q = query(collection(db, "users"), where("uniqueCode", "==", code), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0].data() as any;
        // CC-IDs are public; the profile's contact info is NOT returned here.
        return {
          uid: snap.docs[0].id,
          name: d?.name || d?.displayName || "بەکارهێنەر",
          uniqueCode: d?.uniqueCode || "",
          avatarUrl:
            typeof d?.avatarUrl === "string"
              ? d.avatarUrl
              : typeof d?.avatar === "string"
                ? d.avatar
                : undefined,
        };
      }
    } catch {
      /* keep trying normalized code spellings */
    }
  }
  return null;
};

/** One-stop lookup for the in-room friend request panel: accepts a CC-ID or a
 *  mobile number and returns the public profile (phone lookups still respect
 *  each account's privacy settings).
 *
 *  **Email is NOT a valid pairing key** — it is stored only as informational
 *  profile data and must never be used to look up or pair two users for the
 *  watch-together feature. Only phone number and unique code (CC-XXXX) are
 *  valid pairing keys. */
export const searchAccountByCCIdOrContact = async (
  raw: string,
): Promise<ContactSearchResult | null> => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  // Email addresses are NOT used for friend pairing — reject immediately.
  if (trimmed.includes("@")) return null;

  const digits = trimmed.replace(/\D/g, "");
  const isPhoneLike = digits.length >= 7 && /^[\d+\s-]*$/.test(trimmed);

  // Resolve deterministic local E2E identities first. Firestore can remain
  // pending while offline, but the local development server is immediate.
  try {
    const response = await fetch(`/api/local-test/accounts?q=${encodeURIComponent(trimmed)}`);
    const data = await response.json().catch(() => ({}));
    const account = Array.isArray(data?.accounts) ? data.accounts[0] : null;
    if (account?.uid) return account as ContactSearchResult;
  } catch {
    /* continue with the real account lookup */
  }

  // Not obviously a phone → try the CC-ID path first (codes are public).
  if (!isPhoneLike) {
    const byCode = await searchAccountByCCId(trimmed);
    if (byCode) return byCode;
  }
  // Fall back to the phone contact search.
  const firebaseResult = await searchAccountByContact(trimmed);
  if (firebaseResult) return firebaseResult;

  return null;
};

// ---------------------------------------------------------------------------
// Connections (create / respond / cancel / subscribe)
// ---------------------------------------------------------------------------

const connectionFromSnap = (snap: any): FriendConnection => ({
  id: snap.id,
  ...(snap.data() as object),
}) as FriendConnection;

/** Create the pending connection between two accounts. The deterministic pair
 *  key means re-asking a pending/active connection just returns it (duplicate
 *  protection), and a previously rejected/cancelled one is re-opened. */
export const createFriendConnection = async (params: {
  requesterUid: string;
  requesterName: string;
  requesterCode: string;
  requesterAvatar?: string | null;
  target: ContactSearchResult;
}): Promise<{ id: string; duplicate: boolean }> => {
  const { requesterUid, requesterName, requesterCode, requesterAvatar, target } = params;
  if (requesterUid === target.uid) throw new Error("cannot-connect-to-self");
  if (!target.uid) throw new Error("invalid-target");

  const id = friendPairKey(requesterUid, target.uid);
  const ref = doc(db, FRIEND_CONNECTIONS_COLLECTION, id);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = snap.data() as any;
    if (existing?.status === "pending" || existing?.status === "accepted") {
      return { id: snap.id, duplicate: true };
    }
    // re-open a closed (rejected/cancelled) connection as a fresh pending ask
  }

  await setDoc(ref, {
    kind: "friend",
    participants: [requesterUid, target.uid].sort(),
    requesterUid,
    requesterName,
    requesterCode,
    requesterAvatar: requesterAvatar || null,
    targetUid: target.uid,
    targetName: target.name,
    targetCode: target.uniqueCode,
    targetAvatar: target.avatarUrl || null,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    acceptedAt: null,
  });
  return { id, duplicate: false };
};

/** Accept or reject a pending connection. Only the target may respond (the
 *  requester cancels via cancelFriendConnection). */
export const respondToFriendConnection = async (
  connectionId: string,
  status: "accepted" | "rejected",
): Promise<void> => {
  await updateDoc(doc(db, FRIEND_CONNECTIONS_COLLECTION, connectionId), {
    status,
    updatedAt: new Date().toISOString(),
    acceptedAt: status === "accepted" ? new Date().toISOString() : null,
  });
};

/** Requester withdraws a pending invitation. */
export const cancelFriendConnection = async (connectionId: string): Promise<void> => {
  await updateDoc(doc(db, FRIEND_CONNECTIONS_COLLECTION, connectionId), {
    status: "cancelled",
    updatedAt: new Date().toISOString(),
    acceptedAt: null,
  });
};

/** Read the connection between two users, if any (state restored on re-open). */
export const getFriendConnectionBetween = async (
  uidA: string,
  uidB: string,
): Promise<FriendConnection | null> => {
  if (!uidA || !uidB) return null;
  const ref = doc(db, FRIEND_CONNECTIONS_COLLECTION, friendPairKey(uidA, uidB));
  const snap = await getDoc(ref);
  return snap.exists() ? connectionFromSnap(snap) : null;
};

/** Real-time listener for every connection a user participates in (both as
 *  requester and as target) — incoming asks + the pair's status transitions.
 *  Sorted client-side so the query only needs the participants index. */
export const subscribeConnectionsForUser = (
  uid: string,
  onChange: (connections: FriendConnection[]) => void,
  onError?: (err: unknown) => void,
): (() => void) => {
  if (!uid) return () => {};
  const q = query(
    collection(db, FRIEND_CONNECTIONS_COLLECTION),
    where("participants", "array-contains", uid),
    limit(50),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => connectionFromSnap(d as any));
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      onChange(list);
    },
    (err) => {
      console.warn("friend connections listener failed:", err);
      onError?.(err);
    },
  );
};

/** Real-time listener for a single connection (drives CONNECT 2 → chat). */
export const subscribeFriendConnection = (
  connectionId: string,
  onChange: (connection: FriendConnection | null) => void,
  onError?: (err: unknown) => void,
): (() => void) => {
  if (!connectionId) return () => {};
  return onSnapshot(
    doc(db, FRIEND_CONNECTIONS_COLLECTION, connectionId),
    (snap) => {
      onChange(snap.exists() ? connectionFromSnap(snap as any) : null);
    },
    (err) => {
      console.warn("friend connection listener failed:", err);
      onError?.(err);
    },
  );
};

// ---------------------------------------------------------------------------
// Watch Together "call invitation" (CinemaChat)
//
// A REAL-TIME ring signal: when A finds B by phone/CC-ID in the Friend → Connect
// modal and presses the "Call Invitation" button, a lightweight invitation doc
// (kind: "watchcall") is created in the `invitations` collection (rules:
// allow read/write — no firestore.rules change needed). B's app listens on that
// collection ANYWHERE in the app and pops a ring toast ("watch together").
// Answering mirrors the friend-connection accept, so the caller + receiver land
// in the private 1-to-1 chat + movie step exactly like a normal accepted ask.
// ---------------------------------------------------------------------------

/** Persist + list channel shared with the CinemaChat room invitations, which
 *  already ships permissive rules (allow read/write: if true). */
const WATCH_CALLS_COL = "invitations";

export type WatchCallStatus = "calling" | "accepted" | "declined" | "ended";

export interface WatchCall {
  id: string;
  kind: "watchcall";
  status: WatchCallStatus;
  fromId: string;
  fromName: string;
  fromCode: string;
  fromAvatar?: string | null;
  toId: string;
  toName: string;
  toCode: string;
  /** Canonical receiver identity keys — [uid, uniqueCode, phone-digits] — used
   *  for the receiver's single-field array-contains listener (no composite
   *  index needed, and phone/uid spellings always agree on both sides). */
  toKeys?: string[];
  toPhone?: string | null;
  /** friend_connections doc id (pair key) opened when the receiver answers. */
  connectionId: string;
  startedAt: string;
  createdAt: string;
  updatedAt?: string;
  readAt?: string | null;
}

/** A ring that is not answered within this window is treated as stale/ignored
 *  (caller went offline, closed the app, ...) and is auto-expired client-side. */
export const WATCH_CALL_TTL_MS = 90_000;

const toWatchCall = (snap: any): WatchCall =>
  ({ id: snap.id, ...(snap.data() as object) }) as WatchCall;

/** Ring B's device. ORDER MATTERS: the ring document is written FIRST (the
 *  `invitations` collection is `allow read, write: if true`, so delivery can
 *  never be blocked by connection rules / auth identity). The private friend
 *  connection is then ensured best-effort — a failure there must NOT suppress
 *  the ring. The connectionId is always the deterministic pair key, so the
 *  receiver's Accept can still resolve the pair doc when it exists. */
export const sendWatchCallInvitation = async (params: {
  requesterUid: string;
  requesterName: string;
  requesterCode: string;
  requesterAvatar?: string | null;
  target: ContactSearchResult;
}): Promise<{ callId: string; connectionId: string }> => {
  const { requesterUid, requesterName, requesterCode, requesterAvatar, target } = params;
  if (requesterUid === target.uid) throw new Error("cannot-call-self");
  if (!target.uid) throw new Error("invalid-target");

  // Deterministic pair doc id — surfaced on the ring so the receiver's Accept
  // knows exactly where the private chat pair lives (exists or not yet).
  const connectionId = friendPairKey(requesterUid, target.uid);

  // Canonical receiver keys: uid always; plus CC-ID and normalized phone when
  // the search exposed them. The receiver listens with array-contains on its
  // OWN uid/phone keys, so both sides always agree on identity.
  const toKeys = [
    target.uid,
    target.uniqueCode || "",
    canonicalPhoneKey(target.phone),
  ].filter(Boolean) as string[];

  // 1) Deliver the ring FIRST — single open-rules write, unconditionally.
  const ref = await addDoc(collection(db, WATCH_CALLS_COL), {
    kind: "watchcall",
    status: "calling",
    fromId: requesterUid,
    fromName: requesterName,
    fromCode: requesterCode,
    fromAvatar: requesterAvatar || null,
    toId: target.uid,
    toName: target.name,
    toCode: target.uniqueCode,
    toKeys,
    toPhone: target.phone || null,
    connectionId,
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    readAt: null,
  });

  // 2) Best-effort ensure the private-chat pair exists (chat landable on
  //    Accept). Never allowed to block or abort the already-delivered ring.
  try {
    await createFriendConnection(params);
  } catch (err) {
    console.warn("watch call: ring delivered but friend connection ensure failed:", err);
  }

  return { callId: ref.id, connectionId };
};

/** Receiver answers (accept → also accepts/ensures the underlying friend
 *  connection so the Chat step opens automatically) or ignores the ring. */
export const respondToWatchCall = async (
  callId: string,
  connectionId: string,
  status: "accepted" | "declined",
  recipient?: {
    uid: string;
    name: string;
    code: string;
    avatar?: string | null;
  },
): Promise<void> => {
  await updateDoc(doc(db, WATCH_CALLS_COL, callId), {
    status,
    updatedAt: new Date().toISOString(),
  });
  if (status !== "accepted") return;
  // Only accept a still-pending ask — an already-accepted friend just stays
  // accepted (firestore.rules forbids re-accepting a non-pending connection).
  const snap = await getDoc(doc(db, FRIEND_CONNECTIONS_COLLECTION, connectionId));
  if (snap.exists() && snap.data()?.status === "pending") {
    await respondToFriendConnection(connectionId, "accepted");
  } else if (!snap.exists() && recipient?.uid) {
    // The caller's best-effort ensure failed (e.g. denied on their side). The
    // RECEIVER creates the pair instead so the private chat still exists — the
    // caller sees it as a normal incoming ask and the flow completes.
    try {
      const callSnapRaw = await getDoc(doc(db, WATCH_CALLS_COL, callId));
      const callDataRaw = callSnapRaw.data() as
        | { fromId: string; fromName?: string; fromCode?: string }
        | undefined;
      if (!callDataRaw?.fromId) return;
      await createFriendConnection({
        requesterUid: recipient.uid,
        requesterName: recipient.name,
        requesterCode: recipient.code,
        requesterAvatar: recipient.avatar || null,
        target: {
          uid: callDataRaw.fromId,
          name: callDataRaw.fromName || "بەکارهێنەر",
          uniqueCode: callDataRaw.fromCode || "",
        },
      });
    } catch (err) {
      console.warn("watch call: receiver-side connection ensure failed:", err);
    }
  }
};

/** Caller withdraws an outgoing ring. */
export const cancelWatchCall = async (callId: string): Promise<void> => {
  await updateDoc(doc(db, WATCH_CALLS_COL, callId), {
    status: "ended",
    updatedAt: new Date().toISOString(),
  });
};

/** Passive cleanup: a calling doc left ringing past its TTL becomes "ended". */
export const expireWatchCallIfStale = async (call: WatchCall): Promise<void> => {
  const age = Date.now() - new Date(call.startedAt).getTime();
  if (call.status !== "calling" || age < WATCH_CALL_TTL_MS) return;
  await cancelWatchCall(call.id);
};

/** Global listener for incoming "calling" rings (the receiver's device).
 *
 *  Identity: the receiver subscribes with its OWN keys (uid + normalized phone)
 *  using SINGLE-FIELD `array-contains` queries — these need only Firestore's
 *  automatic single-field indexes, so delivery works on a production project
 *  that may be missing the (kind, toId, status, createdAt) composite index the
 *  old query relied on. Results are filtered client-side. */
export const subscribeWatchCalls = (
  identity: { uid: string; phone?: string | null },
  onChange: (calls: WatchCall[]) => void,
  onError?: (err: unknown) => void,
): (() => void) => {
  const keys = [identity.uid, canonicalPhoneKey(identity.phone)].filter(
    Boolean,
  ) as string[];
  if (keys.length === 0) return () => {};

  const known = new Map<string, WatchCall>();
  const push = () => {
    const live = [...known.values()]
      .filter((c) => c.kind === "watchcall" && c.status === "calling")
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    onChange(live.slice(0, 20));
  };

  const unsubs = keys.map((key) =>
    onSnapshot(
      query(
        collection(db, WATCH_CALLS_COL),
        where("toKeys", "array-contains", key),
        limit(50),
      ),
      (snap) => {
        for (const d of snap.docs) known.set(d.id, toWatchCall(d as any));
        // Bound memory: drop anything way past the 90s ring TTL immediately.
        const cutoff = Date.now() - WATCH_CALL_TTL_MS * 15;
        for (const [id, call] of known) {
          if (new Date(call.startedAt).getTime() < cutoff) known.delete(id);
        }
        push();
      },
      (err) => {
        console.warn("watch calls listener failed:", err);
        onError?.(err);
      },
    ),
  );

  return () => unsubs.forEach((unsub) => unsub());
};

/** Single-doc listener for the CALLER's own ring (knows the callId it created). */
export const subscribeWatchCall = (
  callId: string,
  onChange: (call: WatchCall | null) => void,
  onError?: (err: unknown) => void,
): (() => void) => {
  if (!callId) return () => {};
  return onSnapshot(
    doc(db, WATCH_CALLS_COL, callId),
    (snap) => {
      onChange(snap.exists() ? toWatchCall(snap) : null);
    },
    (err) => {
      console.warn("watch call listener failed:", err);
      onError?.(err);
    },
  );
};

/** Normalize a member code for display/compare (re-export of cinemaChat's). */
export { normalizeJoinCode };
