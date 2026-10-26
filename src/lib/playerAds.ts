export type PlayerAd = { kind: 'image' | 'video'; url: string; enabled: boolean };
export type PlayerAdsConfig = { enabled: boolean; intervalSeconds: number; durationSeconds: number; items: PlayerAd[] };
export const defaultPlayerAds = (): PlayerAdsConfig => ({ enabled: false, intervalSeconds: 180, durationSeconds: 10, items: [] });

/** Only direct HTTPS media; never execute an advertiser's page or script. */
export function parsePlayerAds(value: unknown): PlayerAdsConfig {
  const v = value as PlayerAdsConfig;
  if (!v || typeof v.enabled !== 'boolean' || !Number.isInteger(v.intervalSeconds) || v.intervalSeconds < 60 || v.intervalSeconds > 3600 ||
      !Number.isInteger(v.durationSeconds) || v.durationSeconds < 3 || v.durationSeconds > 30 || !Array.isArray(v.items) || v.items.length > 6) throw new Error('ڕێکخستنەکان نادروستن؛ ماوە ١–٦٠ خولەک، پیشاندان ٣–٣٠ چرکە، تا ٦ ڕیکلام.');
  const items = v.items.map(item => {
    if (!item || !['image', 'video'].includes(item.kind) || typeof item.enabled !== 'boolean' || typeof item.url !== 'string' || item.url.length > 2048) throw new Error('ڕیکلامەکە نادروستە.');
    let url: URL;
    try { url = new URL(item.url.trim()); } catch { throw new Error('لینکی تەواوی HTTPS دابنێ.'); }
    const extension = item.kind === 'image' ? /\.(jpe?g|png|webp)$/i : /\.(mp4|webm)$/i;
    if (url.protocol !== 'https:' || url.username || url.password || !extension.test(url.pathname)) throw new Error('تەنها لینکی ڕاستەوخۆی HTTPS بۆ JPG/PNG/WebP یان MP4/WebM.');
    return { kind: item.kind, enabled: item.enabled, url: url.href };
  });
  if (v.enabled && !items.some(item => item.enabled)) throw new Error('لانیکەم یەک ڕیکلام چالاک بکە.');
  return { enabled: v.enabled, intervalSeconds: v.intervalSeconds, durationSeconds: v.durationSeconds, items };
}

/** Counts eligible viewing time, never the film position (seeking earns no time). */
export class PlayerAdClock {
  elapsed = 0;
  visible = -1;
  next = 0;
  constructor(public config: PlayerAdsConfig) {}
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
