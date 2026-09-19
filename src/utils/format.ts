/**
 * Format a live user/viewer count into a compact, human-readable string:
 *  - <= 999              → exact integer (e.g. 10, 850, 999)
 *  - 1000 .. < 1,000,000 → rounded "k" (e.g. 1k, 1.5k, 12k)
 *  - >= 1,000,000        → rounded "M" (e.g. 1.2M)
 * NaN / negatives are normalized to "0".
 */
export function formatUserCount(count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? count : 0;
  if (safe < 1000) {
    return String(Math.floor(safe));
  }
  if (safe < 1000000) {
    const k = safe / 1000;
    const rounded = Number.isInteger(k) ? Math.round(k) : Math.round(k * 10) / 10;
    if (rounded < 1000) return `${rounded}k`;
    // Rounded value reached 1000k (≈ 1,000,000) → fall through to "M".
  }
  const m = safe / 1000000;
  const rounded = Number.isInteger(m) ? Math.round(m) : Math.round(m * 10) / 10;
  return `${rounded}M`;
}