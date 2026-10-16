import { descriptionText } from '../src/utils/descriptionSearch';
import type { ExternalTitle, ExternalTitleResponse } from '../src/utils/externalTitle';

/** Validate public IMDb suggestion metadata; never accept actors, arbitrary URLs or HTML. */
export function parseImdbTitles(data: unknown, query: string): ExternalTitle[] {
  const rows = (data as { d?: unknown[] })?.d;
  if (!Array.isArray(rows)) return [];
  const wanted = descriptionText(query).replace(/\b(?:19|20)\d{2}\b/g, '').trim();
  const year = descriptionText(query).match(/\b(?:19|20)\d{2}\b/)?.[0];
  const tokens = wanted.split(' ').filter(Boolean);
  const seen = new Set<string>();
  return rows.slice(0, 50).flatMap((raw: any) => {
    if (!raw || !/^tt\d{5,12}$/.test(raw.id) || typeof raw.l !== 'string' || !raw.l.trim() || seen.has(raw.id)) return [];
    const kind = raw.qid || raw.q;
    if (!['movie', 'feature', 'tvSeries', 'TV series', 'tvMiniSeries', 'TV mini-series', 'tvMovie', 'TV movie'].includes(kind)) return [];
    const title = raw.l.trim().slice(0, 250), normalized = ` ${descriptionText(title)} `;
    if (!tokens.length || !tokens.every(token => normalized.includes(` ${token} `)) || (year && String(raw.y) !== year)) return [];
    let poster = '';
    try {
      const image = new URL(raw.i?.imageUrl);
      if (image.protocol === 'https:' && image.hostname === 'm.media-amazon.com' && image.pathname.startsWith('/images/')) {
        // Small request-card thumbnails, not multi-megabyte full-resolution posters.
        poster = image.toString().replace(/\._V1_.*\.jpg$/, '._V1_QL75_UX240_.jpg');
      }
    } catch { /* Missing posters get an honest placeholder, never an invented image. */ }
    seen.add(raw.id);
    return [{ imdbId: raw.id, title, year: Number.isInteger(raw.y) && raw.y >= 1880 && raw.y <= 2200 ? raw.y : null,
      poster, kind: /series/i.test(kind) ? 'series' : 'movie', imdbUrl: `https://www.imdb.com/title/${raw.id}/` } as ExternalTitle];
  }).sort((a, b) => Number(descriptionText(b.title) === wanted) - Number(descriptionText(a.title) === wanted)).slice(0, 6);
}

export function createExternalTitleSearch(request: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; value: Promise<ExternalTitleResponse> }>();
  return (title: string): Promise<ExternalTitleResponse> => {
    const query = descriptionText(title).slice(0, 150);
    if (query.length < 2) return Promise.resolve({ results: [] });
    const hit = cache.get(query);
    if (hit && hit.expires > Date.now()) return hit.value;
    const entry = { expires: Date.now() + 15000, value: Promise.resolve({ results: [] } as ExternalTitleResponse) };
    entry.value = (async () => {
      try {
        // Fixed origin and no redirects: caller input can never become an SSRF URL.
        const response = await request(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`, {
          headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(6000),
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('json') || !response.body) return { results: [], unavailable: true };
        const reader = response.body.getReader(), chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 512000) { await reader.cancel(); throw new Error('Metadata response too large'); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
        const results = parseImdbTitles(JSON.parse(Buffer.concat(chunks).toString('utf8')), query);
        entry.expires = Date.now() + (results.length ? 6 * 60 * 60 * 1000 : 5 * 60 * 1000);
        return { results };
      } catch { return { results: [], unavailable: true }; }
    })();
    cache.set(query, entry);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return entry.value;
  };
}
