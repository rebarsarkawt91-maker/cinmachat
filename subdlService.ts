import JSZip from 'jszip';

export type SubdlTrack = {
  nId: string;
  downloadUrl: string;
  language: string;
  languageCode: string;
  fileName: string;
  downloads: number;
  hearingImpaired: boolean;
  fps: string;
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const identifier = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value)
  ? String(value) : text(value);

function subtitleIdFromUrl(raw: string) {
  try {
    const path = new URL(raw, 'https://dl.subdl.com').pathname;
    return path.match(/^\/subtitle\/([A-Za-z0-9_]+)/)?.[1] || '';
  } catch {
    return '';
  }
}

function safeDownloadUrl(raw: string) {
  try {
    const url = new URL(raw, 'https://dl.subdl.com');
    if (url.origin !== 'https://dl.subdl.com' ||
      !/^\/subtitle\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?(?:\.zip)?$/.test(url.pathname) ||
      url.search || url.hash) return '';
    return url.toString();
  } catch {
    return '';
  }
}

// SubDL v2 keeps the v1 `subtitles` array but some responses wrap it in data.
// Only accept a title with the requested IMDb ID when the provider supplies one.
export function parseSubdlTracks(payload: unknown, imdbId: string): SubdlTrack[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as Record<string, unknown>;
  if (body.status === false) return [];
  const data = body.data && typeof body.data === 'object'
    ? body.data as Record<string, unknown> : body;
  const results = Array.isArray(data.results) ? data.results : [];
  const first = results[0] && typeof results[0] === 'object'
    ? results[0] as Record<string, unknown> : null;
  const resultImdbId = text(first?.imdb_id).toLowerCase();
  if (resultImdbId && resultImdbId !== imdbId.toLowerCase()) return [];

  const subtitles = Array.isArray(data.subtitles) ? data.subtitles : [];
  const seen = new Set<string>();
  const tracks: SubdlTrack[] = [];
  for (const value of subtitles) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const rawUrl = text(entry.url);
    const downloadUrl = safeDownloadUrl(rawUrl);
    const nId = identifier(entry.n_id ?? entry.nId) || subtitleIdFromUrl(rawUrl);
    if (!downloadUrl || !/^[A-Za-z0-9_]{1,80}$/.test(nId) || seen.has(downloadUrl)) continue;
    seen.add(downloadUrl);

    const language = text(entry.language || entry.lang || entry.language_name) || 'Unknown';
    const languageCode = text(entry.language_code || entry.lang_code || entry.language || entry.lang)
      .toLowerCase().slice(0, 20) || 'und';
    const fileName = text(entry.release_name || entry.name) || `SubDL-${nId}`;
    const downloads = Number(entry.downloads ?? entry.download_count ?? 0);
    tracks.push({
      nId,
      downloadUrl,
      language,
      languageCode,
      fileName,
      downloads: Number.isFinite(downloads) && downloads >= 0 ? downloads : 0,
      hearingImpaired: entry.hi === true || entry.hearing_impaired === true,
      fps: text(entry.fps),
    });
  }
  return tracks;
}

export async function unpackSubdlSubtitleArchive(bytes: Buffer, maxBytes: number): Promise<Buffer> {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const files = Object.values(zip.files).filter((entry) =>
    !entry.dir && /\.(?:srt|vtt|ass|ssa)$/i.test(entry.name));
  if (files.length < 1 || files.length > 20) throw new Error('SubDL archive has no unambiguous subtitle file');
  const selected = files[0];
  // Check ZIP metadata before decompression, then enforce the limit again on
  // the actual bytes. Never extract archive paths to the filesystem.
  const declaredSize = (selected as typeof selected & { _data?: { uncompressedSize?: number } })
    ._data?.uncompressedSize;
  if (!Number.isSafeInteger(declaredSize) || declaredSize! < 0 || declaredSize! > maxBytes) {
    throw new Error('SubDL subtitle file is too large');
  }
  const content = await selected.async('nodebuffer');
  if (content.length > maxBytes) throw new Error('SubDL subtitle file is too large');
  return content;
}
