/**
 * Dynamic Genre (پۆلێنەکان) service — Firestore-backed source of truth for the
 * film genres shown in the main navigation and managed in the admin dashboard.
 *
 * Collection: genres/{genreId}
 *   { id, name (Kurdish label), tag (filter tag matched against movie.tags),
 *     sortOrder, createdAt, createdBy }
 * Meta doc:  genres/_meta { seeded: true } — distinguishes "never seeded" from
 * "admin deliberately deleted every genre".
 */
import { db, auth, signInAnonymously } from "../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

export interface Genre {
  id: string;
  name: string;
  tag: string;
  sortOrder: number;
  createdAt?: unknown;
  createdBy?: string;
}

const GENRES_COLLECTION = "genres";
const META_DOC = "_meta";

// Default genre catalog used as an initial seed + offline/fallback list. These
// mirror the genres the app historically shipped with (minus "هەمووی" which is
// the always-present "all" view rendered separately).
export const DEFAULT_GENRES: { name: string; tag: string }[] = [
  { name: "فیلمە نوێیەکان", tag: "New Releases" },
  { name: "دۆبلاژ", tag: "دۆبلاژ" },
  { name: "دراما", tag: "دراما" },
  { name: "ئاکشن", tag: "ئاکشن" },
  { name: "ترسناک", tag: "ترسناک" },
  { name: "کۆمیدی", tag: "کۆمیدی" },
  { name: "ئەنیمەیشن", tag: "ئەنیمەیشن" },
  { name: "خەیاڵی", tag: "خەیاڵی" },
  { name: "زنجیرە", tag: "زنجیرە" },
  { name: "کوردستان", tag: "کوردستان" },
];

const genresCol = () => collection(db, GENRES_COLLECTION);

/** Ensure the client has a Firebase Auth session so the "request.auth != null"
 *  genre write rule passes. The admin login is localStorage-based (no Firebase
 *  custom-claim token), so for admin sessions with no real Firebase user we fall
 *  back to an anonymous sign-in. Never replaces an existing signed-in user. */
export async function ensureGenreWriteAuth(): Promise<void> {
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  } catch (err) {
    console.warn("[Genres] Anonymous auth fallback failed:", err);
  }
}

/** Real-time subscription to the genres collection (ordered for the nav). */
export function subscribeGenres(cb: (genres: Genre[]) => void): () => void {
  const q = query(genresCol(), orderBy("sortOrder", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const list: Genre[] = [];
      snap.forEach((d) => {
        const data = d.data() as Omit<Genre, "id">;
        list.push({ id: d.id, ...data });
      });
      cb(list);
    },
    (err) => {
      console.warn("[Genres] Real-time subscription error:", err);
    },
  );
}

/** One-time fetch (used by admin movie form dropdowns). */
export async function fetchGenres(): Promise<Genre[]> {
  const q = query(genresCol(), orderBy("sortOrder", "asc"));
  const snap = await getDocs(q);
  const list: Genre[] = [];
  snap.forEach((d) => {
    const data = d.data() as Omit<Genre, "id">;
    list.push({ id: d.id, ...data });
  });
  return list;
}

/** Plain genre names (strings) for legacy dropdowns. */
export async function fetchGenreNames(): Promise<string[]> {
  const genres = await fetchGenres();
  return genres.map((g) => g.name);
}

/** True when the default catalog has already been seeded into Firestore. */
export async function isSeeded(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, GENRES_COLLECTION, META_DOC));
    return snap.exists();
  } catch {
    return false;
  }
}

/** Idempotent, race-safe best-effort seed of DEFAULT_GENRES. Uses a transaction
 *  on the _meta marker so concurrent visitors can never create duplicates. Fails
 *  silently if the rules deny writes (only an admin can persist the seed). */
export async function seedDefaultGenres(): Promise<void> {
  try {
    // Admin-only path: make sure we can actually write (anonymous sign-in).
    await ensureGenreWriteAuth();
    await runTransaction(db, async (tx) => {
      const metaRef = doc(db, GENRES_COLLECTION, META_DOC);
      const meta = await tx.get(metaRef);
      if (meta.exists()) return;
      let order = 0;
      for (const g of DEFAULT_GENRES) {
        tx.set(doc(genresCol()), {
          name: g.name,
          tag: g.tag,
          sortOrder: ++order,
          createdAt: serverTimestamp(),
          createdBy: "system",
        });
      }
      tx.set(metaRef, { seeded: true, seededAt: serverTimestamp() });
    });
    console.log("[Genres] Default genres seeded into Firestore.");
  } catch (err) {
    console.warn("[Genres] Seed skipped (no write permission or offline):", err);
  }
}

/**
 * Add a new genre with full validation. Throws a user-friendly Kurdish message
 * on any invalid input so the admin UI can display it safely.
 */
export async function addGenre(
  rawName: string,
  adminName: string,
): Promise<Genre> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) {
    throw new Error("ناوی پۆلێن پێویستە");
  }
  if (name.length > 50) {
    throw new Error("ناوی پۆلێن زۆر درێژە (زۆرترین ٥٠ پیت)");
  }
  // Reject characters that would break doc IDs / queries
  if (!/^[\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9 _-]+$/.test(name)) {
    throw new Error("ناوی پۆلێن تەنها پیت و ژمارە و بۆشایی پەسەندە");
  }

  // Ensure we are authenticated so the Firestore write is not denied.
  await ensureGenreWriteAuth();

  const existing = await getDocs(query(genresCol(), where("tag", "==", name)));
  if (!existing.empty) {
    throw new Error("ئەم پۆلێنە پێشتر هەبووە");
  }

  const all = await getDocs(genresCol());
  let maxOrder = 0;
  all.forEach((d) => {
    const o = d.data().sortOrder as number | undefined;
    if (typeof o === "number" && o > maxOrder) maxOrder = o;
  });

  const docRef = doc(genresCol());
  const payload = {
    name,
    tag: name,
    sortOrder: maxOrder + 1,
    createdAt: serverTimestamp(),
    createdBy: adminName || "Admin",
  };
  await setDoc(docRef, payload);
  return { id: docRef.id, ...payload } as Genre;
}

/** Delete a genre by its Firestore document id. */
export async function deleteGenre(id: string): Promise<void> {
  await ensureGenreWriteAuth();
  await deleteDoc(doc(genresCol(), id));
}
