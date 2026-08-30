import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

/**
 * HlsVideoPlayer — plays .m3u8 HLS streams using hls.js (with native HLS
 * fallback for Safari). Renders a standard <video> element with Plyr-style
 * controls so it integrates seamlessly into the movie modal.
 *
 * Unlike ImmersiveShieldedPlayer (sandboxed iframe) this plays the stream
 * natively — no cross-origin sandbox issues, no blocked autoplay, and full
 * seeking/volume/fullscreen support.
 */

interface HlsVideoPlayerProps {
  url: string;
  autoPlay?: boolean;
  muted?: boolean;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (msg: string) => void;
  className?: string;
}

export default function HlsVideoPlayer({
  url,
  autoPlay = true,
  muted = false,
  onTimeUpdate,
  onDurationChange,
  onPlay,
  onPause,
  onEnded,
  onError,
  className,
}: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallPendingRef = useRef(false);
  const stallBudgetRef = useRef(0);

  // Silent resume of a transient buffer stall: forwards the hls.js loader to
  // the current position (or reloads a native-HLS <video> at the same time)
  // with no error UI. The App-level watchdog owns the blocking "try again"
  // overlay for genuinely dead sources, so recoveries here stay silent.
  const silentResumeStall = () => {
    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current) {
      try {
        hlsRef.current.startLoad(-1);
        void video.play().catch(() => {});
      } catch {
        /* ignore */
      }
      return;
    }
    const savedTime =
      Number.isFinite(video.currentTime) && video.currentTime > 0 ? video.currentTime : 0;
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    const onReady = () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      if (savedTime > 0 && Number.isFinite(video.duration) && savedTime < video.duration) {
        try {
          video.currentTime = savedTime;
        } catch {
          /* ignore */
        }
      }
      try {
        void video.play().catch(() => {});
      } catch {
        /* ignore */
      }
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    try {
      video.load();
    } catch {
      /* ignore */
    }
  };

  // Debounced stall watcher: acts only when buffering has been stuck for ~5s
  // (a transient network hiccup), capped at a small budget per source URL.
  const scheduleStallRecovery = () => {
    if (stallTimerRef.current || !videoRef.current) return;
    stallPendingRef.current = true;
    stallTimerRef.current = setTimeout(() => {
      stallTimerRef.current = null;
      const video = videoRef.current;
      if (!video || !stallPendingRef.current) return;
      stallPendingRef.current = false;
      if (video.readyState >= 2 && !video.paused) return; // recovered on its own
      if (stallBudgetRef.current >= 2) return; // budget done — leave UI to caller
      stallBudgetRef.current += 1;
      silentResumeStall();
    }, 5000);
  };

  const cancelStallRecovery = () => {
    stallPendingRef.current = false;
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  // Recoverable native <video> errors (network/decode glitches) get one silent
  // resume; MEDIA_ERR_SRC_NOT_SUPPORTED (code 4) stays a real failure.
  const handleNativeVideoError = () => {
    const video = videoRef.current;
    const code = video?.error?.code;
    if (code === undefined || code === 4) return;
    if (stallBudgetRef.current >= 2) return;
    stallBudgetRef.current += 1;
    silentResumeStall();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    // Destroy any previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    // Fresh source URL → reset the silent-recovery budget.
    stallBudgetRef.current = 0;
    cancelStallRecovery();

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        startFragPrefetch: true,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setLoadError("وێنەکە نەتوانرا بار بکرێتەوە. تکایە دووبارە هەوڵبدەرەوە.");
              onError?.("HLS fatal error");
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari)
      video.src = url;
      if (autoPlay) video.play().catch(() => {});
    } else {
      setLoadError("ئەم براوزەرە پشتگیری HLS ناکات.");
      onError?.("HLS not supported in this browser");
    }

    return () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [url, autoPlay]);

  return (
    <div className={`relative w-full h-full flex items-center justify-center bg-black ${className || ""}`}>
      {loadError ? (
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm font-bold text-red-400 kurdish-text">{loadError}</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          id="room-player-hls-video"
          className="w-full h-full object-contain"
          muted={muted}
          controls
          playsInline
          onTimeUpdate={() => {
            cancelStallRecovery();
            onTimeUpdate?.(videoRef.current?.currentTime || 0);
          }}
          onDurationChange={() => onDurationChange?.(videoRef.current?.duration || 0)}
          onPlaying={() => {
            cancelStallRecovery();
            onPlay?.();
          }}
          onPause={() => onPause?.()}
          onEnded={() => onEnded?.()}
          onWaiting={scheduleStallRecovery}
          onStalled={scheduleStallRecovery}
          onError={handleNativeVideoError}
        />
      )}
    </div>
  );
}
