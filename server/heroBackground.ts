import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  DEFAULT_HERO_BACKGROUND,
  HERO_BACKGROUND_IMAGE_PATH,
  parseHeroBackground,
  parseHeroBackgroundUpdate,
  type HeroBackgroundMedia,
  type HeroBackgroundSettings,
  type HeroBackgroundUpdate,
} from '../src/utils/heroBackground';

type HeroBackgroundStorage = {
  read: () => Promise<unknown>;
  write: (settings: HeroBackgroundSettings, username: string) => Promise<void>;
};

type HeroBackgroundStoreOptions = {
  removeAsset?: (url: string) => Promise<void>;
};

// Leave room for Firestore field names, metadata and document overhead.
const MAX_SETTINGS_BYTES = 896 * 1024;
class HeroBackgroundStorageLimit extends Error {}

function prepareBackground(settings: HeroBackgroundSettings) {
  const images = new Map<string, { mime: string; bytes: Buffer; media: HeroBackgroundMedia }>();
  const slots: NonNullable<HeroBackgroundSettings['slots']> = {};
  for (const [mode, media] of Object.entries(settings.slots ?? {})) {
    if (!media) continue;
    const raster = media.kind === 'image' && media.url.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (raster) {
      const [data, mime, base64] = raster;
      const hash = createHash('sha256').update(data).digest('hex');
      if (!images.has(hash)) images.set(hash, { mime, bytes: Buffer.from(base64, 'base64'), media });
      // Keep the config response small and let the browser cache the raster separately.
      slots[Number(mode)] = { kind: 'image', url: HERO_BACKGROUND_IMAGE_PATH + hash };
    } else {
      slots[Number(mode)] = media;
    }
  }
  const publicSettings = { ...settings, ...(Object.keys(slots).length ? { slots } : {}) };
  return { settings, publicSettings, images };
}

export function createHeroBackgroundStore(storage: HeroBackgroundStorage, options: HeroBackgroundStoreOptions = {}) {
  let state = prepareBackground(DEFAULT_HERO_BACKGROUND);
  let loaded = false;
  let loading: Promise<void> | undefined;
  let writes = Promise.resolve();

  function load() {
    if (loaded) return Promise.resolve();
    if (!loading) {
      loading = storage.read().then(value => {
        const saved = parseHeroBackground(value);
        if (saved && !Object.values(saved.slots ?? {}).some(media => media?.url.startsWith(HERO_BACKGROUND_IMAGE_PATH))) {
          state = prepareBackground(saved);
        }
        loaded = true;
      }).finally(() => { loading = undefined; });
    }
    return loading;
  }

  return {
    get: () => state.publicSettings,
    getImage: (hash: string) => state.images.get(hash),
    load,
    async save(input: HeroBackgroundUpdate, username: string) {
      const update = parseHeroBackgroundUpdate(input);
      if (!update) return null;
      const work = writes.then(async () => {
        // A write during startup must merge against the durable slots, not the seed.
        await load();
        const slots = { ...state.settings.slots };
        if (update.slot) {
          const { mode, media } = update.slot;
          if (!media) {
            delete slots[mode];
          } else if (media.url.startsWith(HERO_BACKGROUND_IMAGE_PATH)) {
            const image = state.images.get(media.url.slice(HERO_BACKGROUND_IMAGE_PATH.length));
            if (!image) return null;
            slots[mode] = image.media;
          } else {
            slots[mode] = media;
          }
        }

        const mode = update.mode ?? state.settings.mode;
        const revision = mode === state.settings.mode ? state.settings.revision : randomUUID();
        const normalized: HeroBackgroundSettings = {
          mode,
          ...(Object.keys(slots).length ? { slots } : {}),
          ...(revision ? { revision } : {}),
        };
        if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_SETTINGS_BYTES) {
          throw new HeroBackgroundStorageLimit();
        }

        const next = prepareBackground(normalized);
        await storage.write(normalized, username);
        const previousAssets = new Set(Object.values(state.settings.slots ?? {})
          .map(media => media?.url)
          .filter((url): url is string => typeof url === 'string'));
        const nextAssets = new Set(Object.values(normalized.slots ?? {})
          .map(media => media?.url)
          .filter((url): url is string => typeof url === 'string'));
        state = next;
        if (options.removeAsset) {
          for (const url of previousAssets) {
            if (!nextAssets.has(url)) {
              // Cleanup is best-effort: the settings write already succeeded,
              // so an OS-level unlink failure must not report a false save error.
              await options.removeAsset(url).catch(() => undefined);
            }
          }
        }
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
    const update = parseHeroBackgroundUpdate(req.body);
    if (!update) return res.status(400).json({ success: false, error: 'مۆدێکی دەستکاریکراو هەڵبژێرە و لینکی دروستی وێنە، ڤیدیۆ، HTML یان یوتیوب دابنێ.' });
    try {
      const heroBackground = await store.save(update, username);
      if (!heroBackground) return res.status(409).json({ success: false, error: 'باگراوند گۆڕدراوە. پەڕەکە نوێ بکەرەوە و دووبارە هەوڵ بدە.' });
      return res.json({ success: true, heroBackground });
    } catch (error) {
      if (error instanceof HeroBackgroundStorageLimit) {
        return res.status(413).json({ success: false, error: 'قەبارەی وێنە بارکراوەکان زۆرە. لینکی وێنە بەکاربهێنە.' });
      }
      return res.status(503).json({ success: false, error: 'باگراوند پاشەکەوت نەکرا. تکایە دووبارە هەوڵ بدە.' });
    }
  };
}
