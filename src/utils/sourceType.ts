/**
 * Source type classification for playback routing.
 *
 * Every valid playback URL maps to exactly one variant. The classifier is
 * intentionally conservative — unknown or dangerous URLs land in "unsupported"
 * rather than being silently loaded.
 */
export type SourceType =
  | "youtube"
  | "hls"
  | "direct-video"
  | "supported-embed"
  | "unsupported";

/**
 * Known embed-friendly providers that work inside a sandboxed iframe.
 * The list is kept short intentionally — only providers that have been
 * verified to run inside `ImmersiveShieldedPlayer`.
 */
const SUPPORTED_EMBED_PATTERNS =
  /hdtoday|vidcloud|vidmoly|molystream|streamwish|filelrun|filemoon|rabbitstream|kurdcinema|vidsrc|multiembed/i;

/**
 * Classify a playback URL into one of the supported source types.
 *
 * Classification priority:
 *  1. IMDb title/video pages → "supported-embed"
 *  2. YouTube watch/embed/shorts/youtu.be → "youtube"
 *  3. HLS .m3u8 streams → "hls"
 *  4. Direct MP4/WebM/OGV files → "direct-video"
 *  5. Known embed providers → "supported-embed"
 *  6. Anything else → "unsupported"
 */
export function classifySourceType(url: string | null): SourceType {
  if (!url || typeof url !== "string") return "unsupported";

  const trimmed = url.trim();
  if (!trimmed) return "unsupported";

  // ── 1. IMDb title/video pages → existing embed player ────────────────
  if (/imdb\.com\/(?:title|video)\//i.test(trimmed)) return "supported-embed";

  // ── 2. YouTube (watch, embed, youtu.be, shorts, /v/) ─────────────────
  if (/youtube\.com|youtu\.be/i.test(trimmed)) return "youtube";

  // ── 3. HLS .m3u8 streams ─────────────────────────────────────────────
  if (/\.m3u8(\?|#|$)/i.test(trimmed)) return "hls";

  // ── 4. Direct video files (MP4, WebM, OGV, M4V, MOV) ─────────────────
  if (/\.(mp4|m4v|webm|ogv|ogg|mov)(\?|#|$)/i.test(trimmed)) return "direct-video";

  // Firebase Storage and other direct-hosting CDNs serve raw video files
  if (/firebasestorage\.googleapis\.com|storage\.googleapis\.com/i.test(trimmed)) return "direct-video";

  // ── 5. Known supported embed providers ────────────────────────────────
  if (SUPPORTED_EMBED_PATTERNS.test(trimmed)) return "supported-embed";
  if (/\/embed\//i.test(trimmed)) return "supported-embed";

  // ── 6. Everything else → unsupported (webpage, unknown provider) ──────
  return "unsupported";
}

/**
 * Human-readable Sorani label for each source type.
 * Used in error messages and debug overlays.
 */
export function sourceTypeLabel(t: SourceType): string {
  switch (t) {
    case "youtube":         return "یوتوب";
    case "hls":             return "HLS Stream";
    case "direct-video":    return "ڤیدیۆی ڕاستەوخۆ";
    case "supported-embed": return "ئیمبێد";
    case "unsupported":     return "پەڕەی وێب یان پێشکەشی نەناسراو";
  }
}
