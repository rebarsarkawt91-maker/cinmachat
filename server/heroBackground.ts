import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  DEFAULT_HERO_BACKGROUND,
  HERO_BACKGROUND_IMAGE_PATH,
  parseHeroBackground,
  type HeroBackgroundSettings,
} from '../src/utils/heroBackground';

type HeroBackgroundStorage = {
  read: () => Promise<unknown>;
  write: (settings: HeroBackgroundSettings, username: string) => Promise<void>;
};

function prepareBackground(settings: HeroBackgroundSettings) {
  const url = settings.media?.url;
  const raster = url?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!raster) return { settings, publicSettings: settings, image: undefined };
  const [data, mime, base64] = raster;
  const hash = createHash('sha256').update(data).digest('hex');
  const image = { hash, mime, bytes: Buffer.from(base64, 'base64') };
  // Keep the config response small and let the browser cache the raster separately.
  const publicSettings: HeroBackgroundSettings = {
    mode: settings.mode,
    media: { kind: 'image', url: HERO_BACKGROUND_IMAGE_PATH + hash },
  };
  return { settings, publicSettings, image };
}

export function createHeroBackgroundStore(storage: HeroBackgroundStorage) {
  let state = prepareBackground(DEFAULT_HERO_BACKGROUND);
  let revision = 0;
  let writes = Promise.resolve();
  return {
    get: () => state.publicSettings,
    getImage: (hash: string) => state.image?.hash === hash ? state.image : undefined,
    async load() {
      const before = revision;
      const saved = parseHeroBackground(await storage.read());
      if (saved && revision === before && !saved.media?.url.startsWith(HERO_BACKGROUND_IMAGE_PATH)) {
        state = prepareBackground(saved);
      }
    },
    async save(settings: HeroBackgroundSettings, username: string) {
      const work = writes.then(async () => {
        let normalized = settings;
        if (settings.media?.url.startsWith(HERO_BACKGROUND_IMAGE_PATH)) {
          if (!state.image || settings.media.url !== state.publicSettings.media?.url || !state.settings.media) return null;
          normalized = { mode: settings.mode, media: state.settings.media };
        }
        const next = prepareBackground(normalized);
        await storage.write(normalized, username);
        revision++;
        state = next;
        return next.publicSettings;
      });
      writes = work.then(() => {}, () => {});
      return work;
    },
  };
}

export function heroBackgroundAdminHandler(
  store: ReturnType<typeof createHeroBackgroundStore>,
  authenticate: (req: Request) => string | null,
) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const username = authenticate(req);
    if (!username) return res.status(401).json({ success: false, error: 'تکایە دووبارە بە ئەدمین بچۆ ژوورەوە.' });
    const settings = parseHeroBackground(req.body);
    if (!settings) return res.status(400).json({ success: false, error: 'مۆدێکی دروست هەڵبژێرە و لینکی ڕاستەوخۆی HTTPS یان فایلێکی وێنەی دروست دابنێ.' });
    try {
      const heroBackground = await store.save(settings, username);
      if (!heroBackground) return res.status(409).json({ success: false, error: 'باگراوند گۆڕدراوە. پەڕەکە نوێ بکەرەوە و دووبارە هەوڵ بدە.' });
      return res.json({ success: true, heroBackground });
    } catch {
      return res.status(503).json({ success: false, error: 'باگراوند پاشەکەوت نەکرا. تکایە دووبارە هەوڵ بدە.' });
    }
  };
}
