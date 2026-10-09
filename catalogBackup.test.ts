import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadCatalogBackup } from './catalogBackup';
import { transform } from 'esbuild';

test('durable public recovery contains the authorized full catalog', () => {
  const records = loadCatalogBackup();
  assert.equal(records.length, 144);
  assert.equal(new Set(records.map(m => m.id)).size, records.length);
  assert.ok(readFileSync('public/catalog-fallback.json').length < 300_000);
  for (const movie of records) {
    assert.ok(movie.title);
    assert.ok(!movie.subtitleText);
    for (const value of [movie.subtitleUrl, movie.image, movie.posterUrl]) {
      if (String(value).startsWith('/catalog-assets/')) assert.ok(existsSync(`public${value}`));
    }
    assert.equal(movie.password, undefined);
    assert.equal(movie.likedBy, undefined);
  }
});

test('missing backup remains a safe empty seed', () => {
  assert.deepEqual(loadCatalogBackup('nonexistent-catalog-root'), []);
});

test('API merge recovers cold starts, respects deletions and gives live records priority', async () => {
  const source = readFileSync('server.ts', 'utf8');
  const start = source.indexOf('const mergeCatalogWithFirestore =');
  const end = source.indexOf('// Drama detection', start);
  const js = (await transform(source.slice(start, end), { loader: 'ts' })).code;
  const merge = new Function('packagedCatalogBackup', 'firestoreMoviesCache', 'decodeStoredUrl', 'extractImdbId', `${js};return mergeCatalogWithFirestore;`)(
    [{ id: 'saved', title: 'Backup', imdbId: 'tt1234567' }, { id: 'deleted', title: 'Deleted' }],
    { saved: { id: 'saved', title: 'Live' } }, (value: string) => value, (movie: any) => movie.imdbId || '',
  );
  assert.deepEqual(merge([], ['deleted']).map((m: any) => m.title), ['Live']);
  const cold = new Function('packagedCatalogBackup', 'firestoreMoviesCache', 'decodeStoredUrl', 'extractImdbId', `${js};return mergeCatalogWithFirestore;`)(loadCatalogBackup(), {}, (v: string) => v, () => '');
  assert.equal(cold([], []).length, 144);
});
