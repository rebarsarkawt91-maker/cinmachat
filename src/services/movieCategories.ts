/**
 * Canonical shared Movie Category service — the ONE source of truth used by:
 *   1. The homepage movie-category filter chip row (App.tsx)
 *   2. The Admin Post-Movie form "پۆلێن (Category)" selector (App.tsx ContentModule)
 *   3. The Admin Edit-Movie modal category chips (components/Admin/MovieEditModal.tsx)
 *
 * Storage: the Firestore `genres` collection (the same collection the admin
 * Genre panel and the main nav already use), so a category added anywhere —
 * homepage "+" button, admin Genre panel, another device — appears everywhere
 * in real time through the live subscriptions.
 *
 *   genres/{autoId} = { name (Kurdish label), tag (English key/slug),
 *                       sortOrder, createdAt, createdBy }
 *
 * "All" (هەمووی) is a built-in view only — it is NEVER saved as a category.
 * Old movies keep working: every match is normalized (trim + lowercase), and
 * a record whose category only lives in the `category` field still filters.
 */
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  DEFAULT_GENRES,
  fetchGenres,
  subscribeGenres,
  type Genre,
} from "./genres";

export interface MovieCategory {
  /** English key/slug — the value saved on the movie record (tags/category). */
  key: string;
  /** Kurdish label shown on the chips. */
  label: string;
  sortOrder: number;
  id?: string;
}

/** Built-in "All" filter key — never persisted, never selectable as a category. */
export const ALL_CATEGORY_KEY = "all";

/**
 * Normalize a category value for matching/storage: trim, collapse inner
 * whitespace, lowercase. Used on BOTH sides of every comparison so existing
 * movies with legacy values (" ئاکشن ", "ACTION") keep filtering correctly.
 */
export function normalizeCategoryKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Turn free text into a safe English key/slug (lowercase, dashes). */
export function slugifyCategoryKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

const fromGenre = (g: Genre): MovieCategory => ({
  id: g.id,
  key: g.tag,
  label: g.name,
  sortOrder: typeof g.sortOrder === "number" ? g.sortOrder : 0,
});

/** Built-in fallback catalog (also the duplicate-check baseline). */
export function defaultMovieCategories(): MovieCategory[] {
  return DEFAULT_GENRES.map((g, i) => ({
    id: `_default_${i}`,
    key: g.tag,
    label: g.name,
    sortOrder: i + 1,
  }));
}

/** Real-time subscription — the canonical live list for every consumer. */
export function subscribeMovieCategories(
  cb: (categories: MovieCategory[]) => void,
): () => void {
  return subscribeGenres((list) => cb(list.map(fromGenre)));
}

/** One-time fetch of the canonical list. */
export async function fetchMovieCategories(): Promise<MovieCategory[]> {
  const list = await fetchGenres();
  return list.map(fromGenre);
}

/**
 * The raw category values stored on a movie record (the `category` field and
 * its primary/first tag), trimmed and de-duplicated — normalized matching is
 * done separately so legacy records remain usable.
 */
export function moviePrimaryCategories(movie: any): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    const raw = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    values.push(raw);
  };
  push(movie?.category);
  if (Array.isArray(movie?.tags) && movie.tags.length > 0) push(movie.tags[0]);
  return values;
}

/**
 * Does a movie belong to a category chip? Matches normalized tags first, then
 * falls back to the record's own `category` field so old movies whose tags
 * were never seeded still appear under their category.
 */
export function movieMatchesCategory(movie: any, key: string): boolean {
  if (!key || normalizeCategoryKey(key) === ALL_CATEGORY_KEY) return true;
  const target = normalizeCategoryKey(key);
  const tags = Array.isArray(movie?.tags) ? movie.tags : [];
  if (tags.some((t: unknown) => normalizeCategoryKey(t) === target)) return true;
  return normalizeCategoryKey(movie?.category) === target;
}

/**
 * Admin: create a category with a Kurdish label + English key/slug.
 * Validates (non-empty, length, slug shape), prevents duplicates (against the
 * live Firestore list AND the built-in defaults, comparing key AND label,
 * case-insensitive) and persists to Firestore so every client sees it instantly.
 * Throws Kurdish error messages for the small add-category UI.
 */
export async function addMovieCategory(
  rawLabel: string,
  rawKey: string,
  adminName: string,
): Promise<MovieCategory> {
  const label = String(rawLabel ?? "").trim().replace(/\s+/g, " ");
  const key = slugifyCategoryKey(rawKey);
  if (!label) throw new Error("ناوی پۆلێن (کوردی) پێویستە");
  if (label.length > 50) {
    throw new Error("ناوی پۆلێن زۆر درێژە (زۆرترین ٥٠ پیت)");
  }
  if (!key) {
    throw new Error("کلیلی ئینگلیزی (slug) پێویستە — بە پیتە ئینگلیزییەکان بنووسە");
  }

  const snap = await getDocs(collection(db, "genres"));
  const knownKeys = new Set<string>([ALL_CATEGORY_KEY]);
  const knownLabels = new Set<string>();
  let maxOrder = 0;
  const track = (k: string, l: string, order: unknown) => {
    knownKeys.add(normalizeCategoryKey(k));
    knownLabels.add(normalizeCategoryKey(l));
    if (typeof order === "number" && order > maxOrder) maxOrder = order;
  };
  defaultMovieCategories().forEach((c) => track(c.key, c.label, c.sortOrder));
  snap.forEach((d) => {
    const data = d.data() as Genre;
    track(data.tag, data.name, data.sortOrder);
  });

  if (knownKeys.has(normalizeCategoryKey(key))) {
    throw new Error("ئەم کلیلی پۆلێنە پێشتر هەیە");
  }
  if (knownLabels.has(normalizeCategoryKey(label))) {
    throw new Error("ئەم پۆلێنە پێشتر هەیە");
  }

  const payload = {
    name: label,
    tag: key,
    sortOrder: maxOrder + 1,
    createdAt: serverTimestamp(),
    createdBy: adminName || "Admin",
  };
  const docRef = doc(collection(db, "genres"));
  await setDoc(docRef, payload);
  return { id: docRef.id, key, label, sortOrder: payload.sortOrder };
}
