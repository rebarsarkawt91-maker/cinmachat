function usable(movies: unknown): movies is any[] {
  return Array.isArray(movies) && movies.some(movie => movie?.id && movie.id !== 'hero-promo' && String(movie.title || '').trim());
}

/** Paint the first usable source, then deliver fresh live results in background. */
export async function firstCatalog(fresh: Promise<any[]>, fallback: Promise<any[]>, onFresh: (movies: any[]) => void): Promise<any[]> {
  const live = fresh.then(movies => {
    if (!usable(movies)) throw new Error('No live catalog');
    onFresh(movies);
    return movies;
  });
  const seed = fallback.then(movies => {
    if (!usable(movies)) throw new Error('No catalog snapshot');
    return movies;
  });
  try { return await Promise.any([live, seed]); }
  catch { return []; }
}
