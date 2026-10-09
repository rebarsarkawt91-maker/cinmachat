function usable(movies: unknown): movies is any[] {
  return Array.isArray(movies) && movies.some(movie => movie?.id && movie.id !== 'hero-promo' && String(movie.title || '').trim());
}

/** Recover a timed-out mobile request without leaving the old snapshot permanent. */
export async function retryCatalog(load: () => Promise<any[]>, attempts = 3, wait = () => new Promise<void>(resolve => setTimeout(resolve, 2000))): Promise<any[]> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const movies = await load();
      if (usable(movies)) return movies;
    } catch { /* Transient network errors must not terminate background recovery. */ }
    if (attempt + 1 < attempts) await wait();
  }
  return [];
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
