import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBannerImageStore, bannerImageHandler } from './bannerImage';
import { validBannerImage } from '../src/utils/bannerImage';

const original = 'https://example.com/original.png', next = 'https://example.com/next.png';
test('banner validates bounded raster data and HTTPS, rejecting executable or oversized input', () => {
  for (const image of [original, '/uploads/banner.png', '/api/uploads/banner.webp',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVr8AAAAASUVORK5CYII=']) assert.equal(validBannerImage(image), true, image);
  for (const image of ['', null, 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zy8+', 'http://example.com/a.png',
    '//example.com/image.png', '/uploads/../db.json', 'https://user:pass@example.com/a.png',
    'data:image/png;base64,YWJj', 'data:image/png;base64,' + 'AAAA'.repeat(180000)]) assert.equal(validBannerImage(image), false);
});
test('saved image survives a fresh store, while failed writes preserve the original', async () => {
  let durable: unknown = original;
  const storage = { read: async () => durable, write: async (image: string) => { durable = image; } };
  const store = createBannerImageStore(original, storage);
  await store.save(next, 'admin');
  const fresh = createBannerImageStore(original, storage);
  await fresh.load(); assert.equal(fresh.image(), next);
  const failed = createBannerImageStore(original, { ...storage, write: async () => { throw new Error('quota'); } });
  await assert.rejects(failed.save(next, 'admin'));
  assert.equal(failed.image(), original);
});
test('a late startup read cannot overwrite a newly saved banner', async () => {
  let finish!: (value: string) => void;
  const store = createBannerImageStore(original, { read: () => new Promise(resolve => { finish = resolve; }), write: async () => {} });
  const loading = store.load();
  await store.save(next, 'admin'); finish(original); await loading;
  assert.equal(store.image(), next);
});
test('banner route rejects guests and spoofed names, validates data, and fails honestly', async t => {
  let fail = false, saved = '', calls = 0;
  const store = createBannerImageStore(original, { read: async () => null, write: async () => { calls++; if (fail) throw new Error('unavailable'); } });
  const app = express(); app.use(express.json());
  app.put('/banner', bannerImageHandler(store, req => req.headers.cookie === 'signed-proof' ? 'admin' : null, image => { saved = image; }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${(server.address() as any).port}/banner`;
  const put = (image: string, proof = '') => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Username': 'admin', Cookie: proof }, body: JSON.stringify({ imageUrl: image, unrelated: 'ignored' }) });
  assert.equal((await put(next)).status, 401); assert.equal(calls, 0);
  assert.equal((await put('javascript:alert(1)', 'signed-proof')).status, 400); assert.equal(calls, 0);
  const success = await put(next, 'signed-proof'); assert.equal(success.status, 200); assert.equal((await success.json()).image, next); assert.equal(saved, next);
  fail = true; const response = await put(original, 'signed-proof'); assert.equal(response.status, 503);
  assert.equal(store.image(), next); assert.equal(saved, next);
});
