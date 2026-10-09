export const API_CATALOG_SESSION_KEY = 'cinemachat:api-catalog-session:v1';
export const FIRESTORE_CATALOG_SESSION_KEY = 'cinemachat:firestore-catalog-session:v1';

/** A tab/session shares one request, including failures, until explicitly refreshed. */
export function createSessionCatalog(key: string, storage = () => sessionStorage) {
  let value: any[] | undefined;
  let pending: Promise<any[]> | undefined;
  let attempted = false;
  const read = () => {
    if (attempted) return;
    try {
      const saved = JSON.parse(storage().getItem(key) || 'null');
      if (saved?.version === 1 && Array.isArray(saved.results)) {
        value = saved.results;
        attempted = true;
      }
    } catch { /* Storage may be unavailable in private browsing. */ }
  };
  const remember = (movies: any[]) => {
    value = movies;
    attempted = true;
    try {
      // Heavy inline captions remain in memory; details are fetched on demand
      // after a reload. This prevents a film subtitle from exhausting storage.
      const results = movies.map(movie => {
        if (typeof movie.subtitleText !== 'string' || movie.subtitleText.length < 2000) return movie;
        return { ...movie, subtitleText: '', __catalogDetailsRequired: true };
      });
      storage().setItem(key, JSON.stringify({ version: 1, results }));
    } catch { /* In-memory sharing still works if storage is full/disabled. */ }
    return movies;
  };
  return {
    remember,
    async load(loader: () => Promise<any[]>, force = false): Promise<any[]> {
      read();
      if (pending) {
        if (!force) return pending;
        // A mutation that finishes during startup must refresh AFTER that old
        // request, otherwise the new post could be hidden by its stale result.
        await pending.catch(() => []);
        return this.load(loader, true);
      }
      if (attempted && !force) return value || [];
      attempted = true;
      // Persist the attempt before networking so failures/reloads cannot create
      // a quota-error retry storm. An explicit refresh may try again.
      if (!value) remember([]);
      pending = Promise.resolve().then(loader).then(movies => remember(movies)).catch(error => {
        remember(value || []);
        throw error;
      }).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
