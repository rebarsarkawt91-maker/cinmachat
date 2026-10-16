import { descriptionNamedTitle, descriptionText, parseDescriptionQuery, type SearchableFilm } from './descriptionSearch';

/** Metadata only: these records must never be passed to the site's video player. */
export interface ExternalTitle {
  imdbId: string; title: string; year: number | null; poster: string;
  kind: 'movie' | 'series'; imdbUrl: string;
}
export interface ExternalTitleResponse {
  results: ExternalTitle[]; unavailable?: boolean; alreadyAvailable?: boolean;
}

export function catalogHasNamedTitle(catalog: SearchableFilm[], title: string): boolean {
  const normalized = descriptionText(title);
  const year = normalized.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const name = normalized.replace(/\b(?:19|20)\d{2}\b/g, '').trim();
  return !!name && catalog.some(film => ` ${descriptionText(film.title)} `.includes(` ${name} `) &&
    (!year || descriptionText(film.year) === year || ` ${descriptionText(film.title)} `.includes(` ${year} `)));
}

// Bare English titles such as "Fall" also count as named requests. Narrative
// descriptions and recognized tastes remain in the existing semantic search.
export function namedSearchTitle(query: string): string | null {
  const named = descriptionNamedTitle(query);
  if (named) return named;
  const text = query.trim();
  const parsed = parseDescriptionQuery(text);
  if (parsed.genres.length || parsed.topics.length || parsed.languages.length || parsed.excluded.length) return null;
  if (!parsed.tokens.length || !/^[a-z0-9][a-z0-9\s:'’&.!?(),-]*$/i.test(text) || text.split(/\s+/).length > 8) return null;
  if (/\b(?:want|looking|about|where|who|please|find|movie|film)\b/i.test(text)) return null;
  return text.slice(0, 150);
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
