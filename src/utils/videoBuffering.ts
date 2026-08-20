export type NativeVideoLoadState =
  | "idle"
  | "loading"
  | "buffering"
  | "ready"
  | "error";

export const getBufferedAheadSeconds = (
  media: HTMLMediaElement | null | undefined,
): number => {
  if (!media || !media.buffered) return 0;
  const current = Number.isFinite(media.currentTime) ? media.currentTime : 0;

  for (let i = 0; i < media.buffered.length; i += 1) {
    const start = media.buffered.start(i);
    const end = media.buffered.end(i);
    if (start <= current + 0.25 && end >= current) {
      return Math.max(0, end - current);
    }
  }

  return 0;
};

export const hasPlayableBuffer = (
  media: HTMLMediaElement | null | undefined,
  minBufferedSeconds = 0.75,
): boolean => {
  if (!media) return false;
  if (media.readyState >= 3) return true;
  return getBufferedAheadSeconds(media) >= minBufferedSeconds;
};
