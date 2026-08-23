import React, { useState, useEffect } from "react";
import {
  Play,
  X,
  Check,
  Clock,
  CreditCard,
  AlertTriangle,
  Ticket,
  KeyRound,
  Copy
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  db,
  collection,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc
} from "../../lib/firebase";

interface CinemaWindowRoom {
  id: string;
  type: string;
  name: string;
  description: string;
  movieId: string;
  previewUrl: string;
  posterUrl: string;
  fullVideoReference?: string;
  paymentSettings?: {
    qrCodeUrl?: string;
    paymentLogoUrl?: string;
    paymentDetails?: string;
    instructions?: string;
  };
  price: number;
  currency: string;
  accessDurationHours: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface CinemaWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinCinemaWindow: (room: CinemaWindowRoom) => void;
}

const isProductionBuild = import.meta.env.PROD;
const defaultPaymentMethod = isProductionBuild ? "asiapay" : "mock";

// ---------------------------------------------------------------------------
// Unified ticket/access modal — mirrors VIPRoomModal's approved design 1:1:
// same shell card, same two-tab switcher ("enter code" vs "purchase"),
// identical input/button/banner classes, and the same golden-pass unlocked
// phase. Only the underlying flows differ (server payment APIs here vs.
// Firestore vip_tickets there).
// ---------------------------------------------------------------------------
export const CinemaWindowModal: React.FC<CinemaWindowModalProps> = ({ isOpen, onClose, onJoinCinemaWindow }) => {
  // Navigation: "code" | "purchase" — same tab pattern as the VIP room modal
  const [activeTab, setActiveTab] = useState<"code" | "purchase">("code");

  // State
  const [room, setRoom] = useState<CinemaWindowRoom | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [codeGenerated, setCodeGenerated] = useState(false);
  const [codeExpired, setCodeExpired] = useState(false);
  const [codeUsed, setCodeUsed] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mock" | "asiapay" | "fastpay" | "card">(defaultPaymentMethod);
  const [showAccessCodeForm, setShowAccessCodeForm] = useState(false);
  const [enterCode, setEnterCode] = useState("");
  const [codeVerificationStatus, setCodeVerificationStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [roomData, setRoomData] = useState<any>(null);
  const [currentTimeRef, setCurrentTimeRef] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);

  // Handle payment method change
  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPaymentMethod((e.target as HTMLInputElement).value as any);
  };

  // Load room data on mount if isOpen
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(!room);
  }, [isOpen, room]);

  // Load the current room configured from Admin module 14.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const fallbackRoom: CinemaWindowRoom = {
      id: 'cinema_1',
      type: 'CINEMA_WINDOW',
      name: 'Cinema Window',
      description: 'Premium VIP cinema preview with paid full-room access.',
      movieId: 'movie_1',
      previewUrl: 'https://www.youtube.com/embed/KINewMkvDZM?autoplay=1&mute=1&loop=1&playlist=KINewMkvDZM',
      posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=900',
      price: 1.99,
      currency: 'USD',
      accessDurationHours: 24,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setIsLoading(true);
    fetch('/api/cinema-window/current')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setRoom((data?.room || fallbackRoom) as CinemaWindowRoom);
      })
      .catch(() => {
        if (!cancelled) setRoom(fallbackRoom);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Initialize with a sample room for demonstration - in production this would come from Firestore
  useEffect(() => {
    if (isOpen && !room && roomData?.useLocalSample) {
      // Sample Cinema Window room - in production this would be fetched from Firestore
      const sampleRoom: CinemaWindowRoom = {
        id: 'cinema_1',
        type: 'CINEMA_WINDOW',
        name: 'ژەرەی کەفەلەتی',
        description: 'فیلمی کوێری لە چەویی کەفەلەت',
        movieId: 'movie_1',
        previewUrl: 'https://www.youtube.com/embed/KINewMkvDZM?autoplay=1&muted=1&loop=1',
        posterUrl: 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=Poster',
        price: 1.99,
        currency: 'USD',
        accessDurationHours: 24,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setRoom(sampleRoom);
      setIsLoading(false);
    }
  }, [isOpen, room]);

  // Copy helper with brief visual feedback
  const copyAccessCode = () => {
    navigator.clipboard.writeText(accessCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  // Handle payment submission
  const handlePaymentSubmit = async (e?: React.MouseEvent | React.FormEvent) => {
    if (e && "preventDefault" in e) e.preventDefault();
    setPaymentPending(true);
    setVerifyError("");

    if (!room) return;

    try {
      // Create payment record via server API
      const paymentResponse = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room.id,
          userId: '',
          amount: room.price,
          currency: room.currency,
          provider: paymentMethod
        })
      });

      const paymentData = await paymentResponse.json();

      if (paymentData.success) {
        // Payment confirmed immediately (mock mode) or we wait for webhook
        // For mock, generate access code immediately
        if (paymentMethod === 'mock') {
          // The payment was already confirmed by the server
          // Generate access code
          const codeResponse = await fetch('/api/payments/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId: paymentData.payment.id })
          });

          const codeData = await codeResponse.json();

          if (codeData.success) {
            setAccessCode(codeData.accessCode || '');
            setCodeGenerated(true);
            setShowCode(true);
          } else {
            setVerifyError('کێشەیەک ڕوویدا لە دروستکردنی کۆد! تکایە دووبارە هەوڵبدە.');
          }
        } else {
          // For real payment providers, show pending state
          setPaymentPending(false);
          setShowAccessCodeForm(true);
        }
      } else {
        setVerifyError(paymentData.error || 'کێشە لە تۆمارکردنی پارەدان ڕوویدا!');
      }
    } catch (err) {
      setVerifyError('کێشەیەک لە پەیوەندیدا ڕوویدا! تکایە دووبارە هەوڵبدە.');
    } finally {
      setPaymentPending(false);
    }
  };

  // Handle access code verification (generated-code path)
  const handleVerifyCode = async () => {
    if (!accessCode.trim()) {
      setVerifyError('تکایە کۆدی بلیتەکە بنووسە!');
      return;
    }

    setCodeVerificationStatus('loading');
    setVerifyError("");

    try {
      const response = await fetch('/api/cinema/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room?.id,
          accessCode: accessCode.trim()
        })
      });

      const data = await response.json();

      if (data.success) {
        // Access granted - join the room
        setCodeVerificationStatus('success');
        setTimeout(() => {
          onJoinCinemaWindow((data.room || room) as CinemaWindowRoom);
          onClose();
        }, 1500);
      } else {
        // Handle specific error messages
        setCodeVerificationStatus('error');
        setVerifyError(data.message || 'کۆدەکە هەڵەیە یان بەسەرچووە!');

        if (data.message && data.message.includes('باتلە')) {
          setCodeExpired(true);
        }
        if (data.message_used) {
          setCodeUsed(true);
        }
      }
    } catch (err) {
      setCodeVerificationStatus('error');
      setVerifyError('کێشەیەک لە پەیوەندی سێرڤەر هەیە!');
    }
  };

  // Handle manual access code entry (user-typed code path)
  const handleEnterCode = async () => {
    if (!enterCode.trim()) return;

    setCodeVerificationStatus('loading');
    setVerifyError("");

    try {
      const response = await fetch('/api/cinema/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room?.id,
          accessCode: enterCode.trim()
        })
      });

      const data = await response.json();

      if (data.success) {
        setCodeVerificationStatus('success');
        setTimeout(() => {
          onJoinCinemaWindow((data.room || room) as CinemaWindowRoom);
          onClose();
        }, 1500);
      } else {
        setCodeVerificationStatus('error');
        setVerifyError(data.message || 'کۆدەکە هەڵەیە یان بەسەرچووە!');
        if (data.message && data.message.includes('باتلە')) {
          setCodeExpired(true);
        }
        if (data.message_used) {
          setCodeUsed(true);
        }
      }
    } catch (err) {
      setCodeVerificationStatus('error');
      setVerifyError('کێشەیەک لە پەیوەندی سێرڤەر هەیە!');
    }
  };

  // Close code display
  const handleCloseCode = () => {
    setShowCode(false);
    setAccessCode('');
    setCodeGenerated(false);
    setCodeExpired(false);
    setCodeUsed(false);
  };

  // Close access code form
  const handleCloseAccessCodeForm = () => {
    setShowAccessCodeForm(false);
    setEnterCode('');
    setCodeVerificationStatus('idle');
  };

  // Format price display
  const formatPrice = (): string => {
    return `${room?.price ?? 0} ${room?.currency ?? 'USD'}`;
  };

  // Check if room is locked (no access code or not verified)
  const isRoomLocked = (): boolean => {
    return !roomData?.isUnlocked && !codeGenerated && !!room;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div id="cinema-window-container" className="fixed inset-0 bg-black/92 backdrop-blur-xl z-[900] flex items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-xl bg-[#090a0d] border border-amber-500/15 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-amber-500/5 p-6 md:p-8"
          dir="rtl"
        >
          {/* Top closing cross */}
          <button
            onClick={onClose}
            id="btn-close-cinema-window"
            className="absolute top-6 left-6 z-20 p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Loading phase */}
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
              <p className="text-xs text-gray-400 kurdish-text">خەریکی هێنانەوەی زانیاری ژوورەکە...</p>
            </div>
          ) : !room ? (
            /* Missing-room phase */
            <div className="text-center space-y-3 py-16">
              <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400 border border-amber-500/20 mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-white kurdish-text">ژوور بەردەست نییە</h3>
              <p className="text-xs text-gray-400 kurdish-text max-w-sm mx-auto">
                زانیاری ژوورەکە نەدۆزرایەوە. تکایە دواتر هەوڵبدە یان مۆداڵ دابخە و دووبارە بیکەرەوە.
              </p>
            </div>
          ) : !isRoomLocked() ? (
            /* PHASE 2: UNLOCKED GOLDEN PASS — mirrors the VIP golden ticket */
            <div className="relative z-10 space-y-6">
              <div className="text-center space-y-1 mt-1">
                <span className="text-[9px] bg-gradient-to-r from-amber-500 to-yellow-500 text-black px-3 py-1 rounded-full font-black uppercase tracking-wider shadow-lg">Premium Cinema Pass</span>
                <h3 className="text-2xl font-black text-amber-400 kurdish-text mt-2.5">بلیتەکەت چالاککرا</h3>
                <p className="text-xs text-gray-400 font-mono">{formatPrice()} • {room.accessDurationHours} کاتژمێر</p>
              </div>

              <div className="p-5 rounded-3xl bg-gradient-to-b from-[#111216] to-[#08090b] border border-amber-500/20 space-y-5 relative shadow-inner overflow-hidden">
                <div className="absolute right-0 top-0 w-24 h-24 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

                {/* Access code display */}
                <div className="bg-black/60 border border-white/5 rounded-2xl p-4 text-center space-y-2 relative z-10">
                  <span className="text-[10px] text-gray-400 kurdish-text block font-bold">کۆدی دەستڕاگەیشتن</span>
                  <span className="block text-xl font-mono text-amber-400 break-all select-all px-2">
                    {accessCode || "—"}
                  </span>
                  <button
                    onClick={copyAccessCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-gray-300 hover:text-white transition cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copiedCode ? "کۆپی کرا ✓" : "کۆپیکردنی کۆد"}
                  </button>
                </div>

                {/* Status banners */}
                {codeGenerated && !codeUsed && !codeExpired && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold kurdish-text flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    پارەدان سەرکەوتوو بوو — بلیتەکەت ئامادەیە!
                  </div>
                )}
                {codeExpired && (
                  <div className="p-3 bg-red-500/10 border border-red-500/15 rounded-xl text-red-400 text-xs font-bold kurdish-text flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    ئەم کۆدە بەسەرچووە!
                  </div>
                )}
                {codeUsed && (
                  <div className="p-3 bg-red-500/10 border border-red-500/15 rounded-xl text-red-400 text-xs font-bold kurdish-text flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    ئەم کۆدە پێشتر بەکار هێنراوە!
                  </div>
                )}

                {/* Manual entry after a real-provider payment */}
                {showAccessCodeForm ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleEnterCode(); }}
                    className="space-y-2.5 p-4 rounded-2xl bg-black/30 border border-white/5 relative z-10"
                  >
                    <label className="text-[10px] text-gray-300 kurdish-text font-bold block text-right">
                      کۆدت پێدراوە؟ لێرە بنووسە
                    </label>
                    <input
                      type="text"
                      value={enterCode}
                      onChange={(e) => setEnterCode(e.target.value)}
                      placeholder="کۆدی بلیت بپشکنە..."
                      className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white outline-none font-mono text-left focus:ring-1 focus:ring-amber-500/30"
                      dir="ltr"
                      disabled={codeVerificationStatus === "loading"}
                    />
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-black font-extrabold text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={codeVerificationStatus === "loading"}
                    >
                      {codeVerificationStatus === "loading" ? "خەریکی لێکدانەوەی کۆد..." : "لێکدانەوەی کۆد"}
                    </button>
                  </form>
                ) : null}

                {room.paymentSettings?.instructions && (
                  <div className="space-y-1 relative z-10">
                    <span className="text-[10px] text-gray-400 kurdish-text block font-bold">ڕێنمایی بەکارهێنان</span>
                    <p className="text-[10px] text-gray-300 kurdish-text leading-relaxed whitespace-pre-line">
                      {room.paymentSettings.instructions}
                    </p>
                  </div>
                )}
              </div>

              {/* Start viewing — identical styling to the VIP start button */}
              <button
                onClick={handleVerifyCode}
                disabled={codeVerificationStatus === "loading"}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-[0.98] text-black font-black text-xs rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <Play className="w-4 h-4 shrink-0" />
                {codeVerificationStatus === "loading" ? "خەریکی کردنەوەی ژوور..." : "دەستپێکردنی سەیرکردن"}
              </button>

              <button
                onClick={() => {
                  handleCloseCode();
                  handleCloseAccessCodeForm();
                  setActiveTab("code");
                }}
                className="w-full py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-black rounded-xl transition duration-150 border border-red-500/10 hover:border-red-500/25 mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                🚫 سڕینەوەی کۆد و گەڕانەوە (Reset Session)
              </button>
            </div>
          ) : (
            /* PHASE 1: LOCKED — unified tabs (enter code / purchase) */
            <div className="relative z-10 space-y-6">
              {/* Header */}
              <div className="text-center space-y-1 mt-1">
                <span className="text-[9px] bg-gradient-to-r from-amber-500 to-yellow-500 text-black px-3 py-1 rounded-full font-black uppercase tracking-wider shadow-lg">Cinema Window</span>
                <h3 className="text-lg font-black text-white kurdish-text">{room.name}</h3>
                <p className="text-xs text-gray-400 kurdish-text line-clamp-2 max-w-sm mx-auto">{room.description}</p>
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black text-amber-300">
                  <Clock className="w-3.5 h-3.5" />
                  {room.accessDurationHours} کاتژمێر • {formatPrice()}
                </div>
              </div>

              {/* Tabs header — identical structure to VIPRoomModal */}
              <div className="flex gap-2 p-1 bg-[#121318]/90 border border-white/5 rounded-2xl mx-auto max-w-[340px] shadow-inner">
                <button
                  onClick={() => { setActiveTab("code"); setVerifyError(""); }}
                  className={`flex-1 py-2 text-[11px] font-black rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-center gap-1.5 ${
                    activeTab === "code"
                      ? "bg-amber-500 text-black shadow-lg font-extrabold"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Ticket className="w-3.5 h-3.5" />
                  چوونەژوورە بە کۆد
                </button>
                <button
                  onClick={() => { setActiveTab("purchase"); setVerifyError(""); }}
                  className={`flex-1 py-2 text-[11px] font-black rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-center gap-1.5 ${
                    activeTab === "purchase"
                      ? "bg-amber-500 text-black shadow-lg font-extrabold"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  کڕینی بلیت
                </button>
              </div>

              {/* Warnings / Error messaging panel */}
              {verifyError && (
                <div className="p-4 bg-red-500/10 border border-red-500/15 rounded-2xl text-red-400 text-xs font-bold kurdish-text flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                  {verifyError}
                </div>
              )}

              {/* TAB 1: ENTER ACCESS CODE — mirrors the VIP verify tab */}
              {activeTab === "code" && (
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400 border border-amber-500/20 mx-auto">
                      <KeyRound className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-black text-white kurdish-text">چوونەژوورەوەی ژووری سینەما</h3>
                    <p className="text-xs text-gray-400 kurdish-text max-w-sm mx-auto">
                      ئەگەر کۆدی دەستڕاگەیشتنیت هەیە، تکایە لێرە بنووسە بۆ کردنەوەی ژوورەکە.
                    </p>
                  </div>

                  <form onSubmit={(e) => { e.preventDefault(); handleEnterCode(); }} className="space-y-4">
                    <input
                      type="text"
                      id="input-cinema-code"
                      value={enterCode}
                      onChange={(e) => setEnterCode(e.target.value)}
                      placeholder="کۆدی بلیت بپشکنە..."
                      className="w-full px-5 py-3.5 bg-black/45 border border-white/10 rounded-2xl text-xs text-white placeholder:text-gray-600 outline-none focus:border-amber-500/30 font-mono text-center tracking-widest ring-1 ring-white/5 focus:ring-amber-500/30"
                      disabled={codeVerificationStatus === "loading"}
                    />

                    <button
                      type="submit"
                      id="btn-verify-cinema-code"
                      disabled={codeVerificationStatus === "loading"}
                      className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-black font-extrabold text-xs rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {codeVerificationStatus === "loading" ? "خەریکی لێکدانەوەی بلیت..." : "لێکدانەوەی بلیت و دەستپێک"}
                    </button>
                  </form>

                  <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 space-y-1">
                    <h4 className="text-[11px] font-bold text-gray-300 kurdish-text">کۆدم نییە؟</h4>
                    <p className="text-[10px] text-gray-500 kurdish-text leading-relaxed">
                      بگەڕێ وەر بۆ تبابی "کڕینی بلیت" و پسوڵەی پارەدان تەواو بکە؛ کۆدەکەت خۆکارانە دروست دەکرێت.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: PURCHASE TICKET — mirrors the VIP request tab layout */}
              {activeTab === "purchase" && (
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-black text-white kurdish-text">کڕینی بلیتی ژووری سینەما</h3>
                    <p className="text-xs text-gray-400 kurdish-text">بڕی پارە بنێرە یان ڕێگای پارەدان هەڵبژێرە؛ پاش تەواوبوون، کۆدی دەستڕاگەیشتن وەردەگریت.</p>
                  </div>

                  {/* Bank detail frame — identical to the VIP payment frame */}
                  {(room.paymentSettings?.qrCodeUrl || room.paymentSettings?.paymentDetails || room.paymentSettings?.instructions) && (
                    <div className="p-4 rounded-2xl bg-gradient-to-l from-amber-500/5 to-transparent border border-amber-500/15 flex flex-col sm:flex-row items-center gap-4">
                      {room.paymentSettings?.qrCodeUrl && (
                        <div className="w-20 h-20 bg-white p-1 rounded-xl shrink-0 shadow">
                          <img
                            src={room.paymentSettings.qrCodeUrl}
                            alt="Pay QR"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      <div className="text-right space-y-1 flex-1 min-w-0">
                        {room.paymentSettings?.paymentLogoUrl && (
                          <img
                            src={room.paymentSettings.paymentLogoUrl}
                            alt="Bank Logo"
                            className="h-6 max-w-24 object-contain mb-1"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <span className="text-[10px] text-amber-400 font-extrabold kurdish-text flex items-center gap-1">
                          <CreditCard className="w-3.5 h-3.5" />
                          حسابە فەرمییەکانی مألوف بۆ کڕینی بلیت:
                        </span>
                        {room.paymentSettings?.paymentDetails && (
                          <p className="text-[10px] text-gray-300 whitespace-pre-line leading-relaxed max-h-16 overflow-y-auto">
                            {room.paymentSettings.paymentDetails}
                          </p>
                        )}
                        {room.paymentSettings?.instructions && (
                          <p className="text-[10px] text-amber-200/80 whitespace-pre-line leading-relaxed max-h-12 overflow-y-auto">
                            {room.paymentSettings.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Price row */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] text-gray-400 kurdish-text font-bold">نرخی بلیت</span>
                    <span className="text-lg font-black text-amber-400 font-mono">{formatPrice()}</span>
                  </div>

                  {/* Payment method segmented selector */}
                  <div className={`grid gap-2 ${isProductionBuild ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
                    {[
                      ...(isProductionBuild ? [] : [{ value: "mock", label: "تاقیکردنەوە" }]),
                      { value: "asiapay", label: "AsiaPay" },
                      { value: "fastpay", label: "FastPay" },
                      { value: "card", label: "بانک/کارت" },
                    ].map((m) => (
                      <label
                        key={m.value}
                        className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 border cursor-pointer transition-all duration-200 ${
                          paymentMethod === m.value
                            ? "border-amber-500/50 bg-amber-500/10 text-white"
                            : "border-white/5 bg-black/40 text-gray-400 hover:border-white/15 hover:text-gray-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment-method"
                          value={m.value}
                          checked={paymentMethod === m.value}
                          onChange={handlePaymentMethodChange}
                          className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                        />
                        <span className="text-[10px] font-black cursor-pointer kurdish-text">{m.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Provider hint line */}
                  <p className="text-[10px] text-zinc-500 kurdish-text leading-relaxed px-1">
                    {paymentMethod === "mock" && "دۆخی تاقیکردنەوە: کۆدی دەستڕاگەیشتن دەستبەجێ دروست دەکرێت."}
                    {paymentMethod === "asiapay" && "پاش تەواوبوونی پارەدان لە AsiaPay، کۆدەکەت لێرە بەکاربهێنە."}
                    {paymentMethod === "fastpay" && "پاش تەواوبوونی پارەدان لە FastPay، کۆدەکەت لێرە بەکاربهێنە."}
                    {paymentMethod === "card" && "پاش تەواوبوونی پارەدان بە کارت یان حسابی بانکی، کۆدەکەت لێرە بەکاربهێنە."}
                  </p>

                  <button
                    onClick={() => handlePaymentSubmit()}
                    disabled={paymentPending}
                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-[0.98] text-black font-black text-xs rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    {paymentPending ? "خەریکی تۆمارکردنی پارەدان..." : "پارەدان و بەدەستهێنانی کۆد"}
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
