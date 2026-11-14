type ProviderKind = 'proxy' | 'braflix' | null;

function providerKind(url: string | null | undefined): ProviderKind {
  try {
    const source = new URL(url || '');
    if (source.protocol !== 'https:' || !source.pathname.startsWith('/embed/')) return null;
    if (source.hostname === 'proxy.garageband.rocks') return 'proxy';
    if (source.hostname === 'braflix.dev') return 'braflix';
    return null;
  } catch { return null; }
}

/** Known provider embeds expose their own transport controls through postMessage. */
export function usesProviderTouchControls(url: string | null | undefined): boolean {
  return providerKind(url) !== null;
}

/** JWPlayer restarts its loader on each seek; commit a drag only on release. */
export function providerSeeksOnRelease(url: string | null | undefined): boolean {
  return providerKind(url) === 'braflix';
}

/** Preserve media/scripts/storage, but deny popups and parent navigation even
 * when a provider advertisement receives a trusted click. */
export function providerFrameSandbox(url: string | null | undefined): string | undefined {
  return providerKind(url) === 'braflix'
    ? 'allow-scripts allow-same-origin allow-forms allow-presentation'
    : undefined;
}

export function providerAction(command: string): string {
  return ({ playVideo: 'play', pauseVideo: 'pause', unMute: 'unmute' } as Record<string, string>)[command] || command;
}

// Braflix reads event.data.type without JSON.parse. Preserve the object on the
// wire; the proxy's legacy receiver instead expects a JSON string.
export type ProviderMessage = string | {
  type: 'PLAYER_COMMAND';
  command: string;
  value?: number;
};

/** Provider-specific seek transport. Braflix uses PLAYER_COMMAND; the proxy
 * relay uses the legacy VidSrc-style `player/action` message. */
export function providerSeekMessage(url: string | null | undefined, seconds: number): ProviderMessage | null {
  const kind = providerKind(url);
  if (!kind) return null;
  const target = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (kind === 'braflix') {
    return { type: 'PLAYER_COMMAND', command: 'seek', value: target };
  }
  return JSON.stringify({ player: true, action: `seek${Math.floor(target)}` });
}

/** Provider-specific play/pause/mute transport used after a caption reload and
 * by the CinemaChat toolbar. */
export function providerCommandMessage(url: string | null | undefined, command: string, value?: number): ProviderMessage | null {
  const kind = providerKind(url);
  if (!kind) return null;
  const action = providerAction(command);
  if (kind === 'braflix') {
    return { type: 'PLAYER_COMMAND', command: action,
      ...(typeof value === 'number' && Number.isFinite(value) ? { value } : {}) };
  }
  return JSON.stringify({ player: true, action });
}

export interface ProviderPlaybackEvent {
  currentTime: number;
  duration: number;
  status: 'playing' | 'paused' | 'buffering' | 'ended' | null;
}

/** Read real media metadata only; iframe/title loading is not playback readiness.
 * The caller must separately authenticate the message's source window and origin.
 */
export function readProviderPlaybackEvent(payload: unknown): ProviderPlaybackEvent | null {
  let message: unknown = payload;
  if (typeof message === 'string') {
    try { message = JSON.parse(message); } catch { return null; }
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const envelope = message as Record<string, unknown>;
  if (envelope.type !== 'PLAYER_EVENT' || !envelope.data ||
      typeof envelope.data !== 'object' || Array.isArray(envelope.data)) return null;
  const data = envelope.data as Record<string, unknown>;
  const clockValue = (value: unknown): number | null => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  // proxy.garageband relays player_progress/player_duration while Braflix's
  // JWPlayer bridge emits currentTime/duration. Accept both contracts without
  // treating title/loading events as playback readiness.
  const currentTime = clockValue(data.player_progress ?? data.currentTime);
  const duration = clockValue(data.player_duration ?? data.duration);
  if (currentTime === null || currentTime < 0 || duration === null || duration <= 0) return null;
  const rawStatus = data.player_status ?? data.status ?? data.event;
  const status: ProviderPlaybackEvent['status'] =
    rawStatus === 'playing' || rawStatus === 'play' ? 'playing' :
      rawStatus === 'paused' || rawStatus === 'pause' ? 'paused' :
        rawStatus === 'ended' ? 'ended' :
          rawStatus === 'buffering' || rawStatus === 'buffer' || rawStatus === 'waiting' ? 'buffering' : null;
  return { currentTime, duration, status };
}

/** Use the provider's supported custom-caption URL rather than ignored CC messages. */
export function providerCaptionUrl(source: string, showOriginal: boolean, emptyTrackUrl: string,
  playback?: { currentTime: number; playing: boolean }): string {
  // Only the proxy relay understands these caption query parameters. Braflix
  // owns its JWPlayer subtitles and must receive its URL unchanged.
  if (providerKind(source) !== 'proxy') return source;
  const url = new URL(source);
  // Autoplay is best-effort. External human verification or a browser play
  // gesture still requires direct interaction with the provider's frame.
  if (!url.searchParams.has('autoplay')) url.searchParams.set('autoplay', '1');
  if (showOriginal) {
    // An explicit language overrides a previously saved empty custom track.
    if (!url.searchParams.has('ds_lang')) url.searchParams.set('ds_lang', 'en');
  } else {
    url.searchParams.set('sub_url', emptyTrackUrl);
    url.searchParams.set('sub_lang', 'en');
    url.searchParams.set('sub_label', 'Subtitles off');
  }
  if (playback) {
    url.searchParams.set('startAt', String(Math.max(0, Math.floor(Number.isFinite(playback.currentTime) ? playback.currentTime : 0))));
    url.searchParams.set('autoplay', playback.playing ? '1' : '0');
  }
  return url.href;
}

export function setNativePlayerMuted(video: HTMLVideoElement, muted: boolean, ios: boolean, volume: number): void {
  video.muted = muted;
  video.defaultMuted = muted;
  // iOS owns hardware volume; other platforms may have persisted a zero level.
  if (!muted && !ios && video.volume === 0) video.volume = Math.max(1, volume) / 100;
}

/** Native HLS and MP4 share this transport; iOS keeps hardware volume ownership. */
export function setNativePlayerVolume(video: HTMLVideoElement, volume: number, ios: boolean): void {
  if (!Number.isFinite(volume)) return;
  const level = Math.max(0, Math.min(100, volume));
  if (!ios) video.volume = level / 100;
  setNativePlayerMuted(video, level === 0, ios, level);
}

type IOSVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitSupportsFullscreen?: boolean;
};

/** Must run synchronously inside the button's user gesture. */
export function enterIOSVideoFullscreen(video: IOSVideo | null): boolean {
  if (!video || !video.isConnected) return false;
  if (video.webkitSupportsFullscreen !== false && video.webkitEnterFullscreen) {
    try { video.webkitEnterFullscreen(); return true; } catch { /* Try presentation mode next. */ }
  }
  if (video.webkitSetPresentationMode) {
    try { video.webkitSetPresentationMode('fullscreen'); return true; } catch { /* Viewport fallback below. */ }
  }
  return false;
}

/** Safari on iPad/newer WebKit may support element fullscreen for iframe players. */
export function enterPlayerElementFullscreen(element: HTMLElement, fallback: () => void): void {
  const webkit = element as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (element.requestFullscreen) {
      void element.requestFullscreen().catch(fallback);
      return;
    }
    if (webkit.webkitRequestFullscreen) { webkit.webkitRequestFullscreen(); return; }
  } catch { /* API present but rejected by this browser. */ }
  fallback();
}
