import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  X,
  Check,
  Lock,
  Unlock,
  CreditCard,
  QrCode,
  HelpCircle,
  AlertTriangle,
  Clock,
  Copy,
  Mail,
  Phone,
  Eye,
  EyeOff,
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
  updateDoc,
  serverTimestamp
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

export const CinemaWindowModal: React.FC<CinemaWindowModalProps> = ({ isOpen, onClose, onJoinCinemaWindow }) => {
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

  // Handle payment submission
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
            setVerifyError('کێشەیەک لە کۆڕەوەی پەیاکردنەوە هەیە!');
          }
        } else {
          // For real payment providers, show pending state
          setPaymentPending(false);
          setShowAccessCodeForm(true);
        }
      } else {
        setVerifyError(paymentData.error || 'ناوەڕۆکی payment');
      }
    } catch (err) {
      setVerifyError('ناوەڕۆکی لە نێوەوەیە');
    } finally {
      setPaymentPending(false);
    }
  };

  // Handle access code verification
  const handleVerifyCode = async () => {
    if (!accessCode.trim()) {
      setVerifyError('کۆدی پێشوەرەوە بنووسە!');
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
        setVerifyError(data.message || 'کۆدی ئەنجامی نییە!');

        if (data.message && data.message.includes('باتلە')) {
          setCodeExpired(true);
        }
        if (data.message && data.message_used) {
          setCodeUsed(true);
        }
      }
    } catch (err) {
      setCodeVerificationStatus('error');
      setVerifyError('ناوەڕۆکی لە چۆنەیەوەی کۆدی proof!');
    }
  };

  // Handle manual access code entry
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
        setVerifyError(data.message || 'کۆدی ئەنجامی نییە!');
        if (data.message && data.message.includes('باتلە')) {
          setCodeExpired(true);
        }
        if (data.message && data.message_used) {
          setCodeUsed(true);
        }
      }
    } catch (err) {
      setCodeVerificationStatus('error');
      setVerifyError('ناوەڕۆکی لە چۆنەیەوەی کۆدی proof!');
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

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[900] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-[#090a0d] border border-white/15 rounded-2xl overflow-hidden shadow-2xl p-8 md:p-10 animate-fade-in"
          dir="rtl"
        >
          <div className="flex items-center justify-center h-12 w-12 border-2 border-white/20 rounded-full animate-spin">
            <X className="w-5 h-5 text-white" />
          </div>
        </motion.div>
      </div>
    );
  }

  // If no room data yet, show placeholder
  if (!room) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[900] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-[#090a0d] border border-white/15 rounded-2xl overflow-hidden shadow-2xl p-8 md:p-10 animate-fade-in"
          dir="rtl"
        >
          <div className="flex flex-col items-center justify-center py-12">
            <X className="w-8 h-8 text-white/60 mb-4" />
            <h3 className="text-xl font-bold text-white kurdish-text mb-2">کەنفەرەی کەفەلەت</h3>
            <p className="text-zinc-400 text-base kurdish-text">ڕۆڕەکەی ئەوەکەت دەوڵەوە بە شێوەی هەمانەوە. تکایە بۆەوە ئەڕا بکە.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Render the Cinema Window modal
  return (
    <AnimatePresence>
      <div id="cinema-window-container" className="fixed inset-0 bg-black/92 backdrop-blur-xl z-[900] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-[390px] bg-[#090a0d] border border-white/15 rounded-2xl overflow-hidden shadow-2xl shadow-white/5 p-4 rtl:translateX-full rtl:translateX-0 transition-all"
          dir="rtl"
        >
          {/* Top closing button */}
          <button
            onClick={onClose}
            id="btn-close-cinema-window"
            className="absolute top-6 left-6 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-3 pt-1">
            <h2 className="text-lg font-black text-white kurdish-text mb-1">{room.name}</h2>
            <p className="text-zinc-500 text-[11px] kurdish-text leading-relaxed line-clamp-2">{room.description}</p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black text-amber-300">
              <Clock className="w-3.5 h-3.5" />
              {room.accessDurationHours} hour access
            </div>
          </div>

          {/* Access Card - Locked or Unlocked */}
          {isRoomLocked() ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <h3 className="text-semibold text-white kurdish-text mb-4">لەکەری کەفەلەت</h3>

              <p className="text-zinc-500 text-[11px] kurdish-text mb-3 leading-relaxed line-clamp-2">
                بەرە permanenceە بەرەوەشە لە نێوانەوەکە بەسەرەوە، کەفەڵەتیکەت بەسەرەوە دەربەبێت.
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-white/60 text-xs kurdish-text">پەیوەندی</p>
                  <p className="text-xl font-bold text-white kurdish-text">{formatPrice()}</p>
                </div>

                {(room.paymentSettings?.qrCodeUrl || room.paymentSettings?.paymentDetails || room.paymentSettings?.instructions) && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-right">
                    <div className="flex items-start gap-3">
                      {room.paymentSettings?.qrCodeUrl && (
                        <img
                          src={room.paymentSettings.qrCodeUrl}
                          alt="Payment QR"
                          className="w-14 h-14 rounded-lg object-contain bg-white p-1 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        {room.paymentSettings?.paymentLogoUrl && (
                          <img
                            src={room.paymentSettings.paymentLogoUrl}
                            alt="Payment provider"
                            className="h-6 max-w-24 object-contain mb-1"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        {room.paymentSettings?.paymentDetails && (
                          <p className="max-h-16 overflow-y-auto whitespace-pre-line text-[10px] text-white kurdish-text leading-relaxed">
                            {room.paymentSettings.paymentDetails}
                          </p>
                        )}
                        {room.paymentSettings?.instructions && (
                          <p className="mt-1 max-h-12 overflow-y-auto whitespace-pre-line text-[10px] text-amber-200/80 kurdish-text leading-relaxed">
                            {room.paymentSettings.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {!isProductionBuild && (
                    <label className="flex items-center justify-center gap-2 rounded-lg bg-black/25 border border-white/5 px-2 py-1.5">
                      <input
                        type="radio"
                        name="payment-method"
                        value="mock"
                        checked={paymentMethod === 'mock'}
                        onChange={handlePaymentMethodChange}
                        className="w-4 h-4 rounded border-amber-500 cursor-pointer"
                      />
                      <span className="text-white cursor-pointer">مەبەستەکانەوە (Demo)</span>
                    </label>
                  )}
                  <label className="flex items-center justify-center gap-2 rounded-lg bg-black/25 border border-white/5 px-2 py-1.5">
                    <input
                      type="radio"
                      name="payment-method"
                      value="asiapay"
                      checked={paymentMethod === 'asiapay'}
                      onChange={handlePaymentMethodChange}
                      className="w-4 h-4 rounded border-green-500 cursor-pointer"
                    />
                    <span className="text-white cursor-pointer">AsiaPay</span>
                  </label>
                  <label className="flex items-center justify-center gap-2 rounded-lg bg-black/25 border border-white/5 px-2 py-1.5">
                    <input
                      type="radio"
                      name="payment-method"
                      value="fastpay"
                      checked={paymentMethod === 'fastpay'}
                      onChange={handlePaymentMethodChange}
                      className="w-4 h-4 rounded border-purple-500 cursor-pointer"
                    />
                    <span className="text-white cursor-pointer">FastPay</span>
                  </label>
                  <label className="flex items-center justify-center gap-2 rounded-lg bg-black/25 border border-white/5 px-2 py-1.5">
                    <input
                      type="radio"
                      name="payment-method"
                      value="card"
                      checked={paymentMethod === 'card'}
                      onChange={handlePaymentMethodChange}
                      className="w-4 h-4 rounded border-blue-500 cursor-pointer"
                    />
                    <span className="text-white cursor-pointer">Bank/Card</span>
                  </label>
                </div>

                <button
                  onClick={handlePaymentSubmit}
                  disabled={paymentPending}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-black rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  {paymentPending ? 'لەڕۆکی ناردنی پەیاکردن...' : 'پەیوەندی بە پەیوەندی بەرەوە'}
                  <CreditCard className="w-3.5 h-3.5 shrink-0" />
                </button>

                <div className="text-[10px] text-zinc-500 kurdish-text leading-relaxed">
                  {paymentMethod === 'mock' && (
                    <span>مەبەستەکانەوە: لە نێوەوە هەیە - کاتێکدا ڕەقە ڕوویدا کۆدەکەت بە سەرکەوتووە</span>
                  )}
                  {paymentMethod === 'asiapay' && (
                    <span>ژمارەی AsiaPay پێشەوەوە بۆ تەواوە.</span>
                  )}
                  {paymentMethod === 'fastpay' && (
                    <span>ژمارەی FastPay پێشەوەوە بۆ تەواوە.</span>
                  )}
                  {paymentMethod === 'card' && (
                    <span>ژمارەی کەرێжі فەرمییەکان.</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* UNLOCKED STATE */
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h3 className="text-semibold text-amber-400 kurdish-text mb-4">ڕاستەوخوەیەوە</h3>
              <p className="text-zinc-400 text-base kurdish-text mb-4">
                کۆدەکەت چوونەژوورەوە و ڕاستەوخوە بۆ ئەو کەفەلەتە.
              </p>

              <div className="space-y-4">
                <div className="bg-white/20 rounded-xl p-4 mb-4">
                  <p className="text-white/60 text-sm kurdish-text">کۆدەکەت:</p>
                  <p className="text-2xl font-mono text-amber-400 break-all select-all">{accessCode}</p>
                  <button
                    onClick={() => {
                      // Copy to clipboard
                      navigator.clipboard.writeText(accessCode).then(() => {
                        // Show success briefly
                      });
                    }}
                    className="text-amber-300 text-sm hover:underline kurdish-text mt-2">
                    کۆپی
                  </button>
                </div>

                <button
                  onClick={handleVerifyCode}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-black rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  دەستپێکردنی ڕاستەوخوە
                </button>

                {showAccessCodeForm ? (
                  <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl mb-4">
                    <p className="text-zinc-300 text-sm kurdish-text">ھەیە کۆدی ئەنجامانەوە؟</p>
                    <input
                      type="text"
                      value={enterCode}
                      onChange={(e) => setEnterCode(e.target.value)}
                      placeholder="کۆدی بەرەوە بۆ چوونەژوورەوە"
                      className="w-full py-2 bg-black/50 border border-white/10 rounded-md text-white margin-bottom-2 outline-none focus:border-amber-500/30"
                      dir="ltr"
                    />
                    <button
                      onClick={handleEnterCode}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-black font-black rounded-xl transition duration-150 cursor-pointer disabled:opacity-50"
                      disabled={codeVerificationStatus === 'loading'}
                    >
                      {codeVerificationStatus === 'loading' ? 'لەڕۆکی چوونەژوورەوە...' : 'چوونەژوورەوە'}
                    </button>
                  </div>
                ) : (
                  <p className="text-zinc-400 text-sm kurdish-text">
                    پێش پەیوەندی بەرەوە، تکایە کۆدی بەرەوە بە شێوەی هەمانەوە بنووسە.
                  </p>
                )}

                {codeGenerated && !codeUsed && !codeExpired && (
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl mb-4">
                    <p className="text-green-300 text-sm kurdish-text">پەیوەندیەکە چوونەژوورەوە!</p>
                    <p className="text-white font-mono text-sm">کۆدەکەت: {accessCode}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(accessCode)}
                      className="text-green-300 text-sm hover:underline kurdish-text mt-2">
                      کۆپی بە clipboard
                    </button>
                  </div>
                )}

                {codeExpired && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
                    <p className="text-red-300 text-sm kurdish-text">ئەم کۆدە بەسەرچووە</p>
                  </div>
                )}

                {codeUsed && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
                    <p className="text-red-300 text-sm kurdish-text">ئەم کۆدە لە کێشەیەکی دیکە سەرکەوتووە</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Related Movies / Other Rooms */}
          <div className="hidden">
            <h3 className="text-sm font-bold text-white/60 kurdish-text mb-4">پەیوەندیەکانی تر</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Placeholder for related rooms */}
              <div
                key="1"
                className="bg-white/5 rounded-xl p-3 h-64 flex items-center justify-center"
              >
                <p className="text-zinc-400 text-sm kurdish-text">ڕۆڕە دیکە</p>
              </div>
              <div
                key="2"
                className="bg-white/5 rounded-xl p-3 h-64 flex items-center justify-center"
              >
                <p className="text-zinc-400 text-sm kurdish-text">ڕۆڕە دیکە</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
