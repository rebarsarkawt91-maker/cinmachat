import type { Express } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { LocalRoomEngine, ROOM_MODEL_VERSION } from './engine';
import { parseRoomSubtitleCues, reflowRoomTranslation, roomCacheIdentity, validateRoomBatch, type RoomCue } from '../../src/lib/roomSubtitleCore';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const maxSourceBytes = 2 * 1024 * 1024;
type Track = { videoId: string; contentHash: string; sourceLanguage: string; cues: RoomCue[]; accessed: number };
type Cache = { key: string; model: string; translations: Record<string, string> };

function publicAddress(address: string): boolean {
  if (address.includes(':')) return !/^(::|fc|fd|fe[89ab]|ff|2001:db8)/i.test(address);
  const [a, b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
}

// Attached captions may be local uploads or public HTTP(S) files. Pin the DNS
// result in the actual connection and validate every redirect (SSRF protection).
async function downloadCaption(raw: string, redirects = 0): Promise<string> {
  if (raw.startsWith('/uploads/subtitles/')) {
    const root = path.resolve('uploads/subtitles');
    const filename = path.resolve(root, decodeURIComponent(raw.slice('/uploads/subtitles/'.length)).split('?')[0]);
    if (!filename.startsWith(root + path.sep) || !/\.(srt|vtt)$/i.test(filename)) throw new Error('Invalid caption path');
    const stat = await fs.stat(filename);
    if (stat.size > maxSourceBytes) throw new Error('Caption too large');
    return fs.readFile(filename, 'utf8');
  }
  const url = new URL(raw);
  if (redirects > 3 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || (url.port && !['80', '443'].includes(url.port))) throw new Error('Invalid caption URL');
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error('Private caption URL');
  const selected = addresses[0];
  const result = await new Promise<{ text?: string; redirect?: string }>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      lookup: ((_host: string, options: any, callback: any) => options?.all
        ? callback(null, [selected]) : callback(null, selected.address, selected.family)) as any,
      headers: { Accept: 'text/vtt, application/x-subrip, text/plain' },
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        response.resume(); resolve({ redirect: new URL(response.headers.location, url).href }); return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Caption unavailable')); return; }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxSourceBytes) request.destroy(new Error('Caption too large'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }));
    });
    const timer = setTimeout(() => request.destroy(new Error('Caption timeout')), 30_000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    request.end();
  });
  return result.redirect ? downloadCaption(result.redirect, redirects + 1) : result.text!;
}

type RoomEngine = Pick<LocalRoomEngine, 'busy' | 'translate' | 'stop'> & {
  getModelVersion?: (target: 'ckb' | 'ar-IQ' | 'ar') => Promise<string>;
};
export function registerRoomSubtitleRoutes(app: Express, fetchOriginal: (url: string) => Promise<{ srt: string; lang: string }>, options: { engine?: RoomEngine; cacheDirectory?: string } = {}) {
  const engine = options.engine || new LocalRoomEngine();
  const tracks = new Map<string, Track>();
  const caches = new Map<string, Cache>();
  const inFlight = new Map<string, { promise: Promise<void>; users: number }>();
  let sourceLoads = 0;
  const directory = path.resolve(options.cacheDirectory || process.env.ROOM_SUBTITLE_CACHE_DIR || path.join(os.homedir(), '.cache', 'cinemachat-room-subtitles'));

  async function readCache(key: string, modelVersion: string): Promise<Cache> {
    const existing = caches.get(key);
    if (existing) return existing;
    let record: Cache = { key, model: modelVersion, translations: {} };
    try {
      const file = path.join(directory, key + '.json');
      if ((await fs.stat(file)).size <= 16 * 1024 * 1024) {
        const saved = JSON.parse(await fs.readFile(file, 'utf8'));
        if (saved.key === key && saved.model === modelVersion && saved.translations && typeof saved.translations === 'object' && !Array.isArray(saved.translations)) record = saved;
      }
    } catch { /* Missing or interrupted cache is a cold cache. */ }
    // A simultaneous read may have populated this key while disk I/O awaited.
    if (caches.has(key)) return caches.get(key)!;
    if (caches.size >= 16) caches.delete(caches.keys().next().value!);
    caches.set(key, record);
    return record;
  }

  async function persist(record: Cache) {
    await fs.mkdir(directory, { recursive: true });
    const destination = path.join(directory, record.key + '.json');
    const temporary = destination + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, destination);
      const files = await fs.readdir(directory);
      const entries = await Promise.all(files.filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map(async (name) => ({ name, stat: await fs.stat(path.join(directory, name)) })));
      let total = entries.reduce((sum, entry) => sum + entry.stat.size, 0);
      entries.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
      while (entries.length > 100 || total > 256 * 1024 * 1024) {
        const oldest = entries.shift()!;
        if (oldest.name === record.key + '.json') continue;
        await fs.unlink(path.join(directory, oldest.name));
        total -= oldest.stat.size;
      }
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }

  app.post('/api/room-subtitles/source', async (req, res) => {
    if (sourceLoads >= 2) { res.status(503).json({ error: 'SUBTITLES_UNAVAILABLE' }); return; }
    sourceLoads++;
    try {
      const { sourceUrl, subtitleUrl = '', videoId } = req.body || {};
      if (typeof sourceUrl !== 'string' || sourceUrl.length > 2048 || typeof subtitleUrl !== 'string' || subtitleUrl.length > 2048
        || typeof videoId !== 'string' || !videoId || videoId.length > 2048) throw new Error('Invalid source');
      const source = subtitleUrl
        ? { srt: await downloadCaption(subtitleUrl), lang: 'auto' }
        : await fetchOriginal(sourceUrl);
      if (Buffer.byteLength(source.srt, 'utf8') > maxSourceBytes) throw new Error('Caption too large');
      const cues = parseRoomSubtitleCues(source.srt);
      if (!cues.length || cues.length > 20_000) throw new Error('Invalid captions');
      const contentHash = hash(source.srt);
      const trackId = hash(JSON.stringify([videoId, contentHash, source.lang]));
      if (!tracks.has(trackId) && tracks.size >= 16) {
        const oldest = [...tracks].sort((a, b) => a[1].accessed - b[1].accessed)[0][0];
        tracks.delete(oldest);
      }
      tracks.set(trackId, { videoId, contentHash, sourceLanguage: source.lang, cues, accessed: Date.now() });
      res.json({ trackId, sourceLanguage: source.lang, contentHash, cues });
    } catch { res.status(503).json({ error: 'SUBTITLES_UNAVAILABLE' }); }
    finally { sourceLoads--; }
  });

  app.post('/api/room-subtitles/translate', async (req, res) => {
    try {
      const { trackId, target, indices } = req.body || {};
      const track = typeof trackId === 'string' ? tracks.get(trackId) : undefined;
      if (!track || !['ckb', 'ar-IQ', 'ar'].includes(target) || !Array.isArray(indices) || !indices.length || indices.length > 50
        || new Set(indices).size !== indices.length || indices.some((i) => !Number.isInteger(i) || !track.cues[i])) throw new Error('Invalid batch');
      track.accessed = Date.now();
      // Bind cached text to the actual configured weights, not just a label.
      const modelVersion = engine.getModelVersion ? await engine.getModelVersion(target) : ROOM_MODEL_VERSION;
      const key = hash(roomCacheIdentity(track.videoId, track.contentHash, track.sourceLanguage, target, modelVersion));
      const record = await readCache(key, modelVersion);
      // A corrupt disk entry is a cache miss, not a permanent Retry loop.
      for (const index of indices) {
        try { validateRoomBatch([track.cues[index].text], [record.translations[index]]); }
        catch { delete record.translations[index]; }
      }
      const missing = indices.filter((i) => typeof record.translations[i] !== 'string');
      const cached = missing.length === 0;
      if (missing.length) {
        const batchKey = key + ':' + [...missing].sort((a, b) => a - b).join(',');
        let work = inFlight.get(batchKey);
        if (!work) {
          if (engine.busy) { res.status(503).json({ error: 'SUBTITLES_UNAVAILABLE' }); return; }
          const promise = (async () => {
            // A wrapped cue is one semantic unit. Preserve its IDs/timestamps
            // locally and validate the entire response before caching anything.
            const sourceCues = missing.map((i) => track.cues[i].text);
            const translated = await engine.translate(sourceCues, target);
            validateRoomBatch(sourceCues, translated);
            const formatted = translated.map((text, i) => reflowRoomTranslation(sourceCues[i], text));
            validateRoomBatch(sourceCues, formatted);
            missing.forEach((index, i) => { record.translations[index] = formatted[i]; });
            await persist(record).catch(() => {}); // Memory caching still works if disk fills.
          })();
          work = { promise, users: 0 };
          inFlight.set(batchKey, work);
          void promise.finally(() => inFlight.delete(batchKey)).catch(() => {});
        }
        work.users++;
        const activeWork = work;
        const release = () => {
          activeWork.users--;
          // A language/room change aborts unused inference. Another viewer of
          // this same batch keeps the shared job alive.
          if (!res.writableEnded && activeWork.users === 0 && inFlight.get(batchKey) === activeWork) engine.stop();
        };
        res.once('close', release);
        try { await work.promise; }
        finally { res.removeListener('close', release); }
      }
      const values = indices.map((i) => record.translations[i]);
      validateRoomBatch(indices.map((i) => track.cues[i].text), values);
      res.json({ cached, translations: indices.map((index, i) => ({ index, id: track.cues[index].id, text: values[i] })) });
    } catch { res.status(503).json({ error: 'SUBTITLES_UNAVAILABLE' }); }
  });
  return () => engine.stop();
}
