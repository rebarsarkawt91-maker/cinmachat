export type LegacySubtitleListing = {
  subtitleId: string;
  detailUrl: string;
  language: string;
  languageCode: string;
  fileName: string;
  downloads: number;
};

function decodeLabel(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'").replace(/&nbsp;/g, " ").trim();
}

/** Parse only subtitle rows from OpenSubtitles' public IMDb listing. */
export function parseLegacySubtitleListing(html: string): LegacySubtitleListing[] {
  const entries: LegacySubtitleListing[] = [];
  const seen = new Set<string>();
  const rows = html.split(/(?=<tr\b[^>]*\bid=["']name\d+["'])/gi).slice(1);
  for (const row of rows) {
    const id = row.match(/^<tr\b[^>]*\bid=["']name(\d+)["']/i)?.[1];
    if (!id || seen.has(id)) continue;
    const detailPath = row.match(new RegExp(`href=["'](\\/en\\/subtitles\\/${id}\\/[^"']+)["']`, "i"))?.[1];
    if (!detailPath) continue;
    const languageCode = row.match(/sublanguageid-([a-z]{2,3})/i)?.[1]?.toLowerCase() || "und";
    const language = row.match(/<a\b[^>]*title=["']([^"']+)["'][^>]*href=["'][^"']*sublanguageid-[a-z]{2,3}/i)?.[1]
      || languageCode;
    const releaseName = row.match(/<span\b[^>]*title=["']([^"']+)["']/i)?.[1]
      || `OpenSubtitles ${id}`;
    const downloadMatch = row.match(new RegExp(`\\/en\\/subtitleserve\\/sub\\/${id}[^>]*>\\s*(\\d+)x`, "i"));
    seen.add(id);
    entries.push({
      subtitleId: id,
      detailUrl: `https://api.opensubtitles.org${detailPath}`,
      language: decodeLabel(language),
      languageCode,
      fileName: decodeLabel(releaseName),
      downloads: Number(downloadMatch?.[1] || 0),
    });
  }
  return entries;
}

/** Detail pages contain the raw SRT file URL; never trust arbitrary links. */
export function legacySubtitleFileUrl(html: string): string | null {
  const fileId = html.match(/https:\/\/dl\.opensubtitles\.org\/en\/download\/file\/(\d+)/i)?.[1];
  return fileId ? `https://dl.opensubtitles.org/en/download/file/${fileId}` : null;
}
