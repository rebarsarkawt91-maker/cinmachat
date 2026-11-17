import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Film, Newspaper, Pause, Play, Tv, X } from 'lucide-react';
import type { Movie } from '../../types';
import { resolveApiUrl } from '../../services/backendConfig';
import '../../styles/heroInfoPanels.css';

type DramaRoom = { dramas?: string[]; title?: string; description?: string };
type PanelKind = 'movie' | 'boxoffice' | 'news' | 'series';

type PanelItem = {
  id: string;
  title: string;
  description: string;
  image?: string;
  year?: string | number;
  rank?: number;
  source?: string;
  link?: string;
  publishedAt?: string;
  kind: PanelKind;
  movie?: Movie;
};

type FeedPayload = { items?: unknown[] };

const cleanText = (value: unknown) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const hasKurdish = (value: string) => /[ەێڕڵۆۆڤگ]/u.test(value);

function safeRemoteUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === 'https:' || (url.origin === window.location.origin && url.pathname.startsWith('/'))) return url.toString();
  } catch { /* Ignore malformed feed values. */ }
  return undefined;
}

function isSeries(movie: Movie): boolean {
  const postType = (movie as Movie & { postType?: string }).postType;
  const haystack = [movie.type, movie.category, postType, ...(movie.tags || []), movie.title]
    .map(value => String(value || '').toLowerCase()).join(' ');
  return movie.type === 'tv' || /(?:series|tv show|drama|season|episode|ئەڵقە|دراما|زنجیرە)/iu.test(haystack);
}

function regionFor(movie: Movie): string {
  const haystack = [movie.language, movie.category, ...(movie.tags || []), movie.title]
    .map(value => String(value || '').toLowerCase()).join(' ');
  if (/(?:korean|korea|south korea|کورى|کۆرى|کۆری)/iu.test(haystack)) return 'کۆری';
  if (/(?:chinese|china|mandarin|چین|چینی)/iu.test(haystack)) return 'چینی';
  return 'بیانی';
}

function movieDescription(movie: Movie, fallback: string): string {
  const description = cleanText(movie.description);
  return hasKurdish(description) ? description : fallback;
}

function chooseMovieItems(catalog: Movie[]): PanelItem[] {
  return [...catalog]
    .filter(movie => movie?.id && movie?.title && !isSeries(movie))
    .sort((a, b) => (Number(b.trendingScore) || Number(b.views) || 0) - (Number(a.trendingScore) || Number(a.views) || 0))
    .slice(0, 10)
    .map(movie => ({
      id: `movie-${movie.id}`,
      title: cleanText(movie.title).split('|')[0] || 'فیلمی نوێ',
      description: movieDescription(movie, `وەسفی کوردیی «${cleanText(movie.title)}» لە سینەماچات بەردەستە.`),
      image: movie.image,
      year: movie.year,
      source: regionFor(movie),
      kind: 'movie' as const,
      movie,
    }));
}

function chooseSeriesItems(catalog: Movie[], rooms: DramaRoom[]): PanelItem[] {
  const byId = new Map(catalog.filter(movie => movie?.id).map(movie => [movie.id, movie]));
  const roomIds = rooms.flatMap(room => Array.isArray(room?.dramas) ? room.dramas : []);
  const roomMovies = [...new Set(roomIds)].map(id => byId.get(id)).filter((movie): movie is Movie => Boolean(movie));
  const source = [...roomMovies, ...catalog.filter(movie => isSeries(movie) && !roomIds.includes(movie.id))];
  const unique = new Map(source.map(movie => [movie.id, movie]));
  const sorted = [...unique.values()].sort((a, b) => {
    const score = (movie: Movie) => {
      const year = Number.parseInt(String(movie.year || ''), 10) || 0;
      const published = Date.parse(movie.date || '');
      const recency = Number.isFinite(published) ? Math.max(0, Math.floor(published / 86_400_000)) : 0;
      return (movie.isTrending ? 100000 : 0) + year * 100 + recency + (Number(movie.trendingScore) || 0) * 10 + (Number(movie.views) || 0);
    };
    return score(b) - score(a);
  });
  // Keep the carousel useful for the requested regions whenever the catalog
  // contains them; fill the remaining slots by the overall newest/trending
  // order so a sparse catalog still renders a complete Top 10.
  const regional = ['کۆری', 'چینی', 'بیانی'].flatMap(region => sorted.filter(movie => regionFor(movie) === region).slice(0, 3));
  const selected = [...new Map([...regional, ...sorted].map(movie => [movie.id, movie])).values()].slice(0, 10);
  return selected
    .map((movie, index) => ({
      id: `series-${movie.id}`,
      title: cleanText(movie.title).split('|')[0] || 'زنجیرەی نوێ',
      description: movieDescription(movie, `زنجیرەیەکی ${regionFor(movie)}ی نوێ و بەناوبانگە.`),
      image: movie.image,
      year: movie.year,
      rank: index + 1,
      source: regionFor(movie),
      link: safeRemoteUrl(movie.externalMovieLink || movie.external_link || movie.trailerLink),
      kind: 'series' as const,
      movie,
    }));
}

function chooseNewsFallback(catalog: Movie[]): PanelItem[] {
  return [...catalog]
    .filter(movie => movie?.id && movie?.title)
    .sort((a, b) => (Number(b.trendingScore) || Number(b.views) || 0) - (Number(a.trendingScore) || Number(a.views) || 0))
    .slice(0, 10)
    .map(movie => ({
      id: `news-fallback-${movie.id}`,
      title: cleanText(movie.title).split('|')[0] || 'هەواڵی فیلم',
      description: movieDescription(movie, `نوێترین هەواڵ و زانیاریی فیلم و ئەکتەرەکانی «${cleanText(movie.title)}».`),
      image: movie.image,
      year: movie.year,
      source: 'سینەماچات',
      kind: 'news' as const,
      movie,
    }));
}

function remoteNewsItems(payload: unknown): PanelItem[] {
  const rows = Array.isArray((payload as FeedPayload)?.items) ? (payload as FeedPayload).items! : [];
  return rows.slice(0, 10).flatMap((row, index) => {
    const item = row as Record<string, unknown>;
    const title = cleanText(item.titleKu || item.title);
    const description = cleanText(item.descriptionKu || item.description || title);
    const link = safeRemoteUrl(item.link);
    if (!title || !description || !link) return [];
    return [{
      id: String(item.id || `news-${index}`), title, description,
      image: safeRemoteUrl(item.image), link, source: cleanText(item.source) || 'سەرچاوەی فەرمی',
      publishedAt: cleanText(item.publishedAt), kind: 'news' as const,
    }];
  });
}

function remoteBoxOfficeItems(payload: unknown, catalog: Movie[]): PanelItem[] {
  const rows = Array.isArray((payload as FeedPayload)?.items) ? (payload as FeedPayload).items! : [];
  return rows.slice(0, 10).flatMap((row, index) => {
    const item = row as Record<string, unknown>;
    const title = cleanText(item.title);
    const description = cleanText(item.synopsisKu || item.descriptionKu || item.description || `وەسفی کوردیی «${title}» لە بۆکس ئۆفیس.`);
    if (!title) return [];
    const imdbId = cleanText(item.imdbId);
    const local = catalog.find(movie => (imdbId && (movie as Movie & { imdbId?: string }).imdbId === imdbId)
      || cleanText(movie.title).toLowerCase().includes(title.toLowerCase()));
    return [{
      id: `box-office-${String(item.rank || index + 1)}-${title}`, title, description,
      image: safeRemoteUrl(item.poster), rank: Number(item.rank) || index + 1,
      year: item.year as string | number | undefined, source: 'Box Office Mojo', kind: 'boxoffice' as const,
      movie: local,
    }];
  });
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ku', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function PanelIcon({ kind }: { kind: PanelKind }) {
  if (kind === 'news') return <Newspaper size={15} aria-hidden="true" />;
  if (kind === 'series') return <Tv size={15} aria-hidden="true" />;
  return <Film size={15} aria-hidden="true" />;
}

function PanelDetail({ item, onClose, onOpenMovie }: { item: PanelItem; onClose: () => void; onOpenMovie?: (movie: Movie) => void }) {
  const movie = item.movie;
  const movieMeta = movie ? [
    movie.quality,
    movie.duration,
    movie.rating || movie.imdbRating ? `IMDb ${movie.rating || movie.imdbRating}` : '',
    movie.category,
    movie.language,
  ].map(cleanText).filter(Boolean) : [];
  return <div className="hero-info-modal__backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="hero-info-modal" role="dialog" aria-modal="true" aria-labelledby="hero-info-modal-title" dir="rtl" lang="ckb">
      <button type="button" className="hero-info-modal__close" onClick={onClose} aria-label="داخستن"><X size={17} /></button>
      <div className="hero-info-modal__content">
        <div className="hero-info-modal__poster">
          {item.image ? <img src={item.image} alt="" /> : <PanelIcon kind={item.kind} />}
        </div>
        <div className="hero-info-modal__copy">
          <div className="hero-info-modal__eyebrow"><PanelIcon kind={item.kind} /> {item.source || 'سینەماچات'}</div>
          <h2 id="hero-info-modal-title">{item.rank ? `#${item.rank} · ` : ''}{item.title}</h2>
          <div className="hero-info-modal__meta">
            {item.year && <span><CalendarDays size={13} /> <bdi dir="ltr">{item.year}</bdi></span>}
            {item.publishedAt && <span><CalendarDays size={13} /> {formatDate(item.publishedAt)}</span>}
          </div>
          <p>{item.description}</p>
          {movieMeta.length > 0 && <div className="hero-info-modal__movie-meta">{movieMeta.map(value => <span key={value}>{value}</span>)}</div>}
          {movie?.tags?.length ? <div className="hero-info-modal__tags">{movie.tags.slice(0, 8).map(tag => <span key={tag}>{cleanText(tag)}</span>)}</div> : null}
          <div className="hero-info-modal__actions">
            {item.movie && onOpenMovie && <button type="button" onClick={() => { onClose(); onOpenMovie(item.movie!); }}>
              <Play size={14} fill="currentColor" /> {item.kind === 'series' ? 'سەیرکردنی زنجیرە' : 'سەیرکردنی فیلم'}
            </button>}
            {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> سەرچاوەی بەستراو
            </a>}
          </div>
        </div>
      </div>
    </section>
  </div>;
}

function RotatingPanel({ title, subtitle, items, panel, onSelect }: {
  title: string;
  subtitle: string;
  items: PanelItem[];
  panel: 'yellow' | 'blue' | 'green' | 'orange';
  onSelect: (item: PanelItem) => void;
}) {
  const safeItems = items.length ? items : [{ id: `${panel}-empty`, title, description: 'زانیارییەکان بە زوویی نوێ دەکرێنەوە.', kind: panel === 'orange' ? 'series' : panel === 'green' ? 'news' : panel === 'blue' ? 'boxoffice' : 'movie' } as PanelItem];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const item = safeItems[index % safeItems.length];

  useEffect(() => setIndex(value => Math.min(value, Math.max(0, safeItems.length - 1))), [safeItems.length]);
  useEffect(() => {
    if (paused || safeItems.length < 2) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % safeItems.length), 6500);
    return () => window.clearInterval(timer);
  }, [paused, safeItems.length]);

  return <section className={`hero-info-panel hero-info-panel--${panel}`} aria-label={title}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
    }}>
    <div className="hero-info-panel__heading"><strong>{title}</strong><span>{subtitle}</span></div>
    <button type="button" className="hero-info-panel__body" key={item.id} onClick={() => onSelect(item)}>
      <div className="hero-info-panel__poster">
        {item.image ? <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <PanelIcon kind={item.kind} />}
        {item.rank && <bdi dir="ltr">#{item.rank}</bdi>}
      </div>
      <div className="hero-info-panel__copy">
        <h3 title={item.title}>{item.title}</h3>
        <p title={item.description}>{item.description}</p>
        {(item.year || item.source) && <small>{item.year ? <bdi dir="ltr">{item.year}</bdi> : null}{item.year && item.source ? ' · ' : ''}{item.source}</small>}
        <span className="hero-info-panel__more">زیاتر ببینە</span>
      </div>
    </button>
    <div className="hero-info-panel__footer" dir="ltr">
      <div className="hero-info-panel__dots">
        {safeItems.slice(0, 10).map((entry, position) => <button key={entry.id} type="button" aria-label={`${title} ${position + 1}`}
          aria-current={position === index ? 'true' : undefined} onClick={() => setIndex(position)} />)}
      </div>
      <button type="button" className="hero-info-panel__pause" aria-label={paused ? 'دەستپێکردنەوە' : 'وەستاندن'}
        onClick={() => setPaused(value => !value)}>{paused ? <Play size={10} /> : <Pause size={10} />}</button>
    </div>
  </section>;
}

export function HeroInfoPanels({ catalog, dramaRooms, onOpenMovie }: {
  catalog: Movie[];
  dramaRooms: DramaRoom[];
  onOpenMovie?: (movie: Movie) => void;
}) {
  const movieItems = useMemo(() => chooseMovieItems(catalog), [catalog]);
  const seriesItems = useMemo(() => chooseSeriesItems(catalog, dramaRooms), [catalog, dramaRooms]);
  const fallbackNews = useMemo(() => chooseNewsFallback(catalog), [catalog]);
  const [newsItems, setNewsItems] = useState<PanelItem[] | null>(null);
  const [boxOfficeItems, setBoxOfficeItems] = useState<PanelItem[] | null>(null);
  const [seriesNewsItems, setSeriesNewsItems] = useState<PanelItem[] | null>(null);
  const [selected, setSelected] = useState<PanelItem | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 18000);
      try {
        const [newsResponse, boxResponse] = await Promise.all([
          fetch(resolveApiUrl('/api/entertainment-news'), { headers: { Accept: 'application/json' }, signal: controller.signal }),
          fetch(resolveApiUrl('/api/box-office-top10'), { headers: { Accept: 'application/json' }, signal: controller.signal }),
        ]);
        if (!active) return;
        const [newsPayload, boxPayload] = await Promise.all([newsResponse.json(), boxResponse.json()]);
        const remoteNews = newsResponse.ok ? remoteNewsItems(newsPayload) : [];
        const remoteBoxOffice = boxResponse.ok ? remoteBoxOfficeItems(boxPayload, catalog) : [];
        if (remoteNews.length) setNewsItems(remoteNews);
        if (remoteBoxOffice.length) setBoxOfficeItems(remoteBoxOffice);
        const officialSeriesNews = remoteNews.filter(item => /(?:series|tv|season|drama|زنجیرە|دراما|ئەڵقە)/iu.test(`${item.title} ${item.description}`))
          .map(item => ({ ...item, kind: 'series' as const, rank: undefined }));
        if (officialSeriesNews.length) setSeriesNewsItems(officialSeriesNews);
      } catch { /* Local catalog data remains visible during provider outages. */ }
      finally { window.clearTimeout(timer); }
    };
    void load();
    const refresh = window.setInterval(load, 30 * 60 * 1000);
    return () => { active = false; window.clearInterval(refresh); };
  }, [catalog]);

  return <>
    <div className="hero-info-panels" aria-label="زانیارییە سەرەکییەکانی سینەماچات">
      <RotatingPanel panel="yellow" title="وەسفی فیلمەکان" subtitle="FILMS" items={movieItems} onSelect={setSelected} />
      <RotatingPanel panel="blue" title="بۆکس ئۆفیس · TOP 10" subtitle="BOX OFFICE" items={boxOfficeItems || movieItems} onSelect={setSelected} />
      <RotatingPanel panel="green" title="هەواڵی فیلم و ئەکتەر" subtitle="هەواڵی ڕۆژ" items={newsItems || fallbackNews} onSelect={setSelected} />
      <RotatingPanel panel="orange" title="تۆپ ١٠ی زنجیرە نوێکان" subtitle="TOP SERIES" items={[...(seriesNewsItems || []), ...seriesItems].slice(0, 10)} onSelect={setSelected} />
    </div>
    {selected && <PanelDetail item={selected} onClose={() => setSelected(null)} onOpenMovie={onOpenMovie} />}
  </>;
}
