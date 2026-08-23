import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Settings, 
  CreditCard, 
  QrCode, 
  FileText, 
  Check, 
  Copy, 
  Search, 
  Trash2, 
  ShieldAlert, 
  Users, 
  Ticket, 
  Smartphone, 
  Info, 
  AlertCircle,
  RefreshCw,
  Eye,
  X,
  Sparkles,
  Upload,
  Link,
  Image as ImageIcon,
  Clock as ClockIcon,
  Crown,
  History,
  Film,
  Phone
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  db,
  collection,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc
} from "../../lib/firebase";

interface VIPSetting {
  qrCodeUrl: string;
  paymentDetails: string;
  instructions: string;
  paymentLogoUrl?: string;
  // Shared contact channels (unified Payment & Contact panel) — mirrored to
  // both the VIP Lounge and the Cinema Window room.
  whatsappNumber?: string;
  supportPhone?: string;
  // Silent "behind-the-glass" trailer shown to users outside the VIP room.
  glassPreviewUrl?: string;
  glassPreviewEnabled?: boolean;
}

interface CinemaWindowAdminRoom {
  id: string;
  type: string;
  name: string;
  description: string;
  movieId: string;
  previewUrl: string;
  posterUrl: string;
  fullVideoReference: string;
  price: number;
  currency: string;
  accessDurationHours: number;
  status: "ACTIVE" | "DRAFT" | "DISABLED" | "EXPIRED";
  paymentSettings?: VIPSetting;
  createdAt?: string;
  updatedAt?: string;
}

interface FileUploaderInputProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  description?: string;
  placeholder?: string;
  adminName: string;
  onError: (err: string) => void;
}

const FileUploaderInput: React.FC<FileUploaderInputProps> = ({
  label,
  value,
  onChange,
  description,
  placeholder,
  adminName,
  onError
}) => {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (file: File) => {
    const MAX_SIZE = 250 * 1024; // keeps base64 payloads well under Firestore's 1MiB doc limit (QR + logo share one doc)
    if (file.size > MAX_SIZE) {
      onError(`⚠️ قەبارەی وێنە ناتوانێت لە ٢٥٠ کیلۆبایت زیاتر بێت!`);
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      onError(`⚠️ ڕێگە تەنها بە وێنەکانی (PNG, JPEG, WebP, SVG) دراوە!`);
      return;
    }

    setIsUploading(true);
    try {
      // Firebase Storage is unavailable on this free (Spark) project, so VIP
      // images are stored inline as base64 data URLs directly in the Firestore
      // document. This needs no billing and survives the dead Render server.
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.readAsDataURL(file);
      });
      onChange(base64);
    } catch (err: any) {
      onError("کێشەیەک هەیە لە خوێندنەوەی وێنەکە: " + (err.message || String(err)));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleFileChange(files[0]);
    }
  };

  return (
    <div className="space-y-2 bg-[#14151a]/50 p-4 rounded-2xl border border-white/5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className="text-xs text-slate-300 kurdish-text font-bold flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
          {label}
        </label>
        
        <div className="flex gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`px-3 py-1 rounded-md text-[10px] font-bold kurdish-text flex items-center gap-1 transition ${
              mode === "upload" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/10" : "text-gray-400 hover:text-white"
            }`}
          >
            <Upload className="w-3 h-3" />
            بارکردنی فایل
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`px-3 py-1 rounded-md text-[10px] font-bold kurdish-text flex items-center gap-1 transition ${
              mode === "url" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/10" : "text-gray-400 hover:text-white"
            }`}
          >
            <Link className="w-3 h-3" />
            بەستەری URL
          </button>
        </div>
      </div>

      {mode === "upload" ? (
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border border-dashed rounded-xl p-5 text-center transition flex flex-col items-center justify-center gap-2 cursor-pointer ${
            isDragging 
              ? "border-purple-500 bg-purple-500/10" 
              : "border-white/10 hover:border-purple-500/20 bg-black/20"
          }`}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = (e) => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files.length > 0) {
                handleFileChange(files[0]);
              }
            };
            input.click();
          }}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
              <span className="text-[10px] text-purple-300 kurdish-text font-bold">لە ناردن و بارکردن دایە...</span>
            </div>
          ) : (
            <>
              {value ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-20 h-20 bg-white/5 rounded-xl p-1 overflow-hidden relative border border-white/10 shadow-lg">
                    <img src={value} alt="Uploaded Image Thumbnail" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[200px]" dir="ltr">{value}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange("");
                      }}
                      className="p-1 hover:bg-red-500/20 text-red-400 rounded transition"
                      title="سڕینەوە"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-zinc-500" />
                  <span className="text-[10px] text-zinc-400 kurdish-text leading-relaxed">
                    کلیک لێرە بکە بۆ هەڵبژاردنی وێنە یان فایدەکە لێرە دابنێ (JPEG/PNG/WebP/SVG)
                    <br />
                    <span className="text-zinc-500 font-medium">زۆرترین قەبارە: ٢ مێگابایت</span>
                  </span>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "بەستەر بنووسە: https://domain.com/image.png"}
            className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white font-mono outline-none"
            dir="ltr"
          />
          {value && (
            <div className="flex items-center gap-3 bg-black/20 p-2 rounded-xl border border-white/5">
              <div className="w-10 h-10 bg-white/5 rounded-lg p-0.5 overflow-hidden border border-white/10 shrink-0">
                <img src={value} alt="URL-Based Preview" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              </div>
              <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[250px]" dir="ltr">{value}</span>
              <button
                type="button"
                onClick={() => onChange("")}
                className="mr-auto p-1.5 hover:bg-white/10 text-red-400 hover:text-red-300 rounded transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {description && (
        <p className="text-[10px] text-zinc-500 kurdish-text">{description}</p>
      )}
    </div>
  );
};

interface VIPOrder {
  code: string;
  customerName: string;
  customerPhone: string;
  videoUrl?: string;
  usedCount: number;
  lastIp: string;
  lastDevice: string;
  status: string;
  createdAt: string;
  // Section 15 generator validity fields
  expiresAt?: string; // computed ISO deadline (absent = open-ended)
  validDays?: number;
  validHours?: number;
  createdBy?: string;
  // Live-session tracking stamped by the VIP modal when a holder starts viewing
  lastActiveAt?: string;
  activeDevice?: string;
  isLive?: boolean;
}

// Human-friendly device label from a raw User-Agent string ("Chrome • Android").
const describeDevice = (ua?: string): string => {
  if (!ua) return "نەزانراو";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const os = /Android/i.test(ua) ? "Android"
    : /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Windows/i.test(ua) ? "Windows"
    : /Mac OS X/i.test(ua) ? "macOS"
    : /Linux/i.test(ua) ? "Linux"
    : "";
  return os ? `${browser} • ${os}` : browser;
};

// Hours remaining until an expiry ISO timestamp (null when open-ended/invalid).
const hoursLeftOn = (expiresAt?: string): number | null => {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (t - Date.now()) / 3600000);
};

// LIVE heuristic: the VIP modal stamps isLive + lastActiveAt whenever a ticket
// holder starts viewing; a stamp younger than this window shows as a live
// session in the usage archive.
const LIVE_SESSION_WINDOW_MS = 15 * 60 * 1000;
const isSessionLive = (t: { isLive?: boolean; lastActiveAt?: string }): boolean => {
  if (!t.isLive || !t.lastActiveAt) return false;
  const at = new Date(t.lastActiveAt).getTime();
  return !Number.isNaN(at) && Date.now() - at < LIVE_SESSION_WINDOW_MS;
};

// Default validity applied when approving a payment request with one click.
const APPROVE_DEFAULT_VALIDITY_DAYS = 30;

// Cinema Window duration presets for the dedicated code generator (Tab 2).
const CINEMA_DURATION_PRESETS = [
  { key: "daily", labelKu: "ڕۆژانە", labelEn: "Daily", hours: 24 },
  { key: "monthly", labelKu: "مانگانە", labelEn: "Monthly", hours: 720 },
  { key: "annual", labelKu: "ساڵانە", labelEn: "Annual", hours: 8760 },
] as const;

interface TicketVIPModuleProps {
  currentUser: any;
}

export const TicketVIPModule: React.FC<TicketVIPModuleProps> = ({ currentUser }) => {
  // Module 15 is organised into four clean sections:
  // payment (shared) → cinema → vip lounge → archive.
  const [activeSubTab, setActiveSubTab] = useState<"payment" | "cinema" | "vip" | "archive">("payment");
  
  // States
  const [tickets, setTickets] = useState<VIPOrder[]>([]);
  const [vipVideos, setVipVideos] = useState<any[]>([]);
  const [settings, setSettings] = useState<VIPSetting>({
    qrCodeUrl: "",
    paymentDetails: "",
    instructions: ""
  });
  const [vipRequests, setVipRequests] = useState<any[]>([]);
  
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [trailerUrl, setTrailerUrl] = useState("");
  const [selectedVipVideoId, setSelectedVipVideoId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Section 15 generator validity inputs: expiration days AND/OR a specific
  // date AND/OR hours of validity. The earliest provided deadline wins;
  // "noExpiry" mints an open-ended ticket.
  const [validityDays, setValidityDays] = useState("30");
  const [validityDate, setValidityDate] = useState("");
  const [validityHours, setValidityHours] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);

  // 30s ticker so the usage-archive countdown chips stay fresh while open.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Settings form states
  const [formQr, setFormQr] = useState("");
  const [formDetails, setFormDetails] = useState("");
  const [formInst, setFormInst] = useState("");
  const [formLogo, setFormLogo] = useState("");
  const [formGlassUrl, setFormGlassUrl] = useState("");
  const [formGlassEnabled, setFormGlassEnabled] = useState(false);
  // Shared contact channels (Tab 1) — stored on vip_settings and mirrored to
  // the Cinema Window room's paymentSettings.
  const [formWhatsapp, setFormWhatsapp] = useState("");
  const [formSupportPhone, setFormSupportPhone] = useState("");
  // Admin-generated Cinema Window access codes (Tab 2 + archive).
  const [cinemaCodes, setCinemaCodes] = useState<any[]>([]);
  const [lastCinemaCode, setLastCinemaCode] = useState<{ code: string; expiresAt: string; hours: number } | null>(null);
  const [cinemaRoom, setCinemaRoom] = useState<CinemaWindowAdminRoom | null>(null);
  const [cinemaName, setCinemaName] = useState("");
  const [cinemaDescription, setCinemaDescription] = useState("");
  const [cinemaMovieId, setCinemaMovieId] = useState("movie_1");
  const [cinemaPreviewUrl, setCinemaPreviewUrl] = useState("");
  const [cinemaPosterUrl, setCinemaPosterUrl] = useState("");
  const [cinemaFullVideoReference, setCinemaFullVideoReference] = useState("");
  const [cinemaPrice, setCinemaPrice] = useState("1.99");
  const [cinemaCurrency, setCinemaCurrency] = useState("USD");
  const [cinemaAccessHours, setCinemaAccessHours] = useState("24");
  const [cinemaStatus, setCinemaStatus] = useState<CinemaWindowAdminRoom["status"]>("ACTIVE");

  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  
  // Admin selected request screenshot modal
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);
  
  // Dynamic individual video-binding state for requests approval
  const [requestVideoUrls, setRequestVideoUrls] = useState<{ [reqId: string]: string }>({});

  const adminName = currentUser?.username || "Admin";

  // Map a Firestore query snapshot to plain objects ({ id, ...data }).
  const mapDocs = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

  // Deterministic unique ticket code (also used as the vip_tickets doc id).
  const generateTicketCode = () => {
    const rand = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    return `VIP-${rand.toUpperCase()}`;
  };

  // Combine the three validity inputs (days / specific date / hours) into a
  // single ISO deadline. The EARLIEST provided candidate wins so conflicting
  // inputs always resolve to the strictest expiry; returns null when the admin
  // chose an open-ended ticket or provided nothing.
  const computeExpiresAt = (): string | null => {
    if (noExpiry) return null;
    const candidates: number[] = [];
    const days = parseInt(validityDays, 10);
    if (!Number.isNaN(days) && days > 0) candidates.push(Date.now() + days * 86400000);
    if (validityDate) {
      const dt = new Date(`${validityDate}T23:59:59`);
      if (!Number.isNaN(dt.getTime())) candidates.push(dt.getTime());
    }
    const hours = parseInt(validityHours, 10);
    if (!Number.isNaN(hours) && hours > 0) candidates.push(Date.now() + hours * 3600000);
    if (candidates.length === 0) return null;
    return new Date(Math.min(...candidates)).toISOString();
  };

  // Live preview of the deadline the generator will stamp on the next ticket.
  const previewExpiresAt = computeExpiresAt();

  const syncCinemaForm = (room: CinemaWindowAdminRoom) => {
    setCinemaRoom(room);
    setCinemaName(room.name || "");
    setCinemaDescription(room.description || "");
    setCinemaMovieId(room.movieId || "movie_1");
    setCinemaPreviewUrl(room.previewUrl || "");
    setCinemaPosterUrl(room.posterUrl || "");
    setCinemaFullVideoReference(room.fullVideoReference || "");
    setCinemaPrice(String(room.price ?? 0));
    setCinemaCurrency(room.currency || "USD");
    setCinemaAccessHours(String(room.accessDurationHours || 24));
    setCinemaStatus(room.status || "ACTIVE");

    if (room.paymentSettings) {
      setFormQr(room.paymentSettings.qrCodeUrl || "");
      setFormLogo(room.paymentSettings.paymentLogoUrl || "");
      setFormDetails(room.paymentSettings.paymentDetails || "");
      setFormInst(room.paymentSettings.instructions || "");
      setFormWhatsapp((room.paymentSettings as any).whatsappNumber || "");
      setFormSupportPhone((room.paymentSettings as any).supportPhone || "");
    }
  };

  const loadCinemaWindowRoom = async () => {
    const response = await fetch(`/api/admin/cinema-window/current?adminName=${encodeURIComponent(adminName)}`);
    const data = await response.json();

    if (!response.ok || !data.success || !data.room) {
      throw new Error(data.error || data.message || "Cinema Window room could not be loaded.");
    }

    syncCinemaForm(data.room as CinemaWindowAdminRoom);
  };

  // Admin-minted + payment-minted Cinema Window codes (Tab 2 preview list and
  // the combined usage archive).
  const loadCinemaCodes = async () => {
    try {
      const response = await fetch("/api/admin/cinema-window/access-codes");
      const data = await response.json();
      if (response.ok && data.success) {
        setCinemaCodes(Array.isArray(data.codes) ? data.codes : []);
      }
    } catch (err) {
      console.warn("cinema access-codes:", err);
    }
  };

  // Mint a Cinema Window code with a fixed duration (daily/monthly/annual).
  const handleGenerateCinemaCode = async (hours: number, labelKu: string) => {
    setErrorText("");
    setSuccessText("");
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/admin/cinema-window/access-codes?adminName=${encodeURIComponent(adminName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationHours: hours }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "کۆد دروست نەبوو.");
      }
      setLastCinemaCode({ code: data.accessCode, expiresAt: data.expiresAt, hours });
      setSuccessText(`✓ کۆدی ${labelKu}ی Cinema Window دروستکرا!`);
      await loadCinemaCodes();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "دروستکردنی کۆدی Cinema Window شکستی هێنا.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadVIPData = async () => {
    setIsLoading(true);
    try {
      // 1. Tickets
      const ticketsSnap = await getDocs(collection(db, "vip_tickets"));
      const tList = mapDocs(ticketsSnap);
      tList.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      setTickets(tList);

      // 2. Settings
      const settingsSnap = await getDoc(doc(db, "vip_settings", "default"));
      if (settingsSnap.exists()) {
        const sData = settingsSnap.data();
        setSettings(sData as VIPSetting);
        setFormQr(sData.qrCodeUrl || "");
        setFormDetails(sData.paymentDetails || "");
        setFormInst(sData.instructions || "");
        setFormLogo(sData.paymentLogoUrl || "");
        setFormWhatsapp((sData as any).whatsappNumber || "");
        setFormSupportPhone((sData as any).supportPhone || "");
        setFormGlassUrl(sData.glassPreviewUrl || "");
        setFormGlassEnabled(!!sData.glassPreviewEnabled);
      }

      // 3. Videos
      const videosSnap = await getDocs(collection(db, "vip_videos"));
      const vList = mapDocs(videosSnap);
      vList.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setVipVideos(vList);

      // 4. Requests
      const requestsSnap = await getDocs(collection(db, "vip_requests"));
      const rList = mapDocs(requestsSnap);
      rList.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      setVipRequests(rList);

      await loadCinemaWindowRoom();
      await loadCinemaCodes();
    } catch (err) {
      console.error("Error loading VIP module:", err);
      setErrorText("کێشە لە بارکردنی داتاکانی VIP (Firestore).");
    } finally {
      setIsLoading(false);
    }
  };

  // Real-time Firestore sync: the side panel updates instantly when a user
  // submits a request, a ticket is generated, settings are saved, or a VIP
  // video is added — no server round-trip needed.
  useEffect(() => {
    loadVIPData();

    const unsubTickets = onSnapshot(
      collection(db, "vip_tickets"),
      (snap) => {
        const tList = mapDocs(snap);
        tList.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        setTickets(tList);
      },
      (err) => console.warn("vip_tickets listener:", err)
    );

    const unsubVideos = onSnapshot(
      collection(db, "vip_videos"),
      (snap) => {
        const vList = mapDocs(snap);
        vList.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setVipVideos(vList);
      },
      (err) => console.warn("vip_videos listener:", err)
    );

    const unsubSettings = onSnapshot(
      doc(db, "vip_settings", "default"),
      (snap) => {
        if (!snap.exists()) return;
        const sData = snap.data();
        setSettings(sData as VIPSetting);
        setFormQr(sData.qrCodeUrl || "");
        setFormDetails(sData.paymentDetails || "");
        setFormInst(sData.instructions || "");
        setFormLogo(sData.paymentLogoUrl || "");
        setFormWhatsapp((sData as any).whatsappNumber || "");
        setFormSupportPhone((sData as any).supportPhone || "");
        setFormGlassUrl(sData.glassPreviewUrl || "");
        setFormGlassEnabled(!!sData.glassPreviewEnabled);
      },
      (err) => console.warn("vip_settings listener:", err)
    );

    const unsubRequests = onSnapshot(
      collection(db, "vip_requests"),
      (snap) => {
        const rList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rList.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        setVipRequests(rList);
      },
      (err) => console.warn("vip_requests listener:", err)
    );

    return () => {
      unsubTickets();
      unsubVideos();
      unsubSettings();
      unsubRequests();
    };
  }, []);

  // Copy code utility
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Generate code ticket manually
  const handleGenerateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText("");
    setSuccessText("");

    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorText("⚠️ ناوی بەشداربوو یان ژمارەی پەیوەندی بەتاڵە!");
      return;
    }

    const expiresAt = computeExpiresAt();
    if (!expiresAt && !noExpiry) {
      setErrorText("⚠️ تکایە ماوەی دروستی دیاری بکە (ڕۆژ / بەروار / کاتژمێر) یان 'بێ کۆتایی' چالاک بکە!");
      return;
    }

    try {
      setIsLoading(true);
      const code = generateTicketCode();
      const boundUrl =
        videoUrl.trim() ||
        vipVideos.find((v: any) => v.id === selectedVipVideoId)?.videoUrl ||
        "";

      await setDoc(doc(db, "vip_tickets", code), {
        code,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        videoUrl: boundUrl,
        vipVideoId: selectedVipVideoId || "",
        usedCount: 0,
        lastIp: "",
        lastDevice: "",
        status: "active",
        createdAt: new Date().toISOString(),
        // Generator validity metadata (validated in firestore.rules)
        expiresAt: expiresAt || "",
        validDays: noExpiry ? 0 : Math.max(0, parseInt(validityDays, 10) || 0),
        validHours: noExpiry ? 0 : Math.max(0, parseInt(validityHours, 10) || 0),
        createdBy: adminName,
        isLive: false,
      });

      setSuccessText(
        `✓ تیکێت بە سەرکەوتوویی دروستکرا! کۆد: ${code}` +
          (expiresAt ? ` — کۆتایی مۆڵەت: ${new Date(expiresAt).toLocaleString("en-GB")}` : " — بێ کۆتایی"),
      );
      setCustomerName("");
      setCustomerPhone("");
      setVideoUrl("");
      setSelectedVipVideoId("");
      loadVIPData();
    } catch (err) {
      setErrorText(
        "کێشە لە دروستکردنی بلیتەکە (Firestore): " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Save Settings — ONE unified panel for BOTH rooms. Writes vip_settings
  // (read live by the VIP Lounge modal) and mirrors the same values onto the
  // Cinema Window room's paymentSettings (read by CinemaWindowModal).
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText("");
    setSuccessText("");

    try {
      setIsLoading(true);
      await setDoc(
        doc(db, "vip_settings", "default"),
        {
          qrCodeUrl: formQr,
          paymentDetails: formDetails,
          instructions: formInst,
          paymentLogoUrl: formLogo,
          whatsappNumber: formWhatsapp.trim(),
          supportPhone: formSupportPhone.trim(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      // Mirror onto the Cinema Window room without touching its movie fields.
      try {
        const base = cinemaRoom || ({} as any);
        await fetch(`/api/admin/cinema-window/current?adminName=${encodeURIComponent(adminName)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: base.name || "Cinema Window",
            description: base.description || "",
            movieId: base.movieId || "movie_1",
            previewUrl: base.previewUrl || "",
            posterUrl: base.posterUrl || "",
            fullVideoReference: base.fullVideoReference || "",
            price: base.price ?? 1.99,
            currency: base.currency || "USD",
            accessDurationHours: base.accessDurationHours || 24,
            status: base.status || "ACTIVE",
            qrCodeUrl: formQr,
            paymentLogoUrl: formLogo,
            paymentDetails: formDetails,
            instructions: formInst,
            whatsappNumber: formWhatsapp.trim(),
            supportPhone: formSupportPhone.trim(),
          }),
        });
      } catch (mirrorErr) {
        console.warn("Payment mirror to Cinema Window failed:", mirrorErr);
      }

      setSuccessText("✓ ڕێکخستنەکانی پارەدان و پەیوەندی بۆ هەردوو ژوور بە سەرکەوتوویی پاشەکەوت کران.");
      loadVIPData();
    } catch (err) {
      setErrorText("کێشەی نوێکردنەوە لە Firestore.");
    } finally {
      setIsLoading(false);
    }
  };

  // Save the silent glass-preview trailer (VIP Lounge presentation only).
  const handleSaveGlass = async () => {
    setErrorText("");
    setSuccessText("");
    try {
      setIsLoading(true);
      await setDoc(
        doc(db, "vip_settings", "default"),
        {
          glassPreviewUrl: formGlassUrl.trim(),
          glassPreviewEnabled: formGlassEnabled,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setSuccessText("✓ پێشبینینی شوشەی هۆڵی VIP پاشەکەوت کرا.");
    } catch (err) {
      setErrorText("کێشەی نوێکردنەوە لە Firestore.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCinemaWindow = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText("");
    setSuccessText("");

    if (!cinemaName.trim()) {
      setErrorText("Cinema Window name is required.");
      return;
    }

    if (!cinemaFullVideoReference.trim()) {
      setErrorText("Full movie link is required for the current Cinema Window room.");
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/cinema-window/current?adminName=${encodeURIComponent(adminName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cinemaName,
          description: cinemaDescription,
          movieId: cinemaMovieId,
          previewUrl: cinemaPreviewUrl,
          posterUrl: cinemaPosterUrl,
          fullVideoReference: cinemaFullVideoReference,
          price: Number(cinemaPrice),
          currency: cinemaCurrency,
          accessDurationHours: Number(cinemaAccessHours),
          status: cinemaStatus,
          qrCodeUrl: formQr,
          paymentLogoUrl: formLogo,
          paymentDetails: formDetails,
          instructions: formInst,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || "Cinema Window could not be saved.");
      }

      syncCinemaForm(data.room as CinemaWindowAdminRoom);
      await setDoc(
        doc(db, "vip_settings", "default"),
        {
          qrCodeUrl: formQr,
          paymentDetails: formDetails,
          instructions: formInst,
          paymentLogoUrl: formLogo,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setSuccessText("✓ Cinema Window room has been saved and linked to the current VIP room.");
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Cinema Window save failed.");
    } finally {
      setIsLoading(false);
    }
  };

  // Approve User-Submitted Request
  const handleApproveRequest = async (requestId: string) => {
    setErrorText("");
    setSuccessText("");
    const boundUrl = requestVideoUrls[requestId] || "";

    try {
      setIsLoading(true);
      const req = vipRequests.find((r: any) => r.id === requestId);
      if (!req) {
        setErrorText("داواکارییەکە نەدۆزرایەوە.");
        return;
      }

      const code = generateTicketCode();
      const finalUrl =
        boundUrl ||
        req.videoUrl ||
        (vipVideos.length > 0 ? vipVideos[vipVideos.length - 1]?.videoUrl || "" : "");

      // Approved requests get the module default validity (30 days).
      const expiresAt = new Date(Date.now() + APPROVE_DEFAULT_VALIDITY_DAYS * 86400000).toISOString();

      await setDoc(doc(db, "vip_tickets", code), {
        code,
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        videoUrl: finalUrl,
        vipVideoId: "",
        usedCount: 0,
        lastIp: "",
        lastDevice: "",
        status: "active",
        createdAt: new Date().toISOString(),
        expiresAt,
        validDays: APPROVE_DEFAULT_VALIDITY_DAYS,
        validHours: 0,
        createdBy: adminName,
        isLive: false,
      });

      await updateDoc(doc(db, "vip_requests", requestId), {
        status: "Approved",
        approvedCode: code,
        videoUrl: finalUrl,
      });

      setSuccessText(`✓ داواکاری قبوڵکرا! کۆدی VIP: ${code} — مۆڵەت: ${APPROVE_DEFAULT_VALIDITY_DAYS} ڕۆژ`);
      // Clear temp binding URL
      const updatedBinds = { ...requestVideoUrls };
      delete updatedBinds[requestId];
      setRequestVideoUrls(updatedBinds);
      loadVIPData();
    } catch (err) {
      setErrorText("هەڵەیەک لە پەسەندکردنی داواکارییەکەدا هەیە.");
    } finally {
      setIsLoading(false);
    }
  };

  // Decline/Delete User Request
  const handleDeleteRequest = async (requestId: string) => {
    setErrorText("");
    setSuccessText("");

    try {
      setIsLoading(true);
      await deleteDoc(doc(db, "vip_requests", requestId));
      setSuccessText("✓ داواکارییەکە بە سەرکەوتوویی ڕەتکرایەوە یان سڕایەوە.");
      loadVIPData();
    } catch (err) {
      setErrorText("شکست لە سڕینەوەی داواکارییەکە.");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTickets = tickets.filter(t => 
    t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.customerPhone.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Combined archive rows (Tab 4): VIP Lounge tickets live in Firestore while
  // Cinema Window codes live in the server access-code ledger — both are shown
  // here with a room badge so nothing needs a second screen.
  const pendingRequestsCount = vipRequests.filter(r => r.status === "Pending").length;
  const liveTicketCount = tickets.filter(isSessionLive).length;
  const expiredTicketCount = tickets.filter(t => {
    const left = hoursLeftOn(t.expiresAt);
    return (left !== null && left <= 0) || t.status === "Expired";
  }).length + cinemaCodes.filter(c => c.status === "EXPIRED").length;
  const activeCinemaCount = cinemaCodes.filter(c => c.status === "ACTIVE").length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page header */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-900/40 via-[#0f1013] to-purple-900/30 border border-white/5 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="absolute right-0 top-0 h-40 w-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-purple-500/15 rounded-2xl flex items-center justify-center text-purple-400 border border-purple-500/20 shadow-lg shadow-purple-500/5 col">
            <Ticket className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">مۆدیۆڵ ١٥: سیستەمی بلیت و بڵاوکردنەوەی VIP سەرچاوە فەرمییەکان</h2>
            <p className="text-xs text-gray-400 kurdish-text mt-1">چوار بەشی جیاواز: پارەدان و پەیوەندی هاوبەش، بەڕێوبەرایەتی Cinema Window، بەڕێوبەرایەتی هۆڵی شاهانەی VIP، و ئەرشیفی بەکارهێنان.</p>
          </div>
        </div>

        <button 
          onClick={loadVIPData}
          disabled={isLoading}
          className="p-2 py-1.5 self-start md:self-auto bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/5 text-xs font-semibold flex items-center gap-2 transition duration-150"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          تازەکردنەوەی داتا
        </button>
      </div>

      {/* Navigation Sub-Tabs — four clean sections */}
      <div className="flex flex-wrap gap-2 p-1 bg-[#12141a]/60 border border-white/5 rounded-2xl">
        <button
          onClick={() => { setActiveSubTab("payment"); setErrorText(""); setSuccessText(""); }}
          className={`px-4 py-2 text-xs font-black rounded-xl kurdish-text flex items-center gap-2 transition duration-200 relative ${
            activeSubTab === "payment"
              ? "bg-purple-600 text-white shadow-lg"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          پارەدان و پەیوەندی (هەردوو ژوور)
          {pendingRequestsCount > 0 && (
            <>
              <span className="px-1.5 min-w-[18px] text-center bg-red-500 text-white text-[9px] font-black rounded-full">{pendingRequestsCount}</span>
              <span className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
            </>
          )}
        </button>

        <button
          onClick={() => { setActiveSubTab("cinema"); setErrorText(""); setSuccessText(""); loadCinemaWindowRoom().catch((err) => setErrorText(err.message)); loadCinemaCodes(); }}
          className={`px-4 py-2 text-xs font-black rounded-xl kurdish-text flex items-center gap-2 transition duration-200 ${
            activeSubTab === "cinema"
              ? "bg-amber-500 text-black shadow-lg"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          بەڕێوبەرایەتی Cinema Window
        </button>

        <button
          onClick={() => { setActiveSubTab("vip"); setErrorText(""); setSuccessText(""); }}
          className={`px-4 py-2 text-xs font-black rounded-xl kurdish-text flex items-center gap-2 transition duration-200 ${
            activeSubTab === "vip"
              ? "bg-purple-600 text-white shadow-lg"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Crown className="w-3.5 h-3.5" />
          هۆڵی شاهانەی VIP
        </button>

        <button
          onClick={() => { setActiveSubTab("archive"); setErrorText(""); setSuccessText(""); }}
          className={`px-4 py-2 text-xs font-black rounded-xl kurdish-text flex items-center gap-2 transition duration-200 ${
            activeSubTab === "archive"
              ? "bg-cyan-600 text-white shadow-lg"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          ئەرشیفی بەکارهێنان ({tickets.length + cinemaCodes.length})
        </button>
      </div>

      {/* Success/Error Dialog */}
      <AnimatePresence>
        {successText && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-xs kurdish-text font-bold rounded-xl flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            {successText}
          </motion.div>
        )}
        {errorText && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs kurdish-text font-bold rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorText}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">

        {/* ============================================================= */}
        {/* TAB 1 — SHARED PAYMENT & CONTACT SETTINGS (both rooms)         */}
        {/* ============================================================= */}
        {activeSubTab === "payment" && (
          <motion.div key="payment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

            {/* Unified payment & contact form */}
            <div className="max-w-3xl bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-purple-400" />
                  ڕێکخستنی پارەدان و زانیاری پەیوەندی (هاوبەش بۆ هەردوو ژوور)
                </h3>
                <p className="text-xs text-gray-400 kurdish-text">
                  ئەم پانێلە هاوبەشە بۆ هەردوو ژووری VIP (هۆڵی شاهانە + Cinema Window). هەموو گۆڕانکارییەک خۆکارانە بۆ هەردووکیان دەنێردرێت.
                </p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-5">
                <FileUploaderInput
                  label="کۆدی QR بۆ پارەدان (Bank QR Code)"
                  value={formQr}
                  onChange={setFormQr}
                  description="کۆدی QR فاستپەی یان ڕەسمی ژمارەکەت لێرە باربکە یان بنووسە."
                  placeholder="https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png"
                  adminName={adminName}
                  onError={(err) => setErrorText(err)}
                />

                <FileUploaderInput
                  label="لۆگۆی بانک یان ئایکۆنی ڕێگای پارەدان (Bank / Payment Logo)"
                  value={formLogo}
                  onChange={setFormLogo}
                  description="ئایکۆنی یان لۆگۆی تایبەت بە جۆری بانکەکە یان فاستپەی باربکە بۆ پیشاندان لە دەستپێکی پەڕەی کڕیاردا."
                  placeholder="https://i.ibb.co/..."
                  adminName={adminName}
                  onError={(err) => setErrorText(err)}
                />

                <div className="space-y-1.5">
                  <label className="text-xs text-gray-300 kurdish-text font-bold">زانیاری حسابەکان و سپاردە (Deposit info / Bank accounts)</label>
                  <textarea
                    value={formDetails}
                    rows={3}
                    onChange={(e) => setFormDetails(e.target.value)}
                    placeholder="فاستپەی: 07501234567&#10;فایبەر کورتکراو: FIB-000302&#10;حسابی بانکی: ..."
                    className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white kurdish-text outline-none resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-gray-300 kurdish-text font-bold">سەرپەرشتیار و ڕێنمایی نووسراو (Custom Client Instructions)</label>
                  <textarea
                    value={formInst}
                    rows={4}
                    onChange={(e) => setFormInst(e.target.value)}
                    placeholder="ڕێنمایی بۆ کڕیار لێرە پۆست بکە..."
                    className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white kurdish-text outline-none resize-none"
                  />
                </div>

                {/* Shared contact channels */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-black/30 border border-white/5">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 kurdish-text font-bold flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      ژمارەی مۆبایلی پشتگیریکردن (Support Mobile)
                    </label>
                    <input
                      type="tel"
                      value={formSupportPhone}
                      onChange={(e) => setFormSupportPhone(e.target.value)}
                      placeholder="0750XXXXXXX"
                      className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-emerald-500/40 rounded-xl text-xs text-white font-mono outline-none text-left"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 kurdish-text font-bold flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-green-400" />
                      ژمارەی واتسئاپ (WhatsApp Contact)
                    </label>
                    <input
                      type="tel"
                      value={formWhatsapp}
                      onChange={(e) => setFormWhatsapp(e.target.value)}
                      placeholder="964750XXXXXXX"
                      className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-green-500/40 rounded-xl text-xs text-white font-mono outline-none text-left"
                      dir="ltr"
                    />
                    <p className="text-[10px] text-gray-500 kurdish-text">بە کۆدی وڵات بنووسرێت بۆ بەستەری ڕاستەوخۆی wa.me</p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="py-3 px-6 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-purple-600/15"
                >
                  <Check className="w-4 h-4" />
                  پاشەکەوتکردن بۆ هەردوو ژوور
                </button>
              </form>
            </div>

            {/* Pending receipt requests queue */}
            <div className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-500 animate-pulse" />
                  داواکارییە چاوەڕوانکراکانی پسوڵە (Pending Receipt Queue)
                </h3>
                <p className="text-xs text-gray-400 kurdish-text">پێداچوونەوە بکە بە ناردراوەکان، تەماشای پسوڵەی گواستنەوەی فاستپەی/زین کاش بکە، و بە کلیلێک کۆدی VIP بێ هاوتا ساز بکە.</p>
              </div>

              {pendingRequestsCount === 0 ? (
                <div className="p-16 text-center border border-white/5 bg-white/5 rounded-2xl text-xs text-gray-400 kurdish-text">
                  ✓ هیج داواکارییەکی پسوڵە پێشکەش نەکراوە یان سەرجەمیان پێداچوونەوەیان بۆ کراوە.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {vipRequests.filter(r => r.status === "Pending").map((req) => (
                    <div key={req.id} className="p-5 rounded-2xl bg-black/40 border border-amber-500/10 hover:border-amber-500/20 transition-all flex flex-col justify-between gap-4">
                      
                      {/* User and timestamp details */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[10px] bg-amber-500/15 text-amber-400 font-extrabold px-2 py-0.5 rounded-lg mb-1.5 inline-block">داواکاری نوێ</span>
                            <h4 className="text-sm font-black text-white kurdish-text">{req.customerName}</h4>
                            <span className="text-xs font-mono text-zinc-300 block" dir="ltr">📞 {req.customerPhone}</span>
                          </div>
                          <span className="text-[9px] text-zinc-500 font-medium">
                            {new Date(req.createdAt).toLocaleString("en-US", { hour12: true })}
                          </span>
                        </div>

                        {/* Expandable Image container to review receipt screenshot */}
                        {req.bankScreenshot && (
                          !(req.bankScreenshot.startsWith("data:") || req.bankScreenshot.startsWith("http")) ? (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-right">
                              <span className="text-[10px] font-bold kurdish-text block text-emerald-500">جۆری تەسدیقکردن:</span>
                              <span className="text-[11px] font-medium font-sans">{req.bankScreenshot}</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="text-[10px] text-gray-400 kurdish-text block font-bold">پسوڵەی سپێردراو (Click to expand):</span>
                              <div 
                                onClick={() => setActiveScreenshot(req.bankScreenshot)}
                                className="h-32 w-full bg-zinc-950 rounded-xl overflow-hidden relative cursor-zoom-in border border-white/5 hover:border-amber-500/30 group transition"
                              >
                                <img 
                                  src={req.bankScreenshot} 
                                  alt="Receipt Screenshot" 
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 text-xs text-white">
                                  <Eye className="w-4 h-4 text-amber-500" />
                                  گه ورەکردنی پسوڵە
                                </div>
                              </div>
                            </div>
                          )
                        )}

                        {/* Admin movie binding select/input option */}
                        <div className="space-y-1.5 text-right bg-white/[0.02] p-3 rounded-xl border border-white/5">
                          <label className="text-[10px] text-gray-300 font-black kurdish-text block">بەستنەوە بە ڤیدیۆ/فیلمی تایبەت (ئارەزوومەند):</label>
                          <select
                            value={requestVideoUrls[req.id] || ""}
                            onChange={(e) => setRequestVideoUrls({ ...requestVideoUrls, [req.id]: e.target.value })}
                            className="w-full px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-lg text-xs text-white outline-none focus:border-purple-500/40"
                          >
                            <option value="">هەموو فیلمەکان (سەرانسەری گشتی)</option>
                            {vipVideos.map(v => (
                              <option key={v.id} value={v.videoUrl}>{v.title}</option>
                            ))}
                          </select>
                          <input 
                            type="text"
                            placeholder="یان لێرە ڕاستەوخۆ بەستەر بنووسە..."
                            value={requestVideoUrls[req.id] || ""}
                            onChange={(e) => setRequestVideoUrls({ ...requestVideoUrls, [req.id]: e.target.value })}
                            className="w-full px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-lg text-xs placeholder:text-gray-600 outline-none focus:border-purple-500/40 font-mono"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {/* Action button triggers */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                        <button
                          onClick={() => handleDeleteRequest(req.id)}
                          className="py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          ڕەتکردنەوە (Decline)
                        </button>

                        <button
                          onClick={() => handleApproveRequest(req.id)}
                          className="py-2.5 bg-amber-500 hover:bg-amber-600 text-black rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          پەسەندکردن و کۆد
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ============================================================= */}
        {/* TAB 2 — CINEMA WINDOW MANAGEMENT                               */}
        {/* ============================================================= */}
        {activeSubTab === "cinema" && (
          <motion.div key="cinema" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                    <Film className="w-5 h-5 text-amber-400" />
                    Cinema Window — بەڕێوبەرایەتی ژوور و لینکی فیلم
                  </h3>
                  <p className="mt-1 text-xs text-gray-400 kurdish-text">
                    Manage the exact Cinema Window room shown in the highlighted yellow slot. This updates only cinema_1.
                  </p>
                </div>
                <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-black">
                  Room ID: {cinemaRoom?.id || "cinema_1"}
                </div>
              </div>

              <form onSubmit={handleSaveCinemaWindow} className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-300 kurdish-text font-bold">Room title</label>
                      <input
                        type="text"
                        value={cinemaName}
                        onChange={(e) => setCinemaName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white kurdish-text outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-300 kurdish-text font-bold">Movie ID / admin reference</label>
                      <input
                        type="text"
                        value={cinemaMovieId}
                        onChange={(e) => setCinemaMovieId(e.target.value)}
                        className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white font-mono outline-none"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 kurdish-text font-bold">Description</label>
                    <textarea
                      value={cinemaDescription}
                      rows={3}
                      onChange={(e) => setCinemaDescription(e.target.value)}
                      className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white kurdish-text outline-none resize-none"
                    />
                  </div>

                  <FileUploaderInput
                    label="Poster / cover image for this Cinema Window"
                    value={cinemaPosterUrl}
                    onChange={setCinemaPosterUrl}
                    description="This poster appears on the public Cinema Window card and payment modal."
                    placeholder="https://domain.com/poster.jpg"
                    adminName={adminName}
                    onError={(err) => setErrorText(err)}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-300 kurdish-text font-bold">Preview / trailer URL</label>
                      <input
                        type="text"
                        value={cinemaPreviewUrl}
                        onChange={(e) => setCinemaPreviewUrl(e.target.value)}
                        placeholder="https://youtube.com/embed/..."
                        className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white font-mono outline-none"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-300 kurdish-text font-bold">Private full movie link</label>
                      <input
                        type="text"
                        value={cinemaFullVideoReference}
                        onChange={(e) => setCinemaFullVideoReference(e.target.value)}
                        placeholder="https://domain.com/full-movie.mp4"
                        className="w-full px-4 py-2.5 bg-black/40 border border-amber-500/20 focus:border-amber-500/60 rounded-xl text-xs text-white font-mono outline-none"
                        dir="ltr"
                      />
                      <p className="text-[10px] text-amber-300/80 kurdish-text">
                        This link is returned only after a valid Cinema Window access code is verified.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-300 kurdish-text font-bold">Price</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={cinemaPrice}
                        onChange={(e) => setCinemaPrice(e.target.value)}
                        className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white font-mono outline-none"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-300 kurdish-text font-bold">Currency</label>
                      <input
                        type="text"
                        value={cinemaCurrency}
                        onChange={(e) => setCinemaCurrency(e.target.value)}
                        className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white font-mono outline-none"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-300 kurdish-text font-bold">Access hours</label>
                      <input
                        type="number"
                        min="1"
                        value={cinemaAccessHours}
                        onChange={(e) => setCinemaAccessHours(e.target.value)}
                        className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white font-mono outline-none"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-300 kurdish-text font-bold">Status</label>
                      <select
                        value={cinemaStatus}
                        onChange={(e) => setCinemaStatus(e.target.value as CinemaWindowAdminRoom["status"])}
                        className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white outline-none"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="DRAFT">DRAFT</option>
                        <option value="DISABLED">DISABLED</option>
                        <option value="EXPIRED">EXPIRED</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/15">
                    <h4 className="text-xs font-black text-amber-300 kurdish-text mb-2">
                      Payment & contact note
                    </h4>
                    <p className="text-[10px] text-zinc-400 kurdish-text leading-relaxed">
                      QR، حسابەکان و ژمارەی پەیوەندی لە تابی «پارەدان و پەیوەندی» بە شێوەی هاوبەش بۆ هەردوو ژوور بەڕێوە دەبرێن.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-black text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15"
                  >
                    <Check className="w-4 h-4" />
                    Save current Cinema Window room
                  </button>
                </div>
              </form>
            </div>

            {/* Duration access-code generator (daily / monthly / annual) */}
            <div className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                  <ClockIcon className="w-5 h-5 text-amber-400" />
                  دروستکردنی کۆدی گەیشتنی Cinema Window (ڕۆژانە / مانگانە / ساڵانە)
                </h3>
                <p className="text-xs text-gray-400 kurdish-text">
                  کۆدێکی تاک-بەکارهێنان دروست دەکات کە تەنها بۆ ژووری Cinema Window کارا دەبێت و لە ڕێگەی هەمان سیستەمی تەسدیقی پارەدراوەکان پشتڕاست دەکرێتەوە.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {CINEMA_DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleGenerateCinemaCode(preset.hours, preset.labelKu)}
                    className="group p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-black/40 to-black/40 border border-amber-500/25 hover:border-amber-400/60 hover:shadow-xl hover:shadow-amber-500/10 transition-all text-right disabled:opacity-50"
                  >
                    <div className="w-10 h-10 mb-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Ticket className="w-5 h-5 text-amber-400" />
                    </div>
                    <span className="block text-sm font-black text-white kurdish-text">کۆدی {preset.labelKu}</span>
                    <span className="block text-[10px] text-amber-300/80 font-bold mt-0.5" dir="ltr">{preset.labelEn} • {preset.hours >= 24 ? `${Math.round(preset.hours / 24)} days` : `${preset.hours}h`}</span>
                  </button>
                ))}
              </div>

              {lastCinemaCode && (
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/25 space-y-2">
                  <span className="text-[10px] font-black text-emerald-400 kurdish-text block">دوا کۆدی دروستکراو:</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="font-mono text-sm text-emerald-300 bg-black/50 border border-emerald-500/25 px-2 py-1 rounded select-all" dir="ltr">{lastCinemaCode.code}</code>
                    <button
                      onClick={() => handleCopy(lastCinemaCode.code)}
                      className="p-1.5 hover:bg-white/10 text-gray-300 hover:text-white rounded-md transition"
                      title="Copy"
                    >
                      {copiedCode === lastCinemaCode.code ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-[10px] text-gray-400 kurdish-text">
                      کۆتایی مۆڵەت: {new Date(lastCinemaCode.expiresAt).toLocaleString("en-GB")} ({Math.round(lastCinemaCode.hours / 24)} ڕۆژ)
                    </span>
                  </div>
                </div>
              )}

              {cinemaCodes.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-white/5" data-tick={nowTick}>
                  <table className="w-full text-right text-xs min-w-[560px]">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 text-[10px] border-b border-white/5">
                        <th className="p-3 kurdish-text">کۆد</th>
                        <th className="p-3 kurdish-text">ماوە</th>
                        <th className="p-3 kurdish-text">دروستکراوە</th>
                        <th className="p-3 kurdish-text">کۆتایی مۆڵەت</th>
                        <th className="p-3 kurdish-text">دۆخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {cinemaCodes.slice(0, 8).map((c) => {
                        const left = hoursLeftOn(c.expiresAt);
                        const expired = c.status === "EXPIRED" || (left !== null && left <= 0);
                        return (
                          <tr key={c.id} className="hover:bg-white/5 transition duration-150">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono px-1.5 py-1 rounded text-[11px] select-all border ${
                                  expired ? "bg-red-500/5 border-red-500/20 text-red-400 line-through" : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                                }`} dir="ltr">{c.id}</span>
                                <button
                                  onClick={() => handleCopy(c.id)}
                                  className="p-1 hover:bg-white/10 text-gray-400 hover:text-white rounded-md transition"
                                >
                                  {copiedCode === c.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-gray-300 font-mono" dir="ltr">
                              {c.durationHours ? `${Math.round(c.durationHours / 24)}d` : "—"}
                              <span className="text-[9px] text-gray-500 kurdish-text mr-1">{c.source === "admin" ? "(ئیداری)" : "(پارەدراو)"}</span>
                            </td>
                            <td className="p-3 text-gray-400 text-[10px]" title={c.createdAt}>
                              {c.createdAt ? new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="p-3 text-gray-400 text-[10px]" title={c.expiresAt}>
                              {c.expiresAt ? new Date(c.expiresAt).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold kurdish-text ${
                                c.status === "USED"
                                  ? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25"
                                  : expired
                                    ? "bg-red-500/10 text-red-500 border border-red-500/25"
                                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                              }`}>
                                {c.status === "USED" ? "بەکارهێنراو" : expired ? "بەسەرچووە" : "چالاک"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {cinemaCodes.length > 8 && (
                    <p className="p-2 text-[10px] text-gray-500 kurdish-text text-center">
                      ٨ کۆدی دواتر پیشان دراون — کۆی گشتی: {cinemaCodes.length} (هەموو وردەکاری لە تابی ئەرشیف)
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ============================================================= */}
        {/* TAB 3 — VIP LOUNGE MANAGEMENT                                  */}
        {/* ============================================================= */}
        {activeSubTab === "vip" && (
          <motion.div key="vip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Manual golden-ticket generator */}
            <div className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-4 self-start">
              <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-400" />
                دروستکردنی بلیتی VIP نوێ (میتۆدی دەستی)
              </h3>
              
              <form onSubmit={handleGenerateTicket} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 kurdish-text font-semibold">ناوی کڕیار (Customer Name)</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="نموونە: ئارام عومەر"
                    className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white kurdish-text outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 kurdish-text font-semibold">ژمارەی تەلەفۆن (Phone Number)</label>
                  <input
                    type="text"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="نموونە: 0750XXXXXXX"
                    className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white kurdish-text outline-none font-mono text-left"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-300 kurdish-text font-bold">هەڵبژاردنی ڤیدیۆی VIP (Select VIP Video)</label>
                  <select
                    value={selectedVipVideoId}
                    onChange={(e) => setSelectedVipVideoId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white outline-none"
                  >
                    <option value="">هەڵبژاردن بۆ ڤیدیۆی VIP (ئارەزوومەند)</option>
                    {vipVideos.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-300 kurdish-text font-bold">بەرنامە یان بەستەری ڤیدیۆی VIP (Alternative URL/Source)</label>
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="نموونە: https://domain/movie.mp4 یان بەستەری یوتیوب"
                    className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white outline-none font-mono text-left focus:ring-1 focus:ring-purple-500"
                    dir="ltr"
                  />
                </div>

                {/* Validity / expiration controls */}
                <div className="space-y-2.5 p-3.5 rounded-2xl bg-black/30 border border-white/5">
                  <label className="text-[10px] text-gray-200 kurdish-text font-black flex items-center gap-1.5">
                    <ClockIcon className="w-3.5 h-3.5 text-purple-400" />
                    ماوەی دروستی کۆد (Validity & Expiration)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-gray-500 kurdish-text">ڕۆژی دروستی (Days)</label>
                      <input
                        type="number"
                        min="0"
                        disabled={noExpiry}
                        value={validityDays}
                        onChange={(e) => setValidityDays(e.target.value)}
                        placeholder="نموونە: 30"
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/5 focus:border-purple-500/30 disabled:opacity-40 rounded-lg text-xs text-white font-mono outline-none text-left"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-gray-500 kurdish-text">کاتژمێری دروستی (Hours)</label>
                      <input
                        type="number"
                        min="0"
                        disabled={noExpiry}
                        value={validityHours}
                        onChange={(e) => setValidityHours(e.target.value)}
                        placeholder="نموونە: 72"
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/5 focus:border-purple-500/30 disabled:opacity-40 rounded-lg text-xs text-white font-mono outline-none text-left"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-gray-500 kurdish-text">بەرواری کۆتایی دیاریکراو (Exact expiry date)</label>
                    <input
                      type="date"
                      disabled={noExpiry}
                      value={validityDate}
                      onChange={(e) => setValidityDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-black/40 border border-white/5 focus:border-purple-500/30 disabled:opacity-40 rounded-lg text-xs text-white outline-none text-left [color-scheme:dark]"
                      dir="ltr"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
                    <input
                      type="checkbox"
                      checked={noExpiry}
                      onChange={(e) => setNoExpiry(e.target.checked)}
                      className="w-3.5 h-3.5 accent-purple-600"
                    />
                    <span className="text-[10px] text-gray-400 kurdish-text font-bold">کۆدی بێ کۆتایی (No expiration)</span>
                  </label>
                  {previewExpiresAt ? (
                    <p className="text-[10px] text-emerald-400 kurdish-text font-bold flex items-center gap-1.5" title={previewExpiresAt}>
                      <Check className="w-3 h-3 shrink-0" />
                      کۆتایی مۆڵەت: {new Date(previewExpiresAt).toLocaleString("en-GB")}
                      <span className="text-gray-500">(نزیکترین)</span>
                    </p>
                  ) : (
                    <p className="text-[10px] text-amber-400 kurdish-text font-bold">
                      ئاگاداری: ئەم کۆدە بێ کۆتایی دەبێت.
                    </p>
                  )}
                </div>

                <div className="p-3 bg-purple-500/5 rounded-2xl border border-purple-500/10 text-[10px] text-purple-400 kurdish-text leading-relaxed">
                  سیستەمی بەرهەمهێنان خۆکارانە کۆدێکی یونیک و درێژ بە نهێنی دادەمەزرێنێت و ڕێگەی دەدات تەنها ٢ ئامێر یان IP بەکاریبهێنن پاشان خۆی قوفڵ سەرانسەری دەبێت.
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-purple-600/10"
                >
                  <Plus className="w-4 h-4" />
                  بەرهەمهێنانی بلیتی VIP
                </button>
              </form>
            </div>

            {/* Video library + glass preview settings */}
            <div className="space-y-6">
              <div className="max-w-3xl bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-6">
                <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-purple-400" />
                  بەڕێوبەرایەتی ڤیدیۆکانی هۆڵی شاهانە
                </h3>
                
                <div className="bg-black/40 border border-white/5 rounded-xl p-4">
                  <div className="space-y-4">
                    <input 
                      type="text" 
                      placeholder="ناوی ڤیدیۆ" 
                      className="w-full px-4 py-2 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white"
                      value={customerName /* reusing temp state for simplicity */}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                    <input 
                      type="text" 
                      placeholder="بەستەری ڤیدیۆ (URL)" 
                      className="w-full px-4 py-2 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                    />
                    <input 
                      type="text" 
                      placeholder="بەستەری ترەیلەر (Trailer URL - ئارەزوومەند)" 
                      className="w-full px-4 py-2 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white"
                      value={trailerUrl}
                      onChange={(e) => setTrailerUrl(e.target.value)}
                    />
                    <button 
                      onClick={async () => {
                         if (!customerName.trim() || !videoUrl.trim()) {
                           setErrorText("⚠️ ناو و بەستەری ڤیدیۆکە پێویستن!");
                           return;
                         }
                         await addDoc(collection(db, "vip_videos"), {
                           title: customerName.trim(),
                           videoUrl: videoUrl.trim(),
                           trailerUrl: trailerUrl.trim(),
                           sortOrder: vipVideos.length,
                           createdAt: new Date().toISOString()
                         });
                         setCustomerName(""); setVideoUrl(""); setTrailerUrl("");
                         setSuccessText("✓ ڤیدیۆی VIP بە سەرکەوتوویی زیادکرا.");
                      }}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-black"
                    >
                      زیادکردنی ڤیدیۆ
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {vipVideos.map(v => (
                    <div key={v.id} className="flex justify-between items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                      <div className="min-w-0">
                        <span className="text-xs text-white block truncate">{v.title}</span>
                        {v.trailerUrl && (
                          <span className="text-[9px] text-amber-400 font-black block mt-0.5">🎬 ترەیلەر دیاریکراوە</span>
                        )}
                      </div>
                      <button 
                      onClick={async () => {
                         await deleteDoc(doc(db, "vip_videos", v.id));
                         setSuccessText("✓ ڤیدیۆی VIP سڕایەوە.");
                      }}
                      className="p-2 bg-red-500/10 text-red-500 rounded-lg text-xs"
                      ><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Silent glass preview trailer (shown outside the VIP room) */}
              <div className="max-w-3xl bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-4">
                <label className="text-xs text-gray-300 kurdish-text font-bold flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  پێشبینینی شوشە — تریلەری بێدەنگ (Glass Preview Trailer)
                </label>
                <p className="text-[10px] text-gray-500 kurdish-text leading-relaxed">
                  ئەم ڤیدیۆیە بێدەنگ لە پشتەوەی دەرگای VIP بۆ سەردانیکەران پیشان دەدرا وەک نیشاندانی جوانی ژوورەکە. بەستەری یوتیوب یان ڤیدیۆی .mp4 دابنێ.
                </p>
                <input
                  type="text"
                  value={formGlassUrl}
                  onChange={(e) => setFormGlassUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... یان https://domain/trailer.mp4"
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-cyan-500/40 rounded-xl text-xs text-white outline-none font-mono text-left focus:ring-1 focus:ring-cyan-500/50"
                  dir="ltr"
                />
                {formGlassUrl.trim() && (
                  <div className="aspect-video max-w-xs rounded-xl overflow-hidden border border-white/10 bg-black relative pointer-events-none" aria-hidden="true">
                    {(() => {
                      const yt = formGlassUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
                      if (yt) {
                        return (
                          <iframe
                            src={`https://www.youtube.com/embed/${yt[1]}?mute=1&autoplay=0&loop=1&playlist=${yt[1]}&controls=0`}
                            className="absolute inset-0 w-full h-full opacity-60 blur-[1px]"
                            allow="encrypted-media"
                            title="preview"
                          />
                        );
                      }
                      return (
                        <video
                          src={formGlassUrl.trim()}
                          muted
                          loop
                          autoPlay
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover opacity-60 blur-[1px]"
                        />
                      );
                    })()}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <span className="absolute bottom-2 right-2 text-[9px] text-cyan-300 kurdish-text font-bold">پێشبینین — وەک بۆ کڕیار دەردەکەوێت</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formGlassEnabled}
                      onChange={(e) => setFormGlassEnabled(e.target.checked)}
                      className="w-4 h-4 accent-cyan-500"
                    />
                    <span className="text-[11px] text-gray-300 kurdish-text font-bold">پیشاندانی چالاک بێت (Enabled for users)</span>
                  </label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleSaveGlass}
                    className="sm:mr-auto py-2.5 px-5 bg-cyan-600 hover:bg-cyan-700 text-white font-black text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    پاشەکەوتی پێشبینین
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ============================================================= */}
        {/* TAB 4 — TICKETS & USAGE ARCHIVE (both rooms)                   */}
        {/* ============================================================= */}
        {activeSubTab === "archive" && (
          <motion.div key="archive" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  ئەرشیفی وردی بەکارهێنانی هەردوو ژوور (Tickets & Usage Archive)
                </h3>
                <p className="text-xs text-gray-400 kurdish-text">کۆدی VIP Lounge + کۆدەکانی Cinema Window: ناوی بەکارهێنەر، ژمارەی بەکارهێنان، جۆری ئامێر، کاتی ماوە، و دۆخی زیندوو.</p>
              </div>

              <div className="relative w-full sm:w-56 col">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بگەڕێ لە نێوان کۆدەکان یان ناوەکان..."
                  className="w-full pr-9 pl-3 py-1.5 bg-black/45 border border-white/5  focus:border-cyan-500/40 rounded-xl text-xs text-white kurdish-text outline-none"
                />
              </div>
            </div>

            {/* Quick stats across BOTH rooms */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-purple-500/5 border border-purple-500/15 text-center">
                <span className="block text-lg font-black text-purple-300 tabular-nums">{tickets.length}</span>
                <span className="text-[10px] text-gray-400 kurdish-text">بلیتی VIP Lounge</span>
              </div>
              <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/15 text-center">
                <span className="block text-lg font-black text-amber-300 tabular-nums">{cinemaCodes.length}</span>
                <span className="text-[10px] text-gray-400 kurdish-text">کۆدی Cinema Window ({activeCinemaCount} چالاک)</span>
              </div>
              <div className="p-3 rounded-2xl bg-green-500/5 border border-green-500/15 text-center">
                <span className="block text-lg font-black text-green-400 tabular-nums">{liveTicketCount}</span>
                <span className="text-[10px] text-gray-400 kurdish-text">دانیشتی زیندوو ئێستا</span>
              </div>
              <div className="p-3 rounded-2xl bg-red-500/5 border border-red-500/15 text-center">
                <span className="block text-lg font-black text-red-400 tabular-nums">{expiredTicketCount}</span>
                <span className="text-[10px] text-gray-400 kurdish-text">بەسەرچووە (هەردوو ژوور)</span>
              </div>
            </div>

            {filteredTickets.length === 0 && cinemaCodes.filter(c =>
              c.id.toLowerCase().includes(searchQuery.toLowerCase())
            ).length === 0 ? (
              <div className="p-12 text-center border border-white/5 bg-white/5 rounded-2xl text-xs text-gray-400 kurdish-text">
                هیچ بلیتێک سازنەکراوە لەم بەشەدا بۆ ئەم تەوەری خەسڵەتە.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/5" data-tick={nowTick}>
                <table className="w-full text-right text-xs min-w-[960px]">
                  <thead>
                    <tr className="bg-white/5 text-gray-400 text-[10px] border-b border-white/5">
                      <th className="p-3 kurdish-text">ژوور</th>
                      <th className="p-3 kurdish-text">کۆدی تیکێت</th>
                      <th className="p-3 kurdish-text">بەکارهێنەر (Username)</th>
                      <th className="p-3 kurdish-text">بەکارهێنان</th>
                      <th className="p-3 kurdish-text">جۆری ئامێر (Device)</th>
                      <th className="p-3 kurdish-text">کاتی ماوە (Hours Left)</th>
                      <th className="p-3 kurdish-text">دۆخی دانیشتن (Live)</th>
                      <th className="p-3 kurdish-text">بلیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredTickets.map((ticket) => {
                      // Expiry math runs every render; nowTick keeps the
                      // countdown chips fresh without a manual refresh.
                      const left = hoursLeftOn(ticket.expiresAt);
                      const expired = left !== null && left <= 0;
                      const live = isSessionLive(ticket);
                      return (
                        <tr key={ticket.code} className="hover:bg-white/5 transition duration-150">
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/25 text-[9px] font-black kurdish-text whitespace-nowrap">
                              👑 هۆڵی شاهانە
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono px-1.5 py-1 rounded text-[11px] select-all border ${
                                expired
                                  ? "bg-red-500/5 border-red-500/20 text-red-400 line-through"
                                  : "bg-purple-500/10 border-purple-500/20 text-purple-400"
                              }`}>
                                {ticket.code}
                              </span>
                              <button
                                onClick={() => handleCopy(ticket.code)}
                                className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded-md transition"
                              >
                                {copiedCode === ticket.code ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="p-3">
                            <h4 className="font-bold text-white kurdish-text">{ticket.customerName}</h4>
                            <p className="text-[10px] text-gray-400 font-mono mb-1" dir="ltr">{ticket.customerPhone}</p>
                            {ticket.videoUrl ? (
                              <div className="text-[9px] text-[#dda8ff] font-semibold flex items-center gap-1 max-w-[180px]" title={ticket.videoUrl}>
                                <span className="text-gray-500 font-bold shrink-0">لینکی ڤیدیۆ:</span>
                                <span className="underline font-mono select-all truncate">{ticket.videoUrl}</span>
                              </div>
                            ) : (
                              <span className="text-[9px] text-zinc-600 italic">سەرچاوەی ڤیدیۆ دیاری نەکراوە</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="font-sans font-black text-gray-300">{ticket.usedCount} / 2</span>
                          </td>
                          <td className="p-3">
                            {(ticket.lastDevice || ticket.activeDevice) ? (
                              <div className="space-y-0.5 max-w-[170px]">
                                <span className="block text-[11px] font-bold text-[#00e1ff] kurdish-text" dir="ltr">
                                  {describeDevice(ticket.activeDevice || ticket.lastDevice)}
                                </span>
                                <span className="block text-[9px] text-gray-500 font-mono truncate" dir="ltr" title={(ticket.activeDevice || ticket.lastDevice)}>
                                  {(ticket.activeDevice || ticket.lastDevice).substring(0, 40)}…
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-500 text-[10px] kurdish-text">چالاک نەکراوە</span>
                            )}
                          </td>
                          <td className="p-3">
                            {left === null ? (
                              <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-300 border border-slate-400/20 text-[10px] font-black kurdish-text">
                                ∞ بێ کۆتایی
                              </span>
                            ) : expired ? (
                              <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/25 text-[10px] font-black kurdish-text">
                                ٠ — بەسەرچووە
                              </span>
                            ) : left >= 24 ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-black tabular-nums" title={ticket.expiresAt}>
                                {Math.floor(left / 24)}ڕۆژ {Math.floor(left % 24)}کاتژ
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[10px] font-black tabular-nums animate-pulse" title={ticket.expiresAt}>
                                {Math.floor(left)}کاتژ {Math.floor((left % 1) * 60)}خ
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="space-y-0.5">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                live
                                  ? "bg-green-500/15 text-green-400 border-green-500/30"
                                  : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-green-400 animate-pulse" : "bg-zinc-500"}`} />
                                {live ? "زیندوو ئێستا" : "ئۆفلاین"}
                              </span>
                              {ticket.lastActiveAt && (
                                <span className="block text-[9px] text-gray-500 kurdish-text">
                                  دواین چالاکی: {new Date(ticket.lastActiveAt).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              expired || ticket.status === "Expired"
                                ? "bg-red-500/10 text-red-500 border border-red-500/25"
                                : ticket.status === "used"
                                  ? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                            } kurdish-text`}>
                              {expired || ticket.status === "Expired" ? "بەسەرچوو" : ticket.status === "used" ? "قوفڵکراو" : "چالاکە"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {cinemaCodes
                      .filter(c =>
                        c.id.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((c) => {
                        const left = hoursLeftOn(c.expiresAt);
                        const expired = c.status === "EXPIRED" || (left !== null && left <= 0);
                        return (
                          <tr key={c.id} className="hover:bg-white/5 transition duration-150">
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/25 text-[9px] font-black kurdish-text whitespace-nowrap">
                                🎬 Cinema Window
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono px-1.5 py-1 rounded text-[11px] select-all border ${
                                  expired
                                    ? "bg-red-500/5 border-red-500/20 text-red-400 line-through"
                                    : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                                }`} dir="ltr">{c.id}</span>
                                <button
                                  onClick={() => handleCopy(c.id)}
                                  className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded-md transition"
                                >
                                  {copiedCode === c.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                            <td className="p-3">
                              <h4 className="font-bold text-white kurdish-text">
                                {c.source === "admin" ? "کۆدی ئیداری (بێ پسوڵە)" : "کڕیاری پارەدراو"}
                              </h4>
                              <p className="text-[10px] text-gray-500 font-mono" dir="ltr">{c.createdBy || "system"}</p>
                            </td>
                            <td className="p-3">
                              <span className="font-sans font-black text-gray-300">{c.usedAt ? "1 / 1" : "0 / 1"}</span>
                            </td>
                            <td className="p-3">
                              <span className="text-gray-500 text-[10px] kurdish-text">تاک-بەکارهێنان</span>
                            </td>
                            <td className="p-3">
                              {left === null ? (
                                <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-300 border border-slate-400/20 text-[10px] font-black kurdish-text">—</span>
                              ) : expired ? (
                                <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/25 text-[10px] font-black kurdish-text">
                                  ٠ — بەسەرچووە
                                </span>
                              ) : left >= 24 ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-black tabular-nums" title={c.expiresAt}>
                                  {Math.floor(left / 24)}ڕۆژ {Math.floor(left % 24)}کاتژ
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[10px] font-black tabular-nums animate-pulse" title={c.expiresAt}>
                                  {Math.floor(left)}کاتژ {Math.floor((left % 1) * 60)}خ
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                                ئۆفلاین
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                                expired
                                  ? "bg-red-500/10 text-red-500 border border-red-500/25"
                                  : c.status === "USED"
                                    ? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25"
                                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                              } kurdish-text`}>
                                {expired ? "بەسەرچوو" : c.status === "USED" ? "بەکارهێنراو" : "چالاکە"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screenshot Lightbox Overlay Modal */}
      <AnimatePresence>
        {activeScreenshot && (
          <div className="fixed inset-0 bg-black/95 z-[999] flex flex-col items-center justify-center p-4">
            <button 
              onClick={() => setActiveScreenshot(null)}
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="max-w-3xl max-h-[80vh] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-1">
              <img 
                src={activeScreenshot} 
                alt="Expanded Receipt Screenshot" 
                className="w-full h-auto max-h-[75vh] object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="text-xs text-zinc-400 mt-4 font-mono">Receipt Verification Lightbox</span>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
