import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlayerAds, parsePlayerAds, PlayerAdClock } from './playerAds';
import { createPlayerAdsStore, playerAdsAdminHandler } from '../../server/playerAds';

const config = () => ({ ...defaultPlayerAds(), enabled: true, intervalSeconds: 60, durationSeconds: 3, items: [
  { kind: 'image' as const, url: 'https://example.com/a.jpg', enabled: true },
  { kind: 'video' as const, url: 'https://example.com/b.mp4', enabled: true },
] });
test('ads default off; strict media, limits and no executable/embed URLs', () => {
  assert.equal(defaultPlayerAds().enabled, false);
  assert.deepEqual(parsePlayerAds(config()), config());
  for (const url of ['javascript:alert(1)', 'http://example.com/a.jpg', 'https://example.com/embed', 'https://user:pass@example.com/a.jpg', 'https://example.com/a.svg']) {
    assert.throws(() => parsePlayerAds({ ...config(), items: [{ kind: 'image', url, enabled: true }] }));
  }
  assert.throws(() => parsePlayerAds({ ...config(), items: Array(7).fill(config().items[0]) }));
  assert.throws(() => parsePlayerAds({ ...config(), intervalSeconds: 0 }));
  assert.throws(() => parsePlayerAds({ ...config(), durationSeconds: 99 }));
  assert.throws(() => parsePlayerAds({ ...config(), items: [] }));
});
test('clock rotates, closes, pauses and ignores background gaps and seeks', () => {
  const clock = new PlayerAdClock(config());
  for (let i = 0; i < 59; i++) assert.equal(clock.tick(1, true), -1);
  for (let i = 0; i < 200; i++) assert.equal(clock.tick(1, false), -1);
  assert.equal(clock.tick(1, true), 0);
  clock.tick(1, false); assert.equal(clock.elapsed, 0);
  for (let i = 0; i < 3; i++) clock.tick(1, true);
  assert.equal(clock.visible, -1);
  clock.tick(10000, true); assert.equal(clock.elapsed, 1);
  for (let i = 0; i < 59; i++) clock.tick(1, true);
  assert.equal(clock.visible, 1);
  clock.dismiss(); assert.equal(clock.visible, -1); assert.equal(clock.elapsed, 0);
});
test('all six slots rotate; disabled ads never display', () => {
  const value = config(); value.items = Array(6).fill(value.items[0]);
  const clock = new PlayerAdClock(value);
  for (let slot = 0; slot < 8; slot++) {
    for (let i = 0; i < 60; i++) clock.tick(1, true);
    assert.equal(clock.visible, slot % 6); clock.dismiss();
  }
  const off = new PlayerAdClock(defaultPlayerAds());
  for (let i = 0; i < 1000; i++) off.tick(1, true);
  assert.equal(off.visible, -1);
});
test('one shared read, durable reload, and failed saves preserve config', async () => {
  let saved: unknown, reads = 0, fail = false;
  const storage = { read: async () => { reads++; return saved; }, write: async (value: unknown) => { if (fail) throw Error('offline'); saved = value; } };
  const store = createPlayerAdsStore(storage);
  await Promise.all([store.load(), store.load()]); assert.equal(reads, 1);
  await store.save(config(), 'owner');
  const restart = createPlayerAdsStore(storage); await restart.load(); assert.deepEqual(restart.get(), config());
  fail = true;
  await assert.rejects(store.save(defaultPlayerAds(), 'owner'));
  assert.deepEqual(store.get(), config());
  const clone = store.get(); clone.enabled = false; assert.equal(store.get().enabled, true);
});
test('admin routes reject unsigned callers, invalid payloads and unavailable persistence', async () => {
  const store = createPlayerAdsStore({ read: async () => null, write: async () => { throw Error('offline'); } });
  const invoke = async (auth: string | null, body: unknown) => {
    let status = 200, data: any;
    const res = { setHeader() {}, status(value: number) { status = value; return this; }, json(value: unknown) { data = value; return this; } };
    await playerAdsAdminHandler(store, () => auth)({ method: 'PUT', body } as any, res as any);
    return { status, data };
  };
  assert.equal((await invoke(null, config())).status, 401);
  assert.equal((await invoke('owner', {})).status, 400);
  assert.equal((await invoke('owner', config())).status, 503);
});

test('late storage read cannot overwrite an administrator save', async () => {
  let finish!: (value: unknown) => void;
  const store = createPlayerAdsStore({ read: () => new Promise(resolve => { finish = resolve; }), write: async () => {} });
  const loading = store.load();
  await store.save(config(), 'owner');
  finish(defaultPlayerAds()); await loading;
  assert.deepEqual(store.get(), config());
});

test('protected HTTP endpoint saves and reloads settings; a name header is not proof', async t => {
  const { default: express } = await import('express');
  let durable: unknown;
  const store = createPlayerAdsStore({ read: async () => durable, write: async value => { durable = value; } });
  const app = express(); app.use(express.json());
  const handler = playerAdsAdminHandler(store, req => req.headers.cookie === 'signed-owner-proof' ? 'owner' : null);
  app.get('/ads', handler); app.put('/ads', handler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${(server.address() as any).port}/ads`;
  const headers = { 'Content-Type': 'application/json', 'X-Admin-Username': 'owner' };
  assert.equal((await fetch(url, { headers })).status, 401);
  assert.equal((await fetch(url, { method: 'PUT', headers, body: JSON.stringify(config()) })).status, 401);
  const signed = { ...headers, Cookie: 'signed-owner-proof' };
  assert.equal((await fetch(url, { method: 'PUT', headers: signed, body: JSON.stringify(config()) })).status, 200);
  assert.deepEqual(await (await fetch(url, { headers: signed })).json(), config());
  assert.deepEqual(durable, config());
});
