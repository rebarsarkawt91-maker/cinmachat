import { BANNER_IMAGE_MAX_BYTES, validBannerImage } from './bannerImage';

export const HERO_BACKGROUND_MODE_COUNT = 20;
export const HERO_BACKGROUND_IMAGE_MAX_BYTES = BANNER_IMAGE_MAX_BYTES;
export const HERO_BACKGROUND_IMAGE_PATH = '/api/hero-background-image/';

export type HeroBackgroundSettings = {
  mode: number;
  media?: { kind: 'image' | 'video'; url: string };
};

export const DEFAULT_HERO_BACKGROUND: HeroBackgroundSettings = { mode: 2 };

export function isHeroBackgroundAdminRole(role: unknown): boolean {
  return typeof role === 'string' &&
    ['owner', 'admin', 'super_admin', 'deputy_manager'].includes(role.toLowerCase());
}

export function parseHeroBackground(value: unknown): HeroBackgroundSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { mode, media } = value as Record<string, unknown>;
  if (typeof mode !== 'number' || !Number.isInteger(mode) || mode < 1 || mode > HERO_BACKGROUND_MODE_COUNT) return null;
  if (media === undefined || media === null) return { mode };
  if (typeof media !== 'object' || Array.isArray(media)) return null;
  const { kind, url } = media as Record<string, unknown>;
  if ((kind !== 'image' && kind !== 'video') || typeof url !== 'string') return null;

  if (kind === 'image') {
    const hash = url.startsWith(HERO_BACKGROUND_IMAGE_PATH) ? url.slice(HERO_BACKGROUND_IMAGE_PATH.length) : '';
    if (/^[a-f0-9]{64}$/.test(hash)) return { mode, media: { kind, url } };
    if (url.startsWith('data:image/') && validBannerImage(url)) return { mode, media: { kind, url } };
  }

  if (!url.startsWith('https://') || url.length > 4096 || /[\s\u0000-\u001f\u007f\\]/.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return { mode, media: { kind, url: parsed.href } };
  } catch {
    return null;
  }
}
