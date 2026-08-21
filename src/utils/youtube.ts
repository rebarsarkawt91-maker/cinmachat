let ytApiPromise: Promise<void> | null = null;

export function loadYouTubeAPI(): Promise<void> {
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    if ((window as any).YT?.Player) {
      resolve();
      return;
    }

    const origReady = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      origReady?.();
      resolve();
    };

    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      if (firstScriptTag?.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }

    // Fallback: if API already loaded but callback missed
    const checkInterval = setInterval(() => {
      if ((window as any).YT?.Player) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);

    // Safety timeout after 15 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!(window as any).YT?.Player) {
        console.warn("YouTube IFrame API failed to load after 15s");
        resolve();
      }
    }, 15000);
  });

  return ytApiPromise;
}

export function getYTId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // youtu.be/VIDEO_ID
  const short = trimmed.match(/youtu\.be\/([^#&?\s]{11})/i);
  if (short?.[1]) return short[1];

  // embed/VIDEO_ID
  const embed = trimmed.match(/embed\/([^#&?\s]{11})/i);
  if (embed?.[1]) return embed[1];

  // /v/VIDEO_ID or /u/VIDEO_ID
  const legacy = trimmed.match(/\/(?:v|u)\/([^#&?\s]{11})/i);
  if (legacy?.[1]) return legacy[1];

  // youtube.com/shorts/VIDEO_ID
  const shorts = trimmed.match(/youtube\.com\/shorts\/([^#&?\s]{11})/i);
  if (shorts?.[1]) return shorts[1];

  // watch?v=VIDEO_ID
  const watch = trimmed.match(/[?&]v=([^#&?\s]{11})/i);
  if (watch?.[1]) return watch[1];

  // Bare 11-character video ID (e.g. pasted directly from YouTube)
  if (isYTVideoId(trimmed)) return trimmed;

  return null;
}

/**
 * Validate whether a string is a plausible YouTube video ID.
 * YouTube IDs are exactly 11 characters: [a-zA-Z0-9_-].
 */
export function isYTVideoId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

