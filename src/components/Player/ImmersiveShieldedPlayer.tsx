import React, { useEffect, useRef, useState } from "react";
import { providerCaptionUrl, usesProviderTouchControls } from "../../utils/playerControls";

/**
 * ImmersiveShieldedPlayer — Cinematic Shielded Player for embedded movie streams
 * (hdtoday.sc, vidcloud, vidmoly, streamwish, generic /embed/ providers, ...).
 *
 * Responsibilities:
 *  1) Popup / overlay blocking ("Anti-Copyright Shield"):
 *     - A MutationObserver + injected stylesheet sweep inside the embedded document
 *       (works whenever the embed is same-origin / allow-same-origin-accessible) that
 *       continuously removes popups, share-boxes, banners and promotional overlays.
 *     - The parent interaction layer owns clicks. Known relay providers are
 *       controlled by CinemaChat buttons instead of exposing their click ads.
 *  2) Original-aspect playback:
 *     - The embedded player remains unscaled by default, preserving the provider's
 *       original frame and avoiding the blur/cropping caused by forced cover zoom.
 *  3) Subtitle integrity: the optional `subtitleOffset` shifts the (scaled) content
 *     upward so the provider's native subtitles stay visible even when zoomed/cropped.
 *
 * NOTE: We deliberately never remove the provider's <video> or its native transport
 * controls — audio/subtitle playback stays fully native and in sync; only third-party
 * promotional chrome is targeted.
 */

interface ImmersiveShieldedPlayerProps {
  url: string;
  iframeId?: string;
  title?: string;
  /** User-selected zoom multiplier (1 = original aspect ratio). */
  scale?: number;
  /** Percent (0-15) of container height to shift the video up so subtitles stay visible. */
  subtitleOffset?: number;
  /** Hide provider/native captions so CinemaChat subtitles never overlap them. */
  hideNativeSubtitles?: boolean;
  /** Snapshot read only when the source/caption setting changes, not every tick. */
  playback?: { currentTime: number; playing: boolean; muted: boolean; requestedPlaying?: boolean };
  className?: string;
}

// Selectors for promotional/third-party chrome commonly injected by streaming sites.
// Deliberately excludes the player controls / video element to keep playback native.
const AD_SELECTOR = [
  "[id*='popup']", "[class*='popup']",
  "[id*='overlay']:not([class*='player'])", "[class*='overlay']:not([class*='player'])",
  "[id*='ad-']", "[id*='advert']", "[class*='advert']", "[class*='ad-container']",
  "[id*='adcontainer']", "[id*='adsbygoogle']", "[class*='adsbygoogle']",
  "[id*='share']", "[class*='share-box']", "[class*='sharemodal']",
  "[id*='premium']", "[class*='premium']", "[id*='unblock']",
  "[id*='paywall']", "[class*='paywall']",
  "[id*='sticky']", "[class*='sticky']",
  "[id*='banner']", "[class*='banner-ad']",
  "[id*='social']", "[class*='social-float']",
  "[class*='float-ad']", "[class*='floating-ad']",
  ".jw-flag-ads", ".vjs-ad-overlay", ".ima-ad-container",
  ".m3u8-ad", "[class*='interstitial']",
].join(", ");

// Injected stylesheet: locks scrolling, hides ad iframes, and preserves the source
// video aspect ratio without visual filters or scale transforms.
const SHIELD_CSS = `
  html, body { overflow: hidden !important; height: 100% !important; }
  video { width: 100% !important; height: 100% !important; object-fit: contain !important; object-position: center !important; filter: none !important; transform: none !important; image-rendering: auto !important; }
  .jwplayer, .vjs_video_3 { background: #000 !important; }
  #adult, #ad-frame, #overlay, #overlay-ads, #aads, #advertise, #banner-ad {
    display: none !important; visibility: hidden !important; pointer-events: none !important;
  }
`;

// Tries to install the shield inside the embedded document. Returns true when the
// document is reachable (same-origin / allow-same-origin) — otherwise the caller
// retries a few times (some providers swap documents after load).
function installShield(iframe: HTMLIFrameElement, hideNativeSubtitles = false): boolean {
  try {
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement || !doc.body) return false;

    if (!doc.getElementById("__cinemachat_shield_css__")) {
      const style = doc.createElement("style");
      style.id = "__cinemachat_shield_css__";
      style.textContent = SHIELD_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }
    const style = doc.getElementById("__cinemachat_shield_css__") as HTMLStyleElement | null;
    if (style) {
      style.textContent = `${SHIELD_CSS}\n${hideNativeSubtitles ? `
        video::cue { visibility: hidden !important; opacity: 0 !important; }
        .vjs-text-track-display, .jw-captions, .jw-text-track-display,
        .plyr__captions, .caption, .captions, [class*="subtitle"], [class*="caption"] {
          display: none !important; visibility: hidden !important; opacity: 0 !important;
        }
      ` : ""}`;
    }

    const sweep = () => {
      try {
        doc.querySelectorAll(AD_SELECTOR).forEach((el) => {
          if (el.id === "__cinemachat_shield_css__") return;
          if (el instanceof HTMLIFrameElement && el.closest("video")) return;
          el.remove();
        });
      } catch {
        /* document navigated away — ignore */
      }
    };

    sweep();
    const obs = new MutationObserver(() => sweep());
    obs.observe(doc.body, { childList: true, subtree: true });
    obs.observe(doc.documentElement, { childList: true, subtree: true });
    (iframe as any).__cinemachatShieldObserver = obs;
    return true;
  } catch {
    // Cross-origin embed: only the parent hit shield and supported provider
    // commands apply. Internal timed ads cannot be removed from this document.
    return false;
  }
}

export default function ImmersiveShieldedPlayer({
  url,
  iframeId,
  title,
  scale = 1,
  subtitleOffset = 0,
  hideNativeSubtitles = false,
  playback,
  className,
}: ImmersiveShieldedPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const retries = useRef(0);
  const latestPlayback = useRef(playback);
  latestPlayback.current = playback;
  const lastClock = useRef<{ time: number; at: number; playing: boolean } | null>(null);
  const pendingResumeTime = useRef<number | null>(null);
  const pendingRestore = useRef(!!playback);
  const configured = useRef({ url, hideNativeSubtitles });
  const emptyCaptionUrl = new URL('/player-captions-off.vtt', window.location.origin).href;
  const [frameUrl, setFrameUrl] = useState(() => providerCaptionUrl(url, !hideNativeSubtitles, emptyCaptionUrl));

  useEffect(() => {
    const captionChanged = configured.current.url === url &&
      configured.current.hideNativeSubtitles !== hideNativeSubtitles;
    const current = latestPlayback.current;
    const clock = lastClock.current;
    const age = clock ? Math.max(0, performance.now() - clock.at) / 1000 : 0;
    // Clock reports normally arrive every five seconds. A stale report can
    // mean buffering: never turn that wait into a large forward seek on CC.
    const advance = clock?.playing && age <= 6 ? age : 0;
    const snapshot = captionChanged && current ? {
      currentTime: clock
        ? clock.time + advance
        : pendingResumeTime.current ?? current.currentTime,
      playing: current.requestedPlaying ?? current.playing,
    } : undefined;
    pendingResumeTime.current = snapshot?.currentTime ?? null;
    setFrameUrl(providerCaptionUrl(url, !hideNativeSubtitles, emptyCaptionUrl, snapshot));
    pendingRestore.current = !!current;
    lastClock.current = null;
    configured.current = { url, hideNativeSubtitles };
  }, [url, hideNativeSubtitles, emptyCaptionUrl]);

  useEffect(() => {
    if (!usesProviderTouchControls(frameUrl)) return;
    const receive = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow || event.source !== frame.contentWindow ||
          event.origin !== new URL(frameUrl).origin) return;
      let data = event.data;
      try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
      if (data?.type === 'PLAYER_EVENT') {
        const time = Number(data.data?.player_progress);
        if (Number.isFinite(time) && time >= 0 && Number(data.data?.player_duration) > 0) {
          const status = data.data?.player_status;
          const playing = status === 'playing' ? true : status === 'paused' ? false :
            lastClock.current?.playing ?? latestPlayback.current?.playing ?? true;
          lastClock.current = { time, at: performance.now(), playing };
          pendingResumeTime.current = null;
        }
      }
      // A caption change reloads the source at startAt. Commands clicked during
      // loading can arrive before its listener exists; restore the latest user
      // choices once metadata is ready, including a newly requested pause/play.
      const ready = data?.type === 'PLAYER_TITLE' ||
        (data?.type === 'PLAYER_EVENT' && Number(data.data?.player_duration) > 0);
      const target = latestPlayback.current;
      if (pendingRestore.current && ready && target) {
        frame.contentWindow.postMessage(JSON.stringify({ player: true,
          action: target.muted ? 'mute' : 'unmute' }), event.origin);
        frame.contentWindow.postMessage(JSON.stringify({ player: true,
          action: (target.requestedPlaying ?? target.playing) ? 'play' : 'pause' }), event.origin);
        pendingRestore.current = false;
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [frameUrl]);

  // Install the anti-popup / overlay shield once the document is ready.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    retries.current = 0;

    const tryInstall = () => {
      if (!installShield(iframe, hideNativeSubtitles)) {
        // Same-origin shield can't reach cross-origin documents — retry briefly in
        // case the provider swaps its document after the first load event.
        retries.current += 1;
        if (retries.current < 4) setTimeout(tryInstall, 700);
      }
    };

    const onLoad = () => setTimeout(tryInstall, 350);
    iframe.addEventListener("load", onLoad);
    const initial = setTimeout(tryInstall, 400);

    return () => {
      iframe.removeEventListener("load", onLoad);
      clearTimeout(initial);
      try {
        (iframe as any).__cinemachatShieldObserver?.disconnect?.();
        (iframe as any).__cinemachatShieldObserver = null;
      } catch {
        /* ignore */
      }
    };
  }, [url, hideNativeSubtitles]);

  // Keep the provider at its original size by default. The existing quality
  // menu can still intentionally zoom when a viewer chooses it.
  const effectiveScale = Math.max(0.8, scale || 1);
  const transform = `translateY(${-Math.max(0, Math.min(15, subtitleOffset || 0))}%) scale(${effectiveScale.toFixed(3)})`;

  return (
    <div
      ref={wrapperRef}
      className={`absolute inset-0 overflow-hidden bg-black ${className || ""}`}
    >
      <div
        className="absolute inset-0 will-change-transform origin-center"
        style={{ transform }}
      >
        <iframe
          ref={(el) => {
            iframeRef.current = el;
          }}
          id={iframeId}
          src={frameUrl}
          tabIndex={-1}
          title={title || "CinemaChat Cinematic Player"}
          loading="eager"
          className="w-full h-full border-0"
          frameBorder="0"
          scrolling="no"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          onLoad={() => {
            // Best-effort first sweep right after (re)load.
            setTimeout(() => installShield(iframeRef.current!, hideNativeSubtitles), 200);
          }}
        />
      </div>
    </div>
  );
}
