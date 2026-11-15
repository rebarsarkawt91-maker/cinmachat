import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { boxOfficeSeed, type BoxOfficeChart } from '../data/boxOfficeSeed';
import { resolveApiUrl } from '../services/backendConfig';

const REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;
let chart = boxOfficeSeed;
let expires = 0;
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function refreshChart() {
  if (Date.now() < expires) return;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(resolveApiUrl('/api/box-office'), { signal: AbortSignal.timeout(18000) });
      if (!response.ok) throw new Error('Chart unavailable');
      const data = await response.json() as BoxOfficeChart;
      if (data.source !== 'Box Office Mojo' || !Array.isArray(data.items) || data.items.length !== 5
        || typeof data.period !== 'string' || !Number.isFinite(Date.parse(data.fetchedAt))
        || data.items.some((item, index) => !item || item.rank !== index + 1 || typeof item.title !== 'string'
          || typeof item.weekendGross !== 'string' || typeof item.poster !== 'string')) throw new Error('Invalid chart');
      chart = data;
    } catch {
      chart = { ...chart, stale: true };
    }
    expires = Date.now() + (chart.stale ? RETRY_MS : REFRESH_MS);
    listeners.forEach(listener => listener());
  })().finally(() => { pending = undefined; });
  return pending;
}

export function boxOfficePosterUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'm.media-amazon.com' && url.pathname.startsWith('/images/')) return url.href;
  } catch { /* The title remains visible when a poster is missing. */ }
  return '';
}

/** Both Box Office views read the same snapshot and share each network refresh. */
export function useBoxOfficeChart(root: RefObject<HTMLElement>, rootMargin = '0px') {
  const currentChart = useSyncExternalStore(subscribe, () => chart, () => boxOfficeSeed);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let intersecting = typeof IntersectionObserver === 'undefined';
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      intersecting = entries.some(entry => entry.isIntersecting);
      update();
    }, { rootMargin });
    observer?.observe(element);
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [root, rootMargin]);

  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      await refreshChart();
      if (!disposed) timer = setTimeout(refresh, Math.max(250, expires - Date.now()));
    };
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [visible]);

  return { chart: currentChart, visible };
}
