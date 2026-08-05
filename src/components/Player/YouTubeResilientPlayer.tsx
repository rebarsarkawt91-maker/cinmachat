import React, { useCallback, useEffect, useRef, useState } from "react";
import { getYTId } from "../../utils/youtube";
import { api } from "../../services/api";

/**
 * YouTubeResilientPlayer — plays posted YouTube movies without throwing the
 * "Playback ID" / "Video unavailable" embed errors.
 *
 * Strategy:
 *  1) EMBED (primary): renders the standard YouTube embed iframe with a RELAXED
 *     sandbox (the old strict token set could make YouTube reject the frame).
 *  2) DETECT: listens to the embed's postMessage events. YouTube reports embed
 *     blocks (codes 100/101/150), player errors (2/5) and playback state here,
 *     so a blocked/black-screen embed is detected instead of silently showing
 *     the "Playback ID" error page. A stall timer covers embeds that never
 *     report anything.
 *  3) DIRECT STREAM (fallback): when the embed is blocked, the player asks the
 *     server (/api/resolve-stream, cached) for a direct progressive-MP4 stream
 *     and plays it in a native <video> — bypassing YouTube's embedding
 *     restrictions entirely (embedding-disabled, region locks, bot checks).
 *  4) OPEN-ON-YOUTUBE (last resort): a panel with a "Watch on YouTube" button.
 *
 * The iframe keeps the configured `iframeId` so existing postMessage-based
 * controls (mute, play/pause, subtitle clock) keep working while in embed mode.
 */

// YouTube IFrame API error codes that mean the video cannot play in an embed.
const YT_BLOCK_CODES = new Set([2, 5, 100, 101, 150]);

// If the embed neither errors nor starts playing within this window, assume it
// is stuck on YouTube's silent "Playback ID" error screen and escalate.
const STALL_MS = 15000;

type PlayerMode = "embed" | "direct" | "error";

interface YouTubeResilientPlayerProps {
  url: string;
  /** Kept so existing postMessage controls (mute/seek/subtitles) keep working. */
  iframeId?: string;
  title?: string;
  className?: string;
  /** Called whenever the active playback mode changes (used to toggle parent CSS masks). */
  onModeChange?: (mode: PlayerMode) => void;
}

export default function YouTubeResilientPlayer({
  url,
  iframeId = "room-player",
  title,
  className,
  onModeChange,
}: YouTubeResilientPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Live flags read inside the message listener / stall timer so they never go stale.
  const playedRef = useRef(false);
  const blockedRef = useRef(false);

  const videoId = getYTId(url);

  const [blocked, setBlocked] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  // Bump to force a fresh iframe mount (Retry button).
  const [retryKey, setRetryKey] = useState(0);

  const poster = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : "";
  const watchUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : url;

  const embedSrc = useCallback(
    (id: string) =>
      `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&showinfo=0&iv_load_policy=3&enablejsapi=1&disablekb=1&fs=0&playsinline=1&loop=1&playlist=${id}&origin=${encodeURIComponent(
        window.location.origin,
      )}`,
    [],
  );

  // Reset everything when the source URL or the iframe is remounted.
  useEffect(() => {
    playedRef.current = false;
    blockedRef.current = false;
    setBlocked(false);
    setResolving(false);
    setStreamUrl(null);
  }, [url, retryKey]);

  // Detect embed blocks via the YouTube widget postMessage protocol.
  useEffect(() => {
    if (blockedRef.current || streamUrl) return;
    const onMessage = (event: MessageEvent) => {
      // www.youtube.com / youtube-nocookie.com embeds report from youtube.com origins.
      if (!/youtube(-nocookie)?\.com|youtu\.be/i.test(event.origin)) return;
      const frame = iframeRef.current;
      if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;
      if (data.event === "onError") {
        const code = Number(data.info ?? data.data);
        if (YT_BLOCK_CODES.has(code)) handleBlocked();
      } else if (data.event === "onStateChange") {
        // info === 1 means PLAYING.
        if (data.info === 1 || data.data === 1) playedRef.current = true;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, retryKey, streamUrl]);

  // Stall guard: if the embed never reports playback or an error, treat it as
  // a silent block ("Playback ID" error pages emit no widget events).
  useEffect(() => {
    if (blockedRef.current || streamUrl) return;
    const timer = window.setTimeout(() => {
      if (!playedRef.current && !blockedRef.current) handleBlocked();
    }, STALL_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, retryKey, streamUrl, videoId]);

  // Escalate to the direct-stream fallback (or the open-on-YouTube panel).
  const handleBlocked = useCallback(() => {
    if (blockedRef.current || streamUrl) return;
    blockedRef.current = true;
    setBlocked(true);
    void escalateToDirectStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, streamUrl]);

  const escalateToDirectStream = useCallback(async () => {
    if (!videoId) {
      setStreamUrl(null);
      return;
    }
    setResolving(true);
    try {
      // Same server used for /api/movies, /api/config, ... — same-origin path
      // through Firebase 307 → Render, with cold-start retries handled here.
      const res = await api.baseFetch(
        "/api/resolve-stream",
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ url }),
        },
        2,
      );
      const streams = res?.streams;
      const first =
        Array.isArray(streams) && typeof streams[0]?.url === "string"
          ? streams[0]
          : null;
      if (first?.url) {
        setStreamUrl(first.url);
      } else {
        setStreamUrl(null);
      }
    } catch (err) {
      console.error("[YouTubeResilientPlayer] Direct stream resolve failed:", err);
      setStreamUrl(null);
    } finally {
      setResolving(false);
    }
  }, [url, videoId]);

  // Tell the parent which mode is active so it can hide its YouTube-only masks
  // when we drop to the native direct-stream player.
  useEffect(() => {
    const mode: PlayerMode = streamUrl ? "direct" : blocked ? "error" : "embed";
    onModeChange?.(mode);
  }, [streamUrl, blocked, onModeChange]);

  // Native <video> failed to play the direct stream → show the last-resort panel.
  const handleVideoError = () => {
    setStreamUrl(null);
  };

  const retryEmbed = () => {
    setRetryKey((k) => k + 1);
  };

  const showEmbed = !blocked && !streamUrl;
  const showError = blocked && !streamUrl && !resolving;

  return (
    <div className={`relative w-full h-full bg-black overflow-hidden ${className || ""}`}>
      {showEmbed ? (
        <iframe
          key={retryKey}
          ref={iframeRef}
          id={iframeId}
          src={videoId ? embedSrc(videoId) : url}
          title={title || "CinemaChat YouTube Player"}
          className="w-full h-[120%] -translate-y-[8.3%] border-none shadow-[0_0_200px_rgba(229,9,20,0.4)] pointer-events-none"
          frameBorder="0"
          scrolling="no"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; clipboard-write"
          allowFullScreen
          // Relaxed sandbox: the strict token set made some embeds refuse to
          // initialize. Popups/ads are still neutralized by the parent masks.
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms allow-pointer-lock allow-modals allow-downloads"
        />
      ) : streamUrl ? (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <video
            key={streamUrl}
            src={streamUrl}
            poster={poster}
            controls
            autoPlay
            muted
            playsInline
            className="w-full h-full max-h-full"
            onError={handleVideoError}
          />
          {/* Escape hatch: always allow opening the movie on YouTube itself. */}
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3 right-3 z-20 px-3 py-1.5 rounded-full bg-black/70 hover:bg-red-600 border border-white/10 text-[10px] font-bold text-white transition-all kurdish-text"
          >
            یوتیوب ↗
          </a>
        </div>
      ) : showError ? (
        <div className="relative w-full h-full flex items-center justify-center bg-black p-6 text-center">
          {poster && (
            <img
              src={poster}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-30"
            />
          )}
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 flex flex-col items-center gap-4 max-w-sm">
            <p className="text-white font-bold kurdish-text text-sm">
              ڤیدیۆکە ناتوانرێت لە سەکۆکە بڵێندرێتەوە.
            </p>
            <p className="text-zinc-400 text-xs kurdish-text">
              بەهۆی قەدەغەکردنی embedding لەلایەن یوتیوب. لە شێوازی ڕاستەوخۆ
              یان لە یوتیوب بینی.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  window.open(watchUrl, "_blank", "noopener,noreferrer");
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full text-xs transition-all cursor-pointer kurdish-text"
              >
                بینین لە یوتیوب
              </button>
              <button
                type="button"
                onClick={retryEmbed}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-full text-xs transition-all cursor-pointer kurdish-text"
              >
                دووبارە هەوڵدانەوە
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resolving && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
          <div className="px-5 py-3 rounded-full bg-black/80 border border-white/10 text-xs font-bold text-white kurdish-text">
            جارەستی بەستراوە...
          </div>
        </div>
      )}
    </div>
  );
}
