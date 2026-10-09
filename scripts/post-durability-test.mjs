import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';

// Execute the real route with isolated fake stores; never publish test movies.
const source = await readFile('server.ts', 'utf8');
const start = source.indexOf("  app.post('/api/admin/post-movie', async (req, res) => {");
const end = source.indexOf('\n  // CRITICAL: WhatsApp', start);
const route = source.slice(start, end);
const code = (await transform(route, { loader: 'ts' })).code;
for (const unavailable of [true, false]) {
  let handler, stored = false, notified = false, status = 200, payload;
  const db = { manualMovies: [] };
  const deps = {
    app: { post: (_path, fn) => { handler = fn; } }, db,
    sanitizeUrl: x => x, decodeStoredUrl: x => x, looksLikeSubtitleText: () => false,
    initializeFirebaseAdmin: () => ({}),
    admin: { firestore: () => ({ collection: () => ({ doc: () => ({ set: async movie => {
      if (unavailable) throw new Error('store unavailable');
      assert.equal(movie.postType, 'YouTube'); stored = true;
    } }) }) }) }, firestoreMoviesCache: {},
    addAuditLog: async () => {}, saveDB: async () => {},
    pushService: { notifyPublishedMovie: () => { assert.ok(stored); notified = true; } },
    setMoviesCache: () => {}, dispatchKurdishSubtitleJob: () => {},
  };
  new Function(...Object.keys(deps), code)(...Object.values(deps));
  await handler({ body: { title: 'test', category: 'test', videoUrl: 'https://www.youtube.com/watch?v=0P6B6nE45EQ', postType: 'YouTube' } }, {
    status: function (s) { status = s; return this; }, json: value => { payload = value; }
  });
  assert.equal(status, unavailable ? 503 : 200);
  assert.equal(payload.success, !unavailable);
  assert.equal(db.manualMovies.length, unavailable ? 0 : 1);
  assert.equal(notified, !unavailable);
}
console.log('PASS: publish requires durable save; failed storage never publishes or sends a notification');
