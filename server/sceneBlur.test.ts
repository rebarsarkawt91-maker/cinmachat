import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { SceneBlurConfig } from '../src/lib/sceneBlur';
import { createSceneBlurHandlers, sceneBlurAdminUsername, signedSceneBlurAdminUsername } from './sceneBlur';
import { compactCatalogMovie } from '../catalogDelivery';
import { cacheableCatalogMovie } from '../src/lib/catalogCache';
import { createAdminGuard } from '../security';

const config = { enabled: true, ranges: [{ start: 12, end: 18 }] };
const request = (body: unknown = {}, name = 'publisher', id = 'manual-123') => ({
  params: { id }, headers: { 'x-admin-username': name }, query: {}, body,
}) as unknown as Request;
const response = () => {
  const result = { code: 200, body: undefined as any, headers: {} as Record<string, string> };
  const res = {
    status(code: number) { result.code = code; return this; },
    json(body: unknown) { result.body = body; return this; },
    setHeader(name: string, value: string) { result.headers[name] = value; return this; },
  } as unknown as Response;
  return { res, result };
};

test('scene blur role check accepts existing publishing roles and rejects guests/unknown/room admins', () => {
  for (const role of ['owner', 'admin', 'super_admin', 'deputy_manager', 'staff']) {
    assert.equal(sceneBlurAdminUsername(request({}, 'Publisher'), [{ username: 'publisher', role }], []), 'publisher');
  }
  for (const role of ['', 'viewer', 'cinema_room_admin']) {
    assert.equal(sceneBlurAdminUsername(request(), [{ username: 'publisher', role }], []), null);
  }
  assert.equal(sceneBlurAdminUsername(request(), [], []), null);
  assert.equal(sceneBlurAdminUsername(request({}, ''), [], []), null);
  assert.equal(sceneBlurAdminUsername(request({}, 'admin'), [], ['admin']), 'admin');
});

test('signed scene blur identity rejects header-only and forged requested names', async () => {
  const admins = [{ username: 'publisher', role: 'staff' }, { username: 'other', role: 'admin' }];
  assert.equal(signedSceneBlurAdminUsername(request(), null, admins, []), null, 'A username header is not login proof');
  assert.equal(signedSceneBlurAdminUsername(request({}, 'other'), 'publisher', admins, []), null, 'A signed publisher cannot impersonate another admin');
  assert.equal(signedSceneBlurAdminUsername(request({}, 'admin'), 'publisher', admins, ['admin']), null, 'Owner names cannot replace signed identity');
  assert.equal(signedSceneBlurAdminUsername(request(), 'publisher', admins, []), 'publisher');
  let saves = 0;
  let verified: string | null = null;
  const handlers = createSceneBlurHandlers({ findMovie: async () => ({ id: 'manual-123' }), save: async () => { saves++; } },
    req => signedSceneBlurAdminUsername(req, verified, admins, []));
  const unsigned = response(); await handlers.patch(request({ sceneBlur: config }), unsigned.res);
  assert.equal(unsigned.result.code, 403); assert.equal(saves, 0);
  verified = 'publisher';
  const forged = response(); await handlers.patch(request({ sceneBlur: config }, 'other'), forged.res);
  assert.equal(forged.result.code, 403); assert.equal(saves, 0);
  const signed = response(); await handlers.patch(request({ sceneBlur: config }), signed.res);
  assert.equal(signed.result.code, 200); assert.equal(saves, 1);
});

test('global guard allows delegated admin only on the focused scene blur endpoint', t => {
  t.mock.method(fs, 'appendFileSync', () => undefined);
  t.mock.method(console, 'log', () => undefined);
  const guard = createAdminGuard({ admins: [{ username: 'editor', role: 'admin' }] });
  const run = (url: string) => {
    const { res, result } = response(); let nextCalled = false;
    const req = { method: 'PATCH', url, path: url, headers: { 'x-admin-username': 'editor' }, query: {}, body: {}, socket: {} };
    guard(req, res, () => { nextCalled = true; });
    return { nextCalled, result };
  };
  assert.equal(run('/api/admin/movies/manual-123/scene-blur').nextCalled, true);
  assert.equal(run('/api/admin/admins').nextCalled, false);
});

test('public scene blur sync is small, uncached and defaults safely for an old movie', async () => {
  const handlers = createSceneBlurHandlers({ findMovie: async () => ({ id: 'manual-123', subtitleText: 'large private editor payload' }), save: async () => {} }, () => null);
  const { res, result } = response();
  await handlers.get(request(), res);
  assert.equal(result.code, 200);
  assert.deepEqual(result.body, { success: true, movieId: 'manual-123', sceneBlur: { enabled: false, ranges: [] } });
  assert.match(result.headers['Cache-Control'], /no-store/);
  assert.equal('subtitleText' in result.body, false);
});

test('scene blur patch persists only the validated config and publishes to subsequent public reads', async () => {
  let movie: { id: string; title: string; views: number; subtitleText: string; sceneBlur: SceneBlurConfig } =
    { id: 'manual-123', title: 'Original', views: 14, subtitleText: 'WEBVTT', sceneBlur: { enabled: false, ranges: [] } };
  let username = '', saves = 0;
  const handlers = createSceneBlurHandlers({
    findMovie: async () => movie,
    save: async (_movie, next, name) => { saves++; username = name; movie = { ...movie, sceneBlur: next }; },
  }, () => 'publisher');
  const saved = response();
  await handlers.patch(request({ sceneBlur: config, title: 'Injected', views: 999, subtitleText: '' }), saved.res);
  assert.equal(saved.result.code, 200); assert.equal(saves, 1); assert.equal(username, 'publisher');
  assert.equal(movie.title, 'Original'); assert.equal(movie.views, 14); assert.equal(movie.subtitleText, 'WEBVTT');
  const publicRead = response(); await handlers.get(request(), publicRead.res);
  assert.deepEqual(publicRead.result.body.sceneBlur, config);
});

test('unauthorized, invalid, missing and failed durable writes cannot report success', async () => {
  let calls = 0;
  const storage = { findMovie: async () => ({ id: 'manual-123' }), save: async () => { calls++; throw new Error('Firestore quota'); } };
  const guest = createSceneBlurHandlers(storage, () => null);
  const denied = response(); await guest.patch(request({ sceneBlur: config }), denied.res);
  assert.equal(denied.result.code, 403); assert.equal(calls, 0);
  const editor = createSceneBlurHandlers(storage, () => 'publisher');
  for (const sceneBlur of [undefined, { enabled: 'true', ranges: [] }, { enabled: true, ranges: [{ start: 20, end: 10 }] }]) {
    const invalid = response(); await editor.patch(request({ sceneBlur }), invalid.res);
    assert.equal(invalid.result.code, 400); assert.equal(calls, 0);
  }
  const failed = response(); await editor.patch(request({ sceneBlur: config }), failed.res);
  assert.equal(failed.result.code, 503); assert.equal(failed.result.body.success, false);
  const missing = createSceneBlurHandlers({ ...storage, findMovie: async () => undefined }, () => 'publisher');
  const absent = response(); await missing.patch(request({ sceneBlur: config }), absent.res);
  assert.equal(absent.result.code, 404); assert.equal(calls, 1);
  const badId = response(); await editor.get(request({}, '', '../db'), badId.res);
  assert.equal(badId.result.code, 400);
});

test('catalog subtitle compaction and browser cache retain shared scene blur configuration', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cinemachat-scene-blur-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const movie = { id: 'manual-123', sceneBlur: config, subtitleText: `WEBVTT\n\n${'00:00:00.000 --> 00:00:01.000\nCue\n\n'.repeat(80)}` };
  const compact = compactCatalogMovie(movie, directory);
  assert.equal(compact.subtitleText, '');
  assert.deepEqual(compact.sceneBlur, config);
  assert.deepEqual(cacheableCatalogMovie(compact).sceneBlur, config);
});
