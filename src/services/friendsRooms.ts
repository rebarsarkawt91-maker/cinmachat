/**
 * Friends Room (ژوورەکانی هاوڕێیان / Came Here Rooms) — dedicated, isolated
 * Firestore schema so this module never cross-contaminates VIP rooms, syncGroups,
 * the main broadcast or config.
 *
 *   friends_rooms/{roomId}                 → room state (host code, unique join
 *                                            code, category/genre, movie + play)
 *   friends_rooms/{roomId}/messages/{id}   → per-room live chat (immutable)
 *   invitations/{inviteId}                 → friend invitations (send/respond)
 *
 * Anonymous Firebase Auth is DISABLED on this project, so isAdmin()/isSignedIn()
 * gates would DENY every client write; validated public writes are used instead
 * (same pattern as genres/config/VIP/main_broadcast).
 */
import {
  db,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
} from "../lib/firebase";

export const FRIENDS_ROOMS_COLLECTION = "friends_rooms";
export const INVITATIONS_COLLECTION = "invitations";

export interface FriendsRoomUser {
  username: string;
  uniqueCode: string;
  joinedAt: string;
}

export interface FriendsRoom {
  id: string;
  name: string;
  hostCode: string;
  hostName: string;
  uniqueCode: string;
  category: string;
  genre: string;
  currentMovieUrl: string;
  currentMovieTitle: string;
  currentMovieImage: string;
  isPlaying: boolean;
  currentTime: number;
  activeUsers: FriendsRoomUser[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FriendsRoomMessage {
  id?: string;
  sender: string;
  senderCode: string;
  text: string;
  timestamp?: string;
}

export interface FriendsInvitation {
  id?: string;
  fromUserCode: string;
  fromUserName: string;
  targetCodeOrName: string;
  roomId: string;
  roomName: string;
  status: "pending" | "accepted" | "declined";
  timestamp?: string;
  updatedAt?: string;
}

export const normalizeFriendsRoom = (data: any, id: string): FriendsRoom => ({
  id: id || (data && typeof data.id === "string" ? data.id : ""),
  name: data && typeof data.name === "string" ? data.name : "ژووری هاوڕێیان",
  hostCode: data && typeof data.hostCode === "string" ? data.hostCode : "",
  hostName: data && typeof data.hostName === "string" ? data.hostName : "",
  uniqueCode: data && typeof data.uniqueCode === "string" ? data.uniqueCode : "",
  category: data && typeof data.category === "string" ? data.category : "",
  genre: data && typeof data.genre === "string" ? data.genre : "",
  currentMovieUrl:
    data && typeof data.currentMovieUrl === "string" ? data.currentMovieUrl : "",
  currentMovieTitle:
    data && typeof data.currentMovieTitle === "string" ? data.currentMovieTitle : "",
  currentMovieImage:
    data && typeof data.currentMovieImage === "string" ? data.currentMovieImage : "",
  isPlaying: !!(data && data.isPlaying),
  currentTime:
    data && typeof data.currentTime === "number" ? data.currentTime : 0,
  activeUsers:
    data && Array.isArray(data.activeUsers) ? data.activeUsers : [],
  createdAt: data && typeof data.createdAt === "string" ? data.createdAt : undefined,
  updatedAt: data && typeof data.updatedAt === "string" ? data.updatedAt : undefined,
});

/** Generate a robust unique join code like FR-AB12-CD34. */
export const generateRoomCode = (): string => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rand = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `FR-${rand(4)}-${rand(4)}`;
};

const roomsCol = () => collection(db, FRIENDS_ROOMS_COLLECTION);

// --- Room list (available rooms to browse/join) ---

export const subscribeFriendsRooms = (
  onChange: (rooms: FriendsRoom[]) => void,
): (() => void) => {
  const q = query(roomsCol(), orderBy("createdAt", "desc"), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => normalizeFriendsRoom(d.data(), d.id)));
    },
    (err) => console.warn("friends_rooms list listener failed:", err),
  );
};

export const loadFriendsRooms = async (): Promise<FriendsRoom[]> => {
  try {
    const q = query(roomsCol(), orderBy("createdAt", "desc"), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeFriendsRoom(d.data(), d.id));
  } catch (err) {
    console.warn("loadFriendsRooms failed:", err);
    return [];
  }
};

// --- Single room (real-time state) ---

export const getFriendsRoom = async (roomId: string): Promise<FriendsRoom | null> => {
  try {
    const snap = await getDoc(doc(roomsCol(), roomId));
    if (snap.exists()) return normalizeFriendsRoom(snap.data(), snap.id);
  } catch (err) {
    console.warn("getFriendsRoom failed:", err);
  }
  return null;
};

export const subscribeFriendsRoom = (
  roomId: string,
  onChange: (room: FriendsRoom | null) => void,
): (() => void) => {
  return onSnapshot(
    doc(roomsCol(), roomId),
    (snap) => {
      if (snap.exists()) onChange(normalizeFriendsRoom(snap.data(), snap.id));
      else onChange(null);
    },
    (err) => console.warn("friends_rooms room listener failed:", err),
  );
};

// --- Create / update ---

export const createFriendsRoom = async (
  payload: Omit<FriendsRoom, "id" | "createdAt" | "updatedAt">,
): Promise<FriendsRoom> => {
  const docRef = await addDoc(roomsCol(), {
    ...payload,
    id: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await updateDoc(docRef, { id: docRef.id });
  return normalizeFriendsRoom({ ...payload, id: docRef.id }, docRef.id);
};

export const updateFriendsRoom = async (
  roomId: string,
  patch: Partial<FriendsRoom>,
): Promise<void> => {
  await updateDoc(doc(roomsCol(), roomId), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
};

// Resolve a join input into a room: generated uniqueCode first, then the host's
// CC-XXXX hostCode, then a raw doc id (shared ?roomId= links).
export const resolveRoomByCode = async (input: string): Promise<FriendsRoom | null> => {
  const code = input.trim().toUpperCase();
  if (!code) return null;

  try {
    const q = query(roomsCol(), where("uniqueCode", "==", code), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return normalizeFriendsRoom(snap.docs[0].data(), snap.docs[0].id);
  } catch (err) {
    console.warn("uniqueCode lookup failed:", err);
  }

  try {
    const q = query(roomsCol(), where("hostCode", "==", code), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return normalizeFriendsRoom(snap.docs[0].data(), snap.docs[0].id);
  } catch (err) {
    console.warn("hostCode lookup failed:", err);
  }

  const byId = await getFriendsRoom(code);
  return byId;
};

// Join: append/refresh the caller in activeUsers. Read-modify-write keeps the
// rest of the doc intact while the validated rules check the merged result.
export const joinFriendsRoom = async (
  room: FriendsRoom,
  user: FriendsRoomUser,
): Promise<void> => {
  const current = Array.isArray(room.activeUsers) ? room.activeUsers : [];
  const next = current.filter((u) => u.uniqueCode !== user.uniqueCode);
  next.push(user);
  await updateFriendsRoom(room.id, { activeUsers: next });
};

// --- Per-room live chat ---

export const subscribeFriendsRoomMessages = (
  roomId: string,
  onChange: (messages: FriendsRoomMessage[]) => void,
): (() => void) => {
  const q = query(
    collection(db, FRIENDS_ROOMS_COLLECTION, roomId, "messages"),
    orderBy("createdAt", "desc"),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    },
    (err) => console.warn("friends_rooms chat listener failed:", err),
  );
};

export const sendFriendsRoomMessage = async (
  roomId: string,
  msg: Omit<FriendsRoomMessage, "id">,
): Promise<void> => {
  await addDoc(collection(db, FRIENDS_ROOMS_COLLECTION, roomId, "messages"), {
    sender: msg.sender,
    senderCode: msg.senderCode,
    text: msg.text,
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
};

// --- Invitations (send / respond / incoming real-time) ---

export const sendInvitation = async (
  payload: Omit<FriendsInvitation, "id" | "timestamp" | "status">,
): Promise<void> => {
  await addDoc(collection(db, INVITATIONS_COLLECTION), {
    ...payload,
    status: "pending",
    targetCodeOrName: payload.targetCodeOrName.trim().toUpperCase(),
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
};

export const respondToInvitation = async (
  inviteId: string,
  status: "accepted" | "declined",
): Promise<void> => {
  await updateDoc(doc(collection(db, INVITATIONS_COLLECTION), inviteId), {
    status,
    updatedAt: new Date().toISOString(),
  });
};

export const subscribeInvitations = (
  targetCode: string,
  onChange: (invites: FriendsInvitation[]) => void,
): (() => void) => {
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where("targetCodeOrName", "==", targetCode.trim().toUpperCase()),
    limit(50),
  );
  return onSnapshot(
    q,
    (snap) => {
      const pending: FriendsInvitation[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        if (data && data.status === "pending") {
          pending.push({ id: d.id, ...data });
        }
      });
      onChange(pending);
    },
    (err) => console.warn("invitations listener failed:", err),
  );
};
