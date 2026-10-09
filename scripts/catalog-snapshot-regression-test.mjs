import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import assert from 'node:assert/strict';
const source = await readFile('src/App.tsx', 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const code = extract('  const buildAuthoritativeCatalog =', '  // Guard so the 60s refresh') +
  extract('  const applyAuthoritativeCatalogSnapshot =', '  const fetchAuthoritativeCatalog =') +
  '\nreturn {applyMovies, applyAuthoritativeCatalogSnapshot};';
let movies = [];
const deps = {
  deletedMovieIdsRef: { current: new Set() }, decodeStoredUrl: x => x,
  setCatalogHydrated: () => {}, setMovies: fn => { movies = fn(movies); },
  mergeMovieLists: (incoming, previous) => [...incoming, ...previous.filter(m => !incoming.some(n => n.id === m.id))],
  getMoviePosterCandidates: () => [], preloadedMoviePosterUrls: new Set(), cacheMovieCatalog: () => {},
  isDramaMovie: () => false, setLockedMovieCount: () => {}, setErrorMsg: () => {},
};
const js = (await transform(`function run(){${code}}`, { loader: 'ts' })).code;
const handlers = new Function(...Object.keys(deps), js + '; return run();')(...Object.values(deps));
handlers.applyMovies([{id:'manual-123',title:'YouTube posted movie'}]);
handlers.applyAuthoritativeCatalogSnapshot({forEach: () => {},docChanges: () => []});
assert.equal(movies.length, 1, 'lagging empty Firestore snapshot must not erase API-confirmed movie');
handlers.applyAuthoritativeCatalogSnapshot({forEach: () => {},docChanges: () => [{type:'removed',doc:{id:'manual-123'}}]});
assert.equal(movies.length, 0, 'explicit removal must delete the movie');
handlers.applyMovies([{id:'manual-123',title:'stale API copy'}]);
assert.equal(movies.length, 0, 'stale API must not resurrect deletion');
console.log('PASS: API post survives lagging Firestore; explicit deletion remains deleted');
