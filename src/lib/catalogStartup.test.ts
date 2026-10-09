import test from 'node:test';
import assert from 'node:assert/strict';
import { firstCatalog } from './catalogStartup';

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
