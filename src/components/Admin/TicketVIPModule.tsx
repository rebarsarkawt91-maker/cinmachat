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
  Image as ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface VIPSetting {
  qrCodeUrl: string;
  paymentDetails: string;
  instructions: string;
  paymentLogoUrl?: string;
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
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      onError(`⚠️ قەبارەی وێنە ناتوانێت لە ٢ مێگابایت زیاتر بێت!`);
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      onError(`⚠️ ڕێگە تەنها بە وێنەکانی (PNG, JPEG, WebP, SVG) دراوە!`);
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        const res = await fetch("/api/admin/vip/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileData: base64Data,
            fileName: file.name,
            adminName
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          onChange(data.url);
        } else {
          onError(data.error || "تێکشکان لە لۆدکردنی وێنەکە.");
        }
      };
      reader.onerror = () => {
        onError("هەڵەیەک ڕوویدا لە خوێندنەوەی پەڕگەکە.");
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      onError("کێشەیەکی ناوخۆیی هەیە: " + (err.message || String(err)));
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
}

interface TicketVIPModuleProps {
  currentUser: any;
}

export const TicketVIPModule: React.FC<TicketVIPModuleProps> = ({ currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<"tickets" | "settings" | "video" | "requests">("tickets");
  
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
  const [selectedVipVideoId, setSelectedVipVideoId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  // Settings form states
  const [formQr, setFormQr] = useState("");
  const [formDetails, setFormDetails] = useState("");
  const [formInst, setFormInst] = useState("");
  const [formLogo, setFormLogo] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  
  // Admin selected request screenshot modal
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);
  
  // Dynamic individual video-binding state for requests approval
  const [requestVideoUrls, setRequestVideoUrls] = useState<{ [reqId: string]: string }>({});

  const adminName = currentUser?.username || "Admin";

  const loadVIPData = async () => {
    setIsLoading(true);
    try {
      // 1. Load tickets
      const ticketsRes = await fetch("/api/admin/vip/tickets");
      if (ticketsRes.ok) {
        const tList = await ticketsRes.json();
        if (Array.isArray(tList)) setTickets(tList);
      }
      
      // 2. Load settings
      const settingsRes = await fetch("/api/admin/vip/settings");
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        setSettings(sData);
        setFormQr(sData.qrCodeUrl || "");
        setFormDetails(sData.paymentDetails || "");
        setFormInst(sData.instructions || "");
        setFormLogo(sData.paymentLogoUrl || "");
      }

      // 3. Load videos
      const videosRes = await fetch("/api/admin/vip/videos");
      if (videosRes.ok) {
        const vList = await videosRes.json();
        if (Array.isArray(vList)) setVipVideos(vList);
      }

      // 4. Load pending requests
      const requestsRes = await fetch("/api/admin/vip/requests");
      if (requestsRes.ok) {
        const rList = await requestsRes.json();
        if (Array.isArray(rList)) setVipRequests(rList);
      }
    } catch (err) {
      console.error("Error loading VIP module:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVIPData();
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

    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/vip/tickets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          videoUrl,
          vipVideoId: selectedVipVideoId,
          adminName
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessText(`✓ تیکێت بە سەرکەوتوویی دروستکرا! کۆد: ${data.ticket.code}`);
        setCustomerName("");
        setCustomerPhone("");
        setVideoUrl("");
        loadVIPData();
      } else {
        setErrorText(data.error || "شکست لە داڕشتن.");
      }
    } catch (err) {
      setErrorText("کێشەی ڕایەڵە هەیە لە پێوەندی.");
    } finally {
      setIsLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText("");
    setSuccessText("");

    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/vip/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrCodeUrl: formQr,
          paymentDetails: formDetails,
          instructions: formInst,
          paymentLogoUrl: formLogo,
          adminName
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessText("✓ ڕێکخستنەکانی کڕینی VIP بە سەرکەوتوویی پاشەکەوت کران.");
        loadVIPData();
      } else {
        setErrorText(data.error || "کێشەیەک لە پاشەکەوتدا هەیە.");
      }
    } catch (err) {
      setErrorText("کێشەی نوێکردنەوە لە ڕایەڵە.");
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
      const res = await fetch("/api/admin/vip/requests/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          videoUrl: boundUrl,
          adminName
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessText(`✓ داواکاری بە سەرکەوتوویی قبوڵکرا! کۆدی VIP دروستبوو: ${data.ticket.code}`);
        // Clear temp binding URL
        const updatedBinds = { ...requestVideoUrls };
        delete updatedBinds[requestId];
        setRequestVideoUrls(updatedBinds);
        loadVIPData();
      } else {
        setErrorText(data.error || "هەڵەیەک لە پەسەندکردنی داواکارییەکەدا هەیە.");
      }
    } catch (err) {
      setErrorText("کێشەی پێوەندی ڕایەڵە هەیە.");
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
      const res = await fetch("/api/admin/vip/requests/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          adminName
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessText("✓ داواکارییەکە بە سەرکەوتوویی ڕەتکرایەوە یان سڕایەوە.");
        loadVIPData();
      } else {
        setErrorText(data.error || "شکست لە ئەنجامدانی کردارەکە.");
      }
    } catch (err) {
      setErrorText("نەتوانرا لەگەڵ ڕایەڵە پەیوەند بپەڕێت.");
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
            <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">مۆدیۆڵ ١٤: سیستەمی بلیت و بڵاوکردنەوەی VIP سەرچاوە فەرمییەکان</h2>
            <p className="text-xs text-gray-400 kurdish-text mt-1">ئۆتۆماتیزەکردنی داواکارییە گەیشتووەکان لە بەکارهێنەران، لێکدانەوەی بەڵگەی وێنەی پسوڵە، دروستکردنی کۆد، و بڵاوکردنەوەی فیلمەکان.</p>
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

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 p-1 bg-[#12141a]/60 border border-white/5 rounded-2xl">
        <button
          onClick={() => { setActiveSubTab("tickets"); setErrorText(""); setSuccessText(""); }}
          className={`px-4 py-2 text-xs font-black rounded-xl kurdish-text flex items-center gap-2 transition duration-200 ${
            activeSubTab === "tickets" 
              ? "bg-purple-600 text-white shadow-lg" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Ticket className="w-3.5 h-3.5" />
          کۆپۆن و مەنەفێستەکان ({tickets.length})
        </button>

        <button
          onClick={() => { setActiveSubTab("requests"); setErrorText(""); setSuccessText(""); }}
          className={`px-4 py-2 text-xs font-black rounded-xl kurdish-text flex items-center gap-2 transition duration-200 relative ${
            activeSubTab === "requests" 
              ? "bg-purple-600 text-white shadow-lg" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          داواکاری پسوڵەکان ({vipRequests.filter(r => r.status === "Pending").length})
          {vipRequests.filter(r => r.status === "Pending").length > 0 && (
            <span className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
          )}
        </button>

        <button
          onClick={() => { setActiveSubTab("settings"); setErrorText(""); setSuccessText(""); }}
          className={`px-4 py-2 text-xs font-black rounded-xl kurdish-text flex items-center gap-2 transition duration-200 ${
            activeSubTab === "settings" 
              ? "bg-purple-600 text-white shadow-lg" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          ڕێکخستنەکانی پارەدان و لۆگۆ
        </button>

        <button
          onClick={() => { setActiveSubTab("video"); setErrorText(""); setSuccessText(""); }}
          className={`px-4 py-2 text-xs font-black rounded-xl kurdish-text flex items-center gap-2 transition duration-200 ${
            activeSubTab === "video" 
              ? "bg-purple-600 text-white shadow-lg" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          پۆستکردنی ڤیدیۆی VIP
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
        
        {/* TAB 1: TICKETS LIST AND GENERATION */}
        {activeSubTab === "tickets" && (
          <motion.div key="tickets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Generation Form Sidebar */}
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

            {/* Managed Tickets List Area */}
            <div className="lg:col-span-2 bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white kurdish-text">تۆماری گشتی بلیتی بەشداربووان</h3>
                  <p className="text-xs text-gray-400 kurdish-text">جێگیری ڕێژەی بەکارهێنان و ناوی کڕیارەکان.</p>
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
                    className="w-full pr-9 pl-3 py-1.5 bg-black/45 border border-white/5  focus:border-purple-500/40 rounded-xl text-xs text-white kurdish-text outline-none"
                  />
                </div>
              </div>

              {filteredTickets.length === 0 ? (
                <div className="p-12 text-center border border-white/5 bg-white/5 rounded-2xl text-xs text-gray-400 kurdish-text">
                  هیچ بلیتێک سازنەکراوە لەم بەشەدا بۆ ئەم تەوەری خەسڵەتە.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 text-[10px] border-b border-white/5">
                        <th className="p-3 kurdish-text">کۆدی تیکێت (VIP Code)</th>
                        <th className="p-3 kurdish-text">کڕیار (Customer Details)</th>
                        <th className="p-3 kurdish-text">بەکارهێنان (Limit 2)</th>
                        <th className="p-3 kurdish-text">دواین ئامێر / ئایپی (Last Device/IP)</th>
                        <th className="p-3 kurdish-text">دۆخی بلیت (Status)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredTickets.map((ticket) => (
                        <tr key={ticket.code} className="hover:bg-white/5 transition duration-150">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1.5 py-1 rounded text-[11px] select-all">
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
                            <span className="font-sans font-black text-gray-300">
                              {ticket.usedCount} / 2
                            </span>
                          </td>
                          <td className="p-3">
                            {ticket.lastIp ? (
                              <div className="space-y-0.5">
                                <span className="block text-[10px] font-mono text-gray-300">{ticket.lastIp}</span>
                                <span className="block text-[9px] text-[#00e1ff] font-semibold kurdish-text">📍 {ticket.lastDevice}</span>
                              </div>
                            ) : (
                              <span className="text-gray-500 text-[10px] kurdish-text">تاوەک ئێستە مۆتیڤ نەکراوە</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              ticket.status === "Expired" 
                                ? "bg-red-500/10 text-red-500 border border-red-500/25" 
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                            } kurdish-text`}>
                              {ticket.status === "Expired" ? "خراپبوو / بەسەرچوو" : "چالاکە"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 2: PENDING USER SCREENSHOTS ACCESS REQUESTS QUEUE */}
        {activeSubTab === "requests" && (
          <motion.div key="requests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-500 animate-pulse" />
                داواکارییە چاوەڕوانکراکانی بەژداربووان (Pending Access Requests Queue)
              </h3>
              <p className="text-xs text-gray-400 kurdish-text">پێداچوونەوە بکە بە ناردراوەکان، تەماشای پسوڵەی گواستنەوەی فاستپەی/زین کاش بکە، و بە کلیلێک کۆدی VIP بێ هاوتا ساز بکە.</p>
            </div>

            {vipRequests.filter(r => r.status === "Pending").length === 0 ? (
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
          </motion.div>
        )}

        {/* TAB 3: VIP WALLET & QR CONFIGURATION */}
        {activeSubTab === "settings" && (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-6">
            <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
              <QrCode className="w-5 h-5 text-purple-400" />
              ڕێکخستنەکانی پارەدانی بلیتی VIP و بارکردنی لۆگۆ
            </h3>

            <form onSubmit={handleSaveSettings} className="space-y-5">
              
              <FileUploaderInput
                label="کۆدی QR بۆ پارەدان (QR Code)"
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
                <label className="text-xs text-gray-300 kurdish-text font-bold">زانیاری زیاتری حسابەکەت (Bank accounts / Wallet lists)</label>
                <textarea
                  value={formDetails}
                  rows={3}
                  onChange={(e) => setFormDetails(e.target.value)}
                  placeholder="فاستپەی: 07501234567&#10;فایبەر کورتکراو: FIB-000302"
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white kurdish-text outline-none resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-300 kurdish-text font-bold">سەرپەرشتیار و ڕێنمایی نووسراو (Custom Client Ticket Instructions)</label>
                <textarea
                  value={formInst}
                  rows={4}
                  onChange={(e) => setFormInst(e.target.value)}
                  placeholder="ڕێنمایی بۆ کڕیار لێرە پۆست بکە..."
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-purple-500/30 rounded-xl text-xs text-white kurdish-text outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="py-3 px-6 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-purple-600/15"
              >
                پاشەکەوتکردنی ڕێکخستنەکان
              </button>

            </form>
          </motion.div>
        )}
        
        {/* TAB 4: VIP VIDEO UPLOAD */}
        {activeSubTab === "video" && (
          <motion.div key="video" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-6">
            <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-purple-400" />
              بەڕێوبەرایەتی ڤیدیۆکانی VIP
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
                <button 
                  onClick={async () => {
                     const res = await fetch("/api/admin/vip/videos/add", {
                       method: "POST",
                       headers: { "Content-Type": "application/json" },
                       body: JSON.stringify({ title: customerName, videoUrl: videoUrl, adminName })
                     });
                     if (res.ok) { loadVIPData(); setCustomerName(""); setVideoUrl(""); }
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-black"
                >
                  زیادکردنی ڤیدیۆ
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {vipVideos.map(v => (
                <div key={v.id} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-xs text-white">{v.title}</span>
                  <button 
                  onClick={async () => {
                     await fetch("/api/admin/vip/videos/delete", {
                       method: "POST",
                       headers: { "Content-Type": "application/json" },
                       body: JSON.stringify({ id: v.id, adminName })
                     });
                     loadVIPData();
                  }}
                  className="p-2 bg-red-500/10 text-red-500 rounded-lg text-xs"
                  ><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
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
