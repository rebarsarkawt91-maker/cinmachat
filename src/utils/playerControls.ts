/** Provider transports use lower-case actions, unlike YouTube's API names. */
export function providerAction(command: string): string {
  return ({ playVideo: 'play', pauseVideo: 'pause', unMute: 'unmute' } as Record<string, string>)[command] || command;
}

export function setNativePlayerMuted(video: HTMLVideoElement, muted: boolean, ios: boolean, volume: number): void {
  video.muted = muted;
  video.defaultMuted = muted;
  // iOS owns hardware volume; other platforms may have persisted a zero level.
  if (!muted && !ios && video.volume === 0) video.volume = Math.max(1, volume) / 100;
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
