/**
 * Standalone reel (ڕیڵ) service — Firestore-backed source of truth for the
 * "ڕیڵ و ڤیدیۆکانی سینەما چات" shelf. Reels are decoupled from movies: the
 * admin pastes a raw link and it is stored on its own, so no movie picker is
 * needed anywhere in the flow.
 *
 * Collection: reels/{reelId}
 *   { url, platform: "youtube" | "facebook", createdAt, createdBy }
 * reelId is deterministic (YouTube video id / sanitized url) so re-adding the
 * same link is idempotent and concurrent visitors can never create duplicates.
 * Meta doc: reels/_meta { seeded: true } — distinguishes "never seeded" (the
 * one-time import of the movie catalog's trailer links) from "admin deleted
 * every reel on purpose".
 */
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

export type ReelPlatform = "youtube" | "facebook";

export interface Reel {
  id: string;
  url: string;
  platform: ReelPlatform;
  createdAt?: unknown;
}

const REELS_COLLECTION = "reels";
const META_DOC = "_meta";

export const isUsableReelUrl = (value?: string) => {
  if (!value || value === "#") return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

export const reelPlatformOf = (url: string): ReelPlatform =>
  /facebook\.com|fb\.watch/i.test(url) ? "facebook" : "youtube";

const YT_ID_RE =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;

export const youtubeIdOf = (value?: string) => value?.match(YT_ID_RE)?.[1] || null;

/** Stable Firestore doc id for a reel link (yt id or sanitized url tail). */
export const reelIdFor = (rawUrl: string): string => {
  const url = rawUrl.trim();
  const yt = url.match(YT_ID_RE);
  if (yt?.[1]) return `yt-${yt[1]}`;
  const tail = url.replace(/[^A-Za-z0-9_-]/g, "").slice(-48).toLowerCase();
  return `lnk-${tail || "reel"}`;
};

/** Real-time subscription to every reel, oldest first. */
export function subscribeReels(cb: (reels: Reel[]) => void): () => void {
  const q = query(collection(db, REELS_COLLECTION), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const list: Reel[] = [];
      snap.forEach((d) => {
        if (d.id === META_DOC) return;
        const data = d.data() as { url?: string; platform?: string };
        if (!data.url) return;
        list.push({
          id: d.id,
          url: data.url,
          platform: (data.platform as ReelPlatform) || "youtube",
        });
      });
      cb(list);
    },
    (err) => {
      console.warn("[Reels] Real-time subscription error:", err);
    },
  );
}

/** Add (or idempotently refresh) a reel from a raw link. */
export async function addReel(rawUrl: string): Promise<void> {
  const url = rawUrl.trim();
  if (!isUsableReelUrl(url)) {
    throw new Error("تکایە لینکێکی دروست دابنێ");
  }
  await setDoc(doc(db, REELS_COLLECTION, reelIdFor(url)), {
    url,
    platform: reelPlatformOf(url),
    createdAt: serverTimestamp(),
    createdBy: "Admin",
  });
}

/** Delete a reel by its Firestore document id. */
export async function removeReel(id: string): Promise<void> {
  await deleteDoc(doc(db, REELS_COLLECTION, id));
}

/**
 * One-time best-effort import: copy every usable trailer link currently living
 * on movie documents into the standalone reels collection, then mark the meta
 * doc so it never runs again. Deterministic ids make concurrent visitors safe.
 */
export async function seedReelsFromMovies(urls: string[]): Promise<void> {
  try {
    const metaRef = doc(db, REELS_COLLECTION, META_DOC);
    if ((await getDoc(metaRef)).exists()) return;
    let seeded = 0;
    for (const raw of urls) {
      const url = raw.trim();
      if (!isUsableReelUrl(url)) continue;
      await setDoc(doc(db, REELS_COLLECTION, reelIdFor(url)), {
        url,
        platform: reelPlatformOf(url),
        createdAt: serverTimestamp(),
        createdBy: "import",
      });
      seeded++;
    }
    await setDoc(metaRef, { seeded, seededAt: serverTimestamp() });
    if (seeded > 0) console.log(`[Reels] Imported ${seeded} reel link(s) from movies.`);
  } catch (err) {
    console.warn("[Reels] Seed skipped (no write permission or offline):", err);
  }
}
