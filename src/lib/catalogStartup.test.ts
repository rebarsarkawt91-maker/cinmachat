import test from 'node:test';
import assert from 'node:assert/strict';
import { firstCatalog, retryCatalog } from './catalogStartup';

test('slow API does not hold cards and its eventual response refreshes the snapshot', async () => {
  let complete!: (movies: any[]) => void;
  const fresh = new Promise<any[]>(resolve => { complete = resolve; });
  const seed = [{ id: 'seed', title: 'Saved movie' }];
  const updates: any[][] = [];
  assert.deepEqual(await firstCatalog(fresh, Promise.resolve(seed), movies => updates.push(movies)), seed);
  const newest = [{ id: 'live', title: 'New movie' }];
  complete(newest);
  await fresh;
  assert.deepEqual(updates, [newest]);
});
test('live movies take precedence when ready and source failures are contained', async () => {
  const live = [{ id: 'live', title: 'Live movie' }];
  assert.deepEqual(await firstCatalog(Promise.resolve(live), Promise.reject(new Error('offline snapshot')), () => {}), live);
  assert.deepEqual(await firstCatalog(Promise.reject(new Error('API offline')), Promise.resolve([]), () => {}), []);
});

test('old 51-film snapshot is replaced after timeout and an empty retry', async () => {
  let calls = 0;
  const fresh = retryCatalog(async () => {
    calls++;
    if (calls === 1) throw new Error('timeout');
    return calls === 2 ? [] : Array.from({ length: 83 }, (_, id) => ({ id: `live-${id}`, title: 'Live movie' }));
  }, 3, async () => {});
  let updated = 0;
  const seed = Array.from({ length: 51 }, (_, id) => ({ id: `old-${id}`, title: 'Old movie' }));
  await firstCatalog(fresh, Promise.resolve(seed), movies => { updated = movies.length; });
  await fresh;
  assert.equal(calls, 3);
  assert.equal(updated, 83);
});

test('offline retries are bounded', async () => {
  let calls = 0;
  assert.deepEqual(await retryCatalog(async () => { calls++; throw new Error('offline'); }, 3, async () => {}), []);
  assert.equal(calls, 3);
});
