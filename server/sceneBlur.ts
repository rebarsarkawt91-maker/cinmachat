import type { Request, Response } from 'express';
import { normalizeSceneBlurConfig, validateSceneBlurConfig, type SceneBlurConfig } from '../src/lib/sceneBlur';

export interface SceneBlurMovie {
  id: string;
  sceneBlur?: unknown;
  [field: string]: unknown;
}

/** Match the existing movie editor's delegated publishing permissions. */
export function sceneBlurAdminUsername(req: Request, admins: any[], ownerUsernames: string[]): string | null {
  const name = String((req as Request & { adminUsername?: string }).adminUsername ||
    req.headers['x-admin-username'] || req.body?.adminName || req.query?.adminName || '').trim().toLowerCase();
  if (!name) return null;
  const record = admins.find(entry => String(entry?.username || '').trim().toLowerCase() === name);
  return ownerUsernames.includes(name) || ['owner', 'admin', 'super_admin', 'deputy_manager', 'staff']
    .includes(String(record?.role || '').toLowerCase()) ? name : null;
}

/** A requested name is only a selector; signed-session proof supplies identity. */
export function signedSceneBlurAdminUsername(req: Request, verifiedIdentity: string | null,
  admins: any[], ownerUsernames: string[]): string | null {
  const verified = String(verifiedIdentity || '').trim().toLowerCase();
  if (!verified) return null;
  return sceneBlurAdminUsername(req, admins, ownerUsernames) === verified ? verified : null;
}

export function createSceneBlurHandlers(storage: {
  findMovie: (id: string) => Promise<SceneBlurMovie | undefined>;
  save: (movie: SceneBlurMovie, config: SceneBlurConfig, username: string) => Promise<void>;
}, authorize: (req: Request) => string | null) {
  const idFrom = (req: Request): string | null => {
    const id = String(req.params.id || '');
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
  };
  const noCache = (res: Response) => res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return {
    async get(req: Request, res: Response) {
      noCache(res);
      const id = idFrom(req);
      if (!id) return res.status(400).json({ success: false, error: 'Invalid movie id' });
      try {
        const movie = await storage.findMovie(id);
        if (!movie) return res.status(404).json({ success: false, error: 'Movie not found' });
        return res.json({ success: true, movieId: id, sceneBlur: normalizeSceneBlurConfig(movie.sceneBlur) });
      } catch {
        return res.status(503).json({ success: false, error: 'Scene blur settings unavailable' });
      }
    },
    async patch(req: Request, res: Response) {
      noCache(res);
      const username = authorize(req);
      if (!username) return res.status(403).json({ success: false, error: 'Movie editor access required' });
      const id = idFrom(req);
      if (!id) return res.status(400).json({ success: false, error: 'Invalid movie id' });
      let config: SceneBlurConfig;
      try { config = validateSceneBlurConfig(req.body?.sceneBlur); }
      catch (error) {
        return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid scene blur settings' });
      }
      try {
        const movie = await storage.findMovie(id);
        if (!movie) return res.status(404).json({ success: false, error: 'Movie not found' });
        // The adapter writes durable storage first and only then publishes to
        // the in-memory movie mirrors used by public readers.
        await storage.save(movie, config, username);
        return res.json({ success: true, movieId: id, sceneBlur: config });
      } catch {
        return res.status(503).json({ success: false, error: 'Scene blur settings were not saved' });
      }
    },
  };
}
