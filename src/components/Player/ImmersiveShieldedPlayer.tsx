import React, { useEffect, useRef, useState } from "react";

/**
 * ImmersiveShieldedPlayer — Cinematic Shielded Player for embedded movie streams
 * (hdtoday.sc, vidcloud, vidmoly, streamwish, generic /embed/ providers, ...).
 *
 * Responsibilities:
 *  1) Popup / overlay blocking ("Anti-Copyright Shield"):
 *     - Strict sandbox tokens: allow-scripts + allow-same-origin + allow-presentation.
 *       Dropping allow-popups/allow-forms makes window.open(), target=_blank ads and
 *       auto-submitting ad forms from the embedded site impossible.
 *     - A MutationObserver + injected stylesheet sweep inside the embedded document
 *       (works whenever the embed is same-origin / allow-same-origin-accessible) that
 *       continuously removes popups, share-boxes, banners and promotional overlays.
 *  2) Immersive full-frame scaling:
 *     - ResizeObserver computes a "cover" zoom based on the container aspect ratio so
 *       the video fills the whole CinemaChat player frame and the provider's site
 *       header/footer whitespace is cropped out.
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
  /** User zoom multiplier on top of the automatic cover-fit scale (1 = cover). */
  scale?: number;
  /** Percent (0-15) of container height to shift the video up so subtitles stay visible. */
  subtitleOffset?: number;
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

// Injected stylesheet: locks scrolling, hides ad iframes, and force-fills the video.
const SHIELD_CSS = `
  html, body { overflow: hidden !important; height: 100% !important; }
  video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
  .jwplayer, .vjs_video_3 { background: #000 !important; }
  #adult, #ad-frame, #overlay, #overlay-ads, #aads, #advertise, #banner-ad {
    display: none !important; visibility: hidden !important; pointer-events: none !important;
  }
`;

// Tries to install the shield inside the embedded document. Returns true when the
// document is reachable (same-origin / allow-same-origin) — otherwise the caller
// retries a few times (some providers swap documents after load).
function installShield(iframe: HTMLIFrameElement): boolean {
  try {
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement || !doc.body) return false;

    if (!doc.getElementById("__cinemachat_shield_css__")) {
      const style = doc.createElement("style");
      style.id = "__cinemachat_shield_css__";
      style.textContent = SHIELD_CSS;
      (doc.head || doc.documentElement).appendChild(style);
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
    // Cross-origin embed: parent cannot script it. The strict sandbox token set
    // (no allow-popups) plus the parent-side CSS crop still block the popups.
    return false;
  }
}

export default function ImmersiveShieldedPlayer({
  url,
  iframeId,
  title,
  scale = 1,
  subtitleOffset = 0,
  className,
}: ImmersiveShieldedPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const retries = useRef(0);

  // "Cover" zoom: fill the container and crop the provider's site chrome.
  // Assumes a 16:9 source; scales up (min 1.15x) so headers/footers fall outside
  // the visible frame instead of letterboxing around the player.
  const [coverScale, setCoverScale] = useState(1);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const containerAspect = rect.width / rect.height;
      const cover = Math.max(1.15, 16 / 9 / containerAspect);
      setCoverScale(Math.min(cover, 2.2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Install the anti-popup / overlay shield once the document is ready.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    retries.current = 0;

    const tryInstall = () => {
      if (!installShield(iframe)) {
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
  }, [url]);

  const effectiveScale = coverScale * Math.max(0.8, scale || 1);
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
          src={url}
          title={title || "CinemaChat Cinematic Player"}
          className="w-full h-full border-0"
          frameBorder="0"
          scrolling="no"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; clipboard-write"
          allowFullScreen
          // Anti-Copyright Shield sandbox: blocks popups, ad forms and site chrome
          // while keeping scripts + same-origin access for native playback.
          sandbox="allow-scripts allow-same-origin allow-presentation"
          onLoad={() => {
            // Best-effort first sweep right after (re)load.
            setTimeout(() => installShield(iframeRef.current!), 200);
          }}
        />
      </div>
    </div>
  );
}
