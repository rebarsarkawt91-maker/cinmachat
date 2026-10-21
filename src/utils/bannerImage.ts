/** This field renders only in an <img>; never allow SVG/HTML or executable URLs. */
export const BANNER_IMAGE_MAX_BYTES = 500 * 1024;
export function validBannerImage(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false;
  if (value.startsWith('data:')) {
    const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[2].length > Math.ceil(BANNER_IMAGE_MAX_BYTES / 3) * 4 || match[2].length % 4) return false;
    try {
      const bytes = atob(match[2]);
      if (bytes.length > BANNER_IMAGE_MAX_BYTES) return false;
      return match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : match[1] === 'jpeg' ? bytes.startsWith('\xff\xd8\xff')
        : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    } catch { return false; }
  }
  if (value.length > 4096 || /[\s\u0000-\u001f]/.test(value)) return false;
  if (/^\/(?:api\/)?uploads\/[a-zA-Z0-9_./%-]+$/.test(value)) return !value.includes('..');
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}
