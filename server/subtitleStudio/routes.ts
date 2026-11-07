import type { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parseSubtitleContent, detectSubtitleFormat } from './parser';
import { exportSubtitles, type ExportFormat, type ExportMode } from './exporter';
import { translateCueBatch } from './translator';
import type { StudioCue } from './types';

type Dependencies = {
  db: any;
  saveDB: (db: any) => Promise<void>;
  setMoviesCache: (updater: (previous: any[]) => any[]) => void;
  addAuditLog: (db: any, admin: string, action: string, details: string) => Promise<void>;
};

const windows = new Map<string, { started: number; count: number }>();

function limiter(req: Request, res: Response, next: NextFunction) {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const current = windows.get(ip);
  if (!current || now - current.started >= 60_000) {
    windows.set(ip, { started: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count > 20) return res.status(429).json({ success: false, error: 'Too many subtitle requests. Try again in one minute.' });
  next();
}

function validCue(value: any): value is StudioCue {
  return value && typeof value.id === 'string' && Number.isFinite(value.start) && Number.isFinite(value.end)
    && value.end >= value.start && typeof value.text === 'string';
}

function cuesFrom(value: unknown, max = 5000): StudioCue[] {
  if (!Array.isArray(value) || value.length > max || !value.every(validCue)) throw new Error(`Invalid cues (maximum ${max})`);
  return value.map((cue) => ({
    id: cue.id.slice(0, 100), start: cue.start, end: cue.end,
    text: cue.text.slice(0, 10_000), translation: typeof cue.translation === 'string' ? cue.translation.slice(0, 10_000) : undefined,
  }));
}

function safeMovieId(value: unknown): string {
  const safe = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (!safe) throw new Error('Invalid movie id');
  return safe;
}

export function registerSubtitleStudioRoutes(app: Express, dependencies: Dependencies) {
  const { db, saveDB, setMoviesCache, addAuditLog } = dependencies;
  app.use('/api/admin/subtitles', limiter);

  app.post('/api/admin/subtitles/parse', (req, res) => {
    try {
      const content = String(req.body?.content || '');
      if (!content || Buffer.byteLength(content, 'utf8') > 8 * 1024 * 1024) return res.status(400).json({ success: false, error: 'Subtitle content is empty or too large' });
      const format = detectSubtitleFormat(content, req.body?.format || req.body?.filename);
      res.json({ success: true, format, cues: parseSubtitleContent(content, format) });
    } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Parse failed' }); }
  });

  app.post('/api/admin/subtitles/translate-batch', async (req, res) => {
    try {
      const cues = cuesFrom(req.body?.cues, 30);
      const context = cuesFrom(Array.isArray(req.body?.context) ? req.body.context : [], 3);
      const glossary = String(req.body?.glossary || '').slice(0, 10_000);
      res.json({ success: true, translations: await translateCueBatch(cues, context, glossary) });
    } catch (error) {
      console.error('[SubtitleStudio] translate failed:', error);
      res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Translation failed' });
    }
  });

  app.post('/api/admin/subtitles/export', (req, res) => {
    try {
      const cues = cuesFrom(req.body?.cues);
      const format: ExportFormat = req.body?.format === 'srt' ? 'srt' : 'vtt';
      const mode: ExportMode = req.body?.mode === 'bilingual' ? 'bilingual' : 'kurdish';
      res.json({ success: true, content: exportSubtitles(cues, format, mode), filename: `cinamachat-ckb.${format}` });
    } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Export failed' }); }
  });

  app.post('/api/admin/subtitles/attach', async (req, res) => {
    try {
      const movieId = String(req.body?.movieId || '').trim();
      const safeId = safeMovieId(movieId);
      const vtt = String(req.body?.vtt || '');
      if (!/^\uFEFF?WEBVTT(?:\s|$)/i.test(vtt) || Buffer.byteLength(vtt, 'utf8') > 2 * 1024 * 1024) return res.status(400).json({ success: false, error: 'A valid WEBVTT file under 2 MB is required' });
      const index = (db.manualMovies || []).findIndex((movie: any) => String(movie.id) === movieId);
      if (index < 0) return res.status(404).json({ success: false, error: 'Movie not found' });
      const root = process.env.UPLOADS_PATH ? path.resolve(process.env.UPLOADS_PATH) : path.join(process.cwd(), 'uploads');
      const directory = path.join(root, 'subtitles');
      await fs.mkdir(directory, { recursive: true });
      const filename = `${safeId}.ckb.vtt`;
      await fs.writeFile(path.join(directory, filename), vtt, 'utf8');
      const updatedAt = new Date().toISOString();
      // `/api/uploads` is the production-safe static route (Firebase forwards
      // it to this server); bare `/uploads` is consumed by the SPA rewrite.
      const url = `/api/uploads/subtitles/${encodeURIComponent(filename)}`;
      const track = { lang: 'ckb', label: 'کوردی', url, updatedAt };
      const updated = { ...db.manualMovies[index], subtitles: [track], kurdishSubtitleUrl: url, kurdishSubtitleStatus: 'ready', updatedAt };
      db.manualMovies[index] = updated;
      const admin = String(req.headers['x-admin-username'] || req.body?.adminName || 'admin');
      await addAuditLog(db, admin, 'Attach Kurdish Subtitle', `Kurdish subtitle attached to "${updated.title || movieId}" (${movieId})`);
      await saveDB(db);
      setMoviesCache((previous) => previous.map((movie) => String(movie.id) === movieId ? { ...movie, ...updated } : movie));
      res.json({ success: true, movie: updated, track, url });
    } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Attach failed' }); }
  });

  app.delete('/api/admin/subtitles/:movieId', async (req, res) => {
    try {
      const movieId = String(req.params.movieId || '').trim();
      const safeId = safeMovieId(movieId);
      const index = (db.manualMovies || []).findIndex((movie: any) => String(movie.id) === movieId);
      if (index < 0) return res.status(404).json({ success: false, error: 'Movie not found' });
      const root = process.env.UPLOADS_PATH ? path.resolve(process.env.UPLOADS_PATH) : path.join(process.cwd(), 'uploads');
      await fs.unlink(path.join(root, 'subtitles', `${safeId}.ckb.vtt`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      const updated = { ...db.manualMovies[index], subtitles: [], kurdishSubtitleUrl: '', kurdishSubtitleStatus: '', updatedAt: new Date().toISOString() };
      db.manualMovies[index] = updated;
      const admin = String(req.headers['x-admin-username'] || req.body?.adminName || 'admin');
      await addAuditLog(db, admin, 'Remove Kurdish Subtitle', `Kurdish subtitle removed from "${updated.title || movieId}" (${movieId})`);
      await saveDB(db);
      setMoviesCache((previous) => previous.map((movie) => String(movie.id) === movieId ? { ...movie, ...updated } : movie));
      res.json({ success: true });
    } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Delete failed' }); }
  });

  app.get('/api/subtitles/:movieId', (req, res) => {
    const movie = (db.manualMovies || []).find((entry: any) => String(entry.id) === String(req.params.movieId));
    if (!movie) return res.status(404).json({ success: false, error: 'Movie not found' });
    const subtitles = Array.isArray(movie.subtitles) ? movie.subtitles : movie.kurdishSubtitleUrl
      ? [{ lang: 'ckb', label: 'کوردی', url: movie.kurdishSubtitleUrl, updatedAt: movie.updatedAt || null }] : [];
    res.json({ success: true, movieId: String(movie.id), subtitles });
  });
}
