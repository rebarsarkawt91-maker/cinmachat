export type SubdlTrack = {
  nId: string;
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
    const nId = identifier(entry.n_id ?? entry.nId) || subtitleIdFromUrl(rawUrl);
    if (!/^[A-Za-z0-9_]{1,80}$/.test(nId) || seen.has(nId)) continue;
    seen.add(nId);

    const language = text(entry.language || entry.lang || entry.language_name) || 'Unknown';
    const languageCode = text(entry.language_code || entry.lang_code || entry.language || entry.lang)
      .toLowerCase().slice(0, 20) || 'und';
    const fileName = text(entry.release_name || entry.name) || `SubDL-${nId}`;
    const downloads = Number(entry.downloads ?? entry.download_count ?? 0);
    tracks.push({
      nId,
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
