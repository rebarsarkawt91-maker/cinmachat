import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  ShieldAlert, 
  Key, 
  Globe, 
  Ban, 
  Trash2, 
  Search, 
  RefreshCw, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  Clock,
  User,
  Shield
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface FailedLogin {
  ip: string;
  username: string;
  location: string;
  timestamp: string;
}

interface BannedIp {
  ip: string;
}

interface AuditLog {
  id: string;
  admin: string;
  action: string;
  details: string;
  timestamp: string;
}

interface SecurityShieldModuleProps {
  currentUser: any;
}

export const SecurityShieldModule: React.FC<SecurityShieldModuleProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<"gateway" | "firewall" | "autoban" | "filter" | "audit">("gateway");
  const [isLoading, setIsLoading] = useState(false);
  const [emergencyLock, setEmergencyLock] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState<FailedLogin[]>([]);
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [bannedKeywords, setBannedKeywords] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  
  // Inputs
  const [manualIpToBan, setManualIpToBan] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [filterQuery, setFilterQuery] = useState("");

  const adminName = currentUser?.username || "Admin";

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load emergency lock status
      const lockRes = await fetch("/api/admin/emergency-lock");
      const lockData = await lockRes.json();
      setEmergencyLock(!!lockData.emergencyLock);

      // Load failed log attempts
      const attemptsRes = await fetch("/api/admin/firewall-logs");
      const attemptsData = await attemptsRes.json();
      if (Array.isArray(attemptsData)) setFailedAttempts(attemptsData);

      // Load banned IPs
      const ipsRes = await fetch("/api/admin/banned-ips");
      const ipsData = await ipsRes.json();
      if (Array.isArray(ipsData)) setBannedIps(ipsData);

      // Load banned keywords
      const kwRes = await fetch("/api/admin/banned-keywords");
      const kwData = await kwRes.json();
      if (Array.isArray(kwData)) setBannedKeywords(kwData);

      // Load audit logs
      const auditRes = await fetch("/api/admin/audit-logs");
      const auditData = await auditRes.json();
      if (Array.isArray(auditData)) setAuditLogs(auditData);

    } catch (err) {
      console.error("Error loading security module data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Periodically sync security health state
    const timer = setInterval(loadData, 15000);
    return () => clearInterval(timer);
  }, []);

  // Point 5: toggle emergency lock
  const handleToggleEmergencyLock = async () => {
    const nextState = !emergencyLock;
    const confirmMsg = nextState 
      ? "⚠ ئایا دڵنیایت لە چالاککردنی 'قوفڵی باری نائاسایی کاتی'؟ ئەم بریارە هەموو هاتوچۆیەکی گشتی ڕادەگرێت بۆ ماڵپەڕ جگە لە ئەدمینەکان!"
      : "ئایا دڵنیایت لە کرانەوەی ماڵپەڕ و لابردنی باری نائاسایی؟";
    
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/admin/toggle-emergency-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState, adminName }),
      });
      const data = await res.json();
      setEmergencyLock(!!data.emergencyLock);
      loadData();
    } catch (err) {
      console.error("Failed to toggle emergency lock:", err);
    }
  };

  // Point 3: manual-IP ban
  const handleBanIp = async () => {
    if (!manualIpToBan.trim()) return;
    try {
      const res = await fetch("/api/admin/ban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: manualIpToBan, adminName }),
      });
      if (res.ok) {
        setManualIpToBan("");
        loadData();
      }
    } catch (err) {
      console.error("Failed to ban IP:", err);
    }
  };

  const handleUnbanIp = async (ip: string) => {
    try {
      const res = await fetch("/api/admin/unban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, adminName }),
      });
      if (res.ok) {
        loadData();
      }
    } catch (err) {
      console.error("Failed to unban IP:", err);
    }
  };

  // Point 4: Add banned keyword
  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    try {
      const res = await fetch("/api/admin/add-banned-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newKeyword, adminName }),
      });
      if (res.ok) {
        setNewKeyword("");
        loadData();
      }
    } catch (err) {
      console.error("Failed to add keyword:", err);
    }
  };

  const handleDeleteKeyword = async (keyword: string) => {
    try {
      const res = await fetch("/api/admin/delete-banned-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, adminName }),
      });
      if (res.ok) {
        loadData();
      }
    } catch (err) {
      console.error("Failed to delete keyword:", err);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " - " + d.toLocaleDateString("ku-IQ");
    } catch {
      return dateStr;
    }
  };

  // Filter logs for search querying
  const filteredAuditLogs = auditLogs.filter(log => 
    log.admin.toLowerCase().includes(filterQuery.toLowerCase()) ||
    log.action.toLowerCase().includes(filterQuery.toLowerCase()) ||
    log.details.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const filteredFailedLogins = failedAttempts.filter(f =>
    f.ip.toLowerCase().includes(filterQuery.toLowerCase()) ||
    f.location.toLowerCase().includes(filterQuery.toLowerCase()) ||
    f.username.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-br from-[#0f1013] to-[#15171e] border border-white/5 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 h-32 w-32 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary border border-brand-primary/20">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">سیسـتەمی قەڵغانی ئاسـایش و فایەروۆڵ</h2>
            <p className="text-xs text-gray-400 kurdish-text mt-1">ئاسایش، فلتەرکردنی ناوەڕۆک، چاودێریکردنی هاتوچۆ و ڕێگری لە هێرشی هاکەران.</p>
          </div>
        </div>

        <button 
          onClick={loadData}
          disabled={isLoading}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/5 flex items-center gap-2 text-xs font-semibold self-start lg:self-auto transition duration-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          نوێکردنەوەی دۆخەکە
        </button>
      </div>

      {/* Internal Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[#0f1013]/50 border border-white/5 rounded-2xl">
        <button
          onClick={() => { setActiveTab("gateway"); setFilterQuery(""); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeTab === "gateway" 
              ? "bg-brand-primary text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          دەروازەی داخران (Gateway)
        </button>
        <button
          onClick={() => { setActiveTab("firewall"); setFilterQuery(""); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeTab === "firewall" 
              ? "bg-brand-primary text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          هەوڵە شکـستخواردووەکان
        </button>
        <button
          onClick={() => { setActiveTab("autoban"); setFilterQuery(""); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeTab === "autoban" 
              ? "bg-brand-primary text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Ban className="w-3.5 h-3.5" />
          سیستەمی بلۆک (Auto-Ban)
        </button>
        <button
          onClick={() => { setActiveTab("filter"); setFilterQuery(""); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeTab === "filter" 
              ? "bg-brand-primary text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          فلتەری وشەکان
        </button>
        <button
          onClick={() => { setActiveTab("audit"); setFilterQuery(""); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeTab === "audit" 
              ? "bg-brand-primary text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          تۆماری مێژوویی (Audit Log)
        </button>
      </div>

      {/* Tab Contents */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 shadow-xl"
        >
          {/* TAB 1: ACCESS GATEWAY (Site Emergency Lock) */}
          {activeTab === "gateway" && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${
                    emergencyLock 
                      ? "bg-red-500/10 text-red-500 border-red-500/20 animate-pulse" 
                      : "bg-[#00e1ff]/10 text-brand-primary border-brand-primary/20"
                  }`}>
                    {emergencyLock ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white kurdish-text">دۆخی قوفڵی گشتی ماڵپەڕ (Site Lock Gate)</h3>
                    <p className="text-xs text-gray-400 kurdish-text mt-1">
                      {emergencyLock 
                        ? "🛑 لە ئێستادا ماڵپەڕ لە دۆخی قوفڵی پەلەدایە. هەموو هاتوچۆ مەکینەیی یاخود میوانەکان ڕاگیراون و ناتوانن بچنە ژوورەوە."
                        : "✓ ماڵپەڕ چالاکە و هاتوچۆی گشتی بە ئاساییە."
                      }
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleToggleEmergencyLock}
                  className={`px-6 py-3 rounded-2xl text-xs font-bold kurdish-text flex items-center gap-2 transition duration-300 shadow-lg ${
                    emergencyLock 
                      ? "bg-green-500 hover:bg-green-600 text-white shadow-green-500/10" 
                      : "bg-red-500 hover:bg-red-600 text-white shadow-red-500/10"
                  }`}
                >
                  {emergencyLock ? (
                    <>
                      <Unlock className="w-4 h-4" />
                      کردنەوەی ماڵپەڕ (Unlock Site)
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      داخستنی لەناکاو (Emergency Lock)
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                  <h4 className="text-sm font-bold text-white kurdish-text flex items-center gap-2 text-brand-primary">
                    <ShieldCheck className="w-4 h-4" />
                    پاراستنی پاشبنەما (Backend Shield)
                  </h4>
                  <p className="text-xs text-gray-400 kurdish-text leading-relaxed">
                    بە فەعالکردنی ئەم قوفڵە، سێرڤەر بە ڕاستەوخۆ وەڵامی هەموو داواکاریەکی بەژداربووان جیا لە ئەکاونتی ئەدمین دەداتەوە بە کۆدی کێشەی سێرڤەری کاتیی 503 HTTP بۆ پاراستنی داتاکانمان لە هێرشە گەورەکان.
                  </p>
                </div>
                <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                  <h4 className="text-sm font-bold text-white kurdish-text flex items-center gap-2 text-red-500">
                    <AlertTriangle className="w-4 h-4" />
                    کەی بەکار دەهێنرێت؟
                  </h4>
                  <p className="text-xs text-gray-400 kurdish-text leading-relaxed">
                    تەنها لە کاتی بوونی چالاکی گوماناوی و زۆربوونی ڕێژەی داواکاری نا-یاسایی (DDOS Assault ylan SQL Manipulation) یاخود ئەپدەیتکردنی ناوەکی و ناسەقامگیری سێرڤەر بەکار دەهێنرێت.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FIREWALL LOGS (Failed Login Attempts) */}
          {activeTab === "firewall" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div>
                  <h3 className="text-sm font-bold text-white kurdish-text">هەوڵە جێگوماناوی و شکستخواردووەکانی چوونەژوورەوە</h3>
                  <p className="text-[11px] text-gray-400 kurdish-text mt-1">ئەم خشتەیە دەستبەجێ دوایین هەڵەکانی بەکارهێنەران یاخود هاکران لە پەڕەی ئەدمین تۆمار دەکات.</p>
                </div>
                <div className="relative w-full sm:w-64 max-w-xs">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="بگەڕێ لە ئایپی، شوێن یاخود ناو..."
                    className="w-full pr-9 pl-3 py-1.5 bg-black/40 border border-white/5 focus:border-brand-primary/40 rounded-xl text-xs text-white kurdish-text outline-none"
                  />
                </div>
              </div>

              {filteredFailedLogins.length === 0 ? (
                <div className="p-10 text-center rounded-2xl boder border-white/5 bg-white/5">
                  <ShieldCheck className="w-12 h-12 text-brand-primary mx-auto opacity-55 mb-3" />
                  <p className="text-xs text-gray-400 kurdish-text">هیچ هەوڵێکی گوماناوی تۆمارنەکراوە لەم کاتەدا.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 uppercase tracking-wider text-[10px] border-b border-white/5">
                        <th className="p-4 kurdish-text">ئایپی ئامێر (IP)</th>
                        <th className="p-4 kurdish-text">ناوی داخڵبوو (Attempt Username)</th>
                        <th className="p-4 kurdish-text">شوێنی جوگرافی (Location)</th>
                        <th className="p-4 kurdish-text">کات و مێژوو (Timestamp)</th>
                        <th className="p-4 text-left kurdish-text">دۆخی ئاسایش</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredFailedLogins.map((item, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition duration-150">
                          <td className="p-4 font-mono font-medium text-white">{item.ip}</td>
                          <td className="p-4 text-red-400 font-bold">{item.username}</td>
                          <td className="p-4 flex items-center gap-2 text-gray-300">
                            <span className="text-xs">📍</span>
                            {item.location}
                          </td>
                          <td className="p-4 text-gray-400">{formatDate(item.timestamp)}</td>
                          <td className="p-4 text-left">
                            <span className="px-2 py-1 rounded bg-red-500/10 text-red-500 text-[10px] font-bold">
                              هەوڵی نادروست
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUTO-BAN ENGINE */}
          {activeTab === "autoban" && (
            <div className="space-y-6">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-2">
                <h4 className="text-sm font-bold text-red-400 flex items-center gap-2 kurdish-text">
                  <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                  سیستەمی بلۆکی ئۆتۆماتیکی (Auto-IP Ban Engine)
                </h4>
                <p className="text-xs text-gray-300 kurdish-text leading-relaxed">
                  گەر هەر ئایپییەک هەوڵبدات پینج (٥) جار بە ناوی هەڵە یان پاسوۆردی هەڵە بچێتە بەشی ئەدمینەوە، سێرڤەر بە شێوەیەکی خۆکار ئایپیەکەی بلۆک دەکات و دەیخاتە لیستەی ڕەشەوە بۆ ڕێگری فەرمیی لە هێرشی Brute-Force.
                </p>
              </div>

              {/* Manual IP Ban Input */}
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-end gap-3">
                <div className="flex-1 space-y-2 w-full">
                  <label className="text-xs text-gray-400 kurdish-text">بلۆککردنی ئایپییەک بە شێوەی دەستی (Manual IP Ban)</label>
                  <input
                    type="text"
                    value={manualIpToBan}
                    onChange={(e) => setManualIpToBan(e.target.value)}
                    placeholder="بۆ نموونە: 192.168.1.1 یان 82.203.4.15"
                    className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-brand-primary/40 rounded-xl text-xs text-white kurdish-text outline-none"
                  />
                </div>
                <button
                  onClick={handleBanIp}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold kurdish-text rounded-xl transition duration-200 shrink-0 w-full sm:w-auto"
                >
                  بلۆک کردن
                </button>
              </div>

              {/* Banned IPs list */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-white kurdish-text flex items-center gap-2">
                  <Ban className="w-4 h-4 text-red-500" />
                  ئایپییە بلۆککراوەکان لە نێو سیستمدا ({bannedIps.length})
                </h4>

                {bannedIps.length === 0 ? (
                  <div className="p-10 text-center rounded-2xl border border-white/5 bg-white/5">
                    <p className="text-xs text-gray-400 kurdish-text">هیچ ئایپییەک لە لیستی ڕەشدا نییە لەم کاتەدا.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {bannedIps.map((ip, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                        <span className="font-mono text-xs text-white">{ip}</span>
                        <button
                          onClick={() => handleUnbanIp(ip)}
                          className="px-2.5 py-1 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-black rounded-lg text-[10px] font-bold kurdish-text transition duration-150"
                        >
                          لابردنی بلۆک
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CONTENT FILTER (Banned Keywords) */}
          {activeTab === "filter" && (
            <div className="space-y-6">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2">
                <h4 className="text-sm font-bold text-white kurdish-text">فلتەری ناوەڕۆکی چات</h4>
                <p className="text-xs text-gray-400 kurdish-text mt-1">
                  لێرەدا دەتوانیت کۆمەڵێک وشەی نەشیاو لادەیت یان بنوسیت بۆ مۆدێلەکە کە بە شێوەیەکی خۆکار سانسۆر یاخود لە نێو چاتە گشتییەکەی CinemaChat دەسڕدرێتەوە یان دەبێتە ئەستێرە (***).
                </p>
              </div>

              {/* Add Keyword input */}
              <form onSubmit={handleAddKeyword} className="flex flex-col sm:flex-row items-end gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="flex-1 space-y-2 w-full">
                  <label className="text-xs text-gray-400 kurdish-text font-bold">زیادکردنی وشەی نوێ</label>
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="وشەی قەدەغەکراو لێرە بنووسە..."
                    className="w-full px-4 py-2.5 bg-black/40 border border-white/5 focus:border-brand-primary/40 rounded-xl text-xs text-white kurdish-text outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#00e1ff] hover:bg-[#00c8e0] text-black text-xs font-black kurdish-text rounded-xl transition duration-200 shrink-0 w-full sm:w-auto"
                >
                  تۆمارکردن
                </button>
              </form>

              {/* Keyword List */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-white kurdish-text flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-brand-primary" />
                  وشە بلۆککراوەکانی ئێستا ({bannedKeywords.length})
                </h4>

                {bannedKeywords.length === 0 ? (
                  <div className="p-10 text-center rounded-2xl border border-white/5 bg-white/5">
                    <p className="text-xs text-gray-400 kurdish-text">هیچ وشەیەکی نەشیاو لە فلتەرەکەدا جێگیر نەکراوە.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {bannedKeywords.map((kw, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3  py-1.5 rounded-xl bg-white/5 border border-white/5 hover:border-red-500/30 transition duration-150">
                        <span className="text-xs text-white kurdish-text font-medium">{kw}</span>
                        <button
                          onClick={() => handleDeleteKeyword(kw)}
                          className="text-gray-400 hover:text-red-500 transition duration-150"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: SECURITY AUDIT (History Log) */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div>
                  <h3 className="text-sm font-bold text-white kurdish-text">تۆماری کردارەکانی بەڕێوبەرایەتی (Security History Log)</h3>
                  <p className="text-[11px] text-gray-400 kurdish-text mt-1">چاودێریکردن و تۆمارکردنی هەموو کردارێکی ئەدمین بە شێوەی ڕاستەوخۆ.</p>
                </div>
                <div className="relative w-full sm:w-64 max-w-xs">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="بگەڕێ لە ئەلترۆن، ئەکتەر یان ناونیشان..."
                    className="w-full pr-9 pl-3 py-1.5 bg-black/40 border border-white/5 focus:border-brand-primary/40 rounded-xl text-xs text-white kurdish-text outline-none"
                  />
                </div>
              </div>

              {filteredAuditLogs.length === 0 ? (
                <div className="p-10 text-center rounded-2xl border border-white/5 bg-white/5">
                  <ShieldCheck className="w-12 h-12 text-brand-primary mx-auto opacity-55 mb-3" />
                  <p className="text-xs text-gray-400 kurdish-text">هیچ گۆڕانکارییەک ئەنجام نەدراوە یان هیچ لۆگێک نەدۆزرایەوە.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredAuditLogs.map((log) => (
                    <div key={log.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col sm:flex-row justify-between gap-3 hover:border-white/10 transition duration-200">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                          <span className="text-xs text-[#00e1ff] font-black font-mono">{log.admin}</span>
                          <span className="text-[10px] bg-white/5 rounded px-2 text-gray-400 kurdish-text py-0.5">{log.action}</span>
                        </div>
                        <p className="text-xs text-gray-100 kurdish-text mt-1 font-medium">{log.details}</p>
                      </div>
                      <div className="text-left shrink-0 self-end sm:self-center">
                        <span className="text-[10px] text-gray-500 font-mono block">ID: {log.id}</span>
                        <span className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5 mt-1">
                          <Clock className="w-3 h-3 text-brand-primary" />
                          {formatDate(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
