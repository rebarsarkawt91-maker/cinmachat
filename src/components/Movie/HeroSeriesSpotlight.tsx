import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Tv } from 'lucide-react';
import type { Movie } from '../../types';
import '../../styles/heroSeriesSpotlight.css';

type DramaRoom = { dramas?: string[]; title?: string; description?: string };

type SeriesSpotlightItem = {
  id: string;
  title: string;
  description: string;
  image?: string;
  year?: string;
  region: string;
  rating?: string;
  trending: boolean;
};

const clean = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function isSeries(movie: Movie): boolean {
  const postType = (movie as Movie & { postType?: string }).postType;
  const haystack = [movie.type, movie.category, postType, ...(Array.isArray(movie.tags) ? movie.tags : []), movie.title]
    .map(value => String(value || '').toLowerCase()).join(' ');
  return movie.type === 'tv' || /(?:series|tv show|drama|season|episode|ئەڵقە|دراما|زنجیرە)/iu.test(haystack);
}

function regionForText(value: string): string {
  const haystack = value.toLowerCase();
  if (/(?:korean|korea|south korea|کورى|کۆرى|کۆری|کۆریای باشوور)/iu.test(haystack)) return 'کۆری';
  if (/(?:chinese|china|mandarin|چین|چینی)/iu.test(haystack)) return 'چینی';
  return 'بیانی';
}

function regionFor(movie: Movie, roomRegion?: string): string {
  const postType = (movie as Movie & { postType?: string }).postType;
  const haystack = [movie.language, movie.category, postType, ...(Array.isArray(movie.tags) ? movie.tags : []), movie.title]
    .map(value => String(value || '').toLowerCase()).join(' ');
  return roomRegion || regionForText(haystack);
}

function chooseSeries(catalog: Movie[], rooms: DramaRoom[]): SeriesSpotlightItem[] {
  const byId = new Map(catalog.filter(movie => movie?.id).map(movie => [movie.id, movie]));
  const roomIds = rooms.flatMap(room => Array.isArray(room?.dramas) ? room.dramas : []);
  const roomRegions = new Map<string, string>();
  for (const room of rooms) {
    const region = regionForText(`${room.title || ''} ${room.description || ''}`);
    if (region !== 'بیانی') for (const id of room.dramas || []) roomRegions.set(id, region);
  }
  // Membership in a Drama Room is the authoritative series signal; many
  // imported episodes retain `type: movie` and only expose `postType: دراما`.
  const roomSeries = [...new Set(roomIds)].map(id => byId.get(id)).filter((movie): movie is Movie => Boolean(movie));
  const source = [...roomSeries, ...catalog.filter(movie => isSeries(movie) && !roomIds.includes(movie.id))];
  const unique = new Map(source.map(movie => [movie.id, movie]));
  return [...unique.values()]
    .sort((a, b) => {
      const score = (movie: Movie) => (movie.isTrending ? 100000 : 0) + (Number(movie.trendingScore) || 0) * 10 + (Number(movie.views) || 0) + (Number.parseInt(String(movie.year || ''), 10) || 0);
      return score(b) - score(a);
    })
    .slice(0, 10)
    .map(movie => ({
      id: movie.id,
      title: clean(movie.title).split('|')[0] || 'زنجیرەی نوێ',
      description: clean(movie.description) || `زنجیرەیەکی ${regionFor(movie)}ی نوێ و بەناوبانگە.`,
      image: movie.image,
      year: clean(movie.year),
      region: regionFor(movie, roomRegions.get(movie.id)),
      rating: clean(movie.rating || movie.imdbRating),
      trending: Boolean(movie.isTrending || Number(movie.trendingScore) > 0),
    }));
}

export function HeroSeriesSpotlight({ catalog, dramaRooms }: { catalog: Movie[]; dramaRooms: DramaRoom[] }) {
  const items = useMemo(() => chooseSeries(catalog, dramaRooms), [catalog, dramaRooms]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = items[index % Math.max(items.length, 1)];

  useEffect(() => setIndex(value => Math.min(value, Math.max(items.length - 1, 0))), [items.length]);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % items.length), 7000);
    return () => window.clearInterval(timer);
  }, [items.length, paused]);

  if (!current) return null;
  return <section className="hero-series-spotlight" dir="rtl" lang="ckb" aria-label="زنجیرە نوێ و ترێندکراوەکان"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
    }}>
    <div className="hero-series-spotlight__heading">
      <strong>زنجیرە نوێ و ترێندکراوەکان</strong>
      <span>TOP SERIES</span>
    </div>
    <div className="hero-series-spotlight__body" key={current.id}>
      <div className="hero-series-spotlight__poster">
        {current.image ? <img src={current.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Tv size={20} aria-hidden="true" />}
        <span className="hero-series-spotlight__region">{current.region}</span>
      </div>
      <div className="hero-series-spotlight__copy">
        <div className="hero-series-spotlight__meta"><span>زنجیرە · Series</span><bdi dir="ltr">{current.year || 'نوێ'}</bdi></div>
        <h2 title={current.title}>{current.title}</h2>
        <p title={current.description}>{current.description}</p>
        <small>{current.rating ? `IMDb ${current.rating} · ` : ''}{current.trending ? 'ترێندکراو' : 'نوێترین'}</small>
      </div>
    </div>
    <div className="hero-series-spotlight__footer" dir="ltr">
      <div className="hero-series-spotlight__dots">
        {items.map((item, position) => <button key={item.id} type="button" aria-label={`زنجیرە ${position + 1}`}
          aria-current={position === index ? 'true' : undefined} onClick={() => setIndex(position)} />)}
      </div>
      <button type="button" className="hero-series-spotlight__pause" aria-label={paused ? 'دەستپێکردنەوە' : 'وەستاندن'}
        onClick={() => setPaused(value => !value)}>{paused ? <Play size={10} /> : <Pause size={10} />}</button>
    </div>
  </section>;
}
