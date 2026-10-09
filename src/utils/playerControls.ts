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
  if (!video || !video.isConnected || video.webkitSupportsFullscreen === false) return false;
  try {
    if (video.webkitEnterFullscreen) { video.webkitEnterFullscreen(); return true; }
    if (video.webkitSetPresentationMode) { video.webkitSetPresentationMode('fullscreen'); return true; }
  } catch { /* Caller expands the whole player, including cross-origin embeds. */ }
  return false;
}
