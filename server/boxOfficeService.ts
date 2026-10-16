import { boxOfficeSeed, type BoxOfficeChart, type BoxOfficeMovie } from '../src/data/boxOfficeSeed';
import { descriptionText } from '../src/utils/descriptionSearch';
import { createExternalTitleSearch } from './externalTitleSearch';

// Canonical destination of the official guide's legacy /wknd5.php URL.
export const BOX_OFFICE_FEED = 'https://www.boxofficemojo.com/data/js/wknd5/';
export const BOX_OFFICE_TTL = 6 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\\'/g, "'")
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return n === 150 ? '–' : n === 151 ? '—' : n >= 32 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  }).replace(/&(amp|quot|apos|nbsp|ndash|mdash);/g, (_, name: string) =>
    ({ amp: '&', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—' })[name] || '')
  .replace(/\s+/g, ' ').trim();

/** Parse the officially embeddable Top 5 feed as DATA. Never execute document.write. */
export function parseBoxOfficeFeed(script: string): Pick<BoxOfficeChart, 'items' | 'period'> {
  if (script.length > 128000) throw new Error('Box-office feed too large');
  const period = text(script.match(/Weekend Box Office<\/nobr>,\s*<nobr>([^<]{1,60})<\/nobr>/i)?.[1] || '');
  const items = [...script.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].flatMap(row => {
    const cells = [...row[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => text(cell[1]));
    const match = cells[0]?.match(/^([1-5])\.\s+(.{1,250})$/);
    if (!match || cells.length !== 2 || !/^\$[\d,.]+(?:\s*[MKB])?$/.test(cells[1])) return [];
    return [{ rank: Number(match[1]), title: match[2], weekendGross: cells[1], poster: '', year: null } as BoxOfficeMovie];
  });
  if (!period || items.length !== 5 || items.some((item, index) => item.rank !== index + 1)
    || new Set(items.map(item => descriptionText(item.title))).size !== 5) throw new Error('Incomplete box-office chart');
  return { period, items };
}

export function createBoxOfficeService(options: { request?: typeof fetch; now?: () => number; seed?: BoxOfficeChart } = {}) {
  const request = options.request || fetch, now = options.now || Date.now;
  const metadata = createExternalTitleSearch(request);
  let last = options.seed || boxOfficeSeed, nextRefresh = 0;
  let pending: Promise<BoxOfficeChart> | undefined;
  return (): Promise<BoxOfficeChart> => {
    if (pending) return pending;
    if (now() < nextRefresh) return Promise.resolve(last);
    pending = (async () => {
      try {
        // One fixed, officially published feed; no caller URLs, redirects, keys,
        // third-party scripts, Firestore reads, or per-visitor upstream requests.
        const response = await request(BOX_OFFICE_FEED, { redirect: 'error',
          headers: { Accept: 'application/javascript, text/javascript, text/plain' }, signal: AbortSignal.timeout(8000) });
        if (response.status !== 200 || !/(?:javascript|text\/plain)/i.test(response.headers.get('content-type') || '') || !response.body) throw new Error('Feed unavailable');
        const reader = response.body.getReader(), chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 128000) { await reader.cancel(); throw new Error('Feed too large'); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
        const chart = parseBoxOfficeFeed(Buffer.concat(chunks).toString('utf8'));
        const items = await Promise.all(chart.items.map(async item => {
          const found = (await metadata(item.title)).results.filter(film => film.kind === 'movie'
            && descriptionText(film.title) === descriptionText(item.title) && (!film.year || film.year <= new Date(now()).getUTCFullYear()))
            .sort((a, b) => (b.year || 0) - (a.year || 0))[0];
          // Posters are optional. A failed metadata request cannot change rank.
          const old = last.items.find(film => film.title === item.title);
          return { ...item, poster: found?.poster || old?.poster || '', year: found?.year || old?.year || null,
            imdbId: found?.imdbId || old?.imdbId };
        }));
        last = { ...chart, items, source: 'Box Office Mojo', fetchedAt: new Date(now()).toISOString(), stale: false };
        nextRefresh = now() + BOX_OFFICE_TTL;
      } catch {
        // Keep a dated last-good chart, never substitute trending/local views.
        last = { ...last, stale: true };
        nextRefresh = now() + RETRY_MS;
      }
      return last;
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
