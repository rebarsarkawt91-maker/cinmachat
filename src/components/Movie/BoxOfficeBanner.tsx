import { useEffect, useRef, useState } from 'react';
import { Edit3 } from 'lucide-react';
import { boxOfficeSeed, type BoxOfficeChart, type BoxOfficeMovie } from '../../data/boxOfficeSeed';
import { resolveApiUrl } from '../../services/backendConfig';
import '../../styles/boxOfficeBanner.css';

const REFRESH_MS = 6 * 60 * 60 * 1000;
let cached = boxOfficeSeed, expires = 0, pending: Promise<BoxOfficeChart> | undefined;
async function loadChart(): Promise<BoxOfficeChart> {
  if (Date.now() < expires) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(resolveApiUrl('/api/box-office'), { signal: AbortSignal.timeout(18000) });
      if (!response.ok) throw new Error('Chart unavailable');
      const data = await response.json() as BoxOfficeChart;
      if (data.source !== 'Box Office Mojo' || !Array.isArray(data.items) || data.items.length !== 5
        || typeof data.period !== 'string' || !Number.isFinite(Date.parse(data.fetchedAt))
        || data.items.some((item, index) => item.rank !== index + 1 || typeof item.title !== 'string'
          || typeof item.weekendGross !== 'string' || typeof item.poster !== 'string')) throw new Error('Invalid chart');
      cached = data;
      expires = Date.now() + (data.stale ? 15 * 60 * 1000 : REFRESH_MS);
    } catch { cached = { ...cached, stale: true }; expires = Date.now() + 15 * 60 * 1000; }
    finally { pending = undefined; }
    return cached;
  })();
  return pending;
}

function Poster({ film }: { film: BoxOfficeMovie }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [film.poster]);
  let safePoster = '';
  try {
    const url = new URL(film.poster);
    if (url.protocol === 'https:' && url.hostname === 'm.media-amazon.com' && url.pathname.startsWith('/images/')) safePoster = url.href;
  } catch { /* Titles stay readable even when an upstream poster is missing. */ }
  return <div className="box-office-card">
    <div className="box-office-poster">
      <span className="box-office-placeholder" aria-hidden="true">🎬</span>
      {safePoster && !failed && <img src={safePoster} alt="" width={80} height={120} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
      <span className="box-office-rank">{film.rank}</span>
    </div>
    <span className="box-office-title" dir="auto">{film.title}</span>
    <span className="box-office-gross" dir="ltr">{film.weekendGross}</span>
  </div>;
}

/** Informational only: neither the cards nor the retained image navigate/play. */
export function BoxOfficeBanner({ image, onEditImage }: { image: string; onEditImage?: () => void }) {
  const [chart, setChart] = useState(cached);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false, active = false, timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (disposed || !active || document.hidden) return;
      const data = await loadChart();
      if (!disposed) {
        setChart(data);
        clearTimeout(timer);
        timer = setTimeout(refresh, data.stale ? 15 * 60 * 1000 : REFRESH_MS);
      }
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      active = entries.some(entry => entry.isIntersecting);
      if (active) void refresh();
    }, { rootMargin: '250px' });
    if (observer && root.current) observer.observe(root.current);
    else { active = true; void refresh(); }
    document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; clearTimeout(timer); observer?.disconnect(); document.removeEventListener('visibilitychange', visible); };
  }, []);
  const group = (copy: number) => <ol className="box-office-group" aria-hidden={copy > 0 ? true : undefined}>
    {[...chart.items, ...chart.items].map((film, index) => <li key={`${film.rank}-${index}`} aria-hidden={index >= chart.items.length ? true : undefined}>
      <Poster film={film} />
    </li>)}
  </ol>;
  return <div className="box-office-banner" data-testid="box-office-banner" ref={root} dir="ltr">
    <div className="box-office-ad">
      <img src={image} alt="ڕیکلام" loading="lazy" decoding="async" />
      <span>ADVERTISEMENT</span>
      {onEditImage && <button type="button" onClick={onEditImage} aria-label="Edit banner image"
        title="گۆڕینی وێنەی بانەر"
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-red-500/70 bg-black/80 px-2 py-1 text-[10px] font-black text-white shadow-lg hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        <Edit3 className="h-3 w-3" aria-hidden="true" /> EDIT
      </button>}
    </div>
    <section className="box-office-panel" aria-label="فیلمەکانی بۆکس ئۆفیس" dir="rtl">
      <h2 className="kurdish-text">فیلمەکانی بۆکس ئۆفیس <span>TOP 5 · US</span></h2>
      <div className="box-office-window" dir="ltr">
        <div className="box-office-track">{group(0)}{group(1)}</div>
      </div>
      <p className="box-office-source" dir="ltr"><span>Source: {chart.source} · {chart.period}</span>
        {chart.stale && <span className="kurdish-text" dir="rtl">دوا ڕیزبەندیی هەڵگیراو · {chart.fetchedAt.slice(0, 10)}</span>}
      </p>
    </section>
  </div>;
}
