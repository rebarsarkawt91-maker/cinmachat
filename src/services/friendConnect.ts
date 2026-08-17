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

/** One-stop lookup for the in-room friend request panel: accepts a CC-ID, a
 *  mobile number or an email and returns the public profile (phone lookups
 *  still respect each account's privacy settings). */
export const searchAccountByCCIdOrContact = async (
  raw: string,
): Promise<ContactSearchResult | null> => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  // Emails are handled by the existing contact search directly.
  if (trimmed.includes("@")) return searchAccountByContact(trimmed);

  const digits = trimmed.replace(/\D/g, "");
  const isPhoneLike = digits.length >= 7 && /^[\d+\s-]*$/.test(trimmed);

  // Not obviously a phone → try the CC-ID path first (codes are public).
  if (!isPhoneLike) {
    const byCode = await searchAccountByCCId(trimmed);
    if (byCode) return byCode;
  }
  // Fall back to the contact search (email already handled above, phone here).
  return searchAccountByContact(trimmed);
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

/** Normalize a member code for display/compare (re-export of cinemaChat's). */
export { normalizeJoinCode };
