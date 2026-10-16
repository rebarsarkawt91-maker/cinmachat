import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Movie } from '../../types';
import { livePreviewWindow, topLivePreviewIds, wrapPreviewIndex } from '../../utils/liveMoviePreview';
import '../../styles/liveMoviePreview.css';

interface Props {
  movies: Movie[];
  startId?: string;
  getLiveViewers: (movie: Movie) => number;
  renderMovie: (movie: Movie, priority?: boolean) => ReactNode;
  suspended?: boolean;
}

/** Home preview only. Reuses the unchanged MovieCard and all its action handlers. */
export function LiveMoviePreview({ movies, startId, getLiveViewers, renderMovie, suspended = false }: Props) {
  const root = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null);
  const position = useRef(0), manualTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [manual, setManual] = useState(false);
  const [inView, setInView] = useState(true), [visible, setVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const desiredPins = topLivePreviewIds(movies, getLiveViewers).join('\n');
  const [pinIds, setPinIds] = useState(() => desiredPins ? desiredPins.split('\n') : []);
  const interacting = hovered || focused || manual;
  // Avoid moving a card out from under a pointer or keyboard while it is in use.
  useLayoutEffect(() => {
    if (!interacting) setPinIds(previous => previous.join('\n') === desiredPins ? previous : desiredPins ? desiredPins.split('\n') : []);
  }, [desiredPins, interacting]);
  const pinned = pinIds.map(id => movies.find(movie => movie.id === id)).filter((movie): movie is Movie => !!movie);
  const moving = useMemo(() => movies.filter(movie => !pinIds.includes(movie.id)), [movies, pinIds]);
  const rosterKey = moving.map(movie => movie.id).join('\n');
  const [layout, setLayout] = useState({ card: 176, gap: 32, available: 1216 });
  const [head, setHead] = useState(0);
  const slot = layout.card + layout.gap;
  const slots = Math.max(1, Math.ceil((layout.available + layout.gap) / slot - 0.01));
  const looping = !reduced && moving.length > slots;
  const windowMovies = livePreviewWindow(moving, head, reduced ? moving.length : slots + 2);

  useLayoutEffect(() => {
    const measure = () => {
      if (!root.current) return;
      const width = root.current.getBoundingClientRect().width, screen = window.innerWidth;
      const columns = screen >= 1024 ? 6 : screen >= 768 ? 4 : screen >= 640 ? 3 : 2;
      const gap = screen >= 768 ? 32 : 24;
      const card = Math.max(80, (width - gap * (columns - 1)) / columns);
      const available = screen < 768 ? width : Math.max(card, width - pinned.length * (card + gap));
      setLayout(old => Math.abs(old.card - card) < 0.1 && Math.abs(old.available - available) < 0.1 && old.gap === gap
        ? old : { card, gap, available });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (root.current) observer?.observe(root.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [pinned.length]);

  useLayoutEffect(() => {
    const anchor = Math.max(0, moving.findIndex(movie => movie.id === startId));
    setHead(looping ? wrapPreviewIndex(anchor - 1, moving.length) : 0);
    position.current = looping ? slot : reduced ? anchor * slot : 0;
    if (viewport.current) viewport.current.scrollLeft = position.current;
  }, [rosterKey, startId, slot, looping, reduced]);
  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollLeft = position.current;
  }, [head]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches), visibility = () => setVisible(!document.hidden);
    media.addEventListener?.('change', motion);
    document.addEventListener('visibilitychange', visibility);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      setInView(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: '100px' });
    if (root.current) observer?.observe(root.current);
    return () => { media.removeEventListener?.('change', motion); document.removeEventListener('visibilitychange', visibility); observer?.disconnect(); clearTimeout(manualTimer.current); };
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !looping || interacting || !visible || !inView || suspended) return;
    let frame = 0, last = 0;
    position.current = element.scrollLeft;
    const tick = (now: number) => {
      if (last) {
        // Decreasing native scrollLeft moves the real cards to the RIGHT.
        // Recycling only the offscreen edge avoids clones and duplicate actions.
        position.current -= Math.min(50, now - last) * 0.022;
        if (position.current <= 0) {
          position.current += slot;
          flushSync(() => setHead(previous => wrapPreviewIndex(previous - 1, moving.length)));
        }
        element.scrollLeft = position.current;
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [looping, interacting, visible, inView, suspended, slot, rosterKey]);

  const holdManual = () => {
    setManual(true); clearTimeout(manualTimer.current);
    manualTimer.current = setTimeout(() => setManual(false), 1800);
  };
  const style = { '--live-preview-card': `${layout.card}px`, '--live-preview-gap': `${layout.gap}px` } as CSSProperties;
  return <div className="live-movie-preview" data-testid="live-movie-preview" ref={root} style={style} dir="ltr"
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onPointerDown={event => { if (event.pointerType !== 'mouse') holdManual(); }}
    onPointerUp={event => { if (event.pointerType !== 'mouse') holdManual(); }}
    onPointerCancel={holdManual} onWheel={holdManual}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    {!!moving.length && <div className="live-movie-preview__viewport" ref={viewport} dir="ltr"
      data-testid="live-preview-moving" role="region" aria-label="شریتی فیلمەکان">
      <div className="live-movie-preview__track" role="list">
        {windowMovies.map((movie, index) => <div className="live-movie-preview__card" key={movie.id} dir="rtl"
          data-preview-movie={movie.id} role="listitem">
          {renderMovie(movie, (!looping || index > 0) && index <= slots)}
        </div>)}
      </div>
    </div>}
    {!!pinned.length && <div className="live-movie-preview__pins" data-testid="live-preview-pinned" dir="rtl"
      role="region" aria-label="فیلمەکانی زۆرترین بینەری ڕاستەوخۆ">
      {pinned.map((movie, index) => <div className="live-movie-preview__card" key={movie.id} dir="rtl"
        data-preview-movie={movie.id} data-live-rank={index + 1}>
        {renderMovie(movie, true)}
      </div>)}
    </div>}
  </div>;
}
