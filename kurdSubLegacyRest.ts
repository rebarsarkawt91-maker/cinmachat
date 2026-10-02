export type LegacyRestTrack = {
  fileId: string;
  downloadUrl: string;
  language: string;
  languageCode: string;
  fileName: string;
  downloads: number;
};

/** Keep at most two downloadable subtitles per language, as the Studio search does. */
export function selectLegacyRestTracks(entries: unknown[], perLanguage = 2): LegacyRestTrack[] {
  const selected: LegacyRestTrack[] = [];
  const seenUrls = new Set<string>();
  const languageCounts = new Map<string, number>();
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
    const languageKey = languageCode || language.toLowerCase();
    if ((languageCounts.get(languageKey) || 0) >= perLanguage) continue;
    const fileId = String(entry.IDSubtitleFile || entry.IDSubtitle || '').trim();
    if (!/^\d+$/.test(fileId)) continue;
    seenUrls.add(url.toString());
    languageCounts.set(languageKey, (languageCounts.get(languageKey) || 0) + 1);
    selected.push({
      fileId,
      downloadUrl: url.toString(),
      language,
      languageCode,
      fileName: String(entry.SubFileName || entry.MovieReleaseName || `subtitle-${fileId}.srt`).trim(),
      downloads: Number(String(entry.SubDownloadsCnt || 0).replace(/,/g, '')) || 0,
    });
    if (selected.length >= 120) break;
  }
  return selected;
}
