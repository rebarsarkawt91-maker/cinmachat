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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    // Destroy any previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

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
          className="w-full h-full object-contain"
          muted={muted}
          controls
          playsInline
          onTimeUpdate={() => onTimeUpdate?.(videoRef.current?.currentTime || 0)}
          onDurationChange={() => onDurationChange?.(videoRef.current?.duration || 0)}
          onPlay={() => onPlay?.()}
          onPause={() => onPause?.()}
          onEnded={() => onEnded?.()}
        />
      )}
    </div>
  );
}
