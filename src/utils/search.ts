/**
 * Shared search + trending scoring utilities used by the smart search system.
 * Mirrors the server-side algorithm (server.ts) so Firestore-only movies get
 * identical fuzzy/trending behavior even though the backend only holds the
 * server movie cache.
 */
import type { Movie } from "../types";

/** Normalize a search string for fuzzy matching (case + whitespace folding). */
export function normalizeSearch(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Damerau-Levenshtein distance (typo-tolerant matching). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev[j - 2] + 1);
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/** Score a movie against a fuzzy query (0 = no match, higher = stronger). */
export function fuzzyMatchMovie(movie: Movie, query: string): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const title = normalizeSearch(String(movie?.title || ""));
  const tags = (Array.isArray(movie?.tags) ? movie.tags : [])
    .concat(movie?.category ? [movie.category] : [])
    .map((t: any) => normalizeSearch(String(t)))
    .filter(Boolean);
  const description = normalizeSearch(String(movie?.description || ""));

  if (!title && tags.length === 0) return 0;

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 70;

  const titleWords = title.split(" ");
  if (titleWords.some((w) => w === q)) return 65;
  if (titleWords.some((w) => w.startsWith(q))) return 55;

  const titleDist = editDistance(title, q);
  if (q.length >= 4 && titleDist <= Math.max(1, Math.floor(q.length * 0.25))) return 50;

  if (tags.some((t) => t === q || t.startsWith(q) || t.includes(q))) return 60;
  if (tags.some((t) => {
    const d = editDistance(t, q);
    return q.length >= 3 && d <= Math.max(1, Math.floor(q.length * 0.3));
  })) return 45;

  if (q.length >= 5 && description.includes(q)) return 35;

  const tokens = q.split(" ").filter((t) => t.length >= 2);
  if (tokens.length > 1 && tokens.every((t) => title.includes(t))) return 75;
  if (tokens.length > 1 && tokens.some((t) => title.includes(t))) return 30;

  return 0;
}

/** True when a movie's tags/category match at least one selected genre. */
export function movieMatchesGenres(movie: Movie, genres: string[]): boolean {
  if (!genres || genres.length === 0) return true;
  const movieTags = (Array.isArray(movie.tags) ? movie.tags : [])
    .concat(movie.category ? [movie.category] : [])
    .map((t: any) => normalizeSearch(String(t)));
  const wanted = genres.map((g) => normalizeSearch(g)).filter(Boolean);
  if (wanted.length === 0) return true;
  return movieTags.some((t) => wanted.some((w) => t === w || t.includes(w)));
}

export interface SemanticSignals {
  keywords: string[];
  genres: string[];
  titles: string[];
}

/** Score a movie against AI-extracted semantic signals (keywords/genres/titles). */
export function semanticScoreMovie(movie: Movie, signals: SemanticSignals): number {
  const title = normalizeSearch(String(movie?.title || ""));
  const description = normalizeSearch(String(movie?.description || ""));
  const tags = (Array.isArray(movie?.tags) ? movie.tags : [])
    .concat(movie?.category ? [movie.category] : [])
    .map((t: any) => normalizeSearch(String(t)));

  let score = 0;
  for (const t of signals.titles || []) {
    const nt = normalizeSearch(t);
    if (nt && title.includes(nt)) score += 60;
  }
  for (const g of signals.genres || []) {
    const ng = normalizeSearch(g);
    if (ng && tags.some((tag) => tag.includes(ng) || ng.includes(tag))) score += 25;
  }
  for (const k of signals.keywords || []) {
    const nk = normalizeSearch(k);
    if (!nk || nk.length < 2) continue;
    if (title.includes(nk)) score += 20;
    if (description.includes(nk)) score += 12;
    if (tags.some((tag) => tag.includes(nk))) score += 10;
  }
  return score;
}

/** Client mirror of the server trending algorithm so every movie (Firestore
 *  ones included) can be ranked consistently. */
export function computeTrendingScore(
  movie: Movie,
  live: number,
  likes: number,
  favoriteCount: number,
): number {
  const normLog = (n: number) =>
    !Number.isFinite(n) || n <= 0 ? 0 : Math.min(1, Math.log1p(n) / Math.log1p(1000));

  const liveBoost = Math.min(1, Math.max(0, live || 0) / 20);
  const likeScore = normLog(likes || 0) * 0.8;
  const favScore = normLog(favoriteCount || 0) * 0.8;
  const viewScore = normLog(Number(movie?.views) || 0) * 0.6;

  let imdbScore = 0;
  const imdb = parseFloat(String(movie?.rating || ""));
  if (Number.isFinite(imdb) && imdb > 0) imdbScore = imdb / 10;

  let recencyBoost = 0;
  if (movie?.date) {
    const ageDays = (Date.now() - new Date(movie.date).getTime()) / 86400000;
    if (Number.isFinite(ageDays) && ageDays >= 0) {
      recencyBoost = Math.max(0, 1 - ageDays / 60) * 0.4;
    }
  }

  return Math.round(
    ((liveBoost * 1.0 + likeScore * 0.9 + favScore * 0.9 + viewScore * 0.6 + imdbScore * 0.8 + recencyBoost) / 4.6) *
      1000,
  ) / 10;
}
