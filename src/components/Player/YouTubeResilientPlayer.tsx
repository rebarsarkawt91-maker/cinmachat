import React, { useCallback, useEffect, useRef, useState } from "react";
import { getYTId } from "../../utils/youtube";
import { api } from "../../services/api";
import VideoLoadOverlay from "./VideoLoadOverlay";
import {
  hasPlayableBuffer,
  type NativeVideoLoadState,
} from "../../utils/videoBuffering";

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
 *  3) RECONNECT: a failed embed is automatically retried up to 3 times with
 *     exponential backoff (1s → 2s → 4s). During retries only a
 *     "Reconnecting..." spinner is shown; if an attempt succeeds, playback
 *     continues automatically. Users are never redirected to youtube.com.
 *  4) DIRECT STREAM (fallback): when all embed retries fail, the player asks
 *     the server (/api/resolve-stream, cached) for a direct progressive-MP4
 *     stream and plays it in a native <video> — bypassing YouTube's embedding
 *     restrictions entirely (embedding-disabled, region locks, bot checks).
 *  5) ERROR (last resort): a simple "Unable to load the video. Please try
 *     again later." message with a single Retry button.
 *
 * The iframe keeps the configured `iframeId` so existing postMessage-based
 * controls (mute, play/pause, subtitle clock) keep working while in embed mode.
 */

// YouTube IFrame API error codes that mean the video cannot play in an embed.
const YT_BLOCK_CODES = new Set([2, 5, 100, 101, 150]);

// If the embed neither errors nor starts playing within this window, assume it
// is stuck on YouTube's silent "Playback ID" error screen and escalate.
const STALL_MS = 15000;

// Number of automatic embed reloads after the first failure.
const MAX_EMBED_RETRIES = 3;
// Exponential backoff between retries: 1s → 2s → 4s.
const EMBED_BACKOFF_MS = [1000, 2000, 4000];

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
  // Embed retries already performed (0..MAX_EMBED_RETRIES), read from timers.
  const retryCountRef = useRef(0);
  // Pending reconnect timer so it can be cleared on unmount/url change.
  const retryTimerRef = useRef<number | null>(null);
  const directVideoSlowTimerRef = useRef<number | null>(null);

  const videoId = getYTId(url);

  const [blocked, setBlocked] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [directVideoStatus, setDirectVideoStatus] =
    useState<NativeVideoLoadState>("idle");
  const [directVideoReloadKey, setDirectVideoReloadKey] = useState(0);
  // Bump to force a fresh iframe mount (auto-retry and Retry button).
  const [retryKey, setRetryKey] = useState(0);

  const poster = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : "";

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
    setReconnecting(false);
    setResolving(false);
    setStreamUrl(null);
  }, [url, retryKey]);

  // A brand-new source always starts with a fresh retry budget.
  useEffect(() => {
    retryCountRef.current = 0;
  }, [url]);

  // Clear any pending reconnect timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (directVideoSlowTimerRef.current !== null) {
        window.clearTimeout(directVideoSlowTimerRef.current);
        directVideoSlowTimerRef.current = null;
      }
    };
  }, []);

  const clearDirectVideoSlowTimer = useCallback(() => {
    if (directVideoSlowTimerRef.current !== null) {
      window.clearTimeout(directVideoSlowTimerRef.current);
      directVideoSlowTimerRef.current = null;
    }
  }, []);

  const armDirectVideoSlowTimer = useCallback(() => {
    clearDirectVideoSlowTimer();
    directVideoSlowTimerRef.current = window.setTimeout(() => {
      setDirectVideoStatus((status) =>
        status === "ready" || status === "error" ? status : "buffering",
      );
    }, 12000);
  }, [clearDirectVideoSlowTimer]);

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
      } else if (data.event === "infoDelivery" && typeof data.info?.currentTime === "number") {
        // A live embed streams time updates via infoDelivery, which proves the
        // video is playing. The app's `listening` handshake only subscribes to
        // onInfoDelivery (never onStateChange), so without this the stall guard
        // would remount a perfectly healthy embed every 15s and reset playback
        // to 00:00.
        playedRef.current = true;
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

  // Ask the server for a direct progressive-MP4 stream (cached) so we can play
  // in a native <video>, bypassing YouTube embedding restrictions.
  const escalateToDirectStream = useCallback(async (forceRefresh = false) => {
    if (!videoId) {
      setStreamUrl(null);
      return;
    }
    setResolving(true);
    setDirectVideoStatus("loading");
    try {
      // Same server used for /api/movies, /api/config, ... — same-origin path
      // through Firebase 307 → Render, with cold-start retries handled here.
      const res = await api.baseFetch(
        "/api/resolve-stream",
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ url, refresh: forceRefresh }),
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
        setDirectVideoStatus("loading");
      } else {
        setStreamUrl(null);
        setDirectVideoStatus("error");
      }
    } catch (err) {
      console.error("[YouTubeResilientPlayer] Direct stream resolve failed:", err);
      setStreamUrl(null);
      setDirectVideoStatus("error");
    } finally {
      setResolving(false);
    }
  }, [url, videoId]);

  // A failed embed: reconnect the embed up to MAX_EMBED_RETRIES with exponential
  // backoff. Only when the budget is exhausted do we escalate to the direct
  // stream, and ultimately to the error panel.
  const handleBlocked = useCallback(() => {
    if (blockedRef.current || streamUrl) return;
    blockedRef.current = true;

    if (retryCountRef.current < MAX_EMBED_RETRIES) {
      const delay =
        EMBED_BACKOFF_MS[retryCountRef.current] ??
        EMBED_BACKOFF_MS[EMBED_BACKOFF_MS.length - 1];
      retryCountRef.current += 1;
      // Unmount the broken embed so only the spinner is visible while we wait.
      setBlocked(true);
      setReconnecting(true);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        // Remount the embed fresh; the [url, retryKey] effect resets state.
        setRetryKey((k) => k + 1);
      }, delay);
    } else {
      // All embed retries exhausted → direct-stream fallback.
      setBlocked(true);
      void escalateToDirectStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, streamUrl, escalateToDirectStream]);

  // Tell the parent which mode is active so it can hide its YouTube-only masks
  // when we drop to the native direct-stream player.
  useEffect(() => {
    const mode: PlayerMode = streamUrl
      ? "direct"
      : blocked && !reconnecting
        ? "error"
        : "embed";
    onModeChange?.(mode);
  }, [streamUrl, blocked, reconnecting, onModeChange]);

  // Native <video> failed to play the direct stream → show the error panel.
  useEffect(() => {
    if (!streamUrl) {
      setDirectVideoStatus("idle");
      clearDirectVideoSlowTimer();
      return;
    }
    setDirectVideoStatus("loading");
    armDirectVideoSlowTimer();
    return clearDirectVideoSlowTimer;
  }, [streamUrl, directVideoReloadKey, armDirectVideoSlowTimer, clearDirectVideoSlowTimer]);

  const handleVideoError = () => {
    clearDirectVideoSlowTimer();
    setDirectVideoStatus("error");
  };

  const clearDirectVideoIfBuffered = (
    event: React.SyntheticEvent<HTMLVideoElement>,
  ) => {
    if (hasPlayableBuffer(event.currentTarget)) {
      clearDirectVideoSlowTimer();
      setDirectVideoStatus("ready");
    }
  };

  const retryDirectVideo = () => {
    setDirectVideoStatus("loading");
    setDirectVideoReloadKey((key) => key + 1);
    void escalateToDirectStream(true);
  };

  // Manual "Retry" from the error panel: start over with a fresh retry budget.
  const retryEmbed = () => {
    retryCountRef.current = 0;
    setRetryKey((k) => k + 1);
  };

  const showEmbed = !blocked && !streamUrl;
  const showError = blocked && !streamUrl && !resolving && !reconnecting;

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
          // NOTE: NO `sandbox` attribute on purpose. A sandboxed iframe creates a
          // distinct WindowProxy, so `event.source === frame.contentWindow` is
          // always false in Chrome. The parent's onMessage relies on that identity
          // check to trust infoDelivery/onStateChange (clock, seek bar, ended ->
          // auto-next); a sandbox silently kills all of it (clock stays 0:00 and
          // the stall-guard keeps remounting the video). This frame only ever
          // loads app-constructed YouTube embed URLs, so dropping the sandbox is
          // safe. Popups/ads are still neutralized by the parent masks.
        />
      ) : streamUrl ? (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <video
            key={`${streamUrl}:${directVideoReloadKey}`}
            id="room-player-direct-video"
            src={streamUrl}
            poster={poster}
            controls
            autoPlay
            muted
            playsInline
            preload="auto"
            className="w-full h-full max-h-full"
            onLoadStart={() => {
              setDirectVideoStatus("loading");
              armDirectVideoSlowTimer();
            }}
            onLoadedMetadata={() => setDirectVideoStatus("buffering")}
            onLoadedData={clearDirectVideoIfBuffered}
            onCanPlay={() => {
              clearDirectVideoSlowTimer();
              setDirectVideoStatus("ready");
            }}
            onPlaying={() => {
              clearDirectVideoSlowTimer();
              setDirectVideoStatus("ready");
            }}
            onWaiting={() => setDirectVideoStatus("buffering")}
            onStalled={() => setDirectVideoStatus("buffering")}
            onProgress={clearDirectVideoIfBuffered}
            onTimeUpdate={clearDirectVideoIfBuffered}
            onError={handleVideoError}
          />
          {directVideoStatus !== "ready" && directVideoStatus !== "idle" && (
            <VideoLoadOverlay
              status={directVideoStatus === "error" ? "error" : directVideoStatus === "buffering" ? "buffering" : "loading"}
              message={
                directVideoStatus === "error"
                  ? "Unable to load this stream. Please try again."
                  : directVideoStatus === "buffering"
                    ? "Network is slow. Buffering video..."
                    : "Preparing video..."
              }
              onRetry={directVideoStatus === "buffering" || directVideoStatus === "error" ? retryDirectVideo : undefined}
            />
          )}
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
              Unable to load the video. Please try again later.
            </p>
            <button
              type="button"
              onClick={retryEmbed}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full text-xs transition-all cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {/* Reconnecting spinner while the embed is retried with backoff. */}
      {reconnecting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-10 h-10 rounded-full border-2 border-white/20 border-t-red-600 animate-spin"
              aria-hidden="true"
            />
            <p className="text-white text-xs font-bold">Reconnecting...</p>
          </div>
        </div>
      )}

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
