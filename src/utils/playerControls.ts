/** Provider transports use lower-case actions, unlike YouTube's API names. */
export function usesProviderTouchControls(url: string | null | undefined): boolean {
  try {
    const source = new URL(url || '');
    return source.protocol === 'https:' && source.hostname === 'proxy.garageband.rocks' && source.pathname.startsWith('/embed/');
  } catch { return false; }
}

export function providerAction(command: string): string {
  return ({ playVideo: 'play', pauseVideo: 'pause', unMute: 'unmute' } as Record<string, string>)[command] || command;
}

/** Use the provider's supported custom-caption URL rather than ignored CC messages. */
export function providerCaptionUrl(source: string, showOriginal: boolean, emptyTrackUrl: string,
  playback?: { currentTime: number; playing: boolean }): string {
  if (!usesProviderTouchControls(source)) return source;
  const url = new URL(source);
  // The protected frame cannot receive a click on its landing/play overlay.
  // Request the provider's player mode when CinemaChat's Play opens the frame.
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
