import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Volume2,
  VolumeX,
  Captions,
  CaptionsOff,
  Youtube,
  Instagram,
  Facebook,
  Video,
  Share2,
  Play,
  Pause,
} from "lucide-react";
import { api } from "../services/api";
import { loadYouTubeAPI, getYTId, isYTVideoId } from "../utils/youtube";

/**
 * Parse EXACTLY ONE bare 11-char YouTube video id out of an Admin URL.
 * Anything else (playlists, channels, garbage) yields "" and is dropped.
 */
const parseHeroVideoId = (raw: unknown): string => {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return getYTId(trimmed) || (isYTVideoId(trimmed) ? trimmed : "");
};

/**
 * HeroVideoPlayer — self-contained hero/trailer player with playlist support.
 *
 * Extracted from App.tsx to isolate hero video playback from the catalog
 * movie list. The queue is built STRICTLY from the two Admin Section 7 URLs:
 *   [video1Id, video2Id].filter(Boolean)
 * Videos play in order (1 → 2 → 1 → 2 … forever). One empty Admin field ⇒
 * the other video loops alone; both empty ⇒ static hero, NO player at all.
 *
 * SINGLE PLAYER INSTANCE LIFECYCLE:
 *   - ONE YT.Player is created when Video 1 becomes known and is NEVER
 *     destroyed/recreated for transitions or admin re-saves. Every source
 *     change hot-swaps via loadVideoById() on the same iframe.
 *   - WELCOME INTRO: a branded overlay shows ~3s ONCE per homepage mount
 *     while Video 1 already prepares/plays BEHIND it; at ~3s exactly it
 *     fades (no waiting for extra events) and never reappears between
 *     videos. A small loader shows only while the exact next video is
 *     genuinely buffering.
 *   - AUTOPLAY-BLOCKED FALLBACK: if the current video cannot start within
 *     a bounded window, ONE clear Play/Unmute affordance appears for the
 *     SAME video — never an auto-skip, never endless loading.
 */
const HeroVideoPlayer: React.FC<{
  activeFeaturedMovie: any;
  countdown: number;
  setCountdown: React.Dispatch<React.SetStateAction<number>>;
  isHeroMuted: boolean;
  setIsHeroMuted: React.Dispatch<React.SetStateAction<boolean>>;
  hasInteracted: boolean;
  heroPlaylist?: string[];
  heroReady?: boolean;
  config: any;
  activeAudioSource?: "hero" | "room";
  isMoviePlayerOpen?: boolean;
}> = ({
  activeFeaturedMovie,
  countdown,
  setCountdown,
  isHeroMuted,
  setIsHeroMuted,
  hasInteracted,
  heroPlaylist,
  heroReady = false,
  config,
  activeAudioSource = "hero",
  isMoviePlayerOpen = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const isMuted = isHeroMuted;
  const setIsMuted = setIsHeroMuted;

  // ─── WELCOME INTRO (latched, ~3s) ────────────────────────────────────
  // introDone latches true once and NEVER resets — the intro can never
  // reappear between playlist transitions. staticOnly (config loaded +
  // empty) skips the intro entirely: the static hero shows instantly.
  const [introDone, setIntroDone] = useState(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── STRICT PLAYLIST: [video1Id, video2Id].filter(Boolean) ────────────
  // Only the two Admin Section 7 URLs are parsed into bare video IDs.
  // No fallback, no catalog substitute, no cached extras — an empty Admin
  // config yields an empty queue and NO player initialization whatsoever.
  const video1Id = useMemo(
    () => parseHeroVideoId(heroPlaylist?.[0]),
    [heroPlaylist],
  );
  const video2Id = useMemo(
    () => parseHeroVideoId(heroPlaylist?.[1]),
    [heroPlaylist],
  );
  const playlistIds = useMemo(
    () => [video1Id, video2Id].filter(Boolean),
    [video1Id, video2Id],
  );

  // STATIC-ONLY MODE: the authoritative config has been loaded (heroReady)
  // and it holds NO videos. The hero must show its static poster/title/
  // buttons IMMEDIATELY — no intro timer, no YouTube init, no spinner.
  const staticOnly = heroReady && playlistIds.length === 0;

  // Currently loaded video id (drives poster + player layer). Updated on
  // every transition WITHOUT recreating the player instance.
  const [activeVideoId, setActiveVideoId] = useState<string>(
    () => playlistIds[0] || "",
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const disposedRef = useRef(false);
  // Live mirrors so the long-lived player's event handlers always read the
  // latest values without ever needing to re-bind listeners.
  const playlistIdsRef = useRef<string[]>(playlistIds);
  playlistIdsRef.current = playlistIds;
  const currentIndexRef = useRef(0);
  const epochRef = useRef(0); // bumps on every source swap → stale timers abort
  const transitionLockRef = useRef(false);
  const lastEndedAtRef = useRef(0);
  const hasStartedPlayingRef = useRef(false);
  const isPlayingRef = useRef(true);
  isPlayingRef.current = isPlaying;
  const deliberatePauseRef = useRef(false);
  const isMutedRef = useRef(isHeroMuted);
  isMutedRef.current = isHeroMuted;

  // ── HERO VOLUME LEVEL ────────────────────────────────────────────────
  // Slider level (0-100) for the header volume popup. Defaults to 100 so
  // every autoplay/unmute path behaves EXACTLY as before until the user
  // actually drags the slider.
  const [heroVolume, setHeroVolume] = useState(100);
  const heroVolumeRef = useRef(100);
  heroVolumeRef.current = heroVolume;
  // Last non-zero level — used when unmuting after a drag to zero.
  const lastAudibleVolumeRef = useRef(100);
  const [volumePopupOpen, setVolumePopupOpen] = useState(false);
  const volumeMenuRef = useRef<HTMLDivElement | null>(null);
  const volumeTrackRef = useRef<HTMLDivElement | null>(null);
  const volumeDragRef = useRef(false);
  const volumeCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Autoplay/policy blocked or stalled: ONE clear Play/Unmute affordance
  // for the SAME video (never an auto-skip to another video).
  const [awaitingPlayGesture, setAwaitingPlayGesture] = useState(false);
  // Small loader shown ONLY while the exact next video is genuinely
  // buffering after a transition (bounded by the safety timer).
  const [nextBuffering, setNextBuffering] = useState(false);
  // Monotonic transition counter — surfaced via data-hero-seq for QA.
  const [transitionSeq, setTransitionSeq] = useState(0);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // QA/verification bridge: mirrors transition history into the DOM so
  // automated tests can read it regardless of JS-world isolation.
  const heroDebugLog = (line: string) => {
    const el = document.getElementById("hero-debug-log");
    if (!el) return;
    el.textContent = ((el.textContent ? `${el.textContent}|` : "") + line).slice(-500);
    el.dataset.last = line;
    el.dataset.ts = String(Date.now());
  };

  // ── BOUNDED SAFETY TIMER ────────────────────────────────────────────
  // If the CURRENT video has not reached PLAYING within the budget, stop
  // the loader and surface the Play/Unmute affordance for the SAME video.
  // Never advances the playlist on a timeout.
  const SAFETY_TIMEOUT_MS = 7000;

  const clearSafetyTimer = () => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  const startSafetyTimer = () => {
    clearSafetyTimer();
    const epoch = epochRef.current;
    safetyTimerRef.current = setTimeout(() => {
      if (disposedRef.current || epoch !== epochRef.current) return;
      transitionLockRef.current = false;
      setNextBuffering(false);
      if (!hasStartedPlayingRef.current) {
        console.warn(
          `[Hero] No PLAYING within ${SAFETY_TIMEOUT_MS}ms — showing Play/Unmute for "${
            playlistIdsRef.current[currentIndexRef.current] || ""
          }"`,
        );
        setAwaitingPlayGesture(true);
        setIsHeroMuted(true);
      }
    }, SAFETY_TIMEOUT_MS);
  };
  const [ccEnabled, setCcEnabled] = useState(true);
  const [onlineViewers, setOnlineViewers] = useState(0);
  const sessionIdRef = useRef<string>("");
  if (sessionIdRef.current === "") {
    sessionIdRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    let cancelled = false;
    const updateViewers = async () => {
      try {
        const data = await api.getStats(sessionIdRef.current);
        if (!cancelled && data && typeof data.visitors === "number") {
          setOnlineViewers(data.visitors);
        }
      } catch (_) {}
    };
    updateViewers();
    const interval = setInterval(updateViewers, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return (
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      "ontouchstart" in window ||
      window.innerWidth < 768
    );
  }, []);

  const safePlayerCall = (player: any, method: string, ...args: any[]) => {
    try {
      const result = player?.[method]?.(...args);
      if (result && typeof result.catch === "function") result.catch(() => {});
      return result;
    } catch (_) {
      return undefined;
    }
  };

  const userAudioControlRef = useRef(false);
  const unmuteRetryTimerRef = useRef<any>(null);
  // Live mirrors of the audio-interlock props so the singleton-player
  // handlers never read stale values.
  const activeAudioSourceRef = useRef(activeAudioSource);
  activeAudioSourceRef.current = activeAudioSource;
  const isMoviePlayerOpenRef = useRef(isMoviePlayerOpen);
  isMoviePlayerOpenRef.current = isMoviePlayerOpen;

  const takeAudioControl = () => {
    userAudioControlRef.current = true;
    if (unmuteRetryTimerRef.current) {
      clearTimeout(unmuteRetryTimerRef.current);
      unmuteRetryTimerRef.current = null;
    }
  };

  // ── VOLUME HELPERS ─────────────────────────────────────────────────
  // Update the slider UI + mirror refs (single source of truth).
  const commitHeroVolume = (v: number) => {
    heroVolumeRef.current = v;
    setHeroVolume(v);
    if (v > 0) lastAudibleVolumeRef.current = v;
  };

  // Volume to restore when leaving mute: the slider level, or the last
  // audible level if it was dragged all the way down.
  const restoreHeroVolume = () =>
    heroVolumeRef.current > 0 ? heroVolumeRef.current : lastAudibleVolumeRef.current;

  // Slider drag / track click → live player volume. Dragging is an
  // explicit user gesture on the audio bus, so it claims audio control.
  const applyHeroVolume = (val: number) => {
    const v = Math.max(0, Math.min(100, Math.round(val)));
    takeAudioControl();
    commitHeroVolume(v);
    const player = playerRef.current;
    if (v === 0) {
      safePlayerCall(player, "mute");
      setIsMuted(true);
      return;
    }
    if (isMutedRef.current) {
      safePlayerCall(player, "unMute");
      setIsMuted(false); // the isMuted sync effect re-verifies below
    }
    safePlayerCall(player, "setVolume", v);
  };

  const toggleMute = () => {
    const player = playerRef.current;
    const next = !isMuted;
    takeAudioControl();
    if (player) {
      if (next) {
        safePlayerCall(player, "mute");
      } else {
        // Unmute restores the SLIDER level (not a hardcoded 100).
        const vol = restoreHeroVolume();
        commitHeroVolume(vol);
        safePlayerCall(player, "unMute");
        safePlayerCall(player, "setVolume", vol);
      }
    }
    setIsMuted(next);
  };

  const forcePlay = (target: any, attempts = 6) => {
    if (!target) return;
    safePlayerCall(target, "playVideo");
    const playerState = safePlayerCall(target, "getPlayerState");
    const PLAYING = (window as any).YT?.PlayerState?.PLAYING ?? 1;
    // Abort stale retries: the singleton instance may have been destroyed
    // or swapped since this chain started.
    if (playerRef.current !== target) return;
    if (playerState !== PLAYING && attempts > 0) {
      setTimeout(() => forcePlay(target, attempts - 1), 200);
    }
  };

  const userUnmute = () => {
    const player = playerRef.current;
    if (!player) return;
    takeAudioControl();
    const vol = restoreHeroVolume();
    commitHeroVolume(vol);
    safePlayerCall(player, "unMute");
    safePlayerCall(player, "setVolume", vol);
    safePlayerCall(player, "playVideo");
    setIsMuted(false);
    setAwaitingPlayGesture(false);
    forcePlay(player, 4);
  };

  // ── AGGRESSIVE UNMUTE RETRY ──────────────────────────────────────────
  // Browsers block programmatic unMute() on fresh page loads without a
  // trusted user gesture.  This handler hammers the YT API with
  // unMute() + setVolume(100) + playVideo() every 100ms for up to one
  // second (10 attempts), stopping the instant the browser accepts the
  // audio stream (isMuted() === false).
  const aggressiveUnmute = (attempts = 10) => {
    if (unmuteRetryTimerRef.current) {
      clearTimeout(unmuteRetryTimerRef.current);
      unmuteRetryTimerRef.current = null;
    }
    const tick = (remaining: number) => {
      const player = playerRef.current;
      // Abort: no player, user took manual audio control mid-retry, or
      // another audio source (drama room / movie trailer) owns the bus.
      if (
        !player ||
        userAudioControlRef.current ||
        activeAudioSourceRef.current === "room" ||
        isMoviePlayerOpenRef.current
      ) {
        return;
      }

      safePlayerCall(player, "unMute");
      safePlayerCall(player, "setVolume", restoreHeroVolume());
      safePlayerCall(player, "playVideo");

      const stillMuted = safePlayerCall(player, "isMuted") === true;
      setIsHeroMuted(stillMuted);

      if (!stillMuted || remaining <= 0) return;
      // Mobile browsers never accept programmatic unmute without a real
      // touch — bail out honestly instead of burning the retry budget.
      if (isMobile) return;

      unmuteRetryTimerRef.current = setTimeout(
        () => tick(remaining - 1),
        100,
      );
    };
    tick(attempts);
  };

  // ── PSEUDO-INTERACTION HANDLER ───────────────────────────────────────
  // Simulated user interaction: dispatches a synthetic click on the
  // player surface (harmless where the browser discards untrusted
  // events) and immediately chains the aggressive unmute retry.
  // NOTE: the z-10 tap overlay that owns handleHeroTap/userUnmute is a
  // DOM *sibling* of #hero-yt-player, so this synthetic click cannot
  // accidentally register as manual audio control.
  const pseudoInteractionUnmute = () => {
    try {
      document
        .getElementById("hero-yt-player")
        ?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
    } catch (_) {}
    aggressiveUnmute();
  };

  const enableCaptions = (target: any) => {
    if (!target) return;
    safePlayerCall(target, "loadModule", "captions");
    safePlayerCall(target, "setOption", "cc", "lang", "en");
  };

  const disableCaptions = (target: any) => {
    if (!target) return;
    safePlayerCall(target, "unloadModule", "captions");
  };

  const handleHeroTap = () => {
    userUnmute();
  };

  const toggleCaptions = () => {
    const next = !ccEnabled;
    setCcEnabled(next);
    if (next) {
      enableCaptions(playerRef.current);
    } else {
      disableCaptions(playerRef.current);
    }
  };

  const togglePlayPause = () => {
    const player = playerRef.current;
    const next = !isPlaying;
    deliberatePauseRef.current = !next;
    setIsPlaying(next);
    if (player) {
      if (next) {
        safePlayerCall(player, "playVideo");
      } else {
        safePlayerCall(player, "pauseVideo");
      }
    }
  };

  const apiReady = useRef(loadYouTubeAPI());

  // ── SEAMLESS TRANSITION: 1 → 2 → 1 → 2 … (single player instance) ─────
  // On ENDED the source is swapped on the SAME iframe via loadVideoById().
  // Guards against duplicate/stale callbacks:
  //   1. transitionLock — set here, cleared on the next PLAYING event.
  //   2. timestamp floor — duplicate ENDED storms within 800ms are dropped.
  //   3. epoch bump — invalidates any safety timer from the previous video.
  // With a single Admin video the modulo wraps to itself → clean restart.
  const goToNextVideo = () => {
    if (disposedRef.current) return;
    const now = Date.now();
    if (transitionLockRef.current) return;
    if (now - lastEndedAtRef.current < 800) return;
    lastEndedAtRef.current = now;
    transitionLockRef.current = true;

    const player = playerRef.current;
    const ids = playlistIdsRef.current;
    if (!player || ids.length === 0) {
      transitionLockRef.current = false;
      return;
    }

    clearSafetyTimer();

    const endedId =
      safePlayerCall(player, "getVideoData")?.video_id ||
      ids[currentIndexRef.current] ||
      "";

    const nextIndex = (currentIndexRef.current + 1) % ids.length;
    currentIndexRef.current = nextIndex;
    const nextId = ids[nextIndex];

    epochRef.current += 1; // invalidate stale timers/retries
    setActiveVideoId(nextId);
    setIsPlaying(true);
    deliberatePauseRef.current = false;
    // Small loader ONLY while this exact next video genuinely buffers —
    // bounded by the safety timer (never endless).
    setNextBuffering(true);

    console.log(
      `[Hero] TRANSITION: "${endedId}" ended → loadVideoById "${nextId}" (slot ${
        nextIndex + 1
      }/${ids.length})`,
    );
    heroDebugLog(`T${transitionSeqRef.current + 1}:${endedId}->${nextId}`);
    setTransitionSeq((s) => s + 1);

    safePlayerCall(player, "loadVideoById", nextId);
    startSafetyTimer();
  };
  // Refs so the long-lived player instance always executes the latest
  // versions of these handlers (no stale closures after re-renders).
  const goToNextVideoRef = useRef(goToNextVideo);
  goToNextVideoRef.current = goToNextVideo;
  const transitionSeqRef = useRef(0);
  transitionSeqRef.current = transitionSeq;

  // QA hook (no-op in production usage): a `hero-qa-force-end` window
  // event seeks the current video to ~1.5s before its end, letting
  // automated tests exercise the natural ENDED → transition path.
  useEffect(() => {
    const onQaForceEnd = () => {
      const p = playerRef.current;
      if (!p) return;
      const d = safePlayerCall(p, "getDuration");
      if (!d || d < 10) return;
      safePlayerCall(p, "seekTo", Math.max(1, d - 1.5), true);
      heroDebugLog(`QA_FORCE_END:${safePlayerCall(p, "getVideoData")?.video_id || "?"}`);
    };
    // Document-level (not window) so automation running in an isolated
    // JS world can still dispatch this event through the shared DOM.
    document.addEventListener("hero-qa-force-end", onQaForceEnd);
    return () => document.removeEventListener("hero-qa-force-end", onQaForceEnd);
  }, []);

  // Event handler refs — reassigned EVERY render; the player's listeners
  // were bound once at creation and delegate through them.
  const handleOnReadyRef = useRef<(event: any) => void>(() => {});
  const handleStateChangeRef = useRef<(event: any) => void>(() => {});
  const handleErrorRef = useRef<() => void>(() => {});

  handleOnReadyRef.current = (event: any) => {
    if (disposedRef.current) return;
    const target = event?.target;
    // ── PRESERVED AUDIO/AUTOPLAY WORKAROUND ───────────────────────────
    // playerVars mute:1 satisfies browser autoplay policy; it is revoked
    // the instant the API reports ready so sound flows as soon as allowed.
    safePlayerCall(target, "unMute");
    safePlayerCall(target, "setVolume", restoreHeroVolume());
    forcePlay(target, 30);
    aggressiveUnmute();
    safePlayerCall(target, "setPlaybackQuality", "hd1080");
    enableCaptions(target);
    setIsPlaying(true);
    setIsHeroMuted(false);
  };

  handleStateChangeRef.current = (event: any) => {
    if (disposedRef.current) return;
    const ytState = (window as any).YT?.PlayerState;
    const state = event.data;
    const target = event.target;
    const actualId =
      safePlayerCall(target, "getVideoData")?.video_id || "";

    if (state === ytState?.PLAYING) {
      clearSafetyTimer();
      transitionLockRef.current = false;
      hasStartedPlayingRef.current = true;
      setNextBuffering(false);
      setAwaitingPlayGesture(false);
      deliberatePauseRef.current = false;
      // Belt-and-suspenders: force unmute on every PLAYING event in case
      // an earlier attempt was deferred by browser policy.
      safePlayerCall(target, "unMute");
      safePlayerCall(target, "setVolume", restoreHeroVolume());
      console.log(`[Hero] PLAYING "${actualId}"`);
    } else if (state === ytState?.ENDED) {
      console.log(`[Hero] ENDED "${actualId}"`);
      goToNextVideoRef.current();
    } else if (state === ytState?.PAUSED) {
      if (!deliberatePauseRef.current && !transitionLockRef.current) {
        // Unexpected pause — force-resume after 50ms.
        setTimeout(() => {
          if (!disposedRef.current && playerRef.current === target) {
            safePlayerCall(target, "playVideo");
          }
        }, 50);
      }
    } else if (state === ytState?.BUFFERING) {
      // Still genuinely buffering the exact current video → extend budget.
      startSafetyTimer();
    }
  };

  handleErrorRef.current = () => {
    if (disposedRef.current) return;
    const ids = playlistIdsRef.current;
    console.warn(
      `[Hero] Player error on "${
        ids[currentIndexRef.current] || ""
      }" — skipping within the Admin pair only`,
    );
    // A genuinely broken video (removed/private) skips to the OTHER Admin
    // video. A lone broken video must NOT reload-loop: surface the
    // gesture affordance instead.
    if (ids.length <= 1) {
      clearSafetyTimer();
      transitionLockRef.current = false;
      setNextBuffering(false);
      setAwaitingPlayGesture(true);
      return;
    }
    transitionLockRef.current = false;
    lastEndedAtRef.current = 0;
    goToNextVideoRef.current();
  };

  // ── CLEANUP ────────────────────────────────────────────────────────────
  // Destroy the YT Player and clear ALL timers on unmount to prevent
  // memory leaks and background event handler firings.
  useEffect(() => {
    return () => {
      disposedRef.current = true;
      clearSafetyTimer();
      if (introTimerRef.current) {
        clearTimeout(introTimerRef.current);
        introTimerRef.current = null;
      }
      if (unmuteRetryTimerRef.current) {
        clearTimeout(unmuteRetryTimerRef.current);
        unmuteRetryTimerRef.current = null;
      }
      if (playerRef.current) {
        try {
          // Remove all event listeners before destroying to prevent
          // any queued callbacks from firing after unmount
          playerRef.current.removeEventListener?.("onReady");
          playerRef.current.removeEventListener?.("onStateChange");
          playerRef.current.removeEventListener?.("onError");
          playerRef.current.destroy();
        } catch (_) {}
        playerRef.current = null;
        try { delete (window as any).__heroPlayer; } catch (_) {}
      }
    };
  }, []);

  // ── ONE PLAYER INSTANCE FOR THE WHOLE SESSION ────────────────────────
  // Created ONCE when Video 1 becomes known (immediately — behind the 3s
  // intro). Every later source change (playlist transition OR admin
  // re-save) hot-swaps via loadVideoById() on the SAME iframe. Empty
  // config ⇒ no player at all (static hero).
  const playlistKey = playlistIds.join("|");
  useEffect(() => {
    let cancelled = false;
    // React StrictMode simulates an unmount/remount in development; the
    // dispose flag must be re-armed on every setup pass.
    disposedRef.current = false;

    if (playlistIds.length === 0) {
      // Config empty/cleared mid-session → full teardown, static hero.
      epochRef.current += 1;
      clearSafetyTimer();
      transitionLockRef.current = false;
      hasStartedPlayingRef.current = false;
      currentIndexRef.current = 0;
      setActiveVideoId("");
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
        try { delete (window as any).__heroPlayer; } catch (_) {}
      }
      return;
    }

    apiReady.current.then(() => {
      if (cancelled || disposedRef.current) return;
      const YTT = (window as any).YT;
      if (!YTT?.Player) return;

      epochRef.current += 1;
      currentIndexRef.current = 0;
      hasStartedPlayingRef.current = false;
      transitionLockRef.current = false;
      lastEndedAtRef.current = 0;
      setActiveVideoId(playlistIds[0]);

      if (playerRef.current) {
        // Same instance — the admin saved new links mid-session.
        console.log(
          `[Hero] Config changed → loadVideoById "${playlistIds[0]}" (restart at slot 1)`,
        );
        safePlayerCall(playerRef.current, "loadVideoById", playlistIds[0]);
        startSafetyTimer();
        return;
      }

      // ── INITIAL CREATION: prepare Video 1 BEHIND the intro overlay ──
      console.log(`[Hero] Preparing video 1 behind intro: "${playlistIds[0]}"`);
      heroDebugLog(`PREPARE:${playlistIds[0]}`);
      playerRef.current = new YTT.Player("hero-yt-player", {
        videoId: playlistIds[0],
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          mute: 1, // muted autoplay guaranteed by all browsers
          controls: 0, // clean UI — custom controls only
          showinfo: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 0,
          disablekb: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          hl: "en",
        },
        events: {
          onReady: (event: any) => handleOnReadyRef.current(event),
          onStateChange: (event: any) => handleStateChangeRef.current(event),
          onError: () => handleErrorRef.current(),
        },
      });
      // Debug/verification hook: lets local QA observe the SINGLE player
      // instance, its current video id, and state transitions directly.
      (window as any).__heroPlayer = playerRef.current;

      // Belt-and-suspenders: explicitly tell the fresh player to start
      // unmuted at full volume BEFORE playback begins (re-enforced in
      // onReady the moment the API reports the player ready).
      safePlayerCall(playerRef.current, "unMute");
      safePlayerCall(playerRef.current, "setVolume", restoreHeroVolume());
      startSafetyTimer();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistKey]);

  // ── 3s INTRO TIMER ───────────────────────────────────────────────────
  // Starts once Video 1 is known (same moment the player starts preparing
  // behind the intro). Exactly at ~3s the intro fades — reveal is NOT
  // delayed by buffering events. Latched: fires once per homepage mount.
  useEffect(() => {
    if (staticOnly || !playlistIds[0]) return undefined;
    if (introTimerRef.current) return undefined; // already scheduled
    introTimerRef.current = setTimeout(() => {
      introTimerRef.current = null;
      setIntroDone(true);
      console.log("[Hero] Intro complete (~3s) — revealing prepared video 1");
      // Exact-fade audio push (preserved pseudo-interaction workaround).
      if (playerRef.current) pseudoInteractionUnmute();
    }, 3000);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistKey, staticOnly]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (isMuted) {
      safePlayerCall(playerRef.current, "mute");
      return;
    }
    safePlayerCall(playerRef.current, "unMute");
    if (
      !userAudioControlRef.current &&
      safePlayerCall(playerRef.current, "isMuted") === true
    ) {
      setIsMuted(true);
    }
  }, [isMuted]);

  useEffect(() => {
    const onFirstInteraction = (e: Event) => {
      // Only TRUSTED gestures count.  Our own synthetic pseudo-interaction
      // clicks must not consume this listener or flag manual audio control.
      if (!e.isTrusted) return;
      const player = playerRef.current;
      if (player && isMutedRef.current) {
        takeAudioControl();
        const vol = restoreHeroVolume();
        commitHeroVolume(vol);
        safePlayerCall(player, "unMute");
        safePlayerCall(player, "setVolume", vol);
        setIsMuted(false);
      }
      document.removeEventListener("pointerdown", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
    };
    document.addEventListener("pointerdown", onFirstInteraction);
    document.addEventListener("touchstart", onFirstInteraction);
    return () => {
      document.removeEventListener("pointerdown", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
    };
  }, []);

  // ── VOLUME POPUP: CLEAN DISMISSAL ───────────────────────────────────
  // Closes on any click outside the popup and on Escape. Capture phase
  // so the hero tap-overlay can never swallow the event first.
  useEffect(() => {
    if (!volumePopupOpen) return undefined;
    const onDocPointerDown = (e: PointerEvent) => {
      if (
        volumeMenuRef.current &&
        e.target instanceof Node &&
        !volumeMenuRef.current.contains(e.target)
      ) {
        setVolumePopupOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVolumePopupOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [volumePopupOpen]);

  // Never leave a pending hover-close timer behind on unmount.
  useEffect(
    () => () => {
      if (volumeCloseTimerRef.current) {
        clearTimeout(volumeCloseTimerRef.current);
        volumeCloseTimerRef.current = null;
      }
    },
    [],
  );

  // ── VOLUME POPUP: TRACK POINTER MATH ────────────────────────────────
  // Vertical fill = bottom(0%) → top(100%). Works for click-to-jump and
  // smooth dragging (pointer capture keeps drag events on the track even
  // when the cursor leaves it). Direction-neutral under RTL.
  const applyVolumeFromPointer = (clientY: number) => {
    const track = volumeTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.height <= 0) return;
    const ratio = 1 - (clientY - rect.top) / rect.height;
    applyHeroVolume(ratio * 100);
  };

  useEffect(() => {
    if (playerRef.current) {
      isPlaying
        ? safePlayerCall(playerRef.current, "playVideo")
        : safePlayerCall(playerRef.current, "pauseVideo");
    }
  }, [isPlaying]);

  // ── GLOBAL AUDIO INTERLOCK ──────────────────────────────────────────
  // When another audio source claims priority (drama room), immediately
  // pause + mute the hero to enforce single-source audio.  Saves the
  // previous play/mute state so it can be accurately restored when the
  // room releases audio.
  const roomSuppressedRef = useRef(false);
  const restoreRoomRef = useRef({ play: false, unmute: false });
  const trailerSuppressedRef = useRef(false);
  const restoreTrailerRef = useRef({ play: false, unmute: false });
  useEffect(() => {
    if (activeAudioSource === "room" && !roomSuppressedRef.current) {
      roomSuppressedRef.current = true;
      restoreRoomRef.current = {
        play: isPlayingRef.current,
        unmute: !isMutedRef.current,
      };
      userAudioControlRef.current = true;
      if (unmuteRetryTimerRef.current) {
        clearTimeout(unmuteRetryTimerRef.current);
        unmuteRetryTimerRef.current = null;
      }
      deliberatePauseRef.current = true;
      setIsPlaying(false);
      safePlayerCall(playerRef.current, "pauseVideo");
      setIsMuted(true);
      setIsHeroMuted(true);
    } else if (
      activeAudioSource === "hero" &&
      roomSuppressedRef.current &&
      !trailerSuppressedRef.current
    ) {
      roomSuppressedRef.current = false;
      const restore = restoreRoomRef.current;
      deliberatePauseRef.current = !restore.play;
      setIsPlaying(restore.play);
      if (restore.play) safePlayerCall(playerRef.current, "playVideo");
      const shouldUnmute = restore.unmute;
      setIsHeroMuted(!shouldUnmute);
      if (shouldUnmute) {
        safePlayerCall(playerRef.current, "unMute");
        safePlayerCall(playerRef.current, "setVolume", restoreHeroVolume());
        setIsMuted(false);
      }
    }
  }, [activeAudioSource, setIsHeroMuted]);

  useEffect(() => {
    if (isMoviePlayerOpen && !trailerSuppressedRef.current) {
      trailerSuppressedRef.current = true;
      restoreTrailerRef.current = {
        play: isPlayingRef.current,
        unmute: !isMutedRef.current,
      };
      deliberatePauseRef.current = true;
      setIsPlaying(false);
      safePlayerCall(playerRef.current, "pauseVideo");
      setIsHeroMuted(true);
    } else if (!isMoviePlayerOpen && trailerSuppressedRef.current) {
      trailerSuppressedRef.current = false;
      const restore = restoreTrailerRef.current;
      deliberatePauseRef.current = !restore.play;
      setIsPlaying(restore.play);
      if (restore.play) safePlayerCall(playerRef.current, "playVideo");
      // Only restore unmute if no other audio source took priority
      const shouldUnmute = restore.unmute && activeAudioSource !== "room";
      setIsHeroMuted(!shouldUnmute);
      if (shouldUnmute) {
        safePlayerCall(playerRef.current, "unMute");
        safePlayerCall(playerRef.current, "setVolume", restoreHeroVolume());
        setIsMuted(false);
      }
    }
  }, [isMoviePlayerOpen, activeAudioSource, setIsHeroMuted]);
  // ── Whether to show the YouTube player layer ──────────────────────────
  // Always show when a valid ID exists — the intro overlay (z-[200])
  // covers it for the first ~3s while Video 1 prepares behind it.
  const showPlayerLayer = !!activeVideoId && isYTVideoId(activeVideoId);
  const introVisible = !staticOnly && !introDone && !!playlistIds[0];

  return (
    <section
      className="relative w-full h-[60vh] md:h-[85vh] bg-black overflow-hidden select-none"
      style={{ display: "block", opacity: 1 }}
      data-hero-video={activeVideoId || ""}
      data-hero-seq={transitionSeq}
      data-hero-buffering={nextBuffering ? "1" : "0"}
      data-hero-gesture={awaitingPlayGesture ? "1" : "0"}
      data-hero-muted={isMuted ? "1" : "0"}
      data-hero-intro={introVisible ? "1" : "0"}
    >
      {/* QA/verification bridge — readable from any JS world (DOM-shared) */}
      <div id="hero-debug-log" className="hidden" aria-hidden="true" />
      <div
        className="w-full h-full overflow-hidden pointer-events-none"
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      >
        {showPlayerLayer && (
          <div
            className="w-full h-full scale-[1.35] bg-cover bg-center"
            id="hero-player"
            ref={containerRef}
            style={activeVideoId ? { backgroundImage: `url(https://img.youtube.com/vi/${activeVideoId}/maxresdefault.jpg)` } : undefined}
          >
            <div id="hero-yt-player" className="w-full h-full" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent z-2 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black to-transparent z-2 pointer-events-none" />
      </div>

      <div
        className="absolute inset-0 bg-transparent pointer-events-auto"
        style={{ zIndex: 10 }}
        onClick={handleHeroTap}
      />

      <div
        className="relative w-full h-full flex flex-col justify-between p-4 md:p-8 pointer-events-none"
        style={{ position: "relative", zIndex: 100 }}
      >
        <AnimatePresence>
          {countdown > 0 && (
            <motion.div
              key="countdown-overlay"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 z-55 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md cursor-pointer pointer-events-auto"
              onClick={() => {
                setCountdown(0);
                const player = playerRef.current;
                if (player) {
                  takeAudioControl();
                  const vol = restoreHeroVolume();
                  commitHeroVolume(vol);
                  safePlayerCall(player, "unMute");
                  safePlayerCall(player, "setVolume", vol);
                }
                setIsMuted(false);
                setIsPlaying(true);
              }}
            >
              <motion.div
                key={countdown}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="text-center p-6 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-lg flex flex-col items-center"
              >
                <p className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-brand-primary mb-3 kurdish-text">
                  دەستپێکردنی فیلمی سەرەکی لە
                </p>
                <span className="text-7xl md:text-9xl font-black text-white font-mono drop-shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse">
                  {countdown}
                </span>
                <p className="text-[10px] md:text-xs text-gray-400 mt-4 kurdish-text opacity-70">
                  بۆ بازدان لێرە کلیک بکە
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute top-4 right-6 md:right-12 z-40 flex items-center gap-1.5 md:gap-3 pointer-events-none">
          <div
            className="pointer-events-none flex items-center gap-1.5 p-2 md:p-3 bg-black/50 border border-white/10 rounded-xl md:rounded-2xl backdrop-blur-md shadow-lg"
            title="بینەری ئۆنلاین لە ماڵپەڕ"
            id="hero-online-badge"
          >
            <span className="relative flex w-1.5 h-1.5 md:w-2 md:h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 md:w-2 md:h-2 bg-green-400" />
            </span>
            <Users className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 text-green-400" />
            <span className="text-[11px] md:text-xs font-black text-white font-mono tabular-nums leading-none">
              {onlineViewers}
            </span>
          </div>

          {/* ── VOLUME CONTROL + VERTICAL SLIDER POPUP ──────────────────
              The icon keeps its mute/unmute toggle; hovering (desktop) or
              tapping reveals a vertical 0-100% slider dropdown below the
              icon row. Centered anchor keeps it RTL-safe; pointer capture
              gives smooth dragging; clicks outside dismiss it cleanly. */}
          <div
            ref={volumeMenuRef}
            className="relative pointer-events-auto"
            onMouseEnter={() => {
              if (volumeCloseTimerRef.current) {
                clearTimeout(volumeCloseTimerRef.current);
                volumeCloseTimerRef.current = null;
              }
              setVolumePopupOpen(true);
            }}
            onMouseLeave={() => {
              if (volumeCloseTimerRef.current) clearTimeout(volumeCloseTimerRef.current);
              volumeCloseTimerRef.current = setTimeout(
                () => setVolumePopupOpen(false),
                160,
              );
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
                setVolumePopupOpen(true);
              }}
              className={`p-2 md:p-3 bg-black/50 border rounded-xl md:rounded-2xl backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/audio ${
                !isMuted
                  ? "text-green-400 border-green-500/20 hover:border-green-500/35 hover:bg-green-500/15"
                  : "text-white border-white/10 hover:border-white/25 hover:bg-white/10"
              }`}
              title={!isMuted ? "بێدەنگکردن" : "کاراکردنی دەنگ"}
              id="hero-mute-btn"
            >
              {!isMuted ? (
                <Volume2 className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/audio:scale-110" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 opacity-80 transition-transform group-hover/audio:scale-110" />
              )}
            </button>

            {/* Vertical slider popup (opens DOWNWARD from the icon) */}
            {volumePopupOpen && (
              <div
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2 p-3 rounded-2xl bg-black/90 backdrop-blur-md border border-white/10 shadow-2xl select-none"
                onMouseEnter={() => {
                  if (volumeCloseTimerRef.current) {
                    clearTimeout(volumeCloseTimerRef.current);
                    volumeCloseTimerRef.current = null;
                  }
                }}
                onMouseLeave={() => {
                  if (volumeCloseTimerRef.current) clearTimeout(volumeCloseTimerRef.current);
                  volumeCloseTimerRef.current = setTimeout(
                    () => setVolumePopupOpen(false),
                    160,
                  );
                }}
              >
                <span className="text-[10px] font-mono font-bold text-zinc-200 tabular-nums leading-none">
                  {Math.round(heroVolume)}%
                </span>

                {/* Vertical track — click to jump, drag for smooth control */}
                <div
                  ref={volumeTrackRef}
                  role="slider"
                  aria-label="ئاستی دەنگ"
                  aria-orientation="vertical"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(heroVolume)}
                  tabIndex={0}
                  className="relative h-28 w-6 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-full"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    volumeDragRef.current = true;
                    try {
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    } catch (_) {}
                    applyVolumeFromPointer(e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (!volumeDragRef.current) return;
                    applyVolumeFromPointer(e.clientY);
                  }}
                  onPointerUp={(e) => {
                    volumeDragRef.current = false;
                    try {
                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    } catch (_) {}
                  }}
                  onPointerCancel={() => {
                    volumeDragRef.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      applyHeroVolume(heroVolumeRef.current + 10);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      applyHeroVolume(heroVolumeRef.current - 10);
                    }
                  }}
                >
                  {/* Rail */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full bg-white/10" />
                  {/* Red fill (bottom → top) */}
                  <div
                    className="absolute left-1/2 bottom-0 w-1.5 -translate-x-1/2 rounded-full bg-gradient-to-t from-brand-primary to-red-400"
                    style={{ height: `${heroVolume}%` }}
                  />
                  {/* Thumb */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white ring-2 ring-brand-primary shadow-lg pointer-events-none"
                    style={{ bottom: `${heroVolume}%` }}
                  />
                </div>

                <Volume2 className="w-3.5 h-3.5 text-brand-primary" />
              </div>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCaptions();
            }}
            className={`pointer-events-auto p-2 md:p-3 bg-black/50 border rounded-xl md:rounded-2xl backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/cc ${
              ccEnabled
                ? "text-brand-primary border-brand-primary/20 hover:border-brand-primary/35 hover:bg-brand-primary/15"
                : "text-white border-white/10 hover:border-white/25 hover:bg-white/10"
            }`}
            title={ccEnabled ? "داخستنی ژێرنووس" : "کاراکردنی ژێرنووس"}
            id="hero-cc-btn"
          >
            {ccEnabled ? (
              <Captions className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/cc:scale-110" />
            ) : (
              <CaptionsOff className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 opacity-80 transition-transform group-hover/cc:scale-110" />
            )}
          </button>

          <button
            onClick={() =>
              window.open(
                config.youtubeChannelUrl ||
                  config.youtubeUrl ||
                  "https://www.youtube.com/@ChatCinama",
                "_blank",
              )
            }
            className="pointer-events-auto p-2 md:p-3 bg-black/50 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl md:rounded-2xl text-white hover:text-red-400 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/yt"
            title="کاناڵی یوتیوب"
            id="hero-yt-btn"
          >
            <Youtube className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/yt:scale-110" />
          </button>

          {typeof config.facebookUrl === "string" &&
            config.facebookUrl !== "#" &&
            config.facebookUrl.trim() !== "" && (
              <a
                href={config.facebookUrl}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto p-2 md:p-3 bg-black/50 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/30 rounded-xl md:rounded-2xl text-white hover:text-blue-400 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/fb"
                title="فەیسبووک"
                id="hero-fb-btn"
              >
                <Facebook className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/fb:scale-110" />
              </a>
            )}

          {typeof config.tiktokUrl === "string" &&
            config.tiktokUrl !== "#" &&
            config.tiktokUrl.trim() !== "" && (
              <a
                href={config.tiktokUrl}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto p-2 md:p-3 bg-black/50 hover:bg-cyan-400/20 border border-white/10 hover:border-cyan-400/30 rounded-xl md:rounded-2xl text-white hover:text-cyan-400 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/tk"
                title="تیک تۆک"
                id="hero-tiktok-btn"
              >
                <Video className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/tk:scale-110" />
              </a>
            )}

          {typeof config.instagramUrl === "string" &&
            config.instagramUrl !== "#" &&
            config.instagramUrl.trim() !== "" && (
              <a
                href={config.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto p-2 md:p-3 bg-black/50 hover:bg-pink-500/20 border border-white/10 hover:border-pink-500/30 rounded-xl md:rounded-2xl text-white hover:text-pink-400 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/ig"
                title="ئینستاگرام"
                id="hero-ig-btn"
              >
                <Instagram className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/ig:scale-110" />
              </a>
            )}

          <button
            onClick={async () => {
              if (navigator.share) {
                try {
                  await navigator.share({
                    title: "CinemaChat - سینەما چات",
                    text: "سەیری فیلم و دراماکان بکە لەگەڵ چاتی ڕاستەوخۆ لە سینەما چات!",
                    url: window.location.href,
                  });
                } catch (err) {
                  console.log("Share failed or canceled", err);
                }
              } else {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  alert("✓ بەستەری ماڵپەڕ لەبەردەستتە (کۆپی کرا)!");
                } catch (err) {
                  console.log("Clipboard failed", err);
                }
              }
            }}
            className="pointer-events-auto p-2 md:p-3 bg-black/50 hover:bg-teal-500/20 border border-white/10 hover:border-teal-500/30 rounded-xl md:rounded-2xl text-white hover:text-teal-400 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/share"
            title="هاوبەشکردن"
            id="hero-share-btn"
          >
            <Share2 className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/share:scale-110" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            className={`pointer-events-auto p-2 md:p-3 bg-black/50 border rounded-xl md:rounded-2xl backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/play ${
              isPlaying
                ? "text-white border-white/10 hover:border-white/25 hover:bg-white/10"
                : "text-brand-primary border-brand-primary/20 hover:border-brand-primary/35 hover:bg-brand-primary/15"
            }`}
            title={isPlaying ? "وەستاندنی ڤیدیۆ (Pause)" : "لێدانی ڤیدیۆ (Play)"}
            id="hero-play-btn"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 fill-current transition-transform group-hover/play:scale-110" />
            ) : (
              <Play className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 fill-current transition-transform group-hover/play:scale-110" />
            )}
          </button>
        </div>

        {/* ── MANDATORY INTERACTION LAYER ──────────────────────────── */}
        {/* Shown whenever audio isn't flowing OR playback is blocked   */}
        {/* (all devices incl. mobile). ONE clear Play/Unmute affordance*/}
        {/* for the SAME video — a trusted click unlocks sound/play for */}
        {/* the whole session; later playlist videos force-unmute.      */}
        <AnimatePresence>
          {(isMuted || awaitingPlayGesture) && (
            <motion.button
              key="hero-unmute-overlay"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => {
                e.stopPropagation();
                userUnmute();
              }}
              type="button"
              id="hero-unmute-overlay"
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 pointer-events-auto cursor-pointer bg-black/30"
              title="کلیک بکە بۆ دەنگ"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.5,
                  ease: "easeInOut",
                }}
                className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-white text-black flex items-center justify-center shadow-2xl shadow-black/50 active:scale-90 transition-transform duration-150"
              >
                <Volume2 className="w-12 h-12 md:w-14 md:h-14" />
              </motion.div>
              <span className="kurdish-text text-white text-lg md:text-xl font-bold drop-shadow-lg">
                کلیک بکە بۆ دەنگ
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── SMALL TRANSITION LOADER ──────────────────────────────── */}
        {/* Only while the EXACT next video is genuinely buffering after */}
        {/* a transition. Bounded by the safety timer — never endless.   */}
        {nextBuffering && !introVisible && (
          <div className="absolute inset-0 z-[150] flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-brand-primary animate-spin shadow-lg" />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-48 flex flex-col justify-end pb-12 px-8 z-30">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-start gap-1"
          >
            <div className="flex flex-col items-start bg-black/20 backdrop-blur-sm p-4 rounded-3xl border border-white/5">
              <span className="text-xl md:text-2xl font-black text-white kurdish-text tracking-[0.1em] drop-shadow-2xl">
                شۆی سینەما چات
              </span>
              <span className="text-[10px] md:text-xs font-black text-brand-primary uppercase tracking-[0.6em] font-mono">
                CINEMACHAT SHOW
              </span>
            </div>

            <div className="w-12 h-1 bg-brand-primary mt-4 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          </motion.div>
        </div>
      </div>

      {/* ── WELCOME INTRO OVERLAY (latched, ~3s) ────────────────────────── */}
      {/* Shows ONCE per homepage mount for ~3 seconds while Video 1        */}
      {/* prepares BEHIND it; at ~3s exactly it fades. It NEVER reappears    */}
      {/* between playlist transitions (introDone latches true).            */}
      <AnimatePresence>
        {introVisible && (
          <motion.div
            key="welcome-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-black"
          >
            {/* Animated logo pulse */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="flex flex-col items-center gap-6"
            >
              {/* Cinema reel icon */}
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                  className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-brand-primary/30 border-t-brand-primary"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-brand-primary rounded-full flex items-center justify-center">
                    <Play className="w-4 h-4 md:w-5 md:h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Welcome text */}
              <div className="text-center space-y-2">
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="text-2xl md:text-4xl font-black text-white tracking-tight"
                >
                  Welcome to CinemaChat
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="text-lg md:text-2xl font-bold text-brand-primary kurdish-text"
                >
                  بەخێربێن بۆ سینەما چات
                </motion.p>
              </div>

              {/* Loading bar */}
              <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden mt-2">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3, ease: "easeInOut" }}
                  className="h-full bg-brand-primary rounded-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default HeroVideoPlayer;
