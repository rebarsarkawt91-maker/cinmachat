import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCatalog } from './sessionCatalog';

const fixture = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } } as Storage;
};

test('parallel consumers, rerenders and session reload use one catalog read', async () => {
  const storage = fixture();
  const cache = createSessionCatalog('catalog', () => storage);
  let reads = 0;
  const load = async () => { reads++; return [{ id: 'movie', title: 'Film' }]; };
  await Promise.all([cache.load(load), cache.load(load)]);
  await cache.load(load);
  await createSessionCatalog('catalog', () => storage).load(load);
  assert.equal(reads, 1);
  await cache.load(load, true);
  assert.equal(reads, 2, 'explicit refresh is allowed');
});

test('quota errors do not trigger repeat reads on remount or reload', async () => {
  const storage = fixture();
  const cache = createSessionCatalog('catalog', () => storage);
  let reads = 0;
  const load = async () => { reads++; throw new Error('quota exceeded'); };
  await assert.rejects(cache.load(load));
  assert.deepEqual(await cache.load(load), []);
  assert.deepEqual(await createSessionCatalog('catalog', () => storage).load(load), []);
  assert.equal(reads, 1);
});

test('explicit mutation refresh waits for the old startup request then fetches new data', async () => {
  const cache = createSessionCatalog('catalog', () => fixture());
  let finish!: (movies: any[]) => void;
  const startup = cache.load(() => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  const refreshed = cache.load(async () => [{ id: 'new' }], true);
  finish([{ id: 'old' }]);
  await startup;
  assert.deepEqual(await refreshed, [{ id: 'new' }]);
});

test('storage failure still deduplicates in memory and large captions are deferred', async () => {
  const storage = fixture();
  const cache = createSessionCatalog('catalog', () => storage);
  const original = [{ id: 'movie', subtitleText: 'x'.repeat(10000) }];
  assert.equal((await cache.load(async () => original))[0].subtitleText.length, 10000);
  const reloaded = await createSessionCatalog('catalog', () => storage).load(async () => []);
  assert.equal(reloaded[0].__catalogDetailsRequired, true);
  assert.equal(reloaded[0].subtitleText, '');
  let reads = 0;
  const unavailable = createSessionCatalog('private', () => { throw new Error('disabled'); });
  await unavailable.load(async () => { reads++; return original; });
  await unavailable.load(async () => { reads++; return []; });
  assert.equal(reads, 1);
});
