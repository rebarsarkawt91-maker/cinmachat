import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Derived public assets only: the original database record remains untouched. */
export function compactCatalogMovie(movie: any, uploadsDirectory: string): any {
  if (typeof movie?.subtitleText !== 'string' || movie.subtitleText.length < 2000) return movie;
  try {
    const text = movie.subtitleText;
    const ext = /^\s*(?:\uFEFF)?WEBVTT/.test(text) ? 'vtt' : 'srt';
    const file = `catalog-subtitle-${createHash('sha256').update(text).digest('hex')}.${ext}`;
    mkdirSync(uploadsDirectory, { recursive: true });
    const destination = path.join(uploadsDirectory, file);
    if (!existsSync(destination)) writeFileSync(destination, text, 'utf8');
    const url = `/uploads/${file}`;
    return { ...movie, subtitleText: '', subtitleUrl: url, __inlineSubtitleUrl: url, __catalogDetailsRequired: true };
  } catch {
    // Never discard captions if creating their derived asset fails.
    return movie;
  }
}
