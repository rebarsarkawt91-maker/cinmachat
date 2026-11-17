import { useEffect, useMemo, useState } from 'react';
import { Film, Pause, Play, Tv } from 'lucide-react';
import type { Movie } from '../../types';
import { resolveApiUrl } from '../../services/backendConfig';
import '../../styles/heroKurdishTicker.css';

type HeroTickerItem = {
  id: string;
  title: string;
  description: string;
  image?: string;
  rank?: number;
  link?: string;
  source?: string;
};

type DramaRoom = {
  dramas?: string[];
};

const hasKurdish = (value: string) => /[ەێڕڵۆۆڤگ]/u.test(value);

function cleanText(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackDescription(title: string, kind: 'news' | 'drama'): string {
  return kind === 'drama'
    ? `وەسفی کوردی و زانیاریی درامای «${title}» لە سینەماچات بەردەستە.`
    : `نوێترین زانیاریی فیلم و ئەکتەرەکانی «${title}» لە سینەماچات ببینە.`;
}

function safeRemoteUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === 'https:' || (url.origin === window.location.origin && url.pathname.startsWith('/'))) return url.toString();
  } catch { /* Ignore malformed feed values and keep the local fallback. */ }
  return undefined;
}

function remoteNewsItems(payload: unknown): HeroTickerItem[] {
  const rows = Array.isArray((payload as { items?: unknown[] })?.items) ? (payload as { items: unknown[] }).items : [];
  return rows.slice(0, 10).flatMap((row, index) => {
    const item = row as Record<string, unknown>;
    const title = cleanText(item.titleKu || item.title);
    const description = cleanText(item.descriptionKu || item.description || title);
    const link = safeRemoteUrl(item.link);
    if (!title || !description || !link) return [];
    return [{ id: String(item.id || `remote-news-${index}`), title, description,
      image: safeRemoteUrl(item.image), link, source: cleanText(item.source) }];
  });
}

function remoteBoxOfficeItems(payload: unknown): HeroTickerItem[] {
  const rows = Array.isArray((payload as { items?: unknown[] })?.items) ? (payload as { items: unknown[] }).items : [];
  return rows.slice(0, 10).flatMap((row, index) => {
    const item = row as Record<string, unknown>;
    const title = cleanText(item.title);
    const description = cleanText(item.synopsisKu || item.descriptionKu || item.description || title);
    if (!title || !description) return [];
    return [{ id: `remote-box-office-${String(item.rank || index + 1)}-${title}`,
      title, description, image: safeRemoteUrl(item.poster), rank: Number(item.rank) || index + 1,
      source: 'Box Office Mojo' }];
  });
}

function isDrama(movie: Movie): boolean {
  const labels = [movie.category, ...(Array.isArray(movie.tags) ? movie.tags : [])]
    .map(value => String(value || '').trim().toLowerCase());
  return labels.some(value => value === 'دراما' || value === 'drama' || value === 'series')
    || /(?:دراما|ئەڵقە|episode|\bep\.?\s*\d+)/iu.test(movie.title || '');
}

function chooseNews(catalog: Movie[]): HeroTickerItem[] {
  return [...catalog]
    .filter(movie => movie?.id && movie?.title)
    .sort((a, b) => (Number(b.trendingScore) || Number(b.views) || 0) - (Number(a.trendingScore) || Number(a.views) || 0))
    .slice(0, 10)
    .map(movie => {
      const title = cleanText(movie.title);
      const description = cleanText(movie.description);
      return {
        id: `news-${movie.id}`,
        title,
        description: hasKurdish(description) ? description : fallbackDescription(title, 'news'),
        image: movie.image,
      };
    });
}

function chooseDramas(catalog: Movie[], rooms: DramaRoom[]): HeroTickerItem[] {
  const byId = new Map(catalog.filter(movie => movie?.id).map(movie => [movie.id, movie]));
  const roomIds = rooms.flatMap(room => Array.isArray(room?.dramas) ? room.dramas : []);
  const ids = [...new Set(roomIds)].filter(id => byId.has(id));
  const source = (ids.length ? ids.map(id => byId.get(id)!) : catalog.filter(isDrama));
  return source
    .filter(movie => movie?.id && movie?.title)
    .sort((a, b) => (Number(b.trendingScore) || Number(b.views) || 0) - (Number(a.trendingScore) || Number(a.views) || 0))
    .slice(0, 10)
    .map((movie, index) => {
      const title = cleanText(movie.title);
      const description = cleanText(movie.description);
      return {
        id: `drama-${movie.id}`,
        title,
        description: hasKurdish(description) ? description : fallbackDescription(title, 'drama'),
        image: movie.image,
        rank: index + 1,
      };
    });
}

function RotatingPanel({ title, items, kind }: { title: string; items: HeroTickerItem[]; kind: 'news' | 'drama' }) {
  const safeItems = items.length ? items : [{
    id: `${kind}-empty`,
    title: kind === 'drama' ? 'تۆپ ١٠ی دراماکان' : 'هەواڵی فیلم و ئەکتەر',
    description: 'زانیارییەکان بە زوویی نوێ دەکرێنەوە.',
  }];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const item = safeItems[index % safeItems.length];

  useEffect(() => setIndex(value => Math.min(value, Math.max(0, safeItems.length - 1))), [safeItems.length]);
  useEffect(() => {
    if (paused || safeItems.length < 2) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % safeItems.length), 6500);
    return () => window.clearInterval(timer);
  }, [paused, safeItems.length]);

  return <section className="hero-kurdish-ticker" dir="rtl" lang="ckb"
    aria-label={title} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
    }}>
    <div className="hero-kurdish-ticker__heading">
      <strong>{title}</strong>
      <span>{kind === 'drama' ? `TOP 10${item.source ? ` · ${item.source}` : ''}` : (item.source || 'نوێ')}</span>
    </div>
    <div className="hero-kurdish-ticker__body" key={item.id}>
      {item.link ? <a className="hero-kurdish-ticker__poster" href={item.link} target="_blank" rel="noopener noreferrer" aria-label={item.title}>
        {item.image ? <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : kind === 'drama' ? <Tv size={18} /> : <Film size={18} />}
      </a> : <div className="hero-kurdish-ticker__poster">
        {item.image ? <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : kind === 'drama' ? <Tv size={18} /> : <Film size={18} />}
      </div>}
      <div className="hero-kurdish-ticker__copy">
        <h3 title={item.title}>{item.link ? <a className="hero-kurdish-ticker__link" href={item.link} target="_blank" rel="noopener noreferrer">{item.rank ? `#${item.rank} · ` : ''}{item.title}</a> : <>{item.rank ? `#${item.rank} · ` : ''}{item.title}</>}</h3>
        <p title={item.description}>{item.description}</p>
      </div>
    </div>
    <div className="hero-kurdish-ticker__footer" dir="ltr">
      <div className="hero-kurdish-ticker__dots">
        {safeItems.slice(0, 10).map((entry, position) => <button key={entry.id} type="button"
          aria-label={`${title} ${position + 1}`} aria-current={position === index ? 'true' : undefined}
          onClick={() => setIndex(position)} />)}
      </div>
      <button type="button" className="hero-kurdish-ticker__pause" aria-label={paused ? 'دەستپێکردنەوە' : 'وەستاندن'}
        onClick={() => setPaused(value => !value)}>{paused ? <Play size={10} /> : <Pause size={10} />}</button>
    </div>
  </section>;
}

export function HeroKurdishTickerRail({ catalog, dramaRooms }: { catalog: Movie[]; dramaRooms: DramaRoom[] }) {
  const fallbackNews = useMemo(() => chooseNews(catalog), [catalog]);
  const fallbackDramas = useMemo(() => chooseDramas(catalog, dramaRooms), [catalog, dramaRooms]);
  const [news, setNews] = useState<HeroTickerItem[] | null>(null);
  const [boxOffice, setBoxOffice] = useState<HeroTickerItem[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 18000);
      try {
        const [newsResponse, boxOfficeResponse] = await Promise.all([
          fetch(resolveApiUrl('/api/entertainment-news'), { headers: { Accept: 'application/json' }, signal: controller.signal }),
          fetch(resolveApiUrl('/api/box-office-top10'), { headers: { Accept: 'application/json' }, signal: controller.signal }),
        ]);
        if (!active || !newsResponse.ok || !boxOfficeResponse.ok) return;
        const [newsPayload, boxOfficePayload] = await Promise.all([newsResponse.json(), boxOfficeResponse.json()]);
        const remoteNews = remoteNewsItems(newsPayload);
        const remoteBoxOffice = remoteBoxOfficeItems(boxOfficePayload);
        if (remoteNews.length && active) setNews(remoteNews);
        if (remoteBoxOffice.length && active) setBoxOffice(remoteBoxOffice);
      } catch { /* Local catalog fallbacks keep the hero useful when feeds are unavailable. */ }
      finally { window.clearTimeout(timer); }
    };
    void load();
    const refresh = window.setInterval(load, 30 * 60 * 1000);
    return () => { active = false; window.clearInterval(refresh); };
  }, []);

  return <aside className="hero-kurdish-ticker-rail" aria-label="هەواڵ و تۆپی دراماکان">
    <RotatingPanel title="هەواڵی ئەکتەر و فیلمەکان" items={news || fallbackNews} kind="news" />
    <RotatingPanel title="وەسفی کوردی بۆکس ئۆفیس · TOP 10" items={boxOffice || fallbackDramas} kind="drama" />
  </aside>;
}
