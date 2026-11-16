import { BANNER_IMAGE_MAX_BYTES, validBannerImage } from './bannerImage';
import { isYTVideoId } from './youtube';

export const HERO_BACKGROUND_MODE_COUNT = 20;
export const CLASSIC_HERO_BACKGROUND_MODE = 2;
export const HERO_BACKGROUND_IMAGE_MAX_BYTES = BANNER_IMAGE_MAX_BYTES;
/** Inline HTML backgrounds stay small enough for durable config storage. */
export const HERO_BACKGROUND_HTML_MAX_BYTES = 256 * 1024;
/** Uploaded hero videos are intentionally capped for fast, silent background playback. */
export const HERO_BACKGROUND_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const HERO_BACKGROUND_VIDEO_MAX_SECONDS = 60;
export const HERO_BACKGROUND_IMAGE_PATH = '/api/hero-background-image/';

export type HeroBackgroundMedia = {
  kind: 'image' | 'video' | 'youtube' | 'html';
  url: string;
};

export type HeroBackgroundSettings = {
  mode: number;
  slots?: Partial<Record<number, HeroBackgroundMedia>>;
  revision?: string;
};

/** Change one saved link, the site default, or both in a single write. */
export type HeroBackgroundUpdate = {
  mode?: number;
  slot?: { mode: number; media: HeroBackgroundMedia | null };
};

export const DEFAULT_HERO_BACKGROUND: HeroBackgroundSettings = { mode: CLASSIC_HERO_BACKGROUND_MODE };

export function isHeroBackgroundAdminRole(role: unknown): boolean {
  return typeof role === 'string' &&
    ['owner', 'admin', 'super_admin', 'deputy_manager'].includes(role.toLowerCase());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function isMode(mode: unknown): mode is number {
  return typeof mode === 'number' && Number.isInteger(mode) && mode >= 1 && mode <= HERO_BACKGROUND_MODE_COUNT;
}

function parseHttpsUrl(value: string): URL | null {
  if (!value.startsWith('https://') || value.length > 4096 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function isUploadedHeroVideoPath(value: string): boolean {
  return /^\/uploads\/hero-background\/[A-Za-z0-9._-]+\.(?:mp4|webm)$/i.test(value);
}

function isInlineHtml(value: string): boolean {
  if (!/^data:text\/html(?:;charset=[^;,]+)?(?:;base64)?,/i.test(value)) return false;
  const comma = value.indexOf(',');
  const payload = value.slice(comma + 1).split('#', 1)[0];
  try {
    const bytes = value.slice(0, comma).toLowerCase().includes(';base64')
      ? Math.max(0, Math.floor(payload.length * 3 / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0))
      : new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
    return bytes > 0 && bytes <= HERO_BACKGROUND_HTML_MAX_BYTES;
  } catch { return false; }
}

const youtubeHosts = new Set([
  'youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);

/** Extract a single video from an exact YouTube host. Strip playlist and tracking options. */
export function getHeroBackgroundYouTubeId(value: string): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (isYTVideoId(input)) return input;
  const url = parseHttpsUrl(input);
  if (!url || url.port) return null;

  const { hostname, pathname } = url;
  let id: string | null = null;
  if (hostname === 'youtu.be') {
    id = pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
  } else if (hostname === 'youtube-nocookie.com' || hostname === 'www.youtube-nocookie.com') {
    id = pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname)) {
    id = pathname === '/watch'
      ? url.searchParams.get('v')
      : pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
  }
  return id && isYTVideoId(id) ? id : null;
}

export function parseHeroBackgroundMedia(value: unknown): HeroBackgroundMedia | null {
  const input = asRecord(value);
  if (!input) return null;
  const { kind, url } = input;
  if (typeof url !== 'string' || (kind !== 'image' && kind !== 'video' && kind !== 'youtube' && kind !== 'html')) return null;
  const parsed = parseHttpsUrl(url);
  if (kind === 'youtube' || (parsed && youtubeHosts.has(parsed.hostname))) {
    const id = getHeroBackgroundYouTubeId(url);
    return id ? { kind: 'youtube', url: `https://www.youtube.com/watch?v=${id}` } : null;
  }

  if (kind === 'image') {
    const hash = url.startsWith(HERO_BACKGROUND_IMAGE_PATH) ? url.slice(HERO_BACKGROUND_IMAGE_PATH.length) : '';
    if (/^[a-f0-9]{64}$/.test(hash)) return { kind, url };
    if (url.startsWith('data:image/') && validBannerImage(url)) return { kind, url };
  }

  if (kind === 'video' && isUploadedHeroVideoPath(url)) return { kind, url };
  if (kind === 'html' && isInlineHtml(url)) return { kind, url };
  if (kind === 'html' && parsed) return { kind, url: parsed.href };
  return parsed ? { kind, url: parsed.href } : null;
}

export function parseHeroBackground(value: unknown): HeroBackgroundSettings | null {
  const input = asRecord(value);
  if (!input || !isMode(input.mode)) return null;
  const { mode, revision } = input;
  const slots: NonNullable<HeroBackgroundSettings['slots']> = {};

  if (input.slots !== undefined) {
    const storedSlots = asRecord(input.slots);
    if (!storedSlots || Object.keys(storedSlots).length >= HERO_BACKGROUND_MODE_COUNT) return null;
    for (const [key, raw] of Object.entries(storedSlots)) {
      const id = Number(key);
      if (!isMode(id) || String(id) !== key || id === CLASSIC_HERO_BACKGROUND_MODE) return null;
      const media = parseHeroBackgroundMedia(raw);
      if (media) slots[id] = media;
    }
  } else if (input.media != null && mode !== CLASSIC_HERO_BACKGROUND_MODE) {
    // Existing deployments stored one link alongside the site default.
    const media = parseHeroBackgroundMedia(input.media);
    if (media) slots[mode] = media;
  }

  return {
    mode,
    ...(Object.keys(slots).length ? { slots } : {}),
    ...(typeof revision === 'string' && /^[a-z0-9-]{1,80}$/i.test(revision) ? { revision } : {}),
  };
}

export function parseHeroBackgroundUpdate(value: unknown): HeroBackgroundUpdate | null {
  const input = asRecord(value);
  if (!input || Object.keys(input).some(key => !['mode', 'slot', 'media'].includes(key))) return null;
  const { mode, slot, media } = input;
  const update: HeroBackgroundUpdate = {};
  if (mode !== undefined) {
    if (!isMode(mode)) return null;
    update.mode = mode;
  }
  if (slot !== undefined) {
    const record = asRecord(slot);
    if (media !== undefined || !record || !isMode(record.mode) || record.mode === CLASSIC_HERO_BACKGROUND_MODE) return null;
    const next = parseHeroBackgroundMedia(record.media);
    if (record.media !== null && !next) return null;
    update.slot = { mode: record.mode, media: next };
  } else if (media != null) {
    // Accept a cached editor's legacy payload without replacing other slots.
    if (!isMode(mode) || mode === CLASSIC_HERO_BACKGROUND_MODE) return null;
    const next = parseHeroBackgroundMedia(media);
    if (!next) return null;
    update.slot = { mode, media: next };
  }
  return update.mode !== undefined || update.slot ? update : null;
}
