import type { Request, Response } from 'express';
import { validBannerImage } from '../src/utils/bannerImage';

/** A single durable image setting; no ad links, charts or other config writes. */
export function createBannerImageStore(initial: string, storage: {
  read: () => Promise<unknown>; write: (image: string, username: string) => Promise<void>;
}) {
  let image = initial, revision = 0;
  let writes: Promise<void> = Promise.resolve();
  return {
    image: () => image,
    async load() {
      const before = revision;
      const saved = await storage.read();
      if (revision === before && validBannerImage(saved)) image = saved;
    },
    async save(next: string, username: string) {
      if (!validBannerImage(next)) throw new Error('Invalid banner image');
      const work = writes.then(async () => {
        revision++;
        await storage.write(next, username);
        image = next; // Never publish a success before durable storage accepts it.
      });
      writes = work.catch(() => {});
      await work;
      return next;
    },
  };
}

export function bannerImageHandler(store: ReturnType<typeof createBannerImageStore>,
  authenticate: (req: Request) => string | null, onSaved: (image: string) => void) {
  return async (req: Request, res: Response) => {
    const username = authenticate(req);
    if (!username) return res.status(401).json({ success: false, error: 'تکایە دووبارە بچۆ ژوورەوە بە ئەدمین؛ دانیشتنەکەت پشتڕاست نەکرایەوە.' });
    const image = req.body?.imageUrl;
    if (!validBannerImage(image)) return res.status(400).json({ success: false, error: 'لینکی HTTPS یان وێنەی PNG/JPEG/WEBP تا ٥٠٠ KB پێویستە.' });
    try {
      await store.save(image, username);
      onSaved(image);
      return res.json({ success: true, image });
    } catch {
      return res.status(503).json({ success: false, error: 'وێنەکە پاشەکەوت نەکرا؛ هەڵگرتنی هەمیشەیی بەردەست نییە. دووبارە هەوڵ بدە.' });
    }
  };
}
