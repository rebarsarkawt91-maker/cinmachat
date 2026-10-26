import { useEffect, useRef, useState } from 'react';
import { loadYouTubeAPI } from '../../utils/youtube';

/** Dedicated ad frame inside the ad's shadow root; never shares the film refs. */
export function YouTubePlayerAd({ videoId, onPlaying }: { videoId: string; onPlaying: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let alive = true, player: any;
    const unavailable = () => { if (alive) { setError(true); onPlaying(); } };
    const deadline = window.setTimeout(unavailable, 15000);
    const iframe = document.createElement('iframe');
    const query = new URLSearchParams({ autoplay: '1', mute: '1', controls: '0', playsinline: '1', fs: '0', disablekb: '1', rel: '0', loop: '1', playlist: videoId, enablejsapi: '1', origin: window.location.origin });
    iframe.src = `https://www.youtube.com/embed/${videoId}?${query}`;
    iframe.title = 'ڕیکلامی یوتیوب';
    iframe.allow = 'autoplay; encrypted-media';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.tabIndex = -1;
    iframe.style.cssText = 'width:100%;height:100%;border:0;pointer-events:none';
    container.appendChild(iframe);
    void loadYouTubeAPI().then(() => {
      if (!alive) return;
      const YT = (window as any).YT;
      if (!YT?.Player) { unavailable(); return; }
      player = new YT.Player(iframe, { events: {
        onReady: (event: any) => { if (alive) { event.target.mute(); event.target.playVideo(); } },
        onStateChange: (event: any) => { if (alive && event.data === 1) { clearTimeout(deadline); setPlaying(true); onPlaying(); } },
        onError: unavailable,
        onAutoplayBlocked: unavailable,
      } });
    }).catch(unavailable);
    return () => { alive = false; clearTimeout(deadline); try { player?.destroy(); } catch { /* Isolated ad cleanup only. */ } container.replaceChildren(); };
  }, [videoId]);
  return <div data-youtube-ad-state={error ? 'unavailable' : playing ? 'playing' : 'loading'} style={{ position: 'relative', width: '100%', height: '100%' }}>
    <div ref={host} style={{ width: '100%', height: '100%' }} />
    {error && <p role="status" style={{ position: 'absolute', inset: 0, margin: 0, padding: 16, background: '#111', color: 'white', fontSize: 12, direction: 'rtl' }}>ئەم ڤیدیۆیە لە پلەیەری دەرەوەی یوتیوب بەردەست نییە.</p>}
  </div>;
}
