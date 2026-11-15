import { useEffect, useRef, useState } from 'react';
import { Film, Pause, Play } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { lookupBoxOfficeSynopsis } from '../../data/boxOfficeSynopses';
import { boxOfficePosterUrl, useBoxOfficeChart } from '../../hooks/useBoxOfficeChart';
import { plainSeoText } from '../../lib/catalogSeo';
import type { Movie } from '../../types';
import '../../styles/heroBoxOfficeCard.css';

const ROTATION_MS = 7000;
type CatalogFilm = Pick<Movie, 'title' | 'year' | 'description'> & { imdbId?: string };

export function HeroBoxOfficeCard({ catalog }: { catalog: CatalogFilm[] }) {
  const root = useRef<HTMLElement>(null);
  const { chart, visible } = useBoxOfficeChart(root);
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const [failedPoster, setFailedPoster] = useState('');
  const rotationPaused = paused ?? Boolean(reduceMotion);
  const movie = chart.items[index];
  const poster = boxOfficePosterUrl(movie.poster);
  const synopsis = plainSeoText(movie.synopsisKu) || lookupBoxOfficeSynopsis(movie.imdbId) || (() => {
    const title = movie.title.toLowerCase().trim();
    const match = catalog.find(film =>
      movie.imdbId && film.imdbId
        ? film.imdbId === movie.imdbId
        : movie.year !== null && String(film.year) === String(movie.year)
          && film.title?.split('|').some(part => part.toLowerCase().trim() === title));
    const description = plainSeoText(match?.description);
    // Only use existing Sorani copy. The chart's title service supplies no plot.
    return /[ەێڕڵۆ]/.test(description) ? description : '';
  })();

  useEffect(() => {
    if (!visible || rotationPaused || hovered || focused) return;
    const timer = setTimeout(() => setIndex(value => (value + 1) % chart.items.length), ROTATION_MS);
    return () => clearTimeout(timer);
  }, [visible, rotationPaused, hovered, focused, chart.items, index]);

  return (
    <aside ref={root} className="hero-box-office kurdish-text" dir="rtl" lang="ckb"
      aria-label="پێنج فیلمی سەرەوەی بۆکس ئۆفیس"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}>
      <div className="hero-box-office__slide" key={movie.title}>
        <div className="hero-box-office__poster">
          <Film size={22} aria-hidden="true" />
          {poster && failedPoster !== poster &&
            <img src={poster} width={66} height={99} alt="" loading="lazy" decoding="async"
              onError={() => setFailedPoster(poster)} />}
        </div>
        <div className="hero-box-office__copy">
          <div className="hero-box-office__meta">
            <span>بۆکس ئۆفیس <bdi dir="ltr">TOP 5</bdi></span>
            <bdi className="hero-box-office__rank" dir="ltr">#{movie.rank}</bdi>
          </div>
          <h2 dir="auto" title={movie.title}>{movie.title}</h2>
          <p title={synopsis || undefined}>{synopsis || 'وەسفی کوردی بەردەست نییە.'}</p>
        </div>
      </div>
      <div className="hero-box-office__footer">
        <span className="hero-box-office__period" title={chart.stale ? 'دوا ڕیزبەندیی هەڵگیراو' : undefined}>
          {chart.stale ? 'هەڵگیراو · ' : ''}<bdi dir="ltr">{chart.period}</bdi>
        </span>
        <div className="hero-box-office__controls" dir="ltr">
          {chart.items.map((item, position) => (
            <button key={item.rank} type="button" className="hero-box-office__dot"
              aria-label={item.title} aria-current={position === index ? 'true' : undefined}
              onClick={() => setIndex(position)} />
          ))}
          <button type="button" className="hero-box-office__rotation"
            aria-label={rotationPaused ? 'دەستپێکردنەوەی گۆڕینی فیلمەکان' : 'وەستاندنی گۆڕینی فیلمەکان'}
            onClick={() => setPaused(!rotationPaused)}>
            {rotationPaused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
