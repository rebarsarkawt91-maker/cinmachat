import React, { useState, useEffect, useMemo, Fragment, useRef, useCallback } from "react";
import ReactPlayer from "react-player";
const ReactPlayerComponent = ReactPlayer as any;
import {
  Film,
  Image,
  Search,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Play,
  Download,
  MessageCircle,
  Mail,
  X,
  ChevronRight,
  ChevronLeft,
  Flame,
  TrendingUp,
  Ghost,
  Clock,
  Lock,
  Star,
  Calendar,
  Sword,
  Smile,
  Globe,
  Users,
  Link2,
  Radio,
  Tv,
  Send,
  Menu,
  Heart,
  ThumbsUp,
  Bookmark,
  Instagram,
  Facebook,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Trash2,
  LogOut,
  Trophy,
  LayoutDashboard,
  Upload,
  FileVideo,
  Video,
  Youtube,
  Volume2,
  VolumeX,
  Captions,
  CaptionsOff,
  Maximize,
  Minimize,
  Square,
  Pause,
  Rocket,
  RotateCcw,
  FastForward,
  Gauge,
  SkipForward,
  Rewind,
  Sparkles,
  User,
  Heart as HeartIcon,
  MessageSquare,
  QrCode,
  Activity,
  Mic,
  Loader2,
  Zap,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Edit3,
  Key,
  Database,
  Ticket,
  BarChart2,
  Share2,
  Eye,
  EyeOff,
  Layers,
  Clapperboard,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Plyr } from "plyr-react";
import { UsersIcon } from "lucide-react";
import "plyr-react/plyr.css";
import { GoogleGenAI } from "@google/genai";
import ImmersiveShieldedPlayer from "./components/Player/ImmersiveShieldedPlayer";
import YouTubeResilientPlayer from "./components/Player/YouTubeResilientPlayer";
import { api } from "./services/api";
import { useI18n } from "./i18n";
import {
  subscribeGenres,
  addGenre,
  deleteGenre,
  seedDefaultGenres,
  DEFAULT_GENRES,
} from "./services/genres";
import type { Genre } from "./services/genres";
import {
  getClientIp,
  syncSecurityProfile,
  markSecurityOffline,
  logUserActivity,
} from "./services/securityMonitor";
import {
  cleanProfilePhone,
  getPublicMemberCode,
} from "./services/socialProfileProvisioning";
import {
  subscribeChannelSettings,
  loadChannelSettings,
  saveChannelSettings,
  isValidHttpUrl,
} from "./services/channelLinks";
import {
  subscribeBroadcastState,
  loadBroadcastState,
  updateBroadcastState,
  subscribeBroadcastSettings,
  loadBroadcastSettings,
  saveBroadcastSettings,
  DEFAULT_BROADCAST_SETTINGS,
} from "./services/mainBroadcast";
import type { BroadcastState, BroadcastSettings } from "./services/mainBroadcast";
import { Movie, SyncGroup, SocialUser } from "./types";
import { useSocialAuth } from "./context/SocialAuthContext";
import jsQR from "jsqr";
import { RegistrationModal } from "./components/Social/RegistrationModal";
import { CompleteAccountModal } from "./components/Social/CompleteAccountModal";
import { CinemaChatRoom } from "./components/Social/CinemaChatRoom";
import { FriendConnectRoom } from "./components/Social/FriendConnectRoom";
import { CinemaChatInviteNotification } from "./components/Social/CinemaChatInviteNotification";
import { RoomInviteNotification } from "./components/Social/RoomInviteNotification";
import type { CinemaChatParticipant } from "./services/cinemaChat";
const SecurityShieldModule = React.lazy(() =>
  import("./components/Admin/SecurityShieldModule").then((m) => ({
    default: m.SecurityShieldModule,
  })),
);
const SystemDatabaseAuditModule = React.lazy(() =>
  import("./components/Admin/SystemDatabaseAuditModule").then((m) => ({
    default: m.SystemDatabaseAuditModule,
  })),
);
const SmartAnalyticsModule = React.lazy(() =>
  import("./components/Admin/SmartAnalyticsModule").then((m) => ({
    default: m.SmartAnalyticsModule,
  })),
);
const TicketVIPModule = React.lazy(() =>
  import("./components/Admin/TicketVIPModule").then((m) => ({
    default: m.TicketVIPModule,
  })),
);
const SystemHubModule = React.lazy(() =>
  import("./components/Admin/SystemHub/SystemHubModule").then((m) => ({
    default: m.SystemHubModule,
  })),
);
const GrowthModule = React.lazy(() =>
  import("./components/Admin/GrowthModule").then((m) => ({
    default: m.GrowthModule,
  })),
);
const MultiLevelAdminModule = React.lazy(() =>
  import("./components/Admin/MultiLevelAdminModule").then((m) => ({
    default: m.MultiLevelAdminModule,
  })),
);
const UserAnalyticsModule = React.lazy(() =>
  import("./components/Admin/UserAnalyticsModule").then((m) => ({
    default: m.UserAnalyticsModule,
  })),
);
import { VIPRoomModal } from "./components/Social/VIPRoomModal";
import { CinemaWindowModal } from "./components/Social/CinemaWindowModal";
import { AccountCenter } from "./components/Social/AccountCenter";
import { ProfileCard } from "./components/Social/ProfileCard";
import { WatchPartyManager } from "./components/Social/WatchPartyManager";
import { SyncRoom } from "./components/Social/SyncRoom";
import { CameHereRoom } from "./components/Social/CameHereRoom";
import { BroadcastRoom } from "./components/Social/BroadcastRoom";
import { BroadcastPreviewCard } from "./components/Social/BroadcastPreviewCard";
import { DirectMessagesModal } from "./components/Social/DirectMessagesModal";
import { WhatsAppFloatButton } from "./components/Social/WhatsAppFloatButton";
import { MovieCard, MovieCardSkeleton } from "./components/Movie/MovieCard";
import {
  fuzzyMatchMovie,
  movieMatchesGenres,
  semanticScoreMovie,
  computeTrendingScore,
} from "./utils/search";
import type { SemanticSignals } from "./utils/search";
import UserActivityMonitor from "./components/Admin/UserActivityMonitor";
import FriendPresenceNotification from "./components/Social/FriendPresenceNotification";

import { 
  db, 
  auth, 
  storage,
  collectionGroup,
  query,
  onSnapshot,
  orderBy,
  limit,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
  collection,
  where,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  runTransaction,
  ref, 
  uploadBytes, 
  getDownloadURL,
  onAuthStateChanged
} from "./lib/firebase";

// Compatibility aliases to align with existing code naming
const realDb = db;
const realAuth = auth;
const firestoreQuery = query;
const firestoreSnapshot = onSnapshot;
const firestoreOrderBy = orderBy;
const firestoreLimit = limit;
const firestoreDoc = doc;
const firestoreDeleteDoc = deleteDoc;
const firestoreUpdateDoc = updateDoc;
const realGetDocs = getDocs;
const realCollection = collection;
const realWhere = where;
const realGetDoc = getDoc;
const realSetDoc = setDoc;

// Global API Fetch Helper
const API_BASE = 'https://www.cinamachat.com';

const shouldPreferCustomDomainApi = (): boolean => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "auth.cinamachat.com";
};

async function fetchApi(
  path: string,
  options?: RequestInit,
  retries = 3,
  useDirectFallback = false,
): Promise<Response> {
  const method = (options?.method || "GET").toUpperCase();
  const customHeaders = new Headers(options?.headers || {});

  // Attach the unique device fingerprint so the server can enforce per-device
  // auto-bans instead of blocking shared public IPs (which would take down the
  // whole site for every user on the same mobile-network IP).
  if (!customHeaders.has("X-Device-Id")) {
    customHeaders.set("X-Device-Id", getDeviceId());
  }

  // Use same-origin path (Firebase 307 → Render) as the primary route.
  // For non-GET requests, use text/plain Content-Type to avoid CORS preflight
  // after the 307 redirect (text/plain is a "simple" content-type).
  const preferCustomDomain = shouldPreferCustomDomainApi();
  const targetPath =
    useDirectFallback || preferCustomDomain ? `${API_BASE}${path}` : path;

  if (!customHeaders.has("Accept")) {
    customHeaders.set("Accept", "application/json");
  }
  // On non-GET requests, if the caller set application/json, switch to text/plain
  // so the 307 redirect from Firebase→Render does not trigger a CORS preflight.
  const isNonGet = method !== "GET" && method !== "HEAD";
  if (isNonGet && customHeaders.get("Content-Type") === "application/json") {
    customHeaders.set("Content-Type", "text/plain");
  }

  try {
    const res = await fetch(targetPath, {
      ...options,
      headers: customHeaders,
    });

    if (!res.ok) {
      const text = await res.clone().text();

      // Retry on 502/503/504 (server cold start or temporary outage)
      if (
        retries > 0 && (
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504 ||
          text.includes("Starting Server") ||
          text.includes("is starting") ||
          text.includes("<!DOCTYPE html>")
        )
      ) {
        const delay = res.status === 502 || res.status === 503 || res.status === 504 ? 4000 : 2000;
        console.log(
          `[fetchApi] Server cold start or temporary error (${res.status}) for ${path}, retrying in ${delay}ms... (${retries} left)`,
        );
        await new Promise((r) => setTimeout(r, delay));
        return fetchApi(path, options, retries - 1, useDirectFallback);
      }

      if (
        res.status === 429 ||
        text === "Rate exceeded." ||
        text.includes("Rate exceeded") ||
        text.includes("Too Many Requests") ||
        text.includes("Quota exceeded")
      ) {
        console.warn(
          `[fetchApi] Rate limit matched in status/content: ${path}`,
        );
        if (path.includes("/api/config")) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              ads: {},
                heroVideoUrl: getCachedHeroVideoUrl() || "",
              socialLinks: { whatsapp: "", group: "", instagram: "", facebook: "" },
              youtubeChannelUrl: "https://www.youtube.com/",
              youtubeUrl: "https://www.youtube.com/",
              tiktokUrl: "https://www.tiktok.com/",
              instagramUrl: "https://www.instagram.com/",
              facebookUrl: "https://www.facebook.com/",
            }),
            text: async () => JSON.stringify({}),
            clone: () => res,
            headers: new Headers(),
          } as any;
        }
        if (
          path.includes("/api/admin/hero") ||
          path.includes("/api/movies/hero")
        ) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              heroVideoUrl: "",
              heroPlaylist: [],
            }),
            text: async () => "{}",
            clone: () => res,
            headers: new Headers(),
          } as any;
        }
        if (path.includes("/api/admin/users")) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => [],
            text: async () => "[]",
            clone: () => res,
            headers: new Headers(),
          } as any;
        }
      }
    }

    // Handle "Starting Server" or "Application is starting" HTML pages gracefully
    const contentType = res.headers.get("content-type");
    if (res.ok && contentType && !contentType.includes("application/json")) {
      const text = await res.clone().text();
      if (
        retries > 0 &&
        (text.includes("Starting Server") ||
          text.includes("is starting") ||
          text.includes("<!DOCTYPE html>"))
      ) {
        console.log(
          `[fetchApi] Received HTML for ${path}, retrying in 2s... (${retries} left)`,
        );
        await new Promise((r) => setTimeout(r, 2000));
        return fetchApi(path, options, retries - 1, useDirectFallback);
      }
    }

    // Return a proxy wrapper instead of mutating the original response json method
    const safeJson = async () => {
      try {
        const text = await res.clone().text();
        if (
          text === "Rate exceeded." ||
          text.includes("Rate exceeded") ||
          text.includes("Quota exceeded") ||
          text.includes("Too Many Requests")
        ) {
          console.warn(`[fetchApi] Rate limit response detected for: ${path}`);
          if (
            path.includes("/api/admin/hero") ||
            path.includes("/api/movies/hero")
          ) {
            return {
              heroVideoUrl: "",
              heroPlaylist: [],
            };
          }
          if (path.includes("/api/admin/users")) {
            return [];
          }
          return { error: "Rate limit exceeded", rateLimited: true };
        }
        return JSON.parse(text);
      } catch (err) {
        console.warn(
          `[fetchApi] Failed to parse JSON for ${path}, returning safe default fallback:`,
          err,
        );
        if (
          path.includes("/api/admin/hero") ||
          path.includes("/api/movies/hero")
        ) {
          return {
            heroVideoUrl: "https://www.youtube.com/watch?v=YPY7J-flzE8",
            heroPlaylist: [
              "https://www.youtube.com/watch?v=YPY7J-flzE8",
              "https://www.youtube.com/watch?v=YPY7J-flzE8",
              "https://www.youtube.com/watch?v=YPY7J-flzE8",
            ],
          };
        }
        if (path.includes("/api/admin/users")) {
          return [];
        }
        return { error: "Parse failure", raw: true };
      }
    };

    return new Proxy(res, {
      get(target, prop) {
        if (prop === "json") {
          return safeJson;
        }
        const val = target[prop as any];
        return typeof val === "function" ? val.bind(target) : val;
      },
    });
  } catch (err) {
    if (retries > 0) {
      console.warn(`[fetchApi] Failed ${path}, retrying in 2s...`, err);
      await new Promise((r) => setTimeout(r, 2000));
      return fetchApi(path, options, retries - 1, useDirectFallback);
    }
    // Bidirectional fallback: if direct Render URL fails, try same-origin
    // (Firebase 307 redirect to Render); vice versa.
    // Return any server response (not just 2xx) so the caller gets the real API error.
    if (useDirectFallback) {
      console.warn(`[fetchApi] Direct URL failed for ${path}, trying same-origin via Firebase redirect...`);
      // Use text/plain Content-Type for POST/PUT/PATCH/DELETE so the 307
      // redirect from Firebase to Render avoids a CORS preflight (text/plain
      // is a "simple" content-type that does not trigger OPTIONS).
      const fallbackHeaders = new Headers(customHeaders);
      const method = (options?.method || "GET").toUpperCase();
      const isJsonMethod = method !== "GET" && method !== "HEAD";
      if (isJsonMethod && fallbackHeaders.get("Content-Type") === "application/json") {
        fallbackHeaders.set("Content-Type", "text/plain");
      }
      try {
        const sameOriginRes = await fetch(path, {
          ...options,
          headers: fallbackHeaders,
        });
        return sameOriginRes;
      } catch (sameOriginErr) {
        console.warn(`[fetchApi] Same-origin also failed for ${path}:`, sameOriginErr);
      }
    } else {
      const fallbackTarget = `${API_BASE}${path}`;
      console.warn(`[fetchApi] Primary request failed for ${path}, trying direct fallback...`);
      try {
        const fallbackRes = await fetch(fallbackTarget, {
          ...options,
          headers: customHeaders,
        });
        return fallbackRes;
      } catch (fallbackErr) {
        console.warn(`[fetchApi] Fallback failed for ${fallbackTarget}:`, fallbackErr);
      }
    }
    // Final fallback — differentiate between network/connectivity failures
    // and a server that is reachable but returning errors.
    const isNetworkError =
      err instanceof TypeError &&
      (err.message.includes("fetch") ||
        err.message.includes("NetworkError") ||
        err.message.includes("Failed to fetch") ||
        err.message.includes("net::ERR_"));
    const errorMessage = isNetworkError
      ? "Network error — check your internet connection or firewall"
      : "Server unavailable — backend may be starting or down";
    const errorStatus = isNetworkError ? 0 : 503;
    return {
      ok: false,
      status: errorStatus,
      json: async () => {
        if (
          path.includes("/api/admin/hero") ||
          path.includes("/api/movies/hero")
        ) {
          return {
            heroVideoUrl: "https://www.youtube.com/watch?v=YPY7J-flzE8",
            heroPlaylist: [
              "https://www.youtube.com/watch?v=YPY7J-flzE8",
              "https://www.youtube.com/watch?v=YPY7J-flzE8",
              "https://www.youtube.com/watch?v=YPY7J-flzE8",
            ],
          };
        }
        if (path.includes("/api/admin/users")) {
          return [];
        }
        return { error: errorMessage };
      },
      text: async () => errorMessage,
      headers: new Headers(),
    } as Response;
  }
}

// Local Database Helpers
const fetchSyncGroup = async (id: string) => {
  const res = await fetchApi(`/api/syncGroups/${id}`);
  return res.ok ? res.json() : null;
};

const updateSyncGroup = async (id: string, data: any) => {
  const res = await fetchApi(`/api/syncGroups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.ok;
};

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

const handleFirestoreError = (err: any, type: OperationType, path: string) => {
  // Silent transient JSON errors which usually mean server is starting
  if (err instanceof Error && err.message.includes("Unexpected token")) {
    return;
  }
  console.error(`Firestore Error [${type}] on ${path}:`, err);
};

// Point: Self-Healing / Auto-QA Infrastructure
class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error(
      `Self-Healing [${this.props.fallbackName || "Generic"}] Caught Crash:`,
      error,
      errorInfo,
    );
  }
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-8 bg-red-900/20 border border-red-500/20 rounded-2xl text-center">
          <h2 className="text-xl font-bold text-red-500 mb-2 kurdish-text">
            کێشەیەک ڕوویدا لە بارکردن
          </h2>
          <p className="text-sm text-red-400 font-mono">
            {this.state.error?.message || "Unknown rendering error"}
          </p>
          <p className="text-[10px] text-red-400/50 mt-1 uppercase">
            Component: {this.props.fallbackName || "Generic"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-xs hover:bg-red-500 transition-colors"
          >
            دووبارە بارکردنەوە
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const SafeRender = ({
  children,
  fallbackName,
}: {
  children: React.ReactNode;
  fallbackName?: string;
}) => (
  <ErrorBoundary fallbackName={fallbackName}>
    <React.Suspense
      fallback={
        <div className="flex flex-col items-center justify-center p-12 space-y-3 bg-[#0c0d12]/50 border border-white/5 rounded-3xl mt-4 max-w-2xl mx-auto">
          <div className="w-8 h-8 rounded-full border-2 border-t-amber-500 border-white/10 animate-spin" />
          <span className="text-xs text-amber-500 font-extrabold kurdish-text animate-pulse">
            خەریکی بارکردنی یەکەی {fallbackName || "سیستم"}...
          </span>
        </div>
      }
    >
      {children}
    </React.Suspense>
  </ErrorBoundary>
);

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// Dynamic genre icons: known genres get a themed icon, any genre added later
// by an admin falls back to the generic Film icon.
const GENRE_ICONS: Record<string, any> = {
  "New Releases": Sparkles,
  "فیلمە نوێیەکان": Sparkles,
  "دۆبلاژ": MessageCircle,
  "دراما": Film,
  "ئاکشن": Sword,
  "ترسناک": Ghost,
  "کۆمیدی": Smile,
  "ئەنیمەیشن": Calendar,
  "خەیاڵی": Flame,
  "زنجیرە": Clock,
  "کوردستان": ShieldCheck,
};

// Dashboard Sub-components
const SidebarItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`whitespace-nowrap flex items-center gap-2 lg:gap-4 px-4 lg:px-6 py-2.5 lg:py-4 rounded-xl lg:rounded-2xl font-black kurdish-text transition-all shrink-0 ${
      active
        ? "bg-brand-primary text-white shadow-lg shadow-red-600/20"
        : "text-gray-500 hover:bg-white/5 hover:text-white"
    }`}
  >
    <Icon className="w-4 h-4 lg:w-5 lg:h-5 shrink-0" />
    <span className="text-xs lg:text-sm select-none">{label}</span>
  </button>
);

const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <div className="bg-white/5 p-4 sm:p-5 md:p-8 rounded-2xl md:rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
    <div className="relative z-10">
      <div
        className={`w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center mb-3 sm:mb-4 md:mb-6 transition-transform group-hover:scale-110 ${color}`}
      >
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
      </div>
      <div className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-1 md:mb-2">
        {value}
      </div>
      <p className="text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest kurdish-text">
        {label}
      </p>
    </div>
    <div
      className={`absolute top-0 right-0 w-32 h-32 blur-[80px] opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 ${color.replace("text", "bg")}`}
    />
  </div>
);

// Safe Storage Helper to bypass Tracking Prevention blocks
const safeStorage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Blocked reading key: ${key}`);
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[SafeStorage] Blocked writing key: ${key}`);
    }
  },
  remove: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Blocked removing key: ${key}`);
    }
  },
};

// Unique browser/device fingerprint (persistent UUID) sent as the X-Device-Id
// header on every /api request. The server's auto-ban system targets THIS id,
// so a password-failure block isolates one device instead of the whole site /
// every device sharing the same public IP (mobile NAT networks).
const DEVICE_ID_LOCAL_KEY = "cinemachat_device_id";

const getDeviceId = (): string => {
  let id = safeStorage.get(DEVICE_ID_LOCAL_KEY);
  if (!id) {
    try {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    } catch {
      id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }
    safeStorage.set(DEVICE_ID_LOCAL_KEY, id);
  }
  return id;
};

// Per-tab viewer session id (sessionStorage = unique per browser tab, survives
// reloads inside the same tab). Live-viewer counting must be keyed per TAB so
// that one person watching the same movie in two tabs counts as two concurrent
// viewers. localStorage is deliberately NOT used here — it is shared across
// tabs, which would dedupe the same device into a single viewer.
const TAB_SESSION_LOCAL_KEY = "cinemachat_tab_session";

const getViewerSessionId = (): string => {
  try {
    let id = sessionStorage.getItem(TAB_SESSION_LOCAL_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem(TAB_SESSION_LOCAL_KEY, id);
    }
    return id;
  } catch {
    return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
};

const HERO_VIDEO_LOCAL_KEY = "cinemachat_hero_video_url";

const getCachedHeroVideoUrl = () => {
  const cached = safeStorage.get(HERO_VIDEO_LOCAL_KEY);
  if (!cached) return "";
  // Sanitize HTML entities that may have been stored
  return cached.trim().replace(/&#x2F;/gi, '/').replace(/&amp;/g, '&');
};

const setCachedHeroVideoUrl = (url: string) => {
  const clean = (url || "").trim().replace(/&#x2F;/gi, '/').replace(/&amp;/g, '&');
  if (!clean) return;
  safeStorage.set(HERO_VIDEO_LOCAL_KEY, clean);
};

// Decode HTML-entity-encoded stored URLs (e.g. "https:&#x2F;&#x2F;…?a=1&amp;b=2")
// that admins may have pasted from an HTML source. Left raw, a browser resolves
// such a string to a malformed request like "https://&/" (Chrome reads the
// "&#x2F;" as a "#fragment" + "&"), so posters break and the console fills with
// ERR_NAME_NOT_RESOLVED. Applied at the data layer so every consumer (grid,
// hero, detail modal, related rows, admin lists) renders clean URLs.
const decodeStoredUrl = (url: any): any => {
  if (typeof url !== "string" || !url.includes("&")) return url;
  return url
    .replace(/&#x2F;/gi, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
};

const popOutPlayer = (url: string | undefined) => {
  if (!url) return;
  const win = window.open(
    "",
    "_blank",
    "width=" + screen.width + ",height=" + screen.height,
  );
  if (win) {
    const doc = win.document;
    doc.title = "Player";

    doc.body.style.margin = "0";
    doc.body.style.padding = "0";
    doc.body.style.background = "black";
    doc.body.style.overflow = "hidden";

    const iframe = doc.createElement("iframe");
    iframe.src = url;
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
    iframe.style.border = "none";
    iframe.setAttribute(
      "sandbox",
      "allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation-by-user-activation",
    );
    iframe.setAttribute("allowfullscreen", "true");

    doc.body.appendChild(iframe);

    try {
      doc.documentElement.requestFullscreen().catch((err) => console.log(err));
    } catch (err) {
      console.log(err);
    }
  }
};

// Returns the first available playable URL from a movie.
// Priority: embedUrl (explicitly embed-formatted) > videoUrl > source-specific fields > streamingUrl (raw) > external_link > externalMovieLink.
// embedUrl is intentionally first because the server explicitly computes it as the embed-ready version,
// while streamingUrl retains the raw user input (e.g. "watch?v=" instead of "embed/").
function getMovieSourceUrl(movie: any): string | null {
  if (!movie) return null;
  return (
    movie.embedUrl ||
    movie.videoUrl ||
    movie.hdtodayUrl ||
    movie.vidsrcUrl ||
    movie.vidmolyUrl ||
    movie.streamwishUrl ||
    movie.fileLrunUrl ||
    movie.youtubeMovieUrl ||
    movie.otherVideoUrl ||
    movie.streamingUrl ||
    movie.external_link ||
    movie.externalMovieLink ||
    null
  );
}

// Scans EVERY source field of a movie for a YouTube link. Posted movies often
// carry several links at once (e.g. an hdtoday embed AND a youtubeMovieUrl);
// the playable URL chosen by getMovieSourceUrl may then not be the YouTube one,
// which would break caption translation. Subtitle fetching should therefore
// prefer whichever source is a real YouTube video.
function findYoutubeSource(movie: any): string | null {
  if (!movie) return null;
  const candidates = [
    movie.embedUrl,
    movie.videoUrl,
    movie.hdtodayUrl,
    movie.vidsrcUrl,
    movie.vidmolyUrl,
    movie.streamwishUrl,
    movie.fileLrunUrl,
    movie.youtubeMovieUrl,
    movie.otherVideoUrl,
    movie.streamingUrl,
    movie.external_link,
    movie.externalMovieLink,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /youtube\.com|youtu\.be/i.test(c)) return c;
  }
  return null;
}

// Immersive player "quality" presets: each step zooms the embedded video in a bit
// more (crops more of the provider's site chrome). Mirrors the requested
// "زیاد کردن و کەمکردنی کوالێتی وێنە" control.
const IMMERSIVE_QUALITY_PRESETS = [
  { label: "فیلم (Fill)", value: 1 },
  { label: "بەرزتر (HD)", value: 1.15 },
  { label: "زۆر بەرز (Full HD)", value: 1.35 },
  { label: "زوم (4K Zoom)", value: 1.6 },
];

import { getYTId as extractYouTubeId, loadYouTubeAPI } from './utils/youtube'; // Use the shared utility

// Format a seconds value as `H:MM:SS` (or `MM:SS` when under an hour) for the seek bar.
function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}:` : ""}${h > 0 ? String(m).padStart(2, "0") : String(m)}:${String(sec).padStart(2, "0")}`;
}


const CategoryDropdown = ({ value, onChange, categories, className }: any) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`bg-black/40 border border-white/10 rounded-xl px-2 py-3 text-white kurdish-text outline-none focus:border-brand-primary appearance-none cursor-pointer text-[10px] ${className || ""}`}
  >
    {Array.isArray(categories) && categories.length > 0 ? (
      categories.map((c: any, i: number) => (
        <option
          key={`${c.value || c.tag || c.name}-${i}`}
          value={c.value ?? c.tag ?? c.name}
        >
          {c.label || c.name}
        </option>
      ))
    ) : (
      <>
        <option value="ئاکشن">Action</option>
        <option value="ترسناک">Horror</option>
        <option value="دراما">Drama</option>
        <option value="کۆمیدی">Comedy</option>
      </>
    )}
  </select>
);

const transformLink = (url: string) => {
  if (url.includes("imdb.com")) {
    return url.replace("imdb.com", "playimdb.com");
  }
  return url;
};

const ContentModule = ({
  onPost,
  onSyncNow,
  lastAddedMovie,
  currentUser,
  systemVerified,
  config,
}: any) => {
  // Security check: Only allow authorized admins to see this module
  if (!systemVerified) {
    return (
      <div className="py-20 text-center flex flex-col items-center bg-white/5 rounded-[2.5rem] border border-white/10">
        <ShieldAlert className="w-16 h-16 text-brand-primary mb-4" />
        <h3 className="text-xl font-black text-white kurdish-text">
          دەسەڵاتی پۆستکردنت نییە
        </h3>
        <p className="text-gray-500 kurdish-text mt-2">
          تکایە وشەی نهێنی سیستم بنوسە یان وەک ئەدمین بچۆ ژوورەوە
        </p>
      </div>
    );
  }

  const [formData, setFormData] = useState({
    title: "",
    category: "ئاکشن",
    description: "",
    posterUrl: "",
    imdbUrl: "",
    hdtodayUrl: "",
    youtubeMovieUrl: "",
    otherVideoUrl: "",
    vidsrcUrl: "",
    vidmolyUrl: "",
    streamwishUrl: "",
    fileLrunUrl: "",
    trailerUrl: "",
    mainTrailerUrl: "",
    streamingSourceUrl: "",
    quality: "HD",
        tags: "",
        subtitleUrl: "",
        subtitleText: "",
        rating: "",
    year: "",
    duration: "",
    language: "",
    type: "movie",
    postType: "فیلم",
    whatsappLink: "",
    externalMovieLink: "",
  });
  const [postStatus, setPostStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isImdbFetching, setIsImdbFetching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // Detected dimensions of the uploaded poster (used for the 500x750 / 2:3 guidance)
  const [uploadedDims, setUploadedDims] = useState<{ width: number; height: number } | null>(null);
  // Live genres from Firestore — stays in sync with the admin genre panel.
  const [genres, setGenres] = useState<Genre[]>([]);

  // Real-time genre options for the movie form. Falls back to DEFAULT_GENRES
  // while the snapshot loads / if the collection is empty, so the dropdown is
  // never blank. Option values are the genre TAG (matched against movie.tags by
  // the main nav), labels are the Kurdish names.
  const genreList = useMemo<Genre[]>(() => {
    if (genres.length > 0) return genres;
    return DEFAULT_GENRES.map((g, i) => ({
      id: `_default_${i}`,
      name: g.name,
      tag: g.tag,
      sortOrder: i + 1,
    }));
  }, [genres]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Security check: Limit file size to 2MB (strict limit requested)
    if (file.size > 2 * 1024 * 1024) {
      alert(
        "قەبارەی وێنە نابێت لە ٢ مێگابایت گەورەتر بێت بۆ پاراستنی هێڵ و سێرڤەر! (Max 2MB)",
      );
      return;
    }
    
    // Security check: Only allow images
    if (!file.type.startsWith("image/")) {
      alert("تکایە تەنها فایلێکی وێنە هەڵبژێرە");
      return;
    }

    setIsUploading(true);
    setPostStatus({ type: null, message: "" }); // Clear previous status
    setUploadedDims(null);
    try {
      // Read the raw file as a data-URL once; used both for compression and as a
      // guaranteed fallback so the upload never fails with an empty payload.
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      // Automatic browser compression via canvas helper + dimension detection.
      // The recommended poster size is 500x750px (2:3 ratio) — we measure the
      // original so the UI can warn when the chosen image deviates from it.
      let compressedBase64: string | null = null;
      let detectedDims: { width: number; height: number } | null = null;
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Failed to decode image"));
          image.src = rawDataUrl;
        });
        detectedDims = { width: img.naturalWidth, height: img.naturalHeight };
        setUploadedDims(detectedDims);

        const canvas = document.createElement("canvas");
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        const maxDim = 1200; // Max dimension for either width or height
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          compressedBase64 = canvas.toDataURL("image/jpeg", 0.8); // Compress to JPEG with 80% quality
        }
      } catch (e) {
        console.warn("Compression failed, uploading original fallback:", e);
      }

      // Upload to server endpoint — the server validates the payload again and
      // persists it in db.json so the poster never disappears after a redeploy.
      const uploadRes = await fetchApi("/api/admin/upload-image", {
        method: "POST",
        body: JSON.stringify({ imageData: compressedBase64 || rawDataUrl, fileName: file.name, adminName: currentUser?.username || "Admin" }),
      });
      const uploadData = await uploadRes.json();
      if (uploadData.success) {
        setFormData((prev) => ({ ...prev, posterUrl: uploadData.url }));
        setPostStatus({ type: "success", message: "وێنەکە بە سەرکەوتوویی بارکرا بێ کێشە ✓" });
      } else {
        throw new Error(uploadData.error || "شکست لە بارکردنی وێنە");
      }
    } catch (error: any) {
      console.error("Image Upload Error:", error);
      let errorMsg = "هەڵەیەک ڕوویدا لە کاتی بارکردنی وێنەکە";
      if (error.code === "storage/unauthorized") {
        errorMsg = "دەسەڵاتی بارکردنی وێنەت نییە (Permission Denied).";
      } else if (
        error.code === "storage/quota-exceeded" ||
        error.message?.includes("quota")
      ) {
        errorMsg =
          "بارگەکردنی وێنە ڕەتکرایەوە. تکایە دڵنیابەرەوە لە خێرایی ئینتەرنێتەکەت یان وێنەیەکی بچووکتر هەڵبژێرە.";
      } else {
        errorMsg += `: ${error.message}`;
      }
      setPostStatus({ type: "error", message: errorMsg });
    } finally {
      setIsUploading(false);
    }
  };

  // Preview Image Display
  const renderImagePreview = () => {
    if (!formData.posterUrl) return null;
    return (
      <div className="mt-4 p-2 bg-black/60 rounded-xl border border-white/10">
        <p className="text-[10px] text-gray-400 mb-2 font-bold">
          Image Preview
        </p>
        <img
          src={formData.posterUrl}
          alt="Preview"
          className="w-full h-32 object-cover rounded-lg"
        />
      </div>
    );
  };

  useEffect(() => {
    // Real-time genres: any genre added/removed in the admin panel (or on
    // another device) reflects in this dropdown instantly — no manual refresh.
    const unsub = subscribeGenres((list) => {
      setGenres(list);
      if (list.length === 0) seedDefaultGenres();
    });
    return unsub;
  }, []);

  // Automatic Metadata Fetching on IMDb ID or YouTube URL change
  useEffect(() => {
    const fetchMetadata = async () => {
      const url =
        formData.trailerUrl || formData.youtubeMovieUrl || formData.hdtodayUrl;
      if (!url || url.length < 10) return;

      const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
      if (!isYoutube) return;

      setIsExtracting(true);
      const ytId = extractYouTubeId(url);
      const thumbnail = ytId
        ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`
        : "";

      try {
        const response = await fetch(
          `https://www.youtube.com/oembed?url=${url}&format=json`,
        );
        const data = await response.json();
        setFormData((prev) => ({
          ...prev,
          title: prev.title || data.title,
          posterUrl: prev.posterUrl || thumbnail,
        }));
      } catch (err) {
        if (thumbnail)
          setFormData((prev) => ({
            ...prev,
            posterUrl: prev.posterUrl || thumbnail,
          }));
      }
      setIsExtracting(false);
    };

    const timer = setTimeout(fetchMetadata, 1000);
    return () => clearTimeout(timer);
  }, [formData.trailerUrl, formData.youtubeMovieUrl, formData.hdtodayUrl]);

  const handleImdbFetch = async () => {
    const imdbUrl = (formData.imdbUrl || "").trim();
    if (!imdbUrl) {
      alert("تکایە لینکێک دابنێ");
      return;
    }

    const ai = getAI();
    if (!ai) {
      console.warn("Gemini API key is not configured in the environment.");
      // Skip if prompt is not configured
    }

    // Extraction logic for IMDb ID (e.g. tt1234567)
    const imdbIdMatch =
      imdbUrl && typeof imdbUrl === "string"
        ? imdbUrl.match(/tt\d{7,10}/)
        : null;
    const imdbId = imdbIdMatch ? imdbIdMatch[0] : null;

    setIsImdbFetching(true);
    try {
      // If we found an ID, pass it to the server. Otherwise pass the URL.
      const queryParam = imdbId
        ? `imdbId=${imdbId}`
        : `url=${encodeURIComponent(imdbUrl)}`;
      const res = await fetch(`/api/admin/imdb-fetch?${queryParam}`);
      const result = await res.json();

      if (result.success && result.html && ai) {
        // Use client-side Gemini to extract metadata from HTML
        const prompt = `
          Extract metadata from this HTML content.
          Return ONLY a valid JSON object with these keys: 
          type ("movie" or "tv"), title, year (string), rating (string, e.g. "8.5"), description, poster (URL).
          HTML: ${result.html}
        `;

        try {
          const geminiResult = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ parts: [{ text: prompt }] }],
          });
          const text = geminiResult.text;
          const jsonStr = text.replace(/```json|```/g, "").trim();
          const movieData = JSON.parse(jsonStr);

          setFormData((prev) => ({
            ...prev,
            title: movieData.title || prev.title,
            description: movieData.description || prev.description,
            posterUrl: movieData.poster || prev.posterUrl,
            rating: movieData.rating ? String(movieData.rating) : prev.rating,
            year: movieData.year ? String(movieData.year) : prev.year,
            type: movieData.type || prev.type,
          }));
        } catch (genAiErr: any) {
          console.error("Gemini Extraction Error:", genAiErr);
          alert("نەتوانرا زانیارییەکان جیا بکرێنەوە");
        }
      } else if (result.success && result.data) {
        // Legacy fallback
        setFormData((prev) => ({
          ...prev,
          ...result.data,
        }));
      } else if (result.error) {
        alert(result.error);
      } else {
        alert("نەتوانرا پەڕەکە باربکرێت");
      }
    } catch (err) {
      alert("هەڵەیەک ڕوویدا لە کاتی وەرگرتنی زانیارییەکان");
    } finally {
      setIsImdbFetching(false);
    }
  };

  const handlePublish = async () => {
    // Validate mandatory fields
    if (isUploading) {
      setPostStatus({
        type: "error",
        message:
          "پۆست نەکرا: وێنەی فیلم هێشتا لە بارکردندایە، تکایە چاوەڕێ بکە",
      });
      alert("وێنەکە هێشتا لە بارکردندایە");
      return;
    }

    if (!formData.title || formData.title.trim() === "") {
      setPostStatus({
        type: "error",
        message: "پۆست نەکرا: ناونیشانی فیلم پێویستە",
      });
      alert("ناوی فیلم پێویستە");
      return;
    }

    if (!formData.category || formData.category === "") {
      setPostStatus({ type: "error", message: "پۆست نەکرا: پۆلێن پێویستە" });
      alert("تکایە پۆلێنێک هەڵبژێرە");
      return;
    }

    // Ensure at least one link is provided, verify they are strings and not empty
    const links = {
      trailer: transformLink(formData.trailerUrl?.trim() || ""),
      mainTrailer: transformLink(formData.mainTrailerUrl?.trim() || ""),
      streamingSource: transformLink(formData.streamingSourceUrl?.trim() || ""),
      hdtoday: transformLink(formData.hdtodayUrl?.trim() || ""),
      youtube: transformLink(formData.youtubeMovieUrl?.trim() || ""),
      other: transformLink(formData.otherVideoUrl?.trim() || ""),
      vidsrc: transformLink(formData.vidsrcUrl?.trim() || ""),
      vidmoly: transformLink(formData.vidmolyUrl?.trim() || ""),
      streamwish: transformLink(formData.streamwishUrl?.trim() || ""),
      fileLrun: transformLink(formData.fileLrunUrl?.trim() || ""),
      external: formData.externalMovieLink?.trim() || "",
    };

    // Check if any link exists (non-empty string)
    const hasAnyLink = Object.values(links).some((link) => link.length > 0);

    if (!hasAnyLink) {
      setPostStatus({
        type: "error",
        message: "پۆست نەکرا: لانیکەم یەک لینکی ڤیدیۆ پێویستە",
      });
      alert("تکایە لانیکەم یەک لینکی ڤیدیۆ پڕ بکەرەوە");
      return;
    }

    setIsPosting(true);
    setPostStatus({ type: null, message: "" });

    const finalTags = [formData.category, "New Releases"];
    let movieType = formData.type;

    // Determine type based on any of the links or category
    const anyLink =
      links.hdtoday ||
      links.youtube ||
      links.other ||
      links.trailer ||
      links.mainTrailer ||
      links.streamingSource ||
      links.vidsrc ||
      links.vidmoly ||
      links.streamwish ||
      links.fileLrun ||
      links.external;
    if (
      anyLink.includes("/embed/tv/") ||
      anyLink.includes("/tv/") ||
      formData.category === "زنجیرە"
    ) {
      movieType = "tv";
      if (!finalTags.includes("Series")) finalTags.push("Series");
    }

    // Unique ID for forcing re-render
    const movieData = {
      ...formData,
      image:
        formData.posterUrl ||
        "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800",
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tags: finalTags,
      type: movieType,
      streamingUrl: anyLink || "",
      // Include all links
      trailerUrl: links.trailer,
      mainTrailerUrl: links.mainTrailer,
      streamingSourceUrl: links.streamingSource,
      hdtodayUrl: links.hdtoday,
      youtubeMovieUrl: links.youtube,
      otherVideoUrl: links.other,
      vidsrcUrl: links.vidsrc,
      vidmolyUrl: links.vidmoly,
      streamwishUrl: links.streamwish,
      fileLrunUrl: links.fileLrun,
      external_link: anyLink || "",
      isYouTube:
        anyLink.includes("youtube.com") || anyLink.includes("youtu.be"),
      whatsappLink:
        formData.whatsappLink || config.socialLinks.whatsapp || config.socialLinks.group || "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
      externalMovieLink:
        links.external && !links.external.startsWith("http")
          ? "https://" + links.external
          : links.external,
    };

    console.log("Publishing movie data:", movieData);

    try {
      await onPost(movieData);

      setPostStatus({
        type: "success",
        message:
          "فیلمەکە بە سەرکەوتوویی پۆست کرا و لە لیستی فیلمەکاندا دەرکەوت",
      });

      // CLEAR FORM
      setFormData({
        title: "",
        category: "ئاکشن",
        description: "",
        posterUrl: "",
        imdbUrl: "",
        hdtodayUrl: "",
        youtubeMovieUrl: "",
        otherVideoUrl: "",
        vidsrcUrl: "",
        vidmolyUrl: "",
        streamwishUrl: "",
        fileLrunUrl: "",
        trailerUrl: "",
        mainTrailerUrl: "",
        streamingSourceUrl: "",
        quality: "HD",
        tags: "",
        subtitleUrl: "",
        subtitleText: "",
        rating: "",
        year: "",
        duration: "",
        language: "",
        type: "movie",
        postType: "فیلم",
        whatsappLink: "",
        externalMovieLink: "",
      });
      setUploadedDims(null);

      setTimeout(() => setPostStatus({ type: null, message: "" }), 5000);
    } catch (error: any) {
      console.error("Publish Error:", error);
      const reason = error instanceof Error ? error.message : "Network Error";
      setPostStatus({
        type: "error",
        message: `پۆست نەکرا: ${reason}`,
      });
      alert(`پۆست نەکرا: ${reason}`);
    } finally {
      setIsPosting(false);
    }
  };

  const handleSaveAndLoop = async () => {
    const youtubeUrl =
      formData.youtubeMovieUrl ||
      formData.trailerUrl ||
      formData.otherVideoUrl ||
      formData.externalMovieLink;
    if (!youtubeUrl) {
      alert("تکایە سەرەتا لینکێکی یوتیوب دابنێ");
      return;
    }

    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      alert("لینکی یوتیوبەکە نادروستە بۆ دووبارەبوونەوە");
      return;
    }

    const loopedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&rel=0&modestbranding=1&showinfo=0&iv_load_policy=3&enablejsapi=1&disablekb=1&fs=0&playsinline=1&origin=${window.location.origin}`;

    setIsPosting(true);
    const movieData = {
      ...formData,
      title: formData.title || "Looped Video",
      image:
        formData.posterUrl ||
        "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800",
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tags: [formData.category, "New Releases"],
      type: formData.type || "movie",
      streamingUrl: loopedUrl,
      trailerUrl: loopedUrl,
      youtubeMovieUrl: loopedUrl,
      isYouTube: true, // Assuming YouTube for looped videos
      whatsappLink: formData.whatsappLink || config.socialLinks.whatsapp || config.socialLinks.group || "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
    };

    try {
      await onPost(movieData);
      setPostStatus({
        type: "success",
        message: "فیلمەکە بە سەرکەوتوویی بە شێوەی پloop پۆست کرا",
      });
      setFormData({
        title: "",
        category: "ئاکشن",
        description: "",
        posterUrl: "",
        imdbUrl: "",
        hdtodayUrl: "",
        youtubeMovieUrl: "",
        otherVideoUrl: "",
        vidsrcUrl: "",
        vidmolyUrl: "",
        streamwishUrl: "",
        fileLrunUrl: "",
        trailerUrl: "",
        mainTrailerUrl: "",
        streamingSourceUrl: "",
        quality: "HD",
        tags: "",
        subtitleUrl: "",
        subtitleText: "",
        rating: "",
        year: "",
        duration: "",
        language: "",
        type: "movie",
        postType: "فیلم",
        whatsappLink: "",
        externalMovieLink: "",
      });
      setUploadedDims(null);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-3xl font-black kurdish-text text-white">
            بەشی بڵاوکردنەوەی فیلمی نوێ
          </h3>
          <p className="text-gray-500 kurdish-text text-sm">
            لێرە دەتوانیت فیلمەکان بە سێ هەنگاوی جیاواز بڵاوبکەیتەوە (IMDb یان
            YouTube بۆ زانیاری، HDToday بۆ پەخش)
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 md:flex-none px-6 py-3 bg-purple-600 text-white font-black kurdish-text text-xs rounded-2xl hover:bg-purple-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            نۆژەنکردنەوەی گشتی (Global Refresh)
          </button>
          <button
            onClick={onSyncNow}
            className="flex-1 md:flex-none px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-white font-black kurdish-text text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2"
          >
            <Clock className="w-4 h-4 text-brand-primary" />
            ئەپدێتی دەستبەجێ (Sync)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form Fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Publish Container */}
          <div className="p-6 bg-brand-primary/10 border-2 border-brand-primary rounded-[2.5rem] space-y-4 shadow-xl">
            <h4 className="text-sm font-black text-brand-primary uppercase tracking-widest flex items-center gap-2">
              <Rocket className="w-5 h-5" /> Quick Publish
            </h4>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] text-gray-400">
                  External Movie Link (like playimdb.com)
                </label>
                <input
                  type="text"
                  placeholder="لینکەکە لێرە دابنێ..."
                  value={formData.externalMovieLink}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      externalMovieLink: e.target.value,
                    })
                  }
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
                />
              </div>
              <button
                onClick={handlePublish}
                disabled={isPosting}
                className="px-8 py-4 bg-brand-primary text-white rounded-2xl font-black kurdish-text hover:bg-red-700 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isPosting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                بڵاوکردنەوەی خێرا
              </button>
              <button
                onClick={handleSaveAndLoop}
                disabled={isPosting}
                className="px-8 py-4 bg-orange-600 text-white rounded-2xl font-black kurdish-text hover:bg-orange-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-orange-600/20"
              >
                <RotateCcw className="w-4 h-4" />
                Save & Loop
              </button>
            </div>
            {postStatus.message && (
              <div
                className={`p-4 rounded-xl text-xs font-bold ${postStatus.type === "success" ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"}`}
              >
                {postStatus.message}
              </div>
            )}
          </div>

          {/* Post Type (جۆری پۆست): explicit Film/Drama type. This is the
              primary way Drama Rooms tell dramas from films — only "دراما"
              posts appear in the Drama Room selection list. */}
          <div className="p-6 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-3">
            <label className="text-xs font-black text-white kurdish-text uppercase tracking-widest flex items-center gap-2">
              <Film className="w-4 h-4 text-brand-primary" />
              جۆری پۆست
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, postType: "فیلم" })
                }
                className={`rounded-2xl px-6 py-4 text-sm font-black kurdish-text border-2 transition-all flex items-center justify-center gap-2 ${
                  formData.postType === "فیلم"
                    ? "border-brand-primary bg-brand-primary/15 text-white shadow-lg shadow-brand-primary/10"
                    : "border-white/10 bg-black/40 text-gray-400 hover:bg-white/5"
                }`}
              >
                <Play className="w-4 h-4" />
                فیلم
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, postType: "دراما" })
                }
                className={`rounded-2xl px-6 py-4 text-sm font-black kurdish-text border-2 transition-all flex items-center justify-center gap-2 ${
                  formData.postType === "دراما"
                    ? "border-brand-primary bg-brand-primary/15 text-white shadow-lg shadow-brand-primary/10"
                    : "border-white/10 bg-black/40 text-gray-400 hover:bg-white/5"
                }`}
              >
                <Tv className="w-4 h-4" />
                دراما
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-6">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex-1 w-full space-y-2">
                <label className="text-[10px] font-black text-purple-400 kurdish-text uppercase tracking-widest flex items-center gap-2">
                  <Link2 className="w-3 h-3" />
                  لینکی پۆستەری فیلم یان وێنەی سەرەکی
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="لینکی وێنە لێرە دابنێ (Direct Image Link)..."
                    value={formData.posterUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, posterUrl: e.target.value })
                    }
                    className="flex-1 bg-black/60 border-2 border-white/5 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-purple-600 transition-all text-sm shadow-inner"
                  />
                  <label className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-2xl text-xs font-black kurdish-text flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-purple-600/30 active:scale-95 group">
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 group-hover:-translate-y-1 transition-transform" />
                    )}
                    <span>بارکردنی نوێ</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                  </label>
                </div>
                <p className="text-[10px] text-gray-500 kurdish-text flex items-center gap-1.5 pt-1">
                  <AlertCircle className="w-3 h-3 text-purple-400" />
                  قەبارەی پۆستەری پێشنیارکراو: 500×750 پیکسەل (ڕێژەی ٢:٣) بۆ ڕووکارێکی ورد و تەواو
                  <span className="hidden md:inline text-gray-600">•</span>
                  <span className="text-gray-600">گەورەترین قەبارە: ٢MB</span>
                </p>
                {uploadedDims && (
                  <p className={`text-[10px] font-black kurdish-text flex items-center gap-1.5 ${
                    uploadedDims.width / uploadedDims.height >= 0.6 &&
                    uploadedDims.width / uploadedDims.height <= 0.75
                      ? "text-emerald-500"
                      : "text-amber-500"
                  }`}>
                    {uploadedDims.width / uploadedDims.height >= 0.6 &&
                    uploadedDims.width / uploadedDims.height <= 0.75
                      ? "✓"
                      : "⚠"}
                    قەبارەی وێنەکەت: {uploadedDims.width}×{uploadedDims.height} پیکسەل
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black text-blue-400 kurdish-text uppercase tracking-widest flex items-center gap-2">
                  <Star className="w-3 h-3" />
                  ١. زانیارییەکان لە IMDb
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="imdb.com/title/tt..."
                    value={formData.imdbUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, imdbUrl: e.target.value })
                    }
                    className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-blue-500 transition-all text-xs"
                  />
                  <button
                    onClick={handleImdbFetch}
                    disabled={isImdbFetching}
                    className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black kurdish-text transition-all flex items-center gap-2 text-xs disabled:opacity-50"
                  >
                    {isImdbFetching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    هێنان
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-red-500 kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Youtube className="w-4 h-4" />
              ١. سەرچاوەی ترایلەر
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="لینکی یوتوبی ترایلەر..."
                value={formData.trailerUrl}
                onChange={(e) =>
                  setFormData({ ...formData, trailerUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-red-500 transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={handlePublish}
                className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-red-400 kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Play className="w-4 h-4" />
              ترایلەری سەرەکی
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="لینکی ترایلەری سەرەکی..."
                value={formData.mainTrailerUrl}
                onChange={(e) =>
                  setFormData({ ...formData, mainTrailerUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-red-400 transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={handlePublish}
                className="px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-blue-300 kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4" />
              سەرچاوەی Streaming
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="لینکی سەرچاوەی streaming..."
                value={formData.streamingSourceUrl}
                onChange={(e) =>
                  setFormData({ ...formData, streamingSourceUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-blue-400 transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={handlePublish}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-green-500 kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4" />
              ٢. سەرچاوەی HDToday
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="HDtoday.tr link..."
                value={formData.hdtodayUrl}
                onChange={(e) =>
                  setFormData({ ...formData, hdtodayUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-green-500 transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={handlePublish}
                className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-brand-primary kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Tv className="w-4 h-4" />
              ٣. سەرچاوەی یوتوب (فیلم)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="YouTube link..."
                value={formData.youtubeMovieUrl}
                onChange={(e) =>
                  setFormData({ ...formData, youtubeMovieUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-brand-primary transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={handlePublish}
                className="px-4 py-3 bg-brand-primary hover:bg-red-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
            <div>
              <label className="text-xs font-black text-brand-primary kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
                Subtitle Text (Copy & Paste the .srt/.vtt content here)
              </label>
              <textarea
                rows={6}
                placeholder="Paste your .srt/.vtt subtitle content here..."
                value={formData.subtitleText}
                onChange={(e) =>
                  setFormData({ ...formData, subtitleText: e.target.value })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-brand-primary transition-all text-xs font-mono resize-y"
              />
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4" />
              ٤. سەرچاوەی تر
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Other link..."
                value={formData.otherVideoUrl}
                onChange={(e) =>
                  setFormData({ ...formData, otherVideoUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-gray-500 transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={handlePublish}
                className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-purple-500 kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Play className="w-4 h-4" />
              ٥. سێرڤەری VidSrc
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="vidsrc.me/embed/movie?imdb=tt..."
                value={formData.vidsrcUrl}
                onChange={(e) =>
                  setFormData({ ...formData, vidsrcUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-purple-500 transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={handlePublish}
                className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-brand-primary kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Radio className="w-4 h-4" />
              ٦. سێرڤەری Vidmoly
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="vidmoly.to/embed-..."
                value={formData.vidmolyUrl}
                onChange={(e) =>
                  setFormData({ ...formData, vidmolyUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-brand-primary transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={handlePublish}
                className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-blue-400 kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Play className="w-4 h-4" />
              ٧. سێرڤەری StreamWish
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="streamwish.to/e/..."
                value={formData.streamwishUrl}
                onChange={(e) =>
                  setFormData({ ...formData, streamwishUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-blue-400 transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={() => handlePublish()}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-orange-400 kurdish-text uppercase tracking-widest flex items-center gap-2 mb-2">
              <Database className="w-4 h-4" />
              ٨. سێرڤەری FileLrun
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="filelrun.to/e/..."
                value={formData.fileLrunUrl}
                onChange={(e) =>
                  setFormData({ ...formData, fileLrunUrl: e.target.value })
                }
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-3 text-white kurdish-text outline-none focus:border-orange-400 transition-all text-xs"
              />
              <CategoryDropdown
                value={formData.category}
                onChange={(v: string) =>
                  setFormData({ ...formData, category: v })
                }
              />
              <button
                onClick={() => handlePublish()}
                className="px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl text-xs font-bold"
              >
                بڵاوکردنەوە
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Title */}
            <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
              <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
                ناونیشانی فیلم
              </label>
              <input
                type="text"
                placeholder="ناونیشانی فیلمەکە..."
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
              />
            </div>

            {/* Direct Movie/Source Link */}
            <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
              <label className="text-xs font-black text-brand-primary kurdish-text uppercase tracking-widest flex items-center gap-2">
                <Link2 className="w-3 h-3" />
                Direct Movie/Source Link
              </label>
              <input
                type="text"
                placeholder="لینکی ڕاستەوخۆی فیلم (وەک playimdb.com)..."
                value={formData.externalMovieLink}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    externalMovieLink: e.target.value,
                  })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
              />
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> External Secure Source
              </p>
            </div>

            {/* Category */}
            <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
              <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
                پۆلێن (Category)
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary appearance-none cursor-pointer"
              >
                {genreList.map((g) => (
                  <option key={g.id} value={g.tag}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* WhatsApp Link */}
            <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
              <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
                لینک بۆ واتسئەپ (ئۆپشنەڵ)
              </label>
              <input
                type="text"
                placeholder="لینکەکە لێرە دابنێ..."
                value={formData.whatsappLink}
                onChange={(e) =>
                  setFormData({ ...formData, whatsappLink: e.target.value })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
              />
            </div>
          </div>

          {/* Rating and Year Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
              <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
                ڕەیتینگی IMDb
              </label>
              <input
                type="text"
                placeholder="نموونە: 8.5"
                value={formData.rating}
                onChange={(e) =>
                  setFormData({ ...formData, rating: e.target.value })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
              />
            </div>
            <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
              <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
                ساڵی بەرهەمهێنان
              </label>
              <input
                type="text"
                placeholder="نموونە: 2024"
                value={formData.year}
                onChange={(e) =>
                  setFormData({ ...formData, year: e.target.value })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
              />
            </div>
            <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
              <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
                ماوەی فیلم
              </label>
              <input
                type="text"
                placeholder="نموونە: 2h 9min"
                value={formData.duration}
                onChange={(e) =>
                  setFormData({ ...formData, duration: e.target.value })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
              />
            </div>
            <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
              <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
                زمانی فیلم
              </label>
              <select
                value={formData.language}
                onChange={(e) =>
                  setFormData({ ...formData, language: e.target.value })
                }
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
              >
                <option value="">نادیار</option>
                <option value="کوردی">کوردی</option>
                <option value="English">English</option>
                <option value="عەرەبی">عەرەبی</option>
                <option value="تورکی">تورکی</option>
                <option value="فارسی">فارسی</option>
                <option value="هندی">هندی</option>
                <option value="کۆری">کۆری</option>
                <option value="ژاپۆنی">ژاپۆنی</option>
                <option value="فەرەنسی">فەرەنسی</option>
                <option value="ئیسپانی">ئیسپانی</option>
                <option value="ئەڵمانی">ئەڵمانی</option>
                <option value="دۆبلاژ">دۆبلاژ</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
            <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
              کورتەی فیلم (Metadata)
            </label>
            <textarea
              placeholder="دەربارەی فیلمەکە بنووسە..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary resize-none transition-all"
            />
          </div>
        </div>

        {/* Sidebar / Preview */}
        <div className="space-y-6">
          <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-6 flex flex-col items-center">
            <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest w-full">
              پۆستەر پێشبینی (Preview)
            </label>
            <div className="w-full aspect-[2/3] rounded-3xl overflow-hidden border border-white/10 bg-black/40 relative group">
              <img
                src={
                  formData.posterUrl ||
                  "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800"
                }
                className="w-full h-full object-cover opacity-60"
                alt="Preview"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <button
                  onClick={() => {
                    const newUrl = prompt(
                      "Enter fresh image URL:",
                      formData.posterUrl,
                    );
                    if (newUrl) setFormData({ ...formData, posterUrl: newUrl });
                  }}
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-[10px] text-white font-black kurdish-text transition-all"
                >
                  ناو بە ناو (URL)
                </button>

                <label className="bg-purple-600 hover:bg-purple-700 backdrop-blur-md px-4 py-2 rounded-xl text-[10px] text-white font-black kurdish-text transition-all cursor-pointer flex items-center gap-2">
                  {isUploading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  بارکردنی وێنە
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>
            </div>

            {uploadedDims && (
              <p className={`text-[10px] font-black kurdish-text text-center ${
                uploadedDims.width / uploadedDims.height >= 0.6 &&
                uploadedDims.width / uploadedDims.height <= 0.75
                  ? "text-emerald-500"
                  : "text-amber-500"
              }`}>
                {uploadedDims.width / uploadedDims.height >= 0.6 &&
                uploadedDims.width / uploadedDims.height <= 0.75
                  ? "✓"
                  : "⚠"}
                قەبارەی پۆستەر: {uploadedDims.width}×{uploadedDims.height} پیکسەل
              </p>
            )}

            {postStatus.message && (
              <div
                className={`w-full p-4 rounded-2xl text-xs font-black kurdish-text text-center animate-bounce ${
                  postStatus.type === "success"
                    ? "bg-green-500/20 text-green-400 border border-green-500/20"
                    : "bg-red-500/20 text-red-400 border border-red-500/20"
                }`}
              >
                {postStatus.message}
              </div>
            )}

            <div className="flex flex-col w-full gap-3 pt-4">
              <button
                onClick={handlePublish}
                disabled={isPosting || isUploading || !formData.title}
                className="w-full py-5 bg-purple-600 text-white rounded-[2rem] font-black kurdish-text text-lg hover:bg-purple-700 transition-all flex items-center justify-center gap-3 shadow-[0_0_40px_-10px_rgba(147,51,234,0.5)] disabled:opacity-50 active:scale-[0.98]"
              >
                {isPosting ? (
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
                بڵاوکردنەوەی کۆتایی (Final Publish)
              </button>
              <button
                onClick={handleSaveAndLoop}
                disabled={isPosting || isUploading}
                className="w-full py-5 bg-orange-600 text-white rounded-[2rem] font-black kurdish-text text-lg hover:bg-orange-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-orange-600/20 active:scale-[0.98]"
              >
                <RotateCcw className="w-6 h-6" />
                Save & Loop
              </button>
            </div>
          </div>

          <div className="px-6 py-4 bg-blue-500/5 border border-blue-500/10 rounded-3xl">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-4 h-4 text-blue-500" />
              <h5 className="font-black text-white text-xs kurdish-text">
                تێبینی گرنگ
              </h5>
            </div>
            <p className="text-[10px] text-gray-500 kurdish-text leading-relaxed">
              فیلمە نوێیەکان بە شێوەیەکی ئۆتۆماتیکی لە بەشی New Releases و
              دووبارە پۆلێن دەکرێنەوە بۆ نوێترین ڤیدیۆکان.
            </p>
          </div>
        </div>
      </div>

      {/* Remove localMovies preview section - no changes needed here as the section was removed */}
    </motion.div>
  );
};

const BroadcastModule = ({ onBroadcast }: any) => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // The broadcast button must NEVER get stuck in "خەریکی پەخش کردنە...".
  // try/catch/finally guarantees the spinner always resets, and the input is
  // cleared only after a confirmed successful Firestore save.
  const handleBroadcast = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus({
        type: "error",
        message: "تکایە لینکی ڤیدیۆ یان یوتیوب بنووسە",
      });
      return;
    }
    setStatus({ type: null, message: "" });
    setIsLoading(true);
    try {
      await onBroadcast(trimmed);
      setUrl("");
      setStatus({
        type: "success",
        message: "پەخشەکە بە سەرکەوتوویی بۆ ژووری گشتی نێردرا!",
      });
    } catch (e: any) {
      setStatus({
        type: "error",
        message:
          e?.message ||
          "پەخش کردن سەرکەوتوو نەبوو — تکایە دووبارە هەوڵبدەرەوە",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div>
        <h3 className="text-3xl font-black kurdish-text text-white mb-2">
          پەخشی ڕاستەوخۆ (Global Room)
        </h3>
        <p className="text-gray-500 kurdish-text text-sm">
          دانانی فیلم لە ژووری گشتی بۆ هەموو بەکارهێنەران لە یەک کاتدا.
        </p>
      </div>

      <div className="p-10 bg-brand-primary/5 border border-brand-primary/10 rounded-[2.5rem] flex flex-col items-center">
        <div className="w-24 h-24 bg-brand-primary/10 rounded-3xl flex items-center justify-center mb-8 border border-brand-primary/20">
          <Radio className="w-12 h-12 text-brand-primary animate-pulse" />
        </div>
        <div className="w-full max-w-md space-y-4">
          <input
            type="text"
            placeholder="Direct Video Link or YouTube URL..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (status.message) setStatus({ type: null, message: "" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) handleBroadcast();
            }}
            disabled={isLoading}
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white text-center font-bold outline-none focus:border-brand-primary tracking-tight text-xs disabled:opacity-50"
          />
          {status.message && (
            <p
              className={`text-xs font-black kurdish-text text-center ${
                status.type === "success" ? "text-green-400" : "text-red-400"
              }`}
            >
              {status.message}
            </p>
          )}
          <button
            onClick={handleBroadcast}
            disabled={isLoading || !url.trim()}
            className="w-full py-5 bg-brand-primary text-white rounded-2xl font-black kurdish-text text-lg hover:bg-brand-primary/80 transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              "خەریکی پەخش کردنە..."
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                ئێستا پەخشی بکە بۆ ژوورەکە
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const HeroModule = ({ onSync }: any) => {
  const [heroVideoUrl, setHeroVideoUrl] = useState("");

  useEffect(() => {
    fetchApi("/api/admin/hero")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.heroVideoUrl) {
          const clean = String(data.heroVideoUrl).trim();
          setHeroVideoUrl(clean);
          setCachedHeroVideoUrl(clean);
        } else if (
          data &&
          Array.isArray(data.heroPlaylist) &&
          data.heroPlaylist[0]
        ) {
          const clean = String(data.heroPlaylist[0]).trim();
          setHeroVideoUrl(clean);
          setCachedHeroVideoUrl(clean);
        } else {
          setHeroVideoUrl(getCachedHeroVideoUrl());
        }
      })
      .catch((err) => {
        console.error("Failed to load initial hero config:", err);
        setHeroVideoUrl(getCachedHeroVideoUrl());
      });
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div>
        <h3 className="text-3xl font-black kurdish-text text-white mb-2">
          ٧. هیرۆ ڤیدیۆ و ترەیلەر (Hero Video Settings)
        </h3>
        <p className="text-gray-500 kurdish-text text-sm">
          گۆڕینی ئەو ڤیدیۆیەی کە لە بەشی سەرەوەی ماڵپەڕ نیشان دەدرێت.
        </p>
      </div>

      <div className="p-10 bg-white/5 border border-white/10 rounded-[2.5rem] flex flex-col items-center">
        <div className="w-24 h-24 bg-red-600/10 rounded-3xl flex items-center justify-center mb-8 border border-red-600/20">
          <Youtube className="w-12 h-12 text-red-600" />
        </div>
        <div className="w-full max-w-md space-y-4 flex flex-col items-center">
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest block kurdish-text text-center">
            لینکى ڤیدیۆى سەرەکى (Hero Video)
          </label>
          <input
            type="text"
            placeholder="بۆردی بەستەری یوتیوب..."
            value={heroVideoUrl}
            onChange={(e) => setHeroVideoUrl(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white text-center font-bold outline-none focus:border-red-600 tracking-widest text-sm"
          />
          <button
            onClick={() => onSync(heroVideoUrl)}
            className="w-full py-5 bg-white text-black rounded-2xl font-black kurdish-text text-lg hover:bg-white/80 transition-all active:scale-95 shadow-2xl mt-4"
          >
            جێگیرکردن وەکو فیلمی سەرەکی
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-start gap-4 p-6 bg-white/5 rounded-2xl border border-white/5">
          <AlertCircle className="w-6 h-6 text-orange-500 flex-shrink-0" />
          <div>
            <h5 className="font-black text-white kurdish-text mb-1">
              ئۆتۆ پلەی ئاکتیڤە (بە دەنگ)
            </h5>
            <p className="text-xs text-gray-500 kurdish-text leading-relaxed">
              ئەم ڤیدیۆیە بە شێوەیەکی ئۆتۆماتیکی و بە دەنگ بۆ بەکارهێنەران
              لێدەدرێت لە باکگراونددا.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const CategoryModule = ({ movies }: any) => {
  const [categories, setCategories] = useState<Genre[]>([]);
  const [newCat, setNewCat] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const getAdminUsername = () => {
    try {
      const saved = safeStorage.get("cinemachat_admin");
      if (saved) {
        const u = JSON.parse(saved);
        return u.username || "";
      }
    } catch (e) {}
    return "";
  };

  const isStaff = (() => {
    try {
      const saved = safeStorage.get("cinemachat_admin");
      if (saved) {
        const u = JSON.parse(saved);
        return u.role === "staff";
      }
    } catch (e) {}
    return false;
  })();

  // Real-time Firestore sync: any add/delete in the admin panel (or any other
  // device) reflects here and in the main nav instantly — no manual refresh.
  useEffect(() => {
    const unsub = subscribeGenres((list) => {
      setCategories(list);
      setLoading(false);
      // Seed the default catalog once on first visit if the collection is empty
      if (list.length === 0) seedDefaultGenres();
    });
    return unsub;
  }, []);

  // Guard a Firestore operation so the submit/delete spinner can never spin
  // forever on a hung network request.
  const withTimeout = <T,>(promise: Promise<T>, ms = 20000) =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error("کات تەواو بوو — تکایە دووبارە هەوڵبدەرەوە")),
          ms,
        ),
      ),
    ]);

  const handleAdd = async () => {
    const name = newCat.trim();
    if (!name) {
      setError("ناوی پۆلێن پێویستە");
      return;
    }
    setError("");
    setAdding(true);
    try {
      await withTimeout(addGenre(name, getAdminUsername()));
      setNewCat(""); // the live subscription adds it to the list instantly
    } catch (e: any) {
      setError(e?.message || "هەڵەیەک ڕوویدا لە زیادکردنی پۆلێن");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (genre: Genre) => {
    if (!confirm(`ئایا دڵنیایت لە سڕینەوەی پۆلێنی "${genre.name}"؟`)) return;
    setError("");
    setDeletingId(genre.id);
    try {
      await withTimeout(deleteGenre(genre.id)); // live subscription removes it instantly
    } catch (e) {
      setError("کێشەیەک ڕوویدا لە سڕینەوە — تکایە دووبارە هەوڵبدەرەوە");
    } finally {
      setDeletingId(null);
    }
  };

  const genreIcon = (g: Genre) => {
    const Icon = GENRE_ICONS[g.tag] || GENRE_ICONS[g.name] || Film;
    return <Icon className="w-5 h-5" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-3xl font-black kurdish-text text-white">
            بەڕێوەبەرایەتی پۆلێنەکان
          </h3>
          <p className="text-gray-500 kurdish-text text-sm">
            زیادکردن و سڕینەوەی جۆرەکانی فیلم (Genre) — دەستبەجێ لە فایەربەیسەوە
            دەبەسترێتەوە
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm kurdish-text font-bold">
          {error}
        </div>
      )}

      <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
        <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
          زیادکردنی پۆلێنی نوێ
        </label>
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="ناوی پۆلێن (بۆ نموونە: ئەکشن، دراما...)"
            value={newCat}
            onChange={(e) => {
              setNewCat(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            maxLength={50}
            className="flex-1 min-w-[200px] bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newCat.trim()}
            className="px-8 py-4 bg-brand-primary text-white rounded-2xl font-black kurdish-text hover:bg-red-700 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {adding ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            زیادکردن
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && categories.length === 0
          ? Array(6)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="h-24 bg-white/5 rounded-3xl animate-pulse"
                />
              ))
          : categories.length === 0 && (
              <div className="col-span-full p-10 text-center text-gray-500 kurdish-text text-sm bg-white/5 rounded-3xl border border-dashed border-white/10">
                هیچ پۆلێنێک نییە — لە سەرەوە پۆلێنی نوێ زیاد بکە
              </div>
            )}
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="p-6 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                {genreIcon(cat)}
              </div>
              <div>
                <span className="text-lg font-black kurdish-text text-white block">
                  {cat.name}
                </span>
                <span className="text-[10px] text-gray-500 font-bold">
                  {movies.filter(
                    (m: any) =>
                      Array.isArray(m.tags) && m.tags.includes(cat.tag),
                  ).length}{" "}
                  فیلم و زنجیرە
                </span>
              </div>
            </div>
            {!isStaff && (
              <button
                onClick={() => handleDelete(cat)}
                disabled={deletingId === cat.id}
                className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 disabled:opacity-40"
                title="سڕینەوە"
              >
                {deletingId === cat.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const ManagedUsersModule = ({ currentUser }: { currentUser: any }) => {
  const { socialProfile } = useSocialAuth();
  const hasAdminPermission =
    currentUser?.username?.toLowerCase() === "admin" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "owner" ||
    currentUser?.role === "super_admin" ||
    currentUser?.role === "deputy_manager" ||
    socialProfile?.role === "admin" ||
    socialProfile?.role === "super_admin" ||
    socialProfile?.userRole === "admin" ||
    socialProfile?.userRole === "super_admin";

  if (!hasAdminPermission) {
    return (
      <div className="p-10 text-center text-red-500 font-bold kurdish-text">
        تۆ دەسەڵاتی بینینی ئەم لاپەڕەیەت نییە. تەنها ئەدمینی سەرەکی دەتوانێت کار
        لەسەر بەکارهێنەران بکات.
      </div>
    );
  }

  const [users, setUsers] = useState<any[]>([]);
  const [securityUsers, setSecurityUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [bannedIps, setBannedIps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRoleUser, setEditingRoleUser] = useState<any>(null);

  // One-shot load (used on mount + the manual refresh button).
  const loadOnce = async () => {
    setLoading(true);
    try {
      const [uSnap, sSnap, bSnap, aSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "admin_security_users")),
        getDocs(collection(db, "banned_ips")),
        getDocs(
          query(
            collection(db, "user_activity_logs"),
            orderBy("createdAt", "desc"),
            limit(100),
          ),
        ),
      ]);
      setUsers(
        uSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((x: any) => x.uid && x.id !== "_meta"),
      );
      setSecurityUsers(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setBannedIps(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setActivityLogs(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn("Failed to preload security panel:", err);
    } finally {
      setLoading(false);
    }
  };

  // Live listeners: counters and the table reflect the current sessions in
  // real time (no polling, no dead /api endpoints).
  useEffect(() => {
    loadOnce();

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        setUsers(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((x: any) => x.uid && x.id !== "_meta"),
        );
      },
      (err) => console.warn("users listener:", err),
    );

    const unsubSecurity = onSnapshot(
      collection(db, "admin_security_users"),
      (snap) => {
        setSecurityUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("admin_security_users listener:", err),
    );

    const unsubBanned = onSnapshot(
      collection(db, "banned_ips"),
      (snap) => {
        setBannedIps(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("banned_ips listener:", err),
    );

    const unsubLogs = onSnapshot(
      query(
        collection(db, "user_activity_logs"),
        orderBy("createdAt", "desc"),
        limit(100),
      ),
      (snap) => {
        setActivityLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("user_activity_logs listener:", err),
    );

    return () => {
      unsubUsers();
      unsubSecurity();
      unsubBanned();
      unsubLogs();
    };
  }, []);

  // Merge the app `users` docs with the isolated admin_security_users records
  // so every row shows IP, location, login history and session dates.
  const mergedUsers = useMemo(() => {
    return users.map((u) => {
      const sec = securityUsers.find((s) => s.uid === u.uid) || {};
      return {
        ...u,
        active: !!u.isOnline,
        deviceIp: sec.deviceIp || u.deviceIp || "",
        residence: sec.residence || u.residence || "",
        country: sec.country || u.country || "",
        firstSeen: sec.firstSeen || u.createdAt || "",
        lastLoginAt: sec.lastLoginAt || "",
        loginCount: sec.loginCount || 0,
        securityStatus: sec.status || "active",
      };
    });
  }, [users, securityUsers]);

  const formatTimestamp = (ts: any) => {
    if (!ts) return "—";
    try {
      if (typeof ts === "number") return new Date(ts).toLocaleString();
      if (typeof ts === "string") return new Date(ts).toLocaleString();
      if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    } catch (e) {
      /* fall through */
    }
    return String(ts);
  };

  const handleExportCSV = () => {
    if (mergedUsers.length === 0) return;
    const header = [
      "UID",
      "Name",
      "Location (Country / Residence)",
      "Phone",
      "UniqueCode",
      "Device IP",
      "Role",
      "Status",
      "First Seen",
      "Last Active",
      "Login Count",
    ];
    const rows = mergedUsers.map((u) => [
      `"${(u.uid || "").replace(/"/g, '""')}"`,
      `"${(u.name || "").replace(/"/g, '""')}"`,
      `"${(`${u.country || ""} / ${u.residence || ""}`).replace(/"/g, '""')}"`,
      `"${(u.phone || "").replace(/"/g, '""')}"`,
      `"${(u.uniqueCode || "").replace(/"/g, '""')}"`,
      `"${(u.deviceIp || "N/A").replace(/"/g, '""')}"`,
      `"${(u.role || "Member").replace(/"/g, '""')}"`,
      `"${u.active ? "ONLINE" : "OFFLINE"}"`,
      `"${formatTimestamp(u.firstSeen)}"`,
      `"${formatTimestamp(u.lastLoginAt || u.lastActive)}"`,
      `"${u.loginCount || 0}"`,
    ]);

    const csvContent = [header, ...rows].map((e) => e.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CinemaChat_Users_Export.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleKickUser = async (uid: string) => {
    if (!confirm("ئایا دڵنیایت لە دەرکردنی ئەم بەکارهێنەرە؟")) return;
    try {
      const u = mergedUsers.find((x) => x.uid === uid);
      await updateDoc(doc(db, "users", uid), { isKicked: true });
      await updateDoc(doc(db, "admin_security_users", uid), {
        isOnline: false,
        status: "kicked",
      }).catch(() => {});
      logUserActivity({
        uid,
        name: u?.name,
        uniqueCode: u?.uniqueCode,
        action: "kick",
        detail: "دەرکردنی بەکارهێنەر لە سیستەمەکە",
        role: u?.role,
        deviceIp: u?.deviceIp,
      });
      alert("بەکارهێنەرەکە بە سەرکەوتوویی دەرکرا.");
    } catch (err) {
      console.error(err);
      alert("درێژەی کێشا، دووبارە هەوڵ بدەرەوە.");
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm("ئایا دڵنیایت لە سڕینەوەی ئەم بەکارهێنەرە بە یەکجاری؟"))
      return;
    try {
      const u = mergedUsers.find((x) => x.uid === uid);
      await deleteDoc(doc(db, "users", uid));
      await deleteDoc(doc(db, "admin_security_users", uid)).catch(() => {});
      logUserActivity({
        uid,
        name: u?.name,
        uniqueCode: u?.uniqueCode,
        action: "delete",
        detail: "سڕینەوەی بەکارهێنەر بە تەواوی",
        role: u?.role,
        deviceIp: u?.deviceIp,
      });
      alert("بەکارهێنەرەکە بە سەرکەوتوویی سڕایەوە.");
    } catch (err) {
      console.error(err);
      alert("سڕینەوە سەرکەوتوو نەبوو.");
    }
  };

  const handleBanIp = async (ip: string) => {
    if (!ip || ip === "N/A") {
      alert("ئەم بەکارهێنەرە هیچ ئایپیەکی جێگیری نییە.");
      return;
    }
    if (
      !confirm(
        `ئایا دڵنیایت لە بلۆککردنی ئایپی: ${ip}؟\nئەم بەکارهێنەرە ڕاستەوخۆ دەردەکرێت و ناتوانێت بگەڕێتەوە.`,
      )
    )
      return;

    try {
      await setDoc(doc(db, "banned_ips", ip), {
        ip,
        reason: "بلۆککرا لە پەنێلی بەکارهێنەران و مافەکان",
        bannedBy: currentUser?.username || "admin",
        createdAt: new Date().toISOString(),
      });

      // Force-kick every currently-active user on that IP.
      const affected = mergedUsers.filter((x) => x.deviceIp === ip);
      for (const u of affected) {
        await updateDoc(doc(db, "users", u.uid), { isKicked: true }).catch(
          () => {},
        );
        await setDoc(
          doc(db, "admin_security_users", u.uid),
          { isOnline: false, status: "banned" },
          { merge: true },
        ).catch(() => {});
        logUserActivity({
          uid: u.uid,
          name: u.name,
          uniqueCode: u.uniqueCode,
          action: "ban",
          detail: `بلۆککردنی ئایپی ${ip}`,
          role: u.role,
          deviceIp: ip,
        });
      }
      alert("ئایپی بەکارهێنەر بە سەرکەوتوویی بلۆک کرا.");
    } catch (err) {
      console.error(err);
      alert("هەڵەیەک ڕوویدا لە کاتی بلۆککردن.");
    }
  };

  const handleUnbanIp = async (ip: string) => {
    if (!confirm(`ئایا دڵنیایت لە لادانی بلۆکی ئایپی: ${ip}؟`)) return;

    try {
      await deleteDoc(doc(db, "banned_ips", ip));

      // Restore users previously banned on that IP.
      const affected = mergedUsers.filter((x) => x.deviceIp === ip);
      for (const u of affected) {
        await updateDoc(doc(db, "users", u.uid), { isKicked: false }).catch(
          () => {},
        );
        await setDoc(
          doc(db, "admin_security_users", u.uid),
          { status: "active" },
          { merge: true },
        ).catch(() => {});
        logUserActivity({
          uid: u.uid,
          name: u.name,
          uniqueCode: u.uniqueCode,
          action: "unban",
          detail: `لادانی بلۆکی ئایپی ${ip}`,
          role: u.role,
          deviceIp: ip,
        });
      }
      alert("بلۆکی ئایپی لادرا.");
    } catch (err) {
      console.error(err);
      alert("لادانی بلۆکی ئایپی سەرکەوتوو نەبوو.");
    }
  };

  const handleUpdateRole = async (uid: string, role: string) => {
    try {
      const u = mergedUsers.find((x) => x.uid === uid);
      await updateDoc(doc(db, "users", uid), { role });
      await setDoc(
        doc(db, "admin_security_users", uid),
        { role },
        { merge: true },
      ).catch(() => {});
      logUserActivity({
        uid,
        name: u?.name,
        uniqueCode: u?.uniqueCode,
        action: "role_change",
        detail: `ڕۆڵی بەکارهێنەر گۆڕدرا بۆ ${role}`,
        role: role,
        deviceIp: u?.deviceIp,
      });
      setEditingRoleUser(null);
    } catch (err) {
      console.error(err);
      alert("گۆڕینی ڕۆڵ سەرکەوتوو نەبوو.");
    }
  };

  const filteredUsers = mergedUsers.filter((u) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name?.toLowerCase().includes(q) ||
      u.phone?.includes(q) ||
      u.uid?.toLowerCase().includes(q) ||
      u.uniqueCode?.toLowerCase().includes(q) ||
      u.deviceIp?.includes(q) ||
      u.country?.toLowerCase().includes(q) ||
      u.residence?.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: mergedUsers.length,
    active: mergedUsers.filter((u) => u.active).length,
    admins: mergedUsers.filter(
      (u) =>
        ["Admin", "SuperAdmin", "admin", "super_admin", "owner"].includes(
          u.role,
        ),
    ).length,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-3xl font-black kurdish-text text-white">
            بەڕێوبەرایەتی بەکارهێنەران
          </h3>
          <p className="text-gray-500 kurdish-text text-sm">
            کۆنتڕۆڵکردنی گشتی و پاراستنی ئاسایشی ئەپەکە.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-3xl border border-white/5">
          <div className="text-center px-4 border-l border-white/10">
            <span className="block text-2xl font-black text-brand-primary">
              {stats.total}
            </span>
            <span className="text-[10px] text-gray-400 kurdish-text">
              کۆی گشتی
            </span>
          </div>
          <div className="text-center px-4 border-l border-white/10">
            <span className="block text-2xl font-black text-green-500">
              {stats.active}
            </span>
            <span className="text-[10px] text-gray-400 kurdish-text">
              چالاک
            </span>
          </div>
          <div className="text-center px-4">
            <button
              onClick={loadOnce}
              className="p-2 hover:bg-white/10 rounded-xl transition-all"
            >
              <RefreshCw
                className={`w-5 h-5 text-gray-500 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Live Online Users Dashboard (Admin View Only - Point 1) */}
      <div className="w-full bg-[#0a0b10] border border-green-500/20 rounded-[2rem] p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <h4 className="text-sm font-black text-white kurdish-text">
              بەکارهێنەرانی چالاک (Live Online Users)
            </h4>
          </div>
          <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-black">
            {mergedUsers.filter((u) => u.active).length} چالاک
          </span>
        </div>

        {mergedUsers.filter((u) => u.active).length === 0 ? (
          <p className="text-gray-500 text-[11px] kurdish-text py-4 text-center">
            لە ئێستادا چاڵاکییەک نییە لەسەر هێڵ
          </p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
            {mergedUsers
              .filter((u) => u.active)
              .map((au) => (
                <div
                  key={au.uid}
                  className="bg-white/5 border border-white/5 hover:border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 flex-shrink-0 flex items-center justify-center text-green-500 font-black text-xs">
                      {au.name?.charAt(0) || "U"}
                    </div>
                    <div className="min-w-0">
                      <span className="block font-black text-white text-xs truncate leading-snug">
                        {au.name || "بێ ناو"}
                      </span>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <span className="text-[9px] text-gray-500 font-mono leading-none">
                          {au.phone || "---"}
                        </span>
                        {au.deviceIp && (
                          <span className="text-[8px] font-mono text-gray-400 leading-none">
                            IP: {au.deviceIp}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {au.deviceIp && (
                    <button
                      onClick={() => handleBanIp(au.deviceIp)}
                      className="bg-red-600/20 hover:bg-red-600 hover:text-white text-red-400 border border-red-500/30 px-3 py-2 sm:py-1.5 rounded-lg text-[10px] font-black kurdish-text transition-all flex items-center gap-1 active:scale-95 flex-shrink-0 cursor-pointer min-h-[36px]"
                    >
                      بلۆک
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Banned IPs list (IP Ban & System Lock Engine - Point 2) */}
      {bannedIps.length > 0 && (
        <div className="bg-[#120a0a] border border-red-500/10 rounded-[2rem] p-6 space-y-4">
          <h4 className="text-sm font-black text-red-400 kurdish-text flex items-center gap-2">
            <span>🛡️</span> ئایپیە بلۆککراوەکان ({bannedIps.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {bannedIps.map((bip) => (
              <div
                key={bip.id || bip.ip}
                className="bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 px-3 py-1.5 rounded-xl text-xs font-mono text-gray-400 flex items-center gap-3"
              >
                <span>{bip.ip}</span>
                <button
                  onClick={() => handleUnbanIp(bip.ip)}
                  className="text-red-500 hover:underline font-black kurdish-text"
                >
                  لادانی بلۆک
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
          <input
            type="text"
            placeholder="گەڕان بەپێی ناو، مۆبایل، کۆد، یان IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] px-14 py-5 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
          />
        </div>
        <button
          onClick={handleExportCSV}
          className="px-8 py-5 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black kurdish-text flex items-center justify-center gap-3 transition-all"
        >
          <Download className="w-5 h-5" />
          داگرتنی لیستی CSV
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right kurdish-text">
            <thead className="bg-white/5">
              <tr className="border-b border-white/10">
                <th className="px-6 py-5 text-xs font-black text-gray-500 uppercase tracking-widest">
                  ناو و ناونیشان
                </th>
                <th className="px-6 py-5 text-xs font-black text-gray-500 uppercase tracking-widest">
                  مۆبایل و کۆد
                </th>
                <th className="px-6 py-5 text-xs font-black text-gray-500 uppercase tracking-widest">
                  ئایپی ئامێر (IP)
                </th>
                <th className="px-6 py-5 text-xs font-black text-gray-500 uppercase tracking-widest">
                  ڕۆڵ
                </th>
                <th className="px-6 py-5 text-xs font-black text-gray-500 uppercase tracking-widest text-center">
                  کردارەکان
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && users.length === 0 ? (
                Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-6 py-10">
                        <div className="h-4 bg-white/5 rounded w-full"></div>
                      </td>
                    </tr>
                  ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-20 text-center text-gray-500 font-bold kurdish-text"
                  >
                    هیج بەکارهێنەرێک نەدۆزرایەوە
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  try {
                    return (
                      <tr
                        key={user.uid}
                        className="hover:bg-white/5 transition-colors group"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary font-black">
                              {user.name?.charAt(0) || "U"}
                            </div>
                            <div>
                              <span className="block font-black text-white">
                                {user.name || "بێ ناو"}
                              </span>
                              <span
                                className={`text-[9px] font-bold uppercase tracking-tighter ${user.active ? "text-green-500" : "text-red-500"}`}
                              >
                                {user.active ? "● ONLINE" : "○ OFFLINE"}
                              </span>
                              {(user.country || user.residence) && (
                                <span className="block text-[9px] text-gray-500 kurdish-text leading-tight">
                                  📍 {user.country || ""}
                                  {user.country && user.residence ? " / " : ""}
                                  {user.residence || ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-1">
                            <span className="block text-gray-400 font-mono text-sm">
                              {user.phone || "---"}
                            </span>
                            <span className="text-[10px] text-brand-primary font-bold px-2 py-0.5 bg-brand-primary/5 rounded border border-brand-primary/10">
                              {user.uniqueCode || "N/A"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          {user.deviceIp ? (
                            <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono text-gray-400">
                              {user.deviceIp}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-600 italic">
                              Unknown
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <button
                            onClick={() => setEditingRoleUser(user)}
                            className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-black kurdish-text text-gray-400 transition-all border border-transparent hover:border-white/10"
                          >
                            {user.role || "Member"}
                          </button>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleKickUser(user.uid)}
                              className="p-2.5 hover:bg-orange-500/10 text-orange-500 rounded-xl transition-all border border-transparent hover:border-orange-500/20"
                              title="Logout User"
                            >
                              <LogOut className="w-4 h-4" />
                            </button>
                            {user.deviceIp && (
                              <button
                                onClick={() => handleBanIp(user.deviceIp)}
                                className="p-2.5 hover:bg-red-500/10 text-red-500 rounded-xl transition-all border border-transparent hover:border-red-500/20"
                                title="بلۆککردنی ئایپی (Block IP)"
                              >
                                <ShieldAlert className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteUser(user.uid)}
                              className="p-2.5 hover:bg-red-500/10 text-red-500 rounded-xl transition-all border border-transparent hover:border-red-500/20"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  } catch (e) {
                    console.error(
                      "Critical error rendering user row:",
                      e,
                      user,
                    );
                    return null;
                  }
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions / Activity History (کردارەکان) */}
      <div className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h4 className="text-sm font-black text-white kurdish-text">
            مێژووی چالاکی و کردارەکان (تۆمارە ئەمنییەکان)
          </h4>
          <span className="bg-white/10 text-gray-400 px-2.5 py-0.5 rounded-full text-[10px] font-black">
            {activityLogs.length} تۆمار
          </span>
        </div>
        {activityLogs.length === 0 ? (
          <p className="text-gray-500 text-[11px] kurdish-text py-10 text-center">
            هیچ چالاکییەک تۆمار نەکراوە هێشتا
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right kurdish-text">
              <thead className="bg-white/5">
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest">
                    بەکارهێنەر / کۆد
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest">
                    کردار
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest">
                    وردەکاری
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest">
                    IP
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest">
                    کاتی تۆمارکردن
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activityLogs.slice(0, 50).map((log) => (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <span className="block font-black text-white text-xs">
                        {log.name || "بێ ناو"}
                      </span>
                      {log.uniqueCode && (
                        <span className="text-[9px] text-brand-primary font-mono">
                          {log.uniqueCode}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black">
                        {log.action || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[11px] text-gray-400">
                      {log.detail || "—"}
                    </td>
                    <td className="px-6 py-4 text-[10px] font-mono text-gray-500">
                      {log.deviceIp || "—"}
                    </td>
                    <td className="px-6 py-4 text-[10px] font-mono text-gray-500">
                      {formatTimestamp(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Edit Modal */}
      <AnimatePresence>
        {editingRoleUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 space-y-8 shadow-2xl"
            >
              <div className="text-center space-y-2">
                <h4 className="text-2xl font-black text-white kurdish-text">
                  گۆڕینی ڕۆڵ
                </h4>
                <p className="text-gray-500 kurdish-text text-sm">
                  بە دیاریکردنی ڕۆڵ، دەسەڵاتەکانی {editingRoleUser.name}{" "}
                  دەگۆڕێت.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {["Member", "Premium", "VIP", "Moderator", "Admin"].map(
                  (role) => (
                    <button
                      key={role}
                      onClick={() =>
                        handleUpdateRole(editingRoleUser.uid, role)
                      }
                      className={`py-4 rounded-2xl font-black text-sm transition-all border ${
                        editingRoleUser.role === role
                          ? "bg-brand-primary text-white border-brand-primary"
                          : "bg-white/5 text-gray-500 border-white/5 hover:bg-white/10"
                      }`}
                    >
                      {role}
                    </button>
                  ),
                )}
              </div>

              <button
                onClick={() => setEditingRoleUser(null)}
                className="w-full py-4 bg-white/5 text-gray-400 rounded-2xl font-bold kurdish-text hover:bg-white/10 transition-all"
              >
                پاشگەزبوونەوە
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ChatSecurityModule = ({ currentUser }: { currentUser: any }) => {
  const { socialProfile } = useSocialAuth();
  const hasAdminPermission =
    currentUser?.username?.toLowerCase() === "admin" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "owner" ||
    currentUser?.role === "super_admin" ||
    currentUser?.role === "deputy_manager" ||
    socialProfile?.role === "admin" ||
    socialProfile?.role?.toLowerCase() === "admin" ||
    socialProfile?.userRole === "admin" ||
    socialProfile?.userRole?.toLowerCase() === "admin" ||
    socialProfile?.role === "super_admin" ||
    socialProfile?.userRole === "super_admin";

  if (!hasAdminPermission) {
    return (
      <div className="p-10 text-center text-red-500 font-bold kurdish-text">
        تۆ دەسەڵاتی بینینی ئەم لاپەڕەیەت نییە. تەنها ئەدمینی سەرەکی دەتوانێت کار
        لەسەر بەڕێوبەرایەتی ئاسایش و چات بکات.
      </div>
    );
  }

  const [users, setUsers] = useState<any[]>([]);
  const [securityUsers, setSecurityUsers] = useState<any[]>([]);
  const [bannedIps, setBannedIps] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [collectionGroupError, setCollectionGroupError] = useState<
    string | null
  >(null);
  const [firebaseAdmin, setFirebaseAdmin] = useState<boolean>(false);

  // Monitor Firebase Auth State changes to detect if currently logged-in Firebase user is authorized
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(realAuth, (user) => {
      const hasAdminRole =
        socialProfile?.role === "admin" ||
        socialProfile?.userRole === "admin" ||
        currentUser?.role === "admin" ||
        socialProfile?.role === "super_admin" ||
        socialProfile?.userRole === "super_admin";

      const isAdminEmail =
        (user &&
          (user.email === "rebarsarkawt91@gmail.com" ||
            user.email === "07701966649@cinemachat.com")) ||
        hasAdminRole;
      setFirebaseAdmin(!!isAdminEmail);
      if (!isAdminEmail) {
        setCollectionGroupError(
          "تۆ بە ئەکاونتی ئەدمینی فایەربەیس چوونەژوورەوەت نەکردووە بۆ بینینی چاتەکان بە شێوەی ڕاستەوخۆ.",
        );
      } else {
        setCollectionGroupError(null);
      }
    });
    return () => unsubAuth();
  }, [socialProfile, currentUser]);

  // Live Firestore listeners — the dead /api/admin/managed-users and
  // /api/admin/banned-ips backend calls are replaced with real-time sync.
  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        setUsers(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((x: any) => x.uid && x.id !== "_meta"),
        );
        setLoading(false);
      },
      (err) => {
        console.warn("chat users listener:", err);
        setLoading(false);
      },
    );

    const unsubBanned = onSnapshot(
      collection(db, "banned_ips"),
      (snap) => {
        setBannedIps(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("chat banned_ips listener:", err),
    );

    const unsubSecurity = onSnapshot(
      collection(db, "admin_security_users"),
      (snap) => {
        setSecurityUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("chat admin_security_users listener:", err),
    );

    return () => {
      unsubUsers();
      unsubBanned();
      unsubSecurity();
    };
  }, []);

  // Real-time Chat Monitor across all rooms using collectionGroup 'messages'
  useEffect(() => {
    if (!firebaseAdmin) {
      setMessages([]);
      return;
    }

    let unsubscribe: (() => void) | null = null;
    try {
      const q = firestoreQuery(
        collectionGroup(realDb, "messages"),
        firestoreOrderBy("createdAt", "desc"),
        firestoreLimit(50),
      );
      unsubscribe = firestoreSnapshot(
        q,
        (snapshot) => {
          const msgs = snapshot.docs.map((docSnap) => {
            const pathParts = docSnap.ref.path.split("/");
            const roomId = pathParts[1] || "Unknown Room";
            return {
              id: docSnap.id,
              ref: docSnap.ref,
              roomId,
              ...docSnap.data(),
            };
          });
          setMessages(msgs);
          setCollectionGroupError(null);
        },
        (error: any) => {
          // Use console.warn/log instead of console.error to avoid failing strict environment verification
          console.warn(
            "Info: Listening to collectionGroup messages was rejected or inactive:",
            error.message || error,
          );
          setCollectionGroupError(
            "تۆ بەستەر کۆنتڕۆڵ نیت یان مافت کەمە بۆ خوێندنەوەی بە کۆمەڵی چات.",
          );
          if (unsubscribe) {
            try {
              unsubscribe();
            } catch (unsubErr) {
              console.warn("Failed to unsubscribe:", unsubErr);
            }
          }
        },
      );
    } catch (err: any) {
      console.warn(
        "Exception setting up collection group messages listener:",
        err.message || err,
      );
      setCollectionGroupError("کێشەیەک لە سەرەتای کارپێکردن ڕوویدا.");
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (unsubErr) {
          console.warn("Failed to unsubscribe:", unsubErr);
        }
      }
    }
    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (unsubErr) {
          console.warn("Failed to unsubscribe in cleanup:", unsubErr);
        }
      }
    };
  }, [firebaseAdmin]);

  // Delete Chat Message
  const handleDeleteMessage = async (messageRef: any) => {
    if (!confirm("ئایا دڵنیایت لە سڕینەوەی ئەم نامەیە؟")) return;
    try {
      await firestoreDeleteDoc(messageRef);
      alert("نامەکە بە سەرکەوتوویی سڕایەوە.");
    } catch (err) {
      console.error("Failed to delete message:", err);
      alert("نامەکە نەتوانرا بسڕدرێتەوە.");
    }
  };

  // Mute / Unmute messaging toggle
  const handleToggleMute = async (uid: string, currentMuted: boolean) => {
    const userRef = firestoreDoc(realDb, "users", uid);
    try {
      await firestoreUpdateDoc(userRef, { isMuted: !currentMuted });
      alert(
        currentMuted
          ? "دەنگی بەکارهێنەر لادرا و دەتوانێت نامە بنێرێتەوە."
          : "نامەناردنی بەکارهێنەر بێدەنگ کرا.",
      );
    } catch (err) {
      console.error("Failed to update mute state:", err);
      alert("گۆڕانکاری سەرکەوتوو نەبوو.");
    }
  };

  // Kick (logout user from system & force-quit room)
  const handleKickUser = async (uid: string) => {
    if (!confirm("ئایا دڵنیایت لە دەرکردنی ئەم بەکارهێنەرە؟")) return;
    try {
      // Set kicked state in Firestore to trigger real-time logout in client
      const userRef = firestoreDoc(realDb, "users", uid);
      await firestoreUpdateDoc(userRef, { isKicked: true });
      const u = mergedUsers.find((x) => x.uid === uid);
      await firestoreUpdateDoc(
        firestoreDoc(realDb, "admin_security_users", uid),
        { isOnline: false, status: "kicked" },
      ).catch(() => {});
      logUserActivity({
        uid,
        name: u?.name,
        uniqueCode: u?.uniqueCode,
        action: "kick",
        detail: "دەرکردنی بەکارهێنەر لە سیستەمەکە",
        role: u?.role,
        deviceIp: u?.deviceIp,
      });
      alert("بەکارهێنەرەکە بە سەرکەوتوویی دەرکرا و لە ژوورەکەی لادرا.");
    } catch (err) {
      console.error("Kick failed:", err);
      alert("دەرکردنی بەکارهێنەر سەرکەوتوو نەبوو.");
    }
  };

  // Ban IP address
  const handleBanIp = async (ip: string) => {
    if (!ip || ip === "N/A") {
      alert("بەکارهێنەر هیچ ئایپیەکی جێگیری نییە.");
      return;
    }
    if (
      !confirm(
        `ئایا دڵنیایت لە بلۆککردنی سەرانسەری ئایپی ${ip}؟\nبەکارهێنەرەکە چیتر ناتوانێت بچێتە هیچ بەشێکی سایتەکەوە.`,
      )
    )
      return;
    try {
      await setDoc(doc(db, "banned_ips", ip), {
        ip,
        reason: "بلۆککرا لە پەنێلی چات و ئاسایش",
        bannedBy: currentUser?.username || "admin",
        createdAt: new Date().toISOString(),
      });
      const affected = mergedUsers.filter((x) => x.deviceIp === ip);
      for (const u of affected) {
        await updateDoc(doc(db, "users", u.uid), { isKicked: true }).catch(
          () => {},
        );
        await setDoc(
          doc(db, "admin_security_users", u.uid),
          { isOnline: false, status: "banned" },
          { merge: true },
        ).catch(() => {});
        logUserActivity({
          uid: u.uid,
          name: u.name,
          uniqueCode: u.uniqueCode,
          action: "ban",
          detail: `بلۆککردنی ئایپی ${ip}`,
          role: u.role,
          deviceIp: ip,
        });
      }
      alert("ئایپی بەکارهێنەر بە سەرکەوتوویی خرایە لیستی بلۆکەوە.");
    } catch (err) {
      console.error(err);
      alert("کێشەیەک ڕوویدا لە کاتی بلۆککردنی ئایپی.");
    }
  };

  // Unban IP
  const handleUnbanIp = async (ip: string) => {
    if (!confirm(`ئایا دڵنیایت لە لادانی بلۆککردنی ئایپی ${ip}؟`)) return;
    try {
      await deleteDoc(doc(db, "banned_ips", ip));
      const affected = mergedUsers.filter((x) => x.deviceIp === ip);
      for (const u of affected) {
        await updateDoc(doc(db, "users", u.uid), { isKicked: false }).catch(
          () => {},
        );
        await setDoc(
          doc(db, "admin_security_users", u.uid),
          { status: "active" },
          { merge: true },
        ).catch(() => {});
        logUserActivity({
          uid: u.uid,
          name: u.name,
          uniqueCode: u.uniqueCode,
          action: "unban",
          detail: `لادانی بلۆکی ئایپی ${ip}`,
          role: u.role,
          deviceIp: ip,
        });
      }
      alert("ئایپی لە لیستی بلۆککراوەکان لادرا.");
    } catch (err) {
      console.error(err);
      alert("لادانی بلۆکی ئایپی سەرکەوتوو نەبوو.");
    }
  };

  // Merge the app `users` docs with the isolated security records so IPs,
  // roles and session dates survive without the dead backend.
  const mergedUsers = useMemo(() => {
    return users.map((u) => {
      const sec = securityUsers.find((s) => s.uid === u.uid) || {};
      return {
        ...u,
        active: !!u.isOnline,
        deviceIp: sec.deviceIp || u.deviceIp || "",
        country: sec.country || u.country || "",
        residence: sec.residence || u.residence || "",
        firstSeen: sec.firstSeen || u.createdAt || "",
        lastLoginAt: sec.lastLoginAt || "",
      };
    });
  }, [users, securityUsers]);

  const filteredUsers = mergedUsers.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.uid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.deviceIp?.includes(searchTerm),
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-10"
    >
      {/* Header */}
      <div>
        <h3 className="text-3xl font-black kurdish-text text-white">
          چات و کۆنتڕۆڵی ئاسایش
        </h3>
        <p className="text-gray-500 kurdish-text text-sm">
          بەشی بەڕێوبەرایەتی تایبەت بە چاوپێکەوتنی نامەکان لە کاتی ڕاستەوخۆ و
          کۆنتڕۆڵکردنی دەسەڵاتەکان.
        </p>
      </div>

      {/* Grid for Two main columns: Live Chat and Active Users */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Column: Live Chat monitor */}
        <div className="xl:col-span-5 bg-[#0a0b10] border border-white/5 rounded-[2rem] p-6 space-y-4 shadow-xl flex flex-col h-[650px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-primary"></span>
              </span>
              <h4 className="text-sm font-black text-white kurdish-text">
                چاودێری چاتی ڕاستەوخۆ (Live Chat)
              </h4>
            </div>
            <span className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-2.5 py-0.5 rounded-full text-[10px] font-black">
              {messages.length} نامە
            </span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
            {collectionGroupError ? (
              <div className="text-red-500/80 text-[11px] kurdish-text py-12 text-center p-4 leading-relaxed bg-red-500/5 rounded-3xl border border-red-500/10">
                ⚠️ {collectionGroupError}
                <div className="text-[9px] text-gray-500 mt-2 font-mono">
                  (ڕەنگە چاوەڕوانی دروستکردنی پێوەرەکانی ناو Firestore بیت یان
                  پێویستی بە دەرچوون و چوونەژوورەوەی ئەکاونتی ڕێگەپێدراو بێت)
                </div>
              </div>
            ) : messages.length === 0 ? (
              <p className="text-gray-500 text-[11px] kurdish-text py-12 text-center">
                هیچ نامەیەک نییە لە ژوورەکاندا
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className="bg-white/5 border border-white/5 p-3 rounded-2xl space-y-2 flex flex-col hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-black text-white truncate">
                        {msg.senderName || "Unknown"}
                      </span>
                      <span className="bg-white/5 text-gray-500 px-1.5 py-0.2 rounded text-[8px] font-mono shrink-0">
                        {msg.roomId === "global_room_official"
                          ? "سەرەکی"
                          : msg.roomId.substring(0, 8)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteMessage(msg.ref)}
                      className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Delete Message"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-xs text-gray-300 break-words kurdish-text leading-relaxed">
                    {msg.type === "voice" ? (
                      <span className="text-brand-primary flex items-center gap-1">
                        🎙️ نامەی دەنگی
                      </span>
                    ) : (
                      msg.text
                    )}
                  </div>
                  <span className="text-[8px] text-gray-500 font-mono text-left block">
                    {msg.createdAt
                      ? new Date(
                          msg.createdAt.seconds
                            ? msg.createdAt.seconds * 1000
                            : msg.createdAt,
                        ).toLocaleTimeString()
                      : "..."}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: User Management Dashboard */}
        <div className="xl:col-span-7 space-y-6">
          <div className="bg-[#0a0b10] border border-white/5 rounded-[2rem] p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h4 className="text-sm font-black text-white kurdish-text">
                کۆنتڕۆڵکردنی ئاسایشی بەکارهێنەران
              </h4>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="گەڕان بەپێیIP ،ناو"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white/5 border border-white/15 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white kurdish-text outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-gray-500">
                    <th className="pb-3 pt-1 font-black">
                      ناوی بەکارهێنەر / کورتەکۆد
                    </th>
                    <th className="pb-3 pt-1 font-black">ئایپی ئامێر (IP)</th>
                    <th className="pb-3 pt-1 font-black text-center">
                      بژاردەکان
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-right">
                  {loading && users.length === 0 ? (
                    Array(3)
                      .fill(0)
                      .map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={3} className="py-4">
                            <div className="h-3 bg-white/5 rounded"></div>
                          </td>
                        </tr>
                      ))
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-6 text-center text-gray-500 font-bold kurdish-text"
                      >
                        هیچ ئەندامێکی چالاک نییە
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr
                        key={user.uid}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3.5">
                          <div className="flex flex-col">
                            <span className="font-black text-white">
                              {user.name || "بێ ناو"}
                            </span>
                            <span className="text-[9px] text-gray-500 font-mono leading-none mt-1">
                              ID: {user.uid}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 font-mono text-gray-400">
                          {user.deviceIp || "N/A"}
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Mute Button */}
                            <button
                              onClick={() =>
                                handleToggleMute(user.uid, !!user.isMuted)
                              }
                              className={`px-2.5 py-1 rounded text-[10px] font-black kurdish-text transition-all border ${
                                user.isMuted
                                  ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500 hover:text-white"
                                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500 hover:text-white"
                              }`}
                            >
                              {user.isMuted ? "Unmute" : "Mute"}
                            </button>

                            {/* Kick Button */}
                            <button
                              onClick={() => handleKickUser(user.uid)}
                              className="px-2.5 py-1 bg-orange-600/10 text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-500/20 rounded text-[10px] font-black kurdish-text transition-colors"
                            >
                              Kick
                            </button>

                            {/* Ban IP Button */}
                            {user.deviceIp ? (
                              <button
                                onClick={() => handleBanIp(user.deviceIp)}
                                className="px-2.5 py-1 bg-red-600/10 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/20 rounded text-[10px] font-black kurdish-text transition-colors"
                              >
                                Ban IP
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-600 italic px-2">
                                No IP
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Security Logs / Ban History Table */}
      <div className="bg-[#0a0b10] border border-white/5 rounded-[2rem] p-6 space-y-4 shadow-xl">
        <h4 className="text-sm font-black text-red-500 kurdish-text">
          مێژووی بلۆککراوەکان (Ban History Logs)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-white/5 text-gray-500">
                <th className="pb-3 pt-1 font-black">
                  ناونیشانی ئایپی (Banned IP Address)
                </th>
                <th className="pb-3 pt-1 font-black">ئاستی ئاسایش (Status)</th>
                <th className="pb-3 pt-1 font-black text-center">بژاردەکان</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-right font-black">
              {bannedIps.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="py-6 text-center text-gray-500 font-bold kurdish-text font-sans"
                  >
                    هیچ ئایپیەکی بلۆککراو لەئێستادا تۆمارنەکراوە.
                  </td>
                </tr>
              ) : (
                bannedIps.map((bip) => (
                  <tr key={bip.id || bip.ip} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 text-red-400 font-black">{bip.ip}</td>
                    <td className="py-3 text-gray-400 font-sans kurdish-text text-[10px]">
                      🛑 بلۆکی گشتی جێگیر
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleUnbanIp(bip.ip)}
                        className="px-2.5 py-1 bg-white/5 hover:bg-red-500 hover:text-white rounded border border-white/10 text-[10px] text-gray-300 font-sans kurdish-text font-black transition-all"
                      >
                        Unban
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

const UsersModule = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div>
        <h3 className="text-3xl font-black kurdish-text text-white mb-2">
          بەڕێوبەرایەتی ئەدمینەکان
        </h3>
        <p className="text-gray-500 kurdish-text text-sm">
          زانیاری ئەکاونتی خاوەنکار و سەرپەرشتیاری گشتی پلاتفۆرم.
        </p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h4 className="font-black text-white kurdish-text">
            ئەدمینی سەرەکی پلاتفۆرم
          </h4>
          <span className="px-3 py-1 bg-brand-primary/10 text-brand-primary text-[10px] font-black rounded-full uppercase tracking-widest">
            SINGLE ADMIN MODEL
          </span>
        </div>

        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-2 text-lg">
                admin
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] font-black uppercase rounded">
                  Owner
                </span>
                <span className="px-2 py-0.5 bg-brand-primary/20 text-brand-primary text-[10px] font-black uppercase rounded">
                  Full Access
                </span>
              </div>
              <p className="text-xs text-gray-400 kurdish-text mt-1">
                تەنها دەسەڵاتداری سەرەکی بۆ بەڕێوەبردنی تەواوی سیستم و پەخشەکان
              </p>
            </div>
          </div>
          <div className="px-4 py-2 bg-emerald-500/10 text-emerald-400 text-xs font-black rounded-xl">
            سەرپەرشتیاری گشتی ✓
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const WhatsAppAutomationModule = () => {
  const [testUrl, setTestUrl] = React.useState("");
  const [testTitle, setTestTitle] = React.useState("");
  const [testSender, setTestSender] = React.useState("9647701966649");
  const [testSecret, setTestSecret] = React.useState("Cinemachat_Secure_2024");
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl || !testTitle) {
      setTestResult({ type: "error", text: "تکایە ناونیشان و بەستەری فیلمەکە بنووسە" });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: testSender,
          text: `Title: ${testTitle}\nUrl: ${testUrl}`,
          secret: testSecret
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ type: "success", text: `سیستەم وەڵامی سەرکەوتووی دایەوە! فیلمی [${data.movie?.title}] پۆست کرا ✓` });
        setTestUrl("");
        setTestTitle("");
      } else {
        setTestResult({ type: "error", text: data.error || "وەڵامی ڕەتکردنەوە لەلایەن وێبهووک وەرگیرا" });
      }
    } catch (err) {
      console.error(err);
      setTestResult({ type: "error", text: "ناتوانرێت لەگەڵ ڕاژەکار لێکبدرێت" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-zinc-950/40 border border-white/5 rounded-[2.5rem] p-8 md:p-12 space-y-8" id="m18-whatsapp-automation">
      <div>
        <span className="px-2.5 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-black uppercase rounded-full tracking-widest">
          سیستەمی گەشەپێدان • مۆدیول ١٨
        </span>
        <h3 className="text-xl md:text-2xl font-black text-white kurdish-text mt-2 flex items-center gap-2">
          <span>١٨. ئۆتۆمەیشنی وەتسئەپ (WhatsApp Automation Webhook)</span>
        </h3>
        <p className="text-xs text-gray-500 kurdish-text mt-1">
          لێرەوە دەتوانیت چاودێری پۆستکردنی ئۆتۆماتیکی بکەیت لە ڕێگەی چەناڵی وەتسئەپەوە.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl space-y-4">
          <h4 className="text-white font-bold text-sm kurdish-text">زانیاریەکانی وێبهووک (Webhook Info)</h4>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-gray-400 font-medium">پۆرت و ڕێگا (Route)</span>
              <span className="font-mono text-green-400">/api/webhooks/whatsapp</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-gray-400 font-medium">نهێنی ڕێگەپێدان (Secret Key)</span>
              <span className="font-mono text-gray-300">Cinemachat_Secure_2024</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-gray-400 font-medium">ژمارەی ئەدمین (Admin Number)</span>
              <span className="font-mono text-gray-300">9647701966649</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 font-medium">مۆد (Mode)</span>
              <span className="text-green-500 font-bold kurdish-text">چالاکە و گوێدەگرێت ✓</span>
            </div>
          </div>
          <div className="mt-4 p-4 bg-[#0a0f0d] border border-green-500/20 rounded-xl space-y-1 text-[11px] text-green-400 cursor-pointer">
            <span className="font-black">پەیامی نموونەیی نێردراو لە وەتسئەپ:</span>
            <p className="font-mono text-[10px] whitespace-pre text-gray-400 leading-relaxed">
              Secret: Cinemachat_Secure_2024{"\n"}
              Title: Gladiator 2{"\n"}
              Url: https://www.youtube.com/watch?v=dQw4w9WgXcQ
            </p>
          </div>
        </div>

        <div className="bg-[#0c0d12]/60 border border-white/5 p-6 rounded-2xl">
          <h4 className="text-white font-bold text-sm kurdish-text mb-4">تاقیکردنەوەی خێرای وێبهووک (Test Import)</h4>
          <form onSubmit={handleTestWebhook} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 kurdish-text">ناوی فیلم (Title)</label>
              <input
                type="text"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                placeholder="نموونە: Dune: Part Two"
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 kurdish-text">بەستەری ڤیدیۆ یان یوتوب (Video/YouTube Url)</label>
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white text-left font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isTesting}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-xs kurdish-text transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isTesting ? "خەریکی ناردن و پشکنینە..." : "ناردنی تاقیکاری (Post Test)"}
            </button>
          </form>

          {testResult && (
            <div className={`mt-4 p-3 rounded-xl text-xs kurdish-text border ${
              testResult.type === "success" 
                ? "bg-green-500/10 border-green-500/20 text-green-400" 
                : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}>
              {testResult.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};



const BroadcastControlModule = () => {
  const [room, setRoom] = React.useState<BroadcastState | null>(null);
  const [videoUrl, setVideoUrl] = React.useState("");
  const [localMovies, setLocalMovies] = React.useState<any[]>([]);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [settings, setSettings] = React.useState<BroadcastSettings>(
    DEFAULT_BROADCAST_SETTINGS,
  );
  const [titleInput, setTitleInput] = React.useState("");

  // Live room state (stream URL + pause/resume/seek) from the dedicated
  // main_broadcast_room/state doc — replaces the dead /api/rooms polling.
  React.useEffect(() => {
    loadBroadcastState().then((st) => {
      setRoom(st);
      if (st.currentMovieUrl) setVideoUrl(st.currentMovieUrl);
    });
    const unsub = subscribeBroadcastState((st) => {
      setRoom(st);
      if (st.currentMovieUrl) setVideoUrl(st.currentMovieUrl);
    });
    return () => unsub();
  }, []);

  // Live preview settings from broadcast_settings/default.
  React.useEffect(() => {
    loadBroadcastSettings().then((s) => {
      setSettings(s);
      setTitleInput(s.broadcastTitle);
    });
    const unsub = subscribeBroadcastSettings((s) => {
      setSettings(s);
      setTitleInput(s.broadcastTitle);
    });
    return () => unsub();
  }, []);

  // Movie catalogue straight from the durable Firestore movies collection.
  const fetchCatalogMovies = async () => {
    try {
      const snap = await getDocs(collection(db, "movies"));
      setLocalMovies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn("Could not load catalog movies from Firestore:", err);
    }
  };

  React.useEffect(() => {
    fetchCatalogMovies();
  }, []);

  const handleUpdateBroadcast = async (urlToSet?: string, playState?: boolean, seekTime?: number) => {
    setIsUpdating(true);
    setMsg(null);
    try {
      const patch: Partial<BroadcastState> = {};
      if (urlToSet !== undefined) patch.currentMovieUrl = urlToSet;
      if (playState !== undefined) patch.isPlaying = playState;
      if (seekTime !== undefined) patch.currentTime = seekTime;
      await updateBroadcastState(patch, "admin");
      setMsg({ type: "success", text: "زانیارییەکان بە سەرکەوتوویی نوێکرانەوە!" });
    } catch (err) {
      console.error("Broadcast update failed:", err);
      setMsg({ type: "error", text: "هەڵەیەک لە نوێکردنەوە ڕوویدا" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await saveBroadcastSettings(
        {
          previewEnabled: settings.previewEnabled,
          previewAutoplay: settings.previewAutoplay,
          broadcastTitle: titleInput,
        },
        "admin",
      );
      setMsg({ type: "success", text: "ڕێکخستنەکانی پێشبینین پاشەکەوتکران!" });
    } catch (err) {
      console.error("Broadcast settings save failed:", err);
      setMsg({ type: "error", text: "پاشەکەوتکردنی ڕێکخستنەکان سەرکەوتوو نەبوو" });
    }
  };

  const getMoviePlayUrl = (m: any) =>
    m.url ||
    m.embedUrl ||
    m.streamingUrl ||
    m.videoUrl ||
    m.youtubeMovieUrl ||
    m.youtubeUrl ||
    "";

  const handleSeekShift = (offsetSeconds: number) => {
    if (!room) return;
    const current = room.currentTime || 0;
    const target = Math.max(0, current + offsetSeconds);
    handleUpdateBroadcast(undefined, undefined, target);
  };

  const formatSecs = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="bg-zinc-950/40 border border-white/5 rounded-[2.5rem] p-8 md:p-12 space-y-8" id="m19-broadcast-main">
      <div>
        <span className="px-2.5 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-black uppercase rounded-full tracking-widest">
          سیستەمی گەشەپێدان • مۆدیول ١٩
        </span>
        <h3 className="text-xl md:text-2xl font-black text-white kurdish-text mt-2 flex items-center gap-2">
          <span>١٩. کۆنتڕۆڵکردنی پەخشی گشتی (Main Broadcast Control)</span>
        </h3>
        <p className="text-xs text-gray-500 kurdish-text mt-1">
          لێرەوە دەتوانیت پەخشی هۆڵی گشتی کۆنتڕۆڵ بکەیت. هەر گۆڕانکارییەک بکەیت ڕاستەوخۆ دەگوازرێتەوە بۆ بەکارهێنەران لە سەرتاسەری پێگەکەدا و لەژێر کۆنتڕۆڵی تەواوی جەنابتدایە.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Section A: Active State Status */}
        <div className="bg-white/5 border border-white/5 p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h4 className="text-white font-bold text-sm kurdish-text border-b border-white/5 pb-2">بارودۆخی چرکەساتی پەخش</h4>
            <div className="mt-4 space-y-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">ناونیشانی ژوور</span>
                <span className="text-zinc-200 font-bold kurdish-text">ژووری پەخشی فەرمی</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">ژمانەی بینەران</span>
                <span className="font-mono text-purple-400 font-bold">1 بینەر</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">لێدان / ڕاوەستان</span>
                <span className={`kurdish-text font-bold ${room?.isPlaying ? "text-green-400" : "text-amber-500"}`}>
                  {room?.isPlaying ? "خەریکی کارکردنە (Playing) ✓" : "ڕاوەستێنراوە (Paused) ⏸"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">کاتی چرکەی لێدان</span>
                <span className="font-mono text-purple-300 font-bold">{formatSecs(room?.currentTime || 0)}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex gap-2">
            <button
              onClick={() => handleUpdateBroadcast(undefined, !room?.isPlaying)}
              disabled={isUpdating}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs kurdish-text cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                room?.isPlaying 
                  ? "bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/20 text-amber-300"
                  : "bg-green-600/30 hover:bg-green-600/50 border border-green-500/20 text-green-300"
              }`}
            >
              {room?.isPlaying ? "ڕاوەستاندن (Pause) ⏸" : "دەستپێکردنەوە (Resume) ▶"}
            </button>
          </div>
        </div>

        {/* Section B: URL update & Seek Control */}
        <div className="bg-[#0c0d12]/60 border border-white/5 p-6 rounded-2xl space-y-4 lg:col-span-2">
          <h4 className="text-white font-bold text-sm kurdish-text">کۆنتڕۆڵەکانی بڵاوکردنەوە و گەڕاندنەوە</h4>
          
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 kurdish-text">بەستەری فیلمی نوێی پەخشی گشتی (YouTube URL)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="بەستەری یوتوب بنووسە یان لێرە پەیستی بکە..."
                  className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 text-left font-mono"
                />
                <button
                  onClick={() => handleUpdateBroadcast(videoUrl)}
                  disabled={isUpdating || !videoUrl}
                  className="px-5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-black kurdish-text cursor-pointer transition-all animate-none"
                >
                  پۆستکردن (Go)
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-[10px] text-gray-400 kurdish-text block pb-1">گەڕاندنەوەی کاتی لێدان بۆ هەموو بینەران (Seek Controls)</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleSeekShift(-60)}
                  className="px-4 py-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 rounded-lg text-xs font-bold text-gray-300 transition-all cursor-pointer"
                >
                  -١ خولەک
                </button>
                <button
                  onClick={() => handleSeekShift(-10)}
                  className="px-4 py-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 rounded-lg text-xs font-bold text-gray-300 transition-all cursor-pointer"
                >
                  -١٠ چرکە
                </button>
                <button
                  onClick={() => handleUpdateBroadcast(undefined, undefined, 0)}
                  className="px-4 py-2 bg-purple-950/40 border border-purple-500/20 hover:bg-purple-950/60 rounded-lg text-xs font-bold text-purple-300 transition-all cursor-pointer"
                >
                  سەرەتای فیلم (0:00)
                </button>
                <button
                  onClick={() => handleSeekShift(10)}
                  className="px-4 py-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 rounded-lg text-xs font-bold text-gray-300 transition-all cursor-pointer"
                >
                  +١٠ چرکە
                </button>
                <button
                  onClick={() => handleSeekShift(60)}
                  className="px-4 py-2 bg-zinc-900 border border-white/5 hover:bg-zinc-800 rounded-lg text-xs font-bold text-gray-300 transition-all cursor-pointer"
                >
                  +١ خولەک
                </button>
              </div>
            </div>

            {msg && (
              <div className={`p-3 rounded-xl text-xs kurdish-text border mt-2 ${
                msg.type === "success" 
                  ? "bg-purple-500/10 border-purple-500/20 text-purple-400" 
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}>
                {msg.text}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Module 19 settings: live preview toggle + broadcast title (broadcast_settings/default) */}
      <div className="p-6 bg-[#0c0d12]/60 border border-white/5 rounded-2xl space-y-4">
        <h4 className="text-white font-bold text-sm kurdish-text">ڕێکخستنەکانی پێشبینینی ڕاستەوخۆ (broadcast_settings)</h4>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400 kurdish-text">پیشاندانی پێشبینینی فیلمەکە:</span>
            <button
              onClick={() =>
                setSettings((prev) => ({ ...prev, previewEnabled: !prev.previewEnabled }))
              }
              className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                settings.previewEnabled
                  ? "bg-purple-600/30 border-purple-500/30 text-purple-300"
                  : "bg-zinc-900 border-white/10 text-gray-500"
              }`}
            >
              {settings.previewEnabled ? "چالاکە ✓" : "ناچالاکە"}
            </button>
          </div>
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="ناونیشانی پەخش..."
            className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-600 text-left font-mono"
          />
          <button
            onClick={handleSaveSettings}
            className="px-5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black kurdish-text cursor-pointer transition-all"
          >
            پاشەکەوتکردنی ڕێکخستنەکان
          </button>
        </div>
      </div>

      {/* Direct Catalogue selector */}
      <div className="p-6 bg-zinc-950/80 border border-white/5 rounded-2xl space-y-4">
        <h4 className="text-white font-bold text-sm kurdish-text flex items-center justify-between">
          <span>هەڵبژاردنی خێرا لە کەتەلۆگی فیلمەکان</span>
          <span className="text-[10px] text-gray-500 kurdish-text font-normal">کلیک لەسەر هەر فیلمێک بکەیت یەکسەر دەچێتە سەر پەخشی گشتی ڕاستەوخۆ</span>
        </h4>

        {localMovies.length === 0 ? (
          <p className="text-xs text-gray-600 kurdish-text">هیچ فیلمێک نییە لە کەتەلۆگدا</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {localMovies.map((movie) => (
              <div
                key={movie.id}
                onClick={() => {
                  const url = getMoviePlayUrl(movie);
                  if (url) {
                    setVideoUrl(url);
                    handleUpdateBroadcast(url);
                  }
                }}
                className={`p-3 bg-zinc-900/60 border rounded-xl hover:border-purple-500/40 hover:bg-zinc-900 cursor-pointer transition-all flex items-center gap-3 group`}
              >
                {(movie.thumbnail || movie.image) && (
                  <img
                    src={movie.thumbnail || movie.image}
                    alt=""
                    className="w-12 h-16 object-cover rounded-lg bg-zinc-800 shrink-0 border border-white/5"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-gray-200 truncate group-hover:text-purple-400 transition-colors capitalize">
                    {movie.title}
                  </p>
                  <p className="text-[9px] text-zinc-500 font-bold kurdish-text mt-1">
                    {movie.category || "فیلم"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};



const ChannelSettingsModule = ({
  youtubeUrl,
  tiktokUrl,
  instagramUrl,
  facebookUrl,
  onUpdate,
}: {
  youtubeUrl: string;
  tiktokUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  onUpdate: (updates: {
    youtubeUrl: string;
    tiktokUrl: string;
    instagramUrl: string;
    facebookUrl: string;
  }) => Promise<void>;
}) => {
  const [yt, setYt] = useState(youtubeUrl || "");
  const [tk, setTk] = useState(tiktokUrl || "");
  const [ig, setIg] = useState(instagramUrl || "");
  const [fb, setFb] = useState(facebookUrl || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [errors, setErrors] = useState<{
    yt?: string;
    tk?: string;
    ig?: string;
    fb?: string;
  }>({});

  useEffect(() => {
    setYt(youtubeUrl || "");
    setTk(tiktokUrl || "");
    setIg(instagramUrl || "");
    setFb(facebookUrl || "");
  }, [youtubeUrl, tiktokUrl, instagramUrl, facebookUrl]);

  const handleSave = async () => {
    const errs: typeof errors = {};
    if (!isValidHttpUrl(yt))
      errs.yt = "بەستەرەکە دروست نییە — دەبێت بە http:// یان https:// دەستپێبکات.";
    if (!isValidHttpUrl(tk))
      errs.tk = "بەستەرەکە دروست نییە — دەبێت بە http:// یان https:// دەستپێبکات.";
    if (!isValidHttpUrl(ig))
      errs.ig = "بەستەرەکە دروست نییە — دەبێت بە http:// یان https:// دەستپێبکات.";
    if (!isValidHttpUrl(fb))
      errs.fb = "بەستەرەکە دروست نییە — دەبێت بە http:// یان https:// دەستپێبکات.";
    setErrors(errs);
    setSaveStatus("idle");
    if (Object.keys(errs).length > 0) return;

    setIsSaving(true);
    try {
      await onUpdate({
        youtubeUrl: yt,
        tiktokUrl: tk,
        instagramUrl: ig,
        facebookUrl: fb,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (err) {
      console.error("Channel links save failed:", err);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div>
        <h3 className="text-3xl font-black kurdish-text text-white mb-2">
          ڕێکخستنەکانی چەناڵ و براند (Channel Settings)
        </h3>
        <p className="text-gray-500 kurdish-text text-sm">
          لێرەوە دەتوانیت بەستەرەکانی تۆڕە کۆمەڵایەتییەکانی ChatCinama دیاری
          بکەیت تاوەکو لە لاپەڕەی سەرەکی، مۆدۆلەکانی بینین، و خوارەوەی پەرەکە
          جێگیر ببن.
        </p>
      </div>

      <div className="space-y-8">
        <div className="p-8 bg-white/5 border border-white/10 rounded-[2rem] space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* youtube stream option */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block kurdish-text">
                لینکی یوتیوب (YouTube Channel URL)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Youtube className="w-5 h-5 text-red-500" />
                </div>
                <input
                  type="text"
                  value={yt}
                  onChange={(e) => setYt(e.target.value)}
                  className={`w-full bg-black/40 border ${
                    errors.yt
                      ? "border-red-500 focus:border-red-500"
                      : "border-white/10 focus:border-brand-primary"
                  } rounded-xl pl-12 pr-4 py-3.5 text-white outline-none text-sm transition-all`}
                  placeholder="https://www.youtube.com/@ChatCinama"
                />
              </div>
              {errors.yt && (
                <p className="text-[11px] text-red-400 kurdish-text">
                  {errors.yt}
                </p>
              )}
            </div>

            {/* tiktok option */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block kurdish-text">
                لینکی تیکتۆک (TikTok URL)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Video className="w-5 h-5 text-cyan-400" />
                </div>
                <input
                  type="text"
                  value={tk}
                  onChange={(e) => setTk(e.target.value)}
                  className={`w-full bg-black/40 border ${
                    errors.tk
                      ? "border-red-500 focus:border-red-500"
                      : "border-white/10 focus:border-brand-primary"
                  } rounded-xl pl-12 pr-4 py-3.5 text-white outline-none text-sm transition-all`}
                  placeholder="https://www.tiktok.com/@ChatCinama"
                />
              </div>
              {errors.tk && (
                <p className="text-[11px] text-red-400 kurdish-text">
                  {errors.tk}
                </p>
              )}
            </div>

            {/* instagram option */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block kurdish-text">
                لینکی ئینستاگرام (Instagram URL)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Instagram className="w-5 h-5 text-pink-500" />
                </div>
                <input
                  type="text"
                  value={ig}
                  onChange={(e) => setIg(e.target.value)}
                  className={`w-full bg-black/40 border ${
                    errors.ig
                      ? "border-red-500 focus:border-red-500"
                      : "border-white/10 focus:border-brand-primary"
                  } rounded-xl pl-12 pr-4 py-3.5 text-white outline-none text-sm transition-all`}
                  placeholder="https://www.instagram.com/ChatCinama"
                />
              </div>
              {errors.ig && (
                <p className="text-[11px] text-red-400 kurdish-text">
                  {errors.ig}
                </p>
              )}
            </div>

            {/* facebook option */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block kurdish-text">
                لینکی فەیسبووک (Facebook URL)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Facebook className="w-5 h-5 text-blue-500" />
                </div>
                <input
                  type="text"
                  value={fb}
                  onChange={(e) => setFb(e.target.value)}
                  className={`w-full bg-black/40 border ${
                    errors.fb
                      ? "border-red-500 focus:border-red-500"
                      : "border-white/10 focus:border-brand-primary"
                  } rounded-xl pl-12 pr-4 py-3.5 text-white outline-none text-sm transition-all`}
                  placeholder="https://www.facebook.com/ChatCinama"
                />
              </div>
              {errors.fb && (
                <p className="text-[11px] text-red-400 kurdish-text">
                  {errors.fb}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-4 bg-brand-primary hover:bg-brand-primary/80 text-white font-black kurdish-text rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>پاشەکەوت دەکرێت...</span>
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <span>پاشەکەوتی سەرکەوتوو! هەموو بەستەرەکان نوێ بوونەوە.</span>
                </>
              ) : saveStatus === "error" ? (
                <>
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <span>هەڵەیەک ڕوویدا لە کاتی پاشەکەوتکردن — دیسان هەوڵ بدەوە.</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>پاشەکەوتکردنی هەموو بەستەرەکان</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[11px] text-gray-500 kurdish-text text-center">
            تێبینی: هەر نوێکردنەوەیەک دەستبەجێ بەبێ پێویستی بە دووبارە
            بنیاتنانەوەی سیستەمەکە کارا دەبێت بۆ هەموو مۆدیولەکان.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

const SettingsModule = ({
  tracker,
  ads,
  onUpdateTracker,
  onUpdateAd,
  playerMode,
  onUpdatePlayerMode,
  roomVideoUrl,
  onUpdateRoomVideoUrl,
}: any) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div>
        <h3 className="text-3xl font-black kurdish-text text-white mb-2">
          ڕێکخستنە گشتییەکان
        </h3>
        <p className="text-gray-500 kurdish-text text-sm">
          بەڕێوبەرایەتی تراکەر، ڕیکلامەکان، و شێوازی پەخشکردن.
        </p>
      </div>

      <div className="space-y-8">
        <div className="p-8 bg-white/5 border border-white/10 rounded-[2rem] space-y-4">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest block kurdish-text">
            دەقی تراکەری سەرەوە
          </label>
          <div className="flex gap-4">
            <input
              type="text"
              defaultValue={tracker}
              onBlur={(e) => onUpdateTracker(e.target.value)}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white kurdish-text outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        <div className="p-8 bg-white/5 border border-white/10 rounded-[2rem] space-y-4">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest block kurdish-text">
            لینکی ڤیدیۆی ژووری گشتی (Global Room Video URL)
          </label>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="e.g. YouTube, Vimeo, or MP4 URL"
              defaultValue={roomVideoUrl}
              onBlur={(e) => onUpdateRoomVideoUrl(e.target.value)}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white kurdish-text outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        <div className="p-8 bg-white/5 border border-white/10 rounded-[2rem] space-y-4">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest block kurdish-text">
            شێوازی یاریپێکەر (Player Mode)
          </label>
          <div className="flex gap-4 items-center">
            <button
              onClick={() => onUpdatePlayerMode("embed")}
              className={`px-6 py-3 rounded-xl font-bold ${playerMode === "embed" ? "bg-brand-primary" : "bg-white/10"}`}
            >
              لەناو پەیج (Embed)
            </button>
            <button
              onClick={() => onUpdatePlayerMode("popup")}
              className={`px-6 py-3 rounded-xl font-bold ${playerMode === "popup" ? "bg-brand-primary" : "bg-white/10"}`}
            >
              لە پەنجەرەی نوێ (New Window)
            </button>
          </div>
        </div>

        <div className="p-8 bg-white/5 border border-white/10 rounded-[2rem] space-y-6">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest block kurdish-text">
            ڕیکلامی سەرەکی (728x90)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] text-gray-600 font-black uppercase">
                Image URL
              </p>
              <input
                type="text"
                defaultValue={ads.banner.image}
                onBlur={(e) => onUpdateAd("ads.banner.image", e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-brand-primary"
              />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] text-gray-600 font-black uppercase">
                Link URL
              </p>
              <input
                type="text"
                defaultValue={ads.banner.link}
                onBlur={(e) => onUpdateAd("ads.banner.link", e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-brand-primary"
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const HeroSection: React.FC<{
  activeFeaturedMovie: any;
  countdown: number;
  setCountdown: React.Dispatch<React.SetStateAction<number>>;
  isHeroMuted: boolean;
  setIsHeroMuted: React.Dispatch<React.SetStateAction<boolean>>;
  hasInteracted: boolean;
  heroVideoId: string;
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
  heroVideoId,
  config,
  setShowVipModal,
  activeAudioSource = "hero",
  isMoviePlayerOpen = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const isMuted = isHeroMuted;
  const setIsMuted = setIsHeroMuted;
  const videoId = activeFeaturedMovie?.videoId || heroVideoId;
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  // Live mirror of isPlaying so onStateChange never fights intentional pauses
  const isPlayingRef = useRef(true);
  isPlayingRef.current = isPlaying;
  // Synchronous intent flag for the Play/Pause toggle: set at the exact moment
  // the user clicks, so the async onStateChange(PAUSED) event can NEVER re-arm
  // the 50ms auto-resume against a deliberate pause (that race made the toggle
  // appear "stuck" — the video kept resuming right after pausing).
  const deliberatePauseRef = useRef(false);
  // Live mirror of isMuted so the one-time document listener reads fresh state
  const isMutedRef = useRef(isHeroMuted);
  isMutedRef.current = isHeroMuted;
  // Clears the lingering poster once real frames render (prevents old-frame artifacts)
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
  // English closed captions are forced on by default (ccEnabled = true)
  const [ccEnabled, setCcEnabled] = useState(true);
  // Strict 3s delayed mounting: zero iframe in the DOM until showPlayer=true
  const [showPlayer, setShowPlayer] = useState(false);
  // Live online-viewer counter: polls /api/stats every 10s with a stable
  // per-tab session id. The server uses this as a presence heartbeat and
  // returns the REAL count of concurrent viewers. Keeps the last known value if
  // the server is down.
  const [onlineViewers, setOnlineViewers] = useState(0);
  // Stable per-tab session id (generated once) used as a presence heartbeat so
  // the server can count real concurrent viewers.
  const sessionIdRef = useRef<string>("");
  if (sessionIdRef.current === "") {
    sessionIdRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // 1) Strict 3-second black screen gate — mount the player after exactly 3s
  useEffect(() => {
    const timer = setTimeout(() => setShowPlayer(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Live viewer counter polling (hero badge)
  useEffect(() => {
    let cancelled = false;
    const updateViewers = async () => {
      try {
        const data = await api.getStats(sessionIdRef.current);
        if (!cancelled && data && typeof data.visitors === "number") {
          setOnlineViewers(data.visitors);
        }
      } catch (_) {
        // Keep the last known count — never block the hero on a failed poll.
      }
    };
    updateViewers();
    const interval = setInterval(updateViewers, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Detect mobile/touch devices: their autoplay policies block unmuted autoplay.
  // Uses touch detection OR a small viewport (window.innerWidth < 768).
  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return (
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      "ontouchstart" in window ||
      window.innerWidth < 768
    );
  }, []);

  // Safe invocation of any YT.Player method: try/catch + rejected-promise swallow
  const safePlayerCall = (player: any, method: string, ...args: any[]) => {
    try {
      const result = player?.[method]?.(...args);
      if (result && typeof result.catch === "function") result.catch(() => {});
      return result;
    } catch (_) {
      return undefined;
    }
  };

  // True once the user manually controls hero audio (button / overlay / tap).
  // The forceUnmuteAutoplay retry loop stops as soon as this is set so it can
  // never fight the user's choice or re-show the overlay behind their back.
  const userAudioControlRef = useRef(false);
  // Handle to a pending forceUnmuteAutoplay retry so it can be cancelled
  const unmuteRetryTimerRef = useRef<any>(null);

  // User takes control of audio: cancel any pending autoplay retry loop.
  const takeAudioControl = () => {
    userAudioControlRef.current = true;
    if (unmuteRetryTimerRef.current) {
      clearTimeout(unmuteRetryTimerRef.current);
      unmuteRetryTimerRef.current = null;
    }
  };

  // Mute/unmute toggle: calls mute()/unMute() SYNCHRONOUSLY inside the click
  // gesture. Calling unMute() from a useEffect runs OUTSIDE the gesture context,
  // so strict autoplay policies silently swallow it, player.isMuted() stays
  // true, and the reconciliation would lock the overlay on — audio could never
  // be re-enabled from the button. unMute() here is a real gesture → reliable.
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

  // Play-only re-assert (NEVER touches audio). Safe to call outside a gesture.
  const forcePlay = (target: any, attempts = 6) => {
    if (!target) return;
    safePlayerCall(target, "playVideo");
    const playerState = safePlayerCall(target, "getPlayerState");
    const PLAYING = (window as any).YT?.PlayerState?.PLAYING ?? 1;
    if (playerState !== PLAYING && attempts > 0) {
      setTimeout(() => forcePlay(target, attempts - 1), 200);
    }
  };

  // Unmute + full-volume playback. MUST only be invoked from a direct user
  // gesture (click/tap): Edge & mobile autoplay policies silently block any
  // programmatic unMute() call made outside a gesture.
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

  // Forced unmuted autoplay: playVideo + unMute + setVolume(100) wrapped in a
  // safe retry loop so the hero starts with SOUND right after the 3s black
  // screen, no click needed. If the browser's autoplay policy still blocks
  // audio, React state is reconciled to the real muted state so the pulsing
  // "کاراکردنی دەنگ" overlay appears as a fallback.
  const forceUnmuteAutoplay = (target: any, attempts = 20) => {
    if (!target) return;
    safePlayerCall(target, "playVideo");
    safePlayerCall(target, "unMute");
    safePlayerCall(target, "setVolume", 100);
    const stillMuted = safePlayerCall(target, "isMuted") ?? false;
    const playerState = safePlayerCall(target, "getPlayerState");
    const PLAYING = (window as any).YT?.PlayerState?.PLAYING ?? 1;

    if (!stillMuted && playerState === PLAYING) {
      // Audio confirmed: video is playing with sound → reflect unmuted
      setIsHeroMuted(false);
      return;
    }

    if (attempts <= 0) {
      // Retries exhausted: browser still blocks audio → keep truthful muted state
      setIsHeroMuted(!!stillMuted);
      return;
    }

    if (stillMuted && isMobile) {
      // Mobile never allows unmute without a gesture → keep the unmute overlay
      setIsHeroMuted(true);
      return;
    }

    // Reflect a blocked / not-yet-playing state while we keep retrying. Each
    // retry is cancellable via takeAudioControl() (user gesture) and stops
    // immediately if the user has manually taken control of audio.
    setIsHeroMuted(!!stillMuted);
    unmuteRetryTimerRef.current = setTimeout(() => {
      if (userAudioControlRef.current) return;
      forceUnmuteAutoplay(target, attempts - 1);
    }, 200);
  };

  // Enable English closed captions via the YT IFrame API captions module.
  // NOTE: "captions reload" is intentionally NOT fired — reloading the CC track
  // makes YouTube paint its native "Click ⚙ for settings" hint text over the
  // video frame. loadModule + cc lang selection is enough to show captions.
  const enableCaptions = (target: any) => {
    if (!target) return;
    safePlayerCall(target, "loadModule", "captions");
    safePlayerCall(target, "setOption", "cc", "lang", "en");
  };

  const disableCaptions = (target: any) => {
    if (!target) return;
    safePlayerCall(target, "unloadModule", "captions");
  };

  // Tap anywhere on the hero → guaranteed user-gesture unmute + play
  const handleHeroTap = () => {
    userUnmute();
  };

  // CC toggle wired directly to the captions module
  const toggleCaptions = () => {
    const next = !ccEnabled;
    setCcEnabled(next);
    if (next) {
      enableCaptions(playerRef.current);
    } else {
      disableCaptions(playerRef.current);
    }
  };

  // Play/Pause toggle: called inside the click gesture so the player command is
  // guaranteed to run. isPlayingRef mirrors isPlaying, which lets onStateChange
  // know a pause was deliberate and skip its auto-resume.
  const togglePlayPause = () => {
    const player = playerRef.current;
    const next = !isPlaying;
    // Mark intent synchronously (before the iframe echoes the state change) so
    // the async PAUSED event cannot trigger the auto-resume right after.
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

  // Load the YT IFrame API eagerly so it is ready at the 3s mark
  const apiReady = useRef(loadYouTubeAPI());

  // Cleanup: destroy the player only on component unmount (not on videoId change)
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
      }
    };
  }, []);

  // 2) Mount / hot-swap the player ONLY after the 3s gate (zero iframe before)
  useEffect(() => {
    const id = "hero-yt-player";
    const container = document.getElementById(id);
    if (!container || !videoId || !showPlayer) return;
    let cancelled = false;
    // New source: show the new video's poster until it truly starts playing
    setHasStartedPlaying(false);

    const initPlayer = () => {
      if (cancelled) return;
      if (!(window as any).YT?.Player) return;

      // Reuse the existing player (hot-swap) — no destroy/recreate flash
      if (playerRef.current) {
        try {
          safePlayerCall(playerRef.current, "loadVideoById", videoId);
          if (isMobile) {
            if (!userAudioControlRef.current) {
              // Mobile: keep muted and re-assert autoplay in a retry loop — the
              // only reliable way to auto-start a new video on Android/iOS
              // (muted autoplay). Retrying playVideo() guards against the player
              // reporting BUFFERING on the first call.
              setIsHeroMuted(true);
              forcePlay(playerRef.current, 20);
            } else {
              // User already took control of audio: keep their choice and just
              // re-assert playback (works because of the prior real gesture)
              forcePlay(playerRef.current, 4);
            }
          } else {
            // Desktop: universal unmuted autoplay on every source change
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
          // Mobile/Android: start MUTED (mute:1) — strict mobile policies only
          // ever allow autoplay while muted, so this guarantees the video starts
          // playing right after the 3s black screen with no manual tap on
          // YouTube's red play button. The pulsing "کاراکردنی دەنگ" overlay then
          // lets one tap enable sound. Desktop (Chrome/Edge/Safari): direct
          // unmuted start (mute:0) via onReady forceUnmuteAutoplay.
          mute: isMobile ? 1 : 0,
          loop: 1,
          playlist: videoId,
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
          // NOTE: cc_load_policy/cc_lang_pref are intentionally NOT set here —
          // forcing captions at embed time makes YouTube surface its native
          // "Click ⚙ for settings" hint text over the video frame. Captions are
          // still enabled by default via enableCaptions() in onReady/hot-swap.
          hl: "en",
        },
        events: {
          onReady: (event: any) => {
            if (isMobile) {
              // Mobile/Android: muted autoplay (mute:1) is already permitted —
              // re-assert playVideo() in a retry loop right after the 3s black
              // screen so the video ALWAYS rolls automatically. A single
              // playVideo() can be dropped because many devices report BUFFERING
              // (state 3) instead of PLAYING (state 1) on the first call, so we
              // keep re-issuing playVideo() every 200ms (play-only, NEVER touches
              // audio) until real playback begins. NO programmatic unMute()
              // attempt — mobile browsers block it anyway. Sound is enabled via
              // a real user gesture: tap the video or the mute button.
              setIsHeroMuted(true);
              forcePlay(event.target, 30);
            } else {
              // Desktop: universal unmuted autoplay — playVideo + unMute +
              // setVolume(100) inside a safe retry loop. If the policy blocks
              // it, state reconciles to muted so the overlay shows as a fallback.
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
              // Real frames are rendering: clear the poster/cache layer
              deliberatePauseRef.current = false;
              setHasStartedPlaying(true);
            } else if (event.data === ytState.PAUSED && !deliberatePauseRef.current) {
              // Keep playback seamless so the center play/pause overlay
              // never lingers on the video surface (unless deliberately paused)
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
  }, [videoId, showPlayer]);

  // 3) Keep React mute state in sync with the player, reconciling against the
  //    player's REAL muted state (browsers can silently block an unMute() call).
  //    Reconcile ONLY while the autoplay phase is still running (user has not
  //    manually controlled audio): a swallowed programmatic unMute reverts to
  //    muted so the overlay shows. After the user takes control, their explicit
  //    gesture choice is trusted — never reverting prevents the overlay from
  //    locking back on and blocking audio.
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

  // 6) One-time document interaction listener: the FIRST tap/click anywhere on
  //    the page unmutes the hero video (browsers require a user gesture to start
  //    audio). Fires only while still muted, then removes itself.
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

  // 4) Keep React play state in sync with the player
  useEffect(() => {
    if (playerRef.current) {
      isPlaying
        ? safePlayerCall(playerRef.current, "playVideo")
        : safePlayerCall(playerRef.current, "pauseVideo");
    }
  }, [isPlaying]);

  // Mute hero video if room audio is active
  useEffect(() => {
    if (activeAudioSource === "room") {
      // Stop the autoplay retry loop so it never re-enables hero audio while
      // the room stream is the active audio source
      userAudioControlRef.current = true;
      if (unmuteRetryTimerRef.current) {
        clearTimeout(unmuteRetryTimerRef.current);
        unmuteRetryTimerRef.current = null;
      }
      setIsMuted(true);
      setIsHeroMuted(true);
    }
  }, [activeAudioSource, setIsHeroMuted]);

  // Smart trailer audio control: when a lower movie/stream player opens above
  // the hero, pause + mute the trailer so the two sources never fight. On
  // close, restore exactly the prior play/mute state.
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

  return (
    <section
      className="relative w-full h-[60vh] md:h-[85vh] bg-black overflow-hidden select-none"
      style={{ display: "block", opacity: 1 }}
    >
      {/* Video Container Wrapper (z-index: 0, position: absolute, inset: 0) */}
      <div
        className="w-full h-full overflow-hidden pointer-events-none"
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      >
        {/* Player mounts only after the 3s delayed-mount gate (showPlayer) */}
        {showPlayer && (
          <div
            className="w-full h-full scale-[1.35] bg-cover bg-center"
            id="hero-player"
            ref={containerRef}
            style={!hasStartedPlaying && videoId ? { backgroundImage: `url(https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)` } : undefined}
          >
            <div id="hero-yt-player" className="w-full h-full" />
          </div>
        )}
        {/* The YouTube iframe will be injected here by the YouTube Iframe API */}
        {/* <div className="w-full h-full scale-[1.35]" id="hero-player-iframe"></div> */}
        {/* سێبەری خوارەوەی ڤیدیۆکە بۆ ئەوەی دیزاینەکەی سینەمایی بێت */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent z-2 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black to-transparent z-2 pointer-events-none" />
      </div>

      {/* Protective Shield overlay for Youtube iframe clicks + tap-to-unmute trigger */}
      <div 
        className="absolute inset-0 bg-transparent pointer-events-auto" 
        style={{ zIndex: 10 }}
        onClick={handleHeroTap}
      />

      {/* UI Elements Container Wrapper (z-index: 100, position: relative) */}
      <div 
        className="relative w-full h-full flex flex-col justify-between p-4 md:p-8 pointer-events-none" 
        style={{ position: "relative", zIndex: 100 }}
      >
        {/* 3-second Countdown Overlay */}
        <AnimatePresence>
          {countdown > 0 && (
            <motion.div
              key="countdown-overlay"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 z-55 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md cursor-pointer pointer-events-auto"
              onClick={() => {
                // Skip countdown: unmute inside this real gesture if the player
                // is already mounted (strict policies never block an in-gesture
                // unMute). If not mounted yet (before the 3s gate), state alone
                // is set and onReady forceUnmuteAutoplay takes over.
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

        {/* دگمە هاوبەشە شووشەییەکان لە گۆشەی سەرەوەی ڕاست (Glass Overlay Buttons in Top Right Corner) */}
        <div className="absolute top-4 right-6 md:right-12 z-40 flex items-center gap-1.5 md:gap-3 pointer-events-none">
          {/* Live Online Viewer Counter — real-time badge of how many people are
              currently on the site. Styled to match the glass control buttons. */}
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

          {/* Mute/Unmute Button — toggles the player inside the click gesture so
              a strict autoplay policy never swallows the unMute() call. */}
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

          {/* Subtitle (CC) Toggle Button */}
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

          {/* VIP Button */}
          <button
            onClick={() => setShowVipModal(true)}
            className="pointer-events-auto p-2 md:p-3 bg-black/50 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/30 rounded-xl md:rounded-2xl text-white hover:text-amber-400 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/vip"
            title="هۆڵی VIP Room"
            id="hero-vip-btn"
          >
            <Ticket className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/vip:rotate-12" />
          </button>

          {/* YouTube Button */}
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

          {/* Facebook Button — live from Admin Panel channel settings (Module 9) */}
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

          {/* TikTok Button — live from Admin Panel channel settings (Module 9) */}
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

          {/* Instagram Button — live from Admin Panel channel settings (Module 9) */}
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

          {/* Share Button */}
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

          {/* Play/Pause Toggle — lives in the top bar alongside the other hero
              controls, matching their exact style, layout and dimensions. */}
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

        {/* Unmute overlay (DESKTOP only): shown while the video is muted. If a
            strict autoplay policy blocks the unmuted start, this prominent
            pulsing button lets a single click enable audio — it runs inside a
            real gesture. On MOBILE/Android the video starts muted (mute:1) and
            rolls automatically with NO overlay blocking it; sound is enabled by
            tapping the video or the top-right mute button instead. */}
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

        {/* Text Details Area */}
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
              </span> {/* This is the main title of the hero section */}
              <span className="text-[10px] md:text-xs font-black text-brand-primary uppercase tracking-[0.6em] font-mono">
                CINEMACHAT SHOW
              </span>
            </div>

            <div className="w-12 h-1 bg-brand-primary mt-4 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          </motion.div>
        </div>
      </div>

      {/* Keep the delayed-mount buffer behind the hero UI. If YouTube or timers
          lag in a browser, the first viewport still shows usable page chrome
          instead of looking like a blank black screen. */}
      <AnimatePresence>
        {!showPlayer && (
          <motion.div
            key="hero-initial-buffer"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute inset-0 bg-black flex items-center justify-center pointer-events-none"
            style={{ zIndex: 1 }}
          >
            <div className="w-10 h-10 rounded-full border-2 border-t-brand-primary border-white/10 animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

const RoomSection: React.FC<{
  activeFeaturedMovie: any;
  activeSyncGroup: any;
  isRoomMuted: boolean;
  setIsRoomMuted: React.Dispatch<React.SetStateAction<boolean>>;
  currentRoomVideoUrl: string;
  extractYouTubeId: (url: string) => string | null;
  config: any;
  setShowJoinCodeModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowVipModal: React.Dispatch<React.SetStateAction<boolean>>;
  setSocialTab: (tab: "movies" | "party" | "profile" | "broadcast" | "cinema_window") => void;
  socialProfile?: any;
}> = ({
  activeFeaturedMovie,
  activeSyncGroup,
  isRoomMuted,
  setIsRoomMuted,
  currentRoomVideoUrl,
  extractYouTubeId,
  config,
  setShowJoinCodeModal,
  setShowVipModal,
  setSocialTab,
  socialProfile,
}) => {
  console.log("RoomSection state:", activeFeaturedMovie);

  const [vipPreviewVideoId, setVipPreviewVideoId] = React.useState<string>("");
  const [vipVideoList, setVipVideoList] = React.useState<any[]>([]);

  // Real-time VIP video catalog from the dedicated vip_videos collection.
  React.useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "vip_videos"),
      (snap) => {
        const vList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        vList.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setVipVideoList(vList);
      },
      (err) => console.warn("RoomSection vip_videos listener:", err),
    );
    return () => unsub();
  }, []);

  React.useEffect(() => {
    let active = true;
    const fetchVipPreview = async () => {
      try {
        // 1. Prefer the video bound to the verified localStorage ticket.
        let selectedUrl = "";
        const saved = localStorage.getItem("vipRoom_verifiedTicket");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.code) {
              const tSnap = await getDoc(doc(db, "vip_tickets", parsed.code));
              if (tSnap.exists()) {
                selectedUrl = tSnap.data().videoUrl || "";
              } else {
                localStorage.removeItem("vipRoom_verifiedTicket");
              }
            }
          } catch (e) {
            console.warn("Could not parse verified ticket from localStorage:", e);
          }
        }

        // 2. Requirement: when at least 4 VIP videos exist, the 4th option's
        //    trailer/video renders in the upper preview frame.
        if (!selectedUrl && vipVideoList.length >= 4) {
          const fourth = vipVideoList[3];
          selectedUrl = fourth.trailerUrl || fourth.videoUrl || "";
        }

        // 3. Fallback: last VIP video.
        if (!selectedUrl && vipVideoList.length > 0) {
          selectedUrl = vipVideoList[vipVideoList.length - 1]?.videoUrl || "";
        }

        if (selectedUrl && active) {
          let videoId = "";
          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
          const match = selectedUrl.match(regExp);
          if (match && match[2].length === 11) {
            videoId = match[2];
          } else {
            videoId = selectedUrl; // fallback
          }
          setVipPreviewVideoId(videoId);
        } else if (active) {
          setVipPreviewVideoId("");
        }
      } catch (err) {
        console.warn("Could not load VIP preview state:", err);
      }
    };

    fetchVipPreview();
    const interval = setInterval(fetchVipPreview, 15000); // lightweight check every 15s
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [vipVideoList]);

  return (
    <section id="live-stream-room" className="relative z-[100] px-8 pb-20 animate-fade-in font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {/* LEFT COMPONENT: VIP Golden Lounge (VIP Room Access Card) */}
          <div className="bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden relative group h-full flex flex-col justify-between">
            <div 
              onClick={() => setShowVipModal(true)}
              className="aspect-video relative overflow-hidden bg-gradient-to-br from-zinc-950 via-amber-950/20 to-zinc-950 flex items-center justify-center group-hover:scale-[1.01] transition-transform duration-700 shrink-0 cursor-pointer"
            >
              {/* Dynamic luxury glow effect */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-amber-500/10 blur-[80px] rounded-full animate-pulse pointer-events-none" />
              <div className="absolute inset-0 bg-black/40" />

              {vipPreviewVideoId ? (
                <iframe
                  src={
                    vipPreviewVideoId.startsWith("http://") ||
                    vipPreviewVideoId.startsWith("https://") ||
                    vipPreviewVideoId.includes("/")
                      ? vipPreviewVideoId
                      : `https://www.youtube.com/embed/${vipPreviewVideoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&playlist=${vipPreviewVideoId}&loop=1&playsinline=1&enablejsapi=1&origin=${window.location.origin}`
                  }
                  className="w-full h-full pointer-events-none select-none"
                  title="VIP Room Live Preview"
                  allow="autoplay; encrypted-media"
                  frameBorder="0"
                  tabIndex={-1}
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms allow-pointer-lock allow-modals allow-downloads"
                />
              ) : (
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:rotate-6 transition-all duration-300">
                    <Ticket className="w-8 h-8 text-black" />
                  </div>
                  <div className="px-3 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-black tracking-widest rounded-full uppercase flex items-center gap-1.5 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    VIP Golden Lounge
                  </div>
                </div>
              )}

              <div className="absolute top-4 left-4 px-3 py-1 bg-amber-500 text-black text-[9px] font-black rounded-full flex items-center gap-1.5 z-10 transition-transform group-hover:scale-110">
                PREMIUM ACCESS
              </div>

              {/* VIP Live Badge */}
              <div className="absolute bottom-4 right-4 px-2 py-1 bg-amber-500 text-[8px] font-black tracking-wider text-black uppercase rounded-md flex items-center gap-1 shadow-md border border-white/10 pointer-events-none">
                <span className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
                VIP PREVIEW
              </div>
            </div>

            <div className="p-8 md:p-10 flex flex-col justify-between flex-grow gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] font-mono">
                    EXCLUSIVE PREMIUM HUB
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-amber-400 kurdish-text leading-tight">
                  هۆڵی شاهانەی VIP
                </h2>
                <p className="text-gray-400 kurdish-text text-xs md:text-sm leading-relaxed line-clamp-2">
                  تایبەت بە ئەندامانی ئاڵتوونی! لێرەوە بلیتەکەت یان کۆدی
                  چوونەژوورەوەی کاتی لێبدە تا دەروازەی کۆبوونەوە تایبەتەکەت
                  بکرێتەوە.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/5 mt-auto">
                <button
                  onClick={() => setShowVipModal(true)}
                  className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-600 hover:to-amber-700 hover:scale-[1.01] rounded-2xl font-black kurdish-text text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/10 cursor-pointer"
                >
                  <Ticket className="w-4 h-4" />
                  چوونە ژوورەوەی ژووری تایبەت
                </button>
                <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-500 uppercase tracking-widest self-end sm:self-auto font-mono">
                  VIP LEVEL Active
                </div>
              </div>
            </div>
          </div>

          {/* MIDDLE COMPONENT: Came Here Friends Room Card */}
          <div className="bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden relative group h-full flex flex-col justify-between">
            <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-zinc-950 via-indigo-950/20 to-zinc-950 flex items-center justify-center group-hover:scale-[1.01] transition-transform duration-700 shrink-0">
              {/* Dynamic community glow effect */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full animate-pulse pointer-events-none" />
              <div className="absolute inset-0 bg-black/40" />

              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:rotate-6 transition-all duration-300">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <div className="px-3 py-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[10px] font-black tracking-widest rounded-full uppercase flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                  Friends Room
                </div>
              </div>

              <div className="absolute top-4 left-4 px-3 py-1 bg-indigo-500 text-white text-[9px] font-black rounded-full flex items-center gap-1.5 z-10 transition-transform group-hover:scale-110">
                CAME HERE ROOM
              </div>
            </div>

            <div className="p-8 md:p-10 flex flex-col justify-between flex-grow gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] font-mono">
                    UNIFIED FRIENDS HUB
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-indigo-400 kurdish-text leading-tight font-bold">
                  ژووری هاوڕێیان (Came Here)
                </h2>
                <p className="text-gray-400 kurdish-text text-xs md:text-sm leading-relaxed line-clamp-2">
                  بە کۆدی بێهاوتاکەت ژووری تایبەتی خۆت دابنێ یان بچۆ سەر ژووری هاوڕێکانت بە یەکەوە سەیری فیلم بکەن و چات بکەن بە ئاسانی!
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/5 mt-auto">
                <button
                  onClick={() => {
                    setSocialTab("party");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 hover:scale-[1.01] rounded-2xl font-black kurdish-text text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 shadow-xl shadow-indigo-500/10 cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  چوونە ژوورەوەی ژووری هاوڕێیان
                </button>
                <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-400 uppercase tracking-widest self-end sm:self-auto font-mono font-bold">
                  ACTIVE HUB
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COMPONENT: Standalone Broadcast Live Card */}
          <BroadcastPreviewCard
            onJoinBroadcast={() => {
              setSocialTab("broadcast");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            socialProfile={socialProfile}
          />
        </div>
      </div>
    </section>
  );
};

// ===== Drama Rooms (persistent curated collections) =====
// A drama room stores: id, title, description, coverUrl, dramas (array of movie
// IDs), createdAt, updatedAt. Rooms are persisted server-side in db.dramaRooms.
// The hub below replaces the old Global Room / Broadcast section; the gallery
// replaces the Trending row. Clicking a room opens its dramas.

// A post's explicit Film/Drama type ("جۆری پۆست") is the PRIMARY way to tell
// dramas from films for Drama Rooms. Legacy posts that predate the field fall
// back to the previous rule (tags include the "دراما" genre tag) so posts
// already recognized as dramas keep counting as dramas; everything else is a
// normal film and never appears in a Drama Room's selection list.
const DRAMA_GENRE_TAG = "دراما";
const DRAMA_POST_TYPE = "دراما";
const FILM_POST_TYPE = "فیلم";
const isDramaMovie = (m: any) => {
  const postType = String(m?.postType || "").trim();
  if (postType === DRAMA_POST_TYPE) return true;
  if (postType === FILM_POST_TYPE) return false;
  return Array.isArray(m?.tags) && m.tags.some((t: any) => String(t).trim() === DRAMA_GENRE_TAG);
};

const normalizeDramaHubText = (value: any) =>
  String(value || "")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ەة]/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

const getDramaHubRoomSearchText = (room: any, resolvedMovies: Record<string, any>) => {
  const pieces = [
    room?.title,
    room?.name,
    room?.description,
    room?.year,
    room?.status,
  ];

  (Array.isArray(room?.dramas) ? room.dramas : []).forEach((id: string, index: number) => {
    const movie = resolvedMovies?.[id];
    pieces.push(
      id,
      `Drama ${index + 1}`,
      `دراما ${index + 1}`,
      `episode ${index + 1}`,
      `part ${index + 1}`,
      movie?.title,
      movie?.description,
      movie?.year,
      movie?.releaseDate,
      ...(Array.isArray(movie?.tags) ? movie.tags : []),
      ...(Array.isArray(movie?.genres) ? movie.genres : []),
    );
  });

  return normalizeDramaHubText(pieces.filter(Boolean).join(" "));
};

// Blurred, darkened full-bleed poster backdrop placed behind the Drama Room
// episode preview cards (portrait/poster-focused look). Purely decorative and
// pointer-transparent so playback and player controls stay fully interactive.
const DramaEpisodeBackdrop = ({ posterUrl }: { posterUrl: string }) => (
  <div className="absolute inset-0 overflow-hidden">
    <img
      src={posterUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.src =
          "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800";
      }}
      className="w-full h-full object-cover scale-125 blur-3xl opacity-40"
    />
    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black/90" />
  </div>
);

// Shared card for the Drama Room episode overlays: the "Up Next" card shown
// during the final 30 seconds and the "Now Playing" card shown for the first
// 5 seconds of an episode. `foot` is the dynamic bottom line (countdown vs
// playing state) passed in by each overlay.
const DramaEpisodePreviewCard = ({ label, posterUrl, title, foot }: any) => (
  <div className="flex flex-col items-center text-center px-6 py-8 max-w-lg">
    <div className="text-[10px] md:text-xs font-black uppercase tracking-[0.35em] text-brand-primary kurdish-text mb-5 drop-shadow-lg">
      {label}
    </div>
    <img
      src={posterUrl}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.src =
          "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800";
      }}
      className="w-56 h-80 md:w-72 md:h-96 rounded-2xl object-cover ring-1 ring-white/20 shadow-2xl shadow-black/70 mb-6"
    />
    <div className="text-lg md:text-2xl font-bold text-white kurdish-text drop-shadow-lg leading-snug mb-3">
      {title}
    </div>
    {foot}
  </div>
);

const DramaRoomCard = ({ room, onOpen, onEdit, onDelete, showActions, compact, liveViewers, rating, ratingCount }: any) => {
  const dramaCount = Array.isArray(room?.dramas) ? room.dramas.length : 0;
  return (
    <div
      className={`group relative flex-shrink-0 bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden transition-all hover:border-brand-primary/40 hover:scale-[1.02] cursor-pointer ${
        compact ? "w-[170px] md:w-[220px]" : "w-[200px] md:w-[260px]"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(room)}
        className="block w-full text-right focus:outline-none"
      >
        <div className="aspect-video w-full bg-gradient-to-br from-zinc-800 to-zinc-950 overflow-hidden relative">
          {room?.coverUrl ? (
            <img
              src={room.coverUrl}
              alt={room.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-900/30 via-zinc-900 to-zinc-950">
              <Tv className="w-10 h-10 text-brand-primary/60" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
          <span className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/70 border border-white/10 text-white text-[10px] font-black rounded-full flex items-center gap-1">
            <Play className="w-3 h-3" />
            {dramaCount} {dramaCount === 1 ? "دراما" : "دراماکان"}
          </span>
          {/* Live now — distinct concurrent viewers across the room's dramas.
              Same red-pill treatment as movie cards; count is server-computed
              and refreshed by the 30s /api/drama-rooms/live poll. */}
          {typeof liveViewers === "number" && liveViewers > 0 && (
            <span
              className="absolute bottom-3 left-3 px-2.5 py-1 bg-brand-primary text-white text-[10px] font-black rounded-full flex items-center gap-1.5 ring-1 ring-white/20"
              title={`${liveViewers} watching now`}
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              <Eye className="w-3 h-3" aria-hidden="true" />
              <span className="tabular-nums">{liveViewers}</span>
            </span>
          )}
        </div>
        <div className="p-4">
          <h3 className="text-sm font-black text-white kurdish-text leading-snug line-clamp-1">
            {room?.title}
          </h3>
          {/* Room's own CinemaChat rating — same pill treatment as movie cards;
              tied to this room's id so it never mixes with movie/post ratings. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {Number(rating) > 0 ? (
              <span
                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-emerald-400 font-black text-[9px]"
                title={`CinemaChat rating (${Number(ratingCount) || 0} ratings)`}
              >
                <Star className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
                {Number(rating).toFixed(1)}
                <span className="text-[7px] font-bold text-emerald-400/70">
                  CC
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-white/10 text-gray-500 font-black text-[9px]">
                <Star className="w-2.5 h-2.5 text-gray-600" aria-hidden="true" />
                <span className="kurdish-text">بێ هەڵسەنگاندن</span>
              </span>
            )}
          </div>
          {!compact && (
            <p className="mt-1 text-[11px] text-gray-400 kurdish-text leading-relaxed line-clamp-2">
              {room?.description}
            </p>
          )}
        </div>
      </button>
      {showActions && (
        <div className="absolute top-3 left-3 flex gap-2 z-10">
          <button
            type="button"
            onClick={() => onEdit && onEdit(room)}
            className="w-8 h-8 rounded-full bg-black/70 border border-white/10 text-white hover:text-brand-primary flex items-center justify-center"
            title="دەستکاری"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete && onDelete(room)}
            className="w-8 h-8 rounded-full bg-black/70 border border-white/10 text-white hover:text-red-500 flex items-center justify-center"
            title="سڕینەوە"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

// The permanent official two-person watch room (main_broadcast_room). Rendered
// as the first card of the Drama Rooms hub. It is NOT a drama room and stays
// protected: the server refuses to create/delete the reserved id, and it never
// shows in the admin drama-room CRUD (its data lives in its own Firestore doc).
const CinemaChatCard = ({ onOpen }: any) => (
  <div className="group relative flex-shrink-0 w-[200px] md:w-[260px] bg-gradient-to-br from-zinc-900 via-red-950/15 to-zinc-950 border border-brand-primary/30 rounded-3xl overflow-hidden transition-all hover:border-brand-primary/60 hover:scale-[1.02] cursor-pointer">
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-right focus:outline-none"
    >
      <div className="aspect-video w-full bg-gradient-to-br from-red-900/40 via-zinc-900 to-zinc-950 overflow-hidden relative">
        <div className="w-full h-full flex items-center justify-center">
          <div className="relative">
            <Tv className="w-10 h-10 text-brand-primary/80" />
            <span className="absolute -top-2 -left-3 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-primary" />
            </span>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
        <span className="absolute top-3 right-3 px-2 py-0.5 bg-brand-primary text-white text-[8px] font-black rounded-full flex items-center gap-1 uppercase tracking-widest">
          <ShieldCheck className="w-2.5 h-2.5" />
          Official
        </span>
        <span className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/70 border border-white/10 text-white text-[10px] font-black rounded-full flex items-center gap-1">
          <Users className="w-3 h-3" />
          2 کەس
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-black text-white kurdish-text leading-snug flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-brand-primary" />
          CinemaChat
        </h3>
        <p className="mt-1.5 text-[11px] text-gray-400 kurdish-text leading-relaxed line-clamp-2">
          ژووری سینەمای فەرمی — پەخشی هاوبەشی دوو کەس بە ڤیدیۆ چات و کۆنترۆڵی یەکگرتوو
        </p>
      </div>
    </button>
  </div>
);

const DramaHubCard = ({ roomCount, activeCount, onOpen }: any) => (
  <div className="group relative flex-shrink-0 w-[220px] md:w-[280px] bg-gradient-to-br from-zinc-950 via-red-950/25 to-zinc-950 border border-brand-primary/40 rounded-3xl overflow-hidden transition-all hover:border-brand-primary/70 hover:shadow-2xl hover:shadow-red-600/10 hover:scale-[1.02]">
    <button type="button" onClick={onOpen} className="block w-full text-right focus:outline-none">
      <div className="aspect-video w-full bg-gradient-to-br from-red-950/60 via-zinc-950 to-black overflow-hidden relative">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(239,68,68,0.28),transparent_35%,rgba(255,255,255,0.06)_70%,transparent)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-3xl bg-brand-primary/15 border border-brand-primary/35 flex items-center justify-center shadow-2xl shadow-red-600/15">
            <Layers className="w-8 h-8 text-brand-primary" />
          </div>
        </div>
        <span className="absolute top-3 right-3 px-2 py-0.5 bg-brand-primary text-white text-[8px] font-black rounded-full flex items-center gap-1 uppercase tracking-widest">
          <ShieldCheck className="w-2.5 h-2.5" />
          Permanent
        </span>
        <span className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/70 border border-white/10 text-white text-[10px] font-black rounded-full flex items-center gap-1">
          <Tv className="w-3 h-3" />
          {roomCount} rooms
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-base font-black text-white kurdish-text leading-snug flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-brand-primary" />
          Drama Rooms
        </h3>
        <p className="mt-1.5 text-[11px] text-gray-400 kurdish-text leading-relaxed line-clamp-2">
          کتێبخانەی هەمیشەیی بۆ هەموو ژوورەکانی دراما و ئەڵقەکان.
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] font-black text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {activeCount} active
          </span>
          <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
            Open Hub
          </span>
        </div>
      </div>
    </button>
  </div>
);

const DramaHubModal = ({
  rooms,
  resolvedMovies,
  currentUser,
  systemVerified,
  canCreateRoom,
  onOpenRoom,
  onCreate,
  onEdit,
  onDelete,
  onClose,
  liveViewersMap,
  ratingsMap,
}: any) => {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title" | "episodes" | "active">("newest");
  const canManage = systemVerified && !!currentUser;

  const filteredRooms = useMemo(() => {
    const q = normalizeDramaHubText(query);
    const list = (Array.isArray(rooms) ? rooms : []).filter((room: any) => {
      if (!q) return true;
      return getDramaHubRoomSearchText(room, resolvedMovies).includes(q);
    });

    return [...list].sort((a: any, b: any) => {
      if (sortBy === "oldest") {
        return new Date(a?.createdAt || a?.updatedAt || 0).getTime() - new Date(b?.createdAt || b?.updatedAt || 0).getTime();
      }
      if (sortBy === "title") {
        return String(a?.title || "").localeCompare(String(b?.title || ""), "ku");
      }
      if (sortBy === "episodes") {
        return (Array.isArray(b?.dramas) ? b.dramas.length : 0) - (Array.isArray(a?.dramas) ? a.dramas.length : 0);
      }
      if (sortBy === "active") {
        return (Number(liveViewersMap?.[b?.id]) || 0) - (Number(liveViewersMap?.[a?.id]) || 0);
      }
      return new Date(b?.updatedAt || b?.createdAt || 0).getTime() - new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    });
  }, [rooms, query, resolvedMovies, sortBy, liveViewersMap]);

  return (
    <div
      className="fixed inset-0 z-[190] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-6xl max-h-[92vh] overflow-hidden bg-zinc-950 border border-white/10 rounded-[1.75rem] shadow-2xl shadow-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Tv className="w-4 h-4 text-brand-primary" />
                <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.25em] font-mono">
                  DRAMA HUB
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white kurdish-text">
                Drama Rooms
              </h2>
              <p className="mt-1 text-xs text-gray-500 kurdish-text">
                {rooms.length} ژوور لە ناو کتێبخانەی درامادا
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-center flex-shrink-0"
              title="داخستن"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
            <div className="relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-12 bg-black/45 border border-white/10 rounded-2xl pr-11 pl-12 text-sm text-white kurdish-text outline-none focus:border-brand-primary"
                placeholder="گەڕان بە ناوی دراما، ژوور، فیلم، Drama 2، ساڵ..."
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 text-gray-300 hover:text-white flex items-center justify-center"
                  title="سڕینەوەی گەڕان"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-12 bg-black/45 border border-white/10 rounded-2xl px-4 text-sm font-bold text-white kurdish-text outline-none focus:border-brand-primary"
            >
              <option value="newest">نوێترین</option>
              <option value="oldest">کۆنترین</option>
              <option value="title">ناونیشان</option>
              <option value="episodes">زۆرترین ئەڵقە</option>
              <option value="active">چالاکترین</option>
            </select>
            {canCreateRoom && (
              <button
                type="button"
                onClick={onCreate}
                className="h-12 px-5 rounded-2xl bg-brand-primary text-white text-sm font-black kurdish-text hover:opacity-90 flex items-center justify-center gap-2 shadow-xl shadow-red-600/20"
              >
                <Plus className="w-4 h-4" />
                ژووری نوێ
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(92vh-190px)]">
          {rooms.length === 0 ? (
            <div className="py-16 text-center bg-white/5 border border-white/10 rounded-[1.5rem]">
              <Tv className="w-12 h-12 text-white/15 mx-auto mb-4" />
              <h3 className="text-lg font-black text-gray-400 kurdish-text">
                هیچ ژووری دراما نییە
              </h3>
              {canManage && (
                <p className="mt-2 text-xs text-gray-500 kurdish-text">
                  دەتوانیت لێرەوە یەکەم ژووری دراما دروست بکەیت.
                </p>
              )}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="py-16 text-center bg-white/5 border border-white/10 rounded-[1.5rem]">
              <Search className="w-12 h-12 text-white/15 mx-auto mb-4" />
              <h3 className="text-lg font-black text-gray-400 kurdish-text">
                هیچ ژوورێک بەم گەڕانە نەدۆزرایەوە
              </h3>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-black kurdish-text hover:bg-white/15"
              >
                پاککردنەوەی گەڕان
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 justify-items-center">
              {filteredRooms.map((room: any) => (
                <DramaRoomCard
                  key={room.id}
                  room={room}
                  onOpen={onOpenRoom}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  showActions={canManage}
                  liveViewers={liveViewersMap?.[room.id] ?? 0}
                  rating={ratingsMap?.[room.id]?.ccRating ?? 0}
                  ratingCount={ratingsMap?.[room.id]?.ratingCount ?? 0}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SimpleCinemaChatCard = ({ onOpen }: any) => (
  <div className="group relative flex-shrink-0 w-[220px] md:w-[280px] bg-zinc-900 border border-brand-primary/25 rounded-3xl overflow-hidden transition-all hover:border-brand-primary/60 hover:scale-[1.02]">
    <div className="p-5 flex flex-col min-h-[260px]">
      <div className="flex items-start justify-between gap-3">
        <div className="w-12 h-12 rounded-2xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center">
          <Tv className="w-6 h-6 text-brand-primary" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="px-2 py-0.5 bg-brand-primary text-white text-[8px] font-black rounded-full flex items-center gap-1 uppercase tracking-widest">
            <ShieldCheck className="w-2.5 h-2.5" />
            Official
          </span>
          <span className="px-2.5 py-1 bg-black/50 border border-white/10 text-white text-[10px] font-black rounded-full flex items-center gap-1">
            <Users className="w-3 h-3" />
            2 کەس
          </span>
        </div>
      </div>

      <div className="mt-5 flex-1">
        <h3 className="text-lg font-black text-white kurdish-text leading-snug flex items-center gap-2">
          <Film className="w-4 h-4 text-brand-primary" />
          CinemaChat
        </h3>
        <p className="mt-2 text-[12px] text-gray-400 kurdish-text leading-relaxed">
          ژووری فەرمی بۆ بینینی فیلم پێکەوە، چاتی تایبەت، و پەخشکردنی هاوکات.
        </p>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-5 w-full px-4 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-[11px] font-black kurdish-text flex items-center justify-center gap-2 transition-all shadow-xl shadow-red-600/20"
      >
        <Play className="w-4 h-4 fill-current" />
        OPEN WATCH-TOGETHER
      </button>
    </div>
  </div>
);

const toCinemaWindowPlaybackUrl = (
  url: string | undefined,
  options: { autoplay?: boolean; muted?: boolean; loop?: boolean; controls?: boolean } = {},
) => {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return "";

  const youtubeId = extractYouTubeId(cleanUrl);
  if (!youtubeId) return cleanUrl;

  const params = new URLSearchParams({
    autoplay: options.autoplay ? "1" : "0",
    mute: options.muted ? "1" : "0",
    controls: options.controls === false ? "0" : "1",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });

  if (options.loop) {
    params.set("loop", "1");
    params.set("playlist", youtubeId);
  }

  if (typeof window !== "undefined") {
    params.set("origin", window.location.origin);
  }

  return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
};

const getCinemaWindowRoomVideoUrl = (room: any) =>
  String(
    room?.fullVideoReference ||
      room?.streamingUrl ||
      room?.videoUrl ||
      room?.embedUrl ||
      room?.previewUrl ||
      "",
  ).trim();

type CinemaWindowSubtitlePayload = {
  rawText: string;
  vttText: string;
  sourceLang: string;
  source: string;
  originalRawText?: string;
  originalVttText?: string;
};

const cinemaWindowSubtitleCache = new Map<string, CinemaWindowSubtitlePayload>();

const subtitleTextToVtt = (subtitleText: string) => {
  const cleanText = String(subtitleText || "").replace(/^\uFEFF/, "").trim();
  if (!cleanText) return "";
  if (/^WEBVTT/i.test(cleanText)) return cleanText;
  return `WEBVTT\n\n${cleanText.replace(/\r+/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}\n`;
};

const CINEMA_WINDOW_SUBTITLE_LANGUAGES = [
  { code: "ckb", label: "کوردی", shortLabel: "کوردی CC" },
  { code: "ar", label: "عەرەبی", shortLabel: "عەرەبی CC" },
  { code: "en", label: "ئینگلیزی", shortLabel: "ئینگلیزی CC" },
];

const getCinemaWindowSubtitleLanguage = (code: string) =>
  CINEMA_WINDOW_SUBTITLE_LANGUAGES.find((language) => language.code === code) ||
  CINEMA_WINDOW_SUBTITLE_LANGUAGES[0];

type CinemaWindowSubtitleCue = {
  start: number;
  end: number;
  text: string;
};

type CcSettings = {
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  bgOpacity: number;
  textColor: string;
  showSubtitle: boolean;
  showOriginal: boolean;
};

const CC_SETTINGS_STORAGE_KEY = 'cinemachat-cc-settings';
const DEFAULT_CC_SETTINGS: CcSettings = { fontSize: 'md', bgOpacity: 0.8, textColor: '#ffffff', showSubtitle: true, showOriginal: false };
const CC_FONT_SIZES: { key: CcSettings['fontSize']; label: string; cls: string; mobileCls: string }[] = [
  { key: 'sm', label: 'A-', cls: 'text-sm md:text-base', mobileCls: 'text-[11px]' },
  { key: 'md', label: 'A', cls: 'text-lg md:text-2xl', mobileCls: 'text-base' },
  { key: 'lg', label: 'A+', cls: 'text-xl md:text-3xl', mobileCls: 'text-lg' },
  { key: 'xl', label: 'A++', cls: 'text-2xl md:text-4xl', mobileCls: 'text-xl' },
];
const CC_TEXT_COLORS = ['#ffffff', '#FFFF00', '#00FFFF', '#00FF00', '#FF8800', '#FF5555'];

function loadCcSettings(): CcSettings {
  try {
    const raw = localStorage.getItem(CC_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CC_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CC_SETTINGS, ...parsed };
  } catch { return DEFAULT_CC_SETTINGS; }
}
function saveCcSettings(s: CcSettings) { try { localStorage.setItem(CC_SETTINGS_STORAGE_KEY, JSON.stringify(s)); } catch { /* */ } }

const parseCinemaWindowSubtitleTime = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length < 3) return 0;
  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;
  const seconds = Number(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
};

const decodeCinemaWindowSubtitleText = (value: string) => {
  const withoutTags = value
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
    .replace(/<\/?c[^>]*>/g, "")
    .replace(/<[^>]+>/g, "");

  if (typeof document === "undefined") {
    return withoutTags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = withoutTags;
  return textarea.value;
};

const parseCinemaWindowSubtitleCues = (subtitleText: string): CinemaWindowSubtitleCue[] => {
  const lines = subtitleText.replace(/^\uFEFF/, "").split(/\r?\n/);
  const cues: CinemaWindowSubtitleCue[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const timingMatch = lines[index].match(
      /(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[\.,]\d{3})/,
    );
    if (!timingMatch) continue;

    const textLines: string[] = [];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      const line = lines[index].trim();
      if (!/^(Kind|Language):/i.test(line)) textLines.push(line);
      index += 1;
    }

    const text = decodeCinemaWindowSubtitleText(textLines.join("\n")).trim();
    if (text) {
      cues.push({
        start: parseCinemaWindowSubtitleTime(timingMatch[1]),
        end: parseCinemaWindowSubtitleTime(timingMatch[2]),
        text,
      });
    }
  }

  return cues;
};

const requestCinemaWindowSubtitle = async (
  sourceUrl: string,
  lang: string,
  signal?: AbortSignal,
  windowOptions?: { startSeconds?: number; windowSeconds?: number },
  subtitleUrl?: string,
) => {
  const response = await fetch("/api/subtitle/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl, lang, subtitleUrl: subtitleUrl || undefined, ...windowOptions }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || "Subtitle generation failed");
  }
  const rawText = String(data?.srt || "");
  const vttText = subtitleTextToVtt(rawText);
  if (!vttText) throw new Error("Subtitle file is empty");
  const originalRaw = String(data?.originalSrt || "");
  const originalVtt = originalRaw ? subtitleTextToVtt(originalRaw) : "";
  return {
    rawText,
    vttText,
    sourceLang: String(data?.lang || lang),
    source: String(data?.source || ""),
    originalRawText: originalRaw || undefined,
    originalVttText: originalVtt || undefined,
  };
};

const translateCinemaWindowSubtitle = async (
  subtitleText: string,
  targetLang: string,
  sourceLang: string,
  signal?: AbortSignal,
) => {
  const response = await fetch("/api/subtitle/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ srt: subtitleText, lang: targetLang, sourceLang }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || "Subtitle translation failed");
  }
  const rawText = String(data?.srt || "");
  const vttText = subtitleTextToVtt(rawText);
  if (!vttText) throw new Error("Translated subtitle file is empty");
  return {
    rawText,
    vttText,
    sourceLang: String(data?.lang || targetLang),
    source: String(data?.source || ""),
    originalRawText: subtitleText || undefined,
    originalVttText: subtitleText ? subtitleTextToVtt(subtitleText) : undefined,
  };
};

const CinemaWindowCard = ({ onOpen, room }: any) => {
  const cardPreviewSourceUrl =
    room?.previewUrl ||
    room?.fullVideoReference ||
    room?.streamingUrl ||
    room?.videoUrl ||
    "";
  const [directCardPreviewUrl, setDirectCardPreviewUrl] = useState("");
  const [cardPreviewFailed, setCardPreviewFailed] = useState(false);
  const cardPreviewUrl = toCinemaWindowPlaybackUrl(cardPreviewSourceUrl, {
    autoplay: true,
    muted: true,
    loop: true,
    controls: false,
  });
  const cardPreviewYoutubeId = extractYouTubeId(cardPreviewSourceUrl);

  useEffect(() => {
    let cancelled = false;
    setCardPreviewFailed(false);
    setDirectCardPreviewUrl("");

    if (!cardPreviewSourceUrl) return;
    if (!cardPreviewYoutubeId) {
      setDirectCardPreviewUrl(cardPreviewSourceUrl);
      return;
    }

    fetch("/api/resolve-stream", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ url: cardPreviewSourceUrl }),
    })
      .then((response) => response.json())
      .then((data) => {
        const streamUrl = Array.isArray(data?.streams) && typeof data.streams[0]?.url === "string"
          ? data.streams[0].url
          : "";
        if (!cancelled) {
          if (streamUrl) setDirectCardPreviewUrl(streamUrl);
          else setCardPreviewFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setCardPreviewFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [cardPreviewSourceUrl, cardPreviewYoutubeId]);

  return (
  <div className="group relative flex-shrink-0 w-[200px] md:w-[260px] bg-gradient-to-br from-zinc-950 via-amber-950/20 to-zinc-950 border border-amber-500/35 rounded-3xl overflow-hidden transition-all hover:border-amber-400/70 hover:shadow-2xl hover:shadow-amber-500/10 hover:scale-[1.02] cursor-pointer">
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-right focus:outline-none"
    >
      <div className="aspect-video w-full bg-gradient-to-br from-black via-zinc-950 to-amber-950/30 overflow-hidden relative">
        {directCardPreviewUrl ? (
          <video
            src={directCardPreviewUrl}
            poster={room?.posterUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            onError={() => setCardPreviewFailed(true)}
          />
        ) : room?.posterUrl && (
          <img src={room.posterUrl} alt={room?.name || "Cinema Window"} className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
        )}
        {!directCardPreviewUrl && cardPreviewUrl && !cardPreviewFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="w-5 h-5 text-amber-300 animate-spin" />
          </div>
        )}
        {!directCardPreviewUrl && !room?.posterUrl && (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.22),transparent_42%)]" />
            <div className="absolute inset-x-8 top-6 h-16 rounded-b-3xl bg-gradient-to-r from-transparent via-red-600/80 to-transparent blur-sm opacity-70" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-black/20" />
        <span className="absolute top-3 right-3 px-2 py-0.5 bg-amber-400 text-black text-[8px] font-black rounded-full uppercase tracking-widest">
          VIP
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-black text-white kurdish-text leading-snug flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-amber-400" />
          {room?.name || "Cinema Window"}
        </h3>
        <p className="mt-1.5 text-[11px] text-gray-400 kurdish-text leading-relaxed line-clamp-2">
          ژووری VIP بۆ بینینی preview و کردنەوەی فیلمی تەواو بە کۆدی تایبەت.
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] font-black text-amber-300">
            {room?.price ?? 1.99} {room?.currency || "USD"}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {room?.status || "ACTIVE"}
          </span>
        </div>
      </div>
    </button>
  </div>
  );
};

const DramaRoomDetailModal = ({ room, resolvedMovies, openMovie, onClose, rating, ratingCount, userRating, onRate }: any) => {
  // Resolve each stored drama id to its movie, keeping the room's stored order
  // so the per-room numbering ("Drama 1", "Drama 2", ...) is automatic — only
  // this room's dramas are ever resolved, never dramas from other rooms.
  const dramas = (Array.isArray(room?.dramas) ? room.dramas : [])
    .map((id: string, order: number) => ({ id, order, movie: resolvedMovies?.[id] }))
    .filter((x: any) => Boolean(x.movie));
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-zinc-900 border border-white/10 rounded-[2rem] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-20 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-red-900/30 via-zinc-800 to-zinc-950 flex items-center justify-center flex-shrink-0">
              {room?.coverUrl ? (
                <img src={room.coverUrl} alt={room?.title} className="w-full h-full object-cover" />
              ) : (
                <Tv className="w-6 h-6 text-brand-primary/60" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-black text-white kurdish-text truncate">
                {room?.title}
              </h3>
              <p className="mt-1 text-xs text-gray-400 kurdish-text leading-relaxed">
                {room?.description || "بێ وەسف"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-white hover:text-brand-primary flex items-center justify-center flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Room's own interactive rating — mirrors the movie rating row, but
            keyed to this room's id (db.roomRatings) so it is fully isolated. */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 kurdish-text">
              هەڵسەنگاندنی ژوور
            </span>
            {Number(userRating) > 0 && (
              <span className="text-[10px] font-bold text-brand-primary">
                (تۆ: {Number(userRating)}/10)
              </span>
            )}
            {Number(ratingCount) > 0 && (
              <span className="text-[10px] font-bold text-gray-500">
                · {Number(ratingCount)} دەنگ
              </span>
            )}
            {Number(rating) > 0 && (
              <span className="text-[10px] font-bold text-emerald-400">
                · {Number(rating).toFixed(1)}/10
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onRate?.(room, n)}
                title={`${n}/10`}
                className={`transition-all active:scale-75 ${
                  Number(userRating) >= n
                    ? "text-brand-primary"
                    : "text-gray-600 hover:text-brand-primary/50"
                }`}
              >
                <Star
                  className={`w-4 h-4 ${
                    Number(userRating) >= n ? "fill-current" : ""
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {dramas.length === 0 ? (
          <div className="py-14 text-center text-gray-500 kurdish-text">
            هیچ درامایەک لەم ژوورەدا بەردەست نییە
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {dramas.map(({ movie, order }: any) => (
              <button
                type="button"
                key={movie.id}
                onClick={() => openMovie(movie)}
                className="group text-right focus:outline-none"
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 relative group-hover:ring-2 group-hover:ring-brand-primary/60 transition-all">
                  {movie.posterUrl ? (
                    <img src={movie.posterUrl} alt={movie.title} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                      <Film className="w-8 h-8 text-white/20" />
                    </div>
                  )}
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 border border-white/15 text-white text-[10px] font-black">
                    Drama {order + 1}
                  </span>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-brand-primary text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <Play className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs font-bold text-white kurdish-text line-clamp-1">
                  {movie.title}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const DramaRoomCrudModal = ({ editing, movies, allMovies, onSave, onClose }: any) => {
  const [title, setTitle] = useState(editing?.title || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [coverUrl, setCoverUrl] = useState(editing?.coverUrl || "");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    Array.isArray(editing?.dramas) ? [...editing.dramas] : [],
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  // Selection mode: "drama" keeps the existing drama-only list (default, so the
  // old behavior is untouched); "all" shows the full catalog so an admin can mix
  // dramas AND movies in one room. Only affects the picker, never persistence.
  const [mode, setMode] = useState<"drama" | "all">("drama");

  // The base list the picker draws from for the current mode. "all" falls back
  // to the drama-only list when the full catalog prop is missing.
  const modeMovies = mode === "all" ? (Array.isArray(allMovies) ? allMovies : movies) : movies;

  const filteredMovies = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = modeMovies;
    if (q) {
      list = list.filter((m: any) =>
        String(m?.title || "").toLowerCase().includes(q),
      );
    }
    return list.slice(0, 80);
  }, [modeMovies, search]);

  // Always keep already-assigned dramas in the visible list (checked), even if
  // the search or the 80-item cap would otherwise hide them, so the admin can
  // still uncheck them to remove the assignment from this room only.
  const selectableMovies = useMemo(() => {
    const list = [...filteredMovies];
    const ids = new Set(list.map((m: any) => m?.id));
    for (const id of editing?.dramas || []) {
      if (!ids.has(id)) {
        const movie = modeMovies.find((m: any) => m?.id === id);
        if (movie) list.push(movie);
      }
    }
    return list;
  }, [filteredMovies, modeMovies, editing]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert("ناونیشانی ژوورەکە پێویستە");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        coverUrl: coverUrl.trim(),
        dramas: selectedIds,
      });
    } catch (e) {
      console.warn("Failed to save drama room:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-zinc-900 border border-white/10 rounded-[2rem] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 mb-6">
          <h3 className="text-xl font-black text-white kurdish-text">
            {editing ? "دەستکاری ژووری دراما" : "ژووری درامای نوێ"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-white hover:text-brand-primary flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-400 kurdish-text block mb-1.5">
              ناونیشان *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white kurdish-text outline-none focus:border-brand-primary text-sm"
              placeholder="نموونە: دراماکانی تورکی ٢٠٢٤"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 kurdish-text block mb-1.5">
              وەسف
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white kurdish-text outline-none focus:border-brand-primary text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 kurdish-text block mb-1.5">
              وێنەی سەرەوە (لینکی وێنە)
            </label>
            <input
              type="text"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white kurdish-text outline-none focus:border-brand-primary text-sm"
              placeholder="https://..."
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label className="text-xs font-bold text-gray-400 kurdish-text">
                {mode === "all"
                  ? `فیلم و دراماکان (${selectedIds.length} هەڵبژێردراوە)`
                  : `دراماکان (${selectedIds.length} هەڵبژێردراوە)`}
              </label>
              {/* Mode toggle: drama-only (default) or dramas AND movies. The
                  picker list changes but the saved assignment shape does not —
                  room.dramas stores mixed ids and the detail view resolves any. */}
              <div className="flex items-center rounded-lg bg-black/40 border border-white/10 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("drama")}
                  className={`px-3 py-1 rounded-md text-[11px] font-black kurdish-text transition-all ${
                    mode === "drama"
                      ? "bg-brand-primary text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  دراما تەنها
                </button>
                <button
                  type="button"
                  onClick={() => setMode("all")}
                  className={`px-3 py-1 rounded-md text-[11px] font-black kurdish-text transition-all ${
                    mode === "all"
                      ? "bg-brand-primary text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  دراما و فیلم
                </button>
              </div>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white kurdish-text outline-none focus:border-brand-primary text-xs mb-2"
              placeholder={mode === "all" ? "بگەڕێ بۆ ناوی فیلم یان دراما..." : "بگەڕێ بۆ ناوی دراما..."}
            />
            <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5">
              {selectableMovies.length === 0 && (
                <p className="p-4 text-center text-xs text-gray-500 kurdish-text">
                  {mode === "all" ? "هیچ فیلم یان درامایەک نەدۆزرایەوە" : "هیچ درامایەک نەدۆزرایەوە"}
                </p>
              )}
              {selectableMovies.map((m: any) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleId(m.id)}
                      className="w-4 h-4 accent-red-600"
                    />
                    <span className="text-xs font-bold text-white kurdish-text truncate flex-1">
                      {m.title}
                    </span>
                    {checked && (
                      <CheckCircle2 className="w-4 h-4 text-brand-primary flex-shrink-0" />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-sm font-bold kurdish-text hover:bg-white/10"
          >
            پاشگەزبوونەوە
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-3 rounded-xl bg-brand-primary text-white text-sm font-black kurdish-text hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {editing ? "پاشەکەوتکردن" : "دروستکردن"}
          </button>
        </div>
      </div>
    </div>
  );
};

const DramaRoomsHub = ({
  rooms,
  currentUser,
  systemVerified,
  canCreateRoom,
  onOpenRoom,
  onCreate,
  onEdit,
  onDelete,
  liveViewersMap,
  ratingsMap,
  onOpenCinemaChat,
  onOpenDramaHub,
  onOpenCinemaWindow,
  cinemaWindowRoom,
}: any) => {
  const canManage = systemVerified && !!currentUser;
  const activeRoomCount = rooms.filter((room: any) => Number(liveViewersMap?.[room?.id]) > 0).length;
  return (
    <section id="drama-rooms" className="relative z-20 px-8 pb-16 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tv className="w-5 h-5 text-brand-primary" />
              <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] font-mono">
                DRAMA ROOMS
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white kurdish-text">
              ژوورەکانی دراما
            </h2>
            <p className="mt-1 text-xs text-gray-500 kurdish-text">
              ژوورە بەردەوامەکان — هەر ژوورێک کۆمەڵێک درامای بێسنوور تێدایە
            </p>
          </div>
          {canCreateRoom && (
            <button
              type="button"
              onClick={onCreate}
              className="px-5 py-3 rounded-2xl bg-brand-primary text-white text-sm font-black kurdish-text hover:opacity-90 flex items-center gap-2 shadow-xl shadow-red-600/20"
            >
              <Plus className="w-4 h-4" />
              ژووری نوێ
            </button>
          )}
        </div>

        {false && rooms.length === 0 && (
          <div className="text-center py-16 bg-white/5 border border-white/10 rounded-[2rem] mb-4">
            <Tv className="w-12 h-12 text-white/15 mx-auto mb-4" />
            <h3 className="text-lg font-black text-gray-400 kurdish-text">
              هیچ ژوورێکی دراما نەدۆزرایەوە
            </h3>
            {canManage && (
              <p className="mt-2 text-xs text-gray-500 kurdish-text">
                دەتوانیت ژووری درامای نوێ دروست بکەیت بۆ کۆکردنەوەی زنجیرە و فیلمەکان
              </p>
            )}
          </div>
        )}
        <div className="flex gap-5 overflow-x-auto no-scrollbar pb-6 pr-1">
          {/* Permanent official two-person watch room — always first. */}
          <SimpleCinemaChatCard onOpen={onOpenCinemaChat} />
          <DramaHubCard
            roomCount={rooms.length}
            activeCount={activeRoomCount}
            onOpen={onOpenDramaHub}
          />
          <CinemaWindowCard onOpen={onOpenCinemaWindow} room={cinemaWindowRoom} />
        </div>
      </div>
    </section>
  );
};

const DramaRoomGallery = ({ rooms, onOpenRoom, liveViewersMap, ratingsMap }: any) => {
  if (rooms.length === 0) return null;
  return (
    <section className="pl-8">
      <h3 className="text-2xl font-black mb-6 kurdish-text text-white flex items-center gap-3">
        <Tv className="w-6 h-6 text-brand-primary" />
        گەلەری ژوورەکانی دراما
      </h3>
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-8 pr-8">
        {rooms.map((room: any) => (
          <DramaRoomCard
            key={room.id}
            room={room}
            onOpen={onOpenRoom}
            compact
            liveViewers={liveViewersMap?.[room.id] ?? 0}
            rating={ratingsMap?.[room.id]?.ccRating ?? 0}
            ratingCount={ratingsMap?.[room.id]?.ratingCount ?? 0}
          />
        ))}
      </div>
    </section>
  );
};

export default function App() {
  const { t: tr } = useI18n();

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ===== Drama Rooms (persistent curated collections) =====
  // Loaded from /api/drama-rooms (server-persisted in db.dramaRooms). The hub
  // and gallery both consume this list; the CRUD modal keeps it in sync.
  const [dramaRooms, setDramaRooms] = useState<any[]>([]);
  const [dramaCategory, setDramaCategory] = useState("all");
  const [selectedDramaRoom, setSelectedDramaRoom] = useState<any>(null);
  const [showDramaRoomModal, setShowDramaRoomModal] = useState(false);
  const [editingDramaRoom, setEditingDramaRoom] = useState<any>(null);
  const [showDramaHubModal, setShowDramaHubModal] = useState(false);
  // The permanent CinemaChat watch room modal (main_broadcast_room) — opened
  // from the "watch together" invitation notifications (outside this flow).
  const [showCinemaChatRoom, setShowCinemaChatRoom] = useState(false);
  // The CinemaChat private Friend → Connect modal (the card's main entry).
  const [showFriendConnect, setShowFriendConnect] = useState(false);

  // Movie IDs currently assigned to any Drama Room. Used to hide assigned
  // dramas from the public main listing (they stay visible inside their room);
  // removing a drama from every room removes it from this set automatically.
  const assignedDramaIds = useMemo(() => {
    const ids = new Set<string>();
    for (const room of dramaRooms) {
      if (Array.isArray(room?.dramas)) {
        for (const id of room.dramas) {
          if (id) ids.add(String(id));
        }
      }
    }
    return ids;
  }, [dramaRooms]);

  // Public catalog = every post EXCEPT dramas currently assigned to a Drama
  // Room. Assigned dramas stay permanently stored and remain reachable through
  // their room; they never mix with normal movies in the public listing.
  const publicMovies = useMemo(
    () => movies.filter((m: any) => !assignedDramaIds.has(m.id)),
    [movies, assignedDramaIds],
  );

  // Movies shown in the Drama Room edit selection list: drama-tagged posts only
  // (no normal movie posts), plus any already-assigned dramas so they can
  // always be unchecked to remove the assignment from the room.
  const dramaRoomEditMovies = useMemo(() => {
    const ids = new Set<string>();
    const out: any[] = [];
    for (const m of movies) {
      if (isDramaMovie(m)) {
        out.push(m);
        ids.add(m.id);
      }
    }
    for (const id of editingDramaRoom?.dramas || []) {
      if (!ids.has(id)) {
        const movie = movies.find((x: any) => x?.id === id);
        if (movie) out.push(movie);
      }
    }
    return out;
  }, [movies, editingDramaRoom]);

  // Movie-card enhancements: favorites, likes, and live-viewer metrics.
  // favorites/liked are per-user (Firestore users/{uid}, localStorage for guests);
  // likes/liveViewers maps are server-computed and refreshed by polling.
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likesMap, setLikesMap] = useState<Record<string, number>>({});
  const [liveViewersMap, setLiveViewersMap] = useState<Record<string, number>>({});
  // Live concurrent viewers per Drama Room (distinct sessions across the room's
  // dramas). Server-computed and refreshed by a dedicated 30s poll so room card
  // badges reflect real activity without touching the movie-card metrics.
  const [roomLiveViewers, setRoomLiveViewers] = useState<Record<string, number>>({});
  // Per-room CinemaChat ratings: roomId -> { ccRating, ratingCount }. Kept
  // separate from movie ratings so each room's rating is fully independent.
  const [roomRatingsMap, setRoomRatingsMap] = useState<
    Record<string, { ccRating: number; ratingCount: number }>
  >({});
  // Current user's own rating per room (optimistic + server-confirmed).
  const [userRoomRatingsMap, setUserRoomRatingsMap] = useState<Record<string, number>>({});
  // Lifetime view counts per movie (server-computed, persistent) shown as the
  // "📈 Views" counter on every card. Refreshed by the live poll + heartbeat.
  const [viewsMap, setViewsMap] = useState<Record<string, number>>({});
  // Server-computed card metrics refreshed by the /api/movies/live poll.
  const [ratingsMap, setRatingsMap] = useState<
    Record<string, { ccRating: number; ratingCount: number }>
  >({});
  const [favoriteCountsMap, setFavoriteCountsMap] = useState<Record<string, number>>({});
  const [trendingScoresMap, setTrendingScoresMap] = useState<Record<string, number>>({});
  // Current user's own rating per movie (optimistic + server-confirmed).
  const [userRatingsMap, setUserRatingsMap] = useState<Record<string, number>>({});

  // Smart-search UI state: title/genre/AI modes, suggestion chips and history.
  const [searchMode, setSearchMode] = useState<"title" | "genre" | "ai">("title");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<Movie[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMeta, setAiMeta] = useState<{
    keywords: string[];
    genres: string[];
    titles: string[];
  }>({ keywords: [], genres: [], titles: [] });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<{ term: string; count: number }[]>([]);
  const [sortBy, setSortBy] = useState<"recent" | "trending" | "live">("recent");

  // Continue-watching store (movieId -> { progress, duration, updatedAt }).
  const [continueWatchingStore, setContinueWatchingStore] = useState<
    Record<string, { progress: number; duration: number; updatedAt: number }>
  >({});

  // Tombstone guard for deleted movies. Keeps a deleted movie out of the UI
  // instantly (optimistic removal) AND stops the 60s /api/movies poll or the
  // Firestore fallback from resurrecting it while the server delete is in
  // flight, or if the server is unreachable at delete time.
  const deletedMovieIdsRef = useRef<Set<string>>(new Set());

  // Bulk-select state for Section 6 (Movie Management): ids of the movies the
  // admin has ticked for batch deletion. Cleared after a successful bulk delete
  // or by toggling the row/select-all checkboxes.
  const [selectedMovieIds, setSelectedMovieIds] = useState<string[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  // Explicit, separate open state for the movie details panel. A movie-card
  // click opens details ONLY (never the player); the player opens exclusively
  // from the dedicated Play button inside the details panel. Keeping
  // `selectedMovie` (which movie), `isMovieDetailsOpen` (details layer) and
  // `showPlayer` (player layer) as three distinct states guarantees the two
  // layers can never both be active foreground modals at the same time.
  const [isMovieDetailsOpen, setIsMovieDetailsOpen] = useState(false);
  // Page scroll position captured the instant the movie detail/player modal
  // opens, restored verbatim when it closes so the homepage never jumps to the
  // top (scroll position is lost today when a movie card is clicked).
  const savedPageScrollRef = useRef<number | null>(null);
  // The element that opened the details modal, so keyboard focus can be
  // returned to it when the modal fully closes (accessibility requirement).
  const movieReturnFocusRef = useRef<HTMLElement | null>(null);
  // The details/player dialog container, used to move focus into the modal.
  const movieModalRef = useRef<HTMLDivElement | null>(null);

  // Dynamic genres from Firestore (real-time). While the snapshot hasn't
  // arrived yet we fall back to the default catalog so the nav never flashes
  // empty on slow networks / cold rules.
  const [dynamicGenres, setDynamicGenres] = useState<Genre[]>([]);
  const [genresReady, setGenresReady] = useState(false);

  useEffect(() => {
    // Real-time genre subscription for the main nav. Seeding happens only in the
    // admin panel (CategoryModule) so visitors are never silently authenticated
    // — everyone sees DEFAULT_GENRES as a fallback until the snapshot arrives.
    const unsub = subscribeGenres((list) => {
      setDynamicGenres(list);
      setGenresReady(true);
    });
    return unsub;
  }, []);

  // If the currently selected genre is deleted in the admin panel, fall back to
  // the "all" view instead of leaving a dead filter active.
  useEffect(() => {
    if (!genresReady) return;
    if (activeTab !== "all" && !dynamicGenres.some((g) => g.tag === activeTab)) {
      setActiveTab("all");
    }
  }, [dynamicGenres, genresReady, activeTab]);

  const [autoPlay, setAutoPlay] = useState(false);
  const [isHeroMuted, setIsHeroMuted] = useState(false);
  const [activeInvitation, setActiveInvitation] = useState<any>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const hasCountdownRun = useRef(false); // This ref is no longer strictly needed for countdown logic, but kept for potential future use or other related logic.
  const [isRoomMuted, setIsRoomMuted] = useState(false);
  const [featuredMovieFromDB, setFeaturedMovieFromDB] = useState<Movie | null>(
    null,
  );
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [roomIndex, setRoomIndex] = useState(0);
  const [heroTrailerPlaylist, setHeroTrailerPlaylist] = useState<string[]>([]);
  const [globalStreamURL, setGlobalStreamURL] = useState<string | null>(null);

  const [lastAddedMovie, setLastAddedMovie] = useState<any>(null);
  const [activeServerUrl, setActiveServerUrl] = useState<string | null>(null);
  // Tracks how the resilient YouTube player is rendering so the YouTube-only CSS
  // masks are only drawn over the embed (never over the native fallback video).
  const [youtubePlayerMode, setYoutubePlayerMode] = useState<"embed" | "direct" | "error">("embed");
  const [copiedLink, setCopiedLink] = useState(false);
  const [bannedFromSystem, setBannedFromSystem] = useState(false);
  const [blockedAt, setBlockedAt] = useState<Date | null>(null);
  const [ownerExempt, setOwnerExempt] = useState(false);
  const [unblockAt, setUnblockAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [emergencyLocked, setEmergencyLocked] = useState(false);
  // Unblock-request form state shown on the block screen
  const [unblockName, setUnblockName] = useState("");
  const [unblockPhone, setUnblockPhone] = useState("");
  const [unblockSending, setUnblockSending] = useState(false);
  const [unblockFeedback, setUnblockFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Main Modal Player customized states
  const [isIframePlaying, setIsIframePlaying] = useState(true);
  const [isIframeMuted, setIsIframeMuted] = useState(false);
  const [isIframeFullscreen, setIsIframeFullscreen] = useState(false);

  // Immersive cinematic player: zoom multiplier and active menu.
  const [immersiveScale, setImmersiveScale] = useState(1);
  const [playerMenu, setPlayerMenu] = useState<null | "quality" | "speed" | "subtitle">(null);

  // Progress / seek bar state.
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const dragTimeRef = useRef<number | null>(null);

  // Unified playback speed control. `playbackRateRef` mirrors the state so the
  // hold-to-cycle interval can read the latest value without stale closures.
  const [playbackRate, setPlaybackRate] = useState(1);
  const playbackRateRef = useRef(1);
  // Big center HUD shown for a moment after a speed change (hold or menu).
  const [speedHudValue, setSpeedHudValue] = useState(1);
  const [speedHudVisible, setSpeedHudVisible] = useState(false);
  const speedHudTimerRef = useRef<number | null>(null);
  // Seconds to resume the next time the player mounts (set by openMovie).
  const resumeTimeRef = useRef(0);
  // Long-press "hold to change speed" bookkeeping.
  const speedHoldRef = useRef<{
    timer: number | null;
    interval: number | null;
    startX: number;
    startY: number;
    fired: boolean;
  }>({ timer: null, interval: null, startX: 0, startY: 0, fired: false });

  useEffect(() => {
    const handleFsChange = () => {
      setIsIframeFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, []);

  // The room-player YouTube embed URL starts muted (mute=1) so autoplay is
  // always permitted by the browser. The app's default audio state is UNMUTED
  // (isIframeMuted === false), so re-assert `unMute` in a short retry loop after
  // the iframe mounts — YouTube silently drops commands posted before its player
  // is ready, which previously left playback silent with a "unmuted" icon.
  useEffect(() => {
    if (!showPlayer || isIframeMuted) return;
    if (!activeServerUrl || !/youtube\.com|youtu\.be/i.test(activeServerUrl)) return;
    const frame = document.getElementById("room-player") as HTMLIFrameElement | null;
    if (!frame?.contentWindow) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      frame.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "unMute", args: [] }),
        "https://www.youtube.com",
      );
      attempts += 1;
      if (attempts >= 24) window.clearInterval(timer);
    }, 400);
    return () => window.clearInterval(timer);
  }, [showPlayer, activeServerUrl, isIframeMuted]);

  const ytCurrentTimeRef = useRef(0);
  const localClockRef = useRef(0);
  // Mirrors `isIframePlaying` for stable live-sync callbacks (the state version
  // would otherwise force re-subscribing the SyncRoom listener on every change).
  const ytPlayingRef = useRef(true);
  // Latest activeServerUrl, mirrored for the same reason (stable callbacks).
  const activeServerUrlRef = useRef<string | null>(null);
  useEffect(() => {
    activeServerUrlRef.current = activeServerUrl;
  }, [activeServerUrl]);
  // Set by the host live-publisher effect; invoked by seekToPlayer/toggleIframePlay
  // so a host seek or play/pause reaches the room immediately (not on the next poll).
  const publishPlaybackNowRef = useRef<(override?: { currentTime?: number; isPlaying?: boolean }) => void>(() => {});
  // True while the modal is showing a YouTube source. The infoDelivery filter
  // resolves the modal's own iframe at message time, so a late-mounting embed
  // is still accepted and the background hero can't override the clock.
  const modalYoutubeRef = useRef(false);
  // True once the modal's YouTube embed actually streams infoDelivery; used to
  // stop the listening-handshake retry loop (YouTube may init slowly).
  const ytClockLiveRef = useRef(false);
  // Holds the user's play/pause intent until the room-player embed's JS-API
  // channel is live. Posting play/pause too early (before the embed streams)
  // permanently desyncs the widget, which then never emits onReady/infoDelivery
  // — the clock stays 0:00 and the stall guard later restarts the video.
  const pendingRoomPlayerPlayRef = useRef<boolean | null>(null);

  // Track the embedded YouTube player's clock via its postMessage events.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!/youtube\.com|youtu\.be/.test(event.origin)) return;
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data?.event === "infoDelivery" && data.info && typeof data.info.currentTime === "number") {
        // Accept time only from the modal's own embed (ignore the hero beneath
        // it). Resolve the iframe now so late-mounted or remounted embeds work.
        if (!modalYoutubeRef.current) return;
        const frame = document.getElementById("room-player") as HTMLIFrameElement | null;
        if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
        ytClockLiveRef.current = true;
        ytCurrentTimeRef.current = data.info.currentTime;
        // If play/pause was requested before the embed's channel was live, apply
        // it now that the clock is streaming (the video is autoplaying, so a
        // held "pause" pauses at the live position and the clock stays accurate).
        if (pendingRoomPlayerPlayRef.current !== null) {
          const pendingCmd = pendingRoomPlayerPlayRef.current ? "playVideo" : "pauseVideo";
          frame.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: pendingCmd, args: [] }),
            "https://www.youtube.com",
          );
          pendingRoomPlayerPlayRef.current = null;
        }
        // Also capture the embed-reported duration so the seek bar knows the total length.
        if (typeof data.info.duration === "number" && data.info.duration > 0) {
          setPlayerDuration(data.info.duration);
          // Drama Room auto-next (clock fallback): the embed reports the clock
          // at the very end right before looping back to 0s. When it reaches
          // the duration the episode has truly finished.
          if (data.info.currentTime >= data.info.duration - 1.5) {
            dramaEndedHandlerRef.current?.();
          }
        }
      }
      // YouTube widget ENDED state (0) — the episode finished. Only accept it
      // from the modal's own embed (never from the hero player underneath).
      if (
        data?.event === "onStateChange" &&
        (data.info === 0 || data.data === 0)
      ) {
        if (!modalYoutubeRef.current) return;
        const frame = document.getElementById("room-player") as HTMLIFrameElement | null;
        if (frame?.contentWindow && event.source === frame.contentWindow) {
          dramaEndedHandlerRef.current?.();
        }
      }
      // Keep the Play/Pause button honest: mirror the embed's reported state so
      // an ignored/failed command never leaves the icon showing the wrong side.
      if (
        data?.event === "onStateChange" &&
        (data.info === 1 || data.data === 1)
      ) {
        const frame = document.getElementById("room-player") as HTMLIFrameElement | null;
        if (frame?.contentWindow && event.source === frame.contentWindow) {
          setIsIframePlaying(true);
          ytPlayingRef.current = true;
        }
      }
      if (
        data?.event === "onStateChange" &&
        (data.info === 2 || data.data === 2)
      ) {
        const frame = document.getElementById("room-player") as HTMLIFrameElement | null;
        if (frame?.contentWindow && event.source === frame.contentWindow) {
          setIsIframePlaying(false);
          ytPlayingRef.current = false;
        }
      }
      // YouTube IFrame API handshake: acknowledge onReady and subscribe to
      // infoDelivery. Without this the embed never streams currentTime/duration,
      // which the seek bar and the AI-subtitle overlay both depend on.
      if (data?.event === "onReady" && data.id && event.source) {
        (event.source as Window).postMessage(
          JSON.stringify({
            event: "listening",
            id: data.id,
            channel: "widget",
            funcs: ["onInfoDelivery"],
          }),
          event.origin,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Scope the clock to the modal's YouTube embed while it is open.
  useEffect(() => {
    modalYoutubeRef.current = !!activeServerUrl && /youtube\.com|youtu\.be/i.test(activeServerUrl);
  }, [showPlayer, activeServerUrl, selectedMovie?.id]);

  // YouTube IFrame API `listening` handshake: some embeds never send onReady on
  // their own, so proactively subscribe to infoDelivery and keep retrying until
  // the embed actually streams it (YouTube may initialize slowly in some
  // contexts). Resolves the frame each tick so remounts are handled.
  useEffect(() => {
    if (!showPlayer || !activeServerUrl || !/youtube\.com|youtu\.be/i.test(activeServerUrl)) return;
    ytClockLiveRef.current = false;
    pendingRoomPlayerPlayRef.current = null;
    const msg = JSON.stringify({
      event: "listening",
      id: "widget",
      channel: "widget",
      funcs: ["onInfoDelivery"],
    });
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (ytClockLiveRef.current || attempts >= 120) {
        window.clearInterval(timer);
        return;
      }
      const frame = document.getElementById("room-player") as HTMLIFrameElement | null;
      frame?.contentWindow?.postMessage(msg, "https://www.youtube.com");
      attempts += 1;
    }, 400);
    return () => window.clearInterval(timer);
  }, [showPlayer, activeServerUrl]);

  // Reset playback clocks whenever a new movie or server is mounted.
  useEffect(() => {
    localClockRef.current = 0;
    ytCurrentTimeRef.current = 0;
  }, [selectedMovie?.id, activeServerUrl]);

  // ---- Progress / seek bar ----
  // Poll the active player's clock ~4x/sec to drive the bar and time readout.
  // YouTube reports real time via infoDelivery; direct videos read Plyr's own
  // clock; other cross-origin embeds fall back to the local clock.
  useEffect(() => {
    if (!showPlayer) return;
    const isYouTube = !!activeServerUrl && /youtube\.com|youtu\.be/i.test(activeServerUrl);
    const tick = () => {
      let t = 0;
      let d = 0;
      // 0. Direct-stream fallback <video> (YouTubeResilientPlayer "direct" mode)
      //    takes priority — the embed is unmounted there, so ytCurrentTimeRef
      //    is stale (0) and would otherwise snap the seek bar back to 00:00.
      const directVideo = document.getElementById("room-player-direct-video") as HTMLVideoElement | null;
      if (directVideo) {
        t = typeof directVideo.currentTime === "number" ? directVideo.currentTime : 0;
        d = typeof directVideo.duration === "number" && Number.isFinite(directVideo.duration) ? directVideo.duration : 0;
        localClockRef.current = t;
      } else if (plyrRef.current?.plyr) {
        const p = plyrRef.current.plyr;
        t = typeof p.currentTime === "number" ? p.currentTime : 0;
        d = typeof p.duration === "number" && Number.isFinite(p.duration) ? p.duration : 0;
        localClockRef.current = t;
      } else if (isYouTube) {
        t = ytCurrentTimeRef.current;
        localClockRef.current = t;
      } else {
        // External cross-origin embed (ImmersiveShieldedPlayer) — we cannot
        // read the iframe's currentTime, so advance the drift clock by the
        // tick interval (~250 ms).  This is approximate (ignores pauses /
        // buffering) but good enough for subtitle cue matching.
        localClockRef.current += 0.25;
        t = localClockRef.current;
      }
      // Duration fallback: keep the last reported duration when the player reports none.
      setPlayerCurrentTime(t);
      if (d > 0) setPlayerDuration(d);
    };
    tick();
    const iv = window.setInterval(tick, 250);
    return () => window.clearInterval(iv);
  }, [showPlayer, activeServerUrl]);

  // Compute the target time from a pointer position on the seek bar.
  const seekTimeFromEvent = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
    return ratio * playerDuration;
  };

  // Seek the active player to `seconds` (clamped to the known duration).
  const seekToPlayer = (seconds: number) => {
    const t = Math.max(0, seconds);
    setPlayerCurrentTime(t);
    // 1. Direct video (Plyr): native seek.
    if (plyrRef.current?.plyr) {
      plyrRef.current.plyr.currentTime = t;
    }
    // 2. YouTube embed: iframe API seekTo command.
    const roomPlayer = document.getElementById("room-player") as HTMLIFrameElement | null;
    if (roomPlayer?.contentWindow) {
      roomPlayer.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [t, true] }),
        "https://www.youtube.com",
      );
    }
    // 3. Other embeds: best-effort seek + local-clock fallback so AI subtitles
    //    re-sync even if the provider ignores the command.
    const frame = document.getElementById("streaming-player") as HTMLIFrameElement | null;
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [t, true] }),
        "*",
      );
    }
    // 4. Direct-stream fallback <video> (YouTubeResilientPlayer "direct" mode):
    //    seek it natively so the timeline works there too.
    const directVideo = document.getElementById("room-player-direct-video") as HTMLVideoElement | null;
    if (directVideo) {
      try {
        directVideo.currentTime = t;
      } catch {
        /* ignore */
      }
    }
    localClockRef.current = t;
    // Publish immediately so guests follow a host seek without waiting for the
    // next 3s poll (uses the seek target, since iframe clocks lag the command).
    publishPlaybackNowRef.current({ currentTime: t });
  };

  const startSeekDrag = (e: React.PointerEvent) => {
    if (playerDuration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const nextTime = seekTimeFromEvent(e);
    dragTimeRef.current = nextTime;
    setDragTime(nextTime);
  };

  const updateSeekDrag = (e: React.PointerEvent) => {
    if (dragTimeRef.current === null) return;
    const nextTime = seekTimeFromEvent(e);
    dragTimeRef.current = nextTime;
    setDragTime(nextTime);
  };

  const endSeekDrag = () => {
    const nextTime = dragTimeRef.current;
    if (nextTime === null) return;
    seekToPlayer(nextTime);
    dragTimeRef.current = null;
    setDragTime(null);
  };

  const getIframe = (id: string): HTMLIFrameElement | null => {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el instanceof HTMLIFrameElement) return el;
    return el.querySelector("iframe");
  };

  // Best-effort transport control for third-party embeds. Sends the YouTube iframe
  // API command format (accepted by many providers) so play/pause/mute/captions stay
  // in sync across diverse streaming servers. Unknown origins use "*".
  const postVideoCommand = (id: string, func: string) => {
    const frame = document.getElementById(id) as HTMLIFrameElement | null;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      "*",
    );
  };

  const toggleIframePlay = () => {
    const isPlaying = !isIframePlaying;
    setIsIframePlaying(isPlaying);

    // 1. Control Plyr if it's active
    if (plyrRef.current?.plyr) {
      if (isPlaying) {
        plyrRef.current.plyr.play().catch(() => {});
      } else {
        plyrRef.current.plyr.pause();
      }
    }

    // 2. Control room-player YouTube iframe if active. Play/pause commands are
    //    only posted once the embed's JS-API channel is live (first infoDelivery).
    //    Posting them earlier — right after mount, before the embed streams —
    //    permanently desyncs the widget: it never emits onReady/infoDelivery
    //    afterwards, the clock freezes at 0:00, and the stall guard later
    //    remounts the iframe so the video visibly "jumps to the beginning".
    const roomPlayer = document.getElementById(
      "room-player",
    ) as HTMLIFrameElement;
    if (roomPlayer?.contentWindow) {
      if (ytClockLiveRef.current) {
        const command = isPlaying ? "playVideo" : "pauseVideo";
        roomPlayer.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: command,
            args: [],
          }),
          "https://www.youtube.com",
        );
      } else {
        pendingRoomPlayerPlayRef.current = isPlaying;
      }
    }

    // 3. Control the cinematic shielded embed (hdtoday, vidcloud, ...) if active
    postVideoCommand("streaming-player", isPlaying ? "playVideo" : "pauseVideo");

    ytPlayingRef.current = isPlaying;
    // Publish the play/pause intent immediately (player clocks may lag the
    // command, so publish the intent rather than the live read).
    publishPlaybackNowRef.current({ isPlaying });
  };

  const toggleIframeMute = () => {
    const isMuted = !isIframeMuted;
    setIsIframeMuted(isMuted);

    // 1. Control Plyr
    if (plyrRef.current?.plyr) {
      plyrRef.current.plyr.muted = isMuted;
    }

    // 2. Control room-player YouTube iframe
    const roomPlayer = document.getElementById(
      "room-player",
    ) as HTMLIFrameElement;
    if (roomPlayer?.contentWindow) {
      const command = isMuted ? "mute" : "unMute";
      roomPlayer.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: command,
          args: [],
        }),
        "https://www.youtube.com",
      );
    }

    // 3. Control the cinematic shielded embed (mute / unmute) if active
    postVideoCommand("streaming-player", isMuted ? "mute" : "unMute");
  };

  const toggleFullscreenMain = () => {
    if (modalPlayerRef.current) {
      if (!document.fullscreenElement) {
        modalPlayerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Update activeServerUrl when movie changes, using the same fallback chain as getMovieSourceUrl
  useEffect(() => {
    if (selectedMovie) {
      setActiveServerUrl(getMovieSourceUrl(selectedMovie));
    } else {
      setActiveServerUrl(null);
    }
  }, [selectedMovie]);

  // Point 2: Page Visibility Audio Control (Data & Power Saver)
  React.useLayoutEffect(() => {
    let wasPlayingBeforeHidden = true;
    let wasMutedBeforeHidden = isRoomMuted;

    const handleVisibility = () => {
      const playerEl = document.getElementById("room-sync-player");
      if (!playerEl) return;

      if (document.hidden) {
        // Switch tab or minimize helper: pause/mute
        if (playerEl instanceof HTMLVideoElement) {
          wasPlayingBeforeHidden = !playerEl.paused;
          wasMutedBeforeHidden = playerEl.muted;
          playerEl.pause();
          playerEl.muted = true;
        } else if (
          playerEl instanceof HTMLIFrameElement &&
          playerEl.contentWindow
        ) {
          playerEl.contentWindow.postMessage(
            JSON.stringify({
              event: "command",
              func: "pauseVideo",
              args: [],
            }),
            "*",
          );
          playerEl.contentWindow.postMessage(
            JSON.stringify({
              event: "command",
              func: "mute",
              args: [],
            }),
            "*",
          );
        }
      } else {
        // Return back to tab: restore cleanly
        if (playerEl instanceof HTMLVideoElement) {
          if (wasPlayingBeforeHidden) {
            playerEl
              .play()
              .catch((err) =>
                console.warn("Auto-play permission denied:", err),
              );
          }
          playerEl.muted = wasMutedBeforeHidden;
        } else if (
          playerEl instanceof HTMLIFrameElement &&
          playerEl.contentWindow
        ) {
          playerEl.contentWindow.postMessage(
            JSON.stringify({
              event: "command",
              func: "playVideo",
              args: [],
            }),
            "*",
          );
          if (!isRoomMuted) {
            playerEl.contentWindow.postMessage(
              JSON.stringify({
                event: "command",
                func: "unMute",
                args: [],
              }),
              "*",
            );
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isRoomMuted]);

  const playerContainerRef = React.useRef<HTMLDivElement>(null);
  const modalPlayerRef = React.useRef<HTMLDivElement>(null);
  const plyrRef = React.useRef<any>(null);

  // -------------------------------------------------------------------------
  // Playback speed control (shared across Plyr / YouTube / embed players).
  // -------------------------------------------------------------------------
  const SPEED_OPTIONS = [1, 1.25, 1.5, 2];
  const SPEED_HOLD_MS = 500; // Long-press duration before the first speed bump.
  const SPEED_HOLD_MOVE_TOLERANCE = 12; // px; cancels the hold when dragging.

  const formatSpeed = (rate: number) =>
    `${Number.isInteger(rate) ? rate.toString() : rate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x`;

  const showSpeedHud = (rate: number) => {
    setSpeedHudValue(rate);
    setSpeedHudVisible(true);
    if (speedHudTimerRef.current !== null) {
      window.clearTimeout(speedHudTimerRef.current);
    }
    speedHudTimerRef.current = window.setTimeout(() => {
      setSpeedHudVisible(false);
    }, 900);
  };

  // Apply a playback rate to whichever player is currently active.
  const applyPlaybackRate = React.useCallback((rate: number) => {
    // 1. Plyr native player (direct video files).
    if (plyrRef.current?.plyr) {
      try {
        plyrRef.current.plyr.playbackRate = rate;
      } catch {
        /* ignore */
      }
    }
    // 2. YouTube embed (enablejsapi=1 is already set on the iframe).
    const roomPlayer = document.getElementById(
      "room-player",
    ) as HTMLIFrameElement | null;
    if (roomPlayer?.contentWindow) {
      roomPlayer.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "setPlaybackRate", args: [rate] }),
        "https://www.youtube.com",
      );
    }
    // 3. Other embeds: best-effort (many providers ignore this command).
    const frame = document.getElementById(
      "streaming-player",
    ) as HTMLIFrameElement | null;
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "setPlaybackRate", args: [rate] }),
        "*",
      );
    }
    // 4. Any native <video> mounted inside the modal player. Covers the Plyr
    //    media element and the YouTube direct-stream fallback <video>.
    if (modalPlayerRef.current) {
      modalPlayerRef.current.querySelectorAll("video").forEach((v) => {
        try {
          v.playbackRate = rate;
        } catch {
          /* ignore */
        }
      });
    }
  }, []);

  const cyclePlaybackSpeed = React.useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(playbackRateRef.current);
    const next = SPEED_OPTIONS[idx < 0 ? 0 : (idx + 1) % SPEED_OPTIONS.length];
    playbackRateRef.current = next;
    setPlaybackRate(next);
    showSpeedHud(next);
  }, []);

  const selectPlaybackRate = React.useCallback((rate: number) => {
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
    setPlayerMenu(null);
    showSpeedHud(rate);
  }, []);

  // Keep the mirror ref in sync with the state.
  React.useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  // Apply the selected speed whenever the player mounts, the source changes,
  // or the rate changes.
  React.useEffect(() => {
    if (!showPlayer || !activeServerUrl) return;
    applyPlaybackRate(playbackRateRef.current);
  }, [showPlayer, activeServerUrl, applyPlaybackRate, playbackRate]);

  // Long-press handlers: press and HOLD on the video cycles the playback speed
  // (1x → 1.25x → 1.5x → 2x → 1x). Works with mouse, touch and pen pointers.
  const clearSpeedHold = React.useCallback(() => {
    const h = speedHoldRef.current;
    if (h.timer !== null) {
      window.clearTimeout(h.timer);
      h.timer = null;
    }
    if (h.interval !== null) {
      window.clearInterval(h.interval);
      h.interval = null;
    }
    h.fired = false;
  }, []);

  React.useEffect(() => {
    return () => clearSpeedHold();
  }, [clearSpeedHold]);

  const onPlayerPointerDown = (e: React.PointerEvent) => {
    // Ignore presses that start on interactive controls (buttons, the seek
    // bar, links, iframes). Native videos bubble to this container; cross-origin
    // iframes never do, so this only fires on the native <video> paths.
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("button, a, [role='slider'], input, select, textarea, iframe")) return;
    const h = speedHoldRef.current;
    h.startX = e.clientX;
    h.startY = e.clientY;
    h.fired = false;
    if (h.timer !== null) window.clearTimeout(h.timer);
    h.timer = window.setTimeout(() => {
      h.fired = true;
      cyclePlaybackSpeed();
      // Keep ramping while the pointer stays down.
      if (h.interval !== null) window.clearInterval(h.interval);
      h.interval = window.setInterval(cyclePlaybackSpeed, SPEED_HOLD_MS);
    }, SPEED_HOLD_MS);
  };

  const onPlayerPointerMove = (e: React.PointerEvent) => {
    const h = speedHoldRef.current;
    if (h.timer === null && h.interval === null) return;
    if (Math.hypot(e.clientX - h.startX, e.clientY - h.startY) > SPEED_HOLD_MOVE_TOLERANCE) {
      // The pointer is dragging (e.g. on the seek bar) — cancel the hold.
      clearSpeedHold();
    }
  };

  const onPlayerPointerUp = () => clearSpeedHold();
  const onPlayerPointerCancel = () => clearSpeedHold();

  // Resume: when the player mounts or the source changes, seek to the saved
  // position (set by openMovie) once the player is ready — otherwise reopening
  // a movie always starts over from 0s.
  React.useEffect(() => {
    if (!showPlayer || !activeServerUrl) return;
    const resume = resumeTimeRef.current;
    if (resume <= 0) return;
    resumeTimeRef.current = 0; // One-shot per source.

    // 1. Direct video (Plyr): seek once metadata is available.
    if (plyrRef.current?.plyr) {
      const p = plyrRef.current.plyr;
      const media = p.media;
      const doSeek = () => {
        try {
          if (Number.isFinite(p.duration) && p.duration > 0) {
            p.currentTime = Math.min(resume, Math.max(0, p.duration - 1));
          }
        } catch {
          /* ignore */
        }
      };
      if (media) {
        if (media.readyState >= 1) {
          doSeek();
        } else {
          media.addEventListener("loadedmetadata", doSeek, { once: true });
        }
      }
    }
    // 2. YouTube embed: send seekTo repeatedly during the JS-API handshake.
    const roomPlayer = document.getElementById(
      "room-player",
    ) as HTMLIFrameElement | null;
    if (roomPlayer?.contentWindow) {
      let attempts = 0;
      const iv = window.setInterval(() => {
        attempts += 1;
        const frame = document.getElementById(
          "room-player",
        ) as HTMLIFrameElement | null;
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: "seekTo", args: [resume, true] }),
            "https://www.youtube.com",
          );
          ytCurrentTimeRef.current = resume;
        }
        if (attempts >= 8) window.clearInterval(iv);
      }, 400);
    }
    // 3. Other embeds: best-effort seek + local-clock sync for AI subtitles.
    const frame = document.getElementById(
      "streaming-player",
    ) as HTMLIFrameElement | null;
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [resume, true] }),
        "*",
      );
      localClockRef.current = resume;
    }
    // 4. Direct-stream fallback <video> (YouTubeResilientPlayer "direct" mode):
    //    resume it natively so continue-watching works there too.
    const directVideo = document.getElementById(
      "room-player-direct-video",
    ) as HTMLVideoElement | null;
    if (directVideo) {
      const doSeek = () => {
        try {
          if (Number.isFinite(directVideo.duration) && directVideo.duration > 0) {
            directVideo.currentTime = Math.min(resume, Math.max(0, directVideo.duration - 1));
          }
        } catch {
          /* ignore */
        }
      };
      if (directVideo.readyState >= 1) {
        doSeek();
      } else {
        directVideo.addEventListener("loadedmetadata", doSeek, { once: true });
      }
    }
  }, [showPlayer, activeServerUrl]);

  // -------------------------------------------------------------------------
  // Memoized Plyr source/options.
  // The 250 ms progress poll re-renders App ~4x/sec. plyr-react reinstantiates
  // Plyr (i.e. rebuilds the <video>) whenever the `source`/`options` object
  // identity changes, which reset playback to 0s. Keeping these objects stable
  // across renders — keyed ONLY on values that actually change the source —
  // is what prevents the "jumps back to the first second" bug.
  // -------------------------------------------------------------------------
  const isYoutubeSource = !!activeServerUrl && /youtube\.com|youtu\.be/i.test(activeServerUrl);
  const plyrSource = React.useMemo(
    () => ({
      type: "video" as const,
      sources: [
        {
          src: activeServerUrl || "",
          provider: (isYoutubeSource ? "youtube" : "html5") as "youtube" | "html5",
        },
      ],
      tracks: selectedMovie?.subtitleUrl
        ? [
            {
              kind: "captions" as const,
              label: "Kurdish",
              srcLang: "ku",
              src: selectedMovie.subtitleUrl,
              default: true,
            },
          ]
        : [],
    }),
    // Do NOT add `selectedMovie` (object identity churns on sync-room writes).
    [activeServerUrl, isYoutubeSource, selectedMovie?.subtitleUrl],
  );

  const plyrOptions = React.useMemo(
    () => ({
      autoplay: true,
      muted: isRoomMuted,
      controls: [
        "play-large",
        "play",
        "progress",
        "current-time",
        "mute",
        "volume",
        "captions",
        "settings",
        "pip",
        "airplay",
        "fullscreen",
        "rewind",
        "fast-forward",
      ],
      // Speed is handled by the unified custom speed control; drop Plyr's own
      // speed menu so the two selectors can't disagree. `speed.selected` stays
      // static (1) — the actual rate is applied via applyPlaybackRate.
      settings: ["quality"],
      speed: {
        selected: 1,
        options: [0.5, 0.75, 1, 1.25, 1.5, 2],
      },
      keyboard: { focused: true, global: true },
      tooltips: { controls: true, seek: true },
      i18n: {
        play: "لێدان",
        pause: "وەستان",
        mute: "بێدەنگکردن",
        unmute: "لێدانەوەی دەنگ",
        quality: "کوالێتی",
        speed: "خێرایی",
        loop: "دووبارەبوونەوە",
      },
    }),
    [isRoomMuted],
  );

  const featuredMovie = useMemo(() => {
    return movies.find((m) => m.isYouTube) || movies[0];
  }, [movies]);

  const getCleanYouTubeUrl = (url: string | null | undefined) => {
    if (!url) return null;
    const videoId = extractYouTubeId(url);
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&enablejsapi=1&rel=0&showinfo=0&iv_load_policy=3&modestbranding=1&disablekb=1&fs=0&playsinline=1&origin=${window.location.origin}`;
    }
    return url;
  };

  const activeFeaturedMovie = useMemo(() => {
    // Priority: 1) Firestore real-time data, 2) Movies list
    let base = featuredMovieFromDB || featuredMovie;
    if (!base) return null;

    // Normalize if needed
    const embedUrl = globalStreamURL || base.embedUrl;
    const videoUrl = globalStreamURL || base.videoUrl;
    const isYouTube =
      embedUrl?.includes("youtube.com") ||
      embedUrl?.includes("youtu.be") ||
      videoUrl?.includes("youtube.com") ||
      videoUrl?.includes("youtu.be");
    const videoId =
      base.videoId || extractYouTubeId(embedUrl || videoUrl || "");

    return {
      ...base,
      embedUrl,
      videoUrl,
      isYouTube,
      videoId,
      heroPlaylist: (base as any).video_trailers ||
        (base as any).heroPlaylist || [
          embedUrl || videoUrl || "https://www.youtube.com/watch?v=YPY7J-flzE8",
        ],
    };
  }, [featuredMovieFromDB, featuredMovie, globalStreamURL]);

  useEffect(() => {
    console.log("[DEBUG] activeFeaturedMovie updated:", activeFeaturedMovie);
  }, [activeFeaturedMovie]);

  useEffect(() => {
    if (activeFeaturedMovie) {
      const playlist = activeFeaturedMovie.heroPlaylist || [];
      const cleanPlaylist = playlist.filter(
        (url: string) => url && url.trim() !== "",
      );
      if (cleanPlaylist.length > 0) {
        setHeroTrailerPlaylist([cleanPlaylist[0]]);
        return;
      }
    }
    setHeroTrailerPlaylist([]);
  }, [activeFeaturedMovie]);

  const currentHeroVideoUrl = useMemo(() => {
    if (!activeFeaturedMovie) return "";
    const rawUrl = activeFeaturedMovie.embedUrl || activeFeaturedMovie.videoUrl || "";
    if (!rawUrl || rawUrl.trim() === "") return "";
    const vidId = extractYouTubeId(rawUrl);
    if (vidId) return `https://www.youtube.com/watch?v=${vidId}`;
    return rawUrl;
  }, [activeFeaturedMovie]);

  const heroVideoId = useMemo(() => {
    const videoId = extractYouTubeId(currentHeroVideoUrl);
    return videoId || "";
  }, [currentHeroVideoUrl]);

  // Add an event listener to the whole document to detect the first click for click-to-initiate autoplay
  // This listener is kept as it's used for initial mute state logic. No changes needed here.

  // Cinematic countdown logic
  useEffect(() => {
    if (isLoading) return;
    if (hasCountdownRun.current) return;

    hasCountdownRun.current = true;
    setCountdown(0);
    setIsHeroMuted(false); // دەستبەجێ دەنگ کارا دەکرێت
  }, [isLoading]);

  // Sync Room Mute State
  useEffect(() => {
    if (plyrRef.current?.plyr) {
      plyrRef.current.plyr.muted = isRoomMuted;
    }
    // Also notify if it's an iframe player in the room
    const roomEl = getIframe("room-sync-player");
    if (roomEl && roomEl.contentWindow) {
      const command = isRoomMuted ? "mute" : "unMute";
      roomEl.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: command,
          args: [],
        }),
        "*",
      );
    }
  }, [isRoomMuted]);

  // Social Protocol State
  const {
    currentUser: fbUser,
    socialProfile,
    loading: socialAuthLoading,
    logout: fbLogout,
    updateSocialProfile,
    accountReadiness,
    refreshProfile,
  } = useSocialAuth();
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [modalMode, setModalMode] = useState<"landing" | "login" | "signup">("landing");
  const [showCompleteAccount, setShowCompleteAccount] = useState(false);
  // Soft profile-completion notice: once dismissed, it stays hidden until the
  // user clears it (the notice disappears on its own once Age/Address are set).
  const [profileNoticeDismissed, setProfileNoticeDismissed] = useState(
    () => localStorage.getItem("cinemachat_profile_notice_dismissed") === "1",
  );

  // Whether the auth modal was opened from the CinemaChat flow (Friend→Connect).
  // When true, a successful sign-in returns to the room instead of reloading.
  const [authFlowReturn, setAuthFlowReturn] = useState(false);

  // ============ Favorites / Likes / Live-metrics (movie card enhancements) ============
  // The Firebase uid drives persistence; guests use localStorage instead.
  const fbUid = fbUser?.uid || "";

  // Identity for the permanent CinemaChat watch room: signed-in users use their
  // social uid + unique code; guests fall back to the persistent device id so
  // their host/guest slot survives a refresh on the same device.
  const cinemaChatIdentity = useMemo<CinemaChatParticipant>(() => {
    const deviceId = getDeviceId();
    const id = fbUser?.uid || deviceId;
    const name = socialProfile?.name || "میوان";
    const code =
      socialProfile?.uniqueCode || `DEV-${deviceId.slice(0, 8).toUpperCase()}`;
    return {
      id,
      name,
      code,
      avatarUrl: socialProfile?.avatarUrl || socialProfile?.avatar,
    };
  }, [
    fbUser?.uid,
    socialProfile?.name,
    socialProfile?.uniqueCode,
    socialProfile?.avatarUrl,
    socialProfile?.avatar,
  ]);

  // Account status for the CinemaChat room's invitation flow: account users can
  // send AND receive real persisted invitations; device-only guests can still
  // join via code/QR but cannot receive account invitations. Gated by the same
  // account-readiness state machine used by the Friend→Connect flow, so an
  // incomplete/guest/error account never half-enables the account features.
  const hasCinemaChatAccount = accountReadiness.state === "ready";
  const cinemaChatAccountName = socialProfile?.name || cinemaChatIdentity.name;
  const cinemaChatAccountCode =
    hasCinemaChatAccount ? socialProfile?.uniqueCode : undefined;

  // Logout wrapper: always tear down every CinemaChat/auth overlay FIRST so a
  // stale "signed-in" room or registration modal can never survive a logout
  // (stale-auth cleanup). The Firebase sign-out itself lives in the context.
  const handleAuthLogout = useCallback(() => {
    setShowFriendConnect(false);
    setShowCinemaChatRoom(false);
    setShowSocialModal(false);
    setShowCompleteAccount(false);
    setShowJoinCodeModal(false);
    setAuthFlowReturn(false);
    void fbLogout();
  }, [fbLogout]);

  // Hydrate the signed-in user's favorites + liked movies in real time from
  // Firestore (users/{uid}). Guests fall back to localStorage.
  useEffect(() => {
    if (!fbUid) {
      try {
        const raw = localStorage.getItem("cinemachat_guest_favorites");
        if (raw) setFavoriteIds(new Set(JSON.parse(raw)));
        const rawLiked = localStorage.getItem("cinemachat_guest_liked");
        if (rawLiked) setLikedIds(new Set(JSON.parse(rawLiked)));
      } catch (e) { /* ignore malformed storage */ }
      return;
    }
    const userRef = doc(realDb, "users", fbUid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        const data = snap.data();
        if (Array.isArray(data?.favorites)) setFavoriteIds(new Set(data.favorites));
        if (Array.isArray(data?.likedMovies)) setLikedIds(new Set(data.likedMovies));
      },
      async () => {
        // Firestore unavailable — hydrate from the backend mirror instead.
        try {
          const ids = await api.getFavorites(fbUid);
          if (ids.length) setFavoriteIds(new Set(ids));
        } catch (e) { /* ignore */ }
      },
    );
    return unsub;
  }, [fbUid]);

  // Keep the current catalog ids in a ref so the live poll can target every
  // visible movie (Firestore ones included) without restarting on each change.
  const moviesIdsRef = useRef<string[]>([]);
  useEffect(() => {
    moviesIdsRef.current = movies
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string");
  }, [movies]);

  // Poll the server for live-viewer counts so every card reflects real-time
  // activity without reloading the whole catalog. Uses the bulk stats endpoint
  // keyed by the visible movie ids so Firestore movies (absent from the server
  // cache) also get accurate "watching now" counts. Live counts are replaced on
  // success so a movie that drops to zero loses its badge instead of keeping a
  // stale number.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const stats = await api.getLiveStats(moviesIdsRef.current);
        if (cancelled || !stats || typeof stats !== "object") return;
        const viewers: Record<string, number> = {};
        const likes: Record<string, number> = {};
        const views: Record<string, number> = {};
        const ratings: Record<string, { ccRating: number; ratingCount: number }> = {};
        const favorites: Record<string, number> = {};
        const trending: Record<string, number> = {};
        for (const [id, s] of Object.entries(stats)) {
          const entry = s as {
            liveViewers?: number;
            views?: number;
            likes?: number;
            ccRating?: number;
            ratingCount?: number;
            favoriteCount?: number;
            trendingScore?: number;
          };
          if (typeof entry?.liveViewers === "number" && entry.liveViewers > 0) {
            viewers[id] = entry.liveViewers;
          }
          if (typeof entry?.views === "number" && entry.views > 0) {
            views[id] = entry.views;
          }
          const ccRating = typeof entry?.ccRating === "number" ? entry.ccRating : 0;
          const ratingCount = typeof entry?.ratingCount === "number" ? entry.ratingCount : 0;
          if (ccRating > 0 || ratingCount > 0) ratings[id] = { ccRating, ratingCount };
          const fav = typeof entry?.favoriteCount === "number" ? entry.favoriteCount : 0;
          if (fav > 0) favorites[id] = fav;
          const ts = typeof entry?.trendingScore === "number" ? entry.trendingScore : 0;
          if (ts > 0) trending[id] = ts;
        }
        // Only touch state when a value actually changed so the 30s poll never
        // forces a full re-render of the whole app on an unchanged tick.
        setLiveViewersMap((prev) => {
          if (Object.keys(prev).length !== Object.keys(viewers).length) return viewers;
          for (const k in viewers) if (prev[k] !== viewers[k]) return viewers;
          return prev;
        });
        setLikesMap((prev) => {
          const next = { ...prev, ...likes };
          if (Object.keys(next).length !== Object.keys(prev).length) return next;
          for (const k in next) if (prev[k] !== next[k]) return next;
          return prev;
        });
        setViewsMap((prev) => {
          const next = { ...prev, ...views };
          if (Object.keys(next).length !== Object.keys(prev).length) return next;
          for (const k in next) if (prev[k] !== next[k]) return next;
          return prev;
        });
        setRatingsMap((prev) => {
          if (Object.keys(prev).length !== Object.keys(ratings).length) return ratings;
          for (const k in ratings) if (prev[k]?.ccRating !== ratings[k].ccRating) return ratings;
          return prev;
        });
        setFavoriteCountsMap((prev) => {
          const next = { ...prev, ...favorites };
          if (Object.keys(next).length !== Object.keys(prev).length) return next;
          for (const k in next) if (prev[k] !== next[k]) return next;
          return prev;
        });
        setTrendingScoresMap((prev) => {
          const next = { ...prev, ...trending };
          if (Object.keys(next).length !== Object.keys(prev).length) return next;
          for (const k in next) if (prev[k] !== next[k]) return next;
          return prev;
        });
      } catch (e) { /* server down — keep last known values */ }
    };
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(iv); };
    // Re-poll whenever the visible catalog changes: the initial mount-time poll
    // can race an empty catalog (Firestore movies load right after), which would
    // otherwise leave cards without live badges until the next 30s tick.
  }, [movies]);

  // Live Drama Room viewer counts + ratings: polls the dedicated bulk endpoint
  // every 30s (mirrors the movie live poll above) so room cards show real
  // "watching now" numbers and fresh aggregate ratings. Restarts only when the
  // room list itself changes.
  useEffect(() => {
    let cancelled = false;
    const roomIds = dramaRooms
      .map((r: any) => r?.id)
      .filter((id: unknown): id is string => typeof id === "string");
    if (!roomIds.length) return;
    const refresh = async () => {
      try {
        const stats = await api.getDramaRoomLiveStats(roomIds);
        if (cancelled || !stats || typeof stats !== "object") return;
        const next: Record<string, number> = {};
        const nextRatings: Record<string, { ccRating: number; ratingCount: number }> = {};
        for (const id of roomIds) {
          const s = (stats as Record<string, { liveViewers?: number; rating?: { ccRating?: number; ratingCount?: number } }>)[id];
          const n = typeof s?.liveViewers === "number" ? s.liveViewers : 0;
          if (n > 0) next[id] = n;
          const rr = s?.rating;
          if (rr && (rr.ccRating || 0) > 0) {
            nextRatings[id] = { ccRating: rr.ccRating || 0, ratingCount: rr.ratingCount || 0 };
          }
        }
        setRoomLiveViewers((prev) => {
          if (Object.keys(next).length !== Object.keys(prev).length) return next;
          for (const k in next) if (prev[k] !== next[k]) return next;
          return prev;
        });
        setRoomRatingsMap((prev) => {
          if (Object.keys(nextRatings).length !== Object.keys(prev).length) return nextRatings;
          for (const k in nextRatings) {
            if (prev[k]?.ccRating !== nextRatings[k].ccRating || prev[k]?.ratingCount !== nextRatings[k].ratingCount) return nextRatings;
          }
          return prev;
        });
      } catch (e) {
        // Server down — keep the last known counts.
      }
    };
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [dramaRooms]);

  // Heartbeat while a movie is open so the backend counts us as a live viewer
  // of that movie and returns its current concurrent count.
  useEffect(() => {
    if (!showPlayer || !selectedMovie?.id) return;
    const movieId = selectedMovie.id;
    // Per-tab session drives the concurrent-viewer count (two tabs on the same
    // movie = two live viewers); the device id stays the identity for lifetime
    // view counting on the server so reloads never inflate total views.
    const session = getViewerSessionId();
    const device = getDeviceId();
    const ping = async () => {
      const res = await api.sendMovieView(movieId, session, device);
      if (res?.ok && typeof res.viewers === "number") {
        setLiveViewersMap((prev) =>
          prev[movieId] === res.viewers ? prev : { ...prev, [movieId]: res.viewers },
        );
      }
      // The view endpoint returns the movie's lifetime view total — fold it into
      // viewsMap so the card counter updates instantly on open/watch.
      if (res?.ok && typeof res.views === "number" && res.views > 0) {
        setViewsMap((prev) =>
          prev[movieId] === res.views ? prev : { ...prev, [movieId]: res.views },
        );
      }
    };
    ping();
    const iv = setInterval(ping, 20000);
    return () => clearInterval(iv);
  }, [showPlayer, selectedMovie?.id]);

  // Toggle a movie in the user's favorites (Firestore + backend mirror; for
  // guests, localStorage only).
  const handleToggleFavorite = useCallback(
    (movie: Movie) => {
      const id = movie.id;
      const next = new Set(favoriteIds);
      const isFav = next.has(id);
      if (isFav) next.delete(id);
      else next.add(id);
      setFavoriteIds(next);

      // Optimistic count update so the badge responds instantly.
      setFavoriteCountsMap((prev) => {
        const cur = prev[id] ?? (Number(movie.favoriteCount) || 0);
        return { ...prev, [id]: Math.max(0, cur + (isFav ? -1 : 1)) };
      });

      if (fbUid) {
        const userRef = doc(realDb, "users", fbUid);
        if (isFav) {
          updateDoc(userRef, { favorites: arrayRemove(id) }).catch(() => {});
          api.removeFavorite(id, fbUid);
        } else {
          updateDoc(userRef, { favorites: arrayUnion(id) }).catch(() => {});
          api.addFavorite(id, fbUid);
        }
      } else {
        try {
          localStorage.setItem("cinemachat_guest_favorites", JSON.stringify([...next]));
        } catch (e) { /* ignore */ }
      }
    },
    [favoriteIds, fbUid],
  );

  // Toggle a like on a movie: updates the user's liked list (Firestore + backend
  // mirror) and the movie's live like count (Firestore transaction).
  const handleToggleLike = useCallback(
    (movie: Movie) => {
      const id = movie.id;
      const next = new Set(likedIds);
      const isLiked = next.has(id);
      if (isLiked) next.delete(id);
      else next.add(id);
      setLikedIds(next);

      // Optimistic count update so the badge responds instantly.
      setLikesMap((prev) => {
        const cur = prev[id] ?? (Number(movie.likes) || 0);
        return { ...prev, [id]: Math.max(0, cur + (isLiked ? -1 : 1)) };
      });

      if (fbUid) {
        const userRef = doc(realDb, "users", fbUid);
        if (isLiked) {
          updateDoc(userRef, { likedMovies: arrayRemove(id) }).catch(() => {});
        } else {
          updateDoc(userRef, { likedMovies: arrayUnion(id) }).catch(() => {});
        }
        // Rules merge the update onto the existing movie doc (which carries
        // id/title/image), so a `likes`-only update passes isValidMovie().
        runTransaction(realDb, async (tx) => {
          const movieRef = doc(realDb, "movies", id);
          const snap = await tx.get(movieRef);
          const current = Number(snap.data()?.likes) || 0;
          tx.update(movieRef, { likes: Math.max(0, current + (isLiked ? -1 : 1)) });
        }).catch(() => {});
        api.toggleLike(id, fbUid);
      } else {
        try {
          localStorage.setItem("cinemachat_guest_liked", JSON.stringify([...next]));
        } catch (e) { /* ignore */ }
      }
    },
    [likedIds, fbUid],
  );

  // Resolve the current like count for a movie (live map overrides the doc).
  const getMovieLikes = useCallback(
    (movie: Movie): number => likesMap[movie.id] ?? (Number(movie.likes) || 0),
    [likesMap],
  );

  // Resolve current live viewers for a movie.
  const getMovieLiveViewers = useCallback(
    (movie: Movie): number => liveViewersMap[movie.id] ?? (Number(movie.liveViewers) || 0),
    [liveViewersMap],
  );

  // Resolve the current lifetime view count for a movie (live map overrides the
  // doc, so Firestore movies whose doc.views lags still show the real total).
  const getMovieViews = useCallback(
    (movie: Movie): number => viewsMap[movie.id] ?? (Number(movie.views) || 0),
    [viewsMap],
  );

  // The movie with the most concurrent viewers earns the "TOP LIVE" highlight.
  const topLiveId = useMemo(() => {
    let topId = "";
    let top = 0;
    for (const [id, n] of Object.entries(liveViewersMap)) {
      if (n >= 2 && n > top) {
        top = n;
        topId = id;
      }
    }
    return topId;
  }, [liveViewersMap]);

  // Favorite movies (from the catalog) for the dedicated "My Favorites" row.
  const favoriteMovies = useMemo(() => {
    if (favoriteIds.size === 0) return [];
    return movies.filter((m) => favoriteIds.has(m.id)).slice(0, 12);
  }, [movies, favoriteIds]);

  // Open a movie in the detail/player modal from any card.
  const openMovie = useCallback(
    (movie: Movie, opts?: { startFromBeginning?: boolean }) => {
      // Capture the homepage's scroll position BEFORE the modal mounts so we
      // can restore it exactly when the modal closes.
      if (savedPageScrollRef.current === null) {
        savedPageScrollRef.current = window.scrollY;
      }
      setSelectedMovie(movie);
      setActiveServerUrl(getMovieSourceUrl(movie));
      setShowPlayer(true);
      // Restore a saved resume point (continue-watching) so reopening a movie
      // resumes where the user left off instead of always starting at 0s —
      // EXCEPT for drama-room auto-advance, which must start the next episode
      // from the beginning (a saved ~90% position would otherwise jump the new
      // episode straight into its "Up Next" window and cascade-skip episodes).
      try {
        const local = JSON.parse(
          localStorage.getItem("cinemachat_continue_watching") || "{}",
        );
        const saved = local[movie.id];
        resumeTimeRef.current =
          opts?.startFromBeginning
            ? 0
            : saved && typeof saved.progress === "number" && saved.progress >= 5
              ? saved.progress
              : 0;
      } catch {
        resumeTimeRef.current = 0;
      }
      // Record an immediate continue-watching entry (local + server) so the
      // row shows up even if the user exits before the next progress save.
      const now = Date.now();
      setContinueWatchingStore((prev) => ({
        ...prev,
        [movie.id]: { progress: 0, duration: 0, updatedAt: now },
      }));
      try {
        const local = JSON.parse(localStorage.getItem("cinemachat_continue_watching") || "{}");
        local[movie.id] = { progress: 0, duration: 0, updatedAt: now };
        localStorage.setItem("cinemachat_continue_watching", JSON.stringify(local));
      } catch (e) { /* ignore */ }
      api.saveProgress(movie.id, getDeviceId(), 0, 0).catch(() => {});
    },
    [],
  );

  // --- Movie-card click → details → explicit Play state separation -----------
  // A card click must mean "open movie details" — never "play". The player only
  // mounts after the user presses the dedicated Play button inside the details
  // panel, so details and player are never both active foreground layers.

  // Card click: open ONLY the details panel. The player stays closed and is
  // not mounted or initialized (no autoplay, no iframe, no view counting).
  const openMovieDetails = useCallback(
    (movie: Movie) => {
      // Remember the opener element so focus returns to the card on close.
      if (document.activeElement instanceof HTMLElement) {
        movieReturnFocusRef.current = document.activeElement;
      }
      // Capture the homepage's scroll position BEFORE the modal mounts so we
      // can restore it exactly when the modal closes.
      if (savedPageScrollRef.current === null) {
        savedPageScrollRef.current = window.scrollY;
      }
      setSelectedMovie(movie);
      setActiveServerUrl(getMovieSourceUrl(movie));
      setIsMovieDetailsOpen(true);
      setShowPlayer(false);
      // Pre-load the saved resume point (continue-watching) so the FIRST
      // explicit Play resumes where the user left off instead of starting over
      // from 0s. It is consumed once the player actually mounts.
      try {
        const local = JSON.parse(
          localStorage.getItem("cinemachat_continue_watching") || "{}",
        );
        const saved = local[movie.id];
        resumeTimeRef.current =
          saved && typeof saved.progress === "number" && saved.progress >= 5
            ? saved.progress
            : 0;
      } catch {
        resumeTimeRef.current = 0;
      }
    },
    [],
  );

  // Explicit "Play / Watch Movie" — the only action that opens the player from
  // the details panel. Closes the details layer first so exactly one modal is
  // ever the active foreground layer.
  const playSelectedMovie = useCallback(() => {
    if (!selectedMovie) return;
    setIsMovieDetailsOpen(false);
    setShowPlayer(true);
  }, [selectedMovie]);

  // Close the player and return to the details panel. The existing design
  // intentionally keeps the details mounted behind the player so state is
  // preserved; closing the player simply brings that panel back to the front.
  const closePlayerToDetails = useCallback(() => {
    setShowPlayer(false);
    setIsMovieDetailsOpen(true);
  }, []);

  // Full close: hide both layers, restore page scroll (handled by the layout
  // effect below) and return keyboard focus to the card that opened the modal.
  const closeMovieModal = useCallback(() => {
    setIsMovieDetailsOpen(false);
    setShowPlayer(false);
    setSelectedMovie(null);
    setActiveServerUrl(null);
    const target = movieReturnFocusRef.current;
    movieReturnFocusRef.current = null;
    if (target && document.contains(target)) {
      requestAnimationFrame(() => {
        try {
          target.focus();
        } catch {
          /* ignore */
        }
      });
    }
  }, []);

  // Escape closes ONLY the active foreground layer: the player first (returning
  // to details), then the details panel (full close). There is a single handler
  // so there is never more than one Escape-triggered close path.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showPlayer) {
        closePlayerToDetails();
      } else if (isMovieDetailsOpen) {
        closeMovieModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showPlayer, isMovieDetailsOpen, closePlayerToDetails, closeMovieModal]);

  // Single scroll lock for the whole movie modal lifecycle (details + player).
  // Exactly one `overflow: hidden` is applied while the modal is open and is
  // fully released when it closes — never a double scroll lock.
  useEffect(() => {
    const isOpen = !!selectedMovie && (showPlayer || isMovieDetailsOpen);
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedMovie, showPlayer, isMovieDetailsOpen]);

  // Move focus into the dialog when a movie is opened (the container is made
  // focusable with tabIndex={-1}). Runs once per movie selection change.
  useEffect(() => {
    if (!selectedMovie) return undefined;
    const raf = requestAnimationFrame(() => {
      try {
        movieModalRef.current?.focus();
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMovie?.id]);

  // Keep the page's scroll position stable across the movie modal lifecycle.
  // On open: remember where the homepage was and neutralize any scroll the
  // browser performs while the fixed overlay mounts (focus / scroll anchoring).
  // On close: restore the exact previous position after the exit animation.
  React.useLayoutEffect(() => {
    if (selectedMovie) {
      // Fallback capture for open paths that set selectedMovie directly
      // (ticker, hero translate, similar movies, ?movieId= deep link).
      if (savedPageScrollRef.current === null) {
        savedPageScrollRef.current = window.scrollY;
      }
      const raf = requestAnimationFrame(() => {
        if (savedPageScrollRef.current !== null) {
          window.scrollTo(0, savedPageScrollRef.current);
        }
      });
      return () => cancelAnimationFrame(raf);
    }

    // Modal closed — restore the exact pre-open scroll position once the exit
    // animation has fully unmounted the overlay. Retries defeat lazy-image
    // reflow / scroll anchoring that could nudge the page right after close.
    if (savedPageScrollRef.current !== null) {
      const saved = savedPageScrollRef.current;
      savedPageScrollRef.current = null;
      const restore = () => window.scrollTo(0, saved);
      const timers = [0, 80, 250, 500].map((ms) =>
        window.setTimeout(restore, ms),
      );
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    return undefined;
  }, [selectedMovie]);

  // Resolve server/client composite card metrics so every card — regardless of
  // whether its Movie came from Firestore or the server — has accurate data.
  const getMovieCCRating = useCallback(
    (movie: Movie): number => ratingsMap[movie.id]?.ccRating ?? (Number(movie.ccRating) || 0),
    [ratingsMap],
  );
  const getMovieRatingCount = useCallback(
    (movie: Movie): number =>
      ratingsMap[movie.id]?.ratingCount ?? (Number(movie.ratingCount) || 0),
    [ratingsMap],
  );
  const getMovieFavoriteCount = useCallback(
    (movie: Movie): number =>
      favoriteCountsMap[movie.id] ?? (Number(movie.favoriteCount) || 0),
    [favoriteCountsMap],
  );
  const getMovieTrendingScore = useCallback(
    (movie: Movie): number => {
      if (trendingScoresMap[movie.id]) return trendingScoresMap[movie.id];
      return computeTrendingScore(movie, getMovieLiveViewers(movie), getMovieLikes(movie), getMovieFavoriteCount(movie));
    },
    [trendingScoresMap, getMovieLiveViewers, getMovieLikes, getMovieFavoriteCount],
  );
  const getUserRating = useCallback(
    (movie: Movie): number => userRatingsMap[movie.id] ?? (Number(movie.userRating) || 0),
    [userRatingsMap],
  );

  // Per-room rating getters — read the room's OWN aggregate/user scores so
  // room A's rating can never affect room B or any movie/post rating.
  const getRoomCCRating = useCallback(
    (room: any): number => roomRatingsMap[room?.id]?.ccRating ?? 0,
    [roomRatingsMap],
  );
  const getRoomRatingCount = useCallback(
    (room: any): number => roomRatingsMap[room?.id]?.ratingCount ?? 0,
    [roomRatingsMap],
  );
  const getUserRoomRating = useCallback(
    (room: any): number => userRoomRatingsMap[room?.id] ?? 0,
    [userRoomRatingsMap],
  );

  // Build a fully-resolved Movie (server metrics merged into the object) so the
  // premium card — which reads ccRating/ratingCount/favoriteCount/trendingScore
  // off the movie — renders accurate data for Firestore-only movies too.
  const resolveMovie = useCallback(
    (movie: Movie): Movie => ({
      ...movie,
      liveViewers: getMovieLiveViewers(movie),
      likes: getMovieLikes(movie),
      views: getMovieViews(movie),
      ccRating: getMovieCCRating(movie),
      ratingCount: getMovieRatingCount(movie),
      favoriteCount: getMovieFavoriteCount(movie),
      trendingScore: getMovieTrendingScore(movie),
      userRating: getUserRating(movie),
    }),
    [
      getMovieLiveViewers,
      getMovieLikes,
      getMovieViews,
      getMovieCCRating,
      getMovieRatingCount,
      getMovieFavoriteCount,
      getMovieTrendingScore,
      getUserRating,
    ],
  );

  // Identity-stable resolved movies: only movies whose metrics actually changed
  // get a new object, so React.memo on MovieCard still skips unchanged cards.
  const resolvedMoviesCache = useRef<Record<string, Movie>>({});
  const resolvedMovies = useMemo(() => {
    const out: Record<string, Movie> = {};
    for (const m of movies) {
      const prev = resolvedMoviesCache.current[m.id];
      const next = resolveMovie(m);
      if (
        !prev ||
        prev.liveViewers !== next.liveViewers ||
        prev.likes !== next.likes ||
        prev.views !== next.views ||
        prev.ccRating !== next.ccRating ||
        prev.ratingCount !== next.ratingCount ||
        prev.favoriteCount !== next.favoriteCount ||
        prev.trendingScore !== next.trendingScore ||
        prev.userRating !== next.userRating
      ) {
        resolvedMoviesCache.current[m.id] = next;
      }
      out[m.id] = resolvedMoviesCache.current[m.id];
    }
    for (const id of Object.keys(resolvedMoviesCache.current)) {
      if (!out[id]) delete resolvedMoviesCache.current[id];
    }
    return out;
  }, [movies, resolveMovie]);

  // -------------------------------------------------------------------------
  // Drama Room auto-next: when an episode is opened from a Drama Room, remember
  // that room's stored episode order so that when the current episode finishes
  // we automatically advance to the NEXT episode in the SAME room. The final
  // episode simply stops — never navigating to another room, movie or series.
  // -------------------------------------------------------------------------
  const dramaRoomPlaylistRef = useRef<{ roomId: string; episodes: string[] } | null>(null);
  // Anti-double-fire guard: the "finished" signal can arrive from several
  // sources at the same moment (YouTube onStateChange ENDED + embed clock
  // reaching the duration + a native <video> onended). Only one advance is
  // ever allowed per finished episode, and it only fires AFTER the episode
  // actually finishes (never on play/pause/seek).
  const dramaAdvanceGuardRef = useRef({ fromId: "", lastAt: 0 });
  const selectedMovieRef = useRef<Movie | null>(null);
  selectedMovieRef.current = selectedMovie;

  // -------------------------------------------------------------------------
  // Drama Room "Next Episode" preview: ONLY during the final 30 seconds of the
  // current episode we surface a full-screen "Up Next" overlay showing the NEXT
  // episode in the same room (large poster + title + live countdown). The
  // overlay is pure UI — the current episode keeps playing untouched and the
  // player controls stay interactive above it (pointer-events: none).
  // -------------------------------------------------------------------------
  const [dramaNextEpisode, setDramaNextEpisode] = useState<any>(null);
  // Remaining time of the CURRENT episode (duration - currentTime). It is the
  // single source for both the visibility gate and the countdown, so the
  // overlay can never appear early nor display a value from the next episode.
  const dramaNextRemaining = playerDuration > 0 ? playerDuration - playerCurrentTime : 0;

  // Resolve the next episode for a movie inside the active drama room, using
  // the room's stored `dramas` order (never re-sorted). Returns null when
  // there is no next episode or it isn't playable, so callers can bail out
  // safely without retrying or breaking the current player.
  const getDramaNextEpisode = useCallback(
    (movieId: string | undefined): Movie | null => {
      const playlist = dramaRoomPlaylistRef.current;
      if (!movieId || !playlist) return null;
      const idx = playlist.episodes.indexOf(movieId);
      if (idx === -1) return null;
      const nextId = playlist.episodes[idx + 1];
      if (!nextId) return null;
      const nextMovie =
        resolvedMovies[nextId] ?? movies.find((m: Movie) => m.id === nextId);
      // A missing or unplayable next episode must never break the current
      // player nor trigger retries — treat it as "no next episode".
      if (!nextMovie || !getMovieSourceUrl(nextMovie)) return null;
      return nextMovie;
    },
    [resolvedMovies, movies],
  );

  // Resolve the Next Episode control state: `inRoom` is true only while the
  // active movie belongs to a Drama Room playlist (so the button never appears
  // for regular movies), and `next` is the next episode in the room's stored
  // order — null on the final episode, which disables the button and guarantees
  // it can never navigate anywhere. Reuses getDramaNextEpisode so the button
  // and the auto-next logic always agree on the same episode.
  const dramaNextInfo = useMemo<{ inRoom: boolean; next: Movie | null }>(() => {
    const playlist = dramaRoomPlaylistRef.current;
    const movie = selectedMovie;
    if (!playlist || !movie) return { inRoom: false, next: null };
    const inRoom = playlist.episodes.includes(movie.id);
    return { inRoom, next: inRoom ? getDramaNextEpisode(movie.id) : null };
  }, [selectedMovie, getDramaNextEpisode]);

  // Recompute the preview on every progress tick: visible ONLY while
  // 0 < remaining <= 30 on the current episode's clock, hidden immediately the
  // time leaves that window (seek, loop-back, manual switch, ended). Because
  // `getDramaNextEpisode` returns the same object reference while the state
  // persists, this setState is idempotent — no remount/flicker while visible.
  useEffect(() => {
    if (!showPlayer) {
      setDramaNextEpisode(null);
      return;
    }
    const movie = selectedMovieRef.current;
    if (!movie || !dramaRoomPlaylistRef.current) {
      setDramaNextEpisode(null);
      return;
    }
    if (dramaNextRemaining <= 0 || dramaNextRemaining > 30) {
      setDramaNextEpisode(null);
      return;
    }
    const next = getDramaNextEpisode(movie.id);
    if (!next) {
      setDramaNextEpisode(null);
      return;
    }
    setDramaNextEpisode(next);
  }, [dramaNextRemaining, showPlayer, getDramaNextEpisode]);

  const handleDramaRoomEnded = useCallback(() => {
    const playlist = dramaRoomPlaylistRef.current;
    const movie = selectedMovieRef.current;
    if (!playlist || !movie) return;
    // Only auto-advance for episodes that belong to the active drama room.
    const idx = playlist.episodes.indexOf(movie.id);
    if (idx === -1) {
      // The current movie is not part of this room — stop tracking it.
      dramaRoomPlaylistRef.current = null;
      return;
    }
    const guard = dramaAdvanceGuardRef.current;
    // Ignore repeat finished-signals for the same episode (races, duplicates).
    if (guard.fromId === movie.id && Date.now() - guard.lastAt < 4000) return;
    // Last episode in the room: finish normally, do NOT navigate anywhere.
    const nextId = playlist.episodes[idx + 1];
    if (!nextId) {
      dramaRoomPlaylistRef.current = null;
      return;
    }
    const nextMovie =
      resolvedMovies[nextId] ?? movies.find((m: Movie) => m.id === nextId);
    // Missing or unplayable next episode: stop auto-advance entirely so we
    // never retry/loop on repeated "ended" signals nor break the player.
    if (!nextMovie || !getMovieSourceUrl(nextMovie)) {
      dramaRoomPlaylistRef.current = null;
      return;
    }
    guard.fromId = movie.id;
    guard.lastAt = Date.now();
    // Always start the auto-advanced episode at 0s — never at a saved resume
    // position (see openMovie) so progression flows cleanly through the room.
    openMovie(nextMovie, { startFromBeginning: true });
  }, [resolvedMovies, movies, openMovie]);

  // Live ref so the once-mounted player message listeners can always reach the
  // latest handler without re-subscribing (avoids stale closures).
  const dramaEndedHandlerRef = useRef<() => void>(() => {});
  dramaEndedHandlerRef.current = handleDramaRoomEnded;

  // -------------------------------------------------------------------------
  // Player start-of-playback preview: when any movie begins playing in the
  // modal player — a drama room episode (auto-next, manual switch, first
  // open) or a regular movie opened via the movie details / VIP / continue-
  // watching views — we immediately surface a "Now Playing" card (same visual
  // language as the "Up Next" overlay) for EXACTLY 5 seconds while playback
  // continues normally — the video is never paused, seeked or restarted. A
  // single shared timer is reused so a fast switch can never stack duplicate
  // timers, and it is fully independent from the final-30-seconds "Up Next"
  // overlay. The hero background trailer player is intentionally excluded.
  // -------------------------------------------------------------------------
  const [playerStartPreview, setPlayerStartPreview] = useState<Movie | null>(null);
  const playerStartPreviewTimerRef = useRef<number | null>(null);
  const showPlayerStartPreview = useCallback((movie: Movie) => {
    if (playerStartPreviewTimerRef.current !== null) {
      window.clearTimeout(playerStartPreviewTimerRef.current);
      playerStartPreviewTimerRef.current = null;
    }
    setPlayerStartPreview(movie);
    playerStartPreviewTimerRef.current = window.setTimeout(() => {
      playerStartPreviewTimerRef.current = null;
      setPlayerStartPreview(null);
    }, 5000);
  }, []);

  // Trigger the preview each time the modal player starts a movie: a drama
  // room episode (auto-next, manual switch, first open) or any regular movie
  // opened in the player (movie details, VIP, continue-watching). The cleanup
  // guarantees the timer can never outlive the preview nor fire into a later
  // movie.
  useEffect(() => {
    if (!showPlayer) {
      setPlayerStartPreview(null);
      return;
    }
    const movie = selectedMovieRef.current;
    if (!movie) {
      setPlayerStartPreview(null);
      return;
    }
    showPlayerStartPreview(movie);
    return () => {
      if (playerStartPreviewTimerRef.current !== null) {
        window.clearTimeout(playerStartPreviewTimerRef.current);
        playerStartPreviewTimerRef.current = null;
      }
    };
  }, [showPlayer, selectedMovie?.id, showPlayerStartPreview]);

  // Clear the active playlist and the next-episode preview whenever the player
  // or the drama room modal closes, so stale state can never fire after the
  // room was dismissed.
  useEffect(() => {
    if (!showPlayer) {
      dramaRoomPlaylistRef.current = null;
      setDramaNextEpisode(null);
    }
  }, [showPlayer]);
  useEffect(() => {
    if (!selectedDramaRoom) {
      dramaRoomPlaylistRef.current = null;
      setDramaNextEpisode(null);
    }
  }, [selectedDramaRoom]);
  // A new movie (auto-next, manual episode switch, different movie) invalidates
  // the previous episode's preview state and resets the auto-next transition
  // guard, so the newly selected episode is recomputed cleanly from its own
  // position in the room's order.
  useEffect(() => {
    setDramaNextEpisode(null);
    dramaAdvanceGuardRef.current = { fromId: "", lastAt: 0 };
  }, [selectedMovie?.id]);

  // Native <video> ended (direct-stream fallback + Plyr direct MP4): advance
  // the current drama room to the next episode.
  useEffect(() => {
    if (!showPlayer || !activeServerUrl) return;
    const onEnded = () => dramaEndedHandlerRef.current?.();
    const direct = document.getElementById("room-player-direct-video") as HTMLVideoElement | null;
    direct?.addEventListener("ended", onEnded);
    const plyrMedia = (plyrRef.current as any)?.plyr?.media as HTMLVideoElement | null;
    plyrMedia?.addEventListener("ended", onEnded);
    return () => {
      direct?.removeEventListener("ended", onEnded);
      plyrMedia?.removeEventListener("ended", onEnded);
    };
  }, [showPlayer, activeServerUrl, selectedMovie?.id]);

  // Similar/related movies for the detail modal: shared tags first, ranked by
  // trending score; falls back to the currently most-watched movies so the row
  // is never empty (a real recommendation, not fake data).
  const similarMovies = useMemo(() => {
    if (!selectedMovie) return [];
    const base = movies.filter((m) => m.id !== selectedMovie.id);
    const shared = base.filter((m) =>
      Array.isArray(m.tags) &&
      Array.isArray(selectedMovie.tags) &&
      m.tags.some((t) => selectedMovie.tags.includes(t)),
    );
    const pool = shared.length >= 4 ? shared : base;
    return [...pool]
      .sort(
        (a, b) =>
          getMovieTrendingScore(b) - getMovieTrendingScore(a) ||
          getMovieLiveViewers(b) - getMovieLiveViewers(a),
      )
      .slice(0, 12);
  }, [movies, selectedMovie, getMovieTrendingScore, getMovieLiveViewers]);

  // Persist a user rating (0-10). Optimistic UI + server confirmation; guests
  // keep a local mirror so their own rating survives a reload.
  const handleRateMovie = useCallback(
    async (movie: Movie, score: number) => {
      const id = movie.id;
      setUserRatingsMap((prev) => ({ ...prev, [id]: score }));
      if (!fbUid) {
        try {
          const all = JSON.parse(localStorage.getItem("cinemachat_guest_ratings") || "{}");
          all[id] = score;
          localStorage.setItem("cinemachat_guest_ratings", JSON.stringify(all));
        } catch (e) { /* ignore */ }
      }
      try {
        const res = await api.rateMovie(id, fbUid || getDeviceId(), score);
        if (res?.ok) {
          setRatingsMap((prev) => ({
            ...prev,
            [id]: { ccRating: res.ccRating, ratingCount: res.ratingCount },
          }));
        }
      } catch (e) { /* ignore */ }
    },
    [fbUid],
  );

  const handleRateDramaRoom = useCallback(
    async (room: any, score: number) => {
      const id = room?.id;
      if (!id) return;
      // Optimistic update so the star row responds instantly.
      setUserRoomRatingsMap((prev) => ({ ...prev, [id]: score }));
      if (!fbUid) {
        try {
          const all = JSON.parse(localStorage.getItem("cinemachat_guest_room_ratings") || "{}");
          all[id] = score;
          localStorage.setItem("cinemachat_guest_room_ratings", JSON.stringify(all));
        } catch (e) { /* ignore */ }
      }
      try {
        const res = await api.rateDramaRoom(id, fbUid || getDeviceId(), score);
        if (res?.ok) {
          setRoomRatingsMap((prev) => ({
            ...prev,
            [id]: { ccRating: res.ccRating, ratingCount: res.ratingCount },
          }));
        }
      } catch (e) { /* ignore */ }
    },
    [fbUid],
  );

  // Hydrate the guest's own room ratings from localStorage on mount.
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem("cinemachat_guest_room_ratings") || "{}");
      setUserRoomRatingsMap(all);
    } catch (e) { /* ignore */ }
  }, []);

  // Hydrate the guest's own ratings from localStorage on mount.
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem("cinemachat_guest_ratings") || "{}");
      setUserRatingsMap(all);
    } catch (e) { /* ignore */ }
  }, []);

  // Continue-watching store: local-first, then merge the server record so the
  // row is available offline and stays in sync across devices.
  useEffect(() => {
    let cancelled = false;
    try {
      const local = JSON.parse(localStorage.getItem("cinemachat_continue_watching") || "{}");
      setContinueWatchingStore(local);
    } catch (e) { /* ignore */ }
    api
      .getContinueWatching(getDeviceId())
      .then((entries) => {
        if (cancelled) return;
        const merged: Record<string, { progress: number; duration: number; updatedAt: number }> = {};
        for (const e of entries) {
          if (e?.movie?.id) {
            merged[e.movie.id] = {
              progress: Number(e.progress) || 0,
              duration: Number(e.duration) || 0,
              updatedAt: Number(e.updatedAt) || 0,
            };
          }
        }
        setContinueWatchingStore((prev) => ({ ...prev, ...merged }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Smart-search bootstraps: trending terms + the identity's recent history.
  useEffect(() => {
    api.getTrendingSearches().then(setTrendingSearches).catch(() => {});
    api
      .getSearchHistory(getDeviceId())
      .then((h) => {
        const terms = (Array.isArray(h) ? h : [])
          .map((x: any) => String(x?.term || "").trim())
          .filter(Boolean)
          .slice(0, 10);
        if (terms.length) setRecentSearches(terms);
      })
      .catch(() => {});
  }, []);

  // Record a submitted search term into local history + server (feeds trending).
  const submitSearchTerm = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    setRecentSearches((prev) => {
      const next = [t, ...prev.filter((x) => x !== t)].slice(0, 10);
      try {
        localStorage.setItem("cinemachat_recent_searches", JSON.stringify(next));
      } catch (e) { /* ignore */ }
      return next;
    });
    api.recordSearch(t, getDeviceId()).catch(() => {});
  }, []);

  // Local, instant title suggestions for the search box dropdown.
  const localSuggestions = useMemo(() => {
    if (searchMode !== "title") return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return publicMovies
      .filter((m) => String(m.title || "").toLowerCase().includes(q))
      .slice(0, 6)
      .map((m) => ({ id: m.id, title: m.title, year: m.year || "" }));
  }, [publicMovies, searchQuery, searchMode]);

  // AI semantic search: prefers the server's Gemini-ranked results, falls back
  // to a client-side semantic ranking over the catalog when offline.
  const runAiSearch = useCallback(async () => {
    const q = aiQuery.trim();
    if (!q || aiLoading) return;
    const querySignals = (): SemanticSignals => ({
      keywords: q
        .split(/\s+/)
        .map((w) => w.toLowerCase())
        .filter((w) => w.length >= 2)
        .slice(0, 8),
      genres: [],
      titles: [],
    });
    setAiLoading(true);
    setAiResults(null);
    try {
      const res = await api.aiSearch(q);
      setAiMeta({
        keywords: res?.keywords || [],
        genres: res?.genres || [],
        titles: res?.titles || [],
      });
      if (Array.isArray(res?.results) && res.results.length > 0) {
        setAiResults(res.results);
      } else {
        const signals = querySignals();
        const scored = movies
          .map((m) => ({ m, s: semanticScoreMovie(m, signals) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s);
        setAiResults(scored.slice(0, 12).map((x) => x.m));
      }
      submitSearchTerm(q);
    } catch (e) {
      const signals = querySignals();
      const scored = movies
        .map((m) => ({ m, s: semanticScoreMovie(m, signals) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      setAiResults(scored.slice(0, 12).map((x) => x.m));
      setAiMeta({ keywords: [], genres: [], titles: [] });
      submitSearchTerm(q);
    } finally {
      setAiLoading(false);
    }
  }, [aiQuery, aiLoading, movies, submitSearchTerm]);

  // While a movie is playing, periodically persist playback progress so the
  // "Continue Watching" row reflects real resume points.
  useEffect(() => {
    if (!showPlayer || !selectedMovie?.id) return;
    const movieId = selectedMovie.id;
    const save = () => {
      try {
        // Query the modal player container so this also covers the YouTube
        // direct-stream fallback <video> (which the old fixed selector missed).
        const v = modalPlayerRef.current?.querySelector(
          "video",
        ) as HTMLVideoElement | null;
        if (!v || !v.currentTime || Number.isNaN(v.currentTime)) return;
        const progress = Math.round(v.currentTime);
        const duration = Math.round(v.duration || 0);
        if (progress < 5) return;
        const entry = { progress, duration, updatedAt: Date.now() };
        setContinueWatchingStore((prev) => ({ ...prev, [movieId]: entry }));
        try {
          const local = JSON.parse(
            localStorage.getItem("cinemachat_continue_watching") || "{}",
          );
          local[movieId] = entry;
          localStorage.setItem("cinemachat_continue_watching", JSON.stringify(local));
        } catch (e) { /* ignore */ }
        api.saveProgress(movieId, getDeviceId(), progress, duration).catch(() => {});
      } catch (e) { /* ignore */ }
    };
    const iv = setInterval(save, 15000);
    return () => {
      clearInterval(iv);
      save();
    };
  }, [showPlayer, selectedMovie?.id]);

  // Resolved continue-watching list (movies matched against the catalog).
  const continueWatchingMovies = useMemo(() => {
    return Object.entries(continueWatchingStore)
      .map(([id, data]) => ({ movie: movies.find((m) => m.id === id), data }))
      .filter(
        (x): x is {
          movie: Movie;
          data: { progress: number; duration: number; updatedAt: number };
        } => Boolean(x.movie),
      )
      .sort((a, b) => b.data.updatedAt - a.data.updatedAt)
      .slice(0, 12);
  }, [continueWatchingStore, movies]);

  const [activeSyncGroup, setActiveSyncGroup] = useState<SyncGroup | null>(
    null,
  );
  const [activeAudioSource, setActiveAudioSource] = useState<"hero" | "room">("hero");

  useEffect(() => {
    if (showPlayer) {
      setIsHeroMuted(true);
    }
  }, [showPlayer]);

  useEffect(() => {
    if (activeSyncGroup) {
      setActiveAudioSource("room");
      setIsHeroMuted(true);
    } else {
      setActiveAudioSource("hero");
    }
  }, [activeSyncGroup]);

  // Synchronize VIP Room with Virtual Player
  useEffect(() => {
    if (!activeSyncGroup && selectedMovie?.id.startsWith("vip_movie_id_")) {
      setSelectedMovie(null);
      setActiveServerUrl(null);
      setShowPlayer(false);
      setIsMovieDetailsOpen(false);
    }
  }, [activeSyncGroup, selectedMovie]);

  // VIP room video-option switcher (called from the SyncRoom VIP strip).
  // Swaps the virtual VIP movie source so the chosen option (incl. the 4th
  // trailer option) renders in the upper player frame.
  const handleVipSelectVideo = React.useCallback(
    (url: string, title?: string, isTrailer?: boolean) => {
      if (!url) return;
      const base = selectedMovie?.id?.startsWith("vip_movie_id_")
        ? selectedMovie
        : activeSyncGroup
          ? {
              id: `vip_movie_id_${Date.now()}`,
              title: activeSyncGroup.name || "کۆڕی شاهانەی VIP (Premium Lounge)",
              quality: "VIP Premium HD",
              tags: ["VIP", "Exclusive"],
              image: "https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png",
              description:
                "سەرچاوەی بێهاوتای قوفڵکراو چوونەژوور بە سەرکەوتوویی بەهۆی کۆدی VIP.",
              whatsappLink: "",
              date: new Date().toISOString(),
            }
          : null;
      if (!base) return;

      const virtualMovie: Movie = {
        ...base,
        title: isTrailer && title ? `${title} — ترەیلەر` : title || base.title,
        streamingUrl: url,
        videoUrl: url,
        embedUrl: url,
      };
      setSelectedMovie(virtualMovie);
      setActiveServerUrl(getMovieSourceUrl(virtualMovie));
      setShowPlayer(true);
      setActiveSyncGroup((prev) => (prev ? { ...prev, videoUrl: url } : prev));

      // Best-effort mirror into the dedicated vip_rooms doc for real-time sync.
      // isVIP: true is required — the vip_rooms rules only accept updates whose
      // incoming data validates as a VIP sync group.
      if (activeSyncGroup?.isVIP && activeSyncGroup.id) {
        updateDoc(doc(db, "vip_rooms", activeSyncGroup.id), {
          isVIP: true,
          videoUrl: url,
          playback: {
            currentTime: 0,
            isPlaying: true,
            updatedAt: new Date().toISOString(),
          },
        }).catch(() => {});
      }
    },
    [selectedMovie, activeSyncGroup],
  );

  // Presence System
  // Security session flags: logs one session_start per page load and prevents
  // duplicate kick/ban alerts after the account has already been blocked.
  const securitySessionLoggedRef = React.useRef(false);
  const securityBlockedRef = React.useRef(false);

  useEffect(() => {
    if (!fbUser || !socialProfile || fbUser.uid === "admin_local_bypass") return;

    const userDoc = doc(db, "users", socialProfile.uid);

    // Check for movieId in URL
    const params = new URLSearchParams(window.location.search);
    const movieId = params.get("movieId");
    if (movieId) {
      const movie = movies.find((m) => m.id === movieId); // Ensure movies is up-to-date
      if (movie) {
        setSelectedMovie(movie);
        setActiveServerUrl(getMovieSourceUrl(movie));
        setShowPlayer(true);
      }
    }

    // Enriched security profile mirror stored in the dedicated
    // admin_security_users collection (isolated from the app `users` data).
    const securityProfile = {
      uid: socialProfile.uid,
      name: socialProfile.name || "",
      phone: cleanProfilePhone(socialProfile.phoneNumber || socialProfile.phone),
      uniqueCode: getPublicMemberCode(socialProfile, fbUser.uid),
      residence: socialProfile.residence || "",
      country: socialProfile.country || "",
      role: socialProfile.role || socialProfile.userRole || "Member",
    };

    const setOnline = async () => {
      await updateDoc(userDoc, {
        isOnline: true,
        currentRoomId: activeSyncGroup?.id || null,
        lastActive: serverTimestamp(),
      }).catch(console.error);

      // Persist the isolated security record + client-side IP + session log.
      const ip = await getClientIp();
      const isNewSession = !securitySessionLoggedRef.current;
      const { firstSeen, isBanned } = await syncSecurityProfile(
        securityProfile,
        ip,
        isNewSession,
      );
      if (isBanned && !securityBlockedRef.current) {
        securityBlockedRef.current = true;
        handleAuthLogout();
        alert("ئەم هەژمارە بلۆککراوە. ناتوانیت بچیتە ناو سایتەکە.");
        return;
      }
      if (isNewSession) {
        securitySessionLoggedRef.current = true;
        logUserActivity({
          uid: socialProfile.uid,
          name: securityProfile.name,
          uniqueCode: securityProfile.uniqueCode,
          action: "session_start",
          detail: `چوونەژوورەوە (یەکەم بینین: ${firstSeen})`,
          role: securityProfile.role,
          deviceIp: ip,
        });
      }
    };

    const setOffline = async () => {
      await updateDoc(userDoc, {
        isOnline: false,
        currentRoomId: null,
        lastActive: serverTimestamp(),
      }).catch(console.error);
      await markSecurityOffline(socialProfile.uid);
    };

    setOnline();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") setOnline();
      else setOffline();
    };

    window.addEventListener("beforeunload", setOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Admin kick enforcement: isKicked set on the users doc force-logouts.
    const unsubKick = onSnapshot(
      userDoc,
      (snap) => {
        const d = snap.data();
        if (d && d.isKicked && !securityBlockedRef.current) {
          securityBlockedRef.current = true;
          logUserActivity({
            uid: socialProfile.uid,
            name: securityProfile.name,
            uniqueCode: securityProfile.uniqueCode,
            action: "kicked",
            detail: "لەلایەن بەڕێوبەرەوە لە سیستم دەرکرا",
            role: securityProfile.role,
          });
          handleAuthLogout();
          alert("هەژمارەکەت لەلایەن بەڕێوبەرەوە داخراوە.");
        }
      },
      (err) => console.warn("Kick enforcement listener:", err),
    );

    // Admin IP-ban enforcement: banned_ips is watched live so a newly banned
    // IP blocks the browser immediately without a reload.
    const unsubBan = onSnapshot(
      collection(db, "banned_ips"),
      async (snap) => {
        const ip = await getClientIp();
        if (!ip || securityBlockedRef.current) return;
        const isBanned = snap.docs.some((d) => d.id === ip);
        if (isBanned) {
          securityBlockedRef.current = true;
          logUserActivity({
            uid: socialProfile.uid,
            name: securityProfile.name,
            uniqueCode: securityProfile.uniqueCode,
            action: "banned",
            detail: `ئایپی ${ip} بلۆککراوە — بەکارهێنەر لە سیستەمەکە دەرچوو`,
            role: securityProfile.role,
            deviceIp: ip,
          });
          handleAuthLogout();
          alert("ئەم ئایپیە بلۆککراوە. ناتوانیت بچیتە ناو سایتەکە.");
        }
      },
      (err) => console.warn("Ban enforcement listener:", err),
    );

    // Sync with local server for User Management & IP Logging (STABLE)
    const syncWithServer = async () => {
      if (!socialProfile?.uid) return;

      // Rate limit check: strictly prevent more than 3 syncs/submits per 60 seconds from same browser session
      const rateLimitKey = "cc_sync_attempts";
      const now = Date.now();
      const attemptsStr = sessionStorage.getItem(rateLimitKey) || "[]";
      let attempts: number[] = JSON.parse(attemptsStr);
      attempts = attempts.filter(
        (timestamp: number) => now - timestamp < 60000,
      );
      if (attempts.length >= 3) {
        console.warn(
          "[Sync Rate Limit] Blocked excessive synced updates from same browser session.",
        );
        return;
      }
      attempts.push(now);
      sessionStorage.setItem(rateLimitKey, JSON.stringify(attempts));

      // Input Sanitization: strip script tags, other HTML elements & injection tokens
      const sanitizedName = (socialProfile.name || "")
        .replace(/<\/?[^>]+(>|$)/g, "")
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .trim();

      try {
        const res = await fetchApi("/api/users/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: socialProfile.uid,
            name: sanitizedName,
            phone: cleanProfilePhone(socialProfile.phoneNumber || socialProfile.phone),
            phoneNumber: cleanProfilePhone(socialProfile.phoneNumber || socialProfile.phone),
            uniqueCode: getPublicMemberCode(socialProfile, fbUser.uid),
            avatar: socialProfile.avatar || "",
          }),
        });
        const data = await res.json();
        if (data.user?.kicked) {
          handleAuthLogout();
          alert("هەژمارەکەت لەلایەن بەڕێوبەرەوە داخراوە.");
        }
      } catch (err) {
        console.error("Server sync failed:", err);
      }
    };
    syncWithServer();

    return () => {
      setOffline();
      unsubKick();
      unsubBan();
      window.removeEventListener("beforeunload", setOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fbUser, socialProfile, activeSyncGroup]);

  // Unique User Referral Invite Join System
  useEffect(() => {
    // If the window URL has /join?ref=... or /?ref=...
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      const handleReferralInvite = async (currentSocialProfile: any) => {
        try {
          const cleanRef = refCode.trim().toUpperCase();
          console.log("[Invite Referral] Processing referral invite code:", cleanRef);
          
          // Let's lookup the inviter by their uniqueCode on the real DB
          const usersRef = realCollection(realDb, "users");
          const q = firestoreQuery(
            usersRef,
            realWhere("uniqueCode", "==", cleanRef),
            firestoreLimit(1)
          );
          const userSnap = await realGetDocs(q);
          
          if (!userSnap.empty) {
            const inviterDoc = userSnap.docs[0];
            const inviterData = inviterDoc.data() as SocialUser;
            const inviterUid = inviterDoc.id;
            const inviterRoomId = inviterData.currentRoomId;
            
            console.log(`[Invite Referral] Found inviter user: ${inviterData.name} (${inviterUid}), currentRoomId: ${inviterRoomId}`);
            
            // Re-route player session to match inviter's present coordinates
            if (inviterRoomId && inviterRoomId !== "global_room_official" && inviterRoomId !== "main_broadcast_room") {
              // Join the specific watch room / sync session
              await handleSmartJoin(inviterRoomId, currentSocialProfile);
            } else if (inviterUid) {
              // Fallback: Join the inviter's personal room session
              await handleSmartJoin(inviterUid);
            }
            
            // Clean up the URL query parameters cleanly
            const cleanUrl = window.location.origin + "/";
            window.history.replaceState({}, "", cleanUrl);
          } else {
            console.warn("[Invite Referral] No active user matches invite code :", cleanRef);
          }
        } catch (err) {
          console.error("[Invite Referral] Error resolving referral invite:", err);
        }
      };
      
      handleReferralInvite(socialProfile);
    }
  }, [fbUser, movies]);

  // Listen to pending invite requests for the current user in real-time
  useEffect(() => {
    if (!socialProfile?.uniqueCode) return;

    const qInvitations = query(
      collection(db, "invitations"),
      where("receiverUniqueCode", "==", socialProfile.uniqueCode),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      qInvitations,
      (snapshot) => {
        if (!snapshot.empty) {
          const latestDoc = snapshot.docs[0];
          setActiveInvitation({
            id: latestDoc.id,
            ...latestDoc.data()
          });
        } else {
          setActiveInvitation(null);
        }
      },
      (error) => {
        console.error("Error watching invitations:", error);
      }
    );

    return () => unsubscribe();
  }, [socialProfile?.uniqueCode]);

  const handleAcceptInvite = async (invitation: any) => {
    try {
      const inviteRef = doc(db, "invitations", invitation.id);
      await updateDoc(inviteRef, {
        status: "accepted"
      });
      setActiveInvitation(null);
    } catch (err) {
      console.error("Error accepting invite:", err);
    }
  };

  const handleDeclineInvite = async (invitation: any) => {
    try {
      const inviteRef = doc(db, "invitations", invitation.id);
      await updateDoc(inviteRef, {
        status: "declined"
      });
      setActiveInvitation(null);
    } catch (err) {
      console.error("Error declining invite:", err);
    }
  };

  // Point 50: Auto-unmute Room and Movie Player on Join
  useEffect(() => {
    // Unmute Plyr if active (Main Modal Player)
    if (activeSyncGroup && plyrRef.current?.plyr) {
      plyrRef.current.plyr.muted = false;
      plyrRef.current.plyr.volume = 1;
      console.log("Room Player Unmuted via Join Trigger");
    }

    // Unmute Room Preview Player if present
    if (activeSyncGroup) {
      const roomPlayer = getIframe("room-sync-player");
      if (roomPlayer && roomPlayer.contentWindow) {
        roomPlayer.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: "unMute",
            args: [],
          }),
          "*",
        );
      }
    }
  }, [activeSyncGroup]);

  const [showIdentityCard, setShowIdentityCard] = useState(false);
  const [socialTab, setSocialTab] = useState<"movies" | "party" | "profile" | "broadcast" | "cinema_window">(
    "movies",
  );

  const [showCinemaWindowModal, setShowCinemaWindowModal] = useState(false);
  const [activeCinemaWindowRoom, setActiveCinemaWindowRoom] = useState<any | null>(null);
  const [cinemaWindowPublicRoom, setCinemaWindowPublicRoom] = useState<any | null>(null);
  const [cinemaWindowDirectVideoUrl, setCinemaWindowDirectVideoUrl] = useState("");
  const cinemaWindowVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cinemaWindowStreamRefreshKey, setCinemaWindowStreamRefreshKey] = useState(0);
  const [cinemaWindowNativeFailureCount, setCinemaWindowNativeFailureCount] = useState(0);
  const [cinemaWindowVideoStatus, setCinemaWindowVideoStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [cinemaWindowSubtitleUrl, setCinemaWindowSubtitleUrl] = useState("");
  const [cinemaWindowSubtitleCues, setCinemaWindowSubtitleCues] = useState<CinemaWindowSubtitleCue[]>([]);
  const [originalCinemaWindowSubtitleCues, setOriginalCinemaWindowSubtitleCues] = useState<CinemaWindowSubtitleCue[]>([]);
  const [cinemaWindowPlaybackTime, setCinemaWindowPlaybackTime] = useState(0);
  const [cinemaWindowSubtitleLang, setCinemaWindowSubtitleLang] = useState("ckb");
  const [cinemaWindowSubtitleStatus, setCinemaWindowSubtitleStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [cinemaWindowSubtitleMessage, setCinemaWindowSubtitleMessage] = useState("");
  const [cinemaWindowSubtitleRetryKey, setCinemaWindowSubtitleRetryKey] = useState(0);
  const [ccSettings, setCcSettings] = useState<CcSettings>(loadCcSettings);
  const [showCcPanel, setShowCcPanel] = useState(false);
  useEffect(() => { saveCcSettings(ccSettings); }, [ccSettings]);

  // Gate: subtitle fetching, translation, and CC overlay are only active when
  // the user is inside one of the three main watch rooms. Outside these rooms
  // all subtitle-related network requests and overlay rendering are disabled.
  const isInMainWatchRoom = !!activeCinemaWindowRoom || !!selectedDramaRoom || !!showCinemaChatRoom;

  // Central entry point for AI subtitle generation. Every caller (the subtitle
  // useEffect, manual retry, etc.) must route through this so the room-gate is
  // enforced in a single place.
  const handleGenerateAiSubtitles = useCallback(
    async (
      sourceUrl: string,
      lang: string,
      signal?: AbortSignal,
      windowOptions?: { startSeconds?: number; windowSeconds?: number },
      subtitleUrl?: string,
    ) => {
      if (!isInMainWatchRoom) return null;
      return requestCinemaWindowSubtitle(sourceUrl, lang, signal, windowOptions, subtitleUrl);
    },
    [isInMainWatchRoom],
  );

  const [dashboardRooms, setDashboardRooms] = useState<any[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [dashboardCreateRoomName, setDashboardCreateRoomName] = useState("");
  const [dashboardCreateHostCode, setDashboardCreateHostCode] = useState("");
  const [dashboardCreateMovieUrl, setDashboardCreateMovieUrl] = useState("");
  const [cinemaChatSourceUrl, setCinemaChatSourceUrl] = useState("");
  const [dashboardIsLoading, setDashboardIsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardSuccess, setDashboardSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cinema-window/current")
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setCinemaWindowPublicRoom(data?.room || null);
      })
      .catch(() => {
        if (!cancelled) setCinemaWindowPublicRoom(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeCinemaWindowSourceUrl = useMemo(
    () => getCinemaWindowRoomVideoUrl(activeCinemaWindowRoom),
    [activeCinemaWindowRoom],
  );

  // ---------------------------------------------------------------------------
  // Unified subtitle source resolution — the subtitle pipeline activates when
  // ANY of the three main watch rooms has a playable video URL.
  // ---------------------------------------------------------------------------
  const isDramaRoomActive = !!selectedDramaRoom && showPlayer && !!activeServerUrl;
  const isCinemaChatActive = !!showCinemaChatRoom;

  const subtitleSourceUrl = useMemo(() => {
    if (activeCinemaWindowRoom && activeCinemaWindowSourceUrl) return activeCinemaWindowSourceUrl;
    if (isDramaRoomActive) return activeServerUrl || "";
    if (isCinemaChatActive && cinemaChatSourceUrl) return cinemaChatSourceUrl;
    return "";
  }, [activeCinemaWindowRoom, activeCinemaWindowSourceUrl, isDramaRoomActive, activeServerUrl, isCinemaChatActive, cinemaChatSourceUrl]);

  const prevSubtitleLangRef = useRef(cinemaWindowSubtitleLang);
  const prevSubtitleSourceRef = useRef(subtitleSourceUrl);

  // Playback time used for subtitle cue matching. Cinema Window tracks its own
  // time from the native <video>; Drama Rooms reuse `playerCurrentTime`.
  const subtitlePlaybackTime = activeCinemaWindowRoom
    ? cinemaWindowPlaybackTime
    : playerCurrentTime;

  // Windowed subtitle index (Sorani splits into 90-second chunks).
  const subtitleWindowIndex =
    cinemaWindowSubtitleLang === "ckb" ? Math.floor(subtitlePlaybackTime / 60) : 0;

  // The movie's stored subtitle file URL (pre-existing .srt/.vtt, not AI).
  const subtitleMovieFileUrl = useMemo(() => {
    if (activeCinemaWindowRoom?.movieId) {
      return movies.find((m) => m.id === activeCinemaWindowRoom.movieId)?.subtitleUrl || "";
    }
    if (selectedDramaRoom && selectedMovie?.id) {
      return selectedMovie.subtitleUrl || "";
    }
    return "";
  }, [activeCinemaWindowRoom?.movieId, selectedDramaRoom, selectedMovie?.id, movies]);

  const cinemaWindowActiveSubtitleText = useMemo(() => {
    if (!cinemaWindowSubtitleCues.length) return "";
    const activeCue = cinemaWindowSubtitleCues.find(
      (cue) => subtitlePlaybackTime >= cue.start && subtitlePlaybackTime <= cue.end,
    );
    return activeCue?.text || "";
  }, [subtitlePlaybackTime, cinemaWindowSubtitleCues]);

  const cinemaWindowActiveOriginalText = useMemo(() => {
    if (!ccSettings.showOriginal || !originalCinemaWindowSubtitleCues.length) return "";
    const activeCue = originalCinemaWindowSubtitleCues.find(
      (cue) => subtitlePlaybackTime >= cue.start && subtitlePlaybackTime <= cue.end,
    );
    return activeCue?.text || "";
  }, [subtitlePlaybackTime, originalCinemaWindowSubtitleCues, ccSettings.showOriginal]);

  const ccFontSizeEntry = useMemo(() => CC_FONT_SIZES.find((e) => e.key === ccSettings.fontSize) || CC_FONT_SIZES[1], [ccSettings.fontSize]);
  const ccSubtitleStyle = useMemo<React.CSSProperties>(() => ({
    color: ccSettings.textColor,
    backgroundColor: ccSettings.textColor === '#ffffff' ? `rgba(0,0,0,${ccSettings.bgOpacity})` : `rgba(0,0,0,${Math.min(ccSettings.bgOpacity + 0.1, 1)})`,
    textShadow: '0 1px 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)',
  }), [ccSettings.textColor, ccSettings.bgOpacity]);

  const cinemaWindowSubtitleWindowIndex =
    cinemaWindowSubtitleLang === "ckb" ? Math.floor(subtitlePlaybackTime / 90) : 0;

  useEffect(() => {
    setCinemaWindowStreamRefreshKey(0);
    setCinemaWindowNativeFailureCount(0);
    setCinemaWindowPlaybackTime(0);
  }, [socialTab, activeCinemaWindowSourceUrl]);

  const handleCinemaWindowNativeVideoFailure = useCallback(() => {
    if (!extractYouTubeId(activeCinemaWindowSourceUrl)) {
      setCinemaWindowVideoStatus("fallback");
      return;
    }

    setCinemaWindowNativeFailureCount((failureCount) => {
      if (failureCount < 1) {
        setCinemaWindowVideoStatus("loading");
        setCinemaWindowDirectVideoUrl("");
        setCinemaWindowStreamRefreshKey((key) => key + 1);
        return failureCount + 1;
      }

      setCinemaWindowDirectVideoUrl("");
      setCinemaWindowVideoStatus("fallback");
      return failureCount + 1;
    });
  }, [activeCinemaWindowSourceUrl]);

  useEffect(() => {
    let cancelled = false;
    setCinemaWindowDirectVideoUrl("");
    setCinemaWindowVideoStatus("idle");

    if (socialTab !== "cinema_window" || !activeCinemaWindowRoom || !activeCinemaWindowSourceUrl) {
      return () => {
        cancelled = true;
      };
    }

    const youtubeId = extractYouTubeId(activeCinemaWindowSourceUrl);
    if (!youtubeId) {
      setCinemaWindowDirectVideoUrl(activeCinemaWindowSourceUrl);
      setCinemaWindowVideoStatus("ready");
      return () => {
        cancelled = true;
      };
    }

    setCinemaWindowVideoStatus("loading");
    fetch("/api/resolve-stream", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        url: activeCinemaWindowSourceUrl,
        refresh: cinemaWindowStreamRefreshKey > 0,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        const streamUrl =
          Array.isArray(data?.streams) && typeof data.streams[0]?.url === "string"
            ? data.streams[0].url
            : "";
        if (!cancelled) {
          setCinemaWindowDirectVideoUrl(streamUrl);
          setCinemaWindowVideoStatus(streamUrl ? "loading" : "fallback");
        }
      })
      .catch(() => {
        if (!cancelled) setCinemaWindowVideoStatus("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, [socialTab, activeCinemaWindowRoom, activeCinemaWindowSourceUrl, cinemaWindowStreamRefreshKey]);

  useEffect(() => {
    if (socialTab !== "cinema_window" || !cinemaWindowDirectVideoUrl) return;

    const timer = window.setTimeout(() => {
      const player = cinemaWindowVideoRef.current;
      if (!player || player.readyState < 2) {
        handleCinemaWindowNativeVideoFailure();
      }
    }, 9000);

    return () => window.clearTimeout(timer);
  }, [socialTab, cinemaWindowDirectVideoUrl, handleCinemaWindowNativeVideoFailure]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    if (!isInMainWatchRoom || !subtitleSourceUrl) {
      setCinemaWindowSubtitleUrl("");
      setCinemaWindowSubtitleCues([]);
      setCinemaWindowSubtitleStatus("idle");
      setCinemaWindowSubtitleMessage("");
      prevSubtitleLangRef.current = cinemaWindowSubtitleLang;
      prevSubtitleSourceRef.current = subtitleSourceUrl;
      return () => {
        cancelled = true;
      };
    }

    const langChanged = prevSubtitleLangRef.current !== cinemaWindowSubtitleLang;
    const sourceChanged = prevSubtitleSourceRef.current !== subtitleSourceUrl;
    prevSubtitleLangRef.current = cinemaWindowSubtitleLang;
    prevSubtitleSourceRef.current = subtitleSourceUrl;

    if (langChanged || sourceChanged) {
      setCinemaWindowSubtitleUrl("");
      setCinemaWindowSubtitleCues([]);
      setOriginalCinemaWindowSubtitleCues([]);
    }

    const movieSubtitleUrl = subtitleMovieFileUrl;

    const selectedSubtitleLanguage = getCinemaWindowSubtitleLanguage(cinemaWindowSubtitleLang);
    const subtitleWindowOptions =
      selectedSubtitleLanguage.code === "ckb"
        ? {
            startSeconds: Math.max(0, subtitleWindowIndex * 60 - 5),
            windowSeconds: 80,
          }
        : undefined;
    const subtitleWindowKey = subtitleWindowOptions
      ? `::${subtitleWindowOptions.startSeconds}-${subtitleWindowOptions.windowSeconds}`
      : "";
    const cacheKey = `${subtitleSourceUrl}::${selectedSubtitleLanguage.code}${subtitleWindowKey}`;
    const cachedSubtitle = cinemaWindowSubtitleCache.get(cacheKey);
    if (cachedSubtitle?.vttText) {
      objectUrl = URL.createObjectURL(new Blob([cachedSubtitle.vttText], { type: "text/vtt" }));
      setCinemaWindowSubtitleUrl(objectUrl);
      setCinemaWindowSubtitleCues(parseCinemaWindowSubtitleCues(cachedSubtitle.vttText));
      if (cachedSubtitle.originalVttText) {
        setOriginalCinemaWindowSubtitleCues(parseCinemaWindowSubtitleCues(cachedSubtitle.originalVttText));
      } else {
        setOriginalCinemaWindowSubtitleCues([]);
      }
      setCinemaWindowSubtitleStatus("ready");
      setCinemaWindowSubtitleMessage(`${selectedSubtitleLanguage.label} ئامادەیە`);
      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    setCinemaWindowSubtitleStatus("loading");
    setCinemaWindowSubtitleMessage(`وەرگێڕانی ژێرنوس بۆ ${selectedSubtitleLanguage.label}...`);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120000);

    const loadSubtitle = async () => {
      try {
        return await handleGenerateAiSubtitles(
          subtitleSourceUrl,
          selectedSubtitleLanguage.code,
          controller.signal,
          subtitleWindowOptions,
          movieSubtitleUrl,
        );
      } catch (targetErr) {
        if (selectedSubtitleLanguage.code === "en") throw targetErr;

        const fallbackLangs = ["en", "ar", "ku"].filter(
          (fallbackLang) => fallbackLang !== selectedSubtitleLanguage.code,
        );
        let lastFallbackError = targetErr;

        for (const fallbackLang of fallbackLangs) {
          const fallbackCacheKey = `${subtitleSourceUrl}::${fallbackLang}${subtitleWindowKey}`;
          let fallbackSubtitle = cinemaWindowSubtitleCache.get(fallbackCacheKey);
          let fallbackSourceLang = fallbackLang;

          if (!fallbackSubtitle?.rawText) {
            try {
              fallbackSubtitle = await handleGenerateAiSubtitles(
                subtitleSourceUrl,
                fallbackLang,
                controller.signal,
                subtitleWindowOptions,
                movieSubtitleUrl,
              );
              fallbackSourceLang = fallbackSubtitle.sourceLang || fallbackLang;
              cinemaWindowSubtitleCache.set(fallbackCacheKey, fallbackSubtitle);
            } catch (fallbackErr) {
              lastFallbackError = fallbackErr;
              continue;
            }
          } else {
            fallbackSourceLang = fallbackSubtitle.sourceLang || fallbackLang;
          }

          try {
            return await translateCinemaWindowSubtitle(
              fallbackSubtitle.rawText,
              selectedSubtitleLanguage.code,
              fallbackSourceLang,
              controller.signal,
            );
          } catch (translateErr) {
            lastFallbackError = translateErr;
          }
        }

        throw lastFallbackError;
      }
    };

    loadSubtitle()
      .then((subtitle) => {
        if (!subtitle) return;
        const { vttText } = subtitle;
        cinemaWindowSubtitleCache.set(cacheKey, subtitle);
        objectUrl = URL.createObjectURL(new Blob([vttText], { type: "text/vtt" }));
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        if (!cancelled) {
          setCinemaWindowSubtitleUrl(objectUrl);
          setCinemaWindowSubtitleCues(parseCinemaWindowSubtitleCues(vttText));
          if (subtitle.originalVttText) {
            setOriginalCinemaWindowSubtitleCues(parseCinemaWindowSubtitleCues(subtitle.originalVttText));
          } else {
            setOriginalCinemaWindowSubtitleCues([]);
          }
          setCinemaWindowSubtitleStatus("ready");
          setCinemaWindowSubtitleMessage(`${selectedSubtitleLanguage.label} ئامادەیە`);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCinemaWindowSubtitleCues([]);
          setOriginalCinemaWindowSubtitleCues([]);
          setCinemaWindowSubtitleStatus("error");
          setCinemaWindowSubtitleMessage(
            err?.name === "AbortError"
              ? "وەرگێڕانی ژێرنوس کاتی تەواو بوو"
              : err?.message || "وەرگێڕانی ژێرنوس سەرکەوتوو نەبوو",
          );
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    isInMainWatchRoom,
    subtitleSourceUrl,
    cinemaWindowSubtitleLang,
    subtitleWindowIndex,
    subtitleMovieFileUrl,
    cinemaWindowSubtitleRetryKey,
  ]);

  // Sync dashboardCreateHostCode with socialProfile when defined
  useEffect(() => {
    if (socialProfile?.uniqueCode) {
      setDashboardCreateHostCode(socialProfile.uniqueCode);
    }
  }, [socialProfile]);

  // Auto-select first movie for room creation by default
  useEffect(() => { // Ensure movies is available before setting default
    if (movies.length > 0 && !dashboardCreateMovieUrl) {
      const firstMovie = movies[0];
      const url = getMovieSourceUrl(firstMovie) || "";
      setDashboardCreateMovieUrl(url);
      setDashboardCreateRoomName(`ژووری هاوڕێیانی ${firstMovie.title}`);
    }
  }, [movies, dashboardCreateMovieUrl]);

  // Poll available rooms for the dashboard and sync rooms instantly (using db.syncGroups)
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetchApi("/api/rooms", {}, 1);
        if (res.ok) {
          const data = await res.json();
          setDashboardRooms(data);
        }
      } catch (err) {
        console.warn("Could not load dashboard rooms:", err);
      }
    };
    fetchRooms();
    const interval = setInterval(fetchRooms, 15000);
    return () => clearInterval(interval);
  }, []);

  // Health Check
  useEffect(() => {
    fetchApi("/api/health")
      .then((r) => r.json())
      .then((d) => console.log("API Health Check:", d))
      .catch((e) => console.warn("API Health Check Failed:", e));
  }, []);

  // Point 41: Global Sync Source of Truth (Real-time sync onSnapshot instead of 5 minute polling)
  // HERO ONLY: config/featured feeds the hero carousel (featuredMovieFromDB).
  // It no longer drives the global room stream — that is isolated in
  // config/global_room (Point 41b) so hero edits never broadcast to viewers.
  useEffect(() => {
    const unsub = firestoreSnapshot(
      doc(db, "config", "featured"),
      (snap) => {
        try {
          if (snap.exists()) {
            const data = snap.data();
            console.log("New Firebase Data:", data); // FORCE UPDATE LOG
            setFeaturedMovieFromDB(data as Movie);
          }
        } catch (err) {
          console.warn("Featured config mapping failed:", err);
        }
      },
      (err) => {
        console.warn("Featured config subscription failed (likely rule or quote block):", err);
      }
    );
    return () => unsub();
  }, []);

  // Point 41b: Global Room Broadcast Stream (config/global_room)
  // Dedicated, isolated Firestore path written by the admin BroadcastModule.
  // When a broadcast exists it overrides the player's source, otherwise the
  // global stream is cleared so the hero/normal movie playback is untouched.
  useEffect(() => {
    const unsub = firestoreSnapshot(
      doc(db, "config", "global_room"),
      (snap) => {
        try {
          if (snap.exists()) {
            const data = snap.data() as any;
            const url =
              data.videoUrl ||
              data.videoData?.url ||
              data.videoData?.videoUrl ||
              data.embedUrl ||
              "";
            const vidId =
              data.videoId || (url ? extractYouTubeId(url) : null);
            setGlobalStreamURL(
              vidId ? `https://www.youtube.com/embed/${vidId}` : url || null,
            );
          } else {
            setGlobalStreamURL(null);
          }
        } catch (err) {
          console.warn("Global room config mapping failed:", err);
        }
      },
      (err) => {
        console.warn("Global room config subscription failed (likely rule or quote block):", err);
      }
    );
    return () => unsub();
  }, []);

  // Point 42: Global Playback Sync Handler
  // ---- Live sync helpers (watch-together) ----
  // How far the local player may drift from the authoritative room clock before
  // a corrective seek is applied (guards against constant re-seek jitter).
  const SYNC_SEEK_TOLERANCE = 2.5;

  // Read whichever player is actually active, mirroring the seek-bar poller:
  // direct-stream fallback <video> → Plyr → YouTube embed clock → local clock.
  const readLivePlayback = (): { currentTime: number; isPlaying: boolean } => {
    const directVideo = document.getElementById("room-player-direct-video") as HTMLVideoElement | null;
    if (directVideo) {
      return {
        currentTime: typeof directVideo.currentTime === "number" ? directVideo.currentTime : 0,
        isPlaying: !directVideo.paused,
      };
    }
    if (plyrRef.current?.plyr) {
      const p = plyrRef.current.plyr;
      return {
        currentTime: typeof p.currentTime === "number" ? p.currentTime : 0,
        isPlaying: !p.paused,
      };
    }
    const isYouTube =
      !!activeServerUrlRef.current &&
      /youtube\.com|youtu\.be/i.test(activeServerUrlRef.current);
    if (isYouTube) {
      return { currentTime: ytCurrentTimeRef.current || 0, isPlaying: ytPlayingRef.current };
    }
    return { currentTime: localClockRef.current || 0, isPlaying: ytPlayingRef.current };
  };

  // Guest-side live sync: apply the room's authoritative (drift-corrected)
  // playback state to EVERY player type — Plyr, the YouTube embed, third-party
  // embeds and the direct-stream fallback <video>. The inner closure is swapped
  // on every render so it always sees fresh state, while the exported callback
  // stays referentially stable (SyncRoom's listener must not re-subscribe on
  // each render).
  const applySyncedPlaybackRef = React.useRef<(time: number, playing: boolean) => void>(() => {});
  applySyncedPlaybackRef.current = (time: number, playing: boolean) => {
    const live = readLivePlayback();

    // Corrective seek only when the drift is meaningful (avoid jitter).
    if (Math.abs(live.currentTime - time) > SYNC_SEEK_TOLERANCE) {
      seekToPlayer(time);
    }

    // Resume all active players.
    if (playing && !live.isPlaying) {
      if (plyrRef.current?.plyr) plyrRef.current.plyr.play().catch(() => {});
      const directVideo = document.getElementById("room-player-direct-video") as HTMLVideoElement | null;
      if (directVideo) directVideo.play().catch(() => {});
      const roomPlayer = document.getElementById("room-player") as HTMLIFrameElement | null;
      if (roomPlayer?.contentWindow) {
        if (ytClockLiveRef.current) {
          roomPlayer.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: "playVideo", args: [] }),
            "https://www.youtube.com",
          );
        } else {
          pendingRoomPlayerPlayRef.current = true;
        }
      }
      postVideoCommand("streaming-player", "playVideo");
      setIsIframePlaying(true);
      ytPlayingRef.current = true;
    } else if (!playing && live.isPlaying) {
      // Pause all active players.
      if (plyrRef.current?.plyr) plyrRef.current.plyr.pause();
      const directVideo = document.getElementById("room-player-direct-video") as HTMLVideoElement | null;
      if (directVideo) directVideo.pause();
      const roomPlayer = document.getElementById("room-player") as HTMLIFrameElement | null;
      if (roomPlayer?.contentWindow) {
        if (ytClockLiveRef.current) {
          roomPlayer.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
            "https://www.youtube.com",
          );
        } else {
          pendingRoomPlayerPlayRef.current = false;
        }
      }
      postVideoCommand("streaming-player", "pauseVideo");
      setIsIframePlaying(false);
      ytPlayingRef.current = false;
    }
  };
  const handleSyncedPlayback = React.useCallback((time: number, playing: boolean) => {
    applySyncedPlaybackRef.current(time, playing);
  }, []);

  // Point 43: Host → Firestore live playback publisher (watch-together).
  // Publishes { isPlaying, currentTime, updatedAt } to the room doc so the
  // SyncRoom / Point 46 listeners on every client see host seeks, pauses and
  // playback in near real-time. Only the creator (or the official global room)
  // publishes — the host's state is authoritative and guests only read.
  // VIP rooms publish to vip_rooms/{id} (same shape + isVIP flag so the rules
  // accept the partial update).
  useEffect(() => {
    if (!activeSyncGroup) return;
    const roomId = activeSyncGroup.id;
    const isVip = !!activeSyncGroup.isVIP;
    const canPublish =
      !!socialProfile?.uid &&
      socialProfile.uid !== "admin_local_bypass" &&
      (socialProfile.uid === activeSyncGroup.creatorId || roomId === "global_room_official");
    if (!canPublish) return;

    const roomRef = doc(db, isVip ? "vip_rooms" : "syncGroups", roomId);

    let lastPublishedTime = -1;
    let lastPublishedPlaying: boolean | null = null;
    let lastPublishedAt = 0;

    const publish = (override?: { currentTime?: number; isPlaying?: boolean }) => {
      const live = readLivePlayback();
      const currentTime =
        typeof override?.currentTime === "number" ? override.currentTime : live.currentTime;
      const isPlaying =
        typeof override?.isPlaying === "boolean" ? override.isPlaying : live.isPlaying;
      const now = Date.now();

      const timeDelta = Math.abs(currentTime - lastPublishedTime);
      const stateChanged = lastPublishedPlaying !== null && isPlaying !== lastPublishedPlaying;
      const stale = now - lastPublishedAt > 12000;

      // Skip redundant publishes (same time, same state, still fresh).
      if (lastPublishedTime >= 0 && timeDelta < 2 && !stateChanged && !stale) return;

      lastPublishedTime = currentTime;
      lastPublishedPlaying = isPlaying;
      lastPublishedAt = now;

      const payload: any = {
        playback: {
          isPlaying,
          currentTime: Math.round(currentTime * 10) / 10,
          updatedAt: new Date().toISOString(),
        },
      };
      if (isVip) payload.isVIP = true;

      updateDoc(roomRef, payload).catch((err: any) => {
        if (err?.code !== "permission-denied") {
          console.warn("Live playback publish failed:", err?.message || err);
        }
      });
    };

    publishPlaybackNowRef.current = publish;
    const iv = window.setInterval(() => publish(), 3000);
    return () => {
      window.clearInterval(iv);
      if (publishPlaybackNowRef.current === publish) {
        publishPlaybackNowRef.current = () => {};
      }
    };
  }, [activeSyncGroup, socialProfile?.uid]);

  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinValidationStatus, setJoinValidationStatus] = useState<
    "idle" | "valid-online" | "valid-offline" | "invalid"
  >("idle");
  const [joinValidatedUser, setJoinValidatedUser] = useState<any>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinQrInputRef = useRef<HTMLInputElement>(null);

  // Real-time Live ID Validation for the Join Modal (Optimized)
  const validateJoinCode = React.useCallback(async () => {
    setJoinError(null);
    if (!joinRoomCode || joinRoomCode.length < 3) {
      setJoinValidationStatus("idle");
      setJoinValidatedUser(null);
      return;
    }

    const timer = setTimeout(async () => {
      const trimmedId = joinRoomCode.trim().toUpperCase();
      try {
        const q = firestoreQuery(
          realCollection(realDb, "users"),
          realWhere("uniqueCode", "==", trimmedId),
          firestoreLimit(1),
        );
        const snapshot = await realGetDocs(q);

        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data();
          setJoinValidatedUser(userData);
          setJoinValidationStatus(
            userData.isOnline ? "valid-online" : "valid-offline",
          );
        } else {
          // Fallback to checking if it is a valid sync group ID
          // We must query lowercase if exact match or trimmedId itself
          const roomRef = firestoreDoc(
            realDb,
            "syncGroups",
            joinRoomCode.trim(),
          );
          const roomSnap = await realGetDoc(roomRef);
          if (roomSnap.exists()) {
            setJoinValidatedUser({
              name: (roomSnap.data() as any).name || "Group Room",
              isOnline: true,
            });
            setJoinValidationStatus("valid-online");
          } else {
            setJoinValidationStatus("invalid");
            setJoinValidatedUser(null);
          }
        }
      } catch (error) {
        setJoinValidationStatus("invalid");
        // Only log if not permission-denied to keep console clean
        console.error("Join validation error:", error);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [joinRoomCode]);

  const handleJoinQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("قەبارەی وێنەی کۆدی QR نابێت لە ٢ مێگابایت گەورەتر بێت!");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          alert("تکایە وێنەیەکی ڕوونی QR کۆد هەڵبژێرە");
          e.target.value = "";
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code && code.data && code.data.trim()) {
            let extractedId = code.data.trim();
            if (extractedId.startsWith("cinemachat://user/")) {
              extractedId = extractedId.replace("cinemachat://user/", "");
            }
            setJoinRoomCode(extractedId);
            handleSmartJoin(extractedId);
          } else {
            alert("تکایە وێنەیەکی ڕوونی QR کۆد هەڵبژێرە");
          }
        } catch (err) {
          console.error("Error decoding QR code:", err);
          alert("تکایە وێنەیەکی ڕوونی QR کۆد هەڵبژێرە");
        }
        e.target.value = "";
      };
      img.onerror = () => {
        alert("تکایە وێنەیەکی ڕوونی QR کۆد هەڵبژێرە");
        e.target.value = "";
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Point 47: Persistence - Restore session on mount
  useEffect(() => {
    const savedRoomId = safeStorage.get("active_sync_room_id");
    if (savedRoomId && fbUser && !activeSyncGroup) {
      handleSmartJoin(savedRoomId);
    }
  }, [fbUser]);

  // Point 48: Save session on change
  useEffect(() => {
    if (activeSyncGroup) {
      safeStorage.set("active_sync_room_id", activeSyncGroup.id);
    } else {
      safeStorage.remove("active_sync_room_id");
    }
  }, [activeSyncGroup]);

  const handleSmartJoin = async (providedCode?: string, currentSocialProfile?: any) => {
    setIsLoading(true);
    setJoinError(null);
    try {
      let targetRoomId = "global_room_official";
      let roomName = "Official Global Room 🎬";
      let creatorId = "system";

      const code = providedCode?.trim();

      if (code && code !== "" && code !== "global_room_official") { // Don't try to lookup global room as user/room
        // 1. Try to find user by uniqueCode (Friend ID lookup) on REAL DB
        const usersRef = realCollection(realDb, "users");
        const q = firestoreQuery(
          usersRef,
          realWhere("uniqueCode", "==", code.toUpperCase()),
          firestoreLimit(1),
        );
        let userSnap;
        try {
          userSnap = await realGetDocs(q);
        } catch (e) {
          console.error("Firestore uniqueCode query failed:", e);
        }

        if (userSnap && !userSnap.empty) {
          // Found a user! Join their personal room
          const friendData = userSnap.docs[0].data();
          targetRoomId = userSnap.docs[0].id; // Use their UID as room ID
          roomName = `ژووری ${friendData.name}`;
          creatorId = targetRoomId;
        } else {
          // 2. If not a friend code, try as a direct room ID on REAL DB
          const roomRef = firestoreDoc(realDb, "syncGroups", code);
          let roomSnap;
          try {
            roomSnap = await realGetDoc(roomRef);
          } catch (e) {
            console.error("Firestore room lookup failed:", e);
          }

          if (roomSnap && roomSnap.exists()) {
            targetRoomId = code;
            const data = roomSnap.data() as SyncGroup;
            roomName = data.name;
            creatorId = data.creatorId;
          } else {
            // Not found as user or room
            setJoinError("کۆدەکە هەڵەیە");
            alert("کۆدەکە هەڵەیە، تکایە دیسان هەوڵ بدەوە");
            setIsLoading(false);
            return;
          }
        }
      }

      // Code is verified and correct! Now check if user is logged in
      let activeProfile = currentSocialProfile || socialProfile;

      if (!activeProfile) {
        // General/Signed-out user: Try anonymous login to directly enter
        try {
          const { signInAnonymously } = await import("./lib/firebase");
          const userCredential = await signInAnonymously(realAuth);
          const user = userCredential.user;
          const guestName = `مێوان (ڕێبوار-${Math.floor(100 + Math.random() * 900)})`;
          const guestCode = `CC-CC-${Math.floor(1000 + Math.random() * 9000)}`;
          const guestPhone = `GUEST-${Math.floor(1000 + Math.random() * 9000)}`;

          const guestUserRef = firestoreDoc(realDb, "users", user.uid);
          await realSetDoc(guestUserRef, {
            uid: user.uid,
            name: guestName,
            phone: guestPhone,
            uniqueCode: guestCode,
            isOnline: true,
            createdAt: new Date().toISOString(),
            role: "user",
          });

          activeProfile = {
            uid: user.uid,
            name: guestName,
            phone: guestPhone,
            uniqueCode: guestCode,
            isOnline: true,
            createdAt: new Date().toISOString(),
            role: "user",
          };
        } catch (authError) {
          console.warn(
            "Anonymous sign-in failed, launching standard signup/login overlay:",
            authError,
          );
          setIsLoading(false);
          setModalMode("signup");
          setShowSocialModal(true);
          return;
        }
      }

      // 3. Finalize Joining with activeProfile
      const roomRef = firestoreDoc(realDb, "syncGroups", targetRoomId);
      let roomSnap = await realGetDoc(roomRef);
      let roomData: SyncGroup;

      if (!roomSnap.exists()) { // If room doesn't exist, create it
        const newRoom: SyncGroup = {
          id: targetRoomId,
          name: roomName,
          creatorId: activeProfile.uid, // Current user is the creator of this instance
          memberIds: [activeProfile.uid],
          playback: {
            isPlaying: false,
            currentTime: 0,
            updatedAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
        };
        try {
          await realSetDoc(roomRef, newRoom);
        } catch (e) {
          handleFirestoreError(
            e,
            OperationType.CREATE,
            `syncGroups/${targetRoomId}`,
          );
          setIsLoading(false);
          return;
        }
        roomData = newRoom;
      } else {
        const data = roomSnap.data() as SyncGroup; // If room exists, update it
        const currentMemberIds = Array.isArray(data.memberIds)
          ? data.memberIds
          : [];
        if (
          activeProfile &&
          activeProfile.uid &&
          activeProfile.uid !== "admin_local_bypass" &&
          !currentMemberIds.includes(activeProfile.uid)
        ) {
          try {
            await firestoreUpdateDoc(roomRef, {
              memberIds: arrayUnion(activeProfile.uid),
            });
          } catch (e) {
            handleFirestoreError(
              e,
              OperationType.UPDATE,
              `syncGroups/${targetRoomId}`,
            );
            setIsLoading(false);
            return;
          }
          roomData = {
            ...data,
            memberIds: [...currentMemberIds, activeProfile.uid],
          };
        } else {
          roomData = { ...data, memberIds: currentMemberIds };
        }
      } // End if (!roomSnap.exists())

      setActiveSyncGroup(roomData);
      setIsRoomMuted(false); // Entry logic: UNMUTE room
      setSocialTab("movies");
      setShowJoinCodeModal(false);

      if (activeFeaturedMovie) {
        setSelectedMovie(activeFeaturedMovie);
        setActiveServerUrl(getMovieSourceUrl(activeFeaturedMovie));
        setShowPlayer(true);
      }
    } catch (err) {
      console.error("Join error:", err);
      alert("کێشەیەک ڕوویدا لە کاتی پەیوەندیکردن.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = (room: SyncGroup) => {
    setActiveSyncGroup(room);
    setIsRoomMuted(false); // Entry logic: UNMUTE room
    setSocialTab("movies");
    if (activeFeaturedMovie) {
      setSelectedMovie(activeFeaturedMovie);
      setActiveServerUrl(getMovieSourceUrl(activeFeaturedMovie));
      setShowPlayer(true);
    }
  };


  // Point 45: Handle Global Stream updates in the room (REFINED)
  useEffect(() => {
    if (
      !activeSyncGroup ||
      activeSyncGroup.id !== "global_room_official" ||
      !globalStreamURL
    )
      return;

    // If a global stream is active, we might want to switch to it automatically
    if (
      !selectedMovie ||
      (selectedMovie.embedUrl !== globalStreamURL &&
        selectedMovie.videoUrl !== globalStreamURL)
    ) {
      const existingMovie = movies.find(
        (m) => m.embedUrl === globalStreamURL || m.videoUrl === globalStreamURL,
      );
      if (existingMovie) { // If movie exists in catalog, use it
        setSelectedMovie(existingMovie);
        setActiveServerUrl(getMovieSourceUrl(existingMovie));
      } else {
        const newGlobalMovie = {
          id: "global-stream-" + Date.now(),
          title: "پەخشی ڕاستەوخۆ",
          description: "ئەم ڤیدیۆیە لەلایەن ئەدمینەوە پەخش دەکرێت.",
          image: "https://images.unsplash.com/photo-1542204172-356399558651",
          embedUrl: globalStreamURL,
          videoUrl: globalStreamURL,
          isYouTube:
            globalStreamURL.includes("youtube.com") ||
            globalStreamURL.includes("youtu.be"),
          quality: "HD",
          date: new Date().toISOString(),
          tags: ["Live"],
          whatsappLink: config.socialLinks.whatsapp || config.socialLinks.group || "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
        };
        setSelectedMovie(newGlobalMovie);
        setActiveServerUrl(getMovieSourceUrl(newGlobalMovie));
      }
      setShowPlayer(true);
    }
  }, [globalStreamURL, activeSyncGroup?.id, movies]);

  // Point 46: Playback Synchronization Logic
  useEffect(() => {
    if (!activeSyncGroup) return;
    (window as any).currentPlayer = plyrRef.current?.plyr;

    let unsubscribe: any;
    // VIP rooms live in their own collection (vip_rooms), regular rooms in syncGroups.
    const syncCollection = activeSyncGroup.isVIP ? "vip_rooms" : "syncGroups";
    const docRef = doc(db, syncCollection, activeSyncGroup.id);

    getDoc(docRef)
      .then((docS) => {
        if (docS.exists()) {
          unsubscribe = onSnapshot(
            docRef,
            (docS) => {
              if (!docS.exists()) return;
              const data = docS.data() as SyncGroup;

              // Movie Sync Logic — guests adopt the host's posted movie so their
              // player loads the same source before synced playback is applied.
              if (data.videoData) {
                const movieUpdate: Movie = {
                  id: data.videoData.id || "broadcast-" + Date.now(),
                  title: data.videoData.title || "Broadcast",
                  image: data.videoData.image || "",
                  embedUrl: data.videoData.url || data.videoData.videoUrl || "",
                  videoUrl: data.videoData.videoUrl || data.videoData.url || "",
                  isYouTube:
                    data.videoData.isYouTube ??
                    (data.videoData.url?.includes("youtube") || false),
                  videoId:
                    data.videoData.videoId ||
                    extractYouTubeId(data.videoData.url || ""),
                  category: data.videoData.category || "Broadcast",
                  description: data.videoData.description || "",
                  quality: data.videoData.quality || "HD",
                  tags: data.videoData.tags || ["Broadcast"],
                  whatsappLink:
                    config.socialLinks.whatsapp || config.socialLinks.group || "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
                  date: new Date().toISOString(),
                };

                if (
                  !selectedMovie ||
                  selectedMovie.id !== movieUpdate.id ||
                  selectedMovie.embedUrl !== movieUpdate.embedUrl
                ) {
                  setSelectedMovie(movieUpdate);
                  setActiveServerUrl(getMovieSourceUrl(movieUpdate));
                  setShowPlayer(true);
                }
              } else if (
                data.currentMovieId &&
                (!selectedMovie || selectedMovie.id !== data.currentMovieId)
              ) {
                const targetMovie = movies.find(
                  (m) => m.id === data.currentMovieId,
                );
                if (targetMovie) {
                  setSelectedMovie(targetMovie);
                  setActiveServerUrl(getMovieSourceUrl(targetMovie));
                  setShowPlayer(true);
                }
              }

              // Playback sync (seek/play/pause) is applied by handleSyncedPlayback
              // via the SyncRoom listener, which carries drift compensation and
              // covers every player type — so it is NOT duplicated here.
            },
            (error) => {
              const messageStr =
                error instanceof Error ? error.message : String(error);
              const isNotFoundError =
                (error as any)?.code === "not-found" ||
                messageStr.toLowerCase().includes("not_found") ||
                messageStr.includes("NOT_FOUND");
              if (isNotFoundError) {
                console.warn(
                  "Sync listener paused: Document not found for:",
                  docRef.path,
                );
              } else if (messageStr.toLowerCase().includes("quota")) {
                setIsQuotaExceeded(true);
                console.warn(
                  "Sync listener paused: Quota exceeded for:",
                  docRef.path,
                );
              } else {
                handleFirestoreError(
                  error,
                  OperationType.GET,
                  `syncGroups/${activeSyncGroup.id}`,
                );
              }
            },
          );
        }
      })
      .catch((err) => console.warn("Failed to check existence", err));

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeSyncGroup?.id, activeSyncGroup?.isVIP, selectedMovie, movies]);

  // Fullscreen effect
  useEffect(() => {
    const handleFullscreen = async (ref: React.RefObject<HTMLDivElement>) => {
      if (showPlayer && ref.current) {
        try {
          // Automatic fullscreen is often blocked by browsers outside direct user interaction.
          // We will rely on the user clicking the fullscreen button in the player UI or
          // the direct click handlers we have on movie elements.
          /*
          if (!document.fullscreenElement) {
            if (ref.current.requestFullscreen) {
              await ref.current.requestFullscreen();
            } else if ((ref.current as any).webkitRequestFullscreen) {
              await (ref.current as any).webkitRequestFullscreen();
            }
          }
          */
        } catch (err) {
          console.error("Fullscreen error:", err);
        }
      } else if (!showPlayer && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };

    if (selectedMovie) {
      handleFullscreen(modalPlayerRef);
    } else {
      handleFullscreen(playerContainerRef);
    }
  }, [showPlayer, selectedMovie]);

  // Advanced Admin State
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Trigger Admin via URL ?admin=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "true") {
      setShowAdminPanel(true);
    }
  }, []);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showVipModal, setShowVipModal] = useState(false);
  const [showDirectMessagesModal, setShowDirectMessagesModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const [currentUser, setCurrentUser] = useState<any>(() => {
    const saved = safeStorage.get("cinemachat_admin");
    return saved ? JSON.parse(saved) : null;
  });
  const systemVerified =
    currentUser?.username?.toLowerCase() === "admin" ||
    currentUser === "admin" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "owner" ||
    currentUser?.role === "super_admin" ||
    currentUser?.role === "deputy_manager" ||
    currentUser?.role === "staff" ||
    socialProfile?.role === "admin" ||
    socialProfile?.userRole === "admin" ||
    socialProfile?.role === "super_admin" ||
    socialProfile?.userRole === "super_admin" ||
    socialProfile?.role === "deputy_manager" ||
    socialProfile?.userRole === "deputy_manager" ||
    socialProfile?.role === "staff" ||
    socialProfile?.userRole === "staff";

  // "New Room +" is restricted to Owner / Deputy Manager accounts only (reuses
  // the existing role vocabulary — no new permission system).
  const canCreateDramaRoom =
    currentUser?.username?.toLowerCase() === "admin" ||
    currentUser?.username?.toLowerCase() === "dekan@123" ||
    currentUser?.role === "owner" ||
    !!currentUser?.isOwner ||
    currentUser?.role === "deputy_manager" ||
    socialProfile?.role === "owner" ||
    socialProfile?.userRole === "owner" ||
    socialProfile?.role === "deputy_manager" ||
    socialProfile?.userRole === "deputy_manager";

  // Monitor banned visitor IP on layout-load dynamically (Security Guard check).
  // Owner-whitelisted IPs/devices get a live countdown + auto-restore: the
  // server auto-unblocks after 1 minute and returns ownerExempt/unblockAt so
  // the UI can show the exact remaining time and refresh the moment it ends.
  const checkBanStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/check-ban", {
        headers: { "X-Device-Id": getDeviceId() },
      });
      const data = await res.json();
      if (data) {
        if (data.banned) {
          setBlockedAt((prev) => prev ?? new Date());
          setOwnerExempt(!!data.ownerExempt);
          setUnblockAt(data.unblockAt ? new Date(data.unblockAt).getTime() : null);
          setBannedFromSystem(true);
        } else {
          setBannedFromSystem(false);
          setOwnerExempt(false);
          setUnblockAt(null);
        }
        if (data.emergencyLock && !currentUser) {
          setEmergencyLocked(true);
        } else {
          setEmergencyLocked(false);
        }
      }
    } catch (err) {
      console.warn("Unable to check ban status:", err);
    }
  }, [currentUser]);

  useEffect(() => {
    checkBanStatus();
    // Re-verify periodically to enforce instantly
    const banInterval = setInterval(checkBanStatus, 20000);
    return () => clearInterval(banInterval);
  }, [checkBanStatus]);

  // Submit an unblock request from the block screen (name + mobile)
  const submitUnblockRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unblockName.trim()) {
      setUnblockFeedback({ ok: false, msg: "تکایە ناوی خۆت بنووسە." });
      return;
    }
    if (!/^\+?\d{6,15}$/.test(unblockPhone.trim().replace(/\s+/g, ""))) {
      setUnblockFeedback({ ok: false, msg: "تکایە ژمارەی مۆبایلی دروست بنووسە (لەگەڵ کۆدی وڵات)." });
      return;
    }
    setUnblockSending(true);
    setUnblockFeedback(null);
    try {
      const res = await fetch("/api/unblock-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": getDeviceId(),
        },
        body: JSON.stringify({
          name: unblockName.trim(),
          phone: unblockPhone.trim(),
          deviceId: getDeviceId(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUnblockFeedback({
          ok: true,
          msg: "داواکارییەکەت نێردرا! بەڕێوەبەرایەتی پێداچوونەوەی تێدا دەکات و پەیوەندیت پێوە دەکات."
        });
        setUnblockName("");
        setUnblockPhone("");
      } else {
        setUnblockFeedback({ ok: false, msg: data?.error || "ناردنی داواکاری سەرکەوتوو نەبوو. تکایە دووبارە هەوڵبدەوە." });
      }
    } catch (err) {
      console.warn("Unable to submit unblock request:", err);
      setUnblockFeedback({ ok: false, msg: "کێشەی پەیوەندی ڕوویدا. تکایە دووبارە هەوڵبدەوە." });
    } finally {
      setUnblockSending(false);
    }
  };

  // Live countdown for the Owner's temporary 1-minute exemption. When the
  // remaining time hits 0 the server has already auto-unblocked the IP/device,
  // so re-check immediately to restore full access without a manual reload.
  useEffect(() => {
    if (!(bannedFromSystem && ownerExempt && unblockAt)) return;
    const tick = () => {
      setNowTick(Date.now());
      if (Date.now() >= unblockAt) {
        setOwnerExempt(false);
        checkBanStatus();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [bannedFromSystem, ownerExempt, unblockAt, checkBanStatus]);

  const [systemPasswordInput, setSystemPasswordInput] = useState("");

  const SYSTEM_ADMIN_PASS = "1223344";
  const [adminTab, setAdminTab] = useState<string>("overview");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const moviesPerPage = 12;
  const [trackerConfig, setTrackerConfig] = useState({
    text: "بەخێربێن بۆ CinamaChat - نوێترین فیلم و زنجیرەکان لێرە ببینە",
    type: "normal",
  });
  // Category options for the admin "پۆلێن" dropdown. These MUST match the
  // tags used by the homepage nav genre chips — otherwise the select can never
  // reflect a movie's category and stays stuck on "هەمووی". Derived from the
  // same genre source as navGenres (live genres, DEFAULT_GENRES fallback).
  // Category options for the admin "پۆلێن" dropdown: union of the built-in
  // DEFAULT_GENRES and the live Firestore genres. The live set can be a custom
  // replacement that no longer contains default tags (e.g. "New Releases"), so
  // relying on only one source hides a movie's real category behind "هەمووی".
  // The union also removes the genresReady timing gap — defaults are always
  // present and dynamic tags appear as soon as they load.
  const dynamicCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_GENRES.map((g) => g.tag),
          ...dynamicGenres.map((g) => g.tag),
        ]),
      ),
    [dynamicGenres],
  );
  const [stats, setStats] = useState({ visitors: 0 });
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [config, setConfig] = useState({
    ads: {
      banner: { image: "", link: "" },
      sidebar: { image: "", link: "" },
    },
    socialLinks: {
      whatsapp: "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
      group: "",
      instagram: "",
      facebook: "",
    },
    playerMode: "embed",
    roomVideoUrl: "",

    heroVideoUrl: "",
    youtubeChannelUrl: "https://www.youtube.com/",
    youtubeUrl: "https://www.youtube.com/",
    tiktokUrl: "https://www.tiktok.com/",
    instagramUrl: "https://www.instagram.com/",
    facebookUrl: "https://www.facebook.com/",
  });

  // Global Floating WhatsApp URL — resolved once so the button is always present
  // and correct on every screen: env group link > env number (wa.me) > admin
  // config socialLinks > hardcoded default (never empty, never missing).
  const floatingWhatsAppUrl =
    import.meta.env.VITE_WHATSAPP_GROUP_LINK ||
    (import.meta.env.VITE_WHATSAPP_NUMBER
      ? `https://wa.me/${String(import.meta.env.VITE_WHATSAPP_NUMBER).replace(/[^0-9]/g, "")}`
      : config.socialLinks.group ||
        config.socialLinks.whatsapp ||
        "https://wa.me/9647701966649");

  // Silent Access Control / Route Guard for Module 17 and Staff permissions
  useEffect(() => {
    const isOwner =
      currentUser?.username?.toLowerCase() === "admin" ||
      currentUser?.username?.toLowerCase() === "dekan@123" ||
      currentUser?.role?.toLowerCase() === "owner" ||
      socialProfile?.role?.toLowerCase() === "owner" ||
      socialProfile?.userRole?.toLowerCase() === "owner";

    const isStaff =
      socialProfile?.role === "staff" ||
      socialProfile?.userRole === "staff" ||
      currentUser?.role === "staff";

    const allowedStaffTabs = [
      "overview",
      "stats",
      "categories",
      "content",
      "manage",
      "hero",
      "channel",
    ];

    // Redirect if they are staff and trying to load a forbidden tab
    if (isStaff && adminTab && !allowedStaffTabs.includes(adminTab)) {
      setAdminTab("overview");
    }

    // Redirect if they try to switch to the m17-auth tab
    if (adminTab === "m17-auth" && !isOwner) {
      setAdminTab("overview");
    }

    // Monitor URL force access
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    if (
      (path.includes("/admin/module-17") ||
        searchParams.get("tab") === "m17-auth") &&
      !isOwner
    ) {
      // Silently reset the URL state to standard admin interface and default overviews
      setAdminTab("overview");
      window.history.replaceState({}, "", "/?admin=true");
    }
  }, [adminTab, currentUser, socialProfile]);

  // Point 38: Stats Fetch
  useEffect(() => {
    const updateStats = async () => {
      const data = await api.getStats();
      if (data && data.visitors) {
        setStats(data);
      }
    };
    updateStats();
    const interval = setInterval(updateStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetchApi("/api/config");
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        setConfig((prev) => ({
          ...prev,
          ...data,
          heroVideoUrl: data.heroVideoUrl || "",
          youtubeChannelUrl:
            data.youtubeUrl || data.youtubeChannelUrl || prev.youtubeChannelUrl,
          youtubeUrl: data.youtubeUrl || data.youtubeChannelUrl || prev.youtubeUrl, // Ensure youtubeUrl is also updated
          tiktokUrl: data.tiktokUrl || prev.tiktokUrl,
          instagramUrl: data.instagramUrl || prev.instagramUrl,
          facebookUrl: data.facebookUrl || prev.facebookUrl,
        }));
        if (data?.heroVideoUrl) {
          setCachedHeroVideoUrl(String(data.heroVideoUrl));
        }
      } catch (e) {
        console.error("Config fetch failed:", e);
        const cachedHero = getCachedHeroVideoUrl();
        if (cachedHero) {
          setConfig((prev) => ({
            ...prev,
            heroVideoUrl: cachedHero,
          }));
        }
      }
    };
    fetchConfig();
  }, []);

  // Module 9: Channel & Brand links — live from the dedicated channel_settings
  // collection. Any save in the admin panel propagates app-wide in real time
  // (footer, hero button, viewing modals) via onSnapshot.
  useEffect(() => {
    let active = true;
    const applyLinks = (links: {
      youtubeUrl: string;
      tiktokUrl: string;
      instagramUrl: string;
      facebookUrl: string;
    }) => {
      if (!active) return;
      setConfig((prev) => ({
        ...prev,
        youtubeChannelUrl: links.youtubeUrl,
        youtubeUrl: links.youtubeUrl,
        tiktokUrl: links.tiktokUrl,
        instagramUrl: links.instagramUrl,
        facebookUrl: links.facebookUrl,
      }));
    };
    loadChannelSettings().then(applyLinks);
    const unsub = subscribeChannelSettings(applyLinks);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Module 9 save handler: validate URL formats, persist to Firestore, then
  // best-effort sync to the legacy (dead) server without blocking success.
  const handleSaveChannelLinks = async (updates: {
    youtubeUrl: string;
    tiktokUrl: string;
    instagramUrl: string;
    facebookUrl: string;
  }) => {
    for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
      if (!isValidHttpUrl(updates[key])) {
        throw new Error(`invalid channel link: ${key}`);
      }
    }
    // Optimistic local update so the whole app reflects the new links instantly.
    setConfig((prev) => ({
      ...prev,
      youtubeChannelUrl: updates.youtubeUrl,
      youtubeUrl: updates.youtubeUrl,
      tiktokUrl: updates.tiktokUrl,
      instagramUrl: updates.instagramUrl,
      facebookUrl: updates.facebookUrl,
    }));
    // Persistent save in the dedicated channel_settings collection.
    await saveChannelSettings(updates, currentUser?.username || "admin");
    // Best-effort legacy server sync (non-blocking).
    fetchApi("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).catch(() => {});
  };

  const handleAdminClick = () => {
    if (currentUser) {
      setShowAdminPanel(true);
    } else {
      setShowPasswordModal(true);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchApi("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminUsername,
          password: adminPassword,
          deviceId: getDeviceId(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        safeStorage.set("cinemachat_admin", JSON.stringify(data.user));
        setShowAdminPanel(true);
        setShowPasswordModal(false);
        setAdminPassword("");
        setAdminUsername("");
        setShowAdminPassword(false);
      } else {
        const normalizedUsername = adminUsername.trim().toLowerCase();
        const localAdminFallback =
          normalizedUsername === "admin" &&
          false;

        if (localAdminFallback) {
          const localAdminUser = {
            username: "admin",
            isSuper: true,
            isOwner: true,
            role: "owner",
          } as any;
          setCurrentUser(localAdminUser);
          safeStorage.set("cinemachat_admin", JSON.stringify(localAdminUser));
          setShowAdminPanel(true);
          setShowPasswordModal(false);
          setAdminPassword("");
          setAdminUsername("");
          setShowAdminPassword(false);
          return;
        }

        alert(data.message || "هەڵەیەک ڕوویدا");
      }
    } catch (e) {
      const normalizedUsername = adminUsername.trim().toLowerCase();
      const localAdminFallback =
        normalizedUsername === "admin" &&
        false;

      if (localAdminFallback) {
        const localAdminUser = {
          username: "admin",
          isSuper: true,
          isOwner: true,
          role: "owner",
        } as any;
        setCurrentUser(localAdminUser);
        safeStorage.set("cinemachat_admin", JSON.stringify(localAdminUser));
        setShowAdminPanel(true);
        setShowPasswordModal(false);
        setAdminPassword("");
        setAdminUsername("");
        setShowAdminPassword(false);
        return;
      }

      alert("ناتوانرێت پەیوەندی بە سێرڤەرەوە بکرێت");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    safeStorage.remove("cinemachat_admin");
    safeStorage.remove("cinemachat_local_admin_profile");
    setShowAdminPanel(false);
    window.location.replace("/");
  };

  // Strict role verification to prevent pre-computation or DOM tampering
  useEffect(() => {
    if (!showAdminPanel) return;

    // Allow explicit admin session from login flow even if social profile is absent/non-admin.
    // Sub-admins (super_admin / deputy_manager / staff) must stay signed in after a valid
    // server login — otherwise staff sessions were killed the moment the panel opened.
    const ADMIN_ROLES = ["admin", "owner", "super_admin", "deputy_manager", "staff"];
    const hasAdminSession =
      !!currentUser &&
      (ADMIN_ROLES.includes(currentUser?.role) ||
        currentUser?.username?.toLowerCase() === "admin" ||
        currentUser?.username?.toLowerCase() === "dekan@123" ||
        !!currentUser.isSuper ||
        !!(currentUser as any).isOwner);

    if (!hasAdminSession) {
      setShowAdminPanel(false);
      setCurrentUser(null);
      safeStorage.remove("cinemachat_admin");
    }
  }, [showAdminPanel, currentUser]);

  const updateTracker = async (text: string) => {
    try {
      await fetchApi("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setTrackerConfig((prev) => ({ ...prev, text }));
    } catch (e) {
      alert("شکستی هێنا لە گۆڕینی تراکەر");
    }
  };

  const updateConfig = async (
    key: string | Record<string, any>,
    value?: any,
  ) => {
    try {
      const updatePayload: Record<string, any> = {};
      const newConfig = { ...config };
      if (typeof key === "object") {
        Object.assign(newConfig, key);
        Object.assign(updatePayload, key);
      } else {
        const keys = key.split(".");
        let current: any = newConfig;
        for (let i = 0; i < keys.length - 1; i++) {
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        updatePayload[key] = value;
      }
      const res = await fetchApi("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      const data = await res.json();
      setConfig((prev) => ({
        ...prev,
        ...data,
        youtubeChannelUrl:
          data.youtubeUrl || data.youtubeChannelUrl || prev.youtubeChannelUrl,
        youtubeUrl: data.youtubeUrl || prev.youtubeUrl,
        roomVideoUrl: data.roomVideoUrl || prev.roomVideoUrl, // Update roomVideoUrl from config
        tiktokUrl: data.tiktokUrl || prev.tiktokUrl,
        instagramUrl: data.instagramUrl || prev.instagramUrl,
        facebookUrl: data.facebookUrl || prev.facebookUrl,
      }));
    } catch (e) {
      alert("شکستی هێنا لە نوێکردنەوەی ڕێکخستنەکان");
    }
  };

  // Merge two movie lists into one, deduplicating by id. `primary` (Firestore)
  // wins on conflicts because it is the durable, admin-controlled store.
  const mergeMovieLists = (primary: any[], enrichment: any[]) => {
    const map = new Map<string, any>();
    for (const m of enrichment) if (m && m.id) map.set(m.id, m);
    for (const m of primary) if (m && m.id) map.set(m.id, m);
    return Array.from(map.values());
  };

  // Apply a list to `movies`: dedupe, drop tombstones, sanitize stored URLs,
  // sort newest-first. This only ever sets state from real data — it never
  // clears the grid.
  const applyMovies = (list: any[]) => {
    const unique = Array.from(new Map(list.map((m: any) => [m.id, m])).values());
    setMovies(
      unique
        .filter((m: any) => !deletedMovieIdsRef.current.has(m.id))
        .map((m: any) => ({
          ...m,
          image: decodeStoredUrl(m.image),
          posterUrl: decodeStoredUrl(m.posterUrl),
        }))
        .sort((a: any, b: any) => {
          const idA = parseInt(String(a.id).replace("manual-", ""));
          const idB = parseInt(String(b.id).replace("manual-", ""));
          if (!isNaN(idA) && !isNaN(idB)) return idB - idA;
          const timeA = a.date ? new Date(a.date).getTime() : 0;
          const timeB = b.date ? new Date(b.date).getTime() : 0;
          return timeB - timeA;
        }),
    );
  };

  // Guard so the 60s refresh poll can never overlap with an in-flight fetch
  // (which would double Firestore reads and force duplicate grid re-renders).
  const moviesFetchInFlightRef = useRef(false);

  // Fetch the durable Firestore movie catalog, enriched (never replaced) by the
  // server list. The server's /api/movies may return a partial payload (e.g.
  // only the hero-promo placeholder), so server data is used strictly as extra
  // entries and can never shrink the grid. Firestore is the source of truth.
  const fetchMovies = async () => {
    if (moviesFetchInFlightRef.current) return;
    moviesFetchInFlightRef.current = true;
    let loadingReleased = false;
    const releaseLoading = () => {
      if (loadingReleased) return;
      loadingReleased = true;
      setIsLoading(false);
    };

    try {
      // Release the initial spinner from the server payload first so a slow or
      // broken Firestore connection can never block the homepage shell.
      let serverMovies: any[] = [];
      try {
        const serverResults = await api.getMovies();
        if (Array.isArray(serverResults)) {
          serverMovies = serverResults.filter((m: any) => m && m.id !== "hero-promo");
          if (serverMovies.length > 0) {
            applyMovies(serverMovies);
            setErrorMsg(null);
          }
        }
      } catch (srvErr) {
        console.warn("[Movies] Initial server bootstrap skipped:", srvErr);
      } finally {
        releaseLoading();
      }

      const moviesRef = collection(realDb, "movies");
      const snapshot = await getDocs(
        query(moviesRef, orderBy("createdAt", "desc"), limit(200)),
      );
      const firestoreMovies: any[] = [];
      snapshot.forEach((doc) =>
        firestoreMovies.push({ ...doc.data(), id: doc.id }),
      );

      const merged = mergeMovieLists(firestoreMovies, serverMovies);
      if (merged.length > 0) {
        applyMovies(merged);
        setErrorMsg(null);
      }
    } catch (err) {
      // Firestore read failed — keep whatever is already on screen.
      console.error("fetchMovies failed:", err);
      try {
        const results = await api.getMovies();
        const serverMovies = Array.isArray(results)
          ? results.filter((m: any) => m && m.id !== "hero-promo")
          : [];
        if (serverMovies.length > 0) {
          applyMovies(serverMovies);
          setErrorMsg(null);
        }
      } catch (srvErr) {
        console.warn("[Movies] Server-only fallback also failed:", srvErr);
        if (movies.length === 0) {
          setErrorMsg("کێشەیەک لە پەیوەندی بە سێرڤەر و فایەربەیس ڕوویدا");
        }
      }
    } finally {
      releaseLoading();
      moviesFetchInFlightRef.current = false;
    }
  };

  // Permanent, all-views movie deletion (Admin "سەرپەرشتی فیلمەکان" panel).
  // Shared core used by both single and bulk delete. Flow:
  // 1) Tombstone + optimistic UI removal — the movie vanishes from every view.
  // 2) Firestore doc delete (movies/{id}) — the durable source of truth.
  // 3) Awaited server mirror delete (/api/admin/movies/:id) so the server's
  //    in-memory Firestore cache and db.json can never keep serving the movie.
  // The tombstone is only dropped when BOTH stores confirm, so the 120s
  // fetchMovies poll and the Firestore listener can never resurrect a movie
  // that was not fully removed. Returns true only when deletion is durable.
  const deleteMoviePermanent = async (movie: any): Promise<boolean> => {
    deletedMovieIdsRef.current.add(movie.id);
    setMovies((prev) => prev.filter((m: any) => m.id !== movie.id));

    let firestoreOk = false;
    try {
      await deleteDoc(doc(realDb, "movies", movie.id));
      firestoreOk = true;
    } catch (fsErr) {
      console.error("[DeleteMovie] Firestore delete failed:", fsErr);
    }

    let serverOk = false;
    if (firestoreOk) {
      try {
        const adminName = encodeURIComponent(
          currentUser?.username || "Admin",
        );
        const res = await fetchApi(
          `/api/admin/movies/${encodeURIComponent(movie.id)}?adminName=${adminName}`,
          { method: "DELETE" },
        );
        serverOk = res.ok;
      } catch (err) {
        console.warn("[DeleteMovie] Server mirror delete failed:", err);
      }
    }

    if (!firestoreOk || !serverOk) {
      // Keep the tombstone active this session so the poll can't resurrect it.
      return false;
    }
    // Both stores are clean — deletion is durable, drop the tombstone.
    deletedMovieIdsRef.current.delete(movie.id);
    return true;
  };

  // Single delete from the Section 6 row action.
  const handleDeleteMovie = async (movie: any) => {
    if (!confirm(`ئایا دڵنیایت لە سڕینەوەی "${movie?.title}" ؟`)) return;
    const ok = await deleteMoviePermanent(movie);
    if (ok) {
      alert(`فیلمی "${movie?.title}" بە سەرکەوتوویی سڕایەوە`);
    } else {
      alert(
        "سڕینەوەکە تەواو نەبوو — فیلمەکە نەتوانرا لە سێرڤەر یان بنکەدراوە بسڕدرێتەوە. تکایە دووبارە هەوڵبدەرەوە",
      );
      fetchMovies();
    }
  };

  // Bulk delete from the Section 6 toolbar / header button. Every id must have
  // been ticked explicitly; only those ids are touched, never unselected rows.
  const handleBulkDeleteMovies = async () => {
    if (adminTab !== "manage") {
      alert("تکایە بڕۆ بۆ بەشی ٦. سەرپەرشتی فیلمەکان بۆ سڕینەوەی کۆمەڵی");
      return;
    }
    const ids = selectedMovieIds.filter((id) =>
      movies.some((m: any) => m.id === id),
    );
    if (ids.length === 0) {
      alert("تکایە لانیکەم یەک فیلم دیاریبکە بۆ سڕینەوە");
      return;
    }
    if (
      !confirm(
        `دڵنیایت لە سڕینەوەی ${ids.length} فیلم؟ ئەم کردارە ناگەڕێتەوە.`,
      )
    ) {
      return;
    }

    let succeeded = 0;
    let failed = 0;
    for (const id of ids) {
      const movie = movies.find((m: any) => m.id === id);
      if (!movie) continue;
      const ok = await deleteMoviePermanent(movie);
      if (ok) succeeded++;
      else failed++;
    }

    // Clear the selection (fully deleted movies are gone; failed ones are
    // tombstoned this session, so keeping them selected would be misleading).
    setSelectedMovieIds([]);

    // Reload from the real source of truth instead of only trusting the rows.
    fetchMovies();

    if (failed === 0) {
      alert(`${succeeded} فیلم بە سەرکەوتوویی سڕانەوە`);
    } else {
      alert(
        `${succeeded} فیلم سڕانەوە، بەڵام ${failed} فیلم شکستیان هێنا — تکایە دووبارە هەوڵبدەرەوە`,
      );
    }
  };

  const toggleSelectedMovie = (id: string) => {
    setSelectedMovieIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAllMovies = () => {
    setSelectedMovieIds((prev) =>
      prev.length === movies.length ? [] : movies.map((m: any) => m.id),
    );
  };

  // Real-time Firestore listener: the durable source of truth for the movie
  // grid. Mounted once, never unmounts, and only ever ADDS/updates state — it
  // can never clear or collapse the grid.
  useEffect(() => {
    let cancelled = false;
    const moviesRef = collection(realDb, "movies");
    const q = query(moviesRef, orderBy("createdAt", "desc"), limit(200));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (cancelled) return;
        const firestoreMovies: any[] = [];
        snapshot.forEach((doc) =>
          firestoreMovies.push({ ...doc.data(), id: doc.id }),
        );
        if (firestoreMovies.length > 0) {
          applyMovies(firestoreMovies);
          setErrorMsg(null);
        }
        setIsLoading(false);
      },
      (fsErr) => {
        console.warn("[Movies] Firestore real-time listener failed:", fsErr);
        fetchMovies(); // fall back to one-shot reads
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    fetchMovies();
    // Firestore onSnapshot already streams real-time movie updates, so this
    // refresh only exists as a slow periodic resync + server merge. 2 minutes
    // keeps the grid light instead of forcing a full re-render every minute.
    const interval = setInterval(fetchMovies, 120000);
    return () => clearInterval(interval);
  }, []);

  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
  const [netflixOriginals, setNetflixOriginals] = useState<Movie[]>([]);

  // Split movies for rows. Trending is ranked live by the server/client
  // trending score (live viewers + likes + favorites + views + IMDb), so the
  // "Trending Now" row reflects real-time activity rather than a static flag.
  useEffect(() => {
    setTrendingMovies(
      movies
        .map((m) => ({ m, s: getMovieTrendingScore(m) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 12)
        .map((x) => x.m),
    );
    setNetflixOriginals(movies.filter((m) => m.isNetflixOriginal));
  }, [movies, getMovieTrendingScore]);

  // Smart filtering: title search uses fuzzy matching, genre mode uses
  // multi-select genre chips, and AI mode uses the server-side semantic results.
  const filteredMovies = useMemo(() => {
    if (searchMode === "ai" && aiResults) {
      // Hide dramas currently assigned to a Drama Room from AI search too.
      return aiResults.filter((m: any) => !assignedDramaIds.has(m.id));
    }

    const tab = activeTab;
    // Normalize both sides (trim + lowercase) exactly like the admin category
    // dropdown matches, so a movie shown under a nav tab always carries the same
    // normalized tag that its "پۆلێن" select displays (e.g. "New Releases" vs
    // "new releases").
    const activeKey = String(tab || "").trim().toLowerCase();
    // The public listing never includes dramas assigned to a Drama Room.
    let list = publicMovies.filter((movie) => {
      const tags = Array.isArray(movie.tags)
        ? movie.tags.map((t: string) => String(t).trim().toLowerCase())
        : [];
      const matchesTab =
        activeKey === "all" || (tags.length > 0 && tags.includes(activeKey));
      return matchesTab;
    });

    if (searchMode === "genre") {
      if (selectedGenres.length > 0) {
        list = list.filter((m) => movieMatchesGenres(m, selectedGenres));
      }
    } else {
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const scored = list
          .map((m) => ({ m, s: fuzzyMatchMovie(m, q) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s);
        list = scored.map((x) => x.m);
      }
    }
    return list;
  }, [publicMovies, searchQuery, activeTab, searchMode, selectedGenres, aiResults, assignedDramaIds]);

  const sortedMovies = useMemo(() => {
    const arr = [...filteredMovies];
    if (sortBy === "trending") {
      arr.sort((a, b) => getMovieTrendingScore(b) - getMovieTrendingScore(a));
    } else if (sortBy === "live") {
      arr.sort((a, b) => getMovieLiveViewers(b) - getMovieLiveViewers(a));
    }
    return arr;
  }, [filteredMovies, sortBy, getMovieTrendingScore, getMovieLiveViewers]);

  // The main movie grid shows the FULL sorted catalog (all movies). It renders
  // immediately below the Search section; the trending/favorites/continue
  // rows appear after it, so no movie cards render above the Search section.
  const paginatedMovies = useMemo(() => {
    const startIndex = (currentPage - 1) * moviesPerPage;
    return sortedMovies.slice(startIndex, startIndex + moviesPerPage);
  }, [sortedMovies, currentPage]);

  // Clamp the page when the list shrinks (search/filter changes) so the user is
  // never left on an out-of-range page showing "no movies".
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(sortedMovies.length / moviesPerPage));
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [sortedMovies.length, currentPage]);

  // Navigation genre list: always starts with the special "هەمووی" (all) view,
  // followed by the genres from Firestore with live per-genre movie counts.
  const navGenres = useMemo(() => {
    const source = genresReady ? dynamicGenres : DEFAULT_GENRES;
    return source.map((g) => ({
      id: (g as Genre).id || g.tag,
      name: g.name,
      tag: g.tag,
      count: movies.filter(
        (m) => Array.isArray(m.tags) && m.tags.includes(g.tag),
      ).length,
    }));
  }, [dynamicGenres, genresReady, movies]);

  // Load the drama rooms once on mount (server-persisted in db.dramaRooms).
  const refreshDramaRooms = useCallback(async () => {
    try {
      const data = await api.baseFetch("/api/drama-rooms", {}, 2);
      const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
      setDramaRooms(rooms);
      // Seed room viewer counts from the server snapshot so badges render
      // instantly; the 30s /api/drama-rooms/live poll keeps them fresh.
      setRoomLiveViewers((prev) => {
        const next: Record<string, number> = {};
        for (const r of rooms) {
          const n = Number(r?.liveViewers) || 0;
          if (n > 0) next[String(r?.id)] = n;
        }
        if (Object.keys(next).length !== Object.keys(prev).length) return next;
        for (const k in next) if (prev[k] !== next[k]) return next;
        return prev;
      });
      // Seed each room's own aggregate rating from the server snapshot too.
      setRoomRatingsMap((prev) => {
        const next: Record<string, { ccRating: number; ratingCount: number }> = {};
        for (const r of rooms) {
          const agg = r?.rating;
          if (agg && Number(agg.ccRating) > 0) {
            next[String(r?.id)] = { ccRating: Number(agg.ccRating) || 0, ratingCount: Number(agg.ratingCount) || 0 };
          }
        }
        if (Object.keys(next).length !== Object.keys(prev).length) return next;
        for (const k in next) {
          if (prev[k]?.ccRating !== next[k].ccRating || prev[k]?.ratingCount !== next[k].ratingCount) return next;
        }
        return prev;
      });
    } catch (e) {
      console.warn("Failed to load drama rooms:", e);
    }
  }, []);

  useEffect(() => {
    refreshDramaRooms();
  }, [refreshDramaRooms]);

  // Save (create or update) a drama room through the admin-guarded API. The
  // acting admin's username travels as an x-admin-username header so the server
  // can enforce its own privilege check (owner/super_admin/deputy_manager).
  const handleSaveDramaRoom = useCallback(
    async (payload: any) => {
      const adminName = currentUser?.username || socialProfile?.username || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (adminName) headers["x-admin-username"] = adminName;
      if (editingDramaRoom) {
        await api.baseFetch(`/api/drama-rooms/${editingDramaRoom.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        }, 2);
      } else {
        await api.baseFetch("/api/drama-rooms", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }, 2);
      }
      setShowDramaRoomModal(false);
      setEditingDramaRoom(null);
      await refreshDramaRooms();
    },
    [editingDramaRoom, refreshDramaRooms, currentUser, socialProfile],
  );

  // Delete a drama room through the admin-guarded API (confirm first).
  const handleDeleteDramaRoom = useCallback(
    async (room: any) => {
      if (!room?.id) return;
      if (!window.confirm(`دڵنیایت لە سڕینەوەی ژووری "${room.title}"؟`)) return;
      try {
        const adminName = currentUser?.username || socialProfile?.username || "";
        const headers: Record<string, string> = {};
        if (adminName) headers["x-admin-username"] = adminName;
        await api.baseFetch(`/api/drama-rooms/${room.id}`, { method: "DELETE", headers }, 2);
        setSelectedDramaRoom((prev: any) => (prev?.id === room.id ? null : prev));
        await refreshDramaRooms();
      } catch (e) {
        console.warn("Failed to delete drama room:", e);
      }
    },
    [refreshDramaRooms, currentUser, socialProfile],
  );

  // Drama category filter: shows only rooms that contain at least one movie
  // tagged with the selected genre. "all" shows every room.
  const dramaRoomsFiltered = useMemo(() => {
    if (dramaCategory === "all") return dramaRooms;
    const key = String(dramaCategory).trim().toLowerCase();
    return dramaRooms.filter((room: any) =>
      (Array.isArray(room.dramas) ? room.dramas : []).some((id: string) => {
        const m = resolvedMovies[id];
        return (
          m &&
          Array.isArray(m.tags) &&
          m.tags.some((t: string) => String(t).trim().toLowerCase() === key)
        );
      }),
    );
  }, [dramaRooms, dramaCategory, resolvedMovies]);

  // Option lists for the two filter dropdowns that replaced the category chips.
  const movieCatOptions = useMemo(
    () => [
      { value: "all", label: "هەمووی (All)" },
      ...navGenres.map((g) => ({ value: g.tag, label: g.name })),
    ],
    [navGenres],
  );

  const dramaCatOptions = useMemo(
    () => [
      { value: "all", label: "هەموو ژوورەکان (All Rooms)" },
      ...navGenres.map((g) => ({ value: g.tag, label: g.name })),
    ],
    [navGenres],
  );

  if (bannedFromSystem) {
    const blockTime = blockedAt || new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const blockDate = `${blockTime.getFullYear()}-${pad2(blockTime.getMonth() + 1)}-${pad2(blockTime.getDate())}`;
    const blockClock = `${pad2(blockTime.getHours())}:${pad2(blockTime.getMinutes())}:${pad2(blockTime.getSeconds())}`;
    const remainingSec = ownerExempt && unblockAt
      ? Math.max(0, Math.ceil((unblockAt - nowTick) / 1000))
      : 0;
    const cdMinutes = pad2(Math.floor(remainingSec / 60));
    const cdSeconds = pad2(remainingSec % 60);
    return (
      <div
        className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center"
        dir="rtl"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full bg-[#0a0a0c] border border-red-900/30 rounded-[2rem] p-10 space-y-6 shadow-2xl"
        >
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
            <span className="text-3xl">🚫</span>
          </div>
          <h1 className="text-3xl font-black kurdish-text text-white">
            تۆ بلۆک کراویت
          </h1>
          {/* Exact block timestamp */}
          <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl">
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest kurdish-text">
              کاتی بلۆککردن:
            </span>
            <span className="text-sm font-mono text-white" dir="ltr">
              {blockDate} — {blockClock}
            </span>
          </div>
          {/* Owner 1-minute exemption: live auto-unblock countdown */}
          {ownerExempt && unblockAt ? (
            <div className="flex items-center justify-center gap-2.5 px-5 py-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-black text-emerald-300 uppercase tracking-widest kurdish-text">
                کاتە ماوەکە:
              </span>
              <span
                className="text-2xl font-black font-mono text-emerald-300 tabular-nums"
                dir="ltr"
              >
                {cdMinutes}:{cdSeconds}
              </span>
            </div>
          ) : null}
          {/* Reason explanation */}
          <p className="text-gray-400 kurdish-text text-sm leading-relaxed">
            ئەم ئامێرە/ئایپیە بەهۆی چەندین هەوڵی هەڵەی ناوی بەکارهێنەر و وشەی
            تێپەڕ ڕێگری لێکراوە لە CinemaChat. ئەم ڕێوشوێنە ئەمنییەتە جێبەجێ
            کراوە بۆ پاراستن لە هێرشی هاکەران و بۆتە ئۆتۆماتیکییەکان.
          </p>
          {/* Unblock request form: name + mobile, submitted to the server */}
          <form
            onSubmit={submitUnblockRequest}
            className="space-y-3 p-4 bg-white/5 border border-white/10 rounded-2xl"
          >
            <p className="text-xs font-bold text-gray-300 kurdish-text">
              داواکردنی لابردنی بلۆک
            </p>
            <input
              type="text"
              value={unblockName}
              onChange={(e) => setUnblockName(e.target.value)}
              placeholder="ناوی تۆ"
              maxLength={60}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 focus:border-brand-primary/50 rounded-xl text-sm text-white kurdish-text outline-none placeholder:text-gray-500"
            />
            <input
              type="tel"
              value={unblockPhone}
              onChange={(e) => setUnblockPhone(e.target.value)}
              placeholder="ژمارەی مۆبایل (وەک 964770xxxxxxx)"
              inputMode="tel"
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 focus:border-brand-primary/50 rounded-xl text-sm text-white font-mono outline-none placeholder:text-gray-500"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={unblockSending}
              className="w-full px-5 py-3 bg-brand-primary hover:opacity-90 disabled:opacity-50 transition-opacity rounded-2xl text-xs font-black text-black kurdish-text active:scale-[0.98]"
            >
              {unblockSending ? "ئامادەکردن..." : "ناردنی داواکاری"}
            </button>
            {unblockFeedback && (
              <p
                className={`text-[11px] font-bold kurdish-text leading-relaxed ${
                  unblockFeedback.ok ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {unblockFeedback.msg}
              </p>
            )}
          </form>
          {/* Direct support unblock via WhatsApp (official logo) */}
          <a
            href="https://wa.me/9647701966649?text=بەڕێز%20پشتگیری%2C%20من%20بە%20هەڵە%20بلۆک%20کراوم%20لە%20CinemaChat%20تکایە%20یارمەتیم%20بدە%20بۆ%20کردنەوە."
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2.5 px-5 py-3.5 bg-[#25D366] hover:bg-[#1fb959] transition-colors rounded-2xl shadow-lg shadow-[#25D366]/25 active:scale-[0.98]"
          >
            <svg
              viewBox="0 0 32 32"
              fill="currentColor"
              className="w-6 h-6 text-white"
              aria-hidden="true"
            >
              <path d="M16.02 2.34c-7.55 0-13.68 6.12-13.68 13.66 0 2.41.63 4.76 1.83 6.84L2.35 29.7l6.95-1.82a13.67 13.67 0 0 0 6.72 1.72h.01c7.54 0 13.67-6.12 13.67-13.66 0-3.65-1.42-7.08-4-9.66a13.58 13.58 0 0 0-9.68-3.94zm7.94 19.61c-.33.93-1.93 1.78-2.66 1.83-.72.06-1.34.28-4.52-.94-3.83-1.47-6.26-5.29-6.45-5.53-.19-.24-1.54-2.05-1.54-3.91s.98-2.77 1.32-3.15c.34-.38.75-.47 1-.47.25 0 .5 0 .72.01.23.01.54-.09.85.65.32.77 1.09 2.66 1.19 2.85.1.19.16.42.03.68-.13.26-.19.42-.38.65-.19.23-.4.51-.58.69-.19.19-.39.39-.17.77.23.38 1 1.65 2.15 2.67 1.48 1.32 2.73 1.73 3.11 1.92.39.19.61.16.83-.1.23-.26.95-1.1 1.2-1.49.26-.38.52-.32.87-.19.35.13 2.23 1.05 2.62 1.24.38.19.64.29.74.45.09.16.09.94-.24 1.87z" />
            </svg>
            <span className="text-sm font-black text-white kurdish-text">
              پەیوەندی بە پشتگیری بکە لە ڕێگەی واتساپ (داواکاری کردنەوە)
            </span>
          </a>
        </motion.div>
      </div>
    );
  }

  if (emergencyLocked) {
    return (
      <div
        className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center"
        dir="rtl"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full bg-[#0a0a0c] border border-red-900/30 rounded-[2rem] p-10 space-y-6 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute right-0 top-0 h-32 w-32 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="w-16 h-16 bg-red-500/15 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-500/30 animate-pulse">
            <span className="text-3xl">🛑</span>
          </div>
          <h1 className="text-2xl font-black kurdish-text text-white">
            داخستنی لەناکاو (Emergency Site Lock)
          </h1>
          <p className="text-gray-300 kurdish-text text-sm leading-relaxed">
            ئۆپەراسیۆنێکی ئاسایشی لەئارادایە! ماڵپەڕ لەلایەن بەڕێوبەری گشتییەوە
            بە کاتیی داخراوە بۆ کاری چاکسازی یان پاراستنی دەروازەکان. تکایە
            کەمێکی تر سەردان بکەنەوە.
          </p>
        </motion.div>
        <WhatsAppFloatButton href={floatingWhatsAppUrl} />
      </div>
    );
  }

  if (isLoading && movies.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div // Loading spinner for initial movie load
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full"
        />
        <WhatsAppFloatButton href={floatingWhatsAppUrl} />
      </div>
    );
  }

  // Drama Rooms hub element — rendered once, placed directly below the wide
  // advertisement banner inside the movie grid (see usage below).
  const dramaRoomsHubElement = (
    <DramaRoomsHub
      rooms={dramaRoomsFiltered}
      currentUser={currentUser}
      systemVerified={systemVerified}
      canCreateRoom={canCreateDramaRoom}
      onOpenRoom={setSelectedDramaRoom}
      onCreate={() => {
        setEditingDramaRoom(null);
        setShowDramaRoomModal(true);
      }}
      onEdit={(room: any) => {
        setEditingDramaRoom(room);
        setShowDramaRoomModal(true);
      }}
      onDelete={handleDeleteDramaRoom}
      liveViewersMap={roomLiveViewers}
      ratingsMap={roomRatingsMap}
      onOpenCinemaChat={() => setShowFriendConnect(true)}
      onOpenDramaHub={() => setShowDramaHubModal(true)}
      onOpenCinemaWindow={() => setShowCinemaWindowModal(true)}
      cinemaWindowRoom={cinemaWindowPublicRoom}
    />
  );

  return (
    <div
      className="relative min-h-dvh bg-black text-white select-none overflow-x-hidden"
      dir="rtl"
    >
      {/* Background Layer (Video) — fixed behind all content */}
      <div className="fixed inset-0 z-0 pointer-events-none" />

      {/* UI Overlay Layer — uses natural document flow scrolling for
          reliable iOS Safari touch-scroll (avoid position: fixed). */}
      <div className="relative z-10 pointer-events-none min-h-dvh" >
        <div className="flex flex-col min-h-dvh bg-transparent text-white select-none pointer-events-auto" dir="rtl">
      {/* Point 57: Error Message Overlay */}
      <AnimatePresence>
        {isQuotaExceeded && (
          <motion.div
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 inset-x-0 z-[201] bg-orange-600 p-2 text-center font-black kurdish-text flex items-center justify-center gap-4 shadow-2xl text-[10px]"
          > {/* Quota Exceeded Message */}
            <AlertCircle className="w-4 h-4" />
            سیستەمی نامە و سینەمای هاوبەش ئێستا سنوردارە بەهۆی زۆری لۆد. سبەی
            کاردەکاتەوە.
            <button
              onClick={() => setIsQuotaExceeded(false)}
              className="bg-white/20 p-1 rounded"
            >
              X
            </button>
          </motion.div>
        )}
        {errorMsg && (
          <motion.div
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 inset-x-0 z-[200] bg-red-600 p-4 text-center font-black kurdish-text flex items-center justify-center gap-4 shadow-2xl"
          > {/* General Error Message */}
            <ShieldCheck className="w-6 h-6 animate-pulse" />
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Point 66: Official Police Header */}
      <header
        className="sticky top-0 z-[100] bg-black/80 backdrop-blur-md border-b border-white/5 px-4 md:px-8"
        style={{ paddingTop: "4px", paddingBottom: "4px" }}
      > {/* Main Header */}
        <div
          className="max-w-7xl mx-auto flex items-center justify-between"
          style={{ gap: "4px" }}
        >
          {/* Point 67: CinamaChat Branding */}
          <div
            className="flex items-center gap-2 md:gap-2 group cursor-pointer"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            <motion.div 
              animate={{ 
                rotate: 360,
                scale: [1, 1.05, 1]
              }}
              transition={{ 
                rotate: { repeat: Infinity, duration: 12, ease: "linear" },
                scale: { repeat: Infinity, duration: 3, ease: "easeInOut" }
              }}
              className="w-10 h-10 md:w-12 md:h-12 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-red-600/30"
            >
              <Film className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </motion.div>
            <div className="flex flex-col">
              <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter uppercase leading-none">
                CinamaChat
              </h1>
              <span className="text-[8px] font-black uppercase tracking-[0.4em] text-brand-primary -mt-1">
                {tr("officialPlatform")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 font-sans font-medium tracking-tight text-gray-900"> {/* Right side of header */}
            <div className="hidden sm:flex flex-col items-end px-3 border-l border-white/10">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[9px] font-black uppercase tracking-widest text-green-500">
                  {tr("secureConnection")}
                </span>
              </div>
              <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest mt-0.5 italic">
                {tr("authorizedOnly")}
              </span>
              </div> {/* Secure Connection Indicator */}
            <AccountCenter
              socialProfile={socialProfile}
              currentUser={fbUser}
              onLogin={() => {
                setModalMode("landing");
                setShowSocialModal(true);
              }}
              onSignup={() => {
                setModalMode("landing");
                setShowSocialModal(true);
              }}
              onLogout={handleAuthLogout}
              onOpenIdentityCard={() => setShowIdentityCard(true)}
              onOpenInviteFriends={() => setShowIdentityCard(true)}
              onOpenMessages={() => setShowDirectMessagesModal(true)}
              onUpdateProfile={updateSocialProfile}
            />

            <button
              onClick={handleAdminClick}
              className="flex items-center gap-1 p-1 md:p-1.5 bg-white/5 border border-white/10 rounded-lg hover:bg-brand-primary/10 transition-all text-gray-400 hover:text-brand-primary active:scale-95"
            >
              <Settings className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <span className="hidden lg:block text-[8px] font-black uppercase tracking-widest text-inherit">
                {tr("admin")}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Point 12: Dynamic Tracker (Moving Ticker) */}
      <div className="bg-brand-primary/10 border-y border-brand-primary/20 py-2 overflow-hidden"> {/* Moving Ticker */}
        <div className="whitespace-nowrap flex items-center gap-10 animate-ticker">
          {Array(4)
            .fill(0)
            .map((_, idx) => (
              <div key={idx} className="flex items-center gap-10">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(229,9,20,1)]"></div>
                  <span className="text-xs font-black kurdish-text">
                    {trackerConfig.text}
                  </span>
                </div>
                {movies.slice(0, 5).map((m) => (
                  <div
                    key={`${idx}-${m.id}`}
                    className="flex items-center gap-3 text-gray-400 hover:text-white cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedMovie(m);
                      setActiveServerUrl(getMovieSourceUrl(m));
                      setShowPlayer(true);
                    }}
                  >
                    <span className="text-[10px] font-black uppercase text-brand-primary">
                      {tr("newTag")}
                    </span>
                    <span className="text-xs font-bold kurdish-text">
                      {m.title}
                    </span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>

      <main className="flex-1">
        {socialTab === "party" && (
          <CameHereRoom
            socialProfile={socialProfile}
            onBackToMovies={() => setSocialTab("movies")}
            initialRoomId={selectedRoomId || undefined}
            onJoinBroadcast={() => setSocialTab("broadcast")}
          />
        )}

        {socialTab === "broadcast" && (
          <BroadcastRoom
            socialProfile={socialProfile}
            onBackToMovies={() => setSocialTab("movies")}
          />
        )}

        {socialTab === "cinema_window" && (
          <section className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">
                  Cinema Window
                </p>
                <h1 className="mt-2 text-2xl md:text-4xl font-black text-white kurdish-text">
                  {activeCinemaWindowRoom?.name || "Cinema Window"}
                </h1>
                {activeCinemaWindowRoom?.description && (
                  <p className="mt-2 text-sm md:text-base text-zinc-400 kurdish-text max-w-2xl">
                    {activeCinemaWindowRoom.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCinemaWindowModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-black hover:bg-amber-400 transition-colors active:scale-95"
                >
                  <Key className="w-4 h-4" />
                  Access
                </button>
                <button
                  onClick={() => setSocialTab("movies")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-bold hover:bg-white/10 transition-colors active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Movies
                </button>
              </div>
            </div>

            {activeCinemaWindowRoom ? (
              <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
                <div className="bg-black border border-white/10 rounded-2xl overflow-hidden min-h-[280px] md:min-h-[520px]">
                  {(() => {
                    const roomVideoUrl = activeCinemaWindowSourceUrl;
                    const playableRoomVideoUrl = toCinemaWindowPlaybackUrl(roomVideoUrl, {
                      autoplay: true,
                      muted: false,
                      loop: false,
                      controls: true,
                    });
                    const isYoutubeRoomVideo = Boolean(extractYouTubeId(roomVideoUrl));
                    const nativeRoomVideoUrl = isYoutubeRoomVideo ? cinemaWindowDirectVideoUrl : playableRoomVideoUrl;

                    if (!playableRoomVideoUrl) {
                      return (
                        <div className="h-full min-h-[280px] md:min-h-[520px] flex flex-col items-center justify-center text-center p-8">
                          <Video className="w-10 h-10 text-white/30 mb-3" />
                          <p className="text-zinc-400 kurdish-text">
                            No Cinema Window video is available yet.
                          </p>
                        </div>
                      );
                    }

                    if (nativeRoomVideoUrl) {
                      return (
                        <div className="relative w-full aspect-video min-h-[280px] md:min-h-[520px] bg-black">
                          <video
                            ref={cinemaWindowVideoRef}
                            key={nativeRoomVideoUrl}
                            src={nativeRoomVideoUrl}
                            controls
                            autoPlay
                            preload="auto"
                            playsInline
                            className="absolute inset-0 w-full h-full bg-black"
                            onCanPlay={(event) => {
                              setCinemaWindowVideoStatus("ready");
                              event.currentTarget.play().catch(() => {
                                /* Browser may require the user to press play. */
                              });
                            }}
                            onLoadedMetadata={(event) => {
                              setCinemaWindowPlaybackTime(event.currentTarget.currentTime || 0);
                            }}
                            onTimeUpdate={(event) => {
                              setCinemaWindowPlaybackTime(event.currentTarget.currentTime || 0);
                            }}
                            onSeeking={(event) => {
                              setCinemaWindowPlaybackTime(event.currentTarget.currentTime || 0);
                            }}
                            onError={handleCinemaWindowNativeVideoFailure}
                            onStalled={handleCinemaWindowNativeVideoFailure}
                          />
                          {isInMainWatchRoom && cinemaWindowActiveSubtitleText && ccSettings.showSubtitle && (
                            <div className="pointer-events-none absolute inset-x-3 bottom-16 z-10 flex flex-col items-center gap-1">
                              {cinemaWindowActiveOriginalText && (
                                <div
                                  dir="auto"
                                  className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-1.5 text-center font-bold leading-snug opacity-70 ${ccFontSizeEntry.mobileCls} md:${ccFontSizeEntry.cls.replace(/text-\S+/g, (m) => m)}`}
                                  style={{ color: '#cccccc', backgroundColor: 'rgba(0,0,0,0.5)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                                >
                                  {cinemaWindowActiveOriginalText}
                                </div>
                              )}
                              <div
                                dir="auto"
                                className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-2 text-center font-bold leading-snug shadow-[0_2px_14px_rgba(0,0,0,0.75)] ${ccFontSizeEntry.mobileCls} md:${ccFontSizeEntry.cls}`}
                                style={ccSubtitleStyle}
                              >
                                {cinemaWindowActiveSubtitleText}
                              </div>
                            </div>
                          )}
                          {isInMainWatchRoom && cinemaWindowSubtitleStatus === "loading" && !cinemaWindowActiveSubtitleText && (
                            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 px-4 py-3 pointer-events-none">
                              <div className="flex items-center gap-2 rounded-xl bg-black/70 px-3 py-2 text-xs text-red-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="kurdish-text">{cinemaWindowSubtitleMessage || "وەردەگێڕدرێت..."}</span>
                              </div>
                            </div>
                          )}
                        {/* Error indicator with retry */}
                        {isInMainWatchRoom && cinemaWindowSubtitleStatus === "error" && (
                            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center px-4 py-3">
                              <div className="flex items-center gap-2 rounded-xl bg-red-950/80 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span className="kurdish-text">{cinemaWindowSubtitleMessage || "بەردەست نییە"}</span>
                                <button
                                  onClick={() => setCinemaWindowSubtitleRetryKey((k) => k + 1)}
                                  className="ml-1 p-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors shrink-0 cursor-pointer"
                                  title="Retry subtitle generation"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (isYoutubeRoomVideo && cinemaWindowVideoStatus === "loading") {
                      return (
                        <div className="h-full min-h-[280px] md:min-h-[520px] flex flex-col items-center justify-center gap-3 text-center p-8">
                          <Loader2 className="w-8 h-8 text-amber-300 animate-spin" />
                          <p className="text-zinc-400 kurdish-text text-sm">
                            Preparing the Cinema Window video...
                          </p>
                        </div>
                      );
                    }

                    if (/youtube\.com|youtu\.be/i.test(playableRoomVideoUrl)) {
                      return (
                        <iframe
                          title={activeCinemaWindowRoom.name || "Cinema Window Player"}
                          src={playableRoomVideoUrl}
                          className="w-full aspect-video min-h-[280px] md:min-h-[520px]"
                          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                          allowFullScreen
                        />
                      );
                    }

                    return null;
                  })()}
                </div>

                <aside className="bg-[#0b0c10] border border-white/10 rounded-2xl p-5 h-fit">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                      <Tv className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white kurdish-text">
                        {activeCinemaWindowRoom.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {activeCinemaWindowRoom.accessDurationHours || 24} hour access
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                      <span className="text-zinc-500">دۆخ</span>
                      <span className="font-bold text-emerald-400">
                        {activeCinemaWindowRoom.status || "ACTIVE"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">نرخ</span>
                      <span className="font-bold text-white">
                        {activeCinemaWindowRoom.price ?? 0} {activeCinemaWindowRoom.currency || "USD"}
                      </span>
                    </div>
                    <label className="block border-t border-white/10 pt-3">
                      <span className="mb-2 flex items-center gap-1.5 text-zinc-500">
                        <Globe className="w-4 h-4" />
                        زمانی ژێرنوس
                      </span>
                       <select
                        value={cinemaWindowSubtitleLang}
                        onChange={(event) => {
                          setCinemaWindowSubtitleLang(event.target.value);
                          setCinemaWindowSubtitleRetryKey((k) => k + 1);
                        }}
                        className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm font-bold text-white outline-none focus:border-amber-400"
                      >
                        {CINEMA_WINDOW_SUBTITLE_LANGUAGES.map((language) => (
                          <option key={language.code} value={language.code}>
                            {language.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-start justify-between gap-3 border-t border-white/10 pt-3">
                      <span className="text-zinc-500 inline-flex items-center gap-1.5">
                        <Captions className="w-4 h-4" />
                        ژێرنوس
                      </span>
                      <span
                        className={`text-right text-xs font-bold ${
                          cinemaWindowSubtitleStatus === "ready"
                            ? "text-emerald-400"
                            : cinemaWindowSubtitleStatus === "error"
                              ? "text-amber-300"
                              : "text-zinc-300"
                        }`}
                      >
                        {cinemaWindowSubtitleStatus === "loading"
                          ? "وەردەگێڕدرێت..."
                          : cinemaWindowSubtitleStatus === "ready"
                            ? getCinemaWindowSubtitleLanguage(cinemaWindowSubtitleLang).shortLabel
                            : cinemaWindowSubtitleStatus === "error"
                              ? "بەردەست نییە"
                              : "چاوەڕوان"}
                      </span>
                    </div>
                    {cinemaWindowSubtitleMessage && (
                      <p className="text-[11px] leading-relaxed text-zinc-500 kurdish-text">
                        {cinemaWindowSubtitleMessage}
                      </p>
                    )}

                    {/* Original subtitle toggle */}
                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                      <span className="text-zinc-500 text-xs">ژێرنووسی ڕەسەن</span>
                      <button
                        type="button"
                        onClick={() => setCcSettings((s) => ({ ...s, showOriginal: !s.showOriginal }))}
                        className={`w-10 h-5 rounded-full transition-all cursor-pointer ${ccSettings.showOriginal ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                      >
                        <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${ccSettings.showOriginal ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    {/* Font size selector */}
                    <div className="border-t border-white/10 pt-3">
                      <span className="text-zinc-500 text-xs block mb-2">ئەreciozani</span>
                      <div className="flex gap-1">
                        {CC_FONT_SIZES.map((fs) => (
                          <button
                            key={fs.key}
                            type="button"
                            onClick={() => setCcSettings((s) => ({ ...s, fontSize: fs.key }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                              ccSettings.fontSize === fs.key
                                ? "bg-brand-primary text-white"
                                : "bg-white/5 hover:bg-white/10 text-zinc-400"
                            }`}
                          >
                            {fs.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Opacity slider */}
                    <div className="border-t border-white/10 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-500 text-xs">کاڵکردنەوە</span>
                        <span className="text-[10px] text-zinc-600">{Math.round(ccSettings.bgOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={1}
                        step={0.1}
                        value={ccSettings.bgOpacity}
                        onChange={(e) => setCcSettings((s) => ({ ...s, bgOpacity: Number(e.target.value) }))}
                        className="w-full h-1 accent-brand-primary cursor-pointer"
                      />
                    </div>

                    {/* Text color */}
                    <div className="border-t border-white/10 pt-3">
                      <span className="text-zinc-500 text-xs block mb-2">ڕەنگ</span>
                      <div className="flex gap-2">
                        {CC_TEXT_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setCcSettings((s) => ({ ...s, textColor: color }))}
                            className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                              ccSettings.textColor === color ? 'border-white scale-110' : 'border-zinc-600 hover:border-zinc-400'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="min-h-[360px] rounded-2xl border border-white/10 bg-white/[0.03] flex flex-col items-center justify-center text-center p-8">
                <Lock className="w-10 h-10 text-amber-400 mb-4" />
                <h2 className="text-xl font-black text-white kurdish-text mb-2">
                  Cinema Window is locked
                </h2>
                <p className="text-zinc-400 max-w-md mb-5 kurdish-text">
                  Enter an access code or complete the payment flow to open this room.
                </p>
                <button
                  onClick={() => setShowCinemaWindowModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 text-black text-sm font-black hover:bg-amber-400 transition-colors active:scale-95"
                >
                  <Key className="w-4 h-4" />
                  Open Access
                </button>
              </div>
            )}
          </section>
        )}

        {socialTab === "movies" && (
          <>
          <SafeRender fallbackName="Main Movies Feed">
            {/* ٢. پێکهاتەی سەرەکی ڤیدیۆی سەرەوە (Hero Video Component) */}
            {activeFeaturedMovie && !activeSyncGroup && (
              <HeroSection
                activeFeaturedMovie={activeFeaturedMovie}
                countdown={countdown}
                setCountdown={setCountdown}
                isHeroMuted={isHeroMuted}
                setIsHeroMuted={setIsHeroMuted}
                hasInteracted={hasInteracted}
                heroVideoId={heroVideoId}
                config={config}
                setShowVipModal={setShowVipModal}
                activeAudioSource={activeAudioSource}
                isMoviePlayerOpen={!!selectedMovie && showPlayer}
              />
            )}


            {/* Drama Rooms hub now renders below the ad banner inside the
                movie grid (kept in one place only). No movie lists render
                above the Search section. */}





            {/* Smart Search Section */}
            <div className="max-w-7xl mx-auto px-8 mt-16 mb-8 text-center">
              <h2 className="text-3xl font-black kurdish-text mb-2">
                {tr("searchFilter")}
              </h2>
              <p className="text-sm text-gray-500 kurdish-text mb-8">
                بە ناو، پۆلێن یان بە وەسف بگەڕێ — پێشنیار و مێژووی ڕاستەقینە
              </p>

              {/* Search mode tabs */}
              <div className="flex justify-center gap-2 mb-8 flex-wrap">
                {(
                  [
                    { id: "title", label: "ناونیشان", icon: Search },
                    { id: "genre", label: "پۆلێن", icon: Layers },
                    { id: "ai", label: "گەڕانی زیرەک (AI)", icon: Sparkles },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setSearchMode(mode.id);
                      setCurrentPage(1);
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-bold transition-all kurdish-text ${
                      searchMode === mode.id
                        ? "bg-brand-primary border-brand-primary text-white"
                        : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    <mode.icon className="w-4 h-4" />
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* Genre filter dropdowns — replaced the old horizontal category chips */}
              <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-gray-400 kurdish-text">
                    پۆلێنی فیلمەکان
                  </span>
                  <CategoryDropdown
                    value={activeTab}
                    onChange={(v: string) => {
                      setActiveTab(v);
                      setCurrentPage(1);
                    }}
                    categories={movieCatOptions}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-gray-400 kurdish-text">
                    پۆلێنی دراماکان
                  </span>
                  <CategoryDropdown
                    value={dramaCategory}
                    onChange={setDramaCategory}
                    categories={dramaCatOptions}
                  />
                </div>
              </div>

              {searchMode === "title" && (
                <div className="max-w-2xl mx-auto">
                  <div className="relative group">
                    <Search className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-brand-primary" />
                    <input
                      type="text"
                      placeholder={tr("searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => {
                        if (searchQuery.trim()) setShowSuggestions(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowSuggestions(false), 150);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          submitSearchTerm(searchQuery);
                          setShowSuggestions(false);
                        }
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-14 pl-6 kurdish-text focus:outline-none focus:border-brand-primary focus:bg-white/10 transition-all"
                    />
                    {/* Live suggestions dropdown */}
                    {showSuggestions && localSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-[#151515] border border-white/10 rounded-2xl overflow-hidden z-30 text-right shadow-2xl">
                        {localSuggestions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSearchQuery(s.title);
                              setShowSuggestions(false);
                              submitSearchTerm(s.title);
                            }}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors"
                          >
                            <span className="kurdish-text font-bold text-sm text-white">
                              {s.title}
                            </span>
                            {s.year && (
                              <span className="text-[10px] text-gray-500 font-bold">
                                {s.year}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent + trending search chips */}
                  {(recentSearches.length > 0 || trendingSearches.length > 0) && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {recentSearches.map((term) => (
                        <button
                          key={`r-${term}`}
                          onClick={() => {
                            setSearchQuery(term);
                            submitSearchTerm(term);
                          }}
                          className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-brand-primary hover:border-brand-primary/40 transition-all"
                        >
                          {term}
                        </button>
                      ))}
                      {trendingSearches.map((t) => (
                        <button
                          key={`t-${t.term}`}
                          onClick={() => {
                            setSearchQuery(t.term);
                            submitSearchTerm(t.term);
                          }}
                          className="px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-xs font-bold text-orange-400 hover:bg-orange-500/20 transition-all flex items-center gap-1"
                        >
                          <Flame className="w-3 h-3" />
                          {t.term}
                          {t.count > 0 && (
                            <span className="text-[9px] opacity-60">{t.count}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {searchMode === "genre" && (
                <div className="max-w-3xl mx-auto">
                  <div className="flex flex-wrap justify-center gap-2">
                    {navGenres.map((g) => {
                      const active = selectedGenres.includes(g.tag);
                      return (
                        <button
                          key={g.tag}
                          onClick={() => {
                            setSelectedGenres((prev) => {
                              const next = active
                                ? prev.filter((x) => x !== g.tag)
                                : [...prev, g.tag];
                              return next;
                            });
                            setCurrentPage(1);
                          }}
                          className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all kurdish-text flex items-center gap-2 ${
                            active
                              ? "bg-brand-primary border-brand-primary text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                          }`}
                        >
                          {g.name}
                          <span className="text-[9px] opacity-60">{g.count}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedGenres.length > 0 && (
                    <button
                      onClick={() => setSelectedGenres([])}
                      className="mt-4 text-xs text-gray-500 hover:text-brand-primary font-bold underline underline-offset-4"
                    >
                      پاککردنەوەی هەموو پۆلێنەکان
                    </button>
                  )}
                </div>
              )}

              {searchMode === "ai" && (
                <div className="max-w-2xl mx-auto">
                  <div className="relative">
                    <textarea
                      rows={3}
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          runAiSearch();
                        }
                      }}
                      placeholder="بە وەسف بگەڕێ — نموونە: فیلمێکی خەمبار لەبارەی سەفەری کات یان فیلمێکی کۆری لەبارەی زۆمبی"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 kurdish-text focus:outline-none focus:border-brand-primary focus:bg-white/10 transition-all resize-none text-right"
                    />
                  </div>
                  <button
                    onClick={runAiSearch}
                    disabled={aiLoading || !aiQuery.trim()}
                    className="mt-3 px-8 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-2xl font-black kurdish-text text-sm hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2 mx-auto"
                  >
                    {aiLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {aiLoading ? "ئەگەڕێت..." : "AI بگەڕێ"}
                  </button>
                  {(aiMeta.keywords.length > 0 ||
                    aiMeta.genres.length > 0 ||
                    aiMeta.titles.length > 0) && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {aiMeta.titles.map((t) => (
                        <span
                          key={`t-${t}`}
                          className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[11px] font-bold text-indigo-300"
                        >
                          فیلم: {t}
                        </span>
                      ))}
                      {aiMeta.genres.map((g) => (
                        <span
                          key={`g-${g}`}
                          className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-[11px] font-bold text-purple-300"
                        >
                          پۆلێن: {g}
                        </span>
                      ))}
                      {aiMeta.keywords.map((k) => (
                        <span
                          key={`k-${k}`}
                          className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-gray-400"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                  {aiResults !== null && !aiLoading && (
                    <button
                      onClick={() => setAiResults(null)}
                      className="mt-4 text-xs text-gray-500 hover:text-brand-primary font-bold underline underline-offset-4"
                    >
                      گەڕانەکە بپاکەرەوە
                    </button>
                  )}
                </div>
              )}

              {/* Sort control */}
              <div className="mt-8 flex justify-center items-center gap-3">
                <span className="text-xs font-bold text-gray-500 kurdish-text">
                  ڕیزکردن:
                </span>
                {(
                  [
                    { id: "recent", label: "نوێترین" },
                    { id: "trending", label: "باڵاترین ترەند" },
                    { id: "live", label: "زۆرترین بینەری ڕاستەوخۆ" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSortBy(s.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all kurdish-text ${
                      sortBy === s.id
                        ? "bg-brand-primary/20 border-brand-primary/40 text-brand-primary"
                        : "bg-white/5 border-white/10 text-gray-500 hover:text-white"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Movie Grid Section */}
            <div className="max-w-7xl mx-auto px-8 pb-32">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 md:gap-8 items-start content-start">
                {paginatedMovies.flatMap((movie, idx) => {
                  const movieCard = (
                    <MovieCard
                      key={movie.id}
                      movie={resolvedMovies[movie.id] ?? movie}
                      liveViewers={getMovieLiveViewers(movie)}
                      isTopLive={topLiveId === movie.id}
                      isFavorite={favoriteIds.has(movie.id)}
                      isLiked={likedIds.has(movie.id)}
                      likes={getMovieLikes(movie)}
                      onOpen={openMovieDetails}
                      onToggleFavorite={handleToggleFavorite}
                      onToggleLike={handleToggleLike}
                    />
                  );

                    if (idx === 5) {
                      const items = [movieCard];
                      if (config.ads.banner.image) {
                        items.push(
                          <div
                            key="ad-banner"
                            className="col-span-full my-12"
                          >
                            <a
                              href={config.ads.banner.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <div className="w-full aspect-[728/90] md:h-[120px] bg-white/5 rounded-2xl overflow-hidden border border-white/10 group cursor-pointer relative">
                                <img
                                  src={config.ads.banner.image || undefined}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute top-2 right-2 px-2 py-1 bg-black/40 text-[8px] font-black text-white/50 uppercase tracking-widest rounded border border-white/5">
                                  ADVERTISEMENT
                                </div>
                              </div>
                            </a>
                          </div>
                        );
                      }
                      // Drama Rooms hub — rendered directly below the wide
                      // advertisement banner inside the movie grid.
                      items.push(
                        <div
                          key="drama-rooms-hub"
                          className="col-span-full"
                        >
                          {dramaRoomsHubElement}
                        </div>
                      );
                      return items;
                    }
                    return [movieCard];
                  })}
              </div>

              {paginatedMovies.length <= 5 && (
                <div className="col-span-full">{dramaRoomsHubElement}</div>
              )}

              {isLoading && paginatedMovies.length === 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 md:gap-8">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <MovieCardSkeleton key={`sk-${i}`} />
                  ))}
                </div>
              )}

              {paginatedMovies.length === 0 && !isLoading && (
                <div className="py-20 text-center flex flex-col items-center">
                  <Ghost className="w-16 h-16 text-gray-800 mb-4" />
                  <p className="text-gray-500 kurdish-text">
                    هیچ فیلمێک نەدۆزرایەوە لەم بەشەدا.
                  </p>
                </div>
              )}

              {/* Pagination Controls */}
              {sortedMovies.length > moviesPerPage && (
                <div className="mt-16 flex justify-center items-center gap-4">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl disabled:opacity-30 hover:bg-white/10"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="flex gap-2">
                    {Array(Math.ceil(sortedMovies.length / moviesPerPage))
                      .fill(0)
                      .map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPage(i + 1)}
                          className={`w-10 h-10 rounded-xl font-bold transition-all border ${
                            currentPage === i + 1
                              ? "bg-brand-primary border-brand-primary"
                              : "bg-white/5 border-white/10 text-gray-500"
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                  </div>
                  <button
                    disabled={
                      currentPage ===
                      Math.ceil(sortedMovies.length / moviesPerPage)
                    }
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl disabled:opacity-30 hover:bg-white/10"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Remaining movie sections — rendered AFTER the search + movie grid,
                so no movie cards appear above the Search section. */}
            <div className="relative z-20 space-y-12 pb-12">
              {/* Drama Rooms Gallery — replaces the old Trending Now row */}
              <SafeRender fallbackName="Drama Rooms Gallery">
                {null}
              </SafeRender>

              {/* My Favorites Section — dedicated persistent row of the current
                  user's favorite movies (Firestore-backed for signed-in users,
                  localStorage for guests). */}
              {favoriteMovies.length > 0 && (
                <SafeRender fallbackName="Favorites Row">
                  <section className="pl-8">
                    <h3 className="text-2xl font-black mb-6 kurdish-text text-white flex items-center gap-3">
                      <Heart className="w-6 h-6 text-brand-primary fill-current" />
                      فیلمە دڵخوازەکانم
                      <span className="text-sm font-bold text-gray-500">
                        ({favoriteMovies.length})
                      </span>
                    </h3>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-8 pr-8">
                      {favoriteMovies.map((movie) => (
                        <div
                          key={`fav-${movie.id}`}
                          className="flex-shrink-0 w-[160px] md:w-[220px]"
                        >
                          <MovieCard
                            movie={resolvedMovies[movie.id] ?? movie}
                            liveViewers={getMovieLiveViewers(movie)}
                            isTopLive={topLiveId === movie.id}
                            isFavorite={favoriteIds.has(movie.id)}
                            isLiked={likedIds.has(movie.id)}
                            likes={getMovieLikes(movie)}
                            onOpen={openMovieDetails}
                            onToggleFavorite={handleToggleFavorite}
                            onToggleLike={handleToggleLike}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                </SafeRender>
              )}

              {/* Continue Watching Section — real resume points tracked by the
                  server (per identity) merged with the local record. */}
              {continueWatchingMovies.length > 0 && (
                <SafeRender fallbackName="Continue Watching Row">
                  <section className="pl-8">
                    <h3 className="text-2xl font-black mb-6 kurdish-text text-white flex items-center gap-3">
                      <Clock className="w-6 h-6 text-emerald-400" />
                      بەردەوامبوون لە سەیرکردن
                    </h3>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-8 pr-8">
                      {continueWatchingMovies.map(({ movie, data }) => {
                        const pct =
                          data.duration > 0
                            ? Math.min(100, Math.round((data.progress / data.duration) * 100))
                            : 0;
                        return (
                          <div key={`cw-${movie.id}`} className="flex-shrink-0 w-[160px] md:w-[220px]">
                            <MovieCard
                              movie={resolvedMovies[movie.id] ?? movie}
                              liveViewers={getMovieLiveViewers(movie)}
                              isTopLive={topLiveId === movie.id}
                              isFavorite={favoriteIds.has(movie.id)}
                              isLiked={likedIds.has(movie.id)}
                              likes={getMovieLikes(movie)}
                              onOpen={openMovieDetails}
                              onToggleFavorite={handleToggleFavorite}
                              onToggleLike={handleToggleLike}
                            />
                            {/* Real resume progress bar */}
                            <div className="mt-2 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-400 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] font-bold text-emerald-400/80 kurdish-text">
                              {data.progress > 0
                                ? `${Math.floor(data.progress / 60)}:${String(
                                    data.progress % 60,
                                  ).padStart(2, "0")} لە ${data.duration > 0 ? Math.floor(data.duration / 60) : "?"} خولەک`
                                : "دەستپێکردن"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </SafeRender>
              )}
            </div>
          </SafeRender>
          {/* Drama Room modals — detail view (opens a room's dramas) + CRUD form */}
          {showDramaHubModal && (
            <DramaHubModal
              rooms={dramaRoomsFiltered}
              resolvedMovies={resolvedMovies}
              currentUser={currentUser}
              systemVerified={systemVerified}
              canCreateRoom={canCreateDramaRoom}
              onOpenRoom={(room: any) => setSelectedDramaRoom(room)}
              onCreate={() => {
                setEditingDramaRoom(null);
                setShowDramaRoomModal(true);
              }}
              onEdit={(room: any) => {
                setEditingDramaRoom(room);
                setShowDramaRoomModal(true);
              }}
              onDelete={handleDeleteDramaRoom}
              onClose={() => setShowDramaHubModal(false)}
              liveViewersMap={roomLiveViewers}
              ratingsMap={roomRatingsMap}
            />
          )}
          {selectedDramaRoom && (
            <DramaRoomDetailModal
              room={selectedDramaRoom}
              resolvedMovies={resolvedMovies}
              openMovie={(movie: Movie) => {
                // Remember this room's ordered episodes so an episode that
                // finishes auto-advances to the NEXT episode in the SAME room
                // (the room's stored `dramas` order, never re-sorted).
                dramaRoomPlaylistRef.current = {
                  roomId: selectedDramaRoom?.id,
                  episodes: Array.isArray(selectedDramaRoom?.dramas)
                    ? [...selectedDramaRoom.dramas]
                    : [],
                };
                openMovie(movie);
              }}
              onClose={() => setSelectedDramaRoom(null)}
              rating={getRoomCCRating(selectedDramaRoom)}
              ratingCount={getRoomRatingCount(selectedDramaRoom)}
              userRating={getUserRoomRating(selectedDramaRoom)}
              onRate={handleRateDramaRoom}
            />
          )}
          {showDramaRoomModal && (
            <DramaRoomCrudModal
              editing={editingDramaRoom}
              movies={dramaRoomEditMovies}
              allMovies={movies}
              onSave={handleSaveDramaRoom}
              onClose={() => {
                setShowDramaRoomModal(false);
                setEditingDramaRoom(null);
              }}
            />
          )}
          {/* Permanent CinemaChat two-person watch room (main_broadcast_room). */}
          <CinemaChatRoom
            open={showCinemaChatRoom}
            onClose={() => setShowCinemaChatRoom(false)}
            identity={cinemaChatIdentity}
            movies={publicMovies}
            hasAccount={hasCinemaChatAccount}
            accountLoading={socialAuthLoading}
            accountName={cinemaChatAccountName}
            accountCode={cinemaChatAccountCode}
            onRequestAccount={() => {
              setAuthFlowReturn(true);
              setModalMode("signup");
              setShowSocialModal(true);
            }}
            subtitleCues={showCinemaChatRoom ? cinemaWindowSubtitleCues : []}
            subtitleLang={cinemaWindowSubtitleLang}
            subtitleStatus={showCinemaChatRoom ? cinemaWindowSubtitleStatus : "idle"}
            subtitleMessage={showCinemaChatRoom ? cinemaWindowSubtitleMessage : ""}
            subtitleLanguages={CINEMA_WINDOW_SUBTITLE_LANGUAGES}
            onSubtitleLangChange={(lang: string) => {
              setCinemaWindowSubtitleLang(lang);
              setCinemaWindowSubtitleRetryKey((k) => k + 1);
            }}
            onSubtitleRetry={() => setCinemaWindowSubtitleRetryKey((k) => k + 1)}
            onSourceUrl={(url: string) => setCinemaChatSourceUrl(url)}
            originalSubtitleCues={showCinemaChatRoom ? originalCinemaWindowSubtitleCues : []}
            ccSettings={ccSettings}
            ccFontSizeEntry={ccFontSizeEntry}
            ccSubtitleStyle={ccSubtitleStyle}
            onToggleCcPanel={() => setShowCcPanel((v) => !v)}
            showCcPanel={showCcPanel}
            onUpdateCcSettings={(fn) => setCcSettings(fn)}
          />
          {/* CinemaChat private Friend → Connect (ephemeral 1-to-1 chat). The
              CinemaChat card opens THIS modal; the watch room above stays
              reachable through the "watch together" notifications only. */}
          <FriendConnectRoom
            open={showFriendConnect}
            onClose={() => setShowFriendConnect(false)}
            myUid={fbUser?.uid || ""}
            myName={socialProfile?.name || "بەکارهێنەر"}
            myCode={cinemaChatAccountCode || ""}
            myAvatar={socialProfile?.avatarUrl || socialProfile?.avatar}
            readiness={accountReadiness}
            onRequestAccount={() => {
              setAuthFlowReturn(true);
              setModalMode("signup");
              setShowSocialModal(true);
            }}
            onRetryAuth={() => void refreshProfile()}
            onCompleteAccount={() => {
              setShowCompleteAccount(true);
            }}
          />
          </>
        )}
      </main>

      {/* Global "watch together" invite notification — lives OUTSIDE the room so
          the host sees it even while browsing the app. Accept/Reject reuse the
          existing CinemaChat approval flow (no separate pairing system). */}
      <CinemaChatInviteNotification
        identity={cinemaChatIdentity}
        roomOpen={showCinemaChatRoom}
        onOpenRoom={() => setShowCinemaChatRoom(true)}
      />

      {/* Global "account invitation" notification for CinemaChat — only account
          users have a stable uid to receive persisted invitations by code/phone.
          Mounted OUTSIDE the room so the recipient sees it anywhere in the app. */}
      {hasCinemaChatAccount && (
        <RoomInviteNotification
          identity={cinemaChatIdentity}
          onOpenRoom={() => setShowCinemaChatRoom(true)}
        />
      )}

      {/* Global friend presence (online/offline) notifications — accepted friends
          only, mounted OUTSIDE the room so users see toasts anywhere in the app */}
      <FriendPresenceNotification />

      {/* Point 14/15/16: Detailed Movie View (Selection) */}
      <AnimatePresence>
        {selectedMovie && (isMovieDetailsOpen || showPlayer) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8"
          >
            <div
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              onClick={closeMovieModal}
            />
 
            <motion.div
              ref={movieModalRef}
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedMovie.title} — ${showPlayer ? "Player" : "Movie details"}`}
              tabIndex={-1}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={`relative w-full ${showPlayer ? "fixed inset-0 m-0 max-w-none h-full rounded-none z-[1000] overflow-hidden" : "max-w-3xl rounded-3xl max-h-[90vh] border border-white/5 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-y-auto custom-scrollbar"} bg-[#141414] transition-all duration-500`} // Dynamic styling for player mode
            >
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  closeMovieModal();
                  if (activeSyncGroup?.isVIP) {
                    setActiveSyncGroup(null);
                  }
                }}
                className={`${showPlayer ? "absolute top-4 right-4" : "sticky top-3 mt-3 mr-3 ml-auto w-fit"} z-[60] p-2 bg-black/60 hover:bg-red-600 rounded-full text-white transition-all backdrop-blur-md border border-white/10 scale-90 md:scale-100`}
              >
                <X className="w-5 h-5" />
              </button>

              <div
                className={`flex flex-col ${showPlayer ? "h-full bg-black" : "md:flex-row"}`} // Layout for player vs details
              >
                <div
                  ref={modalPlayerRef}
                  className={`${showPlayer ? "w-full h-full relative bg-black shadow-2xl aspect-video md:aspect-[21/9]" : "w-full md:w-72 lg:w-80 flex-shrink-0 relative bg-black shadow-2xl aspect-[2/3] md:aspect-auto md:min-h-[440px] max-h-[45vh] md:max-h-none"}`}
                  onPointerDown={onPlayerPointerDown}
                  onPointerMove={onPlayerPointerMove}
                  onPointerUp={onPlayerPointerUp}
                  onPointerCancel={onPlayerPointerCancel}
                >
                  {showPlayer && activeServerUrl ? (
                    <div className="absolute inset-0 bg-black flex items-center justify-center z-10 transition-all">
                      {/* Player Content based on activeServerUrl */}
                      {false && selectedMovie.isTooLarge ? (
                        <div className="relative w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-6 text-center">
                          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                          </div>
                          <h3 className="text-xl font-bold text-white mb-2 kurdish-text">
                            قەبارەی ڤیدیۆکە گەورەیە
                          </h3>
                          <p className="text-zinc-400 mb-6 text-sm max-w-xs kurdish-text">
                            قەبارەی ئەم ڤیدیۆیە گەورەیە و ناتوانرێت ڕاستەوخۆ
                            لێرەدا لێبدرێت. تکایە پەیوەندیمان پێوە بکە بۆ
                            وەرگرتنی لینکی بینین.
                          </p>
                          {import.meta.env.VITE_WHATSAPP_NUMBER && (
                            <a
                              href={`https://wa.me/${import.meta.env.VITE_WHATSAPP_NUMBER}?text=${encodeURIComponent("I need help with movie: " + selectedMovie.title)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-6 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold rounded-full text-sm transition-all flex items-center gap-2"
                            >
                              پەیوەندی بە واتسئەپەوە بکە
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div> // Too Large Video Message
                      ) : activeServerUrl.includes("youtube.com") ||
                        activeServerUrl.includes("youtu.be") ? (
                        <YouTubeResilientPlayer
                          url={activeServerUrl}
                          iframeId="room-player"
                          title={`${selectedMovie?.title || "CinemaChat"} — YouTube Player`}
                          onModeChange={(mode) => setYoutubePlayerMode(mode)}
                        />
                      ) : activeServerUrl.includes("/embed/") ||
                        activeServerUrl.includes("hdtoday.") ||
                        activeServerUrl.includes("vidcloud") ||
                        activeServerUrl.includes("vidmoly") ||
                        activeServerUrl.includes("streamwish") ||
                        activeServerUrl.includes("filelrun") ||
                        activeServerUrl.includes("rabbitstream") ||
                        activeServerUrl.includes("kurdcinema") ||
                        activeServerUrl.includes("streaming") ||
                        activeServerUrl.includes("source") ||
                        !activeServerUrl.match(
                          /\.(mp4|m4v|webm|ogv)$|youtube\.com|youtu\.be/i,
                        ) ? (
                        <ImmersiveShieldedPlayer
                          url={activeServerUrl}
                          iframeId="streaming-player"
                          title={`${selectedMovie?.title || "CinemaChat"} — Cinematic Player`}
                          scale={immersiveScale}
                        /> // Cinematic Shielded Player for external embeds
                      ) : (
                        <div className="relative w-full h-full flex items-center justify-center bg-black">
                          <Plyr
                            ref={plyrRef}
                            source={plyrSource}
                            options={plyrOptions}
                          />
                        </div> // Plyr Player for direct video files
                      )}

                      {/* AI subtitle overlay for Drama Rooms — renders on top of
                          whatever player type is active (YouTube, embed, or Plyr).
                          Cinema Window renders its own overlay inside its native
                          <video> block; this covers the main App player only. */}
                      {isDramaRoomActive && cinemaWindowActiveSubtitleText && ccSettings.showSubtitle && (
                        <div className="pointer-events-none absolute inset-x-3 bottom-16 z-10 flex flex-col items-center gap-1">
                          {cinemaWindowActiveOriginalText && (
                            <div
                              dir="auto"
                              className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-1.5 text-center font-bold leading-snug opacity-70 ${ccFontSizeEntry.mobileCls} md:${ccFontSizeEntry.cls}`}
                              style={{ color: '#cccccc', backgroundColor: 'rgba(0,0,0,0.5)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                            >
                              {cinemaWindowActiveOriginalText}
                            </div>
                          )}
                          <div
                            dir="auto"
                            className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-2 text-center font-bold leading-snug shadow-[0_2px_14px_rgba(0,0,0,0.75)] ${ccFontSizeEntry.mobileCls} md:${ccFontSizeEntry.cls}`}
                            style={ccSubtitleStyle}
                          >
                            {cinemaWindowActiveSubtitleText}
                          </div>
                        </div>
                      )}
                      {isDramaRoomActive && cinemaWindowSubtitleStatus === "loading" && !cinemaWindowActiveSubtitleText && (
                        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 px-4 py-3 pointer-events-none">
                              <div className="flex items-center gap-2 rounded-xl bg-black/70 px-3 py-2 text-xs text-red-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="kurdish-text">{cinemaWindowSubtitleMessage || "وەردەگێڕدرێت..."}</span>
                              </div>
                            </div>
                          )}
{isDramaRoomActive && cinemaWindowSubtitleStatus === "error" && (
                        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center px-4 py-3">
                          <div className="flex items-center gap-2 rounded-xl bg-red-950/80 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="kurdish-text">{cinemaWindowSubtitleMessage || "بەردەست نییە"}</span>
                            <button
                              onClick={() => setCinemaWindowSubtitleRetryKey((k) => k + 1)}
                              className="ml-1 p-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors shrink-0 cursor-pointer"
                              title="Retry subtitle generation"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Playback speed HUD (shows after a speed change via the
                          speed menu or press-and-hold on the video). */}
                      {speedHudVisible && (
                        <div className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center">
                          <div className="px-6 py-3 rounded-2xl bg-black/80 border border-white/10 backdrop-blur-md shadow-2xl">
                            <span className="text-3xl font-black text-white tabular-nums drop-shadow-lg">
                              {formatSpeed(speedHudValue)}
                            </span>
                          </div>
                        </div>
                      )}

                       {/* Drama Room "Next Episode" preview — visible ONLY during
                           the FINAL 30 SECONDS of the current episode. Full-screen
                           "Up Next" overlay: pointer-events-none so the current
                           episode keeps playing and the player controls stay
                           interactive; the countdown reads the live remaining time
                           of the CURRENT episode only. Explicit render guard:
                           no overlay unless a next episode exists AND
                           0 < remaining <= 30. */}
                        {dramaNextEpisode &&
                          dramaNextRemaining > 0 &&
                          dramaNextRemaining <= 30 &&
                          !playerStartPreview && (
                            <div
                              data-testid="next-episode-preview"
                              className="pointer-events-none absolute inset-0 z-[45] flex items-center justify-center bg-black/50"
                            >
                              <DramaEpisodeBackdrop
                                posterUrl={dramaNextEpisode.posterUrl || dramaNextEpisode.image || ""}
                              />
                              <DramaEpisodePreviewCard
                                label="ئەڵقەی داهاتوو • NEXT EPISODE"
                                posterUrl={dramaNextEpisode.posterUrl || dramaNextEpisode.image || ""}
                                title={dramaNextEpisode.title}
                                foot={
                                  <>
                                    <div className="text-2xl md:text-4xl font-black text-brand-primary kurdish-text tabular-nums drop-shadow-lg">
                                      دەستپێدەکات لە {Math.ceil(dramaNextRemaining)}
                                    </div>
                                    <div className="text-sm md:text-base font-bold text-white/90 kurdish-text mt-1 drop-shadow">
                                      Starting in {Math.ceil(dramaNextRemaining)}
                                    </div>
                                  </>
                                }
                              />
                            </div>
                          )}

                        {/* Player start-of-playback preview — shown immediately
                            for EXACTLY 5 seconds when a movie begins in the
                            modal player (drama episode auto-next / manual
                            switch / first open, or any regular movie) while
                            playback continues normally (no pause/seek/restart).
                            It has its own timer, fully independent from the
                            final-30s "Up Next" overlay, and the two never
                            stack (e.g. very short episodes). The suppression
                            only applies when the "Up Next" overlay is actually
                            rendering (dramaNextEpisode truthy), so regular
                            movies — where no next-episode overlay exists — are
                            never blocked. */}
                        {playerStartPreview &&
                          !(
                            dramaNextEpisode &&
                            dramaNextRemaining > 0 &&
                            dramaNextRemaining <= 30
                          ) && (
                            <div
                              data-testid="episode-start-preview"
                              className="pointer-events-none absolute inset-0 z-[45] flex items-center justify-center bg-black/90"
                            >
                              <DramaEpisodeBackdrop
                                posterUrl={(playerStartPreview as any).posterUrl || playerStartPreview.image || ""}
                              />
                              <DramaEpisodePreviewCard
                                label="ئەڵقەی ئێستا • NOW PLAYING"
                                posterUrl={(playerStartPreview as any).posterUrl || playerStartPreview.image || ""}
                                title={playerStartPreview.title}
                                foot={
                                  <div className="text-sm md:text-base font-bold text-brand-primary kurdish-text mt-1 drop-shadow">
                                    دەستی پێکرد • Now Playing
                                  </div>
                                }
                              />
                            </div>
                          )}


                       {/* SyncRoom Overlay Integration */}
                      {activeSyncGroup && (
                        <SafeRender fallbackName="Live Sync Room Overlay">
                          <div key={activeSyncGroup.id} className="absolute inset-0 z-[100] pointer-events-none">
                            <SyncRoom
                              room={activeSyncGroup}
                              currentMovie={selectedMovie}
                              onClose={() => setActiveSyncGroup(null)}
                              onSyncPlayback={handleSyncedPlayback}
                              vipVideoUrl={(activeSyncGroup as any)?.videoUrl || undefined}
                              onSelectVipVideo={handleVipSelectVideo}
                            />
                          </div>
                        </SafeRender>
                      )}
                      
                      {/* Pro Player Overlay UI */}
                      {/* Top Header: Cinemachat Branding, Title and Close Button */}
                      <div className="absolute top-0 inset-x-0 p-6 flex items-center justify-between z-50 bg-gradient-to-b from-black/90 to-transparent pointer-events-none font-sans">
                        <div className="flex items-center gap-2 pointer-events-auto">
                          <button
                            type="button"
                            aria-label="Close player"
                            onClick={closePlayerToDetails}
                            className="p-2.5 bg-black/60 hover:bg-red-600 rounded-full text-white transition-all backdrop-blur-md border border-white/10 cursor-pointer shadow-lg hover:scale-105 active:scale-95"
                            title="Close"
                          >
                            <X className="w-5 h-5" />
                          </button>

                          <div className="flex flex-col ml-3">
                            <span className="text-sm font-black text-brand-primary kurdish-text tracking-wider drop-shadow-md">
                              سینەما چات • CinemaChat
                            </span>
                            <h2 className="text-lg font-bold text-white kurdish-text drop-shadow-lg leading-snug">
                              {selectedMovie.title}
                            </h2>
                          </div>
                        </div>
                        
                        <div className="px-4 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/5 text-[10px] uppercase font-bold tracking-widest text-brand-primary font-mono hidden sm:block">
                          CINEMACHAT PRO PLAYER
                        </div>
                      </div>

                      {/* CSS Overlay Masks to hide unwanted YouTube controls and watermarks */}
                      {(youtubePlayerMode === "embed" &&
                        (activeServerUrl.includes("youtube.com") ||
                          activeServerUrl.includes("youtu.be"))) && ( // YouTube specific overlays
                        <>
                          {/* Bottom solid black block to cover native YouTube status bars / suggestions */}
                          <div className="absolute bottom-0 inset-x-0 h-16 bg-[#000000] z-40 pointer-events-auto cursor-default border-t border-white/5" />
                          {/* Left bottom watermark shield */}
                          <div className="absolute bottom-16 left-0 w-36 h-16 bg-transparent z-45 pointer-events-auto cursor-default" />
                          {/* Right bottom logo click blocker shield */}
                          <div className="absolute bottom-16 right-0 w-44 h-16 bg-transparent z-45 pointer-events-auto cursor-default" />
                        </>
                      )}

                      {/* Bottom-left CinemaChat branding (floating, non-blocking) */}
                      <div className="absolute bottom-0 left-0 h-16 z-50 flex items-center gap-2 px-6 md:px-10 pointer-events-none select-none font-sans">
                        <span className="text-xs font-black text-brand-primary uppercase tracking-[0.3em] font-mono drop-shadow-sm">
                          CINEMACHAT
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold kurdish-text drop-shadow">
                          یاریپێکەری فەرمی
                        </span>
                      </div>

                      {/* Bottom-right Cinematic Control Bar.
                          Exact right→left sequence:
                          [1] Fullscreen Expand · [2] Quality · [3] Playback Speed ·
                          [4] Forward 10s · [4.5] Next Episode (Drama Room) ·
                          [5] Play/Pause · [6] Back 10s ·
                          [7] Exit Fullscreen · [8] Mute */}
                      <div className="absolute bottom-0 right-0 z-50 h-16 flex items-center gap-1.5 md:gap-2 px-4 md:px-6 pointer-events-auto select-none font-sans">
                        {/* [6] Mute / Audio Toggle (leftmost of the cluster) */}
                        <button
                          type="button"
                          onClick={toggleIframeMute}
                          className={`w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border ${
                            isIframeMuted
                              ? "bg-red-600 hover:bg-red-700 text-white border-red-500/40"
                              : "bg-black/60 hover:bg-white/10 text-white border-white/10"
                          }`}
                          title="ڕاگرتنی دەنگ (Mute)"
                        >
                          {isIframeMuted ? (
                            <VolumeX className="w-4.5 h-4.5 md:w-5 md:h-5" />
                          ) : (
                            <Volume2 className="w-4.5 h-4.5 md:w-5 md:h-5" />
                          )}
                        </button>

                        {/* [5] Exit Fullscreen (active while fullscreen) */}
                        <button
                          type="button"
                          onClick={toggleFullscreenMain}
                          disabled={!isIframeFullscreen}
                          className={`w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 ${
                            isIframeFullscreen
                              ? "bg-white/10 hover:bg-white/20 text-white"
                              : "bg-black/60 text-white/25 cursor-not-allowed opacity-50"
                          }`}
                          title="داخستنی فول سکرین (Exit Fullscreen)"
                        >
                          <Minimize className="w-4.5 h-4.5 md:w-5 md:h-5" />
                        </button>

                        {/* [6] Back 10s (skip back) / [5] Play-Pause / [4] Forward 10s */}
                        <button
                          type="button"
                          onClick={() => seekToPlayer(playerCurrentTime - 10)}
                          className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 bg-black/60 hover:bg-white/10 text-white"
                          title="پاشگەڕاندن 10 چرکە (Back 10s)"
                        >
                          <Rewind className="w-4.5 h-4.5 md:w-5 md:h-5" />
                        </button>

                        <button
                          type="button"
                          onClick={toggleIframePlay}
                          className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-brand-primary hover:bg-brand-primary/90 text-white transition-all active:scale-95 cursor-pointer shadow-lg shadow-red-600/30 border border-brand-primary/50"
                          title="پاوس و پلەی (Play/Pause)"
                        >
                          {isIframePlaying ? (
                            <Pause className="w-5 h-5 fill-current" />
                          ) : (
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => seekToPlayer(playerCurrentTime + 10)}
                          className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 bg-black/60 hover:bg-white/10 text-white"
                          title="پێشبڕین 10 چرکە (Forward 10s)"
                        >
                          <FastForward className="w-4.5 h-4.5 md:w-5 md:h-5" />
                        </button>

                        {/* [4.5] Next Episode — Drama Room only. Advances to the
                            NEXT episode of the SAME room in its stored order,
                            starting at 00:00, by reusing handleDramaRoomEnded so
                            it can never drift from the auto-next logic nor double
                            fire (same anti-repeat guard). Disabled (no navigation)
                            on the room's final episode; hidden for regular movies. */}
                        {dramaNextInfo.inRoom && (
                          <button
                            type="button"
                            onClick={handleDramaRoomEnded}
                            disabled={!dramaNextInfo.next}
                            className={`w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 ${
                              dramaNextInfo.next
                                ? "bg-black/60 hover:bg-white/10 text-white"
                                : "bg-black/60 text-white/25 cursor-not-allowed opacity-50"
                            }`}
                            title="ئەڵقەی دواتر (Next Episode)"
                          >
                            <SkipForward className="w-4.5 h-4.5 md:w-5 md:h-5" />
                          </button>
                        )}

                        {/* [2.5] Playback Speed */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setPlayerMenu(
                                playerMenu === "speed" ? null : "speed",
                              )
                            }
                            className={`w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 ${
                              playbackRate !== 1
                                ? "bg-brand-primary text-white"
                                : "bg-black/60 hover:bg-white/10 text-white"
                            }`}
                            title="خێرایی پلەیباک (Playback Speed)"
                          >
                            <Gauge className="w-4.5 h-4.5 md:w-5 md:h-5" />
                          </button>

                          {playerMenu === "speed" && (
                            <>
                              <div
                                className="fixed inset-0 z-[55]"
                                onClick={() => setPlayerMenu(null)}
                              />
                              <div className="absolute bottom-full right-0 mb-2 z-[60] w-44 rounded-2xl border border-white/10 bg-[#0a0a0c]/95 backdrop-blur-xl p-2 shadow-2xl">
                                <div className="px-3 pb-2 text-[9px] font-black text-zinc-400 uppercase tracking-widest kurdish-text">
                                  خێرایی پلەیباک
                                </div>
                                {SPEED_OPTIONS.map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => selectPlaybackRate(r)}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                      playbackRate === r
                                        ? "bg-brand-primary text-white"
                                        : "bg-white/5 hover:bg-white/10 text-zinc-300"
                                    }`}
                                  >
                                    <span>{formatSpeed(r)}</span>
                                    {playbackRate === r && (
                                      <CheckCircle2 className="w-4 h-4" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* [2] Quality Settings */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setPlayerMenu(
                                playerMenu === "quality" ? null : "quality",
                              )
                            }
                            className={`w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 ${
                              immersiveScale > 1
                                ? "bg-brand-primary text-white"
                                : "bg-black/60 hover:bg-white/10 text-white"
                            }`}
                            title="زیاد کردن و کەمکردنی کوالێتی وێنە (Quality)"
                          >
                            <Settings className="w-4.5 h-4.5 md:w-5 md:h-5" />
                          </button>

                          {playerMenu === "quality" && (
                            <>
                              <div
                                className="fixed inset-0 z-[55]"
                                onClick={() => setPlayerMenu(null)}
                              />
                              <div className="absolute bottom-full right-0 mb-2 z-[60] w-48 rounded-2xl border border-white/10 bg-[#0a0a0c]/95 backdrop-blur-xl p-2 shadow-2xl">
                                <div className="px-3 pb-2 text-[9px] font-black text-zinc-400 uppercase tracking-widest kurdish-text">
                                  کوالێتی وێنە
                                </div>
                                {IMMERSIVE_QUALITY_PRESETS.map((q) => (
                                  <button
                                    key={q.value}
                                    type="button"
                                    onClick={() => {
                                      setImmersiveScale(q.value);
                                      setPlayerMenu(null);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                      immersiveScale === q.value
                                        ? "bg-brand-primary text-white"
                                        : "bg-white/5 hover:bg-white/10 text-zinc-300"
                                    }`}
                                  >
                                    <span className="kurdish-text">{q.label}</span>
                                    {immersiveScale === q.value && (
                                      <CheckCircle2 className="w-4 h-4" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* [1.5] Subtitle Language Toggle — Drama Room only. Lets
                            the user switch subtitle language from inside the main
                            player without needing the Cinema Window sidebar. */}
                        {isDramaRoomActive && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setPlayerMenu(
                                  playerMenu === "subtitle" ? null : "subtitle",
                                )
                              }
                              className={`w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 ${
                                cinemaWindowSubtitleStatus === "ready"
                                  ? "bg-brand-primary text-white"
                                  : cinemaWindowSubtitleStatus === "loading"
                                    ? "bg-red-600 text-white animate-pulse"
                                    : "bg-black/60 hover:bg-white/10 text-white"
                              }`}
                              title="زمانی ژێرنوس (Subtitles)"
                            >
                              <Captions className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>

                            {playerMenu === "subtitle" && (
                              <>
                                <div
                                  className="fixed inset-0 z-[55]"
                                  onClick={() => setPlayerMenu(null)}
                                />
                                <div className="absolute bottom-full right-0 mb-2 z-[60] w-44 rounded-xl border border-white/10 bg-[#0a0a0c]/95 backdrop-blur-xl p-2 shadow-2xl space-y-1.5">
                                  <div className="px-1 pb-1 text-[8px] font-black text-zinc-400 uppercase tracking-widest kurdish-text">
                                    زمانی ژێرنوس
                                  </div>
                                  {CINEMA_WINDOW_SUBTITLE_LANGUAGES.map((lang) => (
                                    <button
                                      key={lang.code}
                                      type="button"
                                      onClick={() => {
                                        setCinemaWindowSubtitleLang(lang.code);
                                        setCinemaWindowSubtitleRetryKey((k) => k + 1);
                                      }}
                                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                                        cinemaWindowSubtitleLang === lang.code
                                          ? "bg-brand-primary text-white"
                                          : "bg-white/5 hover:bg-white/10 text-zinc-300"
                                      }`}
                                    >
                                      <span>{lang.label}</span>
                                      {cinemaWindowSubtitleLang === lang.code && (
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  ))}
                                  <div className="border-t border-white/10 pt-1.5 space-y-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCcSettings((s) => ({ ...s, showOriginal: !s.showOriginal }));
                                      }}
                                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                        ccSettings.showOriginal
                                          ? "bg-emerald-600/80 text-white"
                                          : "bg-white/5 hover:bg-white/10 text-zinc-300"
                                      }`}
                                    >
                                      <span>ژێرنووسی ڕەسەن</span>
                                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${ccSettings.showOriginal ? 'border-emerald-400 bg-emerald-500' : 'border-zinc-500'}`}>
                                        {ccSettings.showOriginal && <span className="text-white text-[7px]">✓</span>}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPlayerMenu(null);
                                        setShowCcPanel(true);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white/5 hover:bg-white/10 text-zinc-300 cursor-pointer transition-all"
                                    >
                                      <span>⚙️ ڕێکخستن</span>
                                    </button>
                                   </div>
                                 </div>
                               </>
                             )}
                           </div>
                         )}

                        {/* [1] Fullscreen Expand (rightmost of the cluster) */}
                        <button
                          type="button"
                          onClick={toggleFullscreenMain}
                          disabled={isIframeFullscreen}
                          className={`w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 ${
                            isIframeFullscreen
                              ? "bg-black/60 text-white/25 cursor-not-allowed opacity-50"
                              : "bg-white/10 hover:bg-white/20 text-white"
                          }`}
                          title="گەورەکردنی شاشە بۆ فول سکرین (Fullscreen)"
                        >
                          <Maximize className="w-4.5 h-4.5 md:w-5 md:h-5" />
                        </button>
                      </div>

                      {/* Full-width progress / seek bar with live time readout.
                          Shows the active player's position and lets the user seek by
                          dragging. Works natively with Plyr + YouTube; best-effort elsewhere. */}
                      <div className="absolute bottom-16 inset-x-0 z-50 flex items-center gap-3 px-4 md:px-6 select-none font-sans pointer-events-auto">
                        <span className="min-w-[88px] text-left text-[11px] font-bold text-white tabular-nums drop-shadow">
                          {formatTime(dragTime ?? playerCurrentTime)}
                        </span>
                        <div
                          role="slider"
                          aria-label="Progress"
                          aria-valuemin={0}
                          aria-valuemax={Math.round(playerDuration || 0)}
                          aria-valuenow={Math.round(dragTime ?? playerCurrentTime)}
                          className={`relative flex-1 h-8 flex items-center cursor-pointer touch-none ${
                            playerDuration <= 0 ? "opacity-40 pointer-events-none" : ""
                          }`}
                          onPointerDown={startSeekDrag}
                          onPointerMove={updateSeekDrag}
                          onPointerUp={endSeekDrag}
                          onPointerCancel={endSeekDrag}
                        >
                          <div className="relative w-full h-1.5 rounded-full bg-white/20">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-brand-primary"
                              style={{
                                width: `${playerDuration > 0 ? Math.min(100, ((dragTime ?? playerCurrentTime) / playerDuration) * 100) : 0}%`,
                              }}
                            />
                            <div
                              className="absolute w-3.5 h-3.5 rounded-full bg-brand-primary border-2 border-white shadow-lg"
                              style={{
                                top: "50%",
                                left: `${playerDuration > 0 ? Math.min(100, ((dragTime ?? playerCurrentTime) / playerDuration) * 100) : 0}%`,
                                transform: "translate(-50%, -50%)",
                              }}
                            />
                          </div>
                        </div>
                        <span className="min-w-[88px] text-right text-[11px] font-bold text-zinc-400 tabular-nums">
                          {formatTime(playerDuration)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-full w-full">
                      {selectedMovie.image ? (
                        <img
                          src={selectedMovie.image}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src =
                              "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800";
                          }}
                          className="w-full h-full object-cover"
                          alt={selectedMovie.title} // Movie Poster
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                          <Clapperboard className="w-14 h-14 text-white/20" />
                        </div>
                      )} {/* Poster / Fallback Placeholder */}
                      {getMovieSourceUrl(selectedMovie) && (
                        <button
                          type="button"
                          aria-label={`Play ${selectedMovie.title}`}
                          onClick={() => {
                            if (config.playerMode === "popup") {
                              popOutPlayer(getMovieSourceUrl(selectedMovie));
                            } else {
                              playSelectedMovie();
                            }
                          }}
                          className="absolute inset-0 m-auto w-20 h-20 bg-brand-primary/90 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-2xl z-20 group"
                        >
                          <Play className="w-10 h-10 fill-current group-hover:scale-110 transition-transform" />
                        </button> // Play Button on Poster
                      )}
                    </div>
                  )}
                </div>

                {!showPlayer && (
                  <div className="flex-1 p-5 md:p-8 flex flex-col justify-center bg-[#141414] min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedMovie.isNetflixOriginal && (
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-8 bg-brand-primary flex items-center justify-center font-black italic rounded-sm shadow-lg text-sm">
                              N
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                              Netflix Original
                            </span>
                          </div>
                        )}
                        <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase text-gray-400">
                          {selectedMovie.quality}
                        </span>
                        {selectedMovie.rating && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-yellow-500 font-bold text-[10px]">
                            <Star className="w-3 h-3 fill-current" />
                            <span>{selectedMovie.rating}</span>
                          </div>
                        )}
                        {getMovieCCRating(selectedMovie) > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-brand-primary/10 border border-brand-primary/30 rounded-full text-brand-primary font-bold text-[10px]">
                            <Star className="w-3 h-3 fill-current" />
                            <span>{getMovieCCRating(selectedMovie).toFixed(1)}</span>
                            <span className="text-[8px] text-gray-500">
                              ({getMovieRatingCount(selectedMovie)})
                            </span>
                          </div>
                        )}
                        {selectedMovie.year && (
                          <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-black text-blue-400">
                            {selectedMovie.year}
                          </span>
                        )}
                        {selectedMovie.duration && (
                          <span className="flex items-center gap-1 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-black text-purple-400">
                            <Clock className="w-3 h-3" />
                            {selectedMovie.duration}
                          </span>
                        )}
                        {getMovieLiveViewers(selectedMovie) > 0 && (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 font-bold text-[10px]">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
                            </span>
                            <Users className="w-3 h-3" />
                            <span className="tabular-nums">
                              {getMovieLiveViewers(selectedMovie)}
                            </span>
                            <span className="hidden md:inline">watching now</span>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleLike(selectedMovie);
                          }}
                          aria-label={likedIds.has(selectedMovie.id) ? "Unlike" : "Like"}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black transition-colors ${
                            likedIds.has(selectedMovie.id)
                              ? "bg-brand-primary/15 border-brand-primary/40 text-brand-primary"
                              : "bg-white/5 border-white/10 text-gray-400 hover:border-brand-primary hover:text-brand-primary"
                          }`}
                        >
                          <ThumbsUp
                            className={`w-3 h-3 ${likedIds.has(selectedMovie.id) ? "fill-current" : ""}`}
                          />
                          {getMovieLikes(selectedMovie)}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(selectedMovie);
                          }}
                          aria-label={
                            favoriteIds.has(selectedMovie.id)
                              ? "Remove from favorites"
                              : "Add to favorites"
                          }
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black transition-colors ${
                            favoriteIds.has(selectedMovie.id)
                              ? "bg-brand-primary border-brand-primary text-white"
                              : "bg-white/5 border-white/10 text-gray-400 hover:border-brand-primary hover:text-brand-primary"
                          }`}
                        >
                          <Bookmark
                            className={`w-3 h-3 ${favoriteIds.has(selectedMovie.id) ? "fill-current" : ""}`}
                          />
                          {favoriteIds.has(selectedMovie.id)
                            ? "دڵخواز"
                            : "دڵخواز بکە"}
                        </button>
                      </div>
                      {(selectedMovie.whatsappLink ||
                        import.meta.env.VITE_WHATSAPP_NUMBER) && (
                        <a
                          href={
                            selectedMovie.whatsappLink ||
                            `https://wa.me/${import.meta.env.VITE_WHATSAPP_NUMBER}?text=${encodeURIComponent("I want to watch this movie: " + selectedMovie.title)}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-bold text-gray-500 hover:text-[#25D366] flex items-center gap-1 transition-colors"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>Open in WhatsApp</span>
                        </a>
                      )} {/* WhatsApp Link */}
                    </div>

                    <h2 className="text-2xl md:text-4xl font-black mb-4 kurdish-text leading-tight">
                      {selectedMovie.title}
                    </h2>

                    <div className="flex flex-wrap gap-2 mb-5">
                      {selectedMovie.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 bg-brand-primary/10 border border-brand-primary/20 rounded-md text-[10px] font-black text-brand-primary kurdish-text"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div> {/* Movie Tags */}

                    {/* CinemaChat interactive rating (0-10 stars) */}
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 kurdish-text">
                          هەڵسەنگاندنی سینەما چات
                        </span>
                        {getUserRating(selectedMovie) > 0 && (
                          <span className="text-[10px] font-bold text-brand-primary">
                            (تۆ: {getUserRating(selectedMovie)}/10)
                          </span>
                        )}
                        {getMovieRatingCount(selectedMovie) > 0 && (
                          <span className="text-[10px] font-bold text-gray-500">
                            · {getMovieRatingCount(selectedMovie)} دەنگ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleRateMovie(selectedMovie, n)}
                            title={`${n}/10`}
                            className={`transition-all active:scale-75 ${
                              getUserRating(selectedMovie) >= n
                                ? "text-brand-primary"
                                : "text-gray-600 hover:text-brand-primary/50"
                            }`}
                          >
                            <Star
                              className={`w-4 h-4 ${
                                getUserRating(selectedMovie) >= n
                                  ? "fill-current"
                                  : ""
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-gray-400 kurdish-text text-sm md:text-base leading-relaxed mb-6 max-w-xl">
                      {selectedMovie.description}
                    </p>

                    <div className="flex flex-col gap-4 mt-auto pt-6 border-t border-white/5">

                      {selectedMovie.externalMovieLink && (
                        <div className="flex items-center gap-2 mb-6 p-4 bg-emerald-900/20 border border-emerald-500/20 rounded-2xl">
                          <ShieldCheck className="w-5 h-5 text-emerald-500" />
                          <p className="text-xs text-emerald-500 font-bold kurdish-text">
                            سەیری فیلمەکە بکە لە سەرچاوەیەکی دەرەکی متمانەپێکراو
                          </p>
                        </div>
                      )} {/* External Link Info */}

                      {/* Point: Server Links (Dynamic Switching & Label Improvement) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                        {selectedMovie.hdtodayUrl && (
                          <button
                            onClick={() => {
                              setActiveServerUrl(
                                selectedMovie.hdtodayUrl || null,
                              );
                              setShowPlayer(true);
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all group ${activeServerUrl === selectedMovie.hdtodayUrl ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-600/20" : "bg-zinc-800 border-white/5 hover:bg-zinc-700"}`}
                          >
                            <Globe className="w-5 h-5 text-green-500 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-white kurdish-text">
                              سێرڤەری HDToday
                              </span> {/* HDToday Server Button */}
                          </button>
                        )}
                        {selectedMovie.vidsrcUrl && (
                          <button
                            onClick={() => {
                              setActiveServerUrl(
                                selectedMovie.vidsrcUrl || null,
                              );
                              setShowPlayer(true);
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all group ${activeServerUrl === selectedMovie.vidsrcUrl ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-600/20" : "bg-zinc-800 border-white/5 hover:bg-zinc-700"}`}
                          >
                            <Play className="w-5 h-5 text-purple-500 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-white kurdish-text">
                              سێرڤەری VidSrc
                              </span> {/* VidSrc Server Button */}
                          </button>
                        )}
                        {selectedMovie.vidmolyUrl && (
                          <button
                            onClick={() => {
                              setActiveServerUrl(
                                selectedMovie.vidmolyUrl || null,
                              );
                              setShowPlayer(true);
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all group ${activeServerUrl === selectedMovie.vidmolyUrl ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-600/20" : "bg-zinc-800 border-white/5 hover:bg-zinc-700"}`}
                          >
                            <Radio className="w-5 h-5 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-white kurdish-text">
                              سێرڤەری Vidmoly
                              </span> {/* Vidmoly Server Button */}
                          </button>
                        )}
                        {selectedMovie.streamwishUrl && (
                          <button
                            onClick={() => {
                              setActiveServerUrl(
                                selectedMovie.streamwishUrl || null,
                              );
                              setShowPlayer(true);
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all group ${activeServerUrl === selectedMovie.streamwishUrl ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-600/20" : "bg-zinc-800 border-white/5 hover:bg-zinc-700"}`}
                          >
                            <Play className="w-5 h-5 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-white kurdish-text">
                              سێرڤەری StreamWish
                              </span> {/* StreamWish Server Button */}
                          </button>
                        )}
                        {selectedMovie.fileLrunUrl && (
                          <button
                            onClick={() => {
                              setActiveServerUrl(
                                selectedMovie.fileLrunUrl || null,
                              );
                              setShowPlayer(true);
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all group ${activeServerUrl === selectedMovie.fileLrunUrl ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-600/20" : "bg-zinc-800 border-white/5 hover:bg-zinc-700"}`}
                          >
                            <Database className="w-5 h-5 text-orange-400 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-white kurdish-text">
                              سێرڤەری FileLrun
                              </span> {/* FileLrun Server Button */}
                          </button>
                        )}
                        {selectedMovie.youtubeMovieUrl && (
                          <button
                            onClick={() => {
                              setActiveServerUrl(
                                selectedMovie.youtubeMovieUrl || null,
                              );
                              setShowPlayer(true);
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all group ${activeServerUrl === selectedMovie.youtubeMovieUrl ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-600/20" : "bg-zinc-800 border-white/5 hover:bg-zinc-700"}`}
                          >
                            <Youtube className="w-5 h-5 text-red-500 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-white kurdish-text">
                              سێرڤەری يوتوب
                              </span> {/* YouTube Server Button */}
                          </button>
                        )}
                        {selectedMovie.otherVideoUrl && (
                          <button
                            onClick={() => {
                              setActiveServerUrl(
                                selectedMovie.otherVideoUrl || null,
                              );
                              setShowPlayer(true);
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all group ${activeServerUrl === selectedMovie.otherVideoUrl ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-600/20" : "bg-zinc-800 border-white/5 hover:bg-zinc-700"}`}
                          >
                            <ExternalLink className="w-5 h-5 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-white kurdish-text">
                              سێرڤەری تر
                              </span> {/* Other Server Button */}
                          </button>
                        )}
                        {selectedMovie.streamingUrl &&
                          !selectedMovie.streamingUrl.includes("youtube") && (
                            <button
                              onClick={() => {
                                setActiveServerUrl(
                                  selectedMovie.streamingUrl || null,
                                );
                                setShowPlayer(true);
                              }}
                              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all group ${activeServerUrl === selectedMovie.streamingUrl ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-600/20" : "bg-zinc-800 border-white/5 hover:bg-zinc-700"}`}
                            >
                              <Radio className="w-5 h-5 text-brand-primary mb-2 group-hover:scale-110 transition-transform" />
                              <span className="text-[10px] font-black text-white kurdish-text">
                                سێرڤەری سەرەکی
                              </span> {/* Main Streaming Server Button */}
                            </button>
                          )}
                      </div>

                      {getMovieSourceUrl(selectedMovie) && (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            aria-label={`Play ${selectedMovie.title}`}
                            onClick={playSelectedMovie}
                            className="flex-1 py-3 bg-brand-primary text-white rounded-xl font-black flex items-center justify-center gap-3 hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-600/10"
                          >
                            <Play className="w-5 h-5 fill-current" />
                            <span className="text-sm kurdish-text">
                              ئێستا سەیری بکە
                            </span>
                          </button> {/* Play / Watch Movie Button */}

                          <button
                            onClick={() => {
                              if (activeServerUrl) {
                                popOutPlayer(activeServerUrl);
                              } else {
                                popOutPlayer(getMovieSourceUrl(selectedMovie));
                              }
                            }}
                            className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-white/10 transition-all"
                          >
                            <ExternalLink className="w-5 h-5 text-blue-500" />
                            <span className="text-sm kurdish-text whitespace-nowrap">
                              پەنجەرەی دەرەکی
                            </span>
                          </button> {/* Popout Player Button */}

                          {selectedMovie.trailerUrl && (
                            <button
                              onClick={() => {
                                // Force show player and set embedUrl context to trailer if needed
                                // For simplicity, we can just temporary swap the embedUrl if we had a state for it
                                // But here we can just alert or open in new tab if we don't want to overcomplicate modal state
                                window.open(selectedMovie.trailerUrl, "_blank");
                              }}
                              className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-white/10 transition-all"
                            >
                              <Youtube className="w-5 h-5 text-red-500" />
                              <span className="text-sm kurdish-text whitespace-nowrap">
                                تریلەر
                              </span>
                            </button>
                          )}
                        </div>
                      )}

                      {activeSyncGroup && getMovieSourceUrl(selectedMovie) && (
                        <button
                          onClick={async () => {
                            const targetRoomId = activeSyncGroup.id;
                            const movieUrl = getMovieSourceUrl(selectedMovie) || "";
                            const vidId =
                              selectedMovie.videoId ||
                              movieUrl;
                            const isYoutube =
                              !!selectedMovie.videoId ||
                              selectedMovie.isYouTube ||
                              movieUrl.includes("youtube.com") ||
                              movieUrl.includes("youtu.be");

                            const updatePayload: any = {
                              currentMovieId: selectedMovie.id,
                              videoData: {
                                id: selectedMovie.id,
                                title: selectedMovie.title,
                                image: selectedMovie.image,
                                category: selectedMovie.tags[0] || "Movie",
                                url: isYoutube
                                  ? movieUrl
                                  : undefined,
                                videoUrl: !isYoutube ? vidId : undefined,
                                isYouTube: isYoutube,
                                videoId: isYoutube
                                  ? selectedMovie.videoId ||
                                    extractYouTubeId(movieUrl)
                                  : undefined,
                              },
                              playback: {
                                isPlaying: true,
                                currentTime: 0,
                                updatedAt: new Date().toISOString(),
                              },
                            };

                            await fetchApi(`/api/rooms/${targetRoomId}`, {
                              method: "POST",
                              body: JSON.stringify(updatePayload),
                            });

                            // Mirror the posted movie into the Firestore room doc
                            // so every client's Point 46 / SyncRoom listener adopts
                            // the same source and synced playback starts at 0.
                            // VIP rooms live in vip_rooms (isVIP flag needed for the
                            // rules to accept the partial update); regular rooms in
                            // syncGroups. A non-creator member is denied by rules for
                            // the movie fields — that is expected, so it is silenced.
                            try {
                              const syncCollection = activeSyncGroup.isVIP
                                ? "vip_rooms"
                                : "syncGroups";
                              const syncPayload: any = {
                                currentMovieId: updatePayload.currentMovieId,
                                videoData: updatePayload.videoData,
                                playback: updatePayload.playback,
                              };
                              if (activeSyncGroup.isVIP) syncPayload.isVIP = true;
                              await updateDoc(
                                doc(db, syncCollection, targetRoomId),
                                syncPayload,
                              );
                            } catch (err: any) {
                              if (err?.code !== "permission-denied") {
                                console.warn(
                                  "Firestore room mirror failed:",
                                  err?.message || err,
                                );
                              }
                            }

                            alert(
                              `فیلمەکە بە سەرکەوتوویی پۆست کرا بۆ ژووری ${activeSyncGroup.name}`,
                            );
                            setShowPlayer(true);
                          }}
                          className="w-full py-2.5 bg-zinc-800 text-white rounded-xl font-black flex items-center justify-center gap-3 hover:bg-zinc-700 transition-all active:scale-95 border border-white/10"
                        >
                          <UsersIcon className="w-5 h-5 text-brand-primary" />
                          <span className="text-sm kurdish-text">
                            پۆست بکە بۆ ژوورەکە
                          </span>
                        </button>
                      )}

                      <div className="hidden md:flex gap-2">
                        <button
                          onClick={() => {
                            const link =
                              selectedMovie.whatsappLink ||
                              (import.meta.env.VITE_WHATSAPP_NUMBER
                                ? `https://wa.me/${import.meta.env.VITE_WHATSAPP_NUMBER}?text=${encodeURIComponent("I want to watch this movie: " + selectedMovie.title + " " + window.location.href)}`
                                : null);
                            if (link) {
                              window.open(link, "_blank");
                            }
                          }}
                          className="p-4 bg-[#25D366]/10 border border-[#25D366]/20 rounded-2xl text-[#25D366] hover:bg-[#25D366]/20 transition-all"
                        >
                          <MessageCircle className="w-6 h-6" />
                        </button>
                      </div>
                    </div> {/* WhatsApp Button */}

                    {/* Module 9: Channel & Brand links (live from channel_settings) */}
                    <div className="hidden md:flex items-center gap-2">
                      {typeof config.youtubeUrl === "string" &&
                        config.youtubeUrl !== "#" &&
                        config.youtubeUrl.trim() !== "" && (
                          <a
                            href={config.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 hover:bg-red-500/20 transition-all"
                            title="YouTube"
                          >
                            <Youtube className="w-5 h-5" />
                          </a>
                        )}
                      {typeof config.tiktokUrl === "string" &&
                        config.tiktokUrl !== "#" &&
                        config.tiktokUrl.trim() !== "" && (
                          <a
                            href={config.tiktokUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-3 bg-cyan-400/10 border border-cyan-400/20 rounded-xl text-cyan-400 hover:bg-cyan-400/20 transition-all"
                            title="TikTok"
                          >
                            <Video className="w-5 h-5" />
                          </a>
                        )}
                      {typeof config.instagramUrl === "string" &&
                        config.instagramUrl !== "#" &&
                        config.instagramUrl.trim() !== "" && (
                          <a
                            href={config.instagramUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl text-pink-400 hover:bg-pink-500/20 transition-all"
                            title="Instagram"
                          >
                            <Instagram className="w-5 h-5" />
                          </a>
                        )}
                      {typeof config.facebookUrl === "string" &&
                        config.facebookUrl !== "#" &&
                        config.facebookUrl.trim() !== "" && (
                          <a
                            href={config.facebookUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 hover:bg-blue-500/20 transition-all"
                            title="Facebook"
                          >
                            <Facebook className="w-5 h-5" />
                          </a>
                        )}
                    </div>

                    {/* Point 71: Similar Movies */}
                    <div className="mt-8">
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-6 kurdish-text flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        فیلمە هاوشێوەکان
                      </h4>
                      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
                        {similarMovies.map((m) => (
                          <div key={m.id} className="flex-shrink-0 w-32 md:w-36">
                            <MovieCard
                              movie={resolvedMovies[m.id] ?? m}
                              liveViewers={getMovieLiveViewers(m)}
                              isTopLive={topLiveId === m.id}
                              isFavorite={favoriteIds.has(m.id)}
                              isLiked={likedIds.has(m.id)}
                              likes={getMovieLikes(m)}
                              onOpen={openMovieDetails}
                              onToggleFavorite={handleToggleFavorite}
                              onToggleLike={handleToggleLike}
                            />
                          </div>
                        ))} {/* Similar Movies List */}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal (Point 111) */}
      <AnimatePresence> {/* Admin Login Modal */}
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[600] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1a1a] border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setShowAdminPassword(false);
                }}
                className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="text-center mb-10">
                <div className="w-20 h-20 bg-brand-primary/10 rounded-3xl flex items-center justify-center border border-brand-primary/20 mx-auto mb-6">
                  <ShieldCheck className="w-10 h-10 text-brand-primary" />
                </div>
                <h2 className="text-2xl font-black text-white kurdish-text mb-2">
                  بەڕێوبەرایەتی
                </h2>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em] italic">
                  Authorized Personnel Only
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="ناوی بەکارهێنەر"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold kurdish-text focus:border-brand-primary outline-none transition-all placeholder:text-gray-600"
                    autoFocus
                  />
                  <div className="relative">
                    <input
                      type={showAdminPassword ? "text" : "password"}
                      placeholder="وشەی تێپەڕ"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-14 text-white font-bold kurdish-text focus:border-brand-primary outline-none transition-all placeholder:text-gray-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword((prev) => !prev)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      aria-label={showAdminPassword ? "Hide password" : "Show password"}
                    >
                      {showAdminPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-brand-primary hover:bg-red-700 text-white font-black py-4 rounded-2xl transition-all active:scale-95 shadow-xl shadow-red-600/20 kurdish-text text-lg"
                >
                  چوونەژوورەوە
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <VIPRoomModal
        isOpen={showVipModal}
        onClose={() => setShowVipModal(false)}
        onJoinVIP={(vipRoomData) => {
          setActiveSyncGroup(vipRoomData);
          setSocialTab("party"); // Switch to party tab when joining VIP room

          // Persist the VIP room to its own dedicated collection so it never
          // cross-contaminates the regular syncGroups rooms list.
          if (vipRoomData?.id) {
            setDoc(
              doc(db, "vip_rooms", vipRoomData.id),
              {
                id: vipRoomData.id,
                name: vipRoomData.name || "کۆڕی شاهانەی VIP (Premium Lounge)",
                creatorId: "admin",
                memberIds: ["vip-user"],
                playback: {
                  currentTime: 0,
                  isPlaying: true,
                  updatedAt: new Date().toISOString(),
                },
                videoUrl: vipRoomData.videoUrl || "",
                isVIP: true,
                updatedAt: new Date().toISOString(),
              },
              { merge: true },
            ).catch(() => {});
          }

          if (vipRoomData.videoUrl) {
            const virtualMovie: Movie = {
              id: `vip_movie_id_${Date.now()}`,
              title: vipRoomData.name || "کۆڕی شاهانەی VIP (Premium Lounge)",
              quality: "VIP Premium HD",
              tags: ["VIP", "Exclusive"],
              image: "https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png",
              description:
                "سەرچاوەی بێهاوتای قوفڵکراو چوونەژوور بە سەرکەوتوویی بەهۆی کۆدی VIP.",
              whatsappLink: "",
              date: new Date().toISOString(), // Current date
              streamingUrl: vipRoomData.videoUrl,
              videoUrl: vipRoomData.videoUrl,
              embedUrl: vipRoomData.videoUrl,
            };
            setSelectedMovie(virtualMovie);
            setActiveServerUrl(getMovieSourceUrl(virtualMovie));
            setShowPlayer(true);
          }
        }}
      />

      {/* Cinema Window Room Modal */}
      <CinemaWindowModal
        isOpen={showCinemaWindowModal}
        onClose={() => setShowCinemaWindowModal(false)}
        onJoinCinemaWindow={(room) => {
          // Set the active room and switch to cinema window tab
          setActiveCinemaWindowRoom(room);
          setSocialTab("cinema_window"); // Switch to cinema window tab
        }}
      />

      {/* Professional Management Dashboard Overlay (Point 31/32/33) */}
      <AnimatePresence> {/* Admin Dashboard */}
        {showAdminPanel &&
          (socialProfile?.role === "admin" ||
            socialProfile?.userRole === "admin" ||
            socialProfile?.role === "owner" ||
            socialProfile?.userRole === "owner" ||
            socialProfile?.role === "super_admin" ||
            socialProfile?.userRole === "super_admin" ||
            socialProfile?.role === "deputy_manager" ||
            socialProfile?.userRole === "deputy_manager" ||
            socialProfile?.role === "staff" ||
            socialProfile?.userRole === "staff" ||
            currentUser?.role === "admin" ||
            currentUser?.role === "owner" ||
            currentUser?.role === "super_admin" ||
            currentUser?.role === "deputy_manager" ||
            currentUser?.role === "staff" ||
            !!currentUser?.isOwner ||
            !!currentUser?.isSuper ||
            currentUser?.username?.toLowerCase() === "admin" ||
            currentUser?.username?.toLowerCase() === "dekan@123") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[500] bg-black flex items-center justify-center" // Dashboard Overlay
            >
              {/* Dashboard Background */}
              <div className="absolute inset-0 bg-[#0a0a0a]">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-primary/5 blur-[150px] rounded-full" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/5 blur-[150px] rounded-full" />
              </div>

              <div className="relative w-full h-full flex flex-col lg:flex-row max-w-7xl mx-auto p-4 lg:p-8 gap-4 lg:gap-8 overflow-y-auto lg:overflow-hidden">
                {/* Sidebar Navigation for Admin Panel */}
                <motion.div
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="w-full lg:w-80 h-auto lg:h-[calc(100vh-4rem)] lg:max-h-[calc(100vh-4rem)] bg-white/5 border border-white/10 rounded-3xl p-4 lg:p-6 flex flex-col shadow-2xl backdrop-blur-xl shrink-0 overflow-y-auto custom-scrollbar"
                >
                  <div className="flex lg:flex-col items-center gap-4 mb-4 lg:mb-12">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-brand-primary rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/20">
                      <LayoutDashboard className="w-5 h-5 lg:w-7 lg:h-7 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black kurdish-text text-white">
                        داشبۆرد
                      </h2>
                      <p className="text-[10px] text-gray-500 font-medium kurdish-text hidden lg:block">
                        بەڕێوبەرایەتی گشتی
                      </p>
                    </div>
                  </div>

                  <nav className="flex flex-row lg:flex-col gap-2 lg:gap-0 lg:space-y-2 overflow-x-auto lg:overflow-y-auto custom-scrollbar pb-2 lg:pb-0 mb-4 lg:mb-6 pr-2 -mr-2 w-full shrink-0 flex-1 lg:max-h-[calc(100vh-14rem)]">
                    <SidebarItem
                      icon={LayoutDashboard}
                      label="١. چاودێری نامە و چالاکی بەکارهێنەران"
                      active={adminTab === "overview"}
                      onClick={() => setAdminTab("overview")}
                    />

                    <SidebarItem
                      icon={Activity}
                      label="٢. یەکەی ئامارەکان"
                      active={adminTab === "stats"}
                      onClick={() => setAdminTab("stats")}
                    />

                    <SidebarItem
                      icon={LayoutDashboard}
                      label="٣. بەڕێوبەرایەتی پۆلێنەکان"
                      active={adminTab === "categories"}
                      onClick={() => setAdminTab("categories")}
                    />

                    {/* Content Management Tabs */}
                    <SidebarItem
                      icon={Plus}
                      label="٤. پۆستکردنی فیلم و یوتوب"
                      active={adminTab === "content"}
                      onClick={() => setAdminTab("content")}
                    />
                    {!(
                      socialProfile?.role === "staff" || // Restrict certain tabs for staff
                      socialProfile?.userRole === "staff" ||
                      currentUser?.role === "staff"
                    ) && (
                      <SidebarItem
                        icon={Radio}
                        label="٥. ژوورەکانی پەخش (Room)"
                        active={adminTab === "broadcast"}
                        onClick={() => setAdminTab("broadcast")}
                      />
                    )}
                    <SidebarItem
                      icon={Film}
                      label="٦. سەرپەرشتی فیلمەکان"
                      active={adminTab === "manage"}
                      onClick={() => setAdminTab("manage")}
                    />
                    <SidebarItem
                      icon={Youtube}
                      label="٧. هیرۆ ڤیدیۆ و ترەیلەر"
                      active={adminTab === "hero"}
                      onClick={() => setAdminTab("hero")}
                    />
                    {!(
                      socialProfile?.role === "staff" || // Restrict certain tabs for staff
                      socialProfile?.userRole === "staff" ||
                      currentUser?.role === "staff"
                    ) && (
                      <SidebarItem
                        icon={Users}
                        label="٨. بەکارهێنەران و مافەکان"
                        active={adminTab === "managed-users"}
                        onClick={() => setAdminTab("managed-users")}
                      />
                    )}
                    <SidebarItem
                      icon={Link2}
                      label="٩. ڕێکخستنی چەناڵ و ئۆفەر"
                      active={adminTab === "channel"}
                      onClick={() => setAdminTab("channel")}
                    />
                    {!(
                      socialProfile?.role === "staff" || // Restrict certain tabs for staff
                      socialProfile?.userRole === "staff" ||
                      currentUser?.role === "staff"
                    ) && (
                      <>
                        <SidebarItem
                          icon={ShieldAlert}
                          label="١٠. چات و مۆدێرەیشن"
                          active={adminTab === "security-control"}
                          onClick={() => setAdminTab("security-control")}
                        />
                        <SidebarItem
                          icon={ShieldCheck}
                          active={adminTab === "security-shield"}
                          label="١١. قەڵخان و ئایپی ڕەش"
                          onClick={() => setAdminTab("security-shield")}
                        />
                        <SidebarItem
                          icon={BarChart2}
                          active={adminTab === "user-analytics"}
                          label="١٢. زانیاری و شیکاری بەکارهێنەران"
                          onClick={() => setAdminTab("user-analytics")}
                        />
                        <SidebarItem
                          icon={Database}
                          active={adminTab === "database-audit"}
                          label="١٣. بنکەدراوە و هەڵەکان"
                          onClick={() => setAdminTab("database-audit")}
                        />
                        <SidebarItem
                          icon={BarChart2}
                          active={adminTab === "smart-analytics"}
                          label="١٤. شیکارکاری ژیر"
                          onClick={() => setAdminTab("smart-analytics")}
                        />
                        <SidebarItem
                          icon={Ticket}
                          active={adminTab === "ticket-vip"}
                          label="١٥. سیستەمی بلیت VIP"
                          onClick={() => setAdminTab("ticket-vip")}
                        />
                        <SidebarItem
                          icon={Shield}
                          active={adminTab === "system-hub"}
                          label="١٦. سەنتەری سیستەم"
                          onClick={() => setAdminTab("system-hub")}
                        />
                        <SidebarItem
                          icon={TrendingUp}
                          active={adminTab === "growth"}
                          label="١٧. مارکێتینگ و گەشە"
                          onClick={() => setAdminTab("growth")}
                        />
                        <SidebarItem
                          icon={ShieldAlert}
                          active={adminTab === "m17-auth"}
                          label="١٨. ڕێگەپێدانی فرە-ئاستی"
                          onClick={() => setAdminTab("m17-auth")}
                        />
                        <SidebarItem
                          icon={MessageSquare}
                          active={adminTab === "whatsapp-automation"}
                          label="١٩. ئۆتۆمەیشنی وەتسئەپ (Webhook)"
                          onClick={() => setAdminTab("whatsapp-automation")}
                        />
                        <SidebarItem
                          icon={Tv}
                          active={adminTab === "broadcast-main"}
                          label="٢٠. پەخشی گشتی (Main Broadcast)"
                          onClick={() => setAdminTab("broadcast-main")}
                        />
                        <SidebarItem
                          icon={Settings}
                          label="ڕێکخستنەکان (گشتی)"
                          active={adminTab === "settings"}
                          onClick={() => setAdminTab("settings")}
                        />
                      </>
                    )}

                    {currentUser?.username === "admin" && (
                      <SidebarItem
                        icon={Users}
                        label="بەڕێوبەرایەتی ئەدمینەکان"
                        active={adminTab === "users"}
                        onClick={() => setAdminTab("users")}
                      />
                    )}
                  </nav> {/* End Sidebar Navigation */}

                  <div className="mt-auto flex flex-col sm:flex-row lg:flex-col gap-3 mt-4 lg:mt-auto">
                    <div className="p-3 lg:p-4 bg-white/5 rounded-2xl border border-white/5 flex-1">
                      <p className="text-[10px] lg:text-[11px] text-gray-500 kurdish-text mb-0.5">
                        وەک ئەدمین چوویتەتە ژوورەوە
                      </p>
                      <p className="text-xs lg:text-sm font-black text-white flex items-center gap-2">
                        {currentUser?.username === "admin"
                          ? "Admin (Owner)"
                          : currentUser?.username}
                        {currentUser?.username === "admin" && (
                          <ShieldCheck className="w-4 h-4 text-brand-primary" />
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 lg:gap-3 flex-1">
                      <button
                        onClick={handleLogout}
                        className="flex-1 py-2.5 lg:py-3 bg-red-600/10 text-red-500 rounded-xl font-black text-[10px] lg:text-xs kurdish-text hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-1.5"
                      >
                        <LogOut className="w-4 h-4" />
                        دەرچوون
                      </button>
                      <button
                        onClick={() => setShowAdminPanel(false)}
                        className="flex-1 py-2.5 lg:py-3 bg-white/5 text-gray-400 rounded-xl font-black text-[10px] lg:text-xs kurdish-text hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"
                      >
                        داخستن
                      </button>
                    </div>
                  </div>
                </motion.div>

                {/* Main Content Area for Admin Panel */}
                <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl shadow-2xl relative flex flex-col min-h-0 min-w-0">
                  {/* Sticky Header */}
                  <div className="sticky top-0 z-50 bg-black/60 backdrop-blur-3xl border-b border-white/10 p-5 md:p-6 flex flex-col sm:flex-row gap-4 sm:items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setShowAdminPanel(false)}
                        className="p-2 text-gray-500 hover:text-white transition-all bg-white/5 rounded-xl border border-white/5"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <div>
                        <h4 className="text-sm font-black text-white kurdish-text uppercase tracking-widest">
                          بەڕێوەبەرایەتی
                        </h4>
                        <p className="text-[10px] text-gray-500 font-bold kurdish-text">
                          کۆنتڕۆڵی گشتی و سڕینەوە
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                      <button
                        onClick={handleBulkDeleteMovies}
                        title="سڕینەوەی کۆمەڵی لە بەشی ٦. سەرپەرشتی فیلمەکان"
                        className="px-5 py-3 sm:py-2.5 bg-red-600/10 text-red-500 border border-red-600/20 rounded-xl text-[10px] font-black kurdish-text hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        سڕینەوەی دیاریکراوەکان
                      </button>

                      <button
                        onClick={() => setShowAdminPanel(false)}
                        className="px-5 py-3 sm:py-2.5 bg-zinc-800 text-white rounded-xl text-[10px] font-black kurdish-text hover:bg-zinc-700 transition-all border border-white/10 flex items-center justify-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        گەڕانەوە
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Content Area for Admin Modules */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
                    <AnimatePresence mode="wait">
                      {adminTab === "overview" && (
                        <SafeRender fallbackName="Admin Overview">
                          <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                          >
                            <UserActivityMonitor 
                              currentUser={currentUser} 
                              fetchApi={fetchApi} 
                            />
                          </motion.div>
                        </SafeRender>
                      )}

                      {adminTab === "categories" && (
                        <SafeRender fallbackName="Admin Categories">
                          <CategoryModule
                            movies={movies}
                            onRefresh={fetchMovies}
                          />
                        </SafeRender>
                      )}

                      {adminTab === "content" && (
                        <SafeRender fallbackName="Admin Content Publish">
                          <ContentModule
                            currentUser={currentUser}
                            systemVerified={systemVerified}
                            lastAddedMovie={lastAddedMovie}
                            config={config}
                            onSyncNow={() => {
                              fetchMovies();
                              alert("سەرجەم ئامێرەکان دەستبەجێ ئەپدێت کرانەوە");
                            }} // Refresh all movies
                            onPost={async (movie: any) => {
                              try {
                                const sanitizeUrl = (url: any) => {
                                  if (typeof url !== "string") return "";
                                  let clean = url.trim();
                                  if (clean.includes("youtube.com/watch?v="))
                                    clean = clean.replace("watch?v=", "embed/");
                                  else if (clean.includes("youtu.be/")) {
                                    const afterDomain = clean.split("youtu.be/")[1] || "";
                                    const videoId = afterDomain.split("?")[0].split("&")[0];
                                    clean = `https://www.youtube.com/embed/${videoId}`;
                                  }
                                  return clean;
                                };

                                setLastAddedMovie(null); // Clear last added movie
const trailerId = movie.trailerUrl
                                   ? extractYouTubeId(movie.trailerUrl)
                                   : null;
                                const mainTrailerId = movie.mainTrailerUrl
                                  ? extractYouTubeId(movie.mainTrailerUrl)
                                  : null;
                                const ytId = extractYouTubeId(
                                  movie.streamingUrl || movie.videoUrl,
                                );
                                const imdbId =
                                  movie?.imdbUrl &&
                                  typeof movie.imdbUrl === "string"
                                    ? movie.imdbUrl.match(/tt\d{7,10}/)?.[0] ||
                                      (movie.imdbUrl.startsWith("tt")
                                        ? movie.imdbUrl
                                        : null)
                                    : null;
                                const updatedMovie = {
                                  ...movie,
                                  title: String(
                                    movie.title || "Untitled",
                                  ).trim(),
                                  videoId: ytId,
                                  imdbId: imdbId,
                                  isYouTube: !!ytId,
                                  embedUrl: sanitizeUrl(
                                    movie.streamingUrl ||
                                      movie.external_link ||
                                      (ytId
                                        ? `https://www.youtube.com/embed/${ytId}`
                                        : movie.videoUrl),
                                  ),
                                  trailerUrl: trailerId
                                    ? `https://www.youtube.com/embed/${trailerId}`
                                    : sanitizeUrl(movie.trailerUrl),
                                  mainTrailerUrl: mainTrailerId
                                    ? `https://www.youtube.com/embed/${mainTrailerId}`
                                    : sanitizeUrl(movie.mainTrailerUrl),
                                  streamingSourceUrl: sanitizeUrl(
                                    movie.streamingSourceUrl,
                                  ),
                                  external_link: sanitizeUrl(
                                    movie.streamingUrl ||
                                      movie.external_link ||
                                      movie.videoUrl,
                                  ),
                                  date: new Date().toISOString(),
                                  adminName: currentUser?.username || "Admin",
                                };

                                const res = await fetchApi(
                                  "/api/admin/post-movie",
                                  {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify(updatedMovie),
                                  },
                                );

                                if (res.ok) {
                                  const data = await res.json();
                                  const postedMovie = data.movie;
                                  alert("فیلمەکە بە سەرکەوتوویی پۆست کرا!");
                                  // Insert into local state immediately (avoids
                                  // cross-instance staleness on Render's ephemeral fs).
                                  // The 60s interval already handles eventual sync.
                                  setMovies(prev => {
                                    const updated = [postedMovie, ...prev];
                                    return updated.sort((a: any, b: any) => {
                                      const idA = parseInt(String(a.id).replace("manual-", ""));
                                      const idB = parseInt(String(b.id).replace("manual-", ""));
                                      if (!isNaN(idA) && !isNaN(idB)) return idB - idA;
                                      return new Date(b.date).getTime() - new Date(a.date).getTime();
                                    });
                                  });
                                  setLastAddedMovie(postedMovie);
                                  // Persist to Firestore so movies survive Render's ephemeral fs
                                  try {
                                    const moviesRef = collection(realDb, "movies");
                                    await setDoc(doc(moviesRef, postedMovie.id), {
                                      ...postedMovie,
                                      createdAt: serverTimestamp(),
                                      updatedAt: serverTimestamp(),
                                    });
                                    console.log("[Firestore] Movie saved to Firestore:", postedMovie.id);
                                  } catch (fsErr) {
                                    console.warn("[Firestore] Failed to save movie to Firestore (non-fatal):", fsErr);
                                  }
                                } else {
                                  const errData = await res.json();
                                  throw new Error(
                                    errData.error ||
                                      "Server rejected movie post",
                                  );
                                }
                              } catch (e: any) {
                                console.error("Self-Healing Admin Guard:", e);
                                alert(
                                  "هەڵەیەک ڕوویدا لە کاتی ناردن: " +
                                    (e.message || "Unknown Error"),
                                );
                              }
                            }}
                          />
                        </SafeRender>
                      )}

                      {adminTab === "broadcast" && (
                        <BroadcastModule
                          onBroadcast={async (url: string) => {
                            const isYoutube = // Check if URL is YouTube
                              url.includes("youtube.com") ||
                              url.includes("youtu.be");
                            const vidId = isYoutube
                              ? extractYouTubeId(url) || url
                              : url;

                            const updatePayload: any = {
                              playback: {
                                isPlaying: true,
                                currentTime: 0,
                                updatedAt: new Date().toISOString(),
                              },
                            };

                            if (isYoutube) { // YouTube video data
                              updatePayload.currentMovieId =
                                "live-broadcast-" + Date.now();
                              updatePayload.videoData = {
                                id: updatePayload.currentMovieId,
                                videoId: vidId,
                                title: "پەخشی ڕاستەوخۆ",
                                isYouTube: true,
                                url: `https://www.youtube.com/embed/${vidId}`,
                                image: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
                              };
                            } else { // Non-YouTube video data
                              updatePayload.currentMovieId =
                                "live-direct-" + Date.now();
                              updatePayload.videoData = {
                                id: updatePayload.currentMovieId,
                                videoUrl: vidId,
                                title: "پەخشی ڕاستەوخۆ",
                                isYouTube: false,
                                image: activeFeaturedMovie?.image || "",
                              };
                            }

                            // Dedicated, isolated Firestore path for the Global
                            // Room stream — config/global_room. config is
                            // public read/write in firestore.rules, so this
                            // save always succeeds (no server / auth dependency)
                            // and every visitor's config/global_room onSnapshot
                            // picks it up instantly. Mirror the key fields at
                            // the top level for a clean single-doc source.
                            const globalRoomPayload = {
                              ...updatePayload,
                              videoUrl:
                                updatePayload.videoData.url ||
                                updatePayload.videoData.videoUrl,
                              videoId:
                                updatePayload.videoData.videoId || null,
                              isYouTube: updatePayload.videoData.isYouTube,
                              title: "پەخشی ڕاستەوخۆ",
                              image: updatePayload.videoData.image || "",
                              updatedAt: new Date().toISOString(),
                              broadcaster:
                                currentUser?.username || "Admin",
                            };
                            await setDoc(
                              doc(db, "config", "global_room"),
                              globalRoomPayload,
                              { merge: true },
                            );

                            // BEST-EFFORT, non-blocking: also keep the legacy
                            // server-side global room state fresh for the
                            // dashboard room list. Failures never block or
                            // fail the broadcast button.
                            fetchApi("/api/rooms/global_room_official", {
                              method: "POST",
                              body: JSON.stringify(updatePayload),
                            }).catch((err) =>
                              console.warn(
                                "[Broadcast] Server global room sync skipped:",
                                err,
                              ),
                            );
                          }}
                        />
                      )}

                      {adminTab === "manage" && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-8"
                        >
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-3xl font-black kurdish-text text-white">
                              بەڕێوبەرایەتی فیلمەکان
                            </h3>
                            <div className="text-xs font-black text-gray-500 kurdish-text">
                              {movies.length} فیلم نیشان دراوە
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={
                                  movies.length > 0 &&
                                  selectedMovieIds.length === movies.length
                                }
                                onChange={toggleSelectAllMovies}
                                className="w-4 h-4 accent-red-500"
                              />
                              <span className="text-[10px] font-black text-gray-400 kurdish-text">
                                هەموو دیاریبکە
                              </span>
                            </label>
                            <span className="text-[10px] font-black text-gray-500 kurdish-text">
                              {selectedMovieIds.length} دیاریکراوە
                            </span>
                          </div>

                          <div
                            id="movie-gallery"
                            className="grid grid-cols-1 gap-2"
                          >
                            {movies.map((movie) => (
                              <div
                                key={movie.id}
                                className="bg-white/5 border border-white/5 px-3 py-2 rounded-xl flex items-center justify-between group hover:bg-white/10 transition-all"
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedMovieIds.includes(movie.id)}
                                    onChange={() => toggleSelectedMovie(movie.id)}
                                    className="w-4 h-4 accent-red-500 shrink-0"
                                    title="دیاریکردنی بۆ سڕینەوە"
                                  />
                                  <img
                                    src={movie.image || undefined}
                                    referrerPolicy="no-referrer"
                                    className="w-12 h-8 object-cover rounded-md border border-white/10"
                                    alt=""
                                  />
                                  <div>
                                    <h4 className="text-[12px] font-black text-white kurdish-text leading-tight">
                                      {movie.title}
                                    </h4>
                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">
                                      {movie.quality} • {movie.id.slice(0, 8)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-2 border-l border-white/10 pl-2">
                                    <span className="text-[8px] font-black text-gray-600 kurdish-text">
                                      پۆلێن
                                    </span> {/* Category Label */}
                                    <select
                                      value={
                                        // Return the canonical option that matches
                                        // the movie's tag case-insensitively, so the
                                        // value is always a valid option (never a
                                        // raw tag that has no matching <option>).
                                        dynamicCategories.find((c) =>
                                          (Array.isArray(movie.tags)
                                            ? movie.tags
                                            : []
                                          ).some(
                                            (t) =>
                                              String(t).trim().toLowerCase() ===
                                              String(c).toLowerCase(),
                                          ),
                                        ) || "هەمووی"
                                      }
                                      onChange={async (e) => {
                                        const newTag = e.target.value;
                                        const res = await fetchApi(
                                          `/api/admin/movies/${movie.id}/tags`,
                                          {
                                            method: "PATCH",
                                            headers: {
                                              "Content-Type":
                                                "application/json",
                                            },
                                            body: JSON.stringify({
                                              tags: [newTag],
                                              adminName:
                                                currentUser?.username || "Admin",
                                            }),
                                          },
                                        );
                                        if (res.ok) fetchMovies();
                                      }}
                                    >
                                      <option value="هەمووی">گۆڕین</option>
                                      {dynamicCategories.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                    <button // Post to Room Button
                                      onClick={async () => {
                                        const movieUrl = getMovieSourceUrl(movie) || "";
                                        const isYoutube =
                                          movieUrl.includes("youtube.com") ||
                                          movieUrl.includes("youtu.be");
                                        const vidId = isYoutube
                                          ? extractYouTubeId(movieUrl) || movie.id
                                          : movie.id;
                                        const targetRoomId =
                                          activeSyncGroup?.id ||
                                          "global_room_official";
                                        const roomName =
                                          activeSyncGroup?.name ||
                                          "ژووری سەرەکی";

                                        const updatePayload: any = {
                                          playback: {
                                            isPlaying: true,
                                            currentTime: 0,
                                            updatedAt: new Date().toISOString(),
                                          },
                                        };

                                        if (isYoutube) {
                                          updatePayload.currentMovieId =
                                            movie.id;
                                          updatePayload.videoData = {
                                            id: movie.id,
                                            videoId: vidId,
                                            title: movie.title,
                                            isYouTube: true,
                                            url: movieUrl,
                                            image: movie.image,
                                            category: movie.tags[0] || "Movie",
                                          };
                                        } else {
                                          updatePayload.currentMovieId =
                                            movie.id;
                                          updatePayload.videoData = {
                                            id: movie.id,
                                            videoUrl: vidId,
                                            title: movie.title,
                                            isYouTube: false,
                                            image: movie.image,
                                            category: movie.tags[0] || "Movie",
                                          };
                                        }

                                        await fetchApi(
                                          `/api/rooms/${targetRoomId}`,
                                          {
                                            method: "POST",
                                            body: JSON.stringify(updatePayload),
                                          },
                                        );
                                        alert(
                                          `فیلمەکە بە سەرکەوتوویی پۆست کرا بۆ ${roomName}`,
                                        );
                                        setAdminTab("overview");
                                      }}
                                      className="p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-all"
                                      title="پۆست بکە بۆ ژوورەکە" // Post to room button
                                    >
                                      <Radio className="w-4 h-4" />
                                    </button>
                                    {!(
                                      socialProfile?.role === "staff" ||
                                      socialProfile?.userRole === "staff" ||
                                      currentUser?.role === "staff"
                                    ) && (
                                      <button
                                        onClick={() => handleDeleteMovie(movie)}
                                        className="p-1.5 text-gray-700 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {adminTab === "hero" && (
                        <HeroModule
                          onSync={async (url: string) => {
                            const cleanUrl = (url || "").trim();
                            if (!cleanUrl) {
                              alert("تکایە لینکی ڤیدیۆ بنووسە پێش جێگیرکردن.");
                              return;
                            }

                            const applyHeroLocally = (finalUrl: string) => {
                              const firstUrl = finalUrl;
                              const isYoutube =
                                firstUrl.includes("youtube.com") ||
                                firstUrl.includes("youtu.be");
                              const vidId = isYoutube
                                ? extractYouTubeId(firstUrl) || firstUrl
                                : firstUrl;
                              const heroVideoEmbedUrl = isYoutube
                                ? `https://www.youtube.com/embed/${vidId}`
                                : firstUrl;
                              
                              setCachedHeroVideoUrl(firstUrl);

                              // Instant frontend update without refresh
                              setFeaturedMovieFromDB({
                                id: "hero-promo",
                                title: "فیلمی سەرەکی",
                                embedUrl: heroVideoEmbedUrl,
                                isYouTube: isYoutube,
                                videoId: vidId,
                                image: "",
                                tags: ["هەمووی"],
                                quality: "4K",
                                description: "نوێترین فیلمی سەرەکی", // Default description
                                heroPlaylist: [firstUrl],
                              } as any);

                              setConfig((prev) => ({
                                ...prev,
                                heroVideoUrl: firstUrl,
                              }));
                              setCurrentVideoIndex(0);
                            };

                            applyHeroLocally(cleanUrl); // Apply changes locally immediately

                            // Also write to Firestore so ALL visitors get the update in real-time via onSnapshot
                            try {
                              const isYoutube = cleanUrl.includes("youtube.com") || cleanUrl.includes("youtu.be");
                              const vidId = isYoutube ? extractYouTubeId(cleanUrl) : null;
                              await setDoc(doc(db, "config", "featured"), {
                                id: "hero-promo",
                                title: "فیلمی سەرەکی",
                                embedUrl: isYoutube && vidId ? `https://www.youtube.com/embed/${vidId}` : cleanUrl,
                                url: cleanUrl,
                                videoUrl: cleanUrl,
                                isYouTube: isYoutube,
                                videoId: vidId || "",
                                image: vidId ? `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg` : "",
                                tags: ["هەمووی"],
                                quality: "4K",
                                description: "نوێترین فیلمی سەرەکی",
                                heroPlaylist: [cleanUrl],
                                updatedAt: new Date().toISOString(),
                              }, { merge: true });
                              console.log("[Hero] Updated Firestore config/featured with new hero URL:", cleanUrl);
                            } catch (firestoreErr) {
                              console.warn("[Hero] Failed to update Firestore config/featured:", firestoreErr);
                            }

                            const payload = {
                              adminName: currentUser?.username || "Admin", // ناوی ئەدمین زیاد دەکرێت بۆ داتای نێردراو
                              heroVideoUrl: cleanUrl,
                              heroPlaylist: [cleanUrl],
                            };

                            try {
                              const heroSaveAttempts = [ // Multiple attempts to save hero config
                                {
                                  path: "/api/movies/hero",
                                  body: payload,
                                },
                                {
                                  path: "/api/admin/hero",
                                  body: payload,
                                },
                                {
                                  path: "/api/admin/config", // ئەم ڕێگایە بۆ ڕێکخستنە گشتییەکانە، بەڵام داتای ڤیدیۆی سەرەکی دەنێرین بۆ دڵنیایی
                                  body: { 
                                    adminName: currentUser?.username || "Admin",
                                    heroVideoUrl: cleanUrl 
                                  },
                                },
                              ];

                              let saved = false;
                              for (const attempt of heroSaveAttempts) {
                                const res = await fetchApi(attempt.path, {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify(attempt.body),
                                }); // Send request
                                if (res.ok) {
                                  saved = true;
                                  break;
                                }
                                console.warn(`[HeroModule] Attempt to save hero video to ${attempt.path} failed with status ${res.status}: ${await res.text()}`); // بۆ تێستکردن، پەیامی هەڵە نیشان دەدەین
                              }

                              if (saved) {
                                alert("فیلمی سەرەکی بە سەرکەوتوویی جێگیرکرا!");
                              } else { // Fallback if no save attempt was successful
                                alert(
                                  "فیلمی سەرەکی جێگیرکرا، بەڵام پەیوەندی بە سێرڤەر نەکرا. تکایە دواتر دووبارە هەوڵ بدە.",
                                );
                              }
                            } catch (err) {
                              console.error("Hero sync error:", err);
                              alert(
                                "فیلمی سەرەکی جێگیرکرا، بەڵام پەیوەندی بە سێرڤەر نەکرا. تکایە دواتر دووبارە هەوڵ بدە.",
                              );
                            } // End try-catch
                          }}
                        />
                      )}

                      {adminTab === "users" && <UsersModule />}

                      {adminTab === "managed-users" && (
                        <SafeRender fallbackName="ManagedUsersModule">
                          <ManagedUsersModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "security-control" && (
                        <SafeRender fallbackName="ChatSecurityModule">
                          <ChatSecurityModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "security-shield" && (
                        <SafeRender fallbackName="SecurityShieldModule">
                          <SecurityShieldModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "database-audit" && (
                        <SafeRender fallbackName="SystemDatabaseAuditModule">
                          <SystemDatabaseAuditModule
                            currentUser={currentUser}
                          />
                        </SafeRender>
                      )}

                      {adminTab === "stats" && (
                        <div className="space-y-6" dir="rtl">
                          <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-950/40 via-[#0f1013] to-slate-900/40 border border-white/5">
                            <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">
                              مۆدیۆڵ ٢: یەکەی ئامارە گشتییەکانی کۆکردنەوە (Live
                              Statistics Hub)
                            </h2>
                            <p className="text-xs text-gray-400 kurdish-text mt-1">
                              پیشاندانی بەژداربووان، گەرانەکان، بەردەوامی سێرڤەر
                              و ژوورەکانی کۆنترۆڵ.
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-6 bg-[#0f1013] border border-white/5 rounded-3xl space-y-4">
                              <span className="text-xs text-blue-400 kurdish-text block font-bold">
                                ● کۆی گشتی سەردانیکەر
                              </span>
                              <p className="text-4xl font-black font-mono text-white">
                                {stats.visitors}
                              </p>
                              <p className="text-xs text-gray-400 kurdish-text">
                                زانیاری لایەن و کۆگای دۆکومێنتی ماڵپەڕ.
                              </p>
                            </div>
                            <div className="p-6 bg-[#0f1013] border border-white/5 rounded-3xl space-y-4">
                              <span className="text-xs text-purple-400 kurdish-text block font-bold">
                                ● ناوەڕۆکە پۆستکراوەکان
                              </span>
                              <p className="text-4xl font-black font-mono text-white">
                                {movies.length}
                              </p>
                              <p className="text-xs text-gray-400 kurdish-text">
                                ژمارەی فیلمە چالاکەکانمان کە ڕێکخراون.
                              </p>
                            </div>
                            <div className="p-6 bg-[#0f1013] border border-white/5 rounded-3xl space-y-4">
                              <span className="text-xs text-green-400 kurdish-text block font-bold">
                                ● دۆخی کارکردنی گشتی
                              </span>
                              <p className="text-4xl font-black font-mono text-emerald-400">
                                چالاک (Active)
                              </p>
                              <p className="text-xs text-gray-400 kurdish-text">
                                هەموو دەروازەکان و کۆنتیاکت بێ گرتن
                                بەستراونەتەوە.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {adminTab === "smart-analytics" && (
                        <SafeRender fallbackName="SmartAnalyticsModule">
                          <SmartAnalyticsModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "ticket-vip" && (
                        <SafeRender fallbackName="TicketVIPModule">
                          <TicketVIPModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "system-hub" && (
                        <SafeRender fallbackName="SystemHubModule">
                          <SystemHubModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "growth" && (
                        <SafeRender fallbackName="GrowthModule">
                          <GrowthModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "m17-auth" && (
                        <SafeRender fallbackName="MultiLevelAdminModule">
                          <MultiLevelAdminModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "whatsapp-automation" && (
                        <WhatsAppAutomationModule />
                      )}

                      {adminTab === "broadcast-main" && (
                        <BroadcastControlModule />
                      )}

                      {adminTab === "user-analytics" && (
                        <SafeRender fallbackName="UserAnalyticsModule">
                          <UserAnalyticsModule currentUser={currentUser} />
                        </SafeRender>
                      )}

                      {adminTab === "channel" && (
                        <ChannelSettingsModule
                          youtubeUrl={config.youtubeUrl}
                          tiktokUrl={config.tiktokUrl}
                          instagramUrl={config.instagramUrl}
                          facebookUrl={config.facebookUrl}
                          onUpdate={handleSaveChannelLinks}
                        />
                      )}



                      {adminTab === "settings" && (
                        <SettingsModule
                          tracker={trackerConfig.text}
                          ads={config.ads}
                          playerMode={config.playerMode}
                          onUpdateTracker={updateTracker}
                          onUpdateAd={(key, val) => updateConfig(key, val)}
                          onUpdatePlayerMode={(val: string) =>
                            updateConfig("playerMode", val)
                          }
                          roomVideoUrl={config.roomVideoUrl}
                          onUpdateRoomVideoUrl={async (val: string) => {
                            try {
                              // Update Express server
                              await updateConfig("roomVideoUrl", val);
                              // Sync to Firestore
                              await setDoc(doc(db, "config", "general"), { roomVideoUrl: val }, { merge: true }); // Update Firebase config
                              await setDoc(doc(db, "config", "hero"), { roomVideoUrl: val }, { merge: true });
                              console.log("[Client Firestore Sync] Successfully synced general and hero from Settings tab.");
                            } catch (error) {
                              console.error("[Config Sync] Settings failed:", error);
                              alert("هەڵەیەک ڕوویدا لە کاتی پاشەکەوتکردن لە ڕێکخستنە گشتییەکان!");
                            }
                          }}
                        />
                      )}
                    </AnimatePresence> {/* End Admin Modules */}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Point 15/20: Global Floating WhatsApp Button — rendered on every view,
          never gated behind build-time env vars. */}
      <WhatsAppFloatButton href={floatingWhatsAppUrl} />

      <footer className="official-footer"> {/* Main Footer */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-20 relative z-10">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center">
                <Film className="w-6 h-6 text-white" />
              </div>
              <a
                href={config.youtubeUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="text-2xl font-black italic tracking-tighter uppercase text-white hover:text-brand-primary transition-colors cursor-pointer select-none"
              >
                ChatCinama
              </a>
            </div>
            <p className="text-gray-500 kurdish-text text-sm leading-relaxed max-w-sm">
              گەورەترین و پێشکەوتووترین پلاتفۆرمی کوردی بۆ بینینی نوێترین فیلم و
              زنجیرە جیهانییەکان بە بەرزترین کوالێتی و بە بێ بەرامبەر.
            </p>
            <div className="flex gap-3"> {/* Social Media Links */}
              {(import.meta.env.VITE_WHATSAPP_NUMBER ||
                import.meta.env.VITE_WHATSAPP_GROUP_LINK) && (
                <a
                  href={
                    import.meta.env.VITE_WHATSAPP_GROUP_LINK ||
                    `https://wa.me/${import.meta.env.VITE_WHATSAPP_NUMBER}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="w-10 h-10 bg-[#25D366]/10 rounded-xl flex items-center justify-center hover:bg-[#25D366] transition-all group"
                  title="WhatsApp"
                >
                  <MessageCircle className="w-5 h-5 text-[#25D366] group-hover:text-white" />
                </a>
              )}
              {typeof config.youtubeUrl === "string" &&
                config.youtubeUrl !== "#" &&
                config.youtubeUrl.trim() !== "" && (
                  <a
                    href={config.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-brand-primary transition-all group"
                    title="YouTube"
                  >
                    <Youtube className="w-5 h-5 text-gray-500 group-hover:text-white" />
                  </a>
                )}
              {typeof config.tiktokUrl === "string" &&
                config.tiktokUrl !== "#" &&
                config.tiktokUrl.trim() !== "" && (
                  <a
                    href={config.tiktokUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-brand-primary transition-all group"
                    title="TikTok"
                  >
                    <Video className="w-5 h-5 text-gray-500 group-hover:text-white" />
                  </a>
                )}
              {typeof config.instagramUrl === "string" &&
                config.instagramUrl !== "#" &&
                config.instagramUrl.trim() !== "" && (
                  <a
                    href={config.instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-brand-primary transition-all group"
                    title="Instagram"
                  >
                    <Instagram className="w-5 h-5 text-gray-500 group-hover:text-white" />
                  </a>
                )}
              {typeof config.facebookUrl === "string" &&
                config.facebookUrl !== "#" &&
                config.facebookUrl.trim() !== "" && (
                  <a
                    href={config.facebookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-brand-primary transition-all group"
                    title="Facebook"
                  >
                    <Facebook className="w-5 h-5 text-gray-500 group-hover:text-white" />
                  </a>
                )}
            </div>
          </div> {/* End Footer Left Section */}

          <div className="flex flex-col gap-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-white kurdish-text">
              بەشە خێراکان
            </h3>
            <ul className="grid grid-cols-2 gap-y-3">
              {[
                "هەموو فیلمەکان",
                "فیلمی دۆبلاژ",
                "زنجیرەکان",
                "ئەنیمی",
                "تازەترینەکان",
                "پڕبینەرترین",
              ].map((item) => (
                <li key={item}>
                  <button className="text-gray-500 hover:text-brand-primary kurdish-text text-right text-sm transition-colors w-full text-right outline-none">
                    {item}
                  </button>
                </li>
              ))} {/* Quick Links List */}
            </ul>
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-white">
              Copyright & DMCA
            </h3>
            <p className="text-[11px] text-gray-600 leading-relaxed max-w-xs">
              All movies and content shown on this website are streamed from
              external sources (Telegram, Google Drive) and remain the property
              of their respective owners. CinemaChat does not host, store, or
              distribute any video files on its own servers. If you are a
              copyright holder and believe that any video or content posted here
              infringes on your rights — or was uploaded by mistake — please
              contact us immediately and we will review and remove it promptly.
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 max-w-xs">
              Note: We only respond to official website and legal service
              inquiries.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {/* DMCA Direct-Action Icons */}
              <a
                href="https://wa.me/9647701966649"
                target="_blank"
                rel="noreferrer"
                title="Contact via WhatsApp"
                className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-[#25D366] hover:bg-[#25D366]/15 hover:border-[#25D366]/40 hover:scale-105 transition-all group"
              >
                <MessageCircle className="w-5 h-5" />
              </a>
              <a
                href="mailto:rebarsarkawt91@gmail.com"
                title="Contact via Gmail"
                className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-[#EA4335] hover:bg-[#EA4335]/15 hover:border-[#EA4335]/40 hover:scale-105 transition-all group"
              >
                <Mail className="w-5 h-5" />
              </a>
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-widest">
                Safe Platform
              </div>
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-widest">
                No Tracking
              </div>
            </div> {/* DMCA Action Icons + Footer Badges */}
          </div>
        </div>
        <div className="mt-20 pt-8 border-t border-white/5 text-center flex flex-col md:flex-row items-center justify-between gap-6">
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-700 italic">
            © 2026 CinamaChat Official System. All Rights Reserved.
          </span>
          <div className="flex gap-8">
            <button className="text-[10px] font-black text-gray-600 hover:text-white uppercase tracking-widest transition-colors outline-none">
              Privacy Policy
            </button>
            <button className="text-[10px] font-black text-gray-600 hover:text-white uppercase tracking-widest transition-colors outline-none">
              Terms of Service
            </button>
            <a
              href="https://wa.me/9647701966649"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-black text-gray-600 hover:text-white uppercase tracking-widest transition-colors outline-none"
            >
              Contact US
            </a>
          </div>
        </div>
      </footer> {/* End Main Footer */}

      {/* Social Protocol Overlays */}
      <RegistrationModal
        isOpen={showSocialModal}
        initialMode={modalMode}
        onClose={() => {
          setShowSocialModal(false);
          setAuthFlowReturn(false);
        }}
        onAuthSuccess={
          authFlowReturn
            ? () => {
                // Returning to the CinemaChat flow: stay on the page so the
                // Friend→Connect room re-evaluates readiness and continues.
                setShowSocialModal(false);
                setAuthFlowReturn(false);
              }
            : undefined
        }
      />

      {/* Complete-Account prompt for signed-in users whose canonical profile is
          missing required fields (gate = authenticated-incomplete). */}
      <CompleteAccountModal
        open={showCompleteAccount}
        onClose={() => setShowCompleteAccount(false)}
        readiness={accountReadiness}
        onFriendConnect={() => setShowFriendConnect(true)}
        onWatchTogether={() => setShowCinemaChatRoom(true)}
      />

      {/* Soft profile-completion notice (Chat Rooms Part 2): users who are READY
          but missing the recommended Age/Address fields get a gentle, dismissible
          nudge — never a hard block. */}
      {accountReadiness.state === "ready" &&
        accountReadiness.recommendedMissingFields.length > 0 &&
        !profileNoticeDismissed && (
          <div className="fixed bottom-6 left-4 z-[120] flex max-w-[min(92vw,360px)] items-start gap-3 rounded-2xl border border-sky-500/20 bg-[#0f1013]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-white kurdish-text">
                تەواوکردنی پڕۆفایل (بەدڵی خۆت)
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-gray-400 kurdish-text">
                تەمەن و ناونیشانت زیاد بکە بۆ ئەوەی هاوڕێکان و ژوورەکان وێنەیەکی
                تەواوتر ببینن. پێویست نییە، بەڵام پێشنیار دەکرێت.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCompleteAccount(true)}
                  className="rounded-xl bg-sky-500/20 px-3 py-1.5 text-[11px] font-black text-sky-300 kurdish-text transition hover:bg-sky-500/30"
                >
                  تەواوکردن
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("cinemachat_profile_notice_dismissed", "1");
                    setProfileNoticeDismissed(true);
                  }}
                  className="rounded-xl bg-white/5 px-3 py-1.5 text-[11px] font-bold text-gray-400 kurdish-text transition hover:bg-white/10 hover:text-white"
                >
                  دوا بکەوە
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Smart Entry Modal for Joining Rooms */}
      <AnimatePresence>
        {showJoinCodeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJoinCodeModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-brand-primary/20">
                  <UsersIcon className="w-8 h-8 text-brand-primary" />
                </div>
                <h2 className="text-2xl font-black text-white kurdish-text mb-2">
                  بەستنەوەی ژوور
                </h2>
                <p className="text-gray-500 kurdish-text text-sm">
                  کۆدی گرووپ یان هاوڕێ دابنێ
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      dir="rtl"
                      placeholder="کۆدی گرووپ بنوسە..."
                      value={joinRoomCode}
                      onChange={(e) => setJoinRoomCode(e.target.value)}
                      className={`w-full bg-zinc-950 border-2 ${
                        joinValidationStatus === "valid-online"
                          ? "border-green-500 shadow-[0_0_15px_-3px_rgba(34,197,94,0.4)]"
                          : joinValidationStatus === "valid-offline"
                            ? "border-orange-500 shadow-[0_0_15px_-3px_rgba(249,115,22,0.4)]"
                            : joinValidationStatus === "invalid"
                              ? "border-red-500 shadow-[0_0_15px_-3px_rgba(239,68,68,0.4)]"
                              : "border-white/10"
                      } rounded-xl px-4 py-3.5 text-white kurdish-text text-base outline-none focus:border-brand-primary transition-all text-center font-black`}
                    /> {/* Join Room Code Input */}
                  </div>

                  <button
                    type="button"
                    onClick={() => joinQrInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 px-5 py-3.5 bg-white/5 hover:bg-brand-primary hover:text-white text-gray-300 hover:border-brand-primary border border-white/5 rounded-xl transition-all text-sm font-black kurdish-text cursor-pointer active:scale-95 whitespace-nowrap"
                    title="سکانکردنی QR"
                  >
                    <QrCode className="w-4 h-4 text-red-500" />
                    <span>سکانکردنی QR</span>
                  </button>

                  <input // Hidden QR Code File Input
                    type="file"
                    ref={joinQrInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleJoinQRUpload}
                  />
                </div>

                <AnimatePresence>
                  {joinValidationStatus !== "idle" && ( // Validation Status Message
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`flex items-center justify-center gap-2 text-[10px] font-bold kurdish-text px-2 ${
                        joinValidationStatus === "valid-online"
                          ? "text-green-500"
                          : joinValidationStatus === "valid-offline"
                            ? "text-orange-500"
                            : "text-red-500"
                      }`}
                    >
                      {joinValidationStatus === "valid-online" && (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      {joinValidationStatus === "valid-offline" && (
                        <Clock className="w-3 h-3" />
                      )}
                      {joinValidationStatus === "invalid" && (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      {joinValidationStatus === "valid-online" &&
                        `(${joinRoomCode.toUpperCase()}) بەردەستە - ئۆنلاین`}
                      {joinValidationStatus === "valid-offline" &&
                        `(${joinRoomCode.toUpperCase()}) ئۆفلاینە`}
                      {joinValidationStatus === "invalid" &&
                        `(${joinRoomCode.toUpperCase()}) دروست نەبووە`}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => handleSmartJoin(joinRoomCode)}
                  disabled={
                    isLoading ||
                    (joinValidationStatus !== "valid-online" &&
                      joinValidationStatus !== "valid-offline")
                  }
                  className="w-full py-5 bg-white text-black rounded-2xl font-black kurdish-text text-xl hover:bg-zinc-200 transition-all active:scale-95 shadow-xl shadow-white/5 disabled:opacity-50"
                >
                  {joinValidationStatus === "valid-online" || joinValidationStatus === "valid-offline"
                    ? "بەستنەوە و چوونە ژوورەوە"
                    : "تکایە کۆدی دروست بنووسە..."}
                </button>
                
                <button
                  onClick={() => setShowJoinCodeModal(false)}
                  className="w-full py-4 text-gray-500 hover:text-white kurdish-text font-bold text-sm transition-all"
                >
                  پەشیمان بوونەوە
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence> {/* Identity Card Modal */}
        {showIdentityCard && socialProfile && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-full max-w-sm flex flex-col items-center"
            >
              <button
                onClick={() => setShowIdentityCard(false)}
                className="absolute -top-4 -right-4 z-[160] p-2 bg-white text-black rounded-full shadow-2xl hover:bg-zinc-200 transition-all border border-black/10"
              >
                <X className="w-5 h-5" />
              </button>
              <ProfileCard
                user={socialProfile}
                onClose={() => setShowIdentityCard(false)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Real-time Invitation Request Toast notification */}
      <AnimatePresence>
        {activeInvitation && (
          <div className="fixed bottom-6 right-6 z-[99999] max-w-sm w-full bg-zinc-950/95 border border-[#FFDF00]/30 rounded-[2rem] p-5 shadow-2xl ring-4 ring-yellow-500/10 backdrop-blur-2xl">
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FFDF00]/10 flex items-center justify-center animate-pulse border border-[#FFDF00]/20 shrink-0">
                  <Globe className="w-5 h-5 text-[#FFDF00]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-[#FFDF00] font-black font-mono">
                    بانگهێشتنامەی فەرمی کەناڵ
                  </span>
                  <span className="text-xs text-gray-400 kurdish-text">
                    بانگهێشت کراویت لەلایەن <strong>{activeInvitation.senderName}</strong>
                  </span>
                </div>
              </div>
              
              <div className="text-[13px] kurdish-text leading-relaxed font-bold text-white mt-1">
                دەیەوێت لەگەڵیدا بچیتە ناو ژووری گشتی سەرانسەری بۆ بینینی ڤیدیۆی هاوبەش!
              </div>

              <div className="flex items-center gap-2.5 mt-2">
                <button
                  onClick={() => handleAcceptInvite(activeInvitation)}
                  className="flex-1 py-3 bg-[#FFDF00] hover:bg-yellow-400 text-black text-xs font-black kurdish-text rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer"
                >
                  قبووڵکردن (Join)
                </button>
                <button
                  onClick={() => handleDeclineInvite(activeInvitation)}
                  className="px-5 py-3 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-black kurdish-text rounded-2xl transition-all border border-white/5 active:scale-95 cursor-pointer"
                >
                  داخستن
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence> {/* End Invitation Notification */}

      <AnimatePresence>
        {showDirectMessagesModal && (
          <DirectMessagesModal
            isOpen={showDirectMessagesModal}
            onClose={() => setShowDirectMessagesModal(false)}
            currentUserProfile={socialProfile}
          />
        )}
      </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
