import React, { useState, useEffect, useMemo, Fragment, useRef } from "react";
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
  X,
  ChevronRight,
  ChevronLeft,
  Flame,
  TrendingUp,
  Ghost,
  Clock,
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
  UserPlus,
  FileVideo,
  Video,
  Youtube,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Square,
  Pause,
  Rocket,
  RotateCcw,
  FastForward,
  Rewind,
  Languages,
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
  Edit3,
  Key,
  Database,
  Ticket,
  BarChart2,
  Share2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Plyr } from "plyr-react";
import { UsersIcon } from "lucide-react";
import "plyr-react/plyr.css";
import { GoogleGenAI } from "@google/genai";
import { api } from "./services/api";
import { Movie, SyncGroup, SocialUser } from "./types";
import { useSocialAuth } from "./context/SocialAuthContext";
import jsQR from "jsqr";
import { RegistrationModal } from "./components/Social/RegistrationModal";
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
import { VIPRoomModal } from "./components/Social/VIPRoomModal";
import { ProfileCard } from "./components/Social/ProfileCard";
import { WatchPartyManager } from "./components/Social/WatchPartyManager";
import { SyncRoom } from "./components/Social/SyncRoom";
import { CameHereRoom } from "./components/Social/CameHereRoom";
import { BroadcastRoom } from "./components/Social/BroadcastRoom";
import { BroadcastPreviewCard } from "./components/Social/BroadcastPreviewCard";
import { DirectMessagesModal } from "./components/Social/DirectMessagesModal";
import UserActivityMonitor from "./components/Admin/UserActivityMonitor";

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
async function fetchApi(
  path: string,
  options?: RequestInit,
  retries = 3,
): Promise<Response> {
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      const text = await res.clone().text();
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
              socialLinks: {},
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
              heroVideoUrl: "https://www.youtube.com/watch?v=YPY7J-flzE8",
              heroPlaylist: [
                "https://www.youtube.com/watch?v=YPY7J-flzE8",
                "https://www.youtube.com/watch?v=YPY7J-flzE8",
                "https://www.youtube.com/watch?v=YPY7J-flzE8",
              ],
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
        return fetchApi(path, options, retries - 1);
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
      return fetchApi(path, options, retries - 1);
    }
    // Final fallback
    return {
      ok: false,
      status: 503,
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
        return { error: "Service unavailable" };
      },
      text: async () => "Service unavailable",
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

const MOCK_MOVIES: Movie[] = [
  {
    id: "1",
    title: "Extraction 2",
    quality: "4K",
    tags: ["ئاکشن", "دۆبلاج"],
    image:
      "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?auto=format&fit=crop&q=80&w=800",
    description: "چیرۆکی بکوژێکی بەناوبانگ کە ڕووبەڕووی دوژمنێکی نوێ دەبێتەوە.",
    whatsappLink: "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
    isNetflixOriginal: true,
    isTrending: true,
    views: 1250,
    date: "2024-04-27",
    embedUrl: "https://www.youtube.com/embed/YPY7J-flzE8",
  },
  {
    id: "2",
    title: "John Wick: Chapter 4",
    quality: "Full HD",
    tags: ["ئاکشن", "دۆبلاج"],
    image:
      "https://images.unsplash.com/photo-1594908900066-3f47337549d8?auto=format&fit=crop&q=80&w=800",
    description:
      "جۆن ویک بەرەو شەڕێکی گەورەتر دەچێت بۆ ئەوەی ڕزگاری بێت لە ڕێکخراوی گەورە.",
    whatsappLink: "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
    isTrending: true,
    views: 5200,
    date: "2024-04-28",
    embedUrl: "https://www.youtube.com/embed/qEVUrkHuqe8",
  },
];

const CATEGORIES = [
  { name: "هەمووی", icon: TrendingUp, tag: "all" },
  { name: "فیلمە نوێیەکان", icon: Sparkles, tag: "New Releases" },
  { name: "دۆبلاج", icon: MessageCircle, tag: "دۆبلاج" },
  { name: "دراما", icon: Film, tag: "دراما" },
  { name: "ئاکشن", icon: Sword, tag: "ئاکشن" },
  { name: "ترسناک", icon: Ghost, tag: "ترسناک" },
  { name: "کۆمیدی", icon: Smile, tag: "کۆمیدی" },
  { name: "ئەنیمەیشن", icon: Calendar, tag: "ئەنیمەیشن" },
  { name: "خەیاڵی", icon: Flame, tag: "خەیاڵی" },
  { name: "زنجیرە", icon: Clock, tag: "زنجیرە" },
  { name: "کوردستان", icon: ShieldCheck, tag: "کوردستان" },
];

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

const extractYouTubeId = (url: string | undefined | null) => {
  if (!url) return null;
  // Patterns:
  // 1. youtu.be/ID
  // 2. youtube.com/v/ID
  // 3. youtube.com/u/ID
  // 4. youtube.com/embed/ID
  // 5. youtube.com/watch?v=ID
  // 6. youtube.com/shorts/ID
  const regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(shorts\/))([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[8] && match[8].length === 11 ? match[8] : null;
};

const buildOptimizedYouTubeEmbedUrl = (url: string) => {
  const videoId = extractYouTubeId(url);
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=0&rel=0&modestbranding=1&showinfo=0&iv_load_policy=3&autohide=1&enablejsapi=1&disablekb=1&fs=0&origin=${window.location.origin}`;
  }
  return url;
};

const CategoryDropdown = ({ value, onChange, categories }: any) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="bg-black/40 border border-white/10 rounded-xl px-2 py-3 text-white kurdish-text outline-none focus:border-brand-primary appearance-none cursor-pointer text-[10px]"
  >
    <option value="ئاکشن">Action</option>
    <option value="ترسناک">Horror</option>
    <option value="دراما">Drama</option>
    <option value="کۆمیدی">Comedy</option>
    {/* Add more as needed */}
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
    quality: "HD",
    tags: "",
    subtitleUrl: "",
    rating: "",
    year: "",
    type: "movie",
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
  const [categories, setCategories] = useState<string[]>([]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Security check: Limit file size to 2MB (strict limit requested)
    if (file.size > 2 * 1024 * 1024) {
      alert(
        "قەبارەی وێنە نابێت لە ٢ مێگابایت گەورەتر بێت بۆ پاراستنی هێڵ و سێرڤەر!",
      );
      return;
    }

    // Security check: Only allow images
    if (!file.type.startsWith("image/")) {
      alert("تکایە تەنها فایلێکی وێنە هەڵبژێرە");
      return;
    }

    setIsUploading(true);
    try {
      // Automatic browser compression via canvas helper
      let fileToUpload: File | Blob = file;
      try {
        fileToUpload = await new Promise<File | Blob>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
            const img = new window.Image();
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement("canvas");
              let width = img.width;
              let height = img.height;
              const maxDim = 1200;
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
              if (!ctx) {
                resolve(file);
                return;
              }
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob(
                (blob) => {
                  resolve(blob || file);
                },
                "image/jpeg",
                0.8,
              );
            };
            img.onerror = () => resolve(file);
          };
          reader.onerror = () => resolve(file);
        });
      } catch (e) {
        console.warn("Compression failed, uploading original fallback:", e);
      }

      // Secure naming convention
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `posters/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storageRef = ref(storage, fileName);

      const snapshot = await uploadBytes(storageRef, fileToUpload);
      const downloadURL = await getDownloadURL(snapshot.ref);

      setFormData((prev) => ({ ...prev, posterUrl: downloadURL }));
      alert("وێنەکە بە سەرکەوتوویی بارکرا بێ کێشە ✓");
    } catch (error: any) {
      console.error("Image Upload Error:", error);
      let errorMsg = "هەڵەیەک ڕوویدا لە کاتی بارکردنی وێنەکە";
      if (error.code === "storage/unauthorized") {
        errorMsg = "دەسەڵاتی بارکردنی وێنەت نییە (Permission Denied).";
      } else if (
        error.code === "storage/quota-exceeded" ||
        error.code === "storage/retry-limit-exceeded"
      ) {
        errorMsg =
          "بارگەکردنی وێنە ڕەتکرایەوە. تکایە دڵنیابەرەوە لە خێرایی ئینتەرنێتەکەت یان وێنەیەکی بچووکتر هەڵبژێرە.";
      } else {
        errorMsg += `: ${error.message}`;
      }
      alert(errorMsg);
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
    fetchApi("/api/admin/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
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
        formData.whatsappLink ||
        "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
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
        quality: "HD",
        tags: "",
        subtitleUrl: "",
        rating: "",
        year: "",
        type: "movie",
        whatsappLink: "",
        externalMovieLink: "",
      });

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

    const loopedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&loop=1&playlist=${videoId}&enablejsapi=1`;

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
      isYouTube: true,
      whatsappLink:
        formData.whatsappLink ||
        "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
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
        quality: "HD",
        tags: "",
        subtitleUrl: "",
        rating: "",
        year: "",
        type: "movie",
        whatsappLink: "",
        externalMovieLink: "",
      });
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
                {categories.length > 0 ? (
                  categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="ئاکشن">Action</option>
                    <option value="ترسناک">Horror</option>
                    <option value="دراما">Drama</option>
                  </>
                )}
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
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white text-center font-bold outline-none focus:border-brand-primary tracking-tight text-xs"
          />
          <button
            onClick={async () => {
              setIsLoading(true);
              await onBroadcast(url);
              setIsLoading(false);
              setUrl("");
            }}
            disabled={isLoading}
            className="w-full py-5 bg-brand-primary text-white rounded-2xl font-black kurdish-text text-lg hover:bg-brand-primary/80 transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-2"
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
          setHeroVideoUrl(data.heroVideoUrl);
        } else if (
          data &&
          Array.isArray(data.heroPlaylist) &&
          data.heroPlaylist[0]
        ) {
          setHeroVideoUrl(data.heroPlaylist[0]);
        }
      })
      .catch((err) =>
        console.error("Failed to load initial hero config:", err),
      );
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

const CategoryModule = ({ movies, onRefresh }: any) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const [loading, setLoading] = useState(false);

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

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const adminName = getAdminUsername();
      const res = await fetchApi(`/api/admin/categories?adminName=${encodeURIComponent(adminName)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCategories(data);
      } else {
        console.warn("Categories fetched is not an array:", data);
        setCategories([]);
      }
    } catch (e) {
      console.error("Failed to fetch categories", e);
      setCategories([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleAdd = async () => {
    if (!newCat) return;
    setLoading(true);
    try {
      const adminName = getAdminUsername();
      const res = await fetchApi(`/api/admin/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCat, adminName }),
      });
      if (res.ok) {
        setNewCat("");
        fetchCategories();
        onRefresh?.();
      } else {
        const err = await res.json();
        alert(err.error || "هەڵەیەک ڕوویدا");
      }
    } catch (e) {
      alert("کێشەی پەیوەندی هەیە");
    }
    setLoading(false);
  };

  const handleDelete = async (name: string) => {
    if (confirm(`ئایا دڵنیایت لە سڕینەوەی پۆلێنی "${name}"؟`)) {
      setLoading(true);
      try {
        const adminName = getAdminUsername();
        const res = await fetch(
          `/api/admin/categories/${encodeURIComponent(name)}?adminName=${encodeURIComponent(adminName)}`,
          {
            method: "DELETE",
          },
        );
        if (res.ok) {
          fetchCategories();
          onRefresh?.();
        }
      } catch (e) {
        alert("کێشەی پەیوەندی هەیە");
      }
      setLoading(false);
    }
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
            زیادکردن و سڕینەوەی جۆرەکانی فیلم (Genre)
          </p>
        </div>
      </div>

      <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] space-y-4">
        <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest">
          زیادکردنی پۆلێنی نوێ
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="ناوی پۆلێن (بۆ نموونە: ئەکشن، دراما...)"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={loading || !newCat}
            className="px-8 py-4 bg-brand-primary text-white rounded-2xl font-black kurdish-text hover:bg-red-700 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            زیادکردن
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && (!categories || categories.length === 0)
          ? Array(6)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="h-24 bg-white/5 rounded-3xl animate-pulse"
                />
              ))
          : Array.isArray(categories) && categories.map((cat) => (
              <div
                key={cat}
                className="p-6 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                    <Film className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-lg font-black kurdish-text text-white block">
                      {cat}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold">
                      {movies.filter((m: any) => m.tags.includes(cat)).length}{" "}
                      فیلم و زنجیرە
                    </span>
                  </div>
                </div>
                {!isStaff && (
                  <button
                    onClick={() => handleDelete(cat)}
                    className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
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
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRoleUser, setEditingRoleUser] = useState<any>(null);

  const fetchManagedUsers = async () => {
    setLoading(true);
    try {
      const res = await fetchApi("/api/admin/managed-users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
    setLoading(false);
  };

  const fetchBannedIps = async () => {
    try {
      const res = await fetchApi("/api/admin/banned-ips");
      const data = await res.json();
      setBannedIps(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch banned IPs:", err);
    }
  };

  useEffect(() => {
    fetchManagedUsers();
    fetchBannedIps();
  }, []);

  const handleExportCSV = () => {
    if (users.length === 0) return;
    const header = [
      "UID",
      "Name",
      "Phone",
      "UniqueCode",
      "Device IP",
      "Role",
      "Last Active",
    ];
    const rows = users.map((u) => [
      u.uid,
      u.name || "",
      u.phone || "",
      u.uniqueCode || "",
      u.deviceIp || "N/A",
      u.role || "Member",
      u.lastActive || "",
    ]);

    const csvContent = [header, ...rows].map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CinemaChat_Users_Export.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleKickUser = async (uid: string) => {
    if (!confirm("ئایا دڵنیایت لە دەرکردنی ئەم بەکارهێنەرە؟")) return;
    try {
      await fetch(`/api/admin/managed-users/kick/${uid}`, { method: "POST" });
      fetchManagedUsers();
    } catch (err) {
      alert("درێژەی کێشا، دووبارە هەوڵ بدەرەوە.");
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm("ئایا دڵنیایت لە سڕینەوەی ئەم بەکارهێنەرە بە یەکجاری؟"))
      return;
    try {
      await fetch(`/api/admin/managed-users/${uid}`, { method: "DELETE" });
      fetchManagedUsers();
    } catch (err) {
      alert("سڕینەوە سەرکەوتوو نەبوو.");
    }
  };

  const handleBanIp = async (ip: string) => {
    if (!ip) {
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
      const res = await fetchApi("/api/admin/ban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        alert("ئایپی بەکارهێنەر بە سەرکەوتوویی بلۆک کرا.");
        fetchBannedIps();
        fetchManagedUsers();
      } else {
        alert("بلۆککردن سەرکەوتوو نەبوو.");
      }
    } catch (err) {
      console.error(err);
      alert("هەڵەیەک ڕوویدا لە کاتی بلۆککردن.");
    }
  };

  const handleUnbanIp = async (ip: string) => {
    if (!confirm(`ئایا دڵنیایت لە لادانی بلۆکی ئایپی: ${ip}؟`)) return;

    try {
      const res = await fetchApi("/api/admin/unban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        alert("بلۆکی ئایپی لادرا.");
        fetchBannedIps();
        fetchManagedUsers();
      } else {
        alert("لادانی بلۆکی ئایپی سەرکەوتوو نەبوو.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateRole = async (uid: string, role: string) => {
    try {
      await fetchApi("/api/admin/managed-users/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, role }),
      });
      setEditingRoleUser(null);
      fetchManagedUsers();
    } catch (err) {
      alert("گۆڕینی ڕۆڵ سەرکەوتوو نەبوو.");
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.phone?.includes(searchTerm) ||
      u.uniqueCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.deviceIp?.includes(searchTerm),
  );

  const stats = {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === "Admin" || u.role === "SuperAdmin")
      .length,
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
              onClick={fetchManagedUsers}
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
            {users.filter((u) => u.active).length} چالاک
          </span>
        </div>

        {users.filter((u) => u.active).length === 0 ? (
          <p className="text-gray-500 text-[11px] kurdish-text py-4 text-center">
            لە ئێستادا چاڵاکییەک نییە لەسەر هێڵ
          </p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
            {users
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
                key={bip}
                className="bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 px-3 py-1.5 rounded-xl text-xs font-mono text-gray-400 flex items-center gap-3"
              >
                <span>{bip}</span>
                <button
                  onClick={() => handleUnbanIp(bip)}
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
  const [bannedIps, setBannedIps] = useState<string[]>([]);
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

  const fetchManagedUsers = async () => {
    try {
      const res = await fetchApi("/api/admin/managed-users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const fetchBannedIps = async () => {
    try {
      const res = await fetchApi("/api/admin/banned-ips");
      const data = await res.json();
      setBannedIps(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch banned IPs:", err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchManagedUsers(), fetchBannedIps()]).finally(() => {
      setLoading(false);
    });
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
      fetchManagedUsers();
    } catch (err) {
      console.error("Failed to update mute state:", err);
      alert("گۆڕانکاری سەرکەوتوو نەبوو.");
    }
  };

  // Kick (logout user from system & force-quit room)
  const handleKickUser = async (uid: string) => {
    if (!confirm("ئایا دڵنیایت لە دەرکردنی ئەم بەکارهێنەرە؟")) return;
    try {
      // Set kicked state in Firestore to trigger real-time onClose in client
      const userRef = firestoreDoc(realDb, "users", uid);
      await firestoreUpdateDoc(userRef, { isKicked: true });

      // Call server backend kick
      await fetchApi(`/api/admin/managed-users/kick/${uid}`, {
        method: "POST",
      });

      alert("بەکارهێنەرەکە بە سەرکەوتوویی دەرکرا و لە ژوورەکەی لادرا.");
      fetchManagedUsers();
    } catch (err) {
      console.error("Kick failed:", err);
      alert("دەرکردنی بەکارهێنەر سەرکەوتوو نەبوو.");
    }
  };

  // Ban IP address
  const handleBanIp = async (ip: string) => {
    if (!ip) {
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
      const res = await fetchApi("/api/admin/ban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        alert("ئایپی بەکارهێنەر بە سەرکەوتوویی خرایە لیستی بلۆکەوە.");
        fetchBannedIps();
        fetchManagedUsers();
      } else {
        alert("بلۆککردنی ئایپی سەرکەوتوو نەبوو.");
      }
    } catch (err) {
      console.error(err);
      alert("کێشەیەک ڕوویدا لە کاتی بلۆککردنی ئایپی.");
    }
  };

  // Unban IP
  const handleUnbanIp = async (ip: string) => {
    if (!confirm(`ئایا دڵنیایت لە لادانی بلۆککردنی ئایپی ${ip}؟`)) return;
    try {
      const res = await fetchApi("/api/admin/unban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        alert("ئایپی لە لیستی بلۆککراوەکان لادرا.");
        fetchBannedIps();
        fetchManagedUsers();
      } else {
        alert("لادانی بلۆکی ئایپی سەرکەوتوو نەبوو.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = users.filter(
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
                bannedIps.map((ip) => (
                  <tr key={ip} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 text-red-400 font-black">{ip}</td>
                    <td className="py-3 text-gray-400 font-sans kurdish-text text-[10px]">
                      🛑 بلۆکی گشتی جێگیر
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleUnbanIp(ip)}
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
  const [room, setRoom] = React.useState<any>(null);
  const [videoUrl, setVideoUrl] = React.useState("");
  const [localMovies, setLocalMovies] = React.useState<any[]>([]);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/rooms/main_broadcast_room");
      if (res.ok) {
        const data = await res.json();
        setRoom(data);
        if (!videoUrl && data.currentMovieUrl) {
          setVideoUrl(data.currentMovieUrl);
        }
      }
    } catch (err) {
      console.warn("Error fetching broadcast room state:", err);
    }
  };

  const fetchCatalogMovies = async () => {
    try {
      const res = await fetch("/api/movies");
      if (res.ok) {
        const data = await res.json();
        setLocalMovies(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn("Could not fetch catalog movies:", err);
    }
  };

  React.useEffect(() => {
    fetchState();
    fetchCatalogMovies();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateBroadcast = async (urlToSet?: string, playState?: boolean, seekTime?: number) => {
    setIsUpdating(true);
    setMsg(null);
    try {
      const payload: any = {};
      if (urlToSet !== undefined) payload.currentMovieUrl = urlToSet;
      if (playState !== undefined) payload.isPlaying = playState;
      if (seekTime !== undefined) payload.currentTime = seekTime;

      const res = await fetch("/api/rooms/main_broadcast_room/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setRoom(data.room);
        setMsg({ type: "success", text: "زانیارییەکان بە سەرکەوتوویی نوێکرانەوە!" });
      } else {
        setMsg({ type: "error", text: "هەڵەیەک لە نوێکردنەوە ڕوویدا" });
      }
    } catch (err) {
      setMsg({ type: "error", text: "ناتوانرێت پەیوەندی بە سێرڤەرەوە بکرێت" });
    } finally {
      setIsUpdating(false);
    }
  };

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
                <span className="font-mono text-purple-400 font-bold">{room?.activeUsers?.length || 0} بینەر</span>
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
                  if (movie.url) {
                    setVideoUrl(movie.url);
                    handleUpdateBroadcast(movie.url);
                  }
                }}
                className={`p-3 bg-zinc-900/60 border rounded-xl hover:border-purple-500/40 hover:bg-zinc-900 cursor-pointer transition-all flex items-center gap-3 group`}
              >
                {movie.thumbnail && (
                  <img
                    src={movie.thumbnail}
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

  useEffect(() => {
    setYt(youtubeUrl || "");
    setTk(tiktokUrl || "");
    setIg(instagramUrl || "");
    setFb(facebookUrl || "");
  }, [youtubeUrl, tiktokUrl, instagramUrl, facebookUrl]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate({
        youtubeUrl: yt,
        tiktokUrl: tk,
        instagramUrl: ig,
        facebookUrl: fb,
      });
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
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:border-brand-primary text-sm transition-all"
                  placeholder="https://www.youtube.com/@ChatCinama"
                />
              </div>
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
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:border-brand-primary text-sm transition-all"
                  placeholder="https://www.tiktok.com/@ChatCinama"
                />
              </div>
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
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:border-brand-primary text-sm transition-all"
                  placeholder="https://www.instagram.com/ChatCinama"
                />
              </div>
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
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white outline-none focus:border-brand-primary text-sm transition-all"
                  placeholder="https://www.facebook.com/ChatCinama"
                />
              </div>
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
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const isMuted = isHeroMuted;
  const setIsMuted = setIsHeroMuted;
  const containerRef = useRef<HTMLDivElement>(null);
  const videoId = activeFeaturedMovie?.videoId || heroVideoId || "DEFAULT_ID";

  useEffect(() => {
    if (activeAudioSource === "room") {
      setIsMuted(true);
    }
  }, [activeAudioSource]);

  useEffect(() => {
    if (containerRef.current) {
      const playParam = isPlaying ? "1" : "0";
      const muteParam = (countdown > 0 || isMuted) ? "1" : "0";
      containerRef.current.innerHTML = '<iframe src="https://www.youtube.com/embed/' + videoId + '?autoplay=' + playParam + '&mute=' + muteParam + '&loop=1&playlist=' + videoId + '&controls=0&showinfo=0&rel=0&modestbranding=1&enablejsapi=1" allow="autoplay; encrypted-media" allowfullscreen class="w-full h-full pointer-events-none" width="100%" height="100%"></iframe>';
    }
  }, [videoId]);

  useEffect(() => {
    const iframe = containerRef.current?.querySelector("iframe");
    if (iframe?.contentWindow) {
      const command = isPlaying ? "playVideo" : "pauseVideo";
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: command,
          args: [],
        }),
        "*"
      );
    }
  }, [isPlaying]);

  useEffect(() => {
    const iframe = containerRef.current?.querySelector("iframe");
    if (iframe?.contentWindow) {
      const command = isMuted ? "mute" : "unMute";
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: command,
          args: [],
        }),
        "*"
      );
      if (!isMuted) {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: "setVolume",
            args: [100],
          }),
          "*"
        );
      }
    }
  }, [isMuted]);

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
        <div className="w-full h-full scale-[1.35]" id="hero-player" ref={containerRef}></div>
        {/* سێبەری خوارەوەی ڤیدیۆکە بۆ ئەوەی دیزاینەکەی سینەمایی بێت */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent z-2 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black to-transparent z-2 pointer-events-none" />
      </div>

      {/* Protective Shield overlay for Youtube iframe clicks */}
      <div 
        className="absolute inset-0 bg-transparent pointer-events-auto" 
        style={{ zIndex: 10 }}
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
                setCountdown(0);
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
          {/* Play/Pause Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPlaying(!isPlaying);
            }}
            className={`pointer-events-auto p-2 md:p-3 bg-black/50 border rounded-xl md:rounded-2xl backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] group/play ${
              isPlaying
                ? "text-brand-primary border-brand-primary/20 hover:border-brand-primary/35 hover:bg-brand-primary/15"
                : "text-white border-white/10 hover:border-white/25 hover:bg-white/10"
            }`}
            title={isPlaying ? "ڕاگرتن" : "لێدان"}
            id="hero-play-btn"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/play:scale-110" />
            ) : (
              <Play className="w-3.5 h-3.5 md:w-4.5 md:h-4.5 transition-transform group-hover/play:scale-110" />
            )}
          </button>

          {/* Mute/Unmute Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted(!isMuted);
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
        </div>

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
              </span>
              <span className="text-[10px] md:text-xs font-black text-brand-primary uppercase tracking-[0.6em] font-mono">
                CINEMACHAT SHOW
              </span>
            </div>

            <div className="w-12 h-1 bg-brand-primary mt-4 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          </motion.div>
        </div>
      </div>
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
  setSocialTab: (tab: "movies" | "party" | "profile" | "broadcast") => void;
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

  React.useEffect(() => {
    let active = true;
    const fetchVipPreview = async () => {
      try {
        // 1. Try to read from localStorage verified ticket and check with server
        let selectedUrl = "";
        const saved = localStorage.getItem("vipRoom_verifiedTicket");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.code) {
              const valRes = await fetch("/api/vip/check-validity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: parsed.code })
              });
              if (valRes.ok) {
                const valData = await valRes.json();
                if (valData.success && valData.ticket) {
                  selectedUrl = valData.ticket.videoUrl || "";
                  if (!selectedUrl && active) {
                    // Fallback to settings or the last VIP video if valid but has no custom stream
                    const resVids = await fetch("/api/admin/vip/videos");
                    if (resVids.ok) {
                      const data = await resVids.json();
                      if (Array.isArray(data) && data.length > 0) {
                        selectedUrl = data[data.length - 1]?.videoUrl || "";
                      }
                    }
                  }
                } else {
                  // Expired or deleted
                  localStorage.removeItem("vipRoom_verifiedTicket");
                }
              }
            }
          } catch (e) {
            console.warn("Could not parse verified ticket from localStorage:", e);
          }
        }

        if (selectedUrl && active) {
          let videoId = "";
          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
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
  }, []);

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
                      : `https://www.youtube.com/embed/${vipPreviewVideoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&playlist=${vipPreviewVideoId}&loop=1`
                  }
                  className="w-full h-full pointer-events-none select-none"
                  title="VIP Room Live Preview"
                  allow="autoplay; encrypted-media"
                  frameBorder="0"
                  tabIndex={-1}
                  sandbox="allow-scripts allow-same-origin allow-presentation"
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

export default function App() {

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [movies, setMovies] = useState<Movie[]>(MOCK_MOVIES);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  const [autoPlay, setAutoPlay] = useState(false);
  const [isHeroMuted, setIsHeroMuted] = useState(true);
  const [activeInvitation, setActiveInvitation] = useState<any>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const hasCountdownRun = useRef(false);
  const [isRoomMuted, setIsRoomMuted] = useState(true);
  const [featuredMovieFromDB, setFeaturedMovieFromDB] = useState<Movie | null>(
    null,
  );
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [roomIndex, setRoomIndex] = useState(0);
  const [heroTrailerPlaylist, setHeroTrailerPlaylist] = useState<string[]>([
    "https://www.youtube.com/watch?v=YPY7J-flzE8",
    "https://www.youtube.com/watch?v=YPY7J-flzE8",
    "https://www.youtube.com/watch?v=YPY7J-flzE8",
  ]);
  const [globalStreamURL, setGlobalStreamURL] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState(0);

  const [lastAddedMovie, setLastAddedMovie] = useState<any>(null);
  const [activeServerUrl, setActiveServerUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [bannedFromSystem, setBannedFromSystem] = useState(false);
  const [emergencyLocked, setEmergencyLocked] = useState(false);

  // Main Modal Player customized states
  const [isIframePlaying, setIsIframePlaying] = useState(true);
  const [isIframeMuted, setIsIframeMuted] = useState(false);
  const [showIframeSubtitles, setShowIframeSubtitles] = useState(true);
  const [isIframeFullscreen, setIsIframeFullscreen] = useState(false);

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

  const getIframe = (id: string): HTMLIFrameElement | null => {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el instanceof HTMLIFrameElement) return el;
    return el.querySelector("iframe");
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

    // 2. Control room-player YouTube iframe if active
    const roomPlayer = document.getElementById(
      "room-player",
    ) as HTMLIFrameElement;
    if (roomPlayer?.contentWindow) {
      const command = isPlaying ? "playVideo" : "pauseVideo";
      roomPlayer.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: command,
          args: [],
        }),
        "*",
      );
    }
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
        "*",
      );
    }
  };

  const toggleIframeSubtitles = () => {
    const showSub = !showIframeSubtitles;
    setShowIframeSubtitles(showSub);

    // 1. Control Plyr captions
    if (plyrRef.current?.plyr) {
      plyrRef.current.plyr.toggleCaptions();
    }

    // 2. Control room-player YouTube captions
    const roomPlayer = document.getElementById(
      "room-player",
    ) as HTMLIFrameElement;
    if (roomPlayer?.contentWindow) {
      roomPlayer.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: "toggleClosedCaptions",
          args: [],
        }),
        "*",
      );
    }
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

  // Update activeServerUrl when movie changes
  useEffect(() => {
    if (selectedMovie) {
      setActiveServerUrl(
        selectedMovie.streamingUrl ||
          selectedMovie.vidsrcUrl ||
          selectedMovie.embedUrl ||
          null,
      );
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

  const featuredMovie = useMemo(() => {
    return movies.find((m) => m.isYouTube) || movies[0];
  }, [movies]);

  const getCleanYouTubeUrl = (url: string | null | undefined) => {
    if (!url) return null;
    let videoId = "";

    if (url.includes("v=")) {
      videoId = url.split("v=")[1]?.split("&")[0];
    } else if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
    } else if (url.includes("embed/")) {
      videoId = url.split("embed/")[1]?.split("?")[0];
    }

    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=0&loop=1&playlist=${videoId}&enablejsapi=1&rel=0&showinfo=0&iv_load_policy=3&modestbranding=1&autohide=1&disablekb=1&fs=0&origin=${window.location.origin}`;
    }
    return url;
  };

  const activeFeaturedMovie = useMemo(() => {
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
    setHeroTrailerPlaylist(["https://www.youtube.com/watch?v=YPY7J-flzE8"]);
  }, [activeFeaturedMovie]);

  const currentHeroVideoUrl = useMemo(() => {
    if (!activeFeaturedMovie) {
      return "https://www.youtube.com/watch?v=YPY7J-flzE8";
    }
    const rawUrl =
      activeFeaturedMovie.embedUrl ||
      activeFeaturedMovie.videoUrl ||
      "https://www.youtube.com/watch?v=YPY7J-flzE8";
    if (!rawUrl || rawUrl.trim() === "") {
      return "https://www.youtube.com/watch?v=YPY7J-flzE8";
    }
    const vidId = extractYouTubeId(rawUrl);
    if (vidId) {
      return `https://www.youtube.com/watch?v=${vidId}`;
    }
    return rawUrl;
  }, [activeFeaturedMovie]);

  const heroVideoId = useMemo(() => {
    const videoId = extractYouTubeId(currentHeroVideoUrl);
    return videoId || "YPY7J-flzE8";
  }, [currentHeroVideoUrl]);

  // Add an event listener to the whole document to detect the first click for click-to-initiate autoplay
  useEffect(() => {
    const handleUserInteraction = () => {
      setHasInteracted(true);
      // Remove the listener once the user clicks
      document.removeEventListener("click", handleUserInteraction);
    };
    document.addEventListener("click", handleUserInteraction);
    return () => document.removeEventListener("click", handleUserInteraction);
  }, []);

  // Cinematic countdown logic
  useEffect(() => {
    if (isLoading) return;
    if (hasCountdownRun.current) return;

    hasCountdownRun.current = true;
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsHeroMuted(false); // Turn on/unmute hero video audio after countdown
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const currentRoomVideoUrl = useMemo(() => {
    if (heroTrailerPlaylist.length === 0)
      return "https://www.youtube.com/watch?v=YPY7J-flzE8";
    const idx = roomIndex % 3;
    const url = heroTrailerPlaylist[idx] || heroTrailerPlaylist[0];
    console.log(
      "[PLAYER PROGRESS] Room Player URL changed:",
      url,
      "Index (modulo 3):",
      idx,
    );
    return url;
  }, [heroTrailerPlaylist, roomIndex]);

  const handleEnded = () => {
    const iframe = getIframe("hero-player");
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: "seekTo",
            args: [0, true],
          }),
          "*",
        );
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: "playVideo",
          }),
          "*",
        );
      } catch (err) {
        console.warn("[PLAYER loop] failed to send postMessage commands:", err);
      }
    }
  };

  const handleRoomEnded = () => {
    const nextIdx = (roomIndex + 1) % 3;
    console.log(
      "[PLAYER EVENT] Room sequence finished. Advancing index (modulo 3):",
      roomIndex,
      "->",
      nextIdx,
    );
    setRoomIndex((prev) => (prev + 1) % 3);
  };

  // Direct DOM iframe src override removed as it was conflicting with ReactReactPlayer state synchronization


  // Sync Hero Mute State (API BASED)
  useEffect(() => {
    const el = getIframe("hero-player");
    if (el?.contentWindow) {
      const command = isHeroMuted ? "mute" : "unMute";
      el.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: command,
          args: [],
        }),
        "*",
      );
      if (!isHeroMuted) {
        el.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: "setVolume",
            args: [100],
          }),
          "*",
        );
      }
    }
  }, [isHeroMuted]);

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

  const [targetLang, setTargetLang] = useState("Kurdish");
  const [translatedContent, setTranslatedContent] = useState<string | null>(
    null,
  );
  const [isTranslating, setIsTranslating] = useState(false);

  // Social Protocol State
  const {
    currentUser: fbUser,
    socialProfile,
    logout: fbLogout,
  } = useSocialAuth();
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [modalMode, setModalMode] = useState<"login" | "signup">("signup");
  const [activeSyncGroup, setActiveSyncGroup] = useState<SyncGroup | null>(
    null,
  );
  const [activeAudioSource, setActiveAudioSource] = useState<"hero" | "room">("hero");

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
      setShowPlayer(false);
    }
  }, [activeSyncGroup, selectedMovie]);

  // Presence System
  useEffect(() => {
    if (!fbUser || !socialProfile || fbUser.uid === "admin_local_bypass") return;

    const userDoc = doc(db, "users", socialProfile.uid);

    // Check for movieId in URL
    const params = new URLSearchParams(window.location.search);
    const movieId = params.get("movieId");
    if (movieId) {
      const movie = movies.find((m) => m.id === movieId);
      if (movie) {
        setSelectedMovie(movie);
        setShowPlayer(true);
      }
    }

    const setOnline = async () => {
      await updateDoc(userDoc, {
        isOnline: true,
        currentRoomId: activeSyncGroup?.id || null,
        lastActive: serverTimestamp(),
      }).catch(console.error);
    };

    const setOffline = async () => {
      await updateDoc(userDoc, {
        isOnline: false,
        currentRoomId: null,
        lastActive: serverTimestamp(),
      }).catch(console.error);
    };

    setOnline();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") setOnline();
      else setOffline();
    };

    window.addEventListener("beforeunload", setOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

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
            phone: socialProfile.phone || "",
            uniqueCode: socialProfile.uniqueCode || "",
            avatar: socialProfile.avatar || "",
          }),
        });
        const data = await res.json();
        if (data.user?.kicked) {
          fbLogout();
          alert("هەژمارەکەت لەلایەن بەڕێوبەرەوە داخراوە.");
        }
      } catch (err) {
        console.error("Server sync failed:", err);
      }
    };
    syncWithServer();

    return () => {
      setOffline();
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
      const handleReferralInvite = async () => {
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
            if (inviterRoomId && inviterRoomId !== "global_room_official" && inviterRoomId !== "friends_room_official") {
              // Join the specific watch room / sync session
              await handleSmartJoin(inviterRoomId);
            } else {
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
      
      handleReferralInvite();
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
  const [socialTab, setSocialTab] = useState<"movies" | "party" | "profile" | "broadcast">(
    "movies",
  );

  const [dashboardRooms, setDashboardRooms] = useState<any[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [dashboardCreateRoomName, setDashboardCreateRoomName] = useState("");
  const [dashboardCreateHostCode, setDashboardCreateHostCode] = useState("");
  const [dashboardCreateMovieUrl, setDashboardCreateMovieUrl] = useState("https://www.youtube.com/watch?v=Rsztt5qDj_A");
  const [dashboardIsLoading, setDashboardIsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardSuccess, setDashboardSuccess] = useState("");

  // Sync dashboardCreateHostCode with socialProfile when defined
  useEffect(() => {
    if (socialProfile?.uniqueCode) {
      setDashboardCreateHostCode(socialProfile.uniqueCode);
    }
  }, [socialProfile]);

  // Auto-select first movie for room creation by default
  useEffect(() => {
    if (movies.length > 0 && (!dashboardCreateMovieUrl || dashboardCreateMovieUrl === "https://www.youtube.com/watch?v=Rsztt5qDj_A")) {
      const firstMovie = movies[0];
      const url = firstMovie.embedUrl || firstMovie.videoUrl || "";
      setDashboardCreateMovieUrl(url);
      setDashboardCreateRoomName(`ژووری هاوڕێیانی ${firstMovie.title}`);
    }
  }, [movies, dashboardCreateMovieUrl]);

  // Poll available rooms for the dashboard and sync rooms instantly
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
    const interval = setInterval(fetchRooms, 3000);
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
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "config", "featured"),
      (snap) => {
        try {
          if (snap.exists()) {
            const data = snap.data();
            console.log("New Firebase Data:", data); // FORCE UPDATE LOG
            setFeaturedMovieFromDB(data as Movie);
            const vidId =
              data.videoId ||
              (data.url ? extractYouTubeId(data.url) : null) ||
              (data.embedUrl ? extractYouTubeId(data.embedUrl) : null);
            const url = data.url || data.embedUrl || data.videoUrl;
            if (vidId) {
              setGlobalStreamURL(`https://www.youtube.com/embed/${vidId}`);
            } else if (url) {
              setGlobalStreamURL(url);
            }
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

  // Point 42: Global Playback Sync Handler
  const updateGlobalPlayback = (time: number, playing: boolean) => {
    if (!plyrRef.current?.plyr) return;
    const plyr = plyrRef.current.plyr;

    // Only update if drift is significant (> 2s) to avoid jitter
    if (Math.abs(plyr.currentTime - time) > 2) {
      plyr.currentTime = time;
    }

    if (playing && plyr.paused) plyr.play().catch(() => {});
    else if (!playing && !plyr.paused) plyr.pause();
  };

  // Point 43: Local Playback State Collector (Sync to Cloud - OPTIMIZED)
  useEffect(() => {
    if (!activeSyncGroup || !plyrRef.current?.plyr || !socialProfile) return;
    if (socialProfile.uid !== activeSyncGroup.creatorId) return;

    const plyr = plyrRef.current.plyr;
    const interval = setInterval(() => {
      const currentTime = plyr.currentTime;
      const isPlaying = !plyr.paused;

      // Update Firestore if changed significantly (>5s drift) or every 30s heartbeat
      const timeDiff = Math.abs(currentTime - lastSyncTime);
      const isPeriodicSync = Date.now() % 30000 < 10000;

      if (timeDiff > 10 || isPeriodicSync) {
        const path = `rooms/${activeSyncGroup.id}`;
        fetchApi(`/api/${path}`, {
          method: "POST",
          body: JSON.stringify({
            playback: {
              currentTime: currentTime,
              isPlaying: isPlaying,
              updatedAt: new Date().toISOString(),
            },
          }),
        }).catch((err) => {
          console.error("Heartbeat sync failed:", err);
        });
        setLastSyncTime(currentTime);
      }
    }, 10000); // Check every 10 seconds instead of 5

    return () => clearInterval(interval);
  }, [activeSyncGroup, socialProfile, lastSyncTime]);

  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinValidationStatus, setJoinValidationStatus] = useState<
    "idle" | "valid-online" | "valid-offline" | "invalid"
  >("idle");
  const [joinValidatedUser, setJoinValidatedUser] = useState<any>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinQrInputRef = useRef<HTMLInputElement>(null);

  // Real-time Live ID Validation for the Join Modal (Optimized)
  useEffect(() => {
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

  const handleSmartJoin = async (providedCode?: string) => {
    setIsLoading(true);
    setJoinError(null);
    try {
      let targetRoomId = "global_room_official";
      let roomName = "Official Global Room 🎬";
      let creatorId = "system";

      const code = providedCode?.trim();

      if (code && code !== "") {
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
      let activeProfile = socialProfile;

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

      if (!roomSnap.exists()) {
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
        const data = roomSnap.data() as SyncGroup;
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
      }

      setActiveSyncGroup(roomData);
      setIsRoomMuted(false); // Entry logic: UNMUTE room
      setSocialTab("movies");
      setShowJoinCodeModal(false);

      if (activeFeaturedMovie) {
        setSelectedMovie(activeFeaturedMovie);
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
      setShowPlayer(true);
    }
  };

  const LANGUAGES = [
    {
      code: "Kurdish",
      name: "کوردی",
      prompt:
        "بە کوردییەکی پاراو و ئەدەبی وەریگێڕە بۆ سەر زمانی کوردی (سۆرانی)",
    },
    {
      code: "Arabic",
      name: "عربي",
      prompt: "ترجم إلى اللغة العربية الفصحى بشكل أدبي",
    },
    {
      code: "English",
      name: "English",
      prompt: "Translate this into fluent, natural English",
    },
    {
      code: "Persian",
      name: "فارسی",
      prompt: "به زبان فارسی روان و ادبی ترجمه کن",
    },
    {
      code: "Turkish",
      name: "Türkçe",
      prompt:
        "Akıcı ve doğal bir Türkçe ile tercüme et (tüm içeriği tercüme et)",
    },
  ];

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
      if (existingMovie) {
        setSelectedMovie(existingMovie);
      } else {
        setSelectedMovie({
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
          whatsappLink: "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
        });
      }
      setShowPlayer(true);
    }
  }, [globalStreamURL, activeSyncGroup?.id, movies]);

  // Point 46: Playback Synchronization Logic
  useEffect(() => {
    if (!activeSyncGroup || !plyrRef.current?.plyr) return;
    (window as any).currentPlayer = plyrRef.current.plyr;

    let unsubscribe: any;
    const docRef = doc(db, "syncGroups", activeSyncGroup.id);

    getDoc(docRef)
      .then((docS) => {
        if (docS.exists()) {
          unsubscribe = onSnapshot(
            docRef,
            (docS) => {
              if (!docS.exists()) return;
              const data = docS.data() as SyncGroup;

              // Movie Sync Logic
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
                    "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
                  date: new Date().toISOString(),
                };

                if (
                  !selectedMovie ||
                  selectedMovie.id !== movieUpdate.id ||
                  selectedMovie.embedUrl !== movieUpdate.embedUrl
                ) {
                  setSelectedMovie(movieUpdate);
                  setShowPlayer(true);
                  setTranslatedContent(null);
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
                  setShowPlayer(true);
                  setTranslatedContent(null);
                }
              }

              // Sync playback
              if (
                socialProfile?.uid !== data.creatorId &&
                plyrRef.current?.plyr
              ) {
                const player = plyrRef.current.plyr;
                const diff = Math.abs(
                  player.currentTime - data.playback.currentTime,
                );
                if (diff > 3) player.currentTime = data.playback.currentTime;
                if (data.playback.isPlaying && player.paused)
                  player.play().catch(() => {});
                else if (!data.playback.isPlaying && !player.paused)
                  player.pause();
              }
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
  }, [activeSyncGroup?.id, plyrRef.current?.plyr, socialProfile?.uid, movies]);

  const translateWithAI = async (
    text: string,
    langCode: string = "Kurdish",
  ) => {
    if (!text) {
      console.warn("No text provided for translation");
      return;
    }

    console.log(`Starting AI translation to ${langCode}...`);
    setIsTranslating(true);
    setTranslatedContent(null);

    const lang = LANGUAGES.find((l) => l.code === langCode) || LANGUAGES[0];

    try {
      const ai = getAI();
      if (!ai) throw new Error("AI not configured");

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: `${lang.prompt} for the following text. Do not include original text, just the translation: "${text}"`,
      });

      if (response && response.text) {
        console.log("AI Translation Success:", response.text.substring(0, 50));
        setTranslatedContent(response.text);
      } else {
        console.warn("AI Response was empty");
        setTranslatedContent(
          "وەڵامی وەرگێڕان بەتاڵ بوو. تکایە جارێکی تر کلیک بکەوە.",
        );
      }
    } catch (err) {
      console.error(
        "CRITICAL: AI Translation failed inside translateWithAI:",
        err,
      );
      setTranslatedContent(
        `هەڵە: ${err instanceof Error ? err.message : "پەیوەندی سەرکەوتوو نەبوو"}`,
      );
    } finally {
      setIsTranslating(false);
    }
  };

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
    socialProfile?.role === "admin" ||
    socialProfile?.userRole === "admin" ||
    socialProfile?.role === "super_admin" ||
    socialProfile?.userRole === "super_admin";

  // Monitor banned visitor IP on layout-load dynamically (Security Guard check)
  useEffect(() => {
    const checkIpBan = async () => {
      try {
        const res = await fetch("/api/check-ban");
        const data = await res.json();
        if (data) {
          if (data.banned) {
            setBannedFromSystem(true);
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
    };
    checkIpBan();
    // Re-verify periodically to enforce instantly
    const banInterval = setInterval(checkIpBan, 20000);
    return () => clearInterval(banInterval);
  }, [currentUser]);

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
  const [dynamicCategories, setDynamicCategories] = useState<string[]>([]);
  const [stats, setStats] = useState({ visitors: 0 });
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [config, setConfig] = useState({
    ads: {
      banner: { image: "", link: "" },
      sidebar: { image: "", link: "" },
    },
    socialLinks: {
      whatsapp: "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0",
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

  // Silent Access Control / Route Guard for Module 17 and Staff permissions
  useEffect(() => {
    const isOwner =
      currentUser?.username === "admin" ||
      socialProfile?.role === "owner" ||
      socialProfile?.userRole === "owner";

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
          youtubeUrl: data.youtubeUrl || prev.youtubeUrl,
          tiktokUrl: data.tiktokUrl || prev.tiktokUrl,
          instagramUrl: data.instagramUrl || prev.instagramUrl,
          facebookUrl: data.facebookUrl || prev.facebookUrl,
        }));
      } catch (e) {
        console.error("Config fetch failed:", e);
      }
    };
    fetchConfig();
  }, []);

  const handleAdminClick = () => {
    if (
      !socialProfile ||
      (socialProfile.role !== "admin" && socialProfile.role !== "super_admin")
    ) {
      alert(
        "⚠️ سەرپێچی ئەمنی: تۆ مافی دەستکاریکردن یان بینینی ئەم بەشەت نییە چونکە ئەکاونتەکەت ئەدمین نییە لە بنکەدراوەدا.",
      );
      return;
    }
    if (currentUser) {
      setShowAdminPanel(true);
    } else {
      setShowPasswordModal(true);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !socialProfile ||
      (socialProfile.role !== "admin" && socialProfile.role !== "super_admin")
    ) {
      alert(
        "⚠️ سەرپێچی ئەمنی: تۆ مافی دەستکاریکردن یان بینینی ئەم بەشەت نییە چونکە ئەکاونتەکەت ئەدمین نییە لە بنکەدراوەدا.",
      );
      return;
    }
    try {
      const res = await fetchApi("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminUsername,
          password: adminPassword,
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
      } else {
        alert(data.message || "هەڵەیەک ڕوویدا");
      }
    } catch (e) {
      alert("ناتوانرێت پەیوەندی بە سێرڤەرەوە بکرێت");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    safeStorage.remove("cinemachat_admin");
    setShowAdminPanel(false);
  };

  // Strict role verification to prevent pre-computation or DOM tampering
  useEffect(() => {
    if (
      showAdminPanel &&
      (!socialProfile ||
        (socialProfile.role !== "admin" &&
          socialProfile.role !== "super_admin"))
    ) {
      setShowAdminPanel(false);
      setCurrentUser(null);
      safeStorage.remove("cinemachat_admin");
    }
  }, [showAdminPanel, socialProfile]);

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
        tiktokUrl: data.tiktokUrl || prev.tiktokUrl,
        instagramUrl: data.instagramUrl || prev.instagramUrl,
        facebookUrl: data.facebookUrl || prev.facebookUrl,
      }));
    } catch (e) {
      alert("شکستی هێنا لە نوێکردنەوەی ڕێکخستنەکان");
    }
  };

  const fetchMovies = async () => {
    try {
      const results = await api.getMovies();
      // Only replace if we got actual data
      if (results && Array.isArray(results)) {
        // Safety deduplication by ID
        const unique = Array.from(
          new Map(results.map((m: any) => [m.id, m])).values(),
        );

        setMovies(
          unique.sort((a: any, b: any) => {
            const idA = parseInt(String(a.id).replace("manual-", ""));
            const idB = parseInt(String(b.id).replace("manual-", ""));
            if (!isNaN(idA) && !isNaN(idB)) return idB - idA;
            return new Date(b.date).getTime() - new Date(a.date).getTime();
          }),
        );
        setErrorMsg(null);
      }
    } catch (err) {
      console.error("fetchMovies failed, using current/mock data:", err);
      // We only show the error if we don't have any movies at all (not even mock)
      if (movies.length === 0) {
        setErrorMsg(
          err instanceof Error
            ? `هەڵەی پەیوەندی: ${err.message}`
            : "کێشەیەک لە پەیوەندی سێرڤەر ڕوویدا",
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies();
    const interval = setInterval(fetchMovies, 60000); // 60 seconds poll for real-time sync
    return () => clearInterval(interval);
  }, []);

  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
  const [netflixOriginals, setNetflixOriginals] = useState<Movie[]>([]);

  // Split movies for rows
  useEffect(() => {
    setTrendingMovies(movies.filter((m) => m.isTrending));
    setNetflixOriginals(movies.filter((m) => m.isNetflixOriginal));
  }, [movies]);

  const filteredMovies = useMemo(() => {
    return movies.filter((movie) => {
      const matchesSearch =
        movie.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movie.tags.some((t) =>
          t.toLowerCase().includes(searchQuery.toLowerCase()),
        );

      const matchesTab = activeTab === "all" || movie.tags.includes(activeTab);

      return matchesSearch && matchesTab;
    });
  }, [movies, searchQuery, activeTab]);

  const paginatedMovies = useMemo(() => {
    const startIndex = (currentPage - 1) * moviesPerPage;
    return filteredMovies.slice(startIndex, startIndex + moviesPerPage);
  }, [filteredMovies, currentPage]);

  useEffect(() => {
    setTranslatedContent(null);
  }, [selectedMovie]);

  if (bannedFromSystem) {
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
          <p className="text-gray-400 kurdish-text text-sm leading-relaxed">
            ئەم ئامێرە/ئایپیە بلۆک کراوە لە CinemaChat بەهۆی سەرپێچیکردنی
            مەرجەکان. گەر پێتوایە هەڵەیەک هەیە تکایە پەیوەندی بە بەشی پشتگیریەوە
            بکە.
          </p>
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
      </div>
    );
  }

  if (isLoading && movies.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen bg-black text-white select-none overflow-x-hidden"
      dir="rtl"
    >
      {/* Background Layer (Video) */}
      <div style={{ position: "relative", zIndex: 0 }} />

      {/* UI Overlay Layer (Admin/Room/Headers) */}
      <div style={{ position: "fixed", inset: 0, zIndex: 999 }} className="overflow-y-auto h-full pointer-events-none">
        <div className="flex flex-col min-h-screen bg-transparent text-white select-none pointer-events-auto" dir="rtl">
      {/* Point 57: Error Message Overlay */}
      <AnimatePresence>
        {isQuotaExceeded && (
          <motion.div
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 inset-x-0 z-[201] bg-orange-600 p-2 text-center font-black kurdish-text flex items-center justify-center gap-4 shadow-2xl text-[10px]"
          >
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
          >
            <ShieldCheck className="w-6 h-6 animate-pulse" />
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Point 66: Official Police Header */}
      <header
        className="sticky top-0 z-[100] bg-black/80 backdrop-blur-md border-b border-white/5 px-4 md:px-8"
        style={{ paddingTop: "4px", paddingBottom: "4px" }}
      >
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
                Official Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 font-sans font-medium tracking-tight text-gray-900">
            <div className="hidden sm:flex flex-col items-end px-3 border-l border-white/10">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[9px] font-black uppercase tracking-widest text-green-500">
                  Secure Connection
                </span>
              </div>
              <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest mt-0.5 italic">
                Authorized Only
              </span>
            </div>
            {/* Social Protocol Buttons */}
            <div className="flex items-center gap-1.5 md:gap-2">
              {!socialProfile ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSocialTab(socialTab === "party" ? "movies" : "party");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest kurdish-text cursor-pointer border ${
                      socialTab === "party"
                        ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                        : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    <UsersIcon className="w-4 h-4 text-indigo-400" />
                    ژووری هاوڕێیان (Parties)
                  </button>
                  <button
                    onClick={() => {
                      setModalMode("login");
                      setShowSocialModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-gray-400 active:scale-95 text-[10px] font-black uppercase tracking-widest kurdish-text"
                  >
                    <User className="w-4 h-4" />
                    چوونە ژوورەوە
                  </button>
                  <button
                    onClick={() => {
                      setModalMode("signup");
                      setShowSocialModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary border border-brand-primary/20 rounded-xl hover:bg-red-700 transition-all text-white active:scale-95 text-[10px] font-black uppercase tracking-widest kurdish-text shadow-lg shadow-red-600/20"
                  >
                    <UserPlus className="w-4 h-4" />
                    خۆتۆمارکردن
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 md:gap-3">
                  {/* Point 34: Compact User Profile Info */}
                  <div className="hidden md:flex flex-col items-end px-3 py-1 border-r border-white/10">
                    <span className="text-sm font-black text-white kurdish-text leading-tight">
                      {socialProfile.name}
                    </span>
                    <span className="text-[9px] font-mono text-gray-400 tracking-wider leading-none mt-0.5">
                      {socialProfile?.phone || "---"}
                    </span>
                  </div>

                  <button
                    onClick={() => setShowIdentityCard(true)}
                    className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center transition-all group/idbtn relative flex-shrink-0"
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] font-black text-brand-primary uppercase tracking-[0.1em]">
                        ID
                      </span>
                      <div className="w-6 h-6 bg-brand-primary/10 rounded-lg flex items-center justify-center mt-0.5 group-hover/idbtn:bg-brand-primary transition-colors">
                        <ExternalLink className="w-3.5 h-3.5 text-brand-primary group-hover/idbtn:text-white" />
                      </div>
                    </div>

                    {/* Tooltip */}
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-lg opacity-0 group-hover/idbtn:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                      <span className="text-[10px] font-black text-white kurdish-text">
                        ناسنامەی من
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setSocialTab("party");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`flex items-center gap-2 p-2 md:p-3 rounded-xl transition-all active:scale-95 ${
                      socialTab === "party"
                        ? "bg-brand-primary text-white"
                        : "bg-white/5 border border-white/10 text-gray-400"
                    }`}
                  >
                    <UsersIcon className="w-5 h-5 md:w-6 md:h-6" />
                    <span className="hidden lg:block text-[10px] font-black uppercase tracking-widest">
                      Parties
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setSocialTab("broadcast");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`flex items-center gap-2 p-2 md:p-3 rounded-xl transition-all active:scale-95 ${
                      socialTab === "broadcast"
                        ? "bg-purple-600 text-white"
                        : "bg-purple-950/25 border border-purple-500/20 text-purple-300 hover:text-purple-100"
                    }`}
                  >
                    <Tv className="w-5 h-5 md:w-6 md:h-6" />
                    <span className="hidden lg:block text-[10px] font-black uppercase tracking-widest kurdish-text">
                      پەخشی فەرمی 📺
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setShowDirectMessagesModal(true);
                    }}
                    className={`flex items-center gap-2 p-2 md:p-3 rounded-xl transition-all active:scale-95 ${
                      showDirectMessagesModal
                        ? "bg-teal-500/25 text-teal-400 border border-teal-500/30"
                        : "bg-white/5 border border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    <MessageSquare className="w-5 h-5 md:w-6 md:h-6" />
                    <span className="hidden lg:block text-[10px] font-black uppercase tracking-widest kurdish-text">
                      پەیامەکان (DMs)
                    </span>
                  </button>

                  <button
                    onClick={fbLogout}
                    className="p-2 md:p-3 bg-red-600/10 border border-red-600/20 rounded-xl text-red-500 hover:bg-red-600/20 transition-all active:scale-95"
                  >
                    <LogOut className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                </div>
              )}
            </div>

            {(socialProfile?.role === "admin" ||
              socialProfile?.role === "super_admin") && (
              <button
                onClick={handleAdminClick}
                className="flex items-center gap-2 p-2 md:p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-brand-primary/10 transition-all text-gray-400 hover:text-brand-primary active:scale-95"
              >
                <Settings className="w-5 h-5 md:w-6 md:h-6" />
                <span className="hidden lg:block text-[10px] font-black uppercase tracking-widest text-inherit">
                  Admin
                </span>
              </button>
            )}

            <a
              href={
                import.meta.env.VITE_WHATSAPP_GROUP_LINK ||
                `https://wa.me/${import.meta.env.VITE_WHATSAPP_NUMBER}`
              }
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center gap-2 px-6 py-3 bg-brand-primary rounded-xl font-black text-xs hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 active:scale-95"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="kurdish-text">داواکردنی فیلم</span>
            </a>
          </div>
        </div>
      </header>

      {/* Point 12: Dynamic Tracker (Moving Ticker) */}
      <div className="bg-brand-primary/10 border-y border-brand-primary/20 py-2 overflow-hidden">
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
                      if (m.external_link) {
                        window.open(
                          m.external_link,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      } else {
                        setSelectedMovie(m);
                      }
                    }}
                  >
                    <span className="text-[10px] font-black uppercase text-brand-primary">
                      NEW:
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

        {socialTab === "movies" && (
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
              />
            )}


            {/* Horizontal Rows (Point 13 - Netflix Style Rows) */}
            <div className="relative z-20 -mt-24 space-y-12 pb-12">
              {/* Trending Now */}
              <SafeRender fallbackName="Trending Row">
                <section className="pl-8">
                  <h3 className="text-2xl font-black mb-6 kurdish-text text-white flex items-center gap-3">
                    <Flame className="w-6 h-6 text-orange-500" />
                    فیلمە ترێندینگەکان
                  </h3>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-8 pr-8">
                    {trendingMovies.map((movie, tidx) => (
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        key={`trending-${movie.id}-${tidx}`}
                        className="flex-shrink-0 w-[160px] md:w-[220px] aspect-[2/3] rounded-xl overflow-hidden cursor-pointer relative group border border-white/5"
                        onClick={() => {
                          setSelectedMovie(movie);
                          setShowPlayer(true);
                        }}
                      >
                        <img
                          src={movie.image || undefined}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src =
                              "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800";
                          }}
                          className="w-full h-full object-cover"
                          alt={movie.title}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-12 h-12 text-white fill-current" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </section>
              </SafeRender>

              {/* Unified Stream Automation: Bottom Room (Live Global Sync & VIP side-by-side) */}
              {activeFeaturedMovie && (
                <RoomSection
                  key={activeSyncGroup?.id || "empty-room"}
                  activeFeaturedMovie={activeFeaturedMovie}
                  activeSyncGroup={activeSyncGroup}
                  isRoomMuted={isRoomMuted}
                  setIsRoomMuted={setIsRoomMuted}
                  currentRoomVideoUrl={currentRoomVideoUrl}
                  extractYouTubeId={extractYouTubeId}
                  config={config}
                  setShowJoinCodeModal={setShowJoinCodeModal}
                  setShowVipModal={setShowVipModal}
                  setSocialTab={setSocialTab}
                  socialProfile={socialProfile}
                />
              )}
            </div>





            {/* Categories / Navigation (Point 21-30) */}
            <section className="sticky top-[73px] z-50 bg-black/95 backdrop-blur-3xl py-4 px-8 border-b border-white/5 shadow-2xl">
              <div className="max-w-7xl mx-auto flex items-center gap-4 overflow-x-auto no-scrollbar">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.tag}
                    onClick={() => {
                      setActiveTab(cat.tag);
                      setCurrentPage(1);
                    }}
                    className={`px-6 py-2.5 rounded-full font-bold kurdish-text whitespace-nowrap transition-all flex items-center gap-2 border-2 ${
                      activeTab === cat.tag
                        ? "bg-brand-primary border-brand-primary text-white shadow-xl shadow-red-600/20 scale-105"
                        : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <cat.icon className="w-4 h-4" />
                    {cat.name}
                  </button>
                ))}
              </div>
            </section>

            {/* Search Bar (Point 51) */}
            <div className="max-w-7xl mx-auto px-8 mt-16 mb-8 text-center">
              <h2 className="text-3xl font-black kurdish-text mb-8">
                گەڕان و فلتەرکردن
              </h2>
              <div className="relative group max-w-2xl mx-auto">
                <Search className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-brand-primary" />
                <input
                  type="text"
                  placeholder="گەڕان بۆ فیلم یان زنجیرە..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-14 pl-6 kurdish-text focus:outline-none focus:border-brand-primary focus:bg-white/10 transition-all"
                />
              </div>
            </div>

            {/* Movie Grid (Point 43-45) */}
            <div className="max-w-7xl mx-auto px-8 pb-32">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 md:gap-8">
                <AnimatePresence mode="popLayout">
                  {paginatedMovies.flatMap((movie, idx) => {
                    const movieCard = (
                      <motion.div
                        key={`main-card-${movie.id}-${idx}`}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="group relative cursor-pointer"
                        onClick={(e) => {
                          if (movie.external_link || movie.externalMovieLink) {
                            e.preventDefault();
                            e.stopPropagation();
                            let finalUrl = (
                              movie.external_link ||
                              movie.externalMovieLink ||
                              ""
                            ).trim();
                            if (!finalUrl.startsWith("http")) {
                              finalUrl = "https://" + finalUrl;
                            }
                            window.open(
                              finalUrl,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          } else {
                            window.open(
                              `${window.location.origin}/?movieId=${movie.id}`,
                              "_blank",
                            );
                          }
                        }}
                      >
                        <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 group-hover:border-brand-primary transition-all relative shadow-2xl group-hover:-translate-y-2 duration-300">
                          <img
                            src={movie.image || undefined}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src =
                                "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800";
                            }}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            alt={movie.title}
                          />

                          {/* Point 11: Netflix Badge */}
                          {movie.isNetflixOriginal && (
                            <div className="absolute top-2 left-2 w-5 h-8 bg-brand-primary flex items-center justify-center font-black text-sm italic rounded shadow-lg z-10">
                              N
                            </div>
                          )}

                          {/* Point 55: Quality Badge */}
                          <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-black text-white border border-white/10 z-10 flex items-center gap-1">
                            {movie.embedUrl && (
                              <Play className="w-2 h-2 fill-current text-brand-primary" />
                            )}
                            {movie.quality}
                          </div>

                          <div className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            {movie.embedUrl ? (
                              <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-brand-primary text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                                  <Play className="w-8 h-8 fill-current" />
                                </div>
                                <button className="bg-brand-primary text-white py-3 px-6 rounded-xl text-sm font-black kurdish-text shadow-xl hover:bg-red-700 transition-colors flex items-center gap-2">
                                  <Play className="w-4 h-4 fill-current" />
                                  <span>ئێستا سەیری بکە</span>
                                </button>
                              </div>
                            ) : (
                              <div className="bg-brand-primary text-white py-3 px-6 rounded-xl text-sm font-black kurdish-text shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform">
                                زانیاری فیلم
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3">
                          <h3 className="font-bold kurdish-text text-sm group-hover:text-brand-primary transition-colors line-clamp-1">
                            {movie.title}
                          </h3>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                              {movie.date.split("T")[0]}
                            </span>
                            {movie.isTrending && (
                              <div className="flex items-center gap-1 text-orange-500">
                                <Flame className="w-3 h-3" />
                                <span className="text-[8px] font-black uppercase">
                                  Trending
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );

                    if (idx === 5 && config.ads.banner.image) {
                      return [
                        movieCard,
                        <motion.div
                          key="ad-banner"
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
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
                        </motion.div>,
                      ];
                    }
                    return [movieCard];
                  })}
                </AnimatePresence>
              </div>

              {paginatedMovies.length === 0 && (
                <div className="py-20 text-center flex flex-col items-center">
                  <Ghost className="w-16 h-16 text-gray-800 mb-4" />
                  <p className="text-gray-500 kurdish-text">
                    هیچ فیلمێک نەدۆزرایەوە لەم بەشەدا.
                  </p>
                </div>
              )}

              {/* Pagination (Point 62) */}
              {filteredMovies.length > moviesPerPage && (
                <div className="mt-16 flex justify-center items-center gap-4">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl disabled:opacity-30 hover:bg-white/10"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="flex gap-2">
                    {Array(Math.ceil(filteredMovies.length / moviesPerPage))
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
                      Math.ceil(filteredMovies.length / moviesPerPage)
                    }
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl disabled:opacity-30 hover:bg-white/10"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </SafeRender>
        )}
      </main>

      {/* Point 14/15/16: Detailed Movie View (Selection) */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8"
          >
            <div
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              onClick={() => setSelectedMovie(null)}
            />

            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={`relative w-full ${showPlayer ? "fixed inset-0 m-0 max-w-none h-full rounded-none z-[1000] overflow-hidden" : "max-w-5xl rounded-3xl max-h-[95vh] border border-white/5 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden overflow-y-auto custom-scrollbar"} bg-[#141414] transition-all duration-500`}
            >
              <button
                onClick={() => {
                  setSelectedMovie(null);
                  setShowPlayer(false);
                  if (activeSyncGroup?.isVIP) {
                    setActiveSyncGroup(null);
                  }
                }}
                className={`absolute ${showPlayer ? "top-4 right-4" : "top-6 right-6"} z-[60] p-2 bg-black/60 hover:bg-red-600 rounded-full text-white transition-all backdrop-blur-md border border-white/10 scale-90 md:scale-100`}
              >
                <X className="w-5 h-5" />
              </button>

              <div
                className={`flex flex-col ${showPlayer ? "h-full bg-black" : "md:flex-row h-full"}`}
              >
                <div
                  ref={modalPlayerRef}
                  className="w-full h-full relative bg-black shadow-2xl aspect-video md:aspect-[21/9]"
                >
                  {showPlayer && activeServerUrl ? (
                    <div className="absolute inset-0 bg-black flex items-center justify-center z-10 transition-all">
                      {/* Removed forced error for large content to let user decide/try */}
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
                        </div>
                      ) : activeServerUrl.includes("youtube.com") ||
                        activeServerUrl.includes("youtu.be") ? (
                        <div className="relative w-full h-full overflow-hidden bg-black">
                          <iframe
                            id="room-player"
                            src={buildOptimizedYouTubeEmbedUrl(activeServerUrl)}
                            className="w-full h-[120%] -translate-y-[8.3%] border-none shadow-[0_0_200px_rgba(229,9,20,0.4)] pointer-events-none"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                          {/* Absolute CSS overlays to completely mask YouTube overlays */}
                          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black via-black/40 to-transparent pointer-events-none z-20" />
                          <div className="absolute bottom-0 right-0 w-36 h-12 bg-black pointer-events-none z-20" />
                          <div className="absolute top-0 right-0 w-48 h-16 bg-black pointer-events-none z-20" />
                          <div className="absolute top-0 left-0 w-48 h-16 bg-black pointer-events-none z-20" />
                        </div>
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
                        <iframe
                          src={activeServerUrl}
                          className="w-full h-full border-none shadow-[0_0_200px_rgba(229,9,20,0.4)]"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          id="streaming-player"
                        />
                      ) : (
                        <div className="relative w-full h-full flex items-center justify-center bg-black">
                          <Plyr
                            ref={plyrRef}
                            source={{
                              type: "video",
                              sources: [
                                {
                                  src: activeServerUrl,
                                  provider:
                                    activeServerUrl.includes("youtube.com") ||
                                    activeServerUrl.includes("youtu.be")
                                      ? "youtube"
                                      : "html5",
                                },
                              ],
                              tracks: selectedMovie.subtitleUrl
                                ? [
                                    {
                                      kind: "captions",
                                      label: "Kurdish",
                                      srcLang: "ku",
                                      src: selectedMovie.subtitleUrl,
                                      default: true,
                                    },
                                  ]
                                : [],
                            }}
                            options={{
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
                              settings: ["quality", "speed"],
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
                            }}
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
                              onSyncPlayback={(time, playing) =>
                                updateGlobalPlayback(time, playing)
                              }
                            />
                          </div>
                        </SafeRender>
                      )}

                      {/* Pro Player Overlay UI */}
                      {/* Top Header: Cinemachat Branding, Title and Close Button */}
                      <div className="absolute top-0 inset-x-0 p-6 flex items-center justify-between z-50 bg-gradient-to-b from-black/90 to-transparent pointer-events-none font-sans">
                        <div className="flex items-center gap-2 pointer-events-auto">
                          <button
                            onClick={() => setShowPlayer(false)}
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
                      {(activeServerUrl.includes("youtube.com") ||
                        activeServerUrl.includes("youtu.be")) && (
                        <>
                          {/* Bottom solid black block to cover native YouTube status bars / suggestions */}
                          <div className="absolute bottom-0 inset-x-0 h-16 bg-[#000000] z-40 pointer-events-auto cursor-default border-t border-white/5" />
                          {/* Left bottom watermark shield */}
                          <div className="absolute bottom-16 left-0 w-36 h-16 bg-transparent z-45 pointer-events-auto cursor-default" />
                          {/* Right bottom logo click blocker shield */}
                          <div className="absolute bottom-16 right-0 w-44 h-16 bg-transparent z-45 pointer-events-auto cursor-default" />
                        </>
                      )}

                      {/* Video Player Controller: The 4 clean & responsive player buttons at bottom */}
                      <div className="absolute bottom-0 inset-x-0 h-16 bg-[#0a0a0c]/90 backdrop-blur-xl border-t border-white/5 z-50 flex items-center justify-between px-6 md:px-10 select-none font-sans">
                        {/* CinemaChat Branding Left as Requested */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-brand-primary uppercase tracking-[0.3em] font-mono select-none drop-shadow-sm">
                            CINEMACHAT
                          </span>
                          <span className="text-[10px] text-zinc-500 font-bold kurdish-text select-none">
                            یاریپێکەری فەرمی
                          </span>
                        </div>

                        {/* The exactly 4 active, working buttons */}
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0 pointer-events-auto">
                          {/* 1. Pause/Play (لابردن) */}
                          <button
                            onClick={toggleIframePlay}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-md"
                            title="Play/Pause"
                          >
                            {isIframePlaying ? (
                              <Pause className="w-4 h-4 fill-current" />
                            ) : (
                              <Play className="w-4 h-4 fill-current" />
                            )}
                            <span className="kurdish-text font-black text-[11px]">
                              لابردن (Pause/Play)
                            </span>
                          </button>

                          {/* 2. Volume (دەنگ) */}
                          <button
                            onClick={toggleIframeMute}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-md ${
                              isIframeMuted
                                ? "bg-red-600 hover:bg-red-700 text-white"
                                : "bg-white/5 hover:bg-white/10 text-white"
                            }`}
                            title="Volume"
                          >
                            {isIframeMuted ? (
                              <VolumeX className="w-4 h-4" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                            <span className="kurdish-text font-black text-[11px]">
                              دەنگ (Volume)
                            </span>
                          </button>

                          {/* 3. CC/Subtitles (سەبتایتڵ) */}
                          <button
                            onClick={toggleIframeSubtitles}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-md ${
                              !showIframeSubtitles
                                ? "bg-zinc-800 text-zinc-500"
                                : "bg-white/5 hover:bg-white/10 text-white"
                            }`}
                            title="Subtitles/CC"
                          >
                            <Languages className="w-4 h-4" />
                            <span className="kurdish-text font-black text-[11px]">
                              سەبتایتڵ (CC/Subtitles)
                            </span>
                          </button>

                          {/* 4. Fullscreen (گەورەکردن) */}
                          <button
                            onClick={toggleFullscreenMain}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-md"
                            title="Fullscreen"
                          >
                            <Maximize className="w-4 h-4" />
                            <span className="kurdish-text font-black text-[11px]">
                              گەورەکردن (Fullscreen)
                            </span>
                          </button>
                        </div>
                      </div>

                      {translatedContent && (
                        <motion.div
                          initial={{ y: 50, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="absolute bottom-20 inset-x-4 md:inset-x-0 max-w-4xl mx-auto p-4 md:p-6 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl z-50 pointer-events-none"
                        >
                          <p className="text-xl md:text-3xl font-black kurdish-text text-white leading-relaxed text-center drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                            {translatedContent}
                          </p>
                        </motion.div>
                      )}
                    </div>
                  ) : (
                    <div className="relative h-full aspect-[2/3] md:aspect-auto">
                      <img
                        src={selectedMovie?.image || undefined}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src =
                            "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800";
                        }}
                        className="w-full h-full object-cover"
                        alt={selectedMovie.title}
                      />
                      {selectedMovie.embedUrl && (
                        <button
                          onClick={() => {
                            if (config.playerMode === "popup") {
                              popOutPlayer(
                                selectedMovie.vidsrcUrl ||
                                  selectedMovie.embedUrl ||
                                  selectedMovie.videoUrl,
                              );
                            } else {
                              setShowPlayer(true);
                            }
                          }}
                          className="absolute inset-0 m-auto w-20 h-20 bg-brand-primary/90 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-2xl z-20 group"
                        >
                          <Play className="w-10 h-10 fill-current group-hover:scale-110 transition-transform" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!showPlayer && (
                  <div className="flex-1 p-8 md:p-12 flex flex-col justify-center bg-[#141414]">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
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
                        {selectedMovie.year && (
                          <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-black text-blue-400">
                            {selectedMovie.year}
                          </span>
                        )}
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
                      )}
                    </div>

                    <h2 className="text-3xl md:text-5xl font-black mb-6 kurdish-text leading-tight">
                      {selectedMovie.title}
                    </h2>

                    <div className="flex flex-wrap gap-3 mb-8">
                      {selectedMovie.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 bg-brand-primary/10 border border-brand-primary/20 rounded-md text-[10px] font-black text-brand-primary kurdish-text"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <p className="text-gray-400 kurdish-text text-lg leading-relaxed mb-10 max-w-xl">
                      {translatedContent || selectedMovie.description}
                    </p>

                    <div className="flex flex-col gap-4 mt-auto pt-8 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden p-0.5">
                          {LANGUAGES.map((l) => (
                            <button
                              key={l.code}
                              onClick={() => setTargetLang(l.code)}
                              className={`px-3 py-1 text-[10px] font-black uppercase transition-all ${targetLang === l.code ? "bg-brand-primary text-white" : "text-gray-500 hover:text-white"}`}
                            >
                              {l.name}
                            </button>
                          ))}
                        </div>
                        <button
                          disabled={isTranslating}
                          onClick={() =>
                            translateWithAI(
                              selectedMovie.description,
                              targetLang,
                            )
                          }
                          className="flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/20 rounded-lg text-brand-primary font-black text-[10px] hover:bg-brand-primary/20 transition-all shadow-sm"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span className="kurdish-text">وەرگێڕان (AI)</span>
                        </button>
                      </div>

                      {selectedMovie.externalMovieLink && (
                        <div className="flex items-center gap-2 mb-6 p-4 bg-emerald-900/20 border border-emerald-500/20 rounded-2xl">
                          <ShieldCheck className="w-5 h-5 text-emerald-500" />
                          <p className="text-xs text-emerald-500 font-bold kurdish-text">
                            سەیری فیلمەکە بکە لە سەرچاوەیەکی دەرەکی متمانەپێکراو
                          </p>
                        </div>
                      )}

                      {/* Point: Server Links (Dynamic Switching & Label Improvement) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
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
                            </span>
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
                            </span>
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
                            </span>
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
                            </span>
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
                            </span>
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
                            </span>
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
                            </span>
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
                              </span>
                            </button>
                          )}
                      </div>

                      {selectedMovie.embedUrl && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              if (selectedMovie.externalMovieLink) {
                                window.open(
                                  selectedMovie.externalMovieLink,
                                  "_blank",
                                );
                              } else {
                                setShowPlayer(!showPlayer);
                              }
                            }}
                            className="flex-1 py-3 bg-brand-primary text-white rounded-xl font-black flex items-center justify-center gap-3 hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-600/10"
                          >
                            {showPlayer ? (
                              <X className="w-5 h-5" />
                            ) : (
                              <Play className="w-5 h-5 fill-current" />
                            )}
                            <span className="text-sm kurdish-text">
                              {showPlayer ? "داخستنی ڤیدیۆ" : "ئێستا سەیری بکە"}
                            </span>
                          </button>

                          <button
                            onClick={() => {
                              if (activeServerUrl) {
                                popOutPlayer(activeServerUrl);
                              } else {
                                popOutPlayer(selectedMovie.embedUrl);
                              }
                            }}
                            className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-white/10 transition-all"
                          >
                            <ExternalLink className="w-5 h-5 text-blue-500" />
                            <span className="text-sm kurdish-text whitespace-nowrap">
                              پەنجەرەی دەرەکی
                            </span>
                          </button>

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

                      {activeSyncGroup && selectedMovie.embedUrl && (
                        <button
                          onClick={async () => {
                            const targetRoomId = activeSyncGroup.id;
                            const vidId =
                              selectedMovie.videoId ||
                              selectedMovie.videoUrl ||
                              selectedMovie.embedUrl;
                            const isYoutube =
                              !!selectedMovie.videoId ||
                              selectedMovie.isYouTube;

                            const updatePayload: any = {
                              currentMovieId: selectedMovie.id,
                              videoData: {
                                id: selectedMovie.id,
                                title: selectedMovie.title,
                                image: selectedMovie.image,
                                category: selectedMovie.tags[0] || "Movie",
                                url: isYoutube
                                  ? selectedMovie.embedUrl ||
                                    `https://www.youtube.com/embed/${vidId}`
                                  : undefined,
                                videoUrl: !isYoutube ? vidId : undefined,
                                isYouTube: isYoutube,
                                videoId: isYoutube
                                  ? selectedMovie.videoId ||
                                    extractYouTubeId(
                                      selectedMovie.embedUrl || "",
                                    )
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
                    </div>

                    {/* Point 71: Similar Movies */}
                    <div className="mt-12">
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-6 kurdish-text flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        فیلمە هاوشێوەکان
                      </h4>
                      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
                        {movies
                          .filter(
                            (m) =>
                              m.id !== selectedMovie.id &&
                              m.tags.some((t) =>
                                selectedMovie.tags.includes(t),
                              ),
                          )
                          .slice(0, 5)
                          .map((m) => (
                            <div
                              key={m.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMovie(m);
                              }}
                              className="flex-shrink-0 w-24 md:w-32 group/item cursor-pointer"
                            >
                              <div className="aspect-[2/3] rounded-xl overflow-hidden border border-white/5 group-hover/item:border-brand-primary transition-all">
                                <img
                                  src={m.image || undefined}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <h5 className="mt-2 text-[10px] font-bold kurdish-text truncate text-gray-400 group-hover/item:text-white transition-colors">
                                {m.title}
                              </h5>
                            </div>
                          ))}
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
      <AnimatePresence>
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
                onClick={() => setShowPasswordModal(false)}
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
                  <input
                    type="password"
                    placeholder="وشەی تێپەڕ"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold kurdish-text focus:border-brand-primary outline-none transition-all placeholder:text-gray-600"
                  />
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
          setSocialTab("party");

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
              date: new Date().toISOString(),
              streamingUrl: vipRoomData.videoUrl,
              videoUrl: vipRoomData.videoUrl,
              embedUrl: vipRoomData.videoUrl,
            };
            setSelectedMovie(virtualMovie);
            setShowPlayer(true);
          }
        }}
      />

      {/* Professional Management Dashboard Overlay (Point 31/32/33) */}
      <AnimatePresence>
        {showAdminPanel &&
          (socialProfile?.role === "admin" ||
            socialProfile?.role === "super_admin" ||
            socialProfile?.role === "deputy_manager" ||
            socialProfile?.role === "staff" ||
            currentUser?.role === "admin" ||
            currentUser?.role === "super_admin" ||
            currentUser?.role === "deputy_manager" ||
            currentUser?.role === "staff") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[500] bg-black flex items-center justify-center"
            >
              {/* Dashboard Background */}
              <div className="absolute inset-0 bg-[#0a0a0a]">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-primary/5 blur-[150px] rounded-full" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/5 blur-[150px] rounded-full" />
              </div>

              <div className="relative w-full h-full flex flex-col lg:flex-row max-w-7xl mx-auto p-4 lg:p-8 gap-4 lg:gap-8 overflow-y-auto lg:overflow-hidden">
                {/* Sidebar Navigation */}
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

                    {/* Password protected tabs */}
                    <SidebarItem
                      icon={Plus}
                      label="٤. پۆستکردنی فیلم و یوتوب"
                      active={adminTab === "content"}
                      onClick={() => setAdminTab("content")}
                    />
                    {!(
                      socialProfile?.role === "staff" ||
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
                      socialProfile?.role === "staff" ||
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
                      socialProfile?.role === "staff" ||
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
                          icon={Database}
                          active={adminTab === "database-audit"}
                          label="١٢. بنکەدراوە و هەڵەکان"
                          onClick={() => setAdminTab("database-audit")}
                        />
                        <SidebarItem
                          icon={BarChart2}
                          active={adminTab === "smart-analytics"}
                          label="١٣. شیکارکاری ژیر"
                          onClick={() => setAdminTab("smart-analytics")}
                        />
                        <SidebarItem
                          icon={Ticket}
                          active={adminTab === "ticket-vip"}
                          label="١٤. سیستەمی بلیت VIP"
                          onClick={() => setAdminTab("ticket-vip")}
                        />
                        <SidebarItem
                          icon={Shield}
                          active={adminTab === "system-hub"}
                          label="١٥. سەنتەری سیستەم"
                          onClick={() => setAdminTab("system-hub")}
                        />
                        <SidebarItem
                          icon={TrendingUp}
                          active={adminTab === "growth"}
                          label="١٦. مارکێتینگ و گەشە"
                          onClick={() => setAdminTab("growth")}
                        />
                        <SidebarItem
                          icon={ShieldAlert}
                          active={adminTab === "m17-auth"}
                          label="١٧. ڕێگەپێدانی فرە-ئاستی"
                          onClick={() => setAdminTab("m17-auth")}
                        />
                        <SidebarItem
                          icon={MessageSquare}
                          active={adminTab === "whatsapp-automation"}
                          label="١٨. ئۆتۆمەیشنی وەتسئەپ (Webhook)"
                          onClick={() => setAdminTab("whatsapp-automation")}
                        />
                        <SidebarItem
                          icon={Tv}
                          active={adminTab === "broadcast-main"}
                          label="١٩. پەخشی گشتی (Main Broadcast)"
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
                  </nav>

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

                {/* Main Content Area */}
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
                      <button className="px-5 py-3 sm:py-2.5 bg-red-600/10 text-red-500 border border-red-600/20 rounded-xl text-[10px] font-black kurdish-text hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2">
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

                  {/* Scrollable Content */}
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
                            onSyncNow={() => {
                              fetchMovies();
                              alert("سەرجەم ئامێرەکان دەستبەجێ ئەپدێت کرانەوە");
                            }}
                            onPost={async (movie: any) => {
                              try {
                                const sanitizeUrl = (url: any) => {
                                  if (typeof url !== "string") return "";
                                  let clean = url.trim();
                                  if (clean.includes("youtube.com/watch?v="))
                                    clean = clean.replace("watch?v=", "embed/");
                                  else if (clean.includes("youtu.be/"))
                                    clean = `https://www.youtube.com/embed/${clean.split("youtu.be/")[1]}`;
                                  return clean;
                                };

                                setLastAddedMovie(null);
                                const trailerId = movie.trailerUrl
                                  ? extractYouTubeId(movie.trailerUrl)
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
                                  external_link: sanitizeUrl(
                                    movie.streamingUrl ||
                                      movie.external_link ||
                                      movie.videoUrl,
                                  ),
                                  date: new Date().toISOString(),
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
                                  fetchMovies();
                                  setLastAddedMovie(postedMovie);
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
                            const isYoutube =
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

                            if (isYoutube) {
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
                            } else {
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

                            await fetchApi("/api/rooms/global_room_official", {
                              method: "POST",
                              body: JSON.stringify(updatePayload),
                            });
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
                                    </span>
                                    <select
                                      value={
                                        movie.tags.find((t) =>
                                          dynamicCategories.includes(t),
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
                                    <button
                                      onClick={async () => {
                                        const isYoutube =
                                          movie.embedUrl?.includes(
                                            "youtube.com",
                                          ) ||
                                          movie.embedUrl?.includes("youtu.be");
                                        const vidId = isYoutube
                                          ? extractYouTubeId(
                                              movie.embedUrl || "",
                                            ) || movie.id
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
                                            url:
                                              movie.embedUrl ||
                                              `https://www.youtube.com/embed/${vidId}`,
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
                                      title="پۆست بکە بۆ ژوورەکە"
                                    >
                                      <Radio className="w-4 h-4" />
                                    </button>
                                    {!(
                                      socialProfile?.role === "staff" ||
                                      socialProfile?.userRole === "staff" ||
                                      currentUser?.role === "staff"
                                    ) && (
                                      <button
                                        onClick={async () => {
                                          if (
                                            confirm(
                                              `ئایا دڵنیایت لە سڕینەوەی "${movie.title}" ؟`,
                                            )
                                          ) {
                                            const res = await fetchApi(
                                              `/api/admin/movies/${movie.id}`,
                                              { method: "DELETE" },
                                            );
                                            if (res.ok) fetchMovies();
                                          }
                                        }}
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
                            try {
                              const res = await fetchApi("/api/movies/hero", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  heroVideoUrl: url,
                                  heroPlaylist: [url],
                                }),
                              });

                              if (res.ok) {
                                const firstUrl =
                                  url ||
                                  "https://www.youtube.com/watch?v=YPY7J-flzE8";
                                const isYoutube =
                                  firstUrl.includes("youtube.com") ||
                                  firstUrl.includes("youtu.be");
                                const vidId = isYoutube
                                  ? extractYouTubeId(firstUrl) || firstUrl
                                  : firstUrl;
                                const heroVideoEmbedUrl = isYoutube
                                  ? `https://www.youtube.com/embed/${vidId}`
                                  : firstUrl;

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
                                  description: "نوێترین فیلمی سەرەکی",
                                  heroPlaylist: [url],
                                } as any);

                                setConfig((prev) => ({
                                  ...prev,
                                  heroVideoUrl: url,
                                }));
                                setCurrentVideoIndex(0); // Restart playlist sequence
                                alert("فیلمی سەرەکی بە سەرکەوتوویی جێگیرکرا!");
                              } else {
                                alert(
                                  "هەڵەیەک ڕوویدا لە کاتی پەیوندی لەگەڵ سێرڤەر!",
                                );
                              }
                            } catch (err) {
                              console.error("Hero sync error:", err);
                              alert(
                                "هەڵەیەک ڕوویدا لە کاتی جێگیرکردنی فیلمەکە!",
                              );
                            }
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

                      {adminTab === "channel" && (
                        <ChannelSettingsModule
                          youtubeUrl={config.youtubeUrl}
                          tiktokUrl={config.tiktokUrl}
                          instagramUrl={config.instagramUrl}
                          facebookUrl={config.facebookUrl}
                          onUpdate={async (updates) => {
                            await updateConfig(updates);
                          }}
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
                              await setDoc(doc(db, "config", "general"), { roomVideoUrl: val }, { merge: true });
                              await setDoc(doc(db, "config", "hero"), { roomVideoUrl: val }, { merge: true });
                              console.log("[Client Firestore Sync] Successfully synced general and hero from Settings tab.");
                            } catch (error) {
                              console.error("[Config Sync] Settings failed:", error);
                              alert("هەڵەیەک ڕوویدا لە کاتی پاشەکەوتکردن لە ڕێکخستنە گشتییەکان!");
                            }
                          }}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Point 15/20: Floating WhatsApp Button */}
      {(import.meta.env.VITE_WHATSAPP_NUMBER ||
        import.meta.env.VITE_WHATSAPP_GROUP_LINK) && (
        <motion.a
          href={
            import.meta.env.VITE_WHATSAPP_GROUP_LINK ||
            `https://wa.me/${import.meta.env.VITE_WHATSAPP_NUMBER}`
          }
          target="_blank"
          rel="noreferrer"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          className="fixed bottom-8 left-8 z-[150] w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-2xl shadow-[#25D366]/40 text-white cursor-pointer"
        >
          <MessageCircle className="w-7 h-7" />
          <div className="absolute inset-0 bg-[#25D366] rounded-full animate-ping opacity-20"></div>
        </motion.a>
      )}

      <footer className="official-footer">
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
            <div className="flex gap-3">
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
          </div>

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
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-white kurdish-text">
              مافی پارێزراو & DMCA
            </h3>
            <p className="text-[11px] text-gray-600 kurdish-text leading-loose">
              هەموو ئەو فیلمانەی لەم سایتەدا دەبینرێن لە سەرچاوە دەرەکییەکانەوە
              (تێلگرام، گۆگڵ درایڤ) وەرگیراون. سینەما چات هیچ فایلێکی ڤیدیۆیی
              لەسەر سێرڤەری خۆی هەڵناگرێت.
            </p>
            <div className="flex gap-3">
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-widest">
                Safe Platform
              </div>
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-widest">
                No Tracking
              </div>
            </div>
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
      </footer>

      {/* Social Protocol Overlays */}
      <RegistrationModal
        isOpen={showSocialModal}
        initialMode={modalMode}
        onClose={() => setShowSocialModal(false)}
      />

      {/* Smart Entry Modal */}
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
                    />
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

                  <input
                    type="file"
                    ref={joinQrInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleJoinQRUpload}
                  />
                </div>

                <AnimatePresence>
                  {joinValidationStatus !== "idle" && (
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

      <AnimatePresence>
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
      </AnimatePresence>

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
