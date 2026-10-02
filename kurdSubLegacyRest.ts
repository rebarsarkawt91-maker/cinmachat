export type LegacyRestTrack = {
  fileId: string;
  downloadUrl: string;
  language: string;
  languageCode: string;
  fileName: string;
  downloads: number;
};

/** Build a bounded OpenSubtitles title query without allowing URL/path injection. */
export function legacyRestTitleQuery(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 16)
    .join('+');
}

/** Convert ASS dialogue into timed SRT cues for the Studio's SRT/VTT editor. */
export function assSubtitleToSrt(source: string): string {
  if (!/^\[Script Info\]/im.test(source) || !/^\[Events\]/im.test(source)) return source;
  const lines = source.split(/\r?\n/);
  let inEvents = false;
  let fields: string[] = [];
  const cues: string[] = [];
  const toSrtTime = (value: string): string | null => {
    const match = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{2})$/.exec(value.trim());
    if (!match) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}:${match[3]},${match[4]}0`;
  };
  for (const line of lines) {
    if (/^\[[^\]]+\]/.test(line)) {
      inEvents = /^\[Events\]/i.test(line);
      continue;
    }
    if (!inEvents) continue;
    if (/^Format\s*:/i.test(line)) {
      fields = line.replace(/^Format\s*:/i, '').split(',').map((part) => part.trim().toLowerCase());
      continue;
    }
    if (!/^Dialogue\s*:/i.test(line) || !fields.length) continue;
    const parts = line.replace(/^Dialogue\s*:/i, '').split(',');
    if (parts.length < fields.length) continue;
    const start = toSrtTime(parts[fields.indexOf('start')] || '');
    const end = toSrtTime(parts[fields.indexOf('end')] || '');
    const textIndex = fields.indexOf('text');
    if (!start || !end || textIndex < 0) continue;
    const text = parts.slice(textIndex, textIndex + parts.length - fields.length + 1).join(',')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, '\n')
      .replace(/\\h/g, ' ')
      .trim();
    if (text) cues.push(`${cues.length + 1}\n${start} --> ${end}\n${text}`);
  }
  return cues.length ? cues.join('\n\n') : source;
}

/** Preserve every distinct downloadable result from the bounded REST response. */
export function selectLegacyRestTracks(entries: unknown[]): LegacyRestTrack[] {
  const selected: LegacyRestTrack[] = [];
  const seenUrls = new Set<string>();
  for (const value of entries) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const rawUrl = String(entry.SubDownloadLink || '').trim();
    let url: URL;
    try { url = new URL(rawUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.hostname !== 'dl.opensubtitles.org' ||
      !/^\/en\/download\//.test(url.pathname) || !url.pathname.endsWith('.gz')) continue;
    if (seenUrls.has(url.toString())) continue;
    const language = String(entry.LanguageName || entry.SubLanguageID || 'Unknown').trim();
    const languageCode = String(entry.SubLanguageID || 'und').trim().toLowerCase();
    const fileId = String(entry.IDSubtitleFile || entry.IDSubtitle || '').trim();
    if (!/^\d+$/.test(fileId)) continue;
    seenUrls.add(url.toString());
    selected.push({
      fileId,
      downloadUrl: url.toString(),
      language,
      languageCode,
      fileName: String(entry.SubFileName || entry.MovieReleaseName || `subtitle-${fileId}.srt`).trim(),
      downloads: Number(String(entry.SubDownloadsCnt || 0).replace(/,/g, '')) || 0,
    });
  }
  return selected;
}
