export type PlayerAd = { kind: 'image' | 'video'; url: string; enabled: boolean };
export type PlayerTextAd = { enabled: boolean; text: string; color: string; intervalSeconds: number; durationSeconds: number };
export type PlayerAdsConfig = { enabled: boolean; intervalSeconds: number; durationSeconds: number; items: PlayerAd[]; textAd: PlayerTextAd };
export const defaultPlayerTextAd = (): PlayerTextAd => ({ enabled: false, text: '', color: '#FFD400', intervalSeconds: 180, durationSeconds: 10 });
export const defaultPlayerAds = (): PlayerAdsConfig => ({ enabled: false, intervalSeconds: 180, durationSeconds: 10, items: [], textAd: defaultPlayerTextAd() });

/** Missing text settings are expected on existing saved video/image records. */
export function parsePlayerTextAd(value: unknown): PlayerTextAd {
  if (value === undefined) return defaultPlayerTextAd();
  const v = value as PlayerTextAd;
  if (!v || typeof v.enabled !== 'boolean' || typeof v.text !== 'string' || v.text.length > 300 || typeof v.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.color) ||
    !Number.isInteger(v.intervalSeconds) || v.intervalSeconds < 60 || v.intervalSeconds > 3600 || !Number.isInteger(v.durationSeconds) || v.durationSeconds < 3 || v.durationSeconds > 30 || (v.enabled && !v.text.trim())) {
    throw new Error('تێکست تا ٣٠٠ پیت، ڕەنگی دروست، ماوە ١–٦٠ خولەک و پیشاندان ٣–٣٠ چرکە دابنێ.');
  }
  return { enabled: v.enabled, text: v.text.trim(), color: v.color, intervalSeconds: v.intervalSeconds, durationSeconds: v.durationSeconds };
}

export function playerAdYouTubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)$/)?.[1] || null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

/** Pasting a direct video link should not silently leave its type set to image. */
export function inferPlayerAdKind(value: string, fallback: PlayerAd['kind']): PlayerAd['kind'] {
  if (playerAdYouTubeId(value.trim())) return 'video';
  try {
    const path = new URL(value.trim()).pathname;
    if (/\.(mp4|webm)$/i.test(path)) return 'video';
    if (/\.(jpe?g|png|webp)$/i.test(path)) return 'image';
  } catch { /* Keep the selected type while a URL is being typed. */ }
  return fallback;
}

/** Direct HTTPS media or a strictly validated YouTube video, never arbitrary embeds. */
export function parsePlayerAds(value: unknown): PlayerAdsConfig {
  const v = value as PlayerAdsConfig;
  if (!v || typeof v.enabled !== 'boolean' || !Number.isInteger(v.intervalSeconds) || v.intervalSeconds < 60 || v.intervalSeconds > 3600 ||
      !Number.isInteger(v.durationSeconds) || v.durationSeconds < 3 || v.durationSeconds > 30 || !Array.isArray(v.items) || v.items.length > 6) throw new Error('ڕێکخستنەکان نادروستن؛ ماوە ١–٦٠ خولەک، پیشاندان ٣–٣٠ چرکە، تا ٦ ڕیکلام.');
  const items = v.items.map(item => {
    if (!item || !['image', 'video'].includes(item.kind) || typeof item.enabled !== 'boolean' || typeof item.url !== 'string' || item.url.length > 2048) throw new Error('ڕیکلامەکە نادروستە.');
    let url: URL;
    try { url = new URL(item.url.trim()); } catch { throw new Error('لینکی تەواوی HTTPS دابنێ.'); }
    const extension = item.kind === 'image' ? /\.(jpe?g|png|webp)$/i : /\.(mp4|webm)$/i;
    const youtube = item.kind === 'video' ? playerAdYouTubeId(url.href) : null;
    if (url.protocol !== 'https:' || url.username || url.password || (!youtube && !extension.test(url.pathname))) throw new Error('لینکی یوتیوب یان لینکی ڕاستەوخۆی HTTPS بۆ JPG/PNG/WebP یان MP4/WebM دابنێ.');
    return { kind: item.kind, enabled: item.enabled, url: youtube ? `https://www.youtube.com/watch?v=${youtube}` : url.href };
  });
  if (v.enabled && !items.some(item => item.enabled)) throw new Error('لانیکەم یەک ڕیکلام چالاک بکە.');
  return { enabled: v.enabled, intervalSeconds: v.intervalSeconds, durationSeconds: v.durationSeconds, items, textAd: parsePlayerTextAd(v.textAd) };
}

/** Counts eligible viewing time, never the film position (seeking earns no time). */
export class PlayerAdClock {
  elapsed = 0;
  visible = -1;
  next = 0;
  constructor(public config: { enabled: boolean; intervalSeconds: number; durationSeconds: number; items: { enabled: boolean }[] }) {}
  dismiss() { this.visible = -1; this.elapsed = 0; }
  tick(seconds: number, eligible: boolean) {
    const items = this.config.items.filter(item => item.enabled);
    if (!this.config.enabled || !eligible || !items.length) return this.visible;
    this.elapsed += Math.max(0, Math.min(seconds, 1));
    if (this.visible < 0 && this.elapsed >= this.config.intervalSeconds) {
      this.visible = this.next++ % items.length; this.elapsed = 0;
    } else if (this.visible >= 0 && this.elapsed >= this.config.durationSeconds) this.dismiss();
    return this.visible;
  }
}
