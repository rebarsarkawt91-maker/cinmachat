import React, { useState, useEffect } from "react";
import { 
  Ticket, 
  X, 
  Check, 
  Smartphone, 
  CreditCard, 
  QrCode, 
  HelpCircle, 
  Activity, 
  AlertTriangle,
  Upload,
  Clock,
  ArrowRight,
  Download,
  Sparkles,
  RefreshCw,
  ThumbsUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface VIPRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinVIP: (vipRoomData: any) => void;
}

// Sleek deterministic barcode rendering component
const BarcodeSVG: React.FC<{ value: string }> = ({ value }) => {
  const safeValue = value || "";
  const hash = Array.from(safeValue).reduce<number>((acc: number, char: string) => acc + char.charCodeAt(0), 0);
  const bars: React.ReactNode[] = [];
  let currentX = 10;
  
  for (let i = 0; i < 35; i++) {
    const isBar = (hash + i * 7) % 3 !== 0; 
    const width = ((hash + i * 3) % 2 === 0) ? 2 : 1; 
    if (isBar) {
      bars.push(
        <rect 
          key={i} 
          x={currentX} 
          y={5} 
          width={width} 
          height={40} 
          fill="black" 
        />
      );
    }
    currentX += width + 1.5;
  }
  
  return (
    <div className="bg-white p-2 rounded-xl border border-amber-500/10 flex flex-col items-center justify-center max-w-[190px] mx-auto shadow-md">
      <svg width={currentX + 15} height={56} className="overflow-visible">
        {bars}
        <text x="50%" y="52" fontSize="8" fill="black" textAnchor="middle" fontFamily="monospace" letterSpacing="2">
          *{safeValue.toUpperCase().substring(0, 10)}*
        </text>
      </svg>
    </div>
  );
};

export const VIPRoomModal: React.FC<VIPRoomModalProps> = ({ isOpen, onClose, onJoinVIP }) => {
  // Navigation: "verify" | "request" | "requested"
  const [activeTab, setActiveTab] = useState<"verify" | "request" | "requested">("verify");
  
  // Verification states
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [verifiedTicket, setVerifiedTicket] = useState<any>(() => {
    try {
      const saved = localStorage.getItem("vipRoom_verifiedTicket");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [vipSettings, setVipSettings] = useState<any>(null);
  const [vipVideos, setVipVideos] = useState<any[]>([]);

  // Request VIP Access form states
  const [vName, setVName] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestSaved, setRequestSaved] = useState<any>(null);

  // Status check state for previous users' requests stored in LocalStorage
  const [trackedRequestId, setTrackedRequestId] = useState<string | null>(null);
  const [trackedRequestStatus, setTrackedRequestStatus] = useState<any>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Load VIP Configuration and track previous requests on mount
  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      const savedReqId = localStorage.getItem("vipRoom_myPendingRequest");
      if (savedReqId) {
        setTrackedRequestId(savedReqId);
        checkTrackedRequestStatus(savedReqId);
      }
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      // Re-verify existing localStorage ticket if present
      const savedTicketStr = localStorage.getItem("vipRoom_verifiedTicket");
      if (savedTicketStr) {
        try {
          const parsed = JSON.parse(savedTicketStr);
          if (parsed && parsed.code) {
            const valRes = await fetch("/api/vip/check-validity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: parsed.code })
            });
            if (valRes.ok) {
              const valData = await valRes.json();
              if (valData.success) {
                setVerifiedTicket(valData.ticket);
                try {
                  localStorage.setItem("vipRoom_verifiedTicket", JSON.stringify(valData.ticket));
                } catch (err) {
                  console.warn(err);
                }
              } else {
                setVerifiedTicket(null);
                try {
                  localStorage.removeItem("vipRoom_verifiedTicket");
                } catch (err) {
                  console.warn(err);
                }
                setErrorMsg("⚠️ بلیتەکەت بەسەرچووە یان لەلایەن بەڕێوبەرەوە ڕاگیراوە!");
              }
            }
          }
        } catch (e) {
          console.warn("Could not check ticket validity", e);
        }
      }

      const res = await fetch("/api/admin/vip/settings");
      if (res.ok) {
        const sData = await res.json();
        setVipSettings(sData);
      }
      const resVids = await fetch("/api/admin/vip/videos");
      if (resVids.ok) {
        const vData = await resVids.json();
        if (Array.isArray(vData)) {
          setVipVideos(vData);
        }
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  const checkTrackedRequestStatus = async (reqId: string) => {
    setIsCheckingStatus(true);
    try {
      const res = await fetch("/api/admin/vip/requests");
      if (res.ok) {
        const requestsList = await res.json();
        const found = requestsList.find((r: any) => r.id === reqId);
        if (found) {
          setTrackedRequestStatus(found);
          // If approved, automatically fill code & highlight to make user flow effortless
          if (found.status === "Approved" && found.approvedCode) {
            setCode(found.approvedCode);
          }
        }
      }
    } catch (err) {
      console.error("Error checking request status:", err);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    if (!code.trim()) {
      setErrorMsg("⚠️ تکایە کۆدی بلیتەکە بنووسە!");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/vip/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setVerifiedTicket(data.ticket);
        setVipSettings(data.settings);
        try {
          localStorage.setItem("vipRoom_verifiedTicket", JSON.stringify(data.ticket));
        } catch (e) {
          console.warn("Storage warning in setting vipRoom_verifiedTicket:", e);
        }
      } else {
        setErrorMsg(data.message || "کۆدەکە هەڵەیە یان بەسەرچووە!");
      }
    } catch (err) {
      setErrorMsg("کێشەیەک لە پەیوەندی سێرڤەر هەیە!");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    if (!vName.trim() || !vPhone.trim()) {
      setErrorMsg("⚠️ تکایە ناوی تەواو و مۆبایل پێشکەش بکە!");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/vip/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: vName.trim(),
          customerPhone: vPhone.trim(),
          bankScreenshot: "ڕەوانەکرا بۆ وەتسئاپ / Manual WhatsApp Flow"
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRequestSaved(data.request);
        localStorage.setItem("vipRoom_myPendingRequest", data.request.id);
        setTrackedRequestId(data.request.id);
        setTrackedRequestStatus(data.request);
        setActiveTab("requested");
        setVName("");
        setVPhone("");
      } else {
        setErrorMsg(data.error || "هەڵەیەک ڕوویدا لە تۆمارکردنی داواکاری!");
      }
    } catch (err) {
      setErrorMsg("کێشەیەک هەیە لە پەیوەندیکردن بە ویندۆی فایەربەیس.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTicketAsImage = (ticket: any) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 620;
      canvas.height = 350;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Premium visual design gradients
      const grad = ctx.createLinearGradient(0, 0, 620, 350);
      grad.addColorStop(0, "#191a22");
      grad.addColorStop(0.5, "#0d0f13");
      grad.addColorStop(1, "#1c1d27");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 620, 350);

      // Gold styling borders
      ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
      ctx.lineWidth = 4;
      ctx.strokeRect(15, 15, 590, 320);

      ctx.strokeStyle = "rgba(245, 158, 11, 0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(22, 22, 576, 306);

      // Ticket Circular Cuts
      ctx.fillStyle = "#0c0d10";
      ctx.beginPath();
      ctx.arc(15, 175, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(605, 175, 18, 0, Math.PI * 2);
      ctx.fill();

      // Outer rings around notches
      ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(15, 175, 18, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(605, 175, 18, Math.PI / 2, -Math.PI / 2);
      ctx.stroke();

      // Decorative stars
      ctx.fillStyle = "#f59e0b";
      ctx.font = "12px system-ui";
      ctx.fillText("✦", 40, 48);
      ctx.fillText("✦", 355, 48);

      // Bold Kurdish/English Titles
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.fillText("CHATCINEMA VIP EXCLUSIVE TICKET", 60, 50);

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "bold 9px monospace";
      ctx.fillText("AUTOMATED VERIFIED LOUNGE PASS", 60, 68);

      // Fields Grid (Left-aligned/Middle aligned)
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("HOLDER NAME  |  ناوی کڕیار", 45, 115);
      
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.fillText(ticket.customerName, 45, 136);

      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("PHONE NUMBER  |  مۆبایل", 45, 185);
      
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px monospace";
      ctx.fillText(ticket.customerPhone, 45, 204);

      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("DEVICE LIMITATION  |  دەسەڵات", 45, 255);
      
      ctx.fillStyle = "#10b981"; // Emerald green
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText("2 DEVICES MAX (٢ ئامێر هاوکات)", 45, 275);

      // Desaturated dashed separator line
      ctx.strokeStyle = "rgba(245, 158, 11, 0.25)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(390, 35);
      ctx.lineTo(390, 315);
      ctx.stroke();
      ctx.setLineDash([]); // clear dash

      // Right Panel elements
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.font = "bold 9px monospace";
      ctx.fillText("TICKET UNIQUE ID", 410, 70);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 13px monospace";
      ctx.fillText(ticket.code.substring(0, 16), 410, 92);

      // White solid barcode backing
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(410, 130, 180, 75);

      // Procedural barcode rendering
      const val = ticket.code;
      const hashVal = Array.from(val).reduce<number>((acc: number, c: string) => acc + c.charCodeAt(0), 0);
      let currX = 418;
      ctx.fillStyle = "#000000";
      for (let i = 0; i < 35; i++) {
        const isBar = (hashVal + i * 7) % 3 !== 0;
        const width = ((hashVal + i * 3) % 2 === 0) ? 2 : 1;
        if (isBar) {
          ctx.fillRect(currX, 138, width, 45);
        }
        currX += width + 2.5;
      }
      ctx.fillStyle = "#000000";
      ctx.font = "8px monospace";
      ctx.fillText(`*${ticket.code.substring(0, 12).toUpperCase()}*`, 415, 196);

      // Stamp-like watermarking overlay
      ctx.fillStyle = "rgba(245, 158, 11, 0.04)";
      ctx.font = "bold 55px system-ui, sans-serif";
      ctx.fillText("VIP APPROVED", 70, 190);

      // Download Trigger
      const link = document.createElement("a");
      link.download = `VIP_Ticket_ChatCinema_${ticket.code.substring(0, 8)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Canvas draw failed:", e);
    }
  };

  const handleStartViewing = () => {
    let finalVideoUrl = verifiedTicket?.videoUrl || "";
    if (!finalVideoUrl.trim() && vipVideos && vipVideos.length > 0) {
      finalVideoUrl = vipVideos[vipVideos.length - 1]?.videoUrl || "";
    }
    if (!finalVideoUrl.trim()) {
      finalVideoUrl = "https://www.youtube.com/watch?v=ffW64N3gGv8";
    }

    const officialVipRoom = {
      id: "vip_room_official_premium",
      name: "کۆڕی شاهانەی VIP (Premium Lounge)",
      creatorId: "admin",
      memberIds: ["vip-user"],
      playback: {
        currentTime: 0,
        isPlaying: true,
        updatedAt: new Date().toISOString()
      },
      isVIP: true,
      videoUrl: finalVideoUrl
    };
    onJoinVIP(officialVipRoom);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div id="vip-room-container" className="fixed inset-0 bg-black/92 backdrop-blur-xl z-[900] flex items-center justify-center p-4 overflow-y-auto">
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
            id="btn-close-vip-modal"
            className="absolute top-6 left-6 p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Verification phase / Requested / Form Access Tabs */}
          {!verifiedTicket ? (
            <div className="space-y-6">
              
              {/* Tabs header togglers */}
              <div className="flex gap-2 p-1 bg-[#121318]/90 border border-white/5 rounded-2xl mx-auto max-w-[340px] mt-2 shadow-inner">
                <button
                  onClick={() => { setActiveTab("verify"); setErrorMsg(""); }}
                  className={`flex-1 py-2 text-[11px] font-black rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-center gap-1.5 ${
                    activeTab === "verify" 
                      ? "bg-amber-500 text-black shadow-lg font-extrabold" 
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Ticket className="w-3.5 h-3.5" />
                  چوونەژوورە بە بلیت
                </button>
                <button
                  onClick={() => { setActiveTab("request"); setErrorMsg(""); }}
                  className={`flex-1 py-2 text-[11px] font-black rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-center gap-1.5 ${
                    activeTab === "request" 
                      ? "bg-amber-500 text-black shadow-lg font-extrabold" 
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  داواکاری بلیت نوێ
                </button>
              </div>

              {/* Status Checker Widget for user convenience if they have a saved token */}
              {trackedRequestId && (
                <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-center justify-between gap-3 text-right">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
                    <div>
                      <span className="text-[10px] text-gray-400 block kurdish-text">دواین داواکاری تۆ</span>
                      <span className="text-xs font-semibold text-white font-mono">
                        {trackedRequestStatus ? `ناو: ${trackedRequestStatus.customerName}` : "خەریکی هێنانەوەی زانیاری..."}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {trackedRequestStatus && (
                      <span className={`px-2.5 py-1 text-[9px] font-black rounded-lg ${
                        trackedRequestStatus.status === "Approved" 
                          ? "bg-green-500/20 text-green-400 border border-green-500/20" 
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/20"
                      }`}>
                        {trackedRequestStatus.status === "Approved" ? "پەسەندکرا ✓" : "چاوەڕوانە ⏳"}
                      </span>
                    )}

                    <button
                      onClick={() => checkTrackedRequestStatus(trackedRequestId)}
                      disabled={isCheckingStatus}
                      className="p-1.5 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition"
                      title="نوێکردنەوەی دۆخی داواکاری"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Warnings / Error messaging panel */}
              {errorMsg && (
                <div className="p-4 bg-red-500/10 border border-red-500/15 rounded-2xl text-red-400 text-xs font-bold kurdish-text flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                  {errorMsg}
                </div>
              )}

              {/* TAB 1: CODE VERIFICATION DISPLAY */}
              {activeTab === "verify" && (
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400 border border-amber-500/20 mx-auto">
                      <Ticket className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-black text-white kurdish-text">چوونەژوورەوەی هۆڵی دۆبلاج و بەشی VIP</h3>
                    <p className="text-xs text-gray-400 kurdish-text max-w-sm mx-auto">بۆ بینینی فیلم و دراماکانی خاوەن خێرایی VIP تکایە کۆدی تایبەتت بۆ لێکدانەوە بنووسە.</p>
                  </div>

                  <form onSubmit={handleVerify} className="space-y-4">
                    <input
                      type="text"
                      id="input-vip-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="کۆدی بلیت بپشکنە (نموونە: 4893740283f3e2...)"
                      className="w-full px-5 py-3.5 bg-black/45 border border-white/10 rounded-2xl text-xs text-white placeholder:text-gray-600 outline-none focus:border-amber-500/30 font-mono text-center tracking-widest text-white ring-1 ring-white/5 focus:ring-amber-500/30"
                      disabled={loading}
                    />

                    <button
                      type="submit"
                      id="btn-verify-vip"
                      disabled={loading}
                      className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-black font-extrabold text-xs rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 cursor-pointer"
                    >
                      {loading ? "خەریکی لێکدانەوەی بلیت..." : "لێکدانەوەی بلیت و دەستپێک"}
                    </button>
                  </form>

                  <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 space-y-1">
                    <h4 className="text-[11px] font-bold text-gray-300 kurdish-text">کۆدم نییە؟ چۆن بلیت پەیداکەم؟</h4>
                    <p className="text-[10px] text-gray-500 kurdish-text leading-relaxed">
                      دەتوانیت سوود لە مۆتەکە وەربگریت بۆ ئەوەی لە تبابی "داواکاری بلیت نوێ" داواکاری گواستنەوە پێشکەش بکەیت بۆ ڕاستەوخۆ بەرهەمهێنان.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: REQUEST FORM FOR NEW ACCESS CITIZEN */}
              {activeTab === "request" && (
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-black text-white kurdish-text">پێشکەشکردنی داواکاری چالاککردنی بلیت نوێ</h3>
                    <p className="text-xs text-gray-400 kurdish-text">بۆ گواستنەوەی پارەکە، سەرەتا بڕی تێچوو بۆ ئەم حسابە بنێرە و ڕەسمی پسوڵە باربکە.</p>
                  </div>

                  {/* Bank detail frame */}
                  <div className="p-4 rounded-2xl bg-gradient-to-l from-amber-500/5 to-transparent border border-amber-500/15 flex flex-col sm:flex-row items-center gap-4">
                    {vipSettings?.qrCodeUrl && (
                      <div className="w-20 h-20 bg-white p-1 rounded-xl shrink-0 shadow">
                        <img 
                          src={vipSettings.qrCodeUrl} 
                          alt="Pay QR" 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    {vipSettings?.paymentLogoUrl && (
                      <div className="w-20 h-20 bg-black/40 p-1.5 rounded-xl border border-white/5 shrink-0 flex items-center justify-center">
                        <img 
                          src={vipSettings.paymentLogoUrl} 
                          alt="Bank Logo" 
                          className="max-w-full max-h-full object-contain rounded-lg"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="text-right space-y-1 flex-1">
                      <span className="text-[10px] text-amber-400 font-extrabold kurdish-text flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5" />
                        حسابە فەرمییەکانی مألوف بۆ کڕینی بلیت:
                      </span>
                      <p className="text-[10px] text-gray-300 whitespace-pre-line leading-relaxed">
                        {vipSettings?.paymentDetails || "یاخود FastPay: 0750 123 4567\nحسابی FIB باوەڕپێکراو: Bank No. 100029304"}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleRequestSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5 text-right">
                        <label className="text-[10px] text-gray-400 kurdish-text font-bold">ناوی تۆ (تەواو بە کوردی یان ئینگلیزی)</label>
                        <input
                          type="text"
                          required
                          value={vName}
                          onChange={(e) => setVName(e.target.value)}
                          placeholder="بۆ نموونە: دلاوەر سالار"
                          className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white kurdish-text outline-none"
                        />
                      </div>
                      <div className="space-y-1.5 text-right">
                        <label className="text-[10px] text-gray-400 kurdish-text font-bold">ژمارەی تەلەفۆن بۆ دەستپێکردن</label>
                        <input
                          type="text"
                          required
                          value={vPhone}
                          onChange={(e) => setVPhone(e.target.value)}
                          placeholder="نموونە: 0750XXXXXXX"
                          className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-amber-500/40 rounded-xl text-xs text-white font-mono text-left outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 bg-amber-500/5 p-5 rounded-2xl border border-amber-500/10 text-right">
                      <div className="flex items-start gap-3">
                        <span className="text-xl shrink-0">💬</span>
                        <div className="space-y-1">
                          <h4 className="text-xs font-black text-amber-400 kurdish-text">پەیوەندی ڕاستەوخۆ بە بەڕێوبەرەوە</h4>
                          <p className="text-[11px] text-gray-300 kurdish-text leading-relaxed">
                            پاش دڵنیابوون لە ناردنی بڕی پارەی دیاریکراو، پەیوەندی بکە بە وەتس ئەپی وێبسایتەکەمانەوە تاکو کۆدی چوونەژوورەوەت بۆ بنێرین.
                          </p>
                        </div>
                      </div>

                      <a
                        href={`https://wa.me/${(import.meta.env.VITE_WHATSAPP_NUMBER || "009647701966649").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`سڵاو، داواکاریم هەیە بۆ بلیتی VIP. ناوم: ${vName || ""}، مۆبایل: ${vPhone || ""}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/15 cursor-pointer text-center block"
                      >
                        پەیوەندی بە وەتس ئەپ (Contact WhatsApp) »
                      </a>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 font-black text-xs text-black rounded-xl transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? "خەریکی ناردنی داواکاری..." : "تۆمارکردنی داواکاری بۆ پێداچوونەوە"}
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 3: SUCCESS FEEDBACK ON REQUEST SUBMITTED */}
              {activeTab === "requested" && (
                <div className="space-y-6 text-center py-4">
                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-3xl animate-bounce">
                    ✓
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-black text-white kurdish-text">داواکارییەکەت بە سەرکەوتوویی لە مەنەفێست تۆمارکرا!</h3>
                    <p className="text-xs text-gray-400 kurdish-text leading-relaxed max-w-sm mx-auto">
                      زانیارییەکانت تۆمارکرا بۆ ئەوەی خێرا پەسەند بکرێت، تکایە ڕاستەوخۆ لە ڕێگەی دەگمەی خوارەوە بە وەتسئاپ زانیارییەکانت بۆ ئەدمین بنێرە.
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-900/60 rounded-3xl border border-white/5 space-y-2 max-w-sm mx-auto">
                    <span className="text-[10px] text-gray-500 kurdish-text block font-bold">ناسنامەی پێداچوونەوە (Unique Request Tracker ID)</span>
                    <span className="font-mono text-xs text-amber-400 block break-all select-all font-bold bg-black/60 p-2 rounded-xl">
                      {requestSaved?.id}
                    </span>
                  </div>

                  <div className="max-w-sm mx-auto space-y-3">
                    <a
                      href={`https://wa.me/${(import.meta.env.VITE_WHATSAPP_NUMBER || "009647701966649").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`سڵاو، داواکاریم هەیە بۆ بلیتی VIP.\nناوم: ${requestSaved?.customerName || ""}\nمۆبایل: ${requestSaved?.customerPhone || ""}\nکۆدی داواکاری: ${requestSaved?.id || ""}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer block text-center"
                    >
                      💬 ناردنی زانیارییەکەت بۆ وەتسئاپ
                    </a>

                    <button
                      onClick={() => { setActiveTab("verify"); }}
                      className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 hover:text-white text-xs font-black rounded-xl cursor-pointer transition border border-white/5"
                    >
                      گەڕانەوە بۆ بڵێتن لێکدانەوە
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            /* PHASE 2: AUTOMATED PREMIUM GOLDEN TICKET DISPLAY */
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <span className="text-[9px] bg-gradient-to-r from-amber-500 to-yellow-500 text-black px-3 py-1 rounded-full font-black uppercase tracking-wider shadow-lg">Premium VIP Cinema Pass</span>
                <h3 className="text-2xl font-black text-amber-400 kurdish-text mt-2.5">بلیتی شاهانەی VIP چالاککرا</h3>
                <p className="text-xs text-gray-400 font-mono">ID: {verifiedTicket.code}</p>
              </div>

              {/* Golden layout */}
              <div className="p-5 rounded-3xl bg-gradient-to-b from-[#111216] to-[#08090b] border border-amber-500/20 space-y-5 relative shadow-inner overflow-hidden">
                <div className="absolute right-0 top-0 w-24 h-24 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

                {/* Ticket notch representations visually on client side too */}
                <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-6 h-10 bg-[#090a0d] border-r border-amber-500/20 rounded-r-full" />
                <div className="absolute -right-5 top-1/2 -translate-y-1/2 w-6 h-10 bg-[#090a0d] border-l border-amber-500/20 rounded-l-full" />
                
                {/* Information cards */}
                <div className="grid grid-cols-2 gap-4 text-xs pr-4">
                  <div>
                    <span className="text-[10px] text-gray-400 kurdish-text block">ناوی خاوەن بلیت</span>
                    <span className="font-bold text-white kurdish-text">{verifiedTicket.customerName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 kurdish-text block">ژمارەی پەیوەندی</span>
                    <span className="font-mono text-gray-200">{verifiedTicket.customerPhone}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 kurdish-text block">سوڕی بەکارهێنان</span>
                    <span className="font-extrabold text-amber-400">{verifiedTicket.usedCount} / 2 جار</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 kurdish-text block">دۆخی ئامێرەکان</span>
                    <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      چالاک کراوە
                    </span>
                  </div>
                </div>

                <div className="border-t border-dashed border-white/10 pt-4 space-y-4 pr-4">
                  {/* Dynamic unlocked secret VIP stream source */}
                  {verifiedTicket?.videoUrl && (
                    <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-2xl text-right">
                      <span className="text-[10px] text-amber-400 font-extrabold block">🔓 بەستەری ڕاستەوخۆ دەستکەوت (Private Source Unlocked)</span>
                      <p className="text-[9px] font-mono text-zinc-300 truncate select-all bg-black/50 px-3 py-1.5 rounded-xl border border-white/5 mt-1" dir="ltr">
                        {verifiedTicket.videoUrl}
                      </p>
                    </div>
                  )}

                  {/* Render deterministic barcode */}
                  <div className="space-y-1 text-center">
                    <span className="text-[9px] text-zinc-500 block">Unique ID Automated Barcode</span>
                    <BarcodeSVG value={verifiedTicket.code} />
                  </div>

                  {/* Settings notes description fallback */}
                  {vipSettings?.instructions && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400 kurdish-text flex items-center gap-1 font-bold">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                        یاساکان و ڕێنمایی گشتی بەکارهێنان
                      </span>
                      <p className="text-[10px] text-gray-300 kurdish-text leading-relaxed">
                        {vipSettings.instructions}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons: Start viewing or download physically as image */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => downloadTicketAsImage(verifiedTicket)}
                  className="py-3.5 bg-gradient-to-r from-zinc-800 to-zinc-900 border border-white/10 text-white font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 transition duration-200 cursor-pointer active:scale-[0.98] hover:bg-zinc-800"
                >
                  <Download className="w-4 h-4 shrink-0 text-amber-400" />
                  دابەزاندنی فایل (PNG)
                </button>

                <button
                  onClick={handleStartViewing}
                  className="py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-black text-xs rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
                >
                  <Ticket className="w-4 h-4 shrink-0" />
                  دەستپێکردنی سەیرکردن
                </button>
              </div>

              <button
                onClick={() => {
                  setVerifiedTicket(null);
                  try {
                    localStorage.removeItem("vipRoom_verifiedTicket");
                  } catch (e) {
                    console.warn(e);
                  }
                }}
                className="w-full py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-black rounded-xl transition duration-150 border border-red-500/10 hover:border-red-500/25 mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                🚫 سڕینەوەی کۆد و چوونەدەرەوە (Reset VIP Session)
              </button>

            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

