/** Shared by the server HTML and client head: titles describe the actual card. */
export const CATALOG_SITE_ORIGIN = 'https://www.cinamachat.com';

export interface CatalogSeoMovie {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  year?: unknown;
  type?: unknown;
  postType?: unknown;
  contentType?: unknown;
  image?: unknown;
  posterUrl?: unknown;
  coverUrl?: unknown;
  language?: unknown;
  subtitleText?: unknown;
  __inlineSubtitleUrl?: unknown;
  kurdishSubtitleUrl?: unknown;
  isKurdishDubbed?: unknown;
  isDubbed?: unknown;
  dubbedLanguage?: unknown;
  dubLanguage?: unknown;
  episodeNumber?: unknown;
  seasonNumber?: unknown;
  releaseDate?: unknown;
  datePublished?: unknown;
  ccRating?: unknown;
  ratingCount?: unknown;
  tags?: unknown;
}

export interface CatalogSeoOptions {
  origin?: string;
  series?: { id: string; title: string };
  room?: { id: string; title: string };
  episodeNumber?: number;
  seasonNumber?: number;
}

export interface CatalogSeoMetadata {
  title: string;
  heading: string;
  description: string;
  canonical: string;
  image: string;
  kind: 'Movie' | 'TVEpisode' | 'TVSeries' | 'CollectionPage';
  schema: Record<string, unknown>;
}

const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
};

/** Text only. Callers must still escape values when inserting into HTML. */
export function plainSeoText(value: unknown): string {
  if (typeof value !== 'string') return '';
  let text = value;
  // Imported descriptions occasionally contain double-encoded HTML entities.
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? match;
      const hex = /^#x/i.test(entity);
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : ' ';
    });
  }
  return text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function siteOrigin(value?: string): string {
  try {
    const url = new URL(value || CATALOG_SITE_ORIGIN);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
  } catch { /* Keep malformed configuration out of public canonical URLs. */ }
  return CATALOG_SITE_ORIGIN;
}

export function catalogMovieUrl(id: unknown, origin?: string): string {
  return `${siteOrigin(origin)}/?movieId=${encodeURIComponent(String(id ?? '').trim())}`;
}

export function catalogDramaRoomUrl(id: unknown, origin?: string): string {
  return `${siteOrigin(origin)}/?dramaRoomId=${encodeURIComponent(String(id ?? '').trim())}`;
}

function imageUrl(movie: CatalogSeoMovie, origin?: string): string {
  for (const value of [movie.image, movie.posterUrl, movie.coverUrl]) {
    if (typeof value !== 'string' || !value.trim()) continue;
    try {
      const url = new URL(value, siteOrigin(origin));
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch { /* A malformed poster must not break metadata for the card. */ }
  }
  return `${siteOrigin(origin)}/pwa/icon-512.png`;
}

/** Match MovieCard's Kurdish badge; an original-language subtitle URL is not proof. */
function hasKurdishSubtitles(movie: CatalogSeoMovie): boolean {
  return [movie.kurdishSubtitleUrl, movie.subtitleText, movie.__inlineSubtitleUrl]
    .some(value => typeof value === 'string' && Boolean(value.trim()));
}

const isKurdish = (value: unknown) => /^(?:ckb|ku|kur|kurdish|sorani|kurdi|کوردی|كردي)$/i.test(plainSeoText(value));
function hasKurdishDub(movie: CatalogSeoMovie): boolean {
  return movie.isKurdishDubbed === true ||
    (movie.isDubbed === true && isKurdish(movie.dubbedLanguage ?? movie.dubLanguage ?? movie.language));
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function headingFor(movie: CatalogSeoMovie): string {
  const title = plainSeoText(movie.title) || 'سینەما چات';
  const year = plainSeoText(String(movie.year ?? ''));
  return /^(?:19|20)\d{2}$/.test(year) && !title.includes(year) ? `${title} (${year})` : title;
}

function buildMetadata(movie: CatalogSeoMovie, kind: CatalogSeoMetadata['kind'], canonical: string,
  options: CatalogSeoOptions): CatalogSeoMetadata {
  const heading = headingFor(movie);
  const subtitles = hasKurdishSubtitles(movie);
  const dubbed = hasKurdishDub(movie);
  const qualifier = dubbed && subtitles ? 'بە دۆبلاژ و ژێرنووسی کوردی'
    : dubbed ? 'بە دۆبلاژی کوردی' : subtitles ? 'بە ژێرنووسی کوردی' : '';
  const label = kind === 'Movie' ? 'فیلم' : kind === 'TVEpisode' ? 'ئەڵقەی دراما' : 'زنجیرەی دراما';
  const english = kind === 'Movie' ? 'Movie' : kind === 'TVEpisode' ? 'Drama episode' : 'Drama series';
  const englishQualifier = dubbed && subtitles ? ' with Kurdish dubbing and subtitles'
    : dubbed ? ' with Kurdish dubbing' : subtitles ? ' with Kurdish subtitles' : '';
  // Do not repeatedly append a descriptor that an administrator already included.
  const title = `${heading}${qualifier && !heading.includes(qualifier) ? ` ${qualifier}` : ''} | CinemaChat`;
  const description = `${heading} — ${label}${qualifier ? ` ${qualifier}` : ''} لە سینەما چات. ${english}${englishQualifier}. ${plainSeoText(movie.description)}`
    .trim().slice(0, 300);
  const image = imageUrl(movie, options.origin);
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': kind,
    name: plainSeoText(movie.title) || heading, description, image: [image], url: canonical,
  };
  const releaseDate = plainSeoText(movie.releaseDate ?? movie.datePublished);
  if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(releaseDate) && Number.isFinite(Date.parse(releaseDate))) {
    schema.datePublished = new Date(releaseDate).toISOString().slice(0, 10);
  }
  const rating = Number(movie.ccRating);
  const count = positiveInteger(movie.ratingCount);
  if (count && Number.isFinite(rating) && rating > 0 && rating <= 10) {
    schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: rating, ratingCount: count, bestRating: 10, worstRating: 0 };
  }
  const tags = Array.isArray(movie.tags) ? movie.tags.map(plainSeoText).filter(Boolean) : [];
  if (tags.length) schema.genre = tags.slice(0, 10);
  const language = plainSeoText(movie.language);
  // Subtitle availability does not imply that the original audio is Kurdish.
  if (language) schema.inLanguage = language;
  if (kind === 'TVEpisode') {
    const episode = positiveInteger(options.episodeNumber ?? movie.episodeNumber);
    const season = positiveInteger(options.seasonNumber ?? movie.seasonNumber);
    if (episode) schema.episodeNumber = episode;
    if (season) schema.partOfSeason = { '@type': 'TVSeason', seasonNumber: season };
    if (options.series) schema.partOfSeries = {
      '@type': 'TVSeries', name: plainSeoText(options.series.title),
      url: catalogDramaRoomUrl(options.series.id, options.origin),
    };
    if (options.room) schema.isPartOf = {
      '@type': 'CollectionPage', name: plainSeoText(options.room.title),
      url: catalogDramaRoomUrl(options.room.id, options.origin),
    };
  }
  return { title, heading, description, canonical, image, kind, schema };
}

export function buildCatalogSeo(movie: CatalogSeoMovie, options: CatalogSeoOptions = {}): CatalogSeoMetadata {
  const type = plainSeoText(movie.type ?? movie.contentType).toLowerCase();
  const episode = options.series || options.room || positiveInteger(options.episodeNumber ?? movie.episodeNumber) ||
    ['episode', 'tvepisode'].includes(type) || ['drama', 'دراما'].includes(String(movie.postType || '').trim());
  const kind = episode ? 'TVEpisode' : ['tv', 'series', 'tvseries', 'drama'].includes(type) ? 'TVSeries' : 'Movie';
  return buildMetadata(movie, kind, catalogMovieUrl(movie.id, options.origin), options);
}

export function buildDramaRoomSeo(room: CatalogSeoMovie, episodes: CatalogSeoMovie[] = [],
  options: Pick<CatalogSeoOptions, 'origin'> = {}): CatalogSeoMetadata {
  // Rooms can group several dramas, so describe the room as a collection
  // rather than asserting that every room is one television series.
  const heading = plainSeoText(room.title) || 'دراماکان';
  const allSubtitled = episodes.length > 0 && episodes.every(hasKurdishSubtitles);
  const qualifier = allSubtitled ? ' بە ژێرنووسی کوردی' : '';
  const description = `${heading} — دراما و ئەڵقەکان${qualifier} لە سینەما چات. Drama series and episodes${allSubtitled ? ' with Kurdish subtitles' : ''}. ${plainSeoText(room.description)}`.trim().slice(0, 300);
  const canonical = catalogDramaRoomUrl(room.id, options.origin);
  const metadata: CatalogSeoMetadata = {
    heading, title: `${heading}${qualifier} | دراماکان | CinemaChat`, description,
    canonical, image: imageUrl(room, options.origin), kind: 'CollectionPage',
    schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: heading, description, url: canonical,
      mainEntity: { '@type': 'ItemList', itemListElement: episodes.filter(episode => episode.id && episode.title).map((episode, index) => ({
        '@type': 'ListItem', position: index + 1, name: plainSeoText(episode.title), url: catalogMovieUrl(episode.id, options.origin),
      })) } },
  };
  return metadata;
}
