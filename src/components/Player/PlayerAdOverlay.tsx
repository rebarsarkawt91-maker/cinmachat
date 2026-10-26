import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { defaultPlayerAds, parsePlayerAds, playerAdYouTubeId, PlayerAdClock, type PlayerAd, type PlayerAdsConfig } from '../../lib/playerAds';
import { YouTubePlayerAd } from './YouTubePlayerAd';
import './playerAds.css';

let cache: { config: PlayerAdsConfig; at: number } | undefined;
let pending: Promise<PlayerAdsConfig> | undefined;
export function publishPlayerAdsConfig(config: PlayerAdsConfig) {
  cache = { config: parsePlayerAds(config), at: Date.now() };
}
async function readConfig(request: () => Promise<unknown>) {
  if (cache && Date.now() - cache.at < 60_000) return cache.config;
  return pending ??= request().then(parsePlayerAds).catch(defaultPlayerAds).then(config => {
    cache = { config, at: Date.now() }; return config;
  }).finally(() => { pending = undefined; });
}

function AdMedia({ ad, onError, onPlaying }: { ad: PlayerAd; onError: () => void; onPlaying: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    if (host.current) setShadow(host.current.shadowRoot || host.current.attachShadow({ mode: 'open' }));
  }, []);
  const style = { width: '100%', height: '100%', objectFit: 'contain' as const, pointerEvents: 'none' as const };
  const youtube = ad.kind === 'video' && playerAdYouTubeId(ad.url);
  // Existing film controls inspect descendant videos. Keep ad media outside that
  // DOM tree so volume/seek/fullscreen/CC can never select the advertisement.
  return <div ref={host} style={{ width: '100%', height: '100%' }}>{shadow && createPortal(
    youtube ? <YouTubePlayerAd videoId={youtube} onPlaying={onPlaying} /> : ad.kind === 'image' ? <img src={ad.url} alt="ڕیکلام" style={style} onLoad={onPlaying} onError={onError} /> :
      <video data-player-ad src={ad.url} style={style} autoPlay muted playsInline loop controls={false} disablePictureInPicture disableRemotePlayback onPlaying={onPlaying} onError={onError} />,
    shadow)}</div>;
}

/** Observes playback only. Never sends commands to the movie or its provider. */
export function PlayerAdOverlay({ root, source, playing, currentTime, request }: {
  root: RefObject<HTMLElement>; source: string; playing: boolean; currentTime: number; request: () => Promise<unknown>;
}) {
  const [config, setConfig] = useState(defaultPlayerAds);
  const [visible, setVisible] = useState(-1);
  const [eligible, setEligible] = useState(false);
  const clock = useRef(new PlayerAdClock(config));
  const mediaReady = useRef(false);
  const playback = useRef({ playing, currentTime });
  playback.current = { playing, currentTime };
  useEffect(() => {
    let alive = true;
    const refresh = () => { void readConfig(request).then(value => { if (alive) setConfig(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value); }); };
    refresh(); const timer = window.setInterval(refresh, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [request]);
  useEffect(() => {
    clock.current = new PlayerAdClock(config); mediaReady.current = false; setVisible(-1); setEligible(false);
    if (!config.enabled) return;
    let last = performance.now(), lastTime = playback.current.currentTime, progressAt = -Infinity;
    const timer = window.setInterval(() => {
      const now = performance.now(), delta = (now - last) / 1000; last = now;
      const position = playback.current.currentTime;
      const moved = position - lastTime;
      // Large seek jumps do not count as evidence that a provider is playing.
      if (moved > 0 && moved < 2) progressAt = now;
      lastTime = position;
      const video = root.current?.querySelector<HTMLVideoElement>('video:not([data-player-ad])');
      const nativeFullscreen = video && ((video as any).webkitDisplayingFullscreen || (video as any).webkitPresentationMode === 'fullscreen');
      const ready = video ? !video.paused && !video.ended && !video.seeking && video.readyState >= 3 : now - progressAt < 1500;
      const active = playback.current.playing && ready && !document.hidden && !nativeFullscreen;
      setEligible(Boolean(active));
      const before = clock.current.visible;
      // Download/API startup time must not consume the ad's display duration.
      const next = clock.current.tick(delta, Boolean(active) && (before < 0 || mediaReady.current));
      if (before < 0 && next >= 0) mediaReady.current = false;
      setVisible(next);
    }, 250);
    return () => clearInterval(timer);
  }, [config, source, root]);
  const ad = config.items.filter(item => item.enabled)[visible];
  if (!ad || !eligible || !config.enabled) return null;
  const dismiss = () => { clock.current.dismiss(); setVisible(-1); };
  return <aside className={`cinema-player-ad${playerAdYouTubeId(ad.url) ? ' cinema-player-ad-youtube' : ''}`} aria-label="ڕیکلام" data-testid="player-ad-overlay"
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <div className="cinema-player-ad-label">ڕیکلام</div>
    <button type="button" className="cinema-player-ad-close" aria-label="داخستنی ڕیکلام" onClick={dismiss}>×</button>
    <AdMedia key={ad.url} ad={ad} onError={dismiss} onPlaying={() => { mediaReady.current = true; }} />
  </aside>;
}
