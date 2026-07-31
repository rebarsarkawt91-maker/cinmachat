import { db, doc, getDoc, setDoc, onSnapshot } from "../lib/firebase";

// Module 9: Channel & Brand settings — dedicated Firestore collection
// (channel_settings) that persists the 4 social/brand URLs so they survive
// page refreshes, deploys and the (dead) legacy Render backend. A single
// doc `channel_settings/default` is the source of truth; the whole app reads
// it through an onSnapshot listener in App.tsx.

export const CHANNEL_SETTINGS_COLLECTION = "channel_settings";
export const CHANNEL_SETTINGS_DOC_ID = "default";

export interface ChannelLinks {
  youtubeUrl: string;
  tiktokUrl: string;
  instagramUrl: string;
  facebookUrl: string;
}

export const DEFAULT_CHANNEL_LINKS: ChannelLinks = {
  youtubeUrl: "https://www.youtube.com/",
  tiktokUrl: "https://www.tiktok.com/",
  instagramUrl: "https://www.instagram.com/",
  facebookUrl: "https://www.facebook.com/",
};

const CHANNEL_KEYS: (keyof ChannelLinks)[] = [
  "youtubeUrl",
  "tiktokUrl",
  "instagramUrl",
  "facebookUrl",
];

// Trim + keep only the 4 known link fields (empty string = link cleared).
export const normalizeChannelLinks = (data: any): ChannelLinks => {
  const out = {} as ChannelLinks;
  for (const key of CHANNEL_KEYS) {
    out[key] =
      data && typeof data[key] === "string" ? data[key].trim() : "";
  }
  return out;
};

// Validate URL format. Empty string is allowed (it clears the link).
export const isValidHttpUrl = (value: string): boolean => {
  const v = (value || "").trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

// One-time read (used before the live listener attaches).
export const loadChannelSettings = async (): Promise<ChannelLinks> => {
  try {
    const snap = await getDoc(
      doc(db, CHANNEL_SETTINGS_COLLECTION, CHANNEL_SETTINGS_DOC_ID),
    );
    if (snap.exists()) return normalizeChannelLinks(snap.data());
  } catch (err) {
    console.warn("loadChannelSettings failed:", err);
  }
  return DEFAULT_CHANNEL_LINKS;
};

// Real-time sync: fires whenever the admin saves new links.
export const subscribeChannelSettings = (
  onChange: (links: ChannelLinks) => void,
): (() => void) => {
  return onSnapshot(
    doc(db, CHANNEL_SETTINGS_COLLECTION, CHANNEL_SETTINGS_DOC_ID),
    (snap) => {
      if (snap.exists()) onChange(normalizeChannelLinks(snap.data()));
    },
    (err) => console.warn("channel_settings listener failed:", err),
  );
};

// Persistent save (validated public write — same pattern as genres/config).
export const saveChannelSettings = async (
  links: ChannelLinks,
  updatedBy?: string,
): Promise<void> => {
  const clean = normalizeChannelLinks(links);
  await setDoc(doc(db, CHANNEL_SETTINGS_COLLECTION, CHANNEL_SETTINGS_DOC_ID), {
    ...clean,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || "admin",
  });
};
