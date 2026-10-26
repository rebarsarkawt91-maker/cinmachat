import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlayerAds, defaultPlayerTextAd, inferPlayerAdKind, parsePlayerAds, playerAdYouTubeId, playerTextAds, PlayerAdClock, PlayerTextAdClock } from './playerAds';
import { createPlayerAdsStore, playerAdsAdminHandler } from '../../server/playerAds';

const config = () => ({ ...defaultPlayerAds(), enabled: true, intervalSeconds: 60, durationSeconds: 3, items: [
  { kind: 'image' as const, url: 'https://example.com/a.jpg', enabled: true },
  { kind: 'video' as const, url: 'https://example.com/b.mp4', enabled: true },
] });
test('direct video and image links automatically select the correct media type', () => {
  assert.equal(inferPlayerAdKind('https://example.com/ad.mp4?token=abc', 'image'), 'video');
  assert.equal(inferPlayerAdKind('https://example.com/ad.WEBM', 'image'), 'video');
  assert.equal(inferPlayerAdKind('https://example.com/ad.webp', 'video'), 'image');
  assert.equal(inferPlayerAdKind('https://', 'video'), 'video');
});
test('the reported YouTube link is accepted as video, normalized and restricted to trusted hosts', () => {
  const url = 'https://youtu.be/uO4wsV7HEUY?si=Aw1g3IRSVDmN8d9n';
  assert.equal(playerAdYouTubeId(url), 'uO4wsV7HEUY');
  assert.equal(inferPlayerAdKind(url, 'image'), 'video');
  assert.equal(parsePlayerAds({ ...config(), items: [{ kind: 'video', url, enabled: true }] }).items[0].url, 'https://www.youtube.com/watch?v=uO4wsV7HEUY');
  for (const bad of ['https://youtube.com.evil.test/watch?v=uO4wsV7HEUY', 'https://evil.test/embed/uO4wsV7HEUY', 'https://user:pass@youtu.be/uO4wsV7HEUY', 'https://youtu.be/invalid']) {
    assert.equal(playerAdYouTubeId(bad), null);
    assert.throws(() => parsePlayerAds({ ...config(), items: [{ kind: 'video', url: bad, enabled: true }] }));
  }
});
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

test('failed reads are reported instead of showing an empty saved list, and can be retried', async () => {
  let fail = true;
  const store = createPlayerAdsStore({ read: async () => { if (fail) throw Error('offline'); return config(); }, write: async () => {} });
  let status = 200, body: any;
  const response = { setHeader() {}, status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
  await playerAdsAdminHandler(store, () => 'owner')({ method: 'GET' } as any, response as any);
  assert.equal(status, 503); assert.ok(body.error);
  fail = false; status = 200;
  await playerAdsAdminHandler(store, () => 'owner')({ method: 'GET' } as any, response as any);
  assert.equal(status, 200); assert.deepEqual(body, config());
});

test('old video configurations migrate without changing their existing ads', () => {
  const { textAd, ...legacy } = config();
  const migrated = parsePlayerAds(legacy);
  assert.deepEqual(migrated.items, legacy.items);
  assert.equal(migrated.enabled, true);
  assert.equal(migrated.textAd.enabled, false);
  assert.equal(migrated.textAd.text, '');
});

test('text-only ads accept Kurdish, reject unsafe colors and enforce text/timing limits', () => {
  const value = { ...defaultPlayerAds(), textAd: { ...defaultPlayerAds().textAd, enabled: true, text: 'بەخێربێن بۆ سینەماچات', color: '#00ff88' } };
  assert.equal(parsePlayerAds(value).textAd.text, value.textAd.text);
  for (const patch of [{ text: '' }, { text: 'a'.repeat(301) }, { color: 'red;background:url(x)' }, { color: 'url(javascript:alert(1))' }, { intervalSeconds: 0 }, { durationSeconds: 60 }]) {
    assert.throws(() => parsePlayerAds({ ...value, textAd: { ...value.textAd, ...patch } }));
  }
});

test('text and color persist across reloads; deleting text preserves saved video ads', async () => {
  let durable: unknown;
  const storage = { read: async () => durable, write: async (value: unknown) => { durable = value; } };
  const value = { ...config(), textAd: { ...defaultPlayerAds().textAd, enabled: true, text: 'ڕیکلامی تێکست', color: '#abcdef' } };
  const store = createPlayerAdsStore(storage); await store.save(value, 'owner');
  const restart = createPlayerAdsStore(storage); await restart.load(); assert.deepEqual(restart.get(), value);
  const { textAd, ...oldClient } = value;
  await restart.save(oldClient, 'owner');
  assert.deepEqual(restart.get().textAd, value.textAd);
  await restart.save({ ...restart.get(), textAd: { ...value.textAd, enabled: false, text: '' } }, 'owner');
  assert.deepEqual(restart.get().items, value.items);
  assert.equal(restart.get().enabled, true);
});

test('a concurrent save from an older tab cannot overwrite a newly saved text message', async () => {
  const store = createPlayerAdsStore({ read: async () => null, write: async () => {} });
  const value = { ...config(), textAd: { ...defaultPlayerAds().textAd, text: 'نووسینی نوێ', enabled: true } };
  const { textAd, ...legacy } = config();
  await Promise.all([store.save(value, 'owner'), store.save(legacy, 'owner')]);
  assert.equal(store.get().textAd.text, 'نووسینی نوێ');
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

test('two-minute and twenty-minute messages keep independent schedules and pause with the film', () => {
  const messages = [120, 1200].map((intervalSeconds, i) => ({ ...defaultPlayerTextAd(), text: `message ${i}`, enabled: true, intervalSeconds, durationSeconds: 3 }));
  const clock = new PlayerTextAdClock(messages);
  for (let i = 0; i < 500; i++) clock.tick(1, false, true);
  assert.equal(clock.visible, -1);
  const seen: [number, number][] = [];
  for (let second = 1; second <= 1200; second++) {
    const before = clock.visible;
    const active = clock.tick(1, true, true);
    if (active >= 0 && before !== active) seen.push([second, active]);
  }
  assert.deepEqual(seen[0], [120, 0]);
  assert.deepEqual(seen.find(([, index]) => index === 1), [1200, 1]);
  clock.tick(1000, false, true); assert.equal(clock.visible, 1);
  clock.dismiss(); assert.equal(clock.visible, -1);
});

test('due texts queue behind media and each other without losing their own interval', () => {
  const clock = new PlayerTextAdClock([0, 1, 2].map(i => ({ ...defaultPlayerTextAd(), text: String(i), enabled: i < 2, intervalSeconds: 60, durationSeconds: 3 })));
  for (let i = 0; i < 70; i++) clock.tick(1, true, false);
  assert.equal(clock.visible, -1);
  assert.equal(clock.tick(0, true, true), 0);
  clock.dismiss(); assert.equal(clock.tick(0, true, true), 1);
  for (let i = 0; i < 3; i++) clock.tick(1, true, true);
  assert.equal(clock.visible, -1);
  clock.tick(10000, true, true); assert.equal(clock.visible, -1);
});

test('multiple texts, four sizes and old-tab saves survive durable reload and targeted deletion', async () => {
  let durable: unknown;
  const storage = { read: async () => durable, write: async (value: unknown) => { durable = value; } };
  const texts = [120, 1200].map(intervalSeconds => ({ ...defaultPlayerTextAd(), enabled: true, text: 'ڕیکلام', intervalSeconds }));
  const input = { ...config(), items: config().items.map(item => ({ ...item, size: 4 as const })), textAds: texts };
  const store = createPlayerAdsStore(storage); await store.save(input, 'owner');
  const restart = createPlayerAdsStore(storage); await restart.load();
  assert.deepEqual(playerTextAds(restart.get()), texts);
  await restart.save({ ...config(), textAd: { ...texts[0], text: 'گۆڕانکاریی کۆن' } }, 'owner');
  assert.equal(restart.get().textAds?.[1].intervalSeconds, 1200);
  assert.equal(restart.get().items[0].size, 4);
  await restart.save({ ...restart.get(), textAds: texts.slice(1) }, 'owner');
  assert.equal(playerTextAds(restart.get()).length, 1);
  assert.deepEqual(restart.get().items, input.items);
  await restart.save({ ...restart.get(), textAds: [] }, 'owner');
  assert.deepEqual(playerTextAds(restart.get()), []);
  for (const size of [1, 2, 3, 4]) assert.equal(parsePlayerAds({ ...config(), items: [{ ...config().items[0], size }] }).items[0].size, size);
  assert.throws(() => parsePlayerAds({ ...config(), items: [{ ...config().items[0], size: 5 }] }));
  assert.throws(() => parsePlayerAds({ ...config(), textAds: Array(101).fill(texts[0]) }));
  assert.throws(() => parsePlayerAds({ ...config(), textAds: [{ ...texts[0], color: 'red' }] }));
});
