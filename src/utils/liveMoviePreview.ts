/** Only concurrent viewers qualify. Never rank pins by lifetime views/likes. */
export function topLivePreviewIds<T extends { id: string }>(movies: T[], viewers: (movie: T) => number): string[] {
  const seen = new Set<string>();
  return movies.flatMap((movie, index) => {
    if (!movie.id || movie.id === 'hero-promo' || seen.has(movie.id)) return [];
    seen.add(movie.id);
    const count = Math.floor(Number(viewers(movie)));
    return Number.isFinite(count) && count > 0 ? [{ id: movie.id, count, index }] : [];
  }).sort((a, b) => b.count - a.count || a.index - b.index).slice(0, 2).map(movie => movie.id);
}

export const wrapPreviewIndex = (index: number, length: number) => length > 0 ? ((index % length) + length) % length : 0;

/** A bounded window of actual cards, with no duplicate/hidden interactive clones. */
export function livePreviewWindow<T>(movies: T[], head: number, size: number): T[] {
  return Array.from({ length: Math.min(movies.length, Math.max(0, Math.floor(size))) },
    (_, index) => movies[wrapPreviewIndex(head + index, movies.length)]);
}
