import type { Request, Response } from 'express';
import { defaultPlayerAds, parsePlayerAds, type PlayerAdsConfig } from '../src/lib/playerAds';

export function createPlayerAdsStore(storage: { read(): Promise<unknown>; write(config: PlayerAdsConfig, username: string): Promise<void> }) {
  let config = defaultPlayerAds(), revision = 0;
  let loading: Promise<void> | undefined;
  let writes = Promise.resolve();
  return {
    get: () => structuredClone(config),
    load() {
      // A single shared read per process, including concurrent visitors.
      return loading ??= (async () => {
        const before = revision, saved = await storage.read();
        if (saved && revision === before) config = parsePlayerAds(saved);
      })().catch(error => {
        loading = undefined; // An admin may retry a failed read; never present it as an empty saved list.
        throw error;
      });
    },
    async save(value: unknown, username: string) {
      // Older open admin tabs know only media ads. Their saves must not erase
      // a text message configured by a newer tab.
      const parsed = parsePlayerAds(value);
      let next = parsed;
      const work = writes.then(async () => {
        next = (value as PlayerAdsConfig)?.textAd === undefined ? { ...parsed, textAd: config.textAd } : parsed;
        revision++;
        await storage.write(next, username);
        config = next;
        loading = Promise.resolve();
      });
      writes = work.catch(() => {});
      await work;
      return structuredClone(next);
    },
  };
}

export function playerAdsAdminHandler(store: ReturnType<typeof createPlayerAdsStore>, authenticate: (req: Request) => string | null) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const username = authenticate(req);
    if (!username) return res.status(401).json({ error: 'تکایە دووبارە بە ئەدمین بچۆ ژوورەوە.' });
    if (req.method === 'GET') {
      try { await store.load(); return res.json(store.get()); }
      catch { return res.status(503).json({ error: 'نەتوانرا ڕیکلامە هەڵگیراوەکان بخوێندرێنەوە؛ لیستەکە ناسڕێتەوە. تکایە دووبارە ئەم بەشە بکەرەوە.' }); }
    }
    try { parsePlayerAds(req.body); }
    catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    try { return res.json(await store.save(req.body, username)); }
    catch { return res.status(503).json({ error: 'پاشەکەوت نەکرا؛ هەڵگرتنی هەمیشەیی بەردەست نییە.' }); }
  };
}
