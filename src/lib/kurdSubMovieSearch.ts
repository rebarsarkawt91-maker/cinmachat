type SearchableMovie = { id: string; title: string };

function normalizeMovieTitle(value: string): string {
  return value.normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .toLocaleLowerCase()
    .trim();
}

/** Keep the existing movie order while filtering Kurdish and English titles. */
export function searchKurdSubMovies<T extends SearchableMovie>(movies: T[], query: string, limit = 50): T[] {
  const terms = normalizeMovieTitle(query).split(/\s+/).filter(Boolean);
  return movies.filter((movie) => {
    const title = normalizeMovieTitle(String(movie.title || ""));
    return terms.every((term) => title.includes(term));
  }).slice(0, limit);
}
