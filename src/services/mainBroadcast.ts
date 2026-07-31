import {
  db,
  doc,
  getDoc,
  setDoc,
  addDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "../lib/firebase";

// Module 19: Main Broadcast (پەخشی گشتی) — dedicated, isolated Firestore
// schema so the public broadcast never cross-contaminates VIP or other modules.
//
//   main_broadcast_room/state                  → live stream URL + play/seek state
//   main_broadcast_room/state/messages/{id}    → public live chat (1-hour TTL by UI)
//   broadcast_settings/default                 → preview/trailer + title settings
//
// Anonymous Firebase Auth is DISABLED on this project, so isAdmin()/isSignedIn()
// gates would DENY every client write; validated public writes are used instead
// (same pattern as genres/config/VIP/channel_settings).

export const MAIN_BROADCAST_COLLECTION = "main_broadcast_room";
export const MAIN_BROADCAST_STATE_DOC = "state";
export const BROADCAST_SETTINGS_COLLECTION = "broadcast_settings";
export const BROADCAST_SETTINGS_DOC = "default";

export interface BroadcastState {
  currentMovieUrl: string;
  isPlaying: boolean;
  currentTime: number;
  name?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface BroadcastMessage {
  id?: string;
  sender: string;
  senderCode: string;
  text: string;
  timestamp?: string;
}

export interface BroadcastSettings {
  previewEnabled: boolean;
  previewAutoplay: boolean;
  broadcastTitle: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_BROADCAST_STATE: BroadcastState = {
  currentMovieUrl: "",
  isPlaying: false,
  currentTime: 0,
};

export const DEFAULT_BROADCAST_SETTINGS: BroadcastSettings = {
  previewEnabled: true,
  previewAutoplay: true,
  broadcastTitle: "پەخشی فەرمی (Broadcast)",
};

export const normalizeBroadcastState = (data: any): BroadcastState => ({
  currentMovieUrl:
    data && typeof data.currentMovieUrl === "string" ? data.currentMovieUrl : "",
  isPlaying: !!(data && data.isPlaying),
  currentTime:
    data && typeof data.currentTime === "number" ? data.currentTime : 0,
  name: data && typeof data.name === "string" ? data.name : undefined,
  updatedAt: data && typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  updatedBy: data && typeof data.updatedBy === "string" ? data.updatedBy : undefined,
});

export const normalizeBroadcastSettings = (data: any): BroadcastSettings => ({
  previewEnabled: !data || data.previewEnabled === undefined ? true : !!data.previewEnabled,
  previewAutoplay: !data || data.previewAutoplay === undefined ? true : !!data.previewAutoplay,
  broadcastTitle:
    data && typeof data.broadcastTitle === "string"
      ? data.broadcastTitle
      : DEFAULT_BROADCAST_SETTINGS.broadcastTitle,
});

const stateRef = () => doc(db, MAIN_BROADCAST_COLLECTION, MAIN_BROADCAST_STATE_DOC);
const settingsRef = () => doc(db, BROADCAST_SETTINGS_COLLECTION, BROADCAST_SETTINGS_DOC);

// --- Room state (stream URL + pause/resume/seek) ---

export const loadBroadcastState = async (): Promise<BroadcastState> => {
  try {
    const snap = await getDoc(stateRef());
    if (snap.exists()) return normalizeBroadcastState(snap.data());
  } catch (err) {
    console.warn("loadBroadcastState failed:", err);
  }
  return DEFAULT_BROADCAST_STATE;
};

export const subscribeBroadcastState = (
  onChange: (state: BroadcastState) => void,
): (() => void) => {
  return onSnapshot(
    stateRef(),
    (snap) => {
      if (snap.exists()) onChange(normalizeBroadcastState(snap.data()));
      else onChange(DEFAULT_BROADCAST_STATE);
    },
    (err) => console.warn("main_broadcast_room state listener failed:", err),
  );
};

// Persistent save of the broadcast state (URL / isPlaying / currentTime).
// Read-modify-write so a URL change never clobbers play/seek state and vice
// versa; the full doc stays under the validated rules.
export const updateBroadcastState = async (
  patch: Partial<BroadcastState>,
  updatedBy?: string,
): Promise<void> => {
  let existing: any = {};
  try {
    const snap = await getDoc(stateRef());
    if (snap.exists()) existing = snap.data();
  } catch (err) {
    console.warn("updateBroadcastState read failed:", err);
  }
  await setDoc(
    stateRef(),
    {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || "admin",
    },
    { merge: true },
  );
};

// --- Live chat (subcollection under the state doc) ---

export const subscribeBroadcastMessages = (
  onChange: (messages: BroadcastMessage[]) => void,
): (() => void) => {
  const q = query(
    collection(db, MAIN_BROADCAST_COLLECTION, MAIN_BROADCAST_STATE_DOC, "messages"),
    orderBy("createdAt", "desc"),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      );
    },
    (err) => console.warn("main_broadcast_room chat listener failed:", err),
  );
};

export const sendBroadcastMessage = async (
  msg: Omit<BroadcastMessage, "id">,
): Promise<void> => {
  await addDoc(
    collection(db, MAIN_BROADCAST_COLLECTION, MAIN_BROADCAST_STATE_DOC, "messages"),
    {
      sender: msg.sender,
      senderCode: msg.senderCode,
      text: msg.text,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    },
  );
};

// --- Preview / broadcast settings ---

export const loadBroadcastSettings = async (): Promise<BroadcastSettings> => {
  try {
    const snap = await getDoc(settingsRef());
    if (snap.exists()) return normalizeBroadcastSettings(snap.data());
  } catch (err) {
    console.warn("loadBroadcastSettings failed:", err);
  }
  return DEFAULT_BROADCAST_SETTINGS;
};

export const subscribeBroadcastSettings = (
  onChange: (settings: BroadcastSettings) => void,
): (() => void) => {
  return onSnapshot(
    settingsRef(),
    (snap) => {
      if (snap.exists()) onChange(normalizeBroadcastSettings(snap.data()));
      else onChange(DEFAULT_BROADCAST_SETTINGS);
    },
    (err) => console.warn("broadcast_settings listener failed:", err),
  );
};

export const saveBroadcastSettings = async (
  patch: Partial<BroadcastSettings>,
  updatedBy?: string,
): Promise<void> => {
  let existing: any = {};
  try {
    const snap = await getDoc(settingsRef());
    if (snap.exists()) existing = snap.data();
  } catch (err) {
    console.warn("saveBroadcastSettings read failed:", err);
  }
  await setDoc(
    settingsRef(),
    {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || "admin",
    },
    { merge: true },
  );
};
