import { descriptionNamedTitle, descriptionText, parseDescriptionQuery, type SearchableFilm } from './descriptionSearch';

/** Metadata only: these records must never be passed to the site's video player. */
export interface ExternalTitle {
  imdbId: string; title: string; year: number | null; poster: string;
  kind: 'movie' | 'series'; imdbUrl: string;
  relation?: TitleRelation; part?: number; availableId?: string;
}
export type TitleRelation = 'exact' | 'numbered' | 'different-year';
export interface LocalTitleMatch { id: string; title: string; year: string; part?: number; relation: TitleRelation }
export interface ExternalTitleResponse {
  results: ExternalTitle[]; unavailable?: boolean; alreadyAvailable?: boolean;
  local?: LocalTitleMatch[]; requestedYear?: number; requestedPart?: number;
}

export function catalogHasNamedTitle(catalog: SearchableFilm[], title: string): boolean {
  const wanted = titleIdentity(resolveCatalogTitle(title, catalog));
  return catalog.some(film => catalogTitleIdentities(film).some(identity => compareTitle(wanted, identity) === 'exact'));
}

const requestWish = '(?:دەوێت|دەوێ|دەمەوێت|دەمەوێ|ئەمەوێت|ئەمەوێ|ئەموێت|ئەموێ|پێویستمە|هەیە|بێت)';
const foldLetters = (text: string) => text.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[\u064B-\u065F\u0670\u0640\u200C\u200D]/g, '').replace(/\s+/g, ' ').trim();

// Reviewed title meanings/transliterations, NOT general-purpose word translation.
// Only a whole title identity is replaced: "باسی ڕۆح بکات" stays a plot request.
const titleAliases: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['soul', ['ڕۆح', 'رۆح', 'روح', 'سۆڵ', 'سۆل']],
  ['luca', ['لوکا', 'لوکە', 'لۆکا']],
  ['pout pout fish', ['ماسییە بێزارەکە', 'ماسیە بێزارەکە', 'ماسییە بێزارە', 'ماسیە بێزارە', 'the pout pout fish']],
  ['brave', ['بوێر']],
];
const aliasKey = (text: string) => descriptionText(text).replace(/ڕ/g, 'ر').replace(/^the\s+/, '');
const aliasMap = new Map(titleAliases.flatMap(([english, aliases]) =>
  [english, ...aliases].map(alias => [aliasKey(alias), english] as const)));
const canonicalBase = (text: string) => aliasMap.get(aliasKey(text)) || text.replace(/^the\s+/, '');

// Parse request grammar BEFORE examining the title; never send Sorani request
// suffixes to IMDb as part of an English title. Preserve narrative search.
export function namedSearchTitle(query: string, catalog: SearchableFilm[] = []): string | null {
  let text = foldLetters(query);
  for (let pass = 0; pass < 2; pass++) {
    text = text.replace(/^(?:تکایە|سڵاو)\s+/i, '')
      .replace(new RegExp(`^${requestWish}\\s+`, 'i'), '')
      .replace(/^(?:i (?:want|would like)|please (?:find|show)(?: me)?|find(?: me)?|show(?: me)?)\s+/i, '')
      .replace(/^(?:a\s+)?(?:movie|film)(?:\s+(?:called|named))?\s+/i, '')
      .replace(/^(?:فیلم|فلیم|فلم)(?:ێک(?:ی|م|مان)?|ەکەی|ەکەم|ەکە|ی)?\s+/i, '')
      .replace(new RegExp(`\\s+${requestWish}[.!؟?]*$`, 'i'), '').trim();
  }
  if (!text || text.length > 150 || /باسی|باس بکات|دەربارە|سەبارەت|\b(?:about|looking for|want|please find|fighting|trapped|stranded|survive|trying)\b/i.test(text)) return null;
  const identity = titleIdentity(text);
  // Exact catalog aliases take precedence over genre/topic words (e.g. ڕۆح).
  // Do not guess a title from a partial description or from the movie's plot.
  if (aliasMap.has(aliasKey(identity.base)) || catalog.some(film =>
    catalogTitleIdentities(film).some(candidate => candidate.base === identity.base))) {
    return resolveCatalogTitle(text, catalog);
  }
  const parsed = parseDescriptionQuery(text);
  if (parsed.genres.length || parsed.topics.length || parsed.languages.length || parsed.excluded.length) return null;
  const named = descriptionNamedTitle(`فیلمی ${text} دەوێت`);
  // Bare long, lower-case sentences should remain descriptions, not guessed titles.
  const bare = /^[a-z0-9][a-z0-9\s:'’&.!?(),-]*$/i.test(text) && text.split(/\s+/).length <= 8;
  if (!parsed.tokens.length || (!named && !bare)) return null;
  return text;
}

const ordinals: Record<string, number> = { 'یەک': 1, 'یەکەم': 1, 'دوو': 2, 'دووەم': 2, 'دوم': 2, 'سێ': 3, 'سێیەم': 3,
  'چوار': 4, 'چوارەم': 4, 'پێنج': 5, 'پێنجەم': 5, one: 1, two: 2, three: 3, four: 4, five: 5,
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
export function titleIdentity(value: string, yearValue?: unknown) {
  const folded = foldLetters(value).replace(/([a-z])([0-9٠-٩۰-۹]{1,2})(?=\s|:|$)/gi, '$1 $2');
  const normalized = descriptionText(folded);
  // A leading numeric title ("2001: A Space Odyssey", "1917") is not a requested release year.
  const explicitYear = normalized.match(/^.+\s((?:19|20)\d{2})$/)?.[1];
  const year = explicitYear || descriptionText(yearValue).match(/^(?:19|20)\d{2}$/)?.[0];
  const cleanName = (name: string) => (year ? descriptionText(name).replace(new RegExp(`\\b${year}\\b`, 'g'), '') : descriptionText(name))
    .trim().replace(/(?:\s+ساڵی|\s+year)$/, '').replace(/\s+(?:full movie|(?:kurdsh|kurdish|kurd)(?: subtitles?)?|cinamachat|cinemachat)$/, '').trim();
  let name = cleanName(folded.split(/[:：]/)[0]);
  const markerName = cleanName(folded);
  const marker = markerName.match(/\s+(?:بەش(?:ی)?|part|chapter)\s+(\S+)$/);
  const suffix = marker || name.match(/\s+(\d{1,2}|ii|iii|iv|v|vi|vii|viii|ix|x)$/);
  const partValue = suffix?.[1];
  const part = partValue ? (Object.prototype.hasOwnProperty.call(ordinals, partValue) ? ordinals[partValue] : Number(partValue)) : undefined;
  if (suffix && part && part <= 99) name = (marker ? markerName : name).slice(0, suffix.index).trim();
  else name = cleanName(folded); // Do not conflate all unnumbered colon subtitles.
  return { base: canonicalBase(name), part: part || undefined, year: year ? Number(year) : undefined };
}

export function compareTitle(wanted: ReturnType<typeof titleIdentity>, candidate: ReturnType<typeof titleIdentity>): TitleRelation | null {
  if (!wanted.base || wanted.base !== candidate.base) return null;
  if ((wanted.part || 1) !== (candidate.part || 1)) return 'numbered';
  if (wanted.year && !candidate.year) return null;
  if (wanted.year && candidate.year !== wanted.year) return 'different-year';
  return 'exact';
}

export function catalogTitleIdentities(film: SearchableFilm) {
  const segments = String(film.title || '').split('|');
  // Legacy cards sometimes join English and Kurdish titles without a separator.
  const latin = segments.flatMap(segment => segment.match(/[A-Za-z][A-Za-z0-9٠-٩۰-۹\s:：'’&.!?(),-]*/g) || []);
  const kurdish = segments.flatMap(segment => segment.match(/[\p{Script=Arabic}][\p{Script=Arabic}\s٠-٩۰-۹0-9()-]*/gu) || []);
  return [...segments, ...latin, ...kurdish].map(segment => titleIdentity(segment, film.year));
}

/** Learn bilingual aliases from actual card titles; ambiguous translations stay unresolved. */
export function resolveCatalogTitle(title: string, catalog: SearchableFilm[]): string {
  const wanted = titleIdentity(title);
  let base = wanted.base;
  if (!/^[a-z0-9][a-z0-9\s]*$/.test(base)) {
    const candidates = new Set(catalog.flatMap(film => {
      const identities = catalogTitleIdentities(film);
      if (!identities.some(candidate => candidate.base === wanted.base)) return [];
      const latin = identities.filter(candidate => /^[a-z][a-z0-9\s]*$/.test(candidate.base));
      return latin.length ? [latin[0].base] : [];
    }));
    if (candidates.size === 1) base = [...candidates][0];
  }
  // Preserve the viewer's requested year/part, never substitute the catalog's year.
  return `${base}${wanted.part ? ` ${wanted.part}` : ''}${wanted.year ? ` ${wanted.year}` : ''}`;
}

/** Compare sources without asserting that same-name titles are confirmed remakes or sequels. */
export function discoverTitleMatches(catalog: SearchableFilm[], query: string, external: ExternalTitleResponse): ExternalTitleResponse {
  const wanted = titleIdentity(resolveCatalogTitle(query, catalog));
  const local = catalog.flatMap(film => {
    const match = catalogTitleIdentities(film).map(identity => ({ identity, relation: compareTitle(wanted, identity) }))
      .filter(item => item.relation).sort((a, b) => Number(b.relation === 'exact') - Number(a.relation === 'exact'))[0];
    return match ? [{ id: film.id, title: String(film.title || ''), year: String(film.year || match.identity.year || ''),
      part: match.identity.part, relation: match.relation! }] : [];
  }).slice(0, 12);
  const results = external.results.flatMap(film => {
    const identity = titleIdentity(film.title, film.year), relation = compareTitle(wanted, identity);
    if (!relation) return [];
    const available = catalog.find(item => catalogHasNamedTitle([item], `${film.title}${film.year ? ` ${film.year}` : ''}`));
    return [{ ...film, part: identity.part, relation, availableId: available?.id }];
  }).sort((a, b) => Number(b.relation === 'exact') - Number(a.relation === 'exact') || (b.year || 0) - (a.year || 0));
  return { ...external, results, local, alreadyAvailable: local.some(film => film.relation === 'exact'), requestedYear: wanted.year, requestedPart: wanted.part };
}

export function movieRequestLink(base: string, film: ExternalTitle): string {
  try {
    const url = new URL(base);
    // WhatsApp group invites cannot carry a prefilled message; keep them intact.
    if (url.protocol === 'https:' && ['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(url.hostname)) {
      url.searchParams.set('text', `سڵاو، تکایە «${film.title}${film.year ? ` (${film.year})` : ''}» بۆ سینەما چات بە ژێرنووسی کوردی زیاد بکەن. ${film.imdbUrl}`);
      return url.toString();
    }
    return url.protocol === 'https:' && url.hostname === 'chat.whatsapp.com' ? base : '';
  } catch { return ''; }
}
