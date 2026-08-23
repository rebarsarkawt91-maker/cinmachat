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
  ThumbsUp,
  Trash2
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
  deleteDoc
} from "../../lib/firebase";

// Receipt images are stored as compressed base64 data-URLs (Firebase Storage is
// not available on the Spark plan) — keep them small.
const MAX_RECEIPT_BYTES = 250 * 1024;

// Hours remaining until a ticket's expiry ISO stamp (null = open-ended).
const hoursLeftOnTicket = (expiresAt?: string): number | null => {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return null;
  return (t - Date.now()) / 3600000;
};

const isExpiredTicket = (ticket: any): boolean => {
  const left = hoursLeftOnTicket(ticket?.expiresAt);
  return left !== null && left <= 0;
};

// Compact Kurdish countdown label ("٣ڕۆژ ٥کاتژ" style).
const formatRemainingTime = (hours: number): string => {
  const totalMinutes = Math.max(0, Math.floor(hours * 60));
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d > 0) return `${d}ڕۆژ ${h}کاتژ`;
  if (h > 0) return `${h}کاتژ ${m}خولەک`;
  return `${m}خولەک`;
};

// Pull the YouTube video id out of common URL shapes (watch/shorts/youtu.be).
export const extractYouTubeId = (url: string): string | null => {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};

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

  // Optional payment receipt photo (base64 data-URL, max 250KB).
  const [receiptImage, setReceiptImage] = useState("");

  // Status check state for this user's previous requests stored in LocalStorage.
  // Multiple requests are supported; each id gets a live Firestore listener so
  // approvals show up instantly and stale ones can be deleted by the user.
  const [myRequestIds, setMyRequestIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("vipRoom_myRequests");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 10);
      }
      // Migrate the legacy single-request key if it exists
      const legacy = localStorage.getItem("vipRoom_myPendingRequest");
      return legacy ? [legacy] : [];
    } catch {
      return [];
    }
  });
  const [requestStatuses, setRequestStatuses] = useState<Record<string, any>>({});
  const [deletingReqId, setDeletingReqId] = useState<string | null>(null);

  // 30s ticker keeps the golden-ticket hours-left countdown fresh.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Load VIP Configuration and track previous requests on mount
  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  // Persist the tracked request ids whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("vipRoom_myRequests", JSON.stringify(myRequestIds));
    } catch (err) {
      console.warn(err);
    }
  }, [myRequestIds]);

  // Live listeners: one per tracked request. When the admin approves any of
  // them, the code auto-fills in the verify tab without a refresh.
  useEffect(() => {
    if (!isOpen || myRequestIds.length === 0) return;
    const unsubs = myRequestIds.map((id) =>
      onSnapshot(
        doc(db, "vip_requests", id),
        (snap) => {
          setRequestStatuses((prev) => {
            const next = { ...prev };
            if (snap.exists()) {
              next[id] = { id: snap.id, ...snap.data() };
            } else {
              next[id] = { missing: true };
            }
            return next;
          });
        },
        (err) => console.warn(`vip_requests listener (${id}):`, err),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [isOpen, myRequestIds]);

  // Auto-fill the code field from the newest approved request
  useEffect(() => {
    const approved = Object.values(requestStatuses).find(
      (r: any) => r && r.status === "Approved" && r.approvedCode,
    );
    if (approved) setCode(approved.approvedCode);
  }, [requestStatuses]);

  // LIVE ADMIN SYNC — settings stream: when the admin edits the QR code,
  // payment details, instructions or logo in Module 15 (TicketVIPModule), an
  // open modal reflects the change instantly, no refresh needed.
  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(
      doc(db, "vip_settings", "default"),
      (snap) => {
        if (snap.exists()) setVipSettings(snap.data());
      },
      (err) => console.warn("vip_settings live sync:", err),
    );
    return () => unsub();
  }, [isOpen]);

  // LIVE ADMIN SYNC — active ticket stream: follows the holder's ticket doc so
  // admin-side changes (validity extension, usage reset, device data) land
  // here immediately; expiry flips the golden ticket into its blocked state,
  // and a deleted ticket drops the user back to the entry form.
  useEffect(() => {
    if (!isOpen || !verifiedTicket?.code) return;
    const ticketCode = verifiedTicket.code;
    const unsub = onSnapshot(
      doc(db, "vip_tickets", ticketCode),
      (snap) => {
        if (!snap.exists()) {
          setVerifiedTicket(null);
          try {
            localStorage.removeItem("vipRoom_verifiedTicket");
          } catch (err) {
            console.warn(err);
          }
          setErrorMsg("⚠️ بلیتەکەت لەلایەن بەڕێوبەرەوە لابراوە!");
          return;
        }
        const data = snap.data();
        setVerifiedTicket((prev: any) => ({ ...(prev || {}), ...data, id: snap.id }));
        try {
          localStorage.setItem("vipRoom_verifiedTicket", JSON.stringify({ id: snap.id, ...data }));
        } catch (err) {
          console.warn(err);
        }
      },
      (err) => console.warn(`vip_tickets live sync (${ticketCode}):`, err),
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, verifiedTicket?.code]);

  const fetchSettings = async () => {
    try {
      // Re-verify existing localStorage ticket if present (Firestore read)
      const savedTicketStr = localStorage.getItem("vipRoom_verifiedTicket");
      if (savedTicketStr) {
        try {
          const parsed = JSON.parse(savedTicketStr);
          if (parsed && parsed.code) {
            const tSnap = await getDoc(doc(db, "vip_tickets", parsed.code));
            if (tSnap.exists()) {
              const ticketData = tSnap.data();
              if (isExpiredTicket(ticketData)) {
                // Deadline passed since last visit: archive it and lock the user out
                updateDoc(doc(db, "vip_tickets", parsed.code), { status: "Expired" }).catch(() => {});
                localStorage.removeItem("vipRoom_verifiedTicket");
                setVerifiedTicket(null);
                setErrorMsg("⚠️ بلیتەکەت کاتی تەواو بوو! تکایە بلیتێکی نوێ بکڕە بۆ گەڕانەوە.");
              } else {
                setVerifiedTicket({ id: parsed.code, ...ticketData });
                try {
                  localStorage.setItem(
                    "vipRoom_verifiedTicket",
                    JSON.stringify({ id: parsed.code, ...ticketData }),
                  );
                } catch (err) {
                  console.warn(err);
                }
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
        } catch (e) {
          console.warn("Could not check ticket validity", e);
        }
      }

      const sSnap = await getDoc(doc(db, "vip_settings", "default"));
      if (sSnap.exists()) setVipSettings(sSnap.data());

      const vSnap = await getDocs(collection(db, "vip_videos"));
      const vList = vSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      vList.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setVipVideos(vList);
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  // Remove one of this user's own requests from Firestore and the tracker list
  const handleDeleteMyRequest = async (reqId: string) => {
    if (!window.confirm("دڵنیایی لە سڕینەوەی ئەم داواکارییە؟ ئەم کارە ناگەڕێتەوە!")) return;
    try {
      setDeletingReqId(reqId);
      await deleteDoc(doc(db, "vip_requests", reqId));
      setMyRequestIds((prev) => prev.filter((x) => x !== reqId));
      setRequestStatuses((prev) => {
        const next = { ...prev };
        delete next[reqId];
        return next;
      });
      setErrorMsg("");
    } catch (err) {
      console.error(err);
      setErrorMsg("کێشە لە سڕینەوەی داواکاری هەیە!");
    } finally {
      setDeletingReqId(null);
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
      const snap = await getDoc(doc(db, "vip_tickets", code.trim()));
      if (snap.exists()) {
        const ticketData = { id: snap.id, ...snap.data() } as any;
        // Expiration gate: an expired ticket is archived and rejected even if
        // its status field still says "active" (admin may not have noticed).
        if (isExpiredTicket(ticketData)) {
          updateDoc(doc(db, "vip_tickets", code.trim()), { status: "Expired" }).catch(() => {});
          setErrorMsg("⚠️ ئەم بلیتە بەسەرچووە! کاتی مۆڵەتی تەواو بووە.");
        } else if (ticketData.status === "active" || ticketData.status === "used") {
          // Increment usage counter and record the activating device.
          const nextUsedCount = Math.min((ticketData.usedCount || 0) + 1, 2);
          const device = (typeof navigator !== "undefined" ? navigator.userAgent || "" : "").substring(0, 120);
          const updated = { ...ticketData, usedCount: nextUsedCount, lastDevice: device, lastIp: "" };
          if (nextUsedCount >= 2 && updated.status === "active") updated.status = "used";

          await updateDoc(doc(db, "vip_tickets", code.trim()), {
            usedCount: nextUsedCount,
            lastDevice: device,
            lastIp: "",
            status: updated.status,
          });

          setVerifiedTicket(updated);
          const sSnap = await getDoc(doc(db, "vip_settings", "default"));
          if (sSnap.exists()) setVipSettings(sSnap.data());
          try {
            localStorage.setItem("vipRoom_verifiedTicket", JSON.stringify(updated));
          } catch (e) {
            console.warn("Storage warning in setting vipRoom_verifiedTicket:", e);
          }
        } else {
          setErrorMsg("کۆدەکە هەڵەیە یان بەسەرچووە!");
        }
      } else {
        setErrorMsg("کۆدەکە هەڵەیە یان بەسەرچووە!");
      }
    } catch (err) {
      setErrorMsg("کێشەیەک لە پەیوەندی Firestore هەیە!");
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
      const reqRef = await addDoc(collection(db, "vip_requests"), {
        customerName: vName.trim(),
        customerPhone: vPhone.trim(),
        // Real receipt image (base64) when provided, otherwise the manual flow marker
        bankScreenshot: receiptImage || "ڕەوانەکرا بۆ وەتسئاپ / Manual WhatsApp Flow",
        status: "Pending",
        createdAt: new Date().toISOString(),
      });

      const requestData = {
        id: reqRef.id,
        customerName: vName.trim(),
        customerPhone: vPhone.trim(),
        status: "Pending",
        createdAt: new Date().toISOString(),
      };

      setRequestSaved(requestData);
      setMyRequestIds((prev) => (prev.includes(reqRef.id) ? prev : [reqRef.id, ...prev].slice(0, 10)));
      setActiveTab("requested");
      setVName("");
      setVPhone("");
      setReceiptImage("");
    } catch (err) {
      setErrorMsg("کێشەیەک هەیە لە تۆمارکردنی داواکاری!");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Receipt photo picker with size validation + local preview (no Storage)
  const handleReceiptPick = (file?: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setErrorMsg("⚠️ تکایە ڕەسمێکی PNG / JPG / WebP هەڵبژێرە!");
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setErrorMsg("⚠️ قەبارەی ڕەسم زۆر گەورەیە — کەمتر لە 250KB بێت!");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setErrorMsg("");
      setReceiptImage(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => setErrorMsg("خوێندنەوەی فایلەکە سەرکەوتوو نەبوو!");
    reader.readAsDataURL(file);
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
      return;
    }

    // Stamp a live-session heartbeat so the admin archive shows this ticket as
    // "زیندوو ئێستا" (live) while the holder is watching. Fire-and-forget: a
    // failed write must never block entering the VIP room.
    if (verifiedTicket?.code) {
      updateDoc(doc(db, "vip_tickets", verifiedTicket.code), {
        isLive: true,
        lastActiveAt: new Date().toISOString(),
        activeDevice: (typeof navigator !== "undefined" ? navigator.userAgent || "" : "").substring(0, 120),
      }).catch((err) => console.warn("Live stamp skipped:", err));
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
          {/* Silent glass preview trailer — plays muted behind the door card so
              visitors see a taste of the VIP room before entering. */}
          {!verifiedTicket && vipSettings?.glassPreviewEnabled && vipSettings?.glassPreviewUrl?.trim() && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
              {(() => {
                const url = vipSettings.glassPreviewUrl.trim();
                const ytId = extractYouTubeId(url);
                if (ytId) {
                  return (
                    <iframe
                      src={`https://www.youtube.com/embed/${ytId}?mute=1&autoplay=1&loop=1&playlist=${ytId}&controls=0&playsinline=1`}
                      className="absolute inset-0 w-full h-full opacity-40 blur-sm scale-110 border-0"
                      allow="autoplay; encrypted-media"
                      title="VIP preview"
                    />
                  );
                }
                return (
                  <video
                    src={url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm scale-110"
                  />
                );
              })()}
              {/* Dark gradient wash keeps the foreground form readable */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#090a0d]/70 via-[#090a0d]/85 to-[#090a0d]" />
            </div>
          )}

          {/* Top closing cross */}
          <button
            onClick={onClose}
            id="btn-close-vip-modal"
            className="absolute top-6 left-6 z-20 p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Verification phase / Requested / Form Access Tabs */}
          {!verifiedTicket ? (
            <div className="relative z-10 space-y-6">
              
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

              {/* My requests tracker: live statuses via onSnapshot + user delete */}
              {myRequestIds.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] text-gray-500 kurdish-text font-bold flex items-center gap-1.5 px-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    داواکارییەکانی من ({myRequestIds.length})
                  </span>
                  {myRequestIds.map((rid) => {
                    const st = requestStatuses[rid];
                    const isApproved = st?.status === "Approved";
                    const isMissing = !!st?.missing;
                    return (
                      <div
                        key={rid}
                        className={`p-3 border rounded-2xl flex items-center justify-between gap-3 text-right ${
                          isApproved
                            ? "bg-green-500/5 border-green-500/15"
                            : isMissing
                              ? "bg-zinc-500/5 border-white/5"
                              : "bg-amber-500/5 border-amber-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock
                            className={`w-4 h-4 shrink-0 ${
                              isApproved ? "text-green-400" : isMissing ? "text-zinc-500" : "text-amber-500 animate-pulse"
                            }`}
                          />
                          <div className="min-w-0 text-right">
                            <span className="text-[10px] text-gray-400 block kurdish-text truncate max-w-[160px]" title={st?.customerName || ""}>
                              {st?.customerName || "..."}
                            </span>
                            <span className="text-[9px] font-mono text-gray-600 truncate block max-w-[160px]" dir="ltr">{rid}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isApproved && (
                            <span className="px-2.5 py-1 text-[9px] font-black rounded-lg bg-green-500/20 text-green-400 border border-green-500/20 kurdish-text">
                              پەسەندکرا ✓ کۆدت بۆ پڕکراوەتەوە
                            </span>
                          )}
                          {isMissing && (
                            <span className="px-2.5 py-1 text-[9px] font-black rounded-lg bg-zinc-500/15 text-zinc-400 border border-white/10 kurdish-text">
                              لابراوە / ڕەتکراوە
                            </span>
                          )}
                          {!st && (
                            <span className="px-2.5 py-1 text-[9px] font-black rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/20 kurdish-text">
                              چاوەڕوانە ⏳
                            </span>
                          )}
                          {!isApproved && !st?.missing && st?.status !== undefined && st.status !== "Pending" && st.status !== "Approved" && (
                            <span className="px-2.5 py-1 text-[9px] font-black rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/20 kurdish-text">
                              {st.status}
                            </span>
                          )}

                          <button
                            onClick={() => handleDeleteMyRequest(rid)}
                            disabled={deletingReqId === rid}
                            className="p-1.5 hover:bg-red-500/10 text-gray-500 hover:text-red-400 rounded-lg transition disabled:opacity-40 cursor-pointer"
                            title="سڕینەوەی ئەم داواکارییە"
                          >
                            <Trash2 className={`w-3.5 h-3.5 ${deletingReqId === rid ? "animate-pulse" : ""}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
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

                    {/* Payment receipt upload (optional, stored as base64) */}
                    <div className="space-y-2.5 p-4 rounded-2xl bg-black/30 border border-white/5">
                      <label className="text-[10px] text-gray-300 kurdish-text font-bold flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5 text-amber-400" />
                        وێنەی پسوڵەی پارەدان (ئارەزوومەندانە — کەمتر لە 250KB)
                      </label>
                      {receiptImage ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={receiptImage}
                            alt="Receipt preview"
                            className="w-20 h-20 object-cover rounded-xl border border-emerald-500/30"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 space-y-1.5">
                            <span className="block text-[10px] text-emerald-400 kurdish-text font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              پسوڵەکە ئامادەیە بۆ ناردن
                            </span>
                            <button
                              type="button"
                              onClick={() => setReceiptImage("")}
                              className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-[10px] font-black rounded-lg transition cursor-pointer"
                            >
                              لابردنی وێنە
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center gap-2 p-5 border border-dashed border-white/10 hover:border-amber-500/40 rounded-xl cursor-pointer transition group">
                          <span className="w-9 h-9 rounded-full bg-amber-500/10 group-hover:bg-amber-500/20 flex items-center justify-center text-amber-400 transition">
                            <Upload className="w-4 h-4" />
                          </span>
                          <span className="text-[10px] text-gray-500 kurdish-text">کرتە بکە و وێنەی پسوڵەکەت بارکە</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => handleReceiptPick(e.target.files?.[0])}
                          />
                        </label>
                      )}
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
            <div className="relative z-10 space-y-6">
              <div className="text-center space-y-1">
                <span className="text-[9px] bg-gradient-to-r from-amber-500 to-yellow-500 text-black px-3 py-1 rounded-full font-black uppercase tracking-wider shadow-lg">Premium VIP Cinema Pass</span>
                <h3 className="text-2xl font-black text-amber-400 kurdish-text mt-2.5">بلیتی شاهانەی VIP چالاککرا</h3>
                <p className="text-xs text-gray-400 font-mono">ID: {verifiedTicket.code}</p>
                {/* Live validity countdown — refreshes with the 30s ticker */}
                <p data-tick={nowTick} className="text-[11px] font-black">
                  {(() => {
                    const left = hoursLeftOnTicket(verifiedTicket?.expiresAt);
                    if (left === null)
                      return <span className="text-slate-300 kurdish-text">∞ مۆڵەتی بێ کۆتایی</span>;
                    if (left <= 0)
                      return <span className="text-red-400 kurdish-text">بەسەرچووە — کۆتایی مۆڵەت: {new Date(verifiedTicket.expiresAt).toLocaleString("en-GB")}</span>;
                    return (
                      <span className={left < 24 ? "text-amber-400 kurdish-text" : "text-emerald-400 kurdish-text"}>
                        کاتی ماوە: {formatRemainingTime(left)}
                      </span>
                    );
                  })()}
                </p>
              </div>

              {isExpiredTicket(verifiedTicket) && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-black kurdish-text flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  بلیتەکەت بەسەرچووە! تکایە لە تبابی "داواکاری بلیت نوێ" بلیتێکی نوێ بکڕە.
                </div>
              )}

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
                  disabled={isExpiredTicket(verifiedTicket)}
                  className="py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-black text-xs rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  <Ticket className="w-4 h-4 shrink-0" />
                  {isExpiredTicket(verifiedTicket) ? "بلیت بەسەرچووە" : "دەستپێکردنی سەیرکردن"}
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

