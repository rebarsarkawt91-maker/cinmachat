import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Users,
  Play,
  Pause,
  MessageCircle,
  Send,
  Tv,
  ShieldAlert,
  QrCode,
  Search,
  CheckCircle2,
  AlertCircle,
  LogIn,
  Copy,
  Sparkles,
  RotateCcw,
  SkipBack,
  SkipForward,
  Film,
  UserCheck,
  Plus,
  Loader2,
  Mic,
  Square,
  Maximize2,
  Minimize2,
  Share2,
  Phone,
  Trash2,
  ChevronDown,
  UserPlus,
  UserCircle2,
  AtSign,
  Camera,
  ImageUp,
  ScanLine,
  BadgeCheck,
  Captions,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import jsQR from "jsqr";
import { Movie, SocialUser } from "../../types";
import YouTubeResilientPlayer from "../Player/YouTubeResilientPlayer";
import ImmersiveShieldedPlayer from "../Player/ImmersiveShieldedPlayer";
import VideoLoadOverlay from "../Player/VideoLoadOverlay";
import {
  hasPlayableBuffer,
  type NativeVideoLoadState,
} from "../../utils/videoBuffering";
import { ProfileCard } from "./ProfileCard";
import {
  CINEMA_CHAT_ROOM_ID,
  CINEMA_CHAT_ROOM_NAME,
  SESSION_STATES,
  SessionState,
  CinemaChatParticipant,
  CinemaChatRoomState,
  CinemaChatMessage,
  defaultCinemaChatPlayback,
  normalizeCinemaChatState,
  subscribeCinemaChatState,
  patchCinemaChatState,
  touchCinemaChatPresence,
  acceptCinemaChatPairingRequest,
  declineCinemaChatPairingRequest,
  subscribeCinemaChatMessages,
  sendCinemaChatMessage,
  computeLocalTime,
  resolveMovieSourceUrl,
  toCinemaChatMovieData,
  buildPhoneInviteText,
  PHONE_INVITE_NOT_CONFIGURED,
  resolveInviteTarget,
  sendCinemaChatInvitation,
  subscribeInviteTargetPresence,
  formatInvitePhoneInput,
  maskInvitePhone,
  normalizeInvitePhoneInput,
  validateInvitePhoneInput,
  PRESENCE_STALE_MS,
  PRESENCE_HEARTBEAT_MS,
} from "../../services/cinemaChat";
import {
  createFriendConnection,
  searchAccountByCCIdOrContact,
} from "../../services/friendConnect";

// ─────────────────────────────────────────────────────────────────────────────
// CinemaChatRoom — the permanent two-person synchronized watch room
// (main_broadcast_room). Clicking the "CinemaChat" card in the Drama Rooms
// section opens this full-screen modal.
//
// Session flow (all states persisted in Firestore so the room survives refresh):
//   EMPTY → (host starts) → WAITING_FOR_PARTNER → (guest joins) → PAIRING
//        → (host approves) → WAITING_FOR_APPROVAL → (movie proposed + both
//        approve) → READY → (start) → PLAYING ↔ PAUSED
//   DISCONNECTED  when the partner's presence heartbeat goes stale (35s)
//   ENDED         when either participant ends the session
//
// Playback model: the Firestore doc is the source of truth
// { movieId, isPlaying, currentTime, updatedAt, updatedBy }. The selected movie
// itself lives ONLY in movieProposal.movieData (playback must not duplicate it —
// duplicating the large movie payload exhausts the rules evaluation budget).
// Every client renders currentTime + (now − updatedAt) while playing (drift
// clock — same model as SyncRoom). Only explicit user actions write playback;
// the last actor ("owner") sends a gentle heartbeat every 8s so both clients
// stay aligned without a write loop (writes never happen in response to
// snapshots).
// ─────────────────────────────────────────────────────────────────────────────

interface CinemaChatRoomProps {
  open: boolean;
  onClose: () => void;
  /** Existing auth identity: fbUid (social login) or persistent device id. */
  identity: CinemaChatParticipant;
  /** Full movie catalog for the in-room movie picker. */
  movies: Movie[];
  /** Whether the current identity has a CinemaChat account (social sign-in).
   *  Account users can invite others by account code/phone and receive real
   *  persisted invitations; device-only guests can still join via code/QR. */
  hasAccount?: boolean;
  /** True while auth/profile state is still resolving; prevents account CTAs
   *  from flashing for users who already have a valid profile. */
  accountLoading?: boolean;
  /** Display name of the connected account (defaults to identity.name). */
  accountName?: string;
  /** Unique member code (CC-ID) of the connected account, if any. */
  accountCode?: string;
  /** Opens the app's account create/connect modal from inside the room. */
  onRequestAccount?: () => void;
  /** AI subtitle cues for overlay rendering. */
  subtitleCues?: Array<{ start: number; end: number; text: string }>;
  /** Original/source subtitle cues for optional dual-line display. */
  originalSubtitleCues?: Array<{ start: number; end: number; text: string }>;
  /** Current subtitle language code. */
  subtitleLang?: string;
  /** Subtitle generation status. */
  subtitleStatus?: "idle" | "loading" | "ready" | "error";
  /** Status/error message for subtitle generation. */
  subtitleMessage?: string;
  /** Available subtitle languages for the language picker. */
  subtitleLanguages?: Array<{ code: string; label: string; shortLabel: string }>;
  /** Called when user picks a different subtitle language. */
  onSubtitleLangChange?: (langCode: string) => void;
  /** Called when user clicks the retry button after a subtitle error. */
  onSubtitleRetry?: () => void;
  /** Reports the current video source URL back to the parent for subtitle generation. */
  onSourceUrl?: (url: string) => void;
  /** CC display settings from parent. */
  ccSettings?: { fontSize: string; bgOpacity: number; textColor: string; showSubtitle: boolean; showOriginal: boolean };
  /** Font size entry for current CC setting. */
  ccFontSizeEntry?: { key: string; label: string; cls: string; mobileCls: string };
  /** Computed subtitle style from parent. */
  ccSubtitleStyle?: React.CSSProperties;
  /** Toggle CC settings panel. */
  onToggleCcPanel?: () => void;
  /** Whether CC settings panel is open. */
  showCcPanel?: boolean;
  /** Callback to update CC settings from the panel. */
  onUpdateCcSettings?: (updater: (prev: { fontSize: 'sm' | 'md' | 'lg' | 'xl'; bgOpacity: number; textColor: string; showSubtitle: boolean; showOriginal: boolean }) => { fontSize: 'sm' | 'md' | 'lg' | 'xl'; bgOpacity: number; textColor: string; showSubtitle: boolean; showOriginal: boolean }) => void;
}
const PLAYBACK_HEARTBEAT_MS = 8000;
const MAX_VOICE_SECONDS = 12;

type SourceKind = "none" | "youtube" | "embed" | "direct";

// Classify a resolved source URL into the player that can handle it (mirrors the
// app's existing player stack: YouTubeResilientPlayer / ImmersiveShieldedPlayer /
// native <video>).
const classifySource = (url: string | null): SourceKind => {
  if (!url) return "none";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/\.(mp4|m3u8|webm|ogv|ogg|mov)(\?|#|$)/i.test(url)) return "direct";
  if (/firebasestorage\.googleapis\.com/i.test(url)) return "direct";
  return "embed";
};

// Member codes are stored in Firestore as "CC-CC-9803" (two CC- groups, see
// RegistrationModal / SocialAuthContext), but the printed member card and its
// QR encode the same code with one extra "CC-" prefix ("CC-CC-CC-9803", see
// ProfileCard). Normalize by stripping every leading "CC-" group so both forms
// are treated as identical when joining the room.
const normalizeJoinCode = (raw: string): string => {
  let s = (raw || "").trim().toUpperCase();
  while (s.startsWith("CC-")) s = s.slice(3);
  return s;
};

const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}:` : ""}${h > 0 ? String(m).padStart(2, "0") : String(m)}:${String(sec).padStart(2, "0")}`;
};

const STATE_LABELS: Record<string, string> = {
  EMPTY: "بەتاڵ",
  WAITING_FOR_PARTNER: "چاوەڕوانی هاوڕێ",
  PAIRING: "پەیوەندی لەسەرەتاوە",
  WAITING_FOR_APPROVAL: "چاوەڕوانی پەسەندکردنی فیلم",
  READY: "ئامادەیە",
  PLAYING: "لەسەر پەخشە",
  PAUSED: "ڕاوەستاوە",
  DISCONNECTED: "پەیوەندی ناڕێکە",
  ENDED: "کۆتایی هات",
};

// Tiny unobtrusive unread badge for the collapsed-chat buttons. Shows the total
// unread count; a small mic icon marks that unread voice messages are waiting.
const ChatUnreadBadge = ({ text, voice }: { text: number; voice: number }) => {
  const total = text + voice;
  if (total <= 0) return null;
  return (
    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-primary text-white text-[9px] font-black flex items-center justify-center gap-0.5 shadow-lg shadow-red-600/30">
      {voice > 0 && <Mic className="w-2.5 h-2.5" />}
      {total}
    </span>
  );
};

const WizardProgress = ({
  activeStep,
  onNext,
}: {
  activeStep: number;
  onNext?: () => void;
}) => {
  const steps = [
    { n: 1, label: "Friend" },
    { n: 2, label: "Connect" },
    { n: 3, label: "Ready" },
    { n: 4, label: "Movie" },
  ];
  return (
    <div className="px-5 py-3 bg-black/30 border-b border-white/10">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="grid grid-cols-4 gap-2 flex-1">
          {steps.map((step) => {
            const active = step.n === activeStep;
            const done = step.n < activeStep;
            return (
              <div
                key={step.n}
                className={`h-10 rounded-xl border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  active
                    ? "bg-brand-primary text-white border-brand-primary"
                    : done
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                      : "bg-white/5 text-gray-500 border-white/10"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-black/25 flex items-center justify-center">
                  {done ? <CheckCircle2 className="w-3 h-3" /> : step.n}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            );
          })}
        </div>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="h-10 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/15"
          >
            دواتر
            <SkipForward className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export const CinemaChatRoom: React.FC<CinemaChatRoomProps> = ({
  open,
  onClose,
  identity,
  movies,
  hasAccount = false,
  accountLoading = false,
  accountName,
  accountCode,
  onRequestAccount,
  subtitleCues,
  originalSubtitleCues,
  subtitleLang = "ckb",
  subtitleStatus = "idle",
  subtitleMessage,
  subtitleLanguages,
  onSubtitleLangChange,
  onSubtitleRetry,
  onSourceUrl,
  ccSettings,
  ccFontSizeEntry,
  ccSubtitleStyle,
  onToggleCcPanel,
  showCcPanel,
  onUpdateCcSettings,
}) => {
  const myId = identity.id;

  const [state, setState] = useState<CinemaChatRoomState>(() =>
    normalizeCinemaChatState(null),
  );
  const [messages, setMessages] = useState<CinemaChatMessage[]>([]);
  const [displayTime, setDisplayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const [newMsg, setNewMsg] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [showMoviePicker, setShowMoviePicker] = useState(false);
  const [showCcMenu, setShowCcMenu] = useState(false);
  const [movieSearch, setMovieSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playerKind, setPlayerKind] = useState<SourceKind>("none");
  const [directVideoStatus, setDirectVideoStatus] =
    useState<NativeVideoLoadState>("idle");
  const [directVideoRetryKey, setDirectVideoRetryKey] = useState(0);

  // Fullscreen + floating chat overlay over the video.
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The fullscreen floating chat overlay starts HIDDEN so the movie keeps
  // maximum focus; the user brings it back with the floating chat button.
  const [showFullscreenChat, setShowFullscreenChat] = useState(false);
  // Unread counters (text vs voice) shown on the collapsed-chat buttons while
  // no chat panel is on screen. Reset when any chat panel becomes visible.
  const [unreadText, setUnreadText] = useState(0);
  const [unreadVoice, setUnreadVoice] = useState(0);

  // Voice message recording.
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recError, setRecError] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const playerWrapRef = useRef<HTMLDivElement>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);
  const lastAppliedRef = useRef("");
  const appliedMovieRef = useRef("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<number | null>(null);
  const recElapsedRef = useRef(0);
  const directVideoSlowTimerRef = useRef<number | null>(null);
  // Guards: one-shot movie-focus auto-collapse + unread message key tracking.
  const movieFocusedRef = useRef(false);
  const knownMsgKeysRef = useRef<Set<string> | null>(null);

  stateRef.current = state;

  // ----- subscriptions -------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const unsubState = subscribeCinemaChatState(setState);
    const unsubMessages = subscribeCinemaChatMessages(setMessages);
    return () => {
      unsubState();
      unsubMessages();
    };
  }, [open]);

  // ----- derived session facts ------------------------------------------------
  const meIsHost = !!state.host && state.host.id === myId;
  const meIsGuest = !!state.guest && state.guest.id === myId;
  const isParticipant = meIsHost || meIsGuest;
  const isActiveSession =
    !!state.sessionId &&
    state.sessionState !== SESSION_STATES.EMPTY &&
    state.sessionState !== SESSION_STATES.ENDED;

  const other = meIsHost ? state.guest : meIsGuest ? state.host : null;
  const otherSeen = meIsHost
    ? state.guestLastSeen
    : meIsGuest
      ? state.hostLastSeen
      : null;
  const otherStale =
    isParticipant && !!other && (otherSeen === null || Date.now() - otherSeen > PRESENCE_STALE_MS);

  // The selected movie lives ONLY in movieProposal.movieData. Playback never
  // duplicates it (Firestore rules exhaust their 1000-expression budget when
  // the large movie payload — incl. the base64 poster — appears in BOTH
  // movieProposal.movieData and playback.movieData, silently rejecting the
  // write as permission-denied). The player resolves everything from here.
  const movieData = state.movieProposal?.movieData || null;
  const sourceUrl = useMemo(() => resolveMovieSourceUrl(movieData), [movieData]);
  const sourceKind = classifySource(sourceUrl);
  const playerKey = `${movieData?.id || "none"}:${sourceUrl || ""}`;

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

  useEffect(() => {
    if (sourceKind !== "direct" || !sourceUrl) {
      setDirectVideoStatus("idle");
      clearDirectVideoSlowTimer();
      return;
    }
    setDirectVideoStatus("loading");
    armDirectVideoSlowTimer();
    return clearDirectVideoSlowTimer;
  }, [
    sourceKind,
    sourceUrl,
    playerKey,
    directVideoRetryKey,
    armDirectVideoSlowTimer,
    clearDirectVideoSlowTimer,
  ]);

  const clearDirectVideoIfBuffered = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      if (hasPlayableBuffer(event.currentTarget)) {
        clearDirectVideoSlowTimer();
        setDirectVideoStatus("ready");
      }
    },
    [clearDirectVideoSlowTimer],
  );

  // Report the current video source URL to the parent so the subtitle pipeline
  // can fetch/translate/generate subtitles for this room.
  useEffect(() => {
    if (sourceUrl) onSourceUrl?.(sourceUrl);
  }, [sourceUrl, onSourceUrl]);

  const safeLink = useMemo(
    () =>
      `cinemachat://cinema-room?room=${CINEMA_CHAT_ROOM_ID}&code=${encodeURIComponent(
        state.joinCode || "",
      )}`,
    [state.joinCode],
  );

  // "Movie focus mode": the player area has taken over with a real movie on
  // screen. Entering it auto-collapses the desktop chat sidebar once (see the
  // effect below) so the movie gets maximum clean screen space.
  const movieFocused =
    isParticipant &&
    !!sourceUrl &&
    state.sessionState !== SESSION_STATES.EMPTY &&
    state.sessionState !== SESSION_STATES.WAITING_FOR_PARTNER &&
    state.sessionState !== SESSION_STATES.PAIRING;
  // True whenever any chat panel (desktop sidebar or fullscreen overlay) is on
  // screen — unread counters reset when it becomes visible.
  const chatVisible = showChat || showFullscreenChat;

  // ----- fullscreen sync ------------------------------------------------------
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Entering fullscreen keeps the movie clean: the floating chat overlay
      // stays HIDDEN until the user taps the chat button on the player.
      setShowFullscreenChat(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ----- movie-focus auto-collapse --------------------------------------------
  // The FIRST time the movie player takes over (large/focused movie mode) the
  // desktop chat sidebar collapses once so the movie gets maximum focus. It is
  // deliberately one-shot per mount: afterwards the sidebar is fully controlled
  // by the user via the chat buttons — never force-closed again. This only
  // touches local UI state; it never reads or writes playback state.
  useEffect(() => {
    if (movieFocused && !movieFocusedRef.current) {
      movieFocusedRef.current = true;
      setShowChat(false);
    }
  }, [movieFocused]);

  // ----- unread tracking ------------------------------------------------------
  // Reuses the existing single messages listener (no second listener): while no
  // chat panel is on screen every new partner message increments its counter;
  // opening any chat panel marks everything read. First snapshot seeds the key
  // set so existing room history is never counted as unread.
  useEffect(() => {
    const known = knownMsgKeysRef.current;
    if (!known) {
      knownMsgKeysRef.current = new Set(messages.map((m) => m.id ?? ""));
      return;
    }
    if (chatVisible) {
      for (const m of messages) if (m.id) known.add(m.id);
      setUnreadText(0);
      setUnreadVoice(0);
      return;
    }
    let text = 0;
    let voice = 0;
    for (const m of messages) {
      if (!m.id || m.senderId === myId || known.has(m.id)) continue;
      known.add(m.id);
      if (m.kind === "voice" && m.voiceDataUrl) voice += 1;
      else text += 1;
    }
    if (text > 0) setUnreadText((v) => v + text);
    if (voice > 0) setUnreadVoice((v) => v + voice);
  }, [messages, chatVisible, myId]);

  // ----- presence heartbeat (both participants) --------------------------------
  useEffect(() => {
    if (!open || !isParticipant || !isActiveSession) return;
    touchCinemaChatPresence(meIsHost ? "hostLastSeen" : "guestLastSeen", myId).catch(
      () => {},
    );
    const iv = window.setInterval(() => {
      touchCinemaChatPresence(meIsHost ? "hostLastSeen" : "guestLastSeen", myId).catch(
        () => {},
      );
    }, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(iv);
  }, [open, isParticipant, isActiveSession, meIsHost, myId]);

  // ----- DISCONNECTED detection + host auto-resume -----------------------------
  useEffect(() => {
    if (!open || !isParticipant || !isActiveSession) return;
    // The remaining participant marks the session DISCONNECTED when the
    // partner's heartbeat goes stale (persisted once, idempotent).
    if (otherStale && state.sessionState !== SESSION_STATES.DISCONNECTED) {
      patchCinemaChatState({ sessionState: SESSION_STATES.DISCONNECTED }, myId).catch(
        () => {},
      );
    }
    // The host automatically resumes a DISCONNECTED session once the partner's
    // presence is fresh again (guest reconnect is then seamless).
    if (
      meIsHost &&
      state.sessionState === SESSION_STATES.DISCONNECTED &&
      other &&
      !otherStale
    ) {
      const next = state.playback?.isPlaying
        ? SESSION_STATES.PLAYING
        : movieData
          ? SESSION_STATES.PAUSED
          : SESSION_STATES.WAITING_FOR_APPROVAL;
      patchCinemaChatState({ sessionState: next }, myId).catch(() => {});
    }
  }, [
    open,
    isParticipant,
    isActiveSession,
    otherStale,
    meIsHost,
    other,
    state.sessionState,
    state.playback?.isPlaying,
    movieData,
    myId,
  ]);

  // ----- local ticker + duration poll ------------------------------------------
  useEffect(() => {
    const iv = window.setInterval(() => {
      const s = stateRef.current;
      setDisplayTime(computeLocalTime(s, Date.now()));
      const video = playerWrapRef.current?.querySelector("video");
      if (video && Number.isFinite(video.duration)) {
        setDuration((d) => (d !== video.duration ? video.duration : d));
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, []);

  // ----- apply shared playback to the local player (loop-avoidance: we only
  //       ever write on explicit user actions / heartbeat, never on snapshot) ---
  useEffect(() => {
    if (!open || !movieData) return;
    const sig = `${state.playback.movieId}:${state.playback.isPlaying}:${state.playback.updatedAt}:${state.playback.updatedBy}:${Math.round(state.playback.currentTime * 10)}`;
    if (sig === lastAppliedRef.current) return;
    lastAppliedRef.current = sig;

    // If the movie source just changed the player remounts (playerKey) — defer
    // the seek/play until after mount.
    if (appliedMovieRef.current !== playerKey) {
      appliedMovieRef.current = playerKey;
      window.setTimeout(() => applyPlaybackToPlayer(), 600);
      return;
    }
    applyPlaybackToPlayer();
  }, [open, state.playback, playerKey]);

  // Re-apply on player mount (e.g. resume/reconnect restores the position).
  useEffect(() => {
    if (!open || !movieData) return;
    const t = window.setTimeout(() => {
      if (appliedMovieRef.current === playerKey) applyPlaybackToPlayer();
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playerKey]);

  const applyPlaybackToPlayer = useCallback(() => {
    const s = stateRef.current;
    if (!s.movieProposal?.movieData) return;
    const t = computeLocalTime(s, Date.now());
    const frame = playerWrapRef.current?.querySelector("iframe");
    const video = playerWrapRef.current?.querySelector("video");

    if (s.playback.isPlaying) {
      frame?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "https://www.youtube.com",
      );
      frame?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*",
      );
      video?.play?.().catch(() => {});
    } else {
      frame?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
        "https://www.youtube.com",
      );
      frame?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
        "*",
      );
      video?.pause?.();
    }

    try {
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(Math.max(0, t), video.duration - 0.2);
      }
    } catch {
      /* not ready yet */
    }
    frame?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "seekTo", args: [t, true] }),
      "https://www.youtube.com",
    );
    frame?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "seekTo", args: [t, true] }),
      "*",
    );
  }, []);

  // ----- playback owner heartbeat (keeps both drift clocks aligned) ------------
  useEffect(() => {
    if (
      !open ||
      !state.playback?.isPlaying ||
      state.playback.updatedBy !== myId
    )
      return;
    const iv = window.setInterval(() => {
      const s = stateRef.current;
      if (!s.playback?.isPlaying || s.playback.updatedBy !== myId) return;
      const now = Date.now();
      patchCinemaChatState(
        {
          sessionState: SESSION_STATES.PLAYING,
          playback: {
            ...s.playback,
            currentTime: computeLocalTime(s, now),
            updatedAt: now,
            updatedBy: myId,
          },
        },
        myId,
      ).catch(() => {});
    }, PLAYBACK_HEARTBEAT_MS);
    return () => window.clearInterval(iv);
  }, [open, state.playback?.isPlaying, state.playback?.updatedBy, myId]);

  // ----- helpers ----------------------------------------------------------------

  const patchPlayback = useCallback(
    (patch: Partial<CinemaChatRoomState["playback"]>, nextState: SessionState) => {
      const s = stateRef.current;
      const now = Date.now();
      patchCinemaChatState(
        {
          sessionState: nextState,
          playback: {
            ...s.playback,
            ...patch,
            updatedAt: now,
            updatedBy: myId,
          },
        },
        myId,
      ).catch((err) => console.warn("cinemaChat playback write failed:", err));
    },
    [myId],
  );

  const startSession = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await patchCinemaChatState(
        {
          roomId: CINEMA_CHAT_ROOM_ID,
          name: CINEMA_CHAT_ROOM_NAME,
          isOfficial: true,
          sessionId: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          sessionState: SESSION_STATES.WAITING_FOR_PARTNER,
          host: identity,
          guest: null,
          joinCode: identity.code,
          hostApproved: false,
          guestApproved: false,
          movieProposal: {
            movieData: null,
            hostApproved: false,
            guestApproved: false,
            proposedBy: null,
          },
          playback: { ...defaultCinemaChatPlayback(), updatedBy: myId },
          hostLastSeen: Date.now(),
          guestLastSeen: null,
        },
        myId,
      );
    } catch (err) {
      console.warn("startSession failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const joinSession = async (codeOverride?: string) => {
    const code = (codeOverride ?? joinInput).trim().toUpperCase();
    const s = stateRef.current;
    if (!code) {
      setJoinError("کۆدێک بنووسە یان QR سکانی بکە");
      return;
    }
    if (isParticipant) return;
    if (!s.sessionId || !s.joinCode) {
      setJoinError("هیچ دانیشتنێکی چاوەڕێ نییە — تکایە یەکەم دەستپێبکە");
      return;
    }
    if (s.guest) {
      setJoinError("ژوورەکە پڕە — تەنها دوو کەس دەتوانن بینین");
      return;
    }
    if (normalizeJoinCode(code) !== normalizeJoinCode(String(s.joinCode))) {
      setJoinError("کۆدەکە دروست نییە");
      return;
    }
    setJoinBusy(true);
    setJoinError(null);
    try {
      await patchCinemaChatState(
        {
          guest: identity,
          guestApproved: true,
          sessionState: SESSION_STATES.PAIRING,
          guestLastSeen: Date.now(),
        },
        myId,
      );
      setJoinInput("");
    } catch (err) {
      console.warn("joinSession failed:", err);
      setJoinError("پەیوەندیکردن سەرکەوتوو نەبوو — تکایە دووبارە هەوڵبدەرەوە");
    } finally {
      setJoinBusy(false);
    }
  };

  const approveGuest = () => {
    // Accepting a pairing request is gated by the shared service helper: only
    // the host of the ACTIVE session may accept, the sender (guest) must
    // actually be seated, and the pairing must not already be approved — a
    // random user can never accept on someone else's behalf (Firestore rules
    // additionally require updatedBy to match a registered participant id).
    // Persisted through the existing approval flow.
    acceptCinemaChatPairingRequest(stateRef.current, myId).catch(() => {});
  };

  const declineGuest = () => {
    declineCinemaChatPairingRequest(stateRef.current, myId).catch(() => {});
  };

  const proposeMovie = (movie: Movie) => {
    const movieData = toCinemaChatMovieData(movie);
    if (!movieData) return;
    patchCinemaChatState(
      {
        sessionState: SESSION_STATES.WAITING_FOR_APPROVAL,
        movieProposal: {
          movieData,
          hostApproved: meIsHost,
          guestApproved: meIsGuest,
          proposedBy: myId,
        },
      },
      myId,
    ).catch(() => {});
    setShowMoviePicker(false);
    setMovieSearch("");
  };

  const approveMovie = () => {
    patchCinemaChatState(
      {
        movieProposal: {
          ...state.movieProposal,
          hostApproved: meIsHost ? true : state.movieProposal.hostApproved,
          guestApproved: meIsGuest ? true : state.movieProposal.guestApproved,
        },
      },
      myId,
    ).catch(() => {});
  };

  const declineMovie = () => {
    patchCinemaChatState(
      {
        movieProposal: {
          movieData: null,
          hostApproved: false,
          guestApproved: false,
          proposedBy: null,
        },
      },
      myId,
    ).catch(() => {});
  };

  // Once both participants approved the movie, the host locks it into playback.
  // Playback carries ONLY movieId — the movie payload (incl. its base64 poster)
  // stays solely in movieProposal.movieData: duplicating it into playback blows
  // the Firestore rules 1000-expression evaluation budget and the write is
  // silently rejected as permission-denied, which froze the room at
  // WAITING_FOR_APPROVAL. The player resolves the source from movieData.
  useEffect(() => {
    if (
      meIsHost &&
      state.sessionState === SESSION_STATES.WAITING_FOR_APPROVAL &&
      state.movieProposal?.movieData &&
      state.movieProposal.hostApproved &&
      state.movieProposal.guestApproved
    ) {
      patchCinemaChatState(
        {
          sessionState: SESSION_STATES.READY,
          playback: {
            movieData: null,
            movieId: state.movieProposal.movieData.id,
            isPlaying: false,
            currentTime: 0,
            updatedAt: Date.now(),
            updatedBy: myId,
          },
        },
        myId,
      ).catch(() => {});
    }
  }, [meIsHost, state.sessionState, state.movieProposal, myId]);

  const startPlayback = () => {
    if (state.sessionState !== SESSION_STATES.READY) return;
    const now = Date.now();
    patchCinemaChatState(
      {
        sessionState: SESSION_STATES.PLAYING,
        playback: {
          ...state.playback,
          isPlaying: true,
          currentTime: 0,
          updatedAt: now,
          updatedBy: myId,
        },
      },
      myId,
    ).catch(() => {});
  };

  const togglePlayPause = () => {
    if (!movieData) return;
    const now = Date.now();
    const target = !state.playback.isPlaying;
    patchCinemaChatState(
      {
        sessionState: target ? SESSION_STATES.PLAYING : SESSION_STATES.PAUSED,
        playback: {
          ...state.playback,
          isPlaying: target,
          currentTime: computeLocalTime(state, now),
          updatedAt: now,
          updatedBy: myId,
        },
      },
      myId,
    ).catch(() => {});
  };

  const seekTo = (t: number) => {
    if (!movieData) return;
    const now = Date.now();
    patchCinemaChatState(
      {
        sessionState: state.playback.isPlaying
          ? SESSION_STATES.PLAYING
          : SESSION_STATES.PAUSED,
        playback: {
          ...state.playback,
          isPlaying: state.playback.isPlaying,
          currentTime: Math.max(0, t),
          updatedAt: now,
          updatedBy: myId,
        },
      },
      myId,
    ).catch(() => {});
  };

  const nudge = (seconds: number) => {
    seekTo(computeLocalTime(state, Date.now()) + seconds);
  };

  const endSession = () => {
    patchCinemaChatState(
      {
        sessionState: SESSION_STATES.ENDED,
        playback: {
          ...state.playback,
          isPlaying: false,
          updatedAt: Date.now(),
          updatedBy: myId,
        },
      },
      myId,
    ).catch(() => {});
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newMsg.trim();
    if (!text || !isParticipant) return;
    sendCinemaChatMessage({
      senderId: myId,
      senderName: identity.name,
      senderCode: identity.code,
      text: text.slice(0, 2000),
    }).catch((err) => console.warn("sendCinemaChatMessage failed:", err));
    setNewMsg("");
  };

  // ----- voice messages -------------------------------------------------------

  const copyJoinCode = async () => {
    try {
      await navigator.clipboard.writeText(state.joinCode || "");
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const shareInvite = async () => {
    const text = `Join me in CinemaChat 🎬\nکۆدی بەشداری: ${state.joinCode || ""}\nلینک: ${safeLink}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: CINEMA_CHAT_ROOM_NAME, text });
        return;
      } catch {
        /* user cancelled or share unavailable — fall through to copy */
      }
    }
    await copyJoinCode();
  };

  const toggleFullscreen = () => {
    const el = fsRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen().catch(() => {});
    }
  };

  const blobToDataURL = (blob: Blob): Promise<string | null> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const cleanupRecorder = (discard: boolean) => {
    if (recTimerRef.current !== null) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    setRecording(false);
    setRecordSeconds(0);
    recElapsedRef.current = 0;
    stopMediaStream();
    if (discard) {
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    }
  };

  const flushVoiceMessage = async () => {
    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    if (!chunks.length) return;
    setVoiceBusy(true);
    try {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const dataUrl = await blobToDataURL(blob);
      if (!dataUrl) return;
      await sendCinemaChatMessage({
        senderId: myId,
        senderName: identity.name,
        senderCode: identity.code,
        text: "",
        kind: "voice",
        voiceDataUrl: dataUrl,
        duration: Math.max(1, recElapsedRef.current),
      });
    } catch (err) {
      console.warn("send voice message failed:", err);
      setRecError("ناردنی نامەی دەنگی سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
    } finally {
      setVoiceBusy(false);
    }
  };

  const startVoiceRecording = async () => {
    if (recording || voiceBusy || !isParticipant) return;
    setRecError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecError("مایکرۆفۆن لەم مەریخەدا بەردەست نییە (پەیوەندیی پارێزراو / HTTPS پێویستە)");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void flushVoiceMessage();
      };
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      recElapsedRef.current = 0;
      recTimerRef.current = window.setInterval(() => {
        recElapsedRef.current += 1;
        setRecordSeconds(recElapsedRef.current);
        if (recElapsedRef.current >= MAX_VOICE_SECONDS) stopVoiceRecording();
      }, 1000);
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setRecError("ڕێگەدان بە مایکرۆفۆن ڕەتکرایەوە — لە ڕێکخستنەکانی مەریخەکە ڕێگەی پێبدە");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setRecError("هیچ مایکرۆفۆنێک نەدۆزرایەوە");
      } else {
        setRecError("دەستپێکردنی تۆمارکردن سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
      }
    }
  };

  const stopVoiceRecording = () => {
    if (!recording) return;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else void flushVoiceMessage();
    cleanupRecorder(false);
  };

  const cancelVoiceRecording = () => {
    if (!recording) return;
    cleanupRecorder(true);
  };

  // Release the microphone if the room closes mid-recording.
  useEffect(() => {
    return () => {
      if (recTimerRef.current !== null) window.clearInterval(recTimerRef.current);
      stopMediaStream();
    };
  }, []);

  const handleQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          const value = code.data;
          if (value.startsWith("cinemachat://cinema-room")) {
            const params = new URLSearchParams(value.split("?")[1] || "");
            const c = params.get("code");
            if (c) {
              setJoinInput(c);
              void joinSession(c);
              return;
            }
          }
          setJoinInput(value);
          void joinSession(value);
        } else {
          setJoinError("هیچ کۆدێک لەناو وێنەکەدا نەدۆزرایەوە");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const copySafeLink = async () => {
    try {
      await navigator.clipboard.writeText(safeLink);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const filteredMovies = useMemo(() => {
    const q = movieSearch.trim().toLowerCase();
    const list = Array.isArray(movies) ? movies : [];
    if (!q) return list.slice(0, 60);
    return list
      .filter(
        (m: any) =>
          String(m?.title || "")
            .toLowerCase()
            .includes(q) ||
          (Array.isArray(m?.tags) &&
            m.tags.some((t: any) => String(t).toLowerCase().includes(q))),
      )
      .slice(0, 60);
  }, [movies, movieSearch]);

  const isProposedAndPending =
    !!movieData &&
    state.sessionState === SESSION_STATES.WAITING_FOR_APPROVAL &&
    !(state.movieProposal.hostApproved && state.movieProposal.guestApproved);

  const iApprovedMovie = meIsHost
    ? state.movieProposal.hostApproved
    : meIsGuest
      ? state.movieProposal.guestApproved
      : false;
  const otherApprovedMovie = meIsHost
    ? state.movieProposal.guestApproved
    : meIsGuest
      ? state.movieProposal.hostApproved
      : false;

  const showDisconnectedOverlay =
    isParticipant && state.sessionState === SESSION_STATES.DISCONNECTED;
  const wizardStep =
    state.sessionState === SESSION_STATES.PAIRING ||
    state.sessionState === SESSION_STATES.WAITING_FOR_APPROVAL
      ? 2
      : state.sessionState === SESSION_STATES.READY
        ? 3
        : state.sessionState === SESSION_STATES.PLAYING ||
            state.sessionState === SESSION_STATES.PAUSED ||
            state.sessionState === SESSION_STATES.DISCONNECTED
          ? 4
          : 1;
  const canAdvanceFromConnect =
    isParticipant &&
    state.sessionState === SESSION_STATES.WAITING_FOR_APPROVAL &&
    state.hostApproved &&
    state.guestApproved &&
    !movieData;
  const goToMovieStep = useCallback(() => {
    if (!canAdvanceFromConnect) return;
    setShowMoviePicker(true);
  }, [canAdvanceFromConnect]);

  // ---------------------------------------------------------------------------

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-6 bg-black/90 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl h-[94vh] max-h-[94vh] bg-zinc-950 border border-white/10 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10 bg-zinc-900/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                  <Tv className="w-6 h-6 text-brand-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-white kurdish-text">
                      {CINEMA_CHAT_ROOM_NAME}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-brand-primary/15 border border-brand-primary/30 text-brand-primary text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      فەرمی · هەمیشەیی · پارێزراو
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 kurdish-text truncate">
                    ژووری سەیرکردنی هاوپەیمانی دوو کەسە — پێکەوە سەیری بکە، چات بکە
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                    state.sessionState === SESSION_STATES.PLAYING
                      ? "bg-green-500/15 border-green-500/30 text-green-400"
                      : state.sessionState === SESSION_STATES.DISCONNECTED
                        ? "bg-orange-500/15 border-orange-500/30 text-orange-400"
                        : state.sessionState === SESSION_STATES.ENDED
                          ? "bg-gray-500/15 border-gray-500/30 text-gray-400"
                          : "bg-white/5 border-white/10 text-gray-400"
                  }`}
                >
                  {STATE_LABELS[state.sessionState] || state.sessionState}
                </span>
                <button
                  onClick={() => setShowChat((v) => !v)}
                  className={`relative p-3 rounded-xl transition-all ${
                    showChat
                      ? "bg-white/10 text-white"
                      : "text-gray-500 hover:text-white"
                  }`}
                  title={showChat ? "داخستنی چات" : "کردنەوەی چات"}
                >
                  <MessageCircle className="w-5 h-5" />
                  <ChatUnreadBadge text={unreadText} voice={unreadVoice} />
                </button>
                <button
                  onClick={onClose}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                  title="داخستن"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <WizardProgress
              activeStep={wizardStep}
              onNext={canAdvanceFromConnect ? goToMovieStep : undefined}
            />

            <div className="flex-1 flex overflow-hidden">
              {/* Main area */}
              <div
                className={`flex-1 flex flex-col transition-all ${showChat ? "max-lg:mr-0 lg:mr-80" : ""}`}
              >
                {/* Lobby: setup / pairing views. Shown for EMPTY, the host's
                    WAITING_FOR_PARTNER panel (QR + join code), the PAIRING
                    approve/wait panels, and for any non-participant. The player
                    area takes over for WAITING_FOR_APPROVAL / READY /
                    PLAYING / PAUSED / DISCONNECTED / ENDED. */}
                {state.sessionState === SESSION_STATES.EMPTY ||
                state.sessionState === SESSION_STATES.WAITING_FOR_PARTNER ||
                state.sessionState === SESSION_STATES.PAIRING ||
                (state.sessionState === SESSION_STATES.WAITING_FOR_APPROVAL && !movieData) ||
                !isParticipant ? (
                  <Lobby
                    state={state}
                    meIsHost={meIsHost}
                    isParticipant={isParticipant}
                    myId={myId}
                    joinInput={joinInput}
                    setJoinInput={setJoinInput}
                    joinError={joinError}
                    joinBusy={joinBusy}
                    busy={busy}
                    onStart={startSession}
                    onJoin={joinSession}
                    onQRUpload={handleQRUpload}
                    qrInputRef={qrInputRef}
                    copied={copied}
                    onCopyLink={copySafeLink}
                    onCopyCode={copyJoinCode}
                    identity={identity}
                    meIsGuest={meIsGuest}
                    onApproveGuest={approveGuest}
                    onDeclineGuest={declineGuest}
                    hasAccount={hasAccount}
                    accountLoading={accountLoading}
                    accountName={accountName}
                    accountCode={accountCode}
                    onRequestAccount={onRequestAccount}
                    onNextToMovie={goToMovieStep}
                  />
                ) : (
                  <div ref={fsRef} className="flex-1 flex flex-col relative">
                    {/* Player / placeholder area */}
                    <div className="relative flex-1 bg-black overflow-hidden">
                      {sourceUrl ? (
                        <div ref={playerWrapRef} className="absolute inset-0">
                          {sourceKind === "youtube" && (
                            <YouTubeResilientPlayer
                              key={playerKey}
                              url={sourceUrl}
                              iframeId="cinemachat-room-player"
                              title={movieData?.title}
                              onModeChange={(mode) => {
                                setPlayerKind(
                                  mode === "direct"
                                    ? "direct"
                                    : mode === "error"
                                      ? "embed"
                                      : "youtube",
                                );
                              }}
                            />
                          )}
                          {sourceKind === "embed" && (
                            <ImmersiveShieldedPlayer
                              key={playerKey}
                              url={sourceUrl}
                              iframeId="cinemachat-room-embed"
                              title={movieData?.title}
                            />
                          )}
                          {sourceKind === "direct" && (
                            <video
                              key={`${playerKey}:${directVideoRetryKey}`}
                              id="cinemachat-room-direct-video"
                              src={sourceUrl}
                              poster={movieData?.image}
                              controls
                              autoPlay
                              playsInline
                              preload="auto"
                              className="w-full h-full object-contain bg-black"
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
                              onError={() => {
                                clearDirectVideoSlowTimer();
                                setDirectVideoStatus("error");
                              }}
                            />
                          )}
                          {sourceKind === "direct" &&
                            directVideoStatus !== "ready" &&
                            directVideoStatus !== "idle" && (
                              <VideoLoadOverlay
                                status={
                                  directVideoStatus === "error"
                                    ? "error"
                                    : directVideoStatus === "buffering"
                                      ? "buffering"
                                      : "loading"
                                }
                                message={
                                  directVideoStatus === "error"
                                    ? "Video could not be loaded. Please try again."
                                    : directVideoStatus === "buffering"
                                      ? "Network is slow. Buffering video..."
                                      : "Preparing video..."
                                }
                                onRetry={
                                  directVideoStatus === "loading"
                                    ? undefined
                                    : () => setDirectVideoRetryKey((key) => key + 1)
                                }
                              />
                            )}
                          {/* AI subtitle overlay for CinemaChat — renders on top
                              of whichever player type is active. */}
                          {subtitleCues && displayTime > 0 && subtitleLang !== "off" && (ccSettings?.showSubtitle !== false) && (() => {
                            const activeCue = subtitleCues.find(
                              (c) => displayTime >= c.start && displayTime <= c.end,
                            );
                            const activeOriginalCue =
                              subtitleLang === "both"
                                ? originalSubtitleCues?.find(
                                    (c) => displayTime >= c.start && displayTime <= c.end,
                                  )
                                : undefined;
                            if (!activeCue && !activeOriginalCue) return null;
                            return (
                              <div className="pointer-events-none absolute inset-x-3 bottom-16 z-10 flex flex-col items-center gap-1">
                                {activeOriginalCue && (
                                  <div
                                    dir="auto"
                                    className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-1.5 text-center font-bold leading-snug opacity-80 shadow-[0_2px_12px_rgba(0,0,0,0.55)] ${ccFontSizeEntry?.mobileCls || 'text-[11px]'} ${ccFontSizeEntry?.cls || ''}`}
                                    style={{
                                      ...(ccSubtitleStyle || {
                                        backgroundColor: 'rgba(0,0,0,0.55)',
                                        color: '#e5e7eb',
                                        textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                                      }),
                                      color: '#e5e7eb',
                                      backgroundColor: `rgba(0,0,0,${Math.max((ccSettings?.bgOpacity ?? 0.7) - 0.15, 0.35)})`,
                                    }}
                                  >
                                    {activeOriginalCue.text}
                                  </div>
                                )}
                                {activeCue && (
                                  <div
                                    dir="auto"
                                    className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-2 text-center font-bold leading-snug shadow-[0_2px_14px_rgba(0,0,0,0.55)] ${ccFontSizeEntry?.mobileCls || 'text-[11px]'} ${ccFontSizeEntry?.cls || ''}`}
                                    style={ccSubtitleStyle || { backgroundColor: 'rgba(0,0,0,0.7)', color: '#ffffff', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}
                                  >
                                    {activeCue.text}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {subtitleLang !== "off" && subtitleStatus === "loading" && (
                            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 px-4 py-3 pointer-events-none">
                              <div className="flex items-center gap-2 rounded-xl bg-black/70 px-3 py-2 text-[10px] text-red-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>{subtitleMessage || "وەردەگێڕدرێت..."}</span>
                              </div>
                            </div>
                          )}
                          {subtitleLang !== "off" && subtitleStatus === "error" && (
                            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center px-4 py-3">
                              <div className="flex items-center gap-2 rounded-xl bg-red-950/80 border border-red-500/20 px-3 py-2 text-[10px] text-red-300">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>{subtitleMessage || "بەردەست نییە"}</span>
                                <button
                                  onClick={onSubtitleRetry}
                                  className="ml-1 p-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors shrink-0 cursor-pointer"
                                  title="Retry subtitle"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          )}
                          {/* CC language toggle for CinemaChat */}
                          {subtitleLanguages && subtitleLanguages.length > 0 && (
                            <div className="absolute bottom-[74px] right-4 z-[80] overflow-visible">
                              <div className="relative overflow-visible">
                                <button
                                  type="button"
                                  onClick={() => setShowCcMenu((v) => !v)}
                                  className={`w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 ${
                                    subtitleStatus === "ready"
                                      ? "bg-brand-primary text-white"
                                      : subtitleStatus === "loading"
                                        ? "bg-red-600 text-white animate-pulse"
                                        : "bg-black/60 hover:bg-white/10 text-white"
                                  }`}
                                  title="زمانی ژێرنوس (Subtitles)"
                                >
                                  <Captions className="w-3 h-3" />
                                </button>
                                {showCcMenu && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-[55]"
                                      onClick={() => setShowCcMenu(false)}
                                    />
                                    <div className="absolute bottom-[44px] right-0 z-[90] w-44 max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0c]/95 backdrop-blur-xl p-2 shadow-2xl space-y-1.5 overscroll-contain">
                                      <div className="text-[8px] font-black text-zinc-400 uppercase tracking-widest px-1 kurdish-text">زمانی ژێرنوس</div>
                                      {subtitleLanguages.map((lang) => (
                                        <button
                                          key={lang.code}
                                          type="button"
                                          onClick={() => {
                                            onSubtitleLangChange?.(lang.code);
                                          }}
                                          className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                            subtitleLang === lang.code
                                              ? "bg-brand-primary text-white"
                                              : "bg-white/5 hover:bg-white/10 text-zinc-300"
                                          }`}
                                        >
                                          <span>{lang.label}</span>
                                          {subtitleLang === lang.code && <span className="text-[8px] opacity-70">✓</span>}
                                        </button>
                                      ))}
                                      <div className="border-t border-white/10 pt-1.5 space-y-1">
                                        <button
                                          type="button"
                                          onClick={() => onToggleCcPanel?.()}
                                          className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-[10px] font-bold bg-white/5 hover:bg-white/10 text-zinc-300 cursor-pointer transition-all"
                                        >
                                          <span>⚙️ ڕێکخستن</span>
                                          {showCcPanel && <span className="ml-auto text-[8px] text-brand-primary">●</span>}
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* CC Settings Panel for CinemaChat */}
                          {showCcPanel && (
                            <>
                              <div className="fixed inset-0 z-[65]" onClick={() => onToggleCcPanel?.()} />
                              <div className="absolute bottom-[118px] right-4 z-[100] w-52 max-h-[65vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0c]/95 backdrop-blur-xl p-2.5 shadow-2xl space-y-2 overscroll-contain">
                                <div className="flex items-center justify-between">
                                  <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">CC Settings</span>
                                  <button onClick={() => onToggleCcPanel?.()} className="text-zinc-500 hover:text-white text-[10px] cursor-pointer">✕</button>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-bold text-zinc-300">show / hide</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const shouldShow = ccSettings?.showSubtitle === false || subtitleLang === "off";
                                      onSubtitleLangChange?.(shouldShow ? "ckb" : "off");
                                    }}
                                    className={`w-7 h-3.5 rounded-full transition-all cursor-pointer ${ccSettings?.showSubtitle !== false ? 'bg-brand-primary' : 'bg-zinc-600'}`}
                                  >
                                    <span className={`block w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${ccSettings?.showSubtitle !== false ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                  </button>
                                </div>
                                <div>
                                  <span className="text-[8px] font-bold text-zinc-500 block mb-1">ئەندازەی فۆنت</span>
                                  <div className="flex gap-0.5">
                                    {[{ key: 'sm' as const, label: 'A-' }, { key: 'md' as const, label: 'A' }, { key: 'lg' as const, label: 'A+' }, { key: 'xl' as const, label: 'A++' }].map((fs) => (
                                      <button
                                        key={fs.key}
                                        type="button"
                                        onClick={() => onUpdateCcSettings?.((s) => ({ ...s, fontSize: fs.key }))}
                                        className={`flex-1 py-0.5 rounded text-[9px] font-black transition-all cursor-pointer ${
                                          ccSettings?.fontSize === fs.key ? 'bg-brand-primary text-white' : 'bg-white/5 text-zinc-400'
                                        }`}
                                      >
                                        {fs.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[8px] font-bold text-zinc-500">کاڵکردنەوە</span>
                                    <span className="text-[7px] text-zinc-600">{Math.round((ccSettings?.bgOpacity ?? 0.8) * 100)}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={0.2}
                                    max={1}
                                    step={0.1}
                                    value={ccSettings?.bgOpacity ?? 0.8}
                                    onChange={(e) => onUpdateCcSettings?.((s) => ({ ...s, bgOpacity: Number(e.target.value) }))}
                                    className="w-full h-0.5 accent-brand-primary cursor-pointer"
                                  />
                                </div>
                                <div>
                                  <span className="text-[8px] font-bold text-zinc-500 block mb-1">ڕەنگ</span>
                                  <div className="flex gap-1">
                                    {['#ffffff', '#FFFF00', '#00FFFF', '#00FF00', '#FF8800', '#FF5555'].map((color) => (
                                      <button
                                        key={color}
                                        type="button"
                                        onClick={() => onUpdateCcSettings?.((s) => ({ ...s, textColor: color }))}
                                        className={`w-4 h-4 rounded-full border-2 transition-all cursor-pointer ${
                                          ccSettings?.textColor === color ? 'border-white scale-110' : 'border-zinc-600'
                                        }`}
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <p className="text-[7px] text-zinc-600 text-center">Settings controlled from main player</p>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                          <div className="w-20 h-20 rounded-3xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
                            <Film className="w-10 h-10 text-brand-primary" />
                          </div>
                          <p className="text-sm text-gray-400 kurdish-text font-bold">
                            هێشتا فیلمێک هەڵنەبژێراوە
                          </p>
                          <p className="text-xs text-gray-600 kurdish-text">
                            فیلمێک پێشنیار بکە، دوو هەردووکەتان پەسەندی بکەن و پاشان
                            پێکەوە سەیری بکەن
                          </p>
                        </div>
                      )}

                      {/* Movie proposal pending overlay (before playback) */}
                      {isProposedAndPending && movieData && (
                        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
                          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden">
                            <div className="aspect-video w-full bg-zinc-950 relative">
                              {movieData.image ? (
                                <img
                                  src={movieData.image}
                                  alt={movieData.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Film className="w-10 h-10 text-white/20" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
                            </div>
                            <div className="p-5 space-y-4">
                              <div>
                                <h3 className="text-white font-black kurdish-text text-lg line-clamp-1">
                                  {movieData.title}
                                </h3>
                                <p className="text-[10px] text-gray-500 kurdish-text mt-1">
                                  {state.movieProposal.proposedBy === myId
                                    ? "تۆ پێشنیارت کردووە — چاوەڕوانی هاوڕێکەت بە"
                                    : "لەلایەن هاوڕێکەت پێشنیار کراوە"}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <ApprovalChip
                                  label={meIsHost ? "پەسەندکردنی تۆ" : "پەسەندکردنی هاوڕێ"}
                                  approved={meIsHost ? state.movieProposal.hostApproved : state.movieProposal.guestApproved}
                                />
                                <ApprovalChip
                                  label={meIsGuest ? "پەسەندکردنی تۆ" : "پەسەندکردنی هاوڕێ"}
                                  approved={meIsGuest ? state.movieProposal.guestApproved : state.movieProposal.hostApproved}
                                />
                              </div>
                              <div className="flex gap-2">
                                {!iApprovedMovie && (
                                  <button
                                    onClick={approveMovie}
                                    className="flex-1 py-3 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-sm font-black kurdish-text flex items-center justify-center gap-2 transition-all"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    پەسەندکردنی فیلم
                                  </button>
                                )}
                                <button
                                  onClick={declineMovie}
                                  className="px-5 py-3 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 text-sm font-black kurdish-text transition-all"
                                >
                                  ڕەتکردنەوە
                                </button>
                                {!isParticipant && (
                                  <p className="text-[10px] text-gray-500 kurdish-text py-3">
                                    بەشداری کە بۆ پەسەندکردن
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* DISCONNECTED overlay */}
                      {showDisconnectedOverlay && (
                        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
                          <div className="w-16 h-16 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
                            <AlertCircle className="w-8 h-8 text-orange-400" />
                          </div>
                          <h3 className="text-lg font-black text-white kurdish-text">
                            هاوڕێکەت ناڕێکە
                          </h3>
                          <p className="text-sm text-gray-400 kurdish-text max-w-sm">
                            پەیوەندی لەگەڵ هاوڕێکەت ناڕێک بووە. کاتێک دەگەڕێتەوە،
                            بە شوێنی پێشووی فیلمەکەوە بەردەوام دەبن.
                          </p>
                          {meIsHost && (
                            <div className="flex items-center gap-2 text-[11px] text-gray-500 kurdish-text">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-400" />
                              </span>
                              چاوەڕوانی گەڕانەوەی هاوڕێکەت
                            </div>
                          )}
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={endSession}
                              className="px-5 py-2.5 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-black kurdish-text hover:bg-red-600/30 transition-all"
                            >
                              کۆتایی هێنان بە دانیشتن
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ENDED overlay */}
                      {state.sessionState === SESSION_STATES.ENDED && isParticipant && (
                        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
                          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                            <RotateCcw className="w-8 h-8 text-gray-400" />
                          </div>
                          <h3 className="text-lg font-black text-white kurdish-text">
                            دانیشتنەکە کۆتایی هات
                          </h3>
                          <p className="text-sm text-gray-400 kurdish-text max-w-sm">
                            دەتوانیت دانیشتنێکی نوێ دەستپێبکەیت بۆ سەیرکردن پێکەوە.
                          </p>
                          <button
                            onClick={startSession}
                            className="px-6 py-3 rounded-xl bg-brand-primary hover:bg-red-700 text-white text-sm font-black kurdish-text transition-all"
                          >
                            دانیشتنێکی نوێ
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Controls bar */}
                    <div className="relative z-20 px-5 py-3.5 bg-zinc-900/90 backdrop-blur border-t border-white/10">
                      {/* Seek bar */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-[10px] font-mono font-black text-gray-500 tabular-nums w-12 text-left">
                          {formatTime(scrubValue ?? displayTime)}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(1, Math.round(duration || 9999))}
                          step={1}
                          value={Math.min(scrubValue ?? Math.floor(displayTime), Math.max(1, Math.round(duration || 9999)))}
                          onChange={(e) => {
                            setScrubValue(Number(e.target.value));
                          }}
                          onPointerUp={() => {
                            if (scrubValue !== null) {
                              seekTo(scrubValue);
                              setScrubValue(null);
                            }
                          }}
                          onKeyUp={() => {
                            if (scrubValue !== null) {
                              seekTo(scrubValue);
                              setScrubValue(null);
                            }
                          }}
                          className="flex-1 h-1.5 accent-brand-primary cursor-pointer"
                          disabled={!movieData}
                        />
                        <span className="text-[10px] font-mono font-black text-gray-500 tabular-nums w-12 text-right">
                          {duration > 0 ? formatTime(duration) : "--:--"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => nudge(-10)}
                            disabled={!movieData}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-black transition-all disabled:opacity-40"
                            title="-10 سانیە"
                          >
                            <SkipBack className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => seekTo(0)}
                            disabled={!movieData}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-black transition-all disabled:opacity-40"
                            title="دەستپێک"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={togglePlayPause}
                            disabled={!movieData}
                            className="px-6 py-3 rounded-xl bg-brand-primary hover:bg-red-700 text-white font-black transition-all disabled:opacity-40 flex items-center gap-2 shadow-xl shadow-red-600/20"
                          >
                            {state.playback?.isPlaying ? (
                              <>
                                <Pause className="w-5 h-5" />
                                ڕاگرتن
                              </>
                            ) : (
                              <>
                                <Play className="w-5 h-5" />
                                پەخشکردن
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => nudge(10)}
                            disabled={!movieData}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-black transition-all disabled:opacity-40"
                            title="+10 سانیە"
                          >
                            <SkipForward className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {state.sessionState === SESSION_STATES.READY && (
                            <button
                              onClick={startPlayback}
                              className="px-5 py-3 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-sm font-black kurdish-text transition-all flex items-center gap-2"
                            >
                              <Play className="w-4 h-4" />
                              دەستپێکردنی سەیرکردن
                            </button>
                          )}
                          <button
                            onClick={() => setShowMoviePicker(true)}
                            className="px-5 py-3 rounded-xl bg-white/5 hover:bg-brand-primary/20 border border-white/10 text-gray-200 text-xs font-black kurdish-text transition-all flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            فیلمی نوێ
                          </button>
                          <button
                            onClick={endSession}
                            className="px-5 py-3 rounded-xl bg-red-600/15 hover:bg-red-600/30 border border-red-500/25 text-red-400 text-xs font-black kurdish-text transition-all"
                          >
                            کۆتایی هێنان
                          </button>
                          <button
                            onClick={toggleFullscreen}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-all"
                            title={isFullscreen ? "داگرتنی پەڕەی تەواو" : "پەڕەی تەواو"}
                          >
                            {isFullscreen ? (
                              <Minimize2 className="w-4 h-4" />
                            ) : (
                              <Maximize2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Floating chat overlay while the video is fullscreen —
                        semi-transparent so the video stays visible. */}
                    {isFullscreen && (
                      <>
                        {showFullscreenChat ? (
                          <div className="absolute inset-0 z-[60] pointer-events-none flex justify-end p-3">
                            <div className="pointer-events-auto w-80 max-w-[86vw] h-full bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                              <ChatPanel
                                state={state}
                                messages={messages}
                                myId={myId}
                                isParticipant={isParticipant}
                                meIsHost={meIsHost}
                                meIsGuest={meIsGuest}
                                newMsg={newMsg}
                                onNewMsgChange={setNewMsg}
                                onSend={sendMessage}
                                onCopyCode={copyJoinCode}
                                copied={copied}
                                onShare={shareInvite}
                                onApproveGuest={approveGuest}
                                onDeclineGuest={declineGuest}
                                recording={recording}
                                recordSeconds={recordSeconds}
                                recError={recError}
                                voiceBusy={voiceBusy}
                                onStartRecord={startVoiceRecording}
                                onStopRecord={stopVoiceRecording}
                                onCancelRecord={cancelVoiceRecording}
                                onClose={() => setShowFullscreenChat(false)}
                              />
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowFullscreenChat(true)}
                            className="absolute right-3 top-3 z-[60] relative p-3 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white hover:bg-black/80 transition-all"
                            title="کردنەوەی چات"
                          >
                            <MessageCircle className="w-5 h-5" />
                            <ChatUnreadBadge
                              text={unreadText}
                              voice={unreadVoice}
                            />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Chat sidebar ─────────────────────────────────────── */}
              <AnimatePresence>
                {showChat && (
                  <motion.div
                    initial={{ x: 320 }}
                    animate={{ x: 0 }}
                    exit={{ x: 320 }}
                    transition={{ duration: 0.2 }}
                    className="w-80 max-w-[88vw] bg-zinc-950 border-l border-white/10 flex flex-col fixed right-0 top-0 bottom-0 z-[230] lg:relative lg:z-auto lg:w-80"
                  >
                    <ChatPanel
                      state={state}
                      messages={messages}
                      myId={myId}
                      isParticipant={isParticipant}
                      meIsHost={meIsHost}
                      meIsGuest={meIsGuest}
                      newMsg={newMsg}
                      onNewMsgChange={setNewMsg}
                      onSend={sendMessage}
                      onCopyCode={copyJoinCode}
                      copied={copied}
                      onShare={shareInvite}
                      onApproveGuest={approveGuest}
                      onDeclineGuest={declineGuest}
                      recording={recording}
                      recordSeconds={recordSeconds}
                      recError={recError}
                      voiceBusy={voiceBusy}
                      onStartRecord={startVoiceRecording}
                      onStopRecord={stopVoiceRecording}
                      onCancelRecord={cancelVoiceRecording}
                      onClose={() => setShowChat(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* ── Movie picker modal ─────────────────────────────────── */}
          <AnimatePresence>
            {showMoviePicker && (
              <div
                className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                onClick={() => setShowMoviePicker(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-2xl max-h-[85vh] bg-zinc-900 border border-white/10 rounded-[2rem] flex flex-col overflow-hidden"
                >
                  <div className="p-5 border-b border-white/10 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black text-white kurdish-text">
                        هەڵبژاردنی فیلم
                      </h3>
                      <p className="text-[10px] text-gray-500 kurdish-text">
                        فیلمێک هەڵبژێرە بۆ پێشنیارکردن بۆ هاوڕێکەت
                      </p>
                    </div>
                    <button
                      onClick={() => setShowMoviePicker(false)}
                      className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4 border-b border-white/10">
                    <div className="relative">
                      <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        value={movieSearch}
                        onChange={(e) => setMovieSearch(e.target.value)}
                        placeholder="بگەڕێ بە ناو یان پۆلێن..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white kurdish-text text-sm outline-none focus:border-brand-primary"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredMovies.length === 0 && (
                      <p className="p-8 text-center text-xs text-gray-500 kurdish-text">
                        هیچ فیلمێک نەدۆزرایەوە
                      </p>
                    )}
                    {filteredMovies.map((movie: any) => (
                      <button
                        key={movie.id}
                        onClick={() => proposeMovie(movie)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 text-right transition-all"
                      >
                        <img
                          src={movie.image || undefined}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-14 h-20 object-cover rounded-lg border border-white/10 flex-shrink-0 bg-zinc-800"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-black text-white kurdish-text line-clamp-1">
                            {movie.title}
                          </h4>
                          <p className="text-[10px] text-gray-500 kurdish-text line-clamp-1">
                            {Array.isArray(movie.tags) ? movie.tags.join(" · ") : ""}
                          </p>
                          {movie.quality && (
                            <span className="mt-1 inline-block px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[9px] font-black">
                              {movie.quality}
                            </span>
                          )}
                        </div>
                        <Plus className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ChatPanel — the realtime room chat (text + voice), approval status, and the
// copy/share controls. Shared by the desktop sidebar and the fullscreen
// transparent overlay so both always show the exact same UI.
// ─────────────────────────────────────────────────────────────────────────────
interface ChatPanelProps {
  state: CinemaChatRoomState;
  messages: CinemaChatMessage[];
  myId: string;
  isParticipant: boolean;
  meIsHost: boolean;
  meIsGuest: boolean;
  newMsg: string;
  onNewMsgChange: (v: string) => void;
  onSend: (e: React.FormEvent) => void;
  onCopyCode: () => void;
  copied: boolean;
  onShare: () => void;
  /** Accept the seated guest's pairing request (persists host approval). */
  onApproveGuest: () => void;
  /** Decline the seated guest's pairing request (persists reset). */
  onDeclineGuest: () => void;
  recording: boolean;
  recordSeconds: number;
  recError: string | null;
  voiceBusy: boolean;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onCancelRecord: () => void;
  onClose?: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  state,
  messages,
  myId,
  isParticipant,
  meIsHost,
  meIsGuest,
  newMsg,
  onNewMsgChange,
  onSend,
  onCopyCode,
  copied,
  onShare,
  onApproveGuest,
  onDeclineGuest,
  recording,
  recordSeconds,
  recError,
  voiceBusy,
  onStartRecord,
  onStopRecord,
  onCancelRecord,
  onClose,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message visible when new messages arrive.
  useEffect(() => {
    const t = window.setTimeout(
      () => scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      80,
    );
    return () => window.clearTimeout(t);
  }, [messages]);

  const participants = [state.host, state.guest].filter(
    (p): p is CinemaChatParticipant => !!p,
  );

  // Pairing request card: visible while a guest is seated and the session is
  // still in the approval phase (PAIRING, or WAITING_FOR_APPROVAL before any
  // movie is proposed) so the "پەسەندکرا ✓" state stays visible on both sides.
  const showPairingCard =
    isParticipant &&
    !!state.guest &&
    (state.sessionState === SESSION_STATES.PAIRING ||
      (state.sessionState === SESSION_STATES.WAITING_FOR_APPROVAL &&
        !state.movieProposal?.movieData));

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header: title, share, close */}
      <div className="p-4 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-black text-white kurdish-text flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-brand-primary" />
            چاتی ژوور
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500 font-black">
              <Users className="w-3.5 h-3.5" />
              {participants.length}/2
            </span>
            <button
              onClick={onShare}
              title="بەشکردن لەگەڵ هاوڕێ"
              className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
            >
              <Share2 className="w-4 h-4" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                title="داخستن"
                className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Participants — host/guest clearly distinguished */}
        <div className="flex items-center gap-2 flex-wrap">
          {participants.map((p) => {
            const isHost = p.id === state.host?.id;
            const isMe = p.id === myId;
            return (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[10px] font-black ${
                  isMe
                    ? "bg-brand-primary/15 border-brand-primary/30 text-brand-primary"
                    : "bg-white/5 border-white/10 text-gray-300"
                }`}
              >
                {isMe && <UserCheck className="w-3 h-3" />}
                {p.name}
                <span className="inline-flex items-center gap-1">
                  <span className="text-[8px] text-gray-500 font-mono">({p.code})</span>
                  <CodeCopy code={p.code} />
                </span>
                <span
                  className={`text-[8px] ${
                    isHost ? "text-brand-primary" : "text-gray-500"
                  }`}
                >
                  {isHost ? "خانەخوێ" : "میوان"}
                </span>
              </span>
            );
          })}
          {!state.host && (
            <span className="text-[10px] text-gray-600 kurdish-text">
              هیچ بەشداربووێک نییە
            </span>
          )}
        </div>

        {/* Pairing / approval state — visible to BOTH participants */}
        {isParticipant && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <ApprovalChip
              label={meIsHost ? "پەسەندکردنی تۆ (خانەخوێ)" : "پەسەندکردنی خانەخوێ"}
              approved={state.hostApproved}
            />
            <ApprovalChip
              label={meIsGuest ? "پەسەندکردنی تۆ (میوان)" : "پەسەندکردنی میوان"}
              approved={state.guestApproved}
            />
            {state.joinCode && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-mono text-gray-400">
                کۆد: {state.joinCode}
                <CodeCopy code={state.joinCode} />
              </span>
            )}
          </div>
        )}

        {/* Pairing request — the receiver (host) accepts here; the sender (guest)
            sees the same synchronized state from Firestore. Acceptance is
            persisted via the existing approval flow (hostApproved), never a
            local-only change. */}
        {showPairingCard && state.guest && (
          <div className="mt-3 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
            {meIsHost ? (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-[10px] font-black text-emerald-400 kurdish-text">
                    داواکاری پەیوەندی — {state.guest.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[10px] text-gray-400 kurdish-text">کۆد:</span>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 font-mono text-[10px] font-black text-white truncate">
                      {state.guest.code}
                    </span>
                    <CodeCopy code={state.guest.code} label />
                  </span>
                </div>
                {state.hostApproved ? (
                  <p className="text-[10px] font-black text-emerald-400 kurdish-text flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    پەسەندکرا ✓
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onApproveGuest}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-xs font-black kurdish-text flex items-center justify-center gap-1.5 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      وەرگرە
                    </button>
                    <button
                      type="button"
                      onClick={onDeclineGuest}
                      className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 text-xs font-black kurdish-text transition-all"
                    >
                      ڕەتکردنەوە
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-[10px] font-black text-emerald-400 kurdish-text">
                    داواکاری پەیوەندی نێردرا
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[10px] text-gray-400 kurdish-text">کۆدی ژوور:</span>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 font-mono text-[10px] font-black text-white truncate">
                      {state.joinCode || state.host?.code || ""}
                    </span>
                    <CodeCopy code={state.joinCode || state.host?.code || ""} label />
                  </span>
                </div>
                {state.hostApproved ? (
                  <p className="text-[10px] font-black text-emerald-400 kurdish-text flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    پەسەندکرا ✓ — {state.host?.name || "خانەخوێ"} داواکارییەکەت پەسەند کرد
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400 kurdish-text">
                    چاوەڕوانی پەسەندکردنی {state.host?.name || "خانەخوێ"} بە
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
        {!isParticipant && (
          <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-xl p-3 text-[10px] text-brand-primary font-bold kurdish-text">
            بۆ چاتکردن یەکەم جار بەشداری بکە
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id || `${msg.timestamp}-${msg.senderId}-${msg.text}`}
            className={`flex flex-col ${msg.senderId === myId ? "items-end" : "items-start"}`}
          >
            <span className="inline-flex items-center gap-1 text-[9px] text-gray-500 font-bold mb-1 px-2">
              {msg.senderName} ({msg.senderCode})
              <CodeCopy code={msg.senderCode} />
            </span>
            {msg.kind === "voice" && msg.voiceDataUrl ? (
              <div
                className={`max-w-[85%] px-3 py-2.5 rounded-2xl ${
                  msg.senderId === myId
                    ? "bg-brand-primary text-white"
                    : "bg-white/5 text-gray-200"
                }`}
              >
                <audio
                  controls
                  preload="metadata"
                  className="h-10 max-w-[220px] min-w-[170px]"
                  src={msg.voiceDataUrl}
                />
                <div className="text-[9px] mt-1 opacity-70 flex items-center gap-1">
                  <Mic className="w-3 h-3" />
                  نامەی دەنگی · {msg.duration || 0} چرکە
                </div>
              </div>
            ) : (
              <div
                className={`max-w-[85%] px-4 py-2 rounded-2xl kurdish-text text-sm break-words ${
                  msg.senderId === myId
                    ? "bg-brand-primary text-white"
                    : "bg-white/5 text-gray-200"
                }`}
              >
                {msg.text}
              </div>
            )}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Input: copy code · text · voice · send */}
      <form
        onSubmit={onSend}
        className="p-3 border-t border-white/5 bg-zinc-900/50 flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={onCopyCode}
          disabled={!isParticipant || !state.joinCode}
          title="کۆپی کردنی کۆدی ژوورەکە"
          className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-all disabled:opacity-40"
        >
          {copied ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        <input
          type="text"
          value={newMsg}
          onChange={(e) => onNewMsgChange(e.target.value)}
          placeholder={isParticipant ? "نامە بنێرە..." : "بەشداری بکە بۆ چات"}
          disabled={!isParticipant}
          className="flex-1 min-w-0 bg-zinc-900 border border-white/10 rounded-2xl px-4 py-3 text-white kurdish-text text-sm outline-none focus:border-brand-primary disabled:opacity-50"
        />
        {recording ? (
          <button
            type="button"
            onClick={onStopRecord}
            title="وەستان و ناردن"
            className="p-3 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-all"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartRecord}
            disabled={!isParticipant || voiceBusy}
            title="تۆمارکردنی نامەی دەنگی"
            className="p-3 rounded-xl bg-white/5 hover:bg-brand-primary/20 border border-white/10 text-gray-300 hover:text-white transition-all disabled:opacity-40"
          >
            {voiceBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>
        )}
        <button
          type="submit"
          disabled={!isParticipant || !newMsg.trim()}
          className="p-3 rounded-xl bg-brand-primary text-white hover:bg-red-700 transition-all disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Recording + error status */}
      {recording && (
        <div className="px-3 pb-2 flex items-center justify-between gap-2 shrink-0">
          <span className="flex items-center gap-2 text-[10px] font-black text-red-400 kurdish-text">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            تۆمارکردن... {recordSeconds}/{MAX_VOICE_SECONDS} چرکە
          </span>
          <button
            type="button"
            onClick={onCancelRecord}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-400 font-bold transition-all"
          >
            <Trash2 className="w-3 h-3" />
            ڕەتکردنەوە
          </button>
        </div>
      )}
      {recError && (
        <div className="px-3 pb-2 flex items-start gap-1.5 text-[10px] font-bold text-amber-400 kurdish-text shrink-0">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {recError}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Lobby — shown when there is no active session for the current user: start a
// new session, join by member code / QR / safe link.
// ─────────────────────────────────────────────────────────────────────────────
const Lobby = ({
  state,
  meIsHost,
  isParticipant,
  myId,
  joinInput,
  setJoinInput,
  joinError,
  joinBusy,
  busy,
  onStart,
  onJoin,
  onQRUpload,
  qrInputRef,
  copied,
  onCopyLink,
  onCopyCode,
  identity,
  meIsGuest,
  onApproveGuest,
  onDeclineGuest,
  hasAccount,
  accountLoading,
  accountName,
  accountCode,
  onRequestAccount,
  onNextToMovie,
}: {
  state: CinemaChatRoomState;
  meIsHost: boolean;
  isParticipant: boolean;
  myId: string;
  joinInput: string;
  setJoinInput: (v: string) => void;
  joinError: string | null;
  joinBusy: boolean;
  busy: boolean;
  onStart: () => void;
  onJoin: (code?: string) => void;
  onQRUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  qrInputRef: React.RefObject<HTMLInputElement>;
  copied: boolean;
  onCopyLink: () => void;
  onCopyCode: () => void;
  identity: CinemaChatParticipant;
  meIsGuest: boolean;
  onApproveGuest: () => void;
  onDeclineGuest: () => void;
  hasAccount: boolean;
  accountLoading: boolean;
  accountName?: string;
  accountCode?: string;
  onRequestAccount?: () => void;
  onNextToMovie: () => void;
}) => {
  const hasValidAccount = hasAccount && !!accountCode && !accountCode.startsWith("DEV-");
  const sessionWaiting =
    !!state.sessionId && !!state.host && !state.guest && meIsHost === false && !isParticipant;
  const safeLink = `cinemachat://cinema-room?room=${CINEMA_CHAT_ROOM_ID}&code=${encodeURIComponent(
    state.joinCode || "",
  )}`;

  const showStepOneWizard =
    state.sessionState !== SESSION_STATES.PAIRING &&
    state.sessionState !== SESSION_STATES.WAITING_FOR_APPROVAL;
  const connectedPartner = meIsHost ? state.guest : meIsGuest ? state.host : null;
  const showConnectedPanel =
    isParticipant &&
    state.sessionState === SESSION_STATES.WAITING_FOR_APPROVAL &&
    state.hostApproved &&
    state.guestApproved &&
    !!connectedPartner;
  if (showStepOneWizard) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8">
        <div className="w-full max-w-3xl mx-auto">
          <FriendIdentityPanel
            identity={identity}
            state={state}
            hasAccount={hasAccount}
            accountLoading={accountLoading}
            accountName={accountName}
            accountCode={accountCode}
            onRequestAccount={onRequestAccount}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {showConnectedPanel && connectedPartner && (
          <div className="md:col-span-2 bg-emerald-500/10 border border-emerald-500/35 rounded-[2rem] p-6 shadow-xl shadow-emerald-950/20">
            <div className="flex flex-col md:flex-row items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-2xl font-black text-white">
                {(connectedPartner.name || "?").substring(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 text-center md:text-right">
                <div className="flex items-center justify-center md:justify-start gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  <CheckCircle2 className="w-4 h-4" />
                  Connected
                </div>
                <h3 className="mt-1 text-2xl font-black text-white kurdish-text">
                  {connectedPartner.name}
                </h3>
                <p className="mt-1 flex items-center justify-center md:justify-start gap-2 text-xs text-emerald-300 font-mono">
                  {connectedPartner.code}
                  <CodeCopy code={connectedPartner.code} />
                </p>
                <p className="mt-2 text-xs text-gray-300 kurdish-text">
                  پەیوەندیەکە دروست بوو. ئێستا دەتوانیت بچیتە هەنگاوی فیلم و
                  فیلمێک بۆ بینین هەڵبژێریت.
                </p>
              </div>
              <button
                type="button"
                onClick={onNextToMovie}
                className="w-full md:w-auto px-7 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black text-sm font-black kurdish-text flex items-center justify-center gap-2 transition-all shadow-xl shadow-amber-500/15"
              >
                دواتر بۆ فیلم
                <Film className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {/* Start a session — only when no session is active yet */}
        {!state.sessionId && (
        <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-7 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center">
            <Play className="w-8 h-8 text-brand-primary" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white kurdish-text mb-1">
              دەستپێکردنی دانیشتن
            </h3>
            <p className="text-xs text-gray-500 kurdish-text leading-relaxed">
              دانیشتنێکی نوێ دەستپێبکە، کۆد/QR بۆ هاوڕێکەت بنێرە و چاوەڕوانی
              بکە تا بەشداری بکات
            </p>
          </div>
          <button
            onClick={onStart}
            disabled={busy || isParticipant}
            className="w-full py-4 bg-brand-primary hover:bg-red-700 text-white rounded-2xl font-black kurdish-text text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-red-600/20"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            دەستپێکردن
          </button>
          <p className="text-[9px] text-gray-600 kurdish-text">
            هەر دانیشتنێک دوو بەشداربووە — خانەخوێ و میوان
          </p>
        </div>
        )}

        {/* Join a session — hidden for participants (already inside the room) */}
        {!isParticipant && (
        <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-7 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <LogIn className="w-6 h-6 text-gray-300" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white kurdish-text">
                بەشداریکردن
              </h3>
              <p className="text-xs text-gray-500 kurdish-text">
                کۆد یان QR لە هاوڕێکەتەوە بنووسە
              </p>
            </div>
          </div>

          <div className="relative">
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onJoin()}
              placeholder="کۆد (وەک: CC-8291)"
              className={`w-full bg-black/40 border-2 rounded-2xl px-5 py-3.5 text-white font-mono text-sm outline-none transition-all ${
                joinError ? "border-red-500/60" : "border-white/10 focus:border-brand-primary"
              }`}
            />
            <button
              onClick={() => qrInputRef.current?.click()}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 bg-white/5 hover:bg-brand-primary hover:text-white text-gray-400 rounded-xl transition-all"
              title="سکانی QR"
            >
              <QrCode className="w-5 h-5" />
            </button>
            <input
              type="file"
              ref={qrInputRef}
              className="hidden"
              accept="image/*"
              onChange={onQRUpload}
            />
          </div>

          {joinError && (
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 kurdish-text">
              <AlertCircle className="w-3 h-3" />
              {joinError}
            </p>
          )}

          <button
            onClick={() => onJoin()}
            disabled={joinBusy || !joinInput.trim() || isParticipant}
            className="w-full py-4 bg-white/5 hover:bg-brand-primary/20 border border-white/10 text-white rounded-2xl font-black kurdish-text text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {joinBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            بەشداریکردن
          </button>

          {sessionWaiting && (
            <div className="flex items-center gap-2 text-[10px] text-gray-500 kurdish-text">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              دانیشتنێک چاوەڕێیە لەلایەن {state.host?.name}
            </div>
          )}
        </div>
        )}

        {/* Account status — with an account you can invite by code/phone and be
            invited; without one you can still join via code/QR */}
        <div className="md:col-span-2 bg-zinc-900 border border-white/10 rounded-[2rem] p-6">
          {accountLoading ? (
            <div className="flex flex-col md:flex-row items-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex-shrink-0" />
              <div className="flex-1 w-full space-y-2">
                <div className="h-4 rounded bg-white/10 w-40 mx-auto md:mx-0" />
                <div className="h-3 rounded bg-white/5 w-full max-w-md mx-auto md:mx-0" />
              </div>
            </div>
          ) : hasValidAccount ? (
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <UserCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1 text-center md:text-right">
                <h3 className="text-sm font-black text-white kurdish-text flex items-center justify-center md:justify-start gap-2">
                  هەژمارەکەت بەستراوە
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </h3>
                <p className="text-xs text-gray-400 kurdish-text mt-1 leading-relaxed">
                  {accountName || identity.name} ·{" "}
                  <span className="font-mono text-emerald-400">
                    {accountCode}
                  </span>{" "}
                  — بەکارهێنەرەکانی تر دەتوانن بەم کۆدە بانگهێشتت بکەن و تۆش
                  دەتوانیت بانگهێشتیان بکەیت
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-6 h-6 text-brand-primary" />
              </div>
              <div className="flex-1 text-center md:text-right">
                <h3 className="text-sm font-black text-white kurdish-text">
                  هەژمارت نییە؟
                </h3>
                <p className="text-xs text-gray-400 kurdish-text mt-1 leading-relaxed">
                  بە دروستکردنی هەژمار، بەکارهێنەرەکانی تر دەتوانن بە کۆدی CC-ID
                  یان ژمارەی مۆبایل بانگهێشتت بکەن — بانگهێشتەکان هەتا وەریان
                  نەگریت دەمێننەوە تەنانەت دوای ڕیفرێش
                </p>
              </div>
              <button
                type="button"
                onClick={onRequestAccount}
                className="flex-shrink-0 px-5 py-3 rounded-xl bg-brand-primary/20 hover:bg-brand-primary/40 border border-brand-primary/30 text-white text-xs font-black kurdish-text flex items-center gap-2 transition-all"
              >
                <UserPlus className="w-4 h-4" />
                دروستکردن یان بەستنەوەی هەژمار
              </button>
            </div>
          )}
        </div>

        {/* Host waiting panel (QR / safe link) */}
        {meIsHost && state.sessionState === SESSION_STATES.WAITING_FOR_PARTNER && (
          <div className="md:col-span-2 bg-zinc-900 border border-brand-primary/30 rounded-[2rem] p-7 flex flex-col md:flex-row items-center gap-8">
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-white rounded-3xl">
                <QRCodeSVG
                  value={safeLink}
                  size={168}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCopyLink}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[10px] font-black flex items-center gap-1.5 transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? "کۆپی کرا" : "لینک"}
                </button>
                <button
                  onClick={onCopyCode}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[10px] font-black flex items-center gap-1.5 transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? "کۆپی کرا" : "کۆد"}
                </button>
              </div>
            </div>
            <div className="flex-1 text-center md:text-right">
              <h3 className="text-xl font-black text-white kurdish-text mb-2 flex items-center justify-center md:justify-start gap-2">
                <QrCode className="w-5 h-5 text-brand-primary" />
                چاوەڕوانی هاوڕێکەت
              </h3>
              <p className="text-sm text-gray-400 kurdish-text mb-4">
                ئەم کۆدە بنێرە بۆ هاوڕێکەت یان لینکەکە لەگەڵیدا بەش بکە تا لە
                ژوورەکە بەشداری بکات:
              </p>
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-black/40 border border-white/10">
                <span className="font-mono text-2xl font-black tracking-[0.3em] text-white">
                  {state.joinCode}
                </span>
                <CodeCopy code={state.joinCode || ""} label />
                <span className="flex items-center gap-1.5 text-[9px] text-emerald-400 font-black">
                  <span className="animate-pulse">●</span> چاوەڕوانی
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Optional phone-number invite (UI contract — SMS not wired) */}
        {meIsHost && state.sessionState === SESSION_STATES.WAITING_FOR_PARTNER && (
          <div className="md:col-span-2">
            <FriendIdentityPanel
              identity={identity}
              state={state}
              hasAccount={hasValidAccount}
              accountLoading={accountLoading}
              accountName={accountName}
              accountCode={accountCode}
              onRequestAccount={onRequestAccount}
            />
          </div>
        )}

        {/* Real persisted invitation by account code (CC-ID) or phone — requires
            the host to have an account */}
        {meIsHost && state.sessionState === SESSION_STATES.WAITING_FOR_PARTNER && (
          <div className="md:col-span-2">
            <AccountInvitePanel
              identity={identity}
              state={state}
              hasAccount={hasValidAccount}
              accountLoading={accountLoading}
              accountName={accountName}
              accountCode={accountCode}
              onRequestAccount={onRequestAccount}
            />
          </div>
        )}

        {/* Friend request by CC-ID or mobile — real persisted 1-to-1 connection,
            available to every account user anywhere in the room */}
        {hasValidAccount && (
          <div className="md:col-span-2">
            <FriendRequestPanel
              identity={identity}
              hasAccount={hasValidAccount}
              accountLoading={accountLoading}
              accountName={accountName}
              accountCode={accountCode}
              onRequestAccount={onRequestAccount}
            />
          </div>
        )}

        {/* PAIRING panel — host approves the guest, guest waits */}
        {meIsHost && state.sessionState === SESSION_STATES.PAIRING && state.guest && (
          <div className="md:col-span-2 bg-zinc-900 border border-emerald-500/30 rounded-[2rem] p-7">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-white/5 border-2 border-emerald-500/40 flex items-center justify-center text-lg font-black text-white">
                  {(state.guest.name || "؟").substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white kurdish-text">
                    {state.guest.name}
                  </h3>
                  <p className="flex items-center gap-1.5 text-[10px] text-gray-500 font-mono">
                    {state.guest.code}
                    <CodeCopy code={state.guest.code} />
                  </p>
                  <p className="text-[10px] text-emerald-400 kurdish-text mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    داواکاری بەشداریکردنی نارد
                  </p>
                </div>
              </div>
              <div className="flex-1" />
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <ApprovalChip
                    label="پەسەندکردنی میوان"
                    approved={state.guestApproved}
                  />
                  <ApprovalChip
                    label="پەسەندکردنی تۆ (خانەخوێ)"
                    approved={state.hostApproved}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onApproveGuest}
                    disabled={state.hostApproved}
                    className="px-6 py-3.5 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-sm font-black kurdish-text flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <UserCheck className="w-4 h-4" />
                    {state.hostApproved ? "پەسەندکرا" : "پەسەندکردنی بەشداری"}
                  </button>
                  <button
                    onClick={onDeclineGuest}
                    disabled={state.hostApproved}
                    className="px-6 py-3.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 text-sm font-black kurdish-text transition-all disabled:opacity-40"
                  >
                    ڕەتکردنەوە
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Guest waiting panel — approval state visible live */}
        {meIsGuest && state.sessionState === SESSION_STATES.PAIRING && (
          <div className="md:col-span-2 bg-zinc-900 border border-white/10 rounded-[2rem] p-7 flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
              </span>
              <span className="text-sm font-black kurdish-text">
                داواکاری بەشداریکردن نێردرا
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ApprovalChip
                label="پەسەندکردنی تۆ (میوان)"
                approved={state.guestApproved}
              />
              <ApprovalChip
                label={`پەسەندکردنی ${state.host?.name || "خانەخوێ"}`}
                approved={state.hostApproved}
              />
            </div>
            {state.hostApproved ? (
              <p className="text-xs text-emerald-400 font-black kurdish-text">
                ✅ {state.host?.name || "خانەخوێ"} پەسەندت کرد — دەچیتە ژوورەکەوە
              </p>
            ) : (
              <p className="text-xs text-gray-400 kurdish-text">
                چاوەڕوانی پەسەندکردنی {state.host?.name} بە — دوای پەسەندکردن،
                فیلمێک هەڵبژێرن بۆ سەیرکردن پێکەوە
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const ApprovalChip = ({ label, approved }: { label: string; approved: boolean }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black ${
      approved
        ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
        : "bg-white/5 border border-white/10 text-gray-500"
    }`}
  >
    <CheckCircle2 className="w-3 h-3" />
    {label}: {approved ? "پەسەند" : "چاوەڕوان"}
  </span>
);

// Small copy control for any displayed CinemaChat code. Copies the exact current
// value passed in (never a stale/generated value), shows a "کۆپی کرا" feedback,
// and falls back to the legacy execCommand path so it works on mobile / embedded
// webviews where the async Clipboard API needs a secure context + user focus.
const CodeCopy = ({
  code,
  label = false,
  className = "",
}: {
  code: string;
  label?: boolean;
  className?: string;
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        /* clipboard unavailable */
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="کۆپی"
      aria-label="کۆپی"
      className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-gray-400 hover:text-white transition-all flex-shrink-0 ${className}`}
    >
      {copied ? (
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {label && (
        <span
          className={`text-[9px] font-black kurdish-text ${
            copied ? "text-emerald-400" : ""
          }`}
        >
          {copied ? "کۆپی کرا" : "کۆپی"}
        </span>
      )}
    </button>
  );
};

const extractInviteIdentity = (raw: string): string => {
  const value = (raw || "").trim();
  if (!value) return "";
  if (value.startsWith("cinemachat://cinema-room")) {
    const params = new URLSearchParams(value.split("?")[1] || "");
    return params.get("code") || value;
  }
  try {
    const url = new URL(value);
    return url.searchParams.get("code") || url.searchParams.get("user") || value;
  } catch {
    return value;
  }
};

const FriendIdentityPanel = ({
  identity,
  state,
  hasAccount,
  accountLoading,
  accountName,
  accountCode,
  onRequestAccount,
}: {
  identity: CinemaChatParticipant;
  state: CinemaChatRoomState;
  hasAccount: boolean;
  accountLoading: boolean;
  accountName?: string;
  accountCode?: string;
  onRequestAccount?: () => void;
}) => {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<Awaited<ReturnType<typeof resolveInviteTarget>>>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "resolving" | "found" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [showBarcode, setShowBarcode] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [method, setMethod] = useState<"scan" | "upload" | "phone">("scan");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const qrImageInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const myCode = accountCode || identity.code;
  const myProfile = useMemo<SocialUser>(
    () => ({
      uid: identity.id,
      name: accountName || identity.name,
      phone: "",
      uniqueCode: myCode,
      avatarUrl: identity.avatarUrl,
    }),
    [accountName, identity.avatarUrl, identity.id, identity.name, myCode],
  );
  const maskedPhone = maskInvitePhone(target?.phone);
  const presenceStatus = presenceLoading ? "checking" : target?.presenceStatus || "offline";
  const presenceClass =
    presenceStatus === "online"
      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
      : presenceStatus === "offline"
        ? "bg-white/5 border-white/10 text-gray-400"
        : "bg-amber-400/10 border-amber-400/25 text-amber-300";
  const canSendInvite = hasAccount && !!state.sessionId && !!state.joinCode;

  const chooseAnother = () => {
    stopCamera();
    setInput("");
    setTarget(null);
    setPresenceLoading(false);
    setStatus("idle");
    setMessage(null);
  };

  useEffect(() => {
    if (!target?.uid) {
      setPresenceLoading(false);
      return;
    }
    setPresenceLoading(true);
    const unsub = subscribeInviteTargetPresence(
      target.uid,
      (presence) => {
        setTarget((current) =>
          current && current.uid === target.uid ? { ...current, ...presence } : current,
        );
        setPresenceLoading(false);
      },
      () => {
        setPresenceLoading(false);
      },
    );
    return unsub;
  }, [target?.uid]);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setStatus((current) => (current === "scanning" ? "idle" : current));
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const resolveFriend = useCallback(
    async (rawValue: string) => {
      const lookup =
        method === "phone"
          ? normalizeInvitePhoneInput(rawValue)
          : extractInviteIdentity(rawValue);
      if (method === "phone") {
        const phoneError = validateInvitePhoneInput(lookup);
        if (phoneError) {
          setTarget(null);
          setStatus("error");
          setMessage(phoneError);
          setInput(formatInvitePhoneInput(lookup));
          return;
        }
      }
      if (!lookup) {
        setTarget(null);
        setStatus("error");
        setMessage("کۆد، ژمارە یان QR ـێکی دروست بنووسە");
        return;
      }

      setInput(method === "phone" ? formatInvitePhoneInput(lookup) : lookup);
      setTarget(null);
      setStatus("resolving");
      setMessage(null);
      try {
        const found = await resolveInviteTarget(lookup);
        if (!found) {
          setStatus("error");
          setMessage("هیچ ئەکاونتێک بەو کۆد/ژمارەیە نەدۆزرایەوە");
          return;
        }
        if (
          normalizeJoinCode(found.uniqueCode) === normalizeJoinCode(myCode) ||
          found.uid === identity.id
        ) {
          setStatus("error");
          setMessage("ئەم بارکۆدە هی خۆتە؛ بارکۆد یان ژمارەی هاوڕێکەت بەکاربهێنە");
          return;
        }
        setPresenceLoading(true);
        setTarget(found);
        setStatus("found");
        setMessage("هاوڕێکەت دۆزرایەوە؛ هەنگاوی داهاتوو ناردنی بانگهێشتە");
      } catch {
        setStatus("error");
        setMessage("دۆزینەوە سەرکەوتوو نەبوو؛ دووبارە هەوڵبدە");
      }
    },
    [identity.id, method, myCode],
  );

  const decodeImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) void resolveFriend(code.data);
        else {
          setTarget(null);
          setStatus("error");
          setMessage("لە وێنەکەدا QR/بارکۆدی خوێندراو نەدۆزرایەوە");
        }
      };
      img.src = String(event.target?.result || "");
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setMessage("کامێرای browser لەم ئامێرەدا بەردەست نییە");
      return;
    }
    setTarget(null);
    setMessage(null);
    setStatus("scanning");
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const scan = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && canvas && ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            stopCamera();
            void resolveFriend(code.data);
            return;
          }
        }
        frameRef.current = window.requestAnimationFrame(scan);
      };
      scan();
    } catch {
      stopCamera();
      setStatus("error");
      setMessage("ڕێگەدان بە کامێرا نەدرا یان کامێرا نەدۆزرایەوە");
    }
  };

  const handleSendInvitation = async () => {
    if (!target || inviteBusy) return;
    if (!hasAccount) {
      setStatus("error");
      setMessage("بۆ ناردنی بانگهێشت پێویستە ئەکاونتی CinemaChat هەبێت");
      onRequestAccount?.();
      return;
    }
    if (!canSendInvite) {
      setStatus("error");
      setMessage("یەکەم session ـی CinemaChat دەست پێبکە تا بتوانیت بانگهێشت بنێریت");
      return;
    }
    setInviteBusy(true);
    setStatus("resolving");
    setMessage(null);
    try {
      const { duplicate } = await sendCinemaChatInvitation({ identity, target, state });
      setStatus("found");
      setMessage(
        duplicate
          ? `بانگهێشت پێشتر نێردراوە بۆ ${target.name}`
          : `بانگهێشت نێردرا بۆ ${target.name}`,
      );
    } catch {
      setStatus("error");
      setMessage("ناردنی بانگهێشت سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە");
    } finally {
      setInviteBusy(false);
    }
  };

  if (target) {
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-5" dir="rtl">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-black text-white kurdish-text">
              هاوڕێکەت دۆزرایەوە
            </h3>
            <p className="text-[11px] text-gray-500 kurdish-text mt-1">
              پێش ناردنی بانگهێشت دڵنیابە ئەمە هەمان کەسە.
            </p>
          </div>
          <BadgeCheck className="w-6 h-6 text-emerald-400 flex-shrink-0" />
        </div>

        <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-white text-lg font-black overflow-hidden">
            {target.avatarUrl ? (
              <img
                src={target.avatarUrl}
                alt={target.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              (target.name || "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-white kurdish-text truncate">
              {target.name}
            </p>
            <p className="text-[11px] text-emerald-300 font-mono truncate">
              {target.uniqueCode}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {maskedPhone && (
                <span className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-[10px] text-gray-300 font-mono">
                  {maskedPhone}
                </span>
              )}
              <span className={`px-2 py-1 rounded-lg border text-[10px] font-bold kurdish-text ${presenceClass}`}>
                {presenceLoading ? "Checking status..." : target.presenceLabel || "Offline"}
              </span>
            </div>
          </div>
        </div>

        {message && (
          <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-amber-400 kurdish-text">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {message}
          </p>
        )}

        <div className="hidden">
          <button
            type="button"
            onClick={() =>
              setMessage("ناردنی بانگهێشت و چاوەڕوانی وەڵام لە Milestone 2 دەبەسترێتەوە.")
            }
            className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all"
          >
            <Send className="w-4 h-4" />
            SEND INVITATION
          </button>
          <button
            type="button"
            onClick={chooseAnother}
            className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black kurdish-text transition-all"
          >
            CHOOSE ANOTHER PERSON
          </button>
        </div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleSendInvitation}
            disabled={inviteBusy || !canSendInvite}
            className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {inviteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            SEND INVITATION
          </button>
          <button
            type="button"
            disabled
            title={
              presenceStatus === "online"
                ? "Voice call لە Milestone 2 چالاک دەکرێت"
                : "Voice call تەنها کاتێک چالاک دەبێت کە هاوڕێکەت Online بێت"
            }
            className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-gray-500 text-xs font-black kurdish-text flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <Phone className="w-4 h-4" />
            VOICE CALL
          </button>
          <button
            type="button"
            onClick={chooseAnother}
            className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black kurdish-text transition-all sm:col-span-2"
          >
            CHOOSE ANOTHER PERSON
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-5" dir="rtl">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-black text-white kurdish-text">
                Invite a Friend
              </h3>
              <p className="text-[11px] text-gray-500 kurdish-text mt-1">
                یەک ڕێگا هەڵبژێرە: سکانی QR، وێنەی QR، یان ژمارەی مۆبایل.
              </p>
            </div>
            <ScanLine className="w-5 h-5 text-brand-primary flex-shrink-0" />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { id: "scan" as const, label: "Scan QR", icon: Camera },
              { id: "upload" as const, label: "Upload QR", icon: ImageUp },
              { id: "phone" as const, label: "Phone", icon: Phone },
            ].map((item) => {
              const Icon = item.icon;
              const active = method === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setMethod(item.id);
                    setMessage(null);
                    setStatus("idle");
                  }}
                  className={`min-h-[72px] rounded-2xl border flex flex-col items-center justify-center gap-2 text-[10px] font-black transition-all ${
                    active
                      ? "bg-brand-primary text-white border-brand-primary shadow-lg shadow-red-600/20"
                      : "bg-black/30 text-gray-400 border-white/10 hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {method === "scan" && (
            <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white kurdish-text">سکانی زیندووی QR</p>
                  <p className="text-[10px] text-gray-500 kurdish-text mt-1">
                    کامێرا دەکرێتەوە و دوای دۆزینەوەی کۆد خۆکار دادەخرێت.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cameraActive ? stopCamera : startCamera}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[11px] font-black kurdish-text flex items-center gap-2 transition-all"
                >
                  <Camera className="w-4 h-4" />
                  {cameraActive ? "Cancel" : "Open Camera"}
                </button>
              </div>
              {cameraActive && (
                <div className="mt-3 overflow-hidden rounded-2xl border border-brand-primary/30 bg-black">
                  <video ref={videoRef} muted playsInline className="w-full max-h-64 object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}
            </div>
          )}

          {method === "upload" && (
            <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
              <button
                type="button"
                onClick={() => qrImageInputRef.current?.click()}
                className="w-full min-h-[120px] rounded-2xl border border-dashed border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 flex flex-col items-center justify-center gap-3 transition-all"
              >
                <ImageUp className="w-7 h-7 text-brand-primary" />
                <span className="text-xs font-black kurdish-text">وێنەی QR هەڵبژێرە</span>
                <span className="text-[10px] text-gray-500 kurdish-text">
                  QR لە ناو وێنەکەدا client-side دەخوێندرێتەوە.
                </span>
              </button>
              <input
                ref={qrImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) decodeImageFile(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          )}

          {method === "phone" && (
            <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
              <label className="text-[10px] text-gray-500 font-black kurdish-text">
                ژمارەی مۆبایلی هاوڕێکەت
              </label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <div className="relative">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={input}
                    onChange={(e) => {
                      setInput(formatInvitePhoneInput(e.target.value));
                      setMessage(null);
                      setStatus("idle");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && resolveFriend(input)}
                    placeholder="0770 000 0000"
                    dir="ltr"
                    className="w-full bg-black/50 border-2 border-white/10 focus:border-brand-primary rounded-2xl px-4 py-3 pl-11 text-white text-sm font-mono outline-none transition-all"
                  />
                  {input && (
                    <button
                      type="button"
                      onClick={() => {
                        setInput("");
                        setTarget(null);
                        setMessage(null);
                        setStatus("idle");
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/15 text-gray-300 flex items-center justify-center"
                      title="پاککردنەوە"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => resolveFriend(input)}
                  disabled={status === "resolving" || !input.trim()}
                  className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {status === "resolving" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  دۆزینەوە
                </button>
              </div>
            </div>
          )}

          {message && (
            <p
              className={`mt-3 flex items-center gap-2 text-[11px] font-bold kurdish-text ${
                status === "found" ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {status === "found" ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {message}
            </p>
          )}
        </div>

        <div className="lg:w-64 flex flex-col gap-2">
          {!accountLoading && !hasAccount && (
            <button
              type="button"
              onClick={onRequestAccount}
              className="w-full px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              CREATE ACCOUNT
            </button>
          )}
          {accountLoading && (
            <div className="h-11 rounded-2xl bg-white/10 border border-white/10 animate-pulse" />
          )}
          {!accountLoading && hasAccount && (
            <button
              type="button"
              onClick={() => setShowBarcode((v) => !v)}
              className="w-full px-4 py-3 rounded-2xl bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all"
            >
              <QrCode className="w-4 h-4" />
              SHOW MY QR
            </button>
          )}
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <p className="text-[10px] text-gray-500 kurdish-text">ناسنامەی تۆ</p>
            <p className="mt-1 text-xs text-white font-black kurdish-text truncate">
              {accountName || identity.name}
            </p>
            <p className="mt-1 text-[10px] text-brand-primary font-mono truncate">
              {myCode}
            </p>
          </div>
          {!accountLoading && !hasAccount && (
            <p className="text-[10px] text-gray-500 kurdish-text leading-relaxed">
              بۆ وەرگرتنی بانگهێشتی ڕاستەوخۆ، ئەکاونتێک دروست بکە یان بچۆ ژوورەوە.
            </p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showBarcode && hasAccount && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <ProfileCard user={myProfile} onClose={() => setShowBarcode(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-5" dir="rtl">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-black text-white kurdish-text">
                هاوڕێکەت بدۆزەوە
              </h3>
              <p className="text-[11px] text-gray-500 kurdish-text mt-1">
                بە بارکۆد، وێنەی QR، کۆدی ئەکاونت، یان ژمارەی مۆبایل.
              </p>
            </div>
            <ScanLine className="w-5 h-5 text-brand-primary flex-shrink-0" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <input
                type="text"
                inputMode="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setMessage(null);
                  setTarget(null);
                  setStatus("idle");
                }}
                onKeyDown={(e) => e.key === "Enter" && resolveFriend(input)}
                placeholder="CC-CC-9803 یان 0750..."
                className="w-full bg-black/40 border-2 border-white/10 focus:border-brand-primary rounded-2xl px-4 py-3 text-white text-sm font-mono outline-none transition-all"
              />
              {status === "resolving" && (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-primary animate-spin" />
              )}
            </div>
            <button
              type="button"
              onClick={() => resolveFriend(input)}
              disabled={status === "resolving" || !input.trim()}
              className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              دۆزینەوە
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[11px] font-black kurdish-text flex items-center justify-center gap-2 transition-all"
            >
              <Camera className="w-4 h-4" />
              {cameraActive ? "وەستاندنی کامێرا" : "سکانی زیندوو"}
            </button>
            <button
              type="button"
              onClick={() => qrImageInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[11px] font-black kurdish-text flex items-center justify-center gap-2 transition-all"
            >
              <ImageUp className="w-4 h-4" />
              وێنەی QR
            </button>
            <input
              ref={qrImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) decodeImageFile(file);
                e.currentTarget.value = "";
              }}
            />
          </div>

          {cameraActive && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-brand-primary/30 bg-black">
              <video ref={videoRef} muted playsInline className="w-full max-h-56 object-cover" />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {message && (
            <p
              className={`mt-3 flex items-center gap-2 text-[11px] font-bold kurdish-text ${
                status === "found" ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {status === "found" ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {message}
            </p>
          )}

          {target && (
            <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-white font-black">
                {(target.name || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-white kurdish-text truncate">
                  {target.name}
                </p>
                <p className="text-[10px] text-emerald-300 font-mono truncate">
                  {target.uniqueCode || target.phone}
                </p>
              </div>
              <BadgeCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            </div>
          )}
        </div>

        <div className="lg:w-64 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRequestAccount}
            className="w-full px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            دروستکردنی ئەکاونت
          </button>
          <button
            type="button"
            onClick={() => setShowBarcode((v) => !v)}
            className="w-full px-4 py-3 rounded-2xl bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all"
          >
            <QrCode className="w-4 h-4" />
            بارکۆدی من
          </button>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <p className="text-[10px] text-gray-500 kurdish-text">ناسنامەی تۆ</p>
            <p className="mt-1 text-xs text-white font-black kurdish-text truncate">
              {accountName || identity.name}
            </p>
            <p className="mt-1 text-[10px] text-brand-primary font-mono truncate">
              {myCode}
            </p>
          </div>
          {!hasAccount && (
            <p className="text-[10px] text-gray-500 kurdish-text leading-relaxed">
              بۆ وەرگرتنی بانگهێشتی ڕاستەوخۆ، ئەکاونتێک دروست بکە یان بە ئەکاونتەکەت
              بچۆ ژوورەوە.
            </p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showBarcode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <ProfileCard user={myProfile} onClose={() => setShowBarcode(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PhoneInvitePanel = ({ code, safeLink }: { code: string; safeLink: string }) => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const phoneValid = /^[+\d][\d\s\-()]{6,19}$/.test(phone.trim());

  const handleCopy = async () => {
    const text = buildPhoneInviteText(code, safeLink);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("کۆپیکردن سەرکەوتوو نەبوو — دەسەڵاتی کلیپبۆرد بپشکنە");
    }
  };

  const handleSend = () => {
    if (!phoneValid) {
      setCopyError("ژمارەکە دروست نییە");
      return;
    }
    setCopyError(PHONE_INVITE_NOT_CONFIGURED);
  };

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-right"
      >
        <span className="flex items-center gap-2 text-sm font-black text-gray-300 kurdish-text">
          <Phone className="w-4 h-4 text-brand-primary" />
          بانگهێشتکردن بە ژمارەی مۆبایل
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setCopyError(null);
            }}
            placeholder="بۆ نموونە: +964 750 000 0000"
            className="w-full bg-black/40 border-2 border-white/10 focus:border-brand-primary rounded-2xl px-5 py-3 text-white text-sm font-mono outline-none transition-all"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black flex items-center gap-1.5 transition-all"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "کۆپی کرا" : "کۆپی دەقی بانگهێشت"}
            </button>
            <button
              onClick={handleSend}
              className="px-4 py-2.5 rounded-xl bg-brand-primary/20 hover:bg-brand-primary/40 border border-brand-primary/30 text-white text-xs font-black flex items-center gap-1.5 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              ناردن
            </button>
          </div>
          {copyError && (
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 kurdish-text">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {copyError}
            </p>
          )}
          <p className="text-[9px] text-gray-600 kurdish-text leading-relaxed">
            دەقی بانگهێشتیش لەسەر شاشەکەت کۆپی دەکرێت و دەتوانیت لە
            ئەپەکەکانەوە (واتسئەپ، تێلیگرام...) بنێریت. ناردنی ڕاستەوخۆی
            SMS پێویستی بە ڕێکخستنی سێرڤەرە — ژمارەکەت لە هیچ شوێنێک
            هەڵناگیرێت.
          </p>
        </div>
      )}
    </div>
  );
};

// Real persisted host→guest invitation panel. The host types the recipient's
// account code (CC-ID) or phone; the recipient must be a REGISTERED account
// user (resolved from the users collection) to receive the invitation, which is
// persisted in Firestore (kind: "cinemachat") and survives refresh/rejoin. A
// host without an account is prompted to create/connect one so they become
// able to invite. The guest copy-code path remains available in the panel above.
const AccountInvitePanel = ({
  identity,
  state,
  hasAccount,
  accountLoading,
  accountName,
  accountCode,
  onRequestAccount,
}: {
  identity: CinemaChatParticipant;
  state: CinemaChatRoomState;
  hasAccount: boolean;
  accountLoading: boolean;
  accountName?: string;
  accountCode?: string;
  onRequestAccount?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<
    "idle" | "resolving" | "sending" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  const canInvite = hasAccount && !accountLoading;

  const handleSend = async () => {
    const raw = input.trim();
    if (!raw) {
      setStatus("error");
      setMessage("کۆد یان ژمارەی مۆبایل بنووسە");
      return;
    }
    setStatus("resolving");
    setMessage(null);
    try {
      const target = await resolveInviteTarget(raw);
      if (!target) {
        setStatus("error");
        setMessage(
          "هیچ بەکارهێنەرێک بەم کۆدە یان ژمارەیە نەدۆزرایەوە — بەکارهێنەرەکە دەبێت هەژماری هەبێت",
        );
        return;
      }
      setStatus("sending");
      const { duplicate } = await sendCinemaChatInvitation({
        identity,
        target,
        state,
      });
      setStatus("done");
      setMessage(
        duplicate
          ? `بانگهێشتەکە پێشتر نێردراوە بۆ ${target.name} (${target.uniqueCode}) — چاوەڕوانی وەرگرتنەکەی بکە`
          : `بانگهێشت نێردرا بۆ ${target.name} (${target.uniqueCode})`,
      );
      setInput("");
    } catch {
      setStatus("error");
      setMessage("ناردنی بانگهێشت سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
    }
  };

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-5">
      <button
        type="button"
        onClick={() => {
          if (accountLoading) return;
          if (!canInvite) {
            onRequestAccount?.();
            return;
          }
          setOpen((v) => !v);
        }}
        disabled={accountLoading}
        className="w-full flex items-center justify-between gap-3 text-right disabled:opacity-60"
      >
        <span className="flex items-center gap-2 text-sm font-black text-gray-300 kurdish-text">
          <UserPlus className="w-4 h-4 text-brand-primary" />
          بانگهێشتکردن بە هەژمار
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {accountLoading && (
        <div className="mt-4 h-10 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
      )}

      {!accountLoading && !canInvite && (
        <p className="mt-4 text-[10px] text-gray-500 kurdish-text leading-relaxed">
          بۆ بانگهێشتکردنی بەکارهێنەر بە کۆد یان ژمارە پێویستە هەژمارێک
          هەبێت. کرتە لە سەرەوە بکە بۆ دروستکردن یان بەستنەوەی هەژمار.
        </p>
      )}

      {open && canInvite && (
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="text"
            inputMode="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setMessage(null);
              setStatus("idle");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="کۆدی هەژمار (CC-8291) یان ژمارەی مۆبایل"
            className="w-full bg-black/40 border-2 border-white/10 focus:border-brand-primary rounded-2xl px-5 py-3 text-white text-sm font-mono outline-none transition-all"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSend}
              disabled={status === "resolving" || status === "sending"}
              className="px-4 py-2.5 rounded-xl bg-brand-primary/20 hover:bg-brand-primary/40 border border-brand-primary/30 text-white text-xs font-black flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {status === "resolving" || status === "sending" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              ناردنی بانگهێشت
            </button>
            <span className="inline-flex items-center gap-1 text-[9px] text-gray-500 font-mono">
              <AtSign className="w-3 h-3" />
              {accountName || identity.name} · {accountCode || identity.code}
            </span>
          </div>
          {message && (
            <p
              className={`flex items-center gap-1.5 text-[10px] font-bold kurdish-text ${
                status === "error" ? "text-red-400" : "text-emerald-400"
              }`}
            >
              <AlertCircle className="w-3 h-3 shrink-0" />
              {message}
            </p>
          )}
          <p className="text-[9px] text-gray-600 kurdish-text leading-relaxed">
            بانگهێشتەکە بە تەواوی لە فایریستۆر دەپارێزرێت و بۆ وەرگرەکە وەک
            ئاگادارکردنەوە دەردەکەوێت — دەتوانێت لە هەر شوێنێکبێت قبوڵی بکات.
          </p>
        </div>
      )}
    </div>
  );
};

// Friend-request panel (Chat Rooms Part 1-2-3): lets an account user send a
// real, persisted 1-to-1 friend request to any other account by CC-ID or mobile
// number. Requests live in Firestore's friend_connections/{pairKey}, so the
// recipient sees them anywhere in the app and the pair is impossible to
// duplicate. Presence (online/offline) notifications for accepted friends are
// handled globally by FriendPresenceNotification.
const FriendRequestPanel = ({
  identity,
  hasAccount,
  accountLoading,
  accountName,
  accountCode,
  onRequestAccount,
}: {
  identity: CinemaChatParticipant;
  hasAccount: boolean;
  accountLoading: boolean;
  accountName?: string;
  accountCode?: string;
  onRequestAccount?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<
    "idle" | "resolving" | "sending" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  const canSend = hasAccount && !accountLoading;

  const handleSend = async () => {
    const raw = input.trim();
    if (!raw) {
      setStatus("error");
      setMessage("CC-ID یان ژمارەی مۆبایل بنووسە");
      return;
    }
    setStatus("resolving");
    setMessage(null);
    try {
      const target = await searchAccountByCCIdOrContact(raw);
      if (!target) {
        setStatus("error");
        setMessage(
          "هیچ بەکارهێنەرێک بەم CC-ID یان ژمارەیە نەدۆزرایەوە — بەکارهێنەرەکە دەبێت هەژماری هەبێت",
        );
        return;
      }
      if (target.uid === identity.id) {
        setStatus("error");
        setMessage("ناتوانیت بۆ خۆت داواکاری هاوڕێیەتی بنێریت");
        return;
      }
      setStatus("sending");
      const { duplicate } = await createFriendConnection({
        requesterUid: identity.id,
        requesterName: accountName || identity.name,
        requesterCode: accountCode || identity.code,
        requesterAvatar: identity.avatarUrl || null,
        target,
      });
      setStatus("done");
      setMessage(
        duplicate
          ? `داواکارییەکە پێشتر بۆ ${target.name} (${target.uniqueCode}) نێردراوە — چاوەڕوانی وەرگرتنەکەی بکە`
          : `داواکاری هاوڕێیەتی نێردرا بۆ ${target.name} (${target.uniqueCode})`,
      );
      setInput("");
    } catch {
      setStatus("error");
      setMessage("ناردنی داواکاری سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
    }
  };

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-5">
      <button
        type="button"
        onClick={() => {
          if (accountLoading) return;
          if (!canSend) {
            onRequestAccount?.();
            return;
          }
          setOpen((v) => !v);
        }}
        disabled={accountLoading}
        className="w-full flex items-center justify-between gap-3 text-right disabled:opacity-60"
      >
        <span className="flex items-center gap-2 text-sm font-black text-gray-300 kurdish-text">
          <UserPlus className="w-4 h-4 text-brand-primary" />
          داواکاری هاوڕێیەتی بە CC-ID یان ژمارەی مۆبایل
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {accountLoading && (
        <div className="mt-4 h-10 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
      )}

      {!accountLoading && !canSend && (
        <p className="mt-4 text-[10px] text-gray-500 kurdish-text leading-relaxed">
          بۆ ناردنی داواکاری هاوڕێیەتی بە CC-ID یان ژمارە پێویستە هەژمارێک
          هەبێت. کرتە لە سەرەوە بکە بۆ دروستکردن یان بەستنەوەی هەژمار.
        </p>
      )}

      {open && canSend && (
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="text"
            inputMode="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setMessage(null);
              setStatus("idle");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="CC-ID (CC-8291) یان ژمارەی مۆبایل"
            className="w-full bg-black/40 border-2 border-white/10 focus:border-brand-primary rounded-2xl px-5 py-3 text-white text-sm font-mono outline-none transition-all"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSend}
              disabled={status === "resolving" || status === "sending"}
              className="px-4 py-2.5 rounded-xl bg-brand-primary/20 hover:bg-brand-primary/40 border border-brand-primary/30 text-white text-xs font-black flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {status === "resolving" || status === "sending" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              ناردنی داواکاری
            </button>
            <span className="inline-flex items-center gap-1 text-[9px] text-gray-500 font-mono">
              <AtSign className="w-3 h-3" />
              {accountName || identity.name} · {accountCode || identity.code}
            </span>
          </div>
          {message && (
            <p
              className={`flex items-center gap-1.5 text-[10px] font-bold kurdish-text ${
                status === "error" ? "text-red-400" : "text-emerald-400"
              }`}
            >
              <AlertCircle className="w-3 h-3 shrink-0" />
              {message}
            </p>
          )}
          <p className="text-[9px] text-gray-600 kurdish-text leading-relaxed">
            داواکارییەکە بە تەواوی لە فایریستۆر دەپارێزرێت و بۆ وەرگرەکە وەک
            ئاگادارکردنەوە دەردەکەوێت — دوای پەسەندکردن دەتوانن لە هەر کاتێکدا
            پەیوەندی پێکەوە بکەن.
          </p>
        </div>
      )}
    </div>
  );
};
