import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { registerRoomSubtitleRoutes } from './routes';

test('room API shares concurrent batches, persists/reloads cache, and rejects invalid batches without fallback', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cinemachat-room-test-'));
  let calls = 0;
  let modelRevision = 'mock-model-v1';
  let text = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:05.000\nHello Ahmed.\n\n2\n01:05:00.000 --> 01:05:03.000\nCome home.\n';
  const engine = {
    busy: false,
    async getModelVersion() { return modelRevision; },
    stop() {},
    async translate(lines: string[]) {
      calls++; this.busy = true;
      await new Promise((resolve) => setTimeout(resolve, 30));
      this.busy = false;
      return lines.map((line) => 'translated: ' + line);
    },
  };
  const start = async () => {
    const app = express(); app.use(express.json());
    const stop = registerRoomSubtitleRoutes(app, async () => ({ srt: text, lang: 'en' }), { engine, cacheDirectory: directory });
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address() as { port: number };
    return { close: async () => { stop(); server.close(); server.closeAllConnections(); await once(server, 'close'); }, post: async (route: string, body: object) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/room-subtitles/${route}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() as any };
    } };
  };
  let api = await start();
  try {
    const sourceBody = { videoId: 'public-test-video', sourceUrl: 'https://www.youtube.com/watch?v=iCvmsMzlF7o' };
    const original = (await api.post('source', sourceBody)).body;
    assert.equal(original.cues[1].end, 3903);
    assert.equal(calls, 0, 'Original never invokes an engine');
    const batch = {trackId: original.trackId, target: 'ckb', indices: [0,1]};
    const [a,b] = await Promise.all([api.post('translate', batch), api.post('translate', batch)]);
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(calls, 1);
    assert.deepEqual(a.body.translations.map((cue: any) => cue.id), ['1','2']);
    assert.equal((await api.post('translate', batch)).body.cached, true);
    assert.equal(calls, 1);
    assert.equal((await api.post('translate', {...batch, indices:[0,0]})).status, 503);
    assert.equal((await api.post('translate', {...batch, target:'tr'})).status, 503);
    assert.equal((await api.post('translate', {...batch, indices:[9999]})).status, 503);
    await api.close(); api = await start();
    const same = (await api.post('source', sourceBody)).body;
    assert.equal((await api.post('translate', {...batch, trackId:same.trackId})).body.cached, true);
    assert.equal(calls, 1, 'disk cache survives route restart');
    text = text.replace('Hello Ahmed.', 'Goodbye Ahmed.');
    const changed = (await api.post('source', sourceBody)).body;
    assert.notEqual(changed.contentHash, original.contentHash);
    assert.equal((await api.post('translate', {...batch, trackId:changed.trackId})).body.cached, false);
    assert.equal(calls, 2, 'changed source invalidates translation cache');
    modelRevision = 'mock-model-v2';
    assert.equal((await api.post('translate', {...batch, trackId:changed.trackId})).body.cached, false);
    assert.equal(calls, 3, 'changed model invalidates previously cached text');
    const failure = await api.post('source', {...sourceBody, subtitleUrl:'http://127.0.0.1/private.vtt'});
    assert.deepEqual(failure, {status:503,body:{error:'SUBTITLES_UNAVAILABLE'}});
  } finally {
    await api.close();
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('cinemachat-room-test-')) await fs.rm(resolved, {recursive:true,force:true});
  }
});

test('room API translates full wrapped cues and never caches a partially valid response', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cinemachat-room-test-'));
  const cueTexts = ["I have a bachelor's\nand a master's degree.", 'I worked for 10 years.'];
  let calls = 0;
  const engine = {
    busy: false,
    stop() {},
    async translate(lines: string[]) {
      assert.deepEqual(lines, cueTexts, 'visual wrapping must not split semantic input');
      calls++;
      if (calls === 1) return ['incomplete response'];
      return ['لدي شهادة بكالوريوس وشهادة ماجستير', 'اشتغلت لمدة 10 سنوات.'];
    },
  };
  const app = express(); app.use(express.json());
  const cleanup = registerRoomSubtitleRoutes(app, async () => ({
    srt: `1\n00:00:00,000 --> 00:00:04,000\n${cueTexts[0]}\n\n2\n00:00:05,000 --> 00:00:09,000\n${cueTexts[1]}\n`,
    lang: 'en',
  }), { engine, cacheDirectory: directory });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const post = (route: string, body: object) => fetch(`http://127.0.0.1:${port}/api/room-subtitles/${route}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  });
  try {
    const source = await (await post('source', { videoId: 'wrapped', sourceUrl: 'https://example.com/video' })).json() as any;
    const batch = { trackId: source.trackId, target: 'ar-IQ', indices: [0, 1] };
    assert.equal((await post('translate', batch)).status, 503);
    assert.deepEqual(await fs.readdir(directory), [], 'invalid output must not be persisted');
    const success = await post('translate', batch);
    assert.equal(success.status, 200);
    const result = await success.json() as any;
    assert.equal(result.cached, false);
    assert.deepEqual(result.translations.map((cue: any) => cue.id), ['1', '2']);
    assert.equal(result.translations[0].text.split('\n').length, 2);
    assert.equal(result.translations[0].text.replace(/\s+/g, ' '), 'لدي شهادة بكالوريوس وشهادة ماجستير');
    const cached = await (await post('translate', batch)).json() as any;
    assert.equal(cached.cached, true);
    assert.equal(calls, 2);
  } finally {
    cleanup(); server.close(); server.closeAllConnections(); await once(server, 'close');
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('cinemachat-room-test-')) await fs.rm(resolved, {recursive: true, force: true});
  }
});
