import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Volume2,
  VolumeX,
  Captions,
  CaptionsOff,
  Ticket,
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
 * HeroVideoPlayer — self-contained hero/trailer player with playlist support.
 *
 * Extracted from App.tsx to isolate hero video playback from the catalog
 * movie list. Supports a sequential playback queue: when multiple URLs are
 * provided via `heroPlaylist`, videos play in order and loop back to the
 * first when the last finishes. The hero videos remain strictly independent
 * from catalog/room videos.
 *
 * WELCOME SEQUENCE: On mount the component displays a branded loading overlay
 * for exactly 3 seconds.  During this window NO YouTube iframe is created and
 * no video ID is passed to the player API — this prevents browser auto-play
 * blocks and guarantees the admin-saved playlist is the only source of truth.
 */
const HeroVideoPlayer: React.FC<{
  activeFeaturedMovie: any;
  countdown: number;
  setCountdown: React.Dispatch<React.SetStateAction<number>>;
  isHeroMuted: boolean;
  setIsHeroMuted: React.Dispatch<React.SetStateAction<boolean>>;
  hasInteracted: boolean;
  heroPlaylist?: string[];
  config: any;
  setShowVipModal: React.Dispatch<React.SetStateAction<boolean>>;
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
  config,
  setShowVipModal,
  activeAudioSource = "hero",
  isMoviePlayerOpen = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const isMuted = isHeroMuted;
  const setIsMuted = setIsHeroMuted;

  // ─── WELCOME SEQUENCE ────────────────────────────────────────────────
  // The welcome overlay displays for 3 seconds on top of the player.
  // The YouTube iframe loads and buffers BEHIND the overlay so video
  // plays instantly when the overlay fades — zero perceived loading.
  const [welcomeComplete, setWelcomeComplete] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWelcomeComplete(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // ─── PLAYLIST QUEUE ────────────────────────────────────────────────────
  // Resolve the playlist of YouTube video IDs from the URLs array.
  // Only valid 11-character IDs are kept; raw URLs or unparseable entries
  // are dropped so the YT Player API never receives a full URL string.
  // Returns [] when no valid data exists — never falls back to a hardcoded URL.
  // NOTE: IDs resolve IMMEDIATELY (no welcomeComplete gate) so the YT
  // iframe can preload behind the welcome overlay.
  const playlistIds = useMemo(() => {
    const urls = heroPlaylist?.filter((u) => u && u.trim() !== "") || [];
    if (urls.length === 0) return [];

    const extracted = urls
      .map((u) => getYTId(u) || (isYTVideoId(u) ? u : null))
      .filter((id): id is string => id !== null && id.trim() !== "");

    return extracted;
  }, [heroPlaylist]);

  const playlistIndexRef = useRef(0);
  // Reset index when the playlist changes (admin saved a new config)
  const prevPlaylistKeyRef = useRef("");
  const currentPlaylistKey = playlistIds.join("|");
  if (currentPlaylistKey !== prevPlaylistKeyRef.current) {
    prevPlaylistKeyRef.current = currentPlaylistKey;
    playlistIndexRef.current = 0;
  }

  const videoId = playlistIds[playlistIndexRef.current] || playlistIds[0] || "";

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const isPlayingRef = useRef(true);
  isPlayingRef.current = isPlaying;
  const deliberatePauseRef = useRef(false);
  const isMutedRef = useRef(isHeroMuted);
  isMutedRef.current = isHeroMuted;
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
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

  const takeAudioControl = () => {
    userAudioControlRef.current = true;
    if (unmuteRetryTimerRef.current) {
      clearTimeout(unmuteRetryTimerRef.current);
      unmuteRetryTimerRef.current = null;
    }
  };

  const toggleMute = () => {
    const player = playerRef.current;
    const next = !isMuted;
    takeAudioControl();
    if (player) {
      if (next) {
        safePlayerCall(player, "mute");
      } else {
        safePlayerCall(player, "unMute");
        safePlayerCall(player, "setVolume", 100);
      }
    }
    setIsMuted(next);
  };

  const forcePlay = (target: any, attempts = 6) => {
    if (!target) return;
    safePlayerCall(target, "playVideo");
    const playerState = safePlayerCall(target, "getPlayerState");
    const PLAYING = (window as any).YT?.PlayerState?.PLAYING ?? 1;
    if (playerState !== PLAYING && attempts > 0) {
      setTimeout(() => forcePlay(target, attempts - 1), 200);
    }
  };

  const userUnmute = () => {
    const player = playerRef.current;
    if (!player) return;
    takeAudioControl();
    safePlayerCall(player, "unMute");
    safePlayerCall(player, "setVolume", 100);
    safePlayerCall(player, "playVideo");
    setIsMuted(false);
    forcePlay(player, 4);
  };

  const forceUnmuteAutoplay = (target: any, attempts = 20) => {
    if (!target) return;
    safePlayerCall(target, "playVideo");
    safePlayerCall(target, "unMute");
    safePlayerCall(target, "setVolume", 100);
    const stillMuted = safePlayerCall(target, "isMuted") ?? false;
    const playerState = safePlayerCall(target, "getPlayerState");
    const PLAYING = (window as any).YT?.PlayerState?.PLAYING ?? 1;

    if (!stillMuted && playerState === PLAYING) {
      setIsHeroMuted(false);
      return;
    }

    if (attempts <= 0) {
      setIsHeroMuted(!!stillMuted);
      return;
    }

    if (stillMuted && isMobile) {
      setIsHeroMuted(true);
      return;
    }

    setIsHeroMuted(!!stillMuted);
    unmuteRetryTimerRef.current = setTimeout(() => {
      if (userAudioControlRef.current) return;
      forceUnmuteAutoplay(target, attempts - 1);
    }, 200);
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

  // Advance to the next video in the queue (loops back to 0 after the last)
  const advanceToNextVideo = () => {
    if (playlistIds.length <= 1) return; // nothing to advance
    const nextIndex = (playlistIndexRef.current + 1) % playlistIds.length;
    playlistIndexRef.current = nextIndex;
    const nextId = playlistIds[nextIndex];
    if (nextId && isYTVideoId(nextId) && playerRef.current) {
      setHasStartedPlaying(false);
      safePlayerCall(playerRef.current, "loadVideoById", nextId);
      safePlayerCall(playerRef.current, "setPlaybackQuality", "hd1080");
      enableCaptions(playerRef.current);
      setIsPlaying(true);
    }
  };
  // Use a ref so the onStateChange callback always calls the latest version,
  // avoiding stale closures when the playlist changes without re-mounting.
  const advanceToNextVideoRef = useRef(advanceToNextVideo);
  advanceToNextVideoRef.current = advanceToNextVideo;

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
      }
    };
  }, []);

  // Mount / hot-swap the player — starts immediately when a valid video ID
  // is available.  The welcome overlay sits on top (z-[200]) so the user
  // sees the branded screen while the iframe preloads and buffers.
  useEffect(() => {
    const id = "hero-yt-player";
    const container = document.getElementById(id);
    if (!container || !videoId || !isYTVideoId(videoId)) return;
    let cancelled = false;
    setHasStartedPlaying(false);

    const initPlayer = () => {
      if (cancelled) return;
      if (!(window as any).YT?.Player) return;

      if (playerRef.current) {
        try {
          safePlayerCall(playerRef.current, "loadVideoById", videoId);
          if (isMobile) {
            if (!userAudioControlRef.current) {
              setIsHeroMuted(true);
              forcePlay(playerRef.current, 20);
            } else {
              forcePlay(playerRef.current, 4);
            }
          } else {
            forceUnmuteAutoplay(playerRef.current);
          }
          safePlayerCall(playerRef.current, "setPlaybackQuality", "hd1080");
          enableCaptions(playerRef.current);
          setIsPlaying(true);
          return;
        } catch (_) {
          try { playerRef.current.destroy(); } catch (_) {}
          playerRef.current = null;
        }
      }

      playerRef.current = new (window as any).YT.Player(id, {
        videoId: videoId,
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          mute: isMobile ? 1 : 0,
          // NOTE: loop/playlist are intentionally NOT set here.
          // Sequential playback and looping are managed by advanceToNextVideo()
          // via the ENDED event, so each video plays exactly once before the
          // queue advances. This avoids the YT API's single-video loop which
          // would prevent queue progression.
          controls: 0,
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
          onReady: (event: any) => {
            if (isMobile) {
              setIsHeroMuted(true);
              forcePlay(event.target, 30);
            } else {
              forceUnmuteAutoplay(event.target);
            }
            safePlayerCall(event.target, "setPlaybackQuality", "hd1080");
            enableCaptions(event.target);
            setIsPlaying(true);
          },
          onStateChange: (event: any) => {
            const ytState = (window as any).YT.PlayerState;
            const playing = event.data === ytState.PLAYING;
            setIsPlaying(playing);
            if (playing) {
              deliberatePauseRef.current = false;
              setHasStartedPlaying(true);
            } else if (event.data === ytState.ENDED) {
              // Video finished — advance to next in queue (loops to 0 at end)
              advanceToNextVideoRef.current();
            } else if (event.data === ytState.PAUSED && !deliberatePauseRef.current) {
              setTimeout(
                () => safePlayerCall(playerRef.current, "playVideo"),
                50,
              );
            }
          },
        },
      });
    };

    apiReady.current.then(initPlayer);

    return () => {
      cancelled = true;
    };
  }, [videoId]);

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
    const onFirstInteraction = () => {
      const player = playerRef.current;
      if (player && isMutedRef.current) {
        takeAudioControl();
        safePlayerCall(player, "unMute");
        safePlayerCall(player, "setVolume", 100);
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

  useEffect(() => {
    if (playerRef.current) {
      isPlaying
        ? safePlayerCall(playerRef.current, "playVideo")
        : safePlayerCall(playerRef.current, "pauseVideo");
    }
  }, [isPlaying]);

  useEffect(() => {
    if (activeAudioSource === "room") {
      userAudioControlRef.current = true;
      if (unmuteRetryTimerRef.current) {
        clearTimeout(unmuteRetryTimerRef.current);
        unmuteRetryTimerRef.current = null;
      }
      setIsMuted(true);
      setIsHeroMuted(true);
    }
  }, [activeAudioSource, setIsHeroMuted]);

  const trailerSuppressedRef = useRef(false);
  const restoreTrailerRef = useRef({ play: false, unmute: false });
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
      setIsHeroMuted(!restore.unmute);
    }
  }, [isMoviePlayerOpen, setIsHeroMuted]);

  // ── Whether to show the YouTube player layer ──────────────────────────
  // Always show when a valid ID exists — the welcome overlay (z-[200])
  // covers it until the 3s timer completes.
  const showPlayerLayer = !!videoId && isYTVideoId(videoId);

  return (
    <section
      className="relative w-full h-[60vh] md:h-[85vh] bg-black overflow-hidden select-none"
      style={{ display: "block", opacity: 1 }}
    >
      <div
        className="w-full h-full overflow-hidden pointer-events-none"
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      >
        {showPlayerLayer && (
          <div
            className="w-full h-full scale-[1.35] bg-cover bg-center"
            id="hero-player"
            ref={containerRef}
            style={!hasStartedPlaying && videoId ? { backgroundImage: `url(https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)` } : undefined}
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
                  safePlayerCall(player, "unMute");
                  safePlayerCall(player, "setVolume", 100);
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

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className={`pointer-events-auto p-2 md:p-3 bg-black/50 border rounded-xl md:rounded-2xl backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/audio ${
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
            onClick={() => setShowVipModal(true)}
            className="pointer-events-auto p-2 md:p-3 bg-black/50 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/30 rounded-xl md:rounded-2xl text-white hover:text-amber-400 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/vip"
            title="هۆڵی VIP Room"
            id="hero-vip-btn"
          >
            <Ticket className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/vip:rotate-12" />
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

        <AnimatePresence>
          {isMuted && !isMobile && (
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
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 pointer-events-auto cursor-pointer bg-black/30"
              title="کاراکردنی دەنگ"
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
                <VolumeX className="w-12 h-12 md:w-14 md:h-14" />
              </motion.div>
              <span className="kurdish-text text-white text-lg md:text-xl font-bold drop-shadow-lg">
                کاراکردنی دەنگ
              </span>
            </motion.button>
          )}
        </AnimatePresence>

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

      {/* ── WELCOME LOADING OVERLAY ──────────────────────────────────────── */}
      {/* Displayed for exactly 3 seconds on every page load/refresh.  The       */}
      {/* YouTube iframe is already loaded and buffering BEHIND this overlay.    */}
      {/* When the timer completes the overlay fades out and video plays         */}
      {/* instantly — zero perceived loading time.                               */}
      <AnimatePresence>
        {!welcomeComplete && (
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
