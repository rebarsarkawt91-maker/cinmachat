import React, { useState, useEffect, useRef } from "react";
import { 
  Database, 
  Download, 
  Upload, 
  Trash2, 
  ShieldAlert, 
  Activity, 
  Clock, 
  RefreshCw, 
  Search, 
  Skull, 
  AlertOctagon, 
  CheckCircle,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SystemErrorLog {
  id: string;
  source: string;
  message: string;
  details: string;
  timestamp: string;
}

interface IntrusionAttempt {
  id: string;
  ip: string;
  location: string;
  path: string;
  payload: string;
  type: string;
  timestamp: string;
}

interface SystemDatabaseAuditModuleProps {
  currentUser: any;
}

export const SystemDatabaseAuditModule: React.FC<SystemDatabaseAuditModuleProps> = ({ currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<"backup" | "errors" | "intrusions" | "snapshots">("backup");
  const [isLoading, setIsLoading] = useState(false);
  const [errorLogs, setErrorLogs] = useState<SystemErrorLog[]>([]);
  const [intrusionLogs, setIntrusionLogs] = useState<IntrusionAttempt[]>([]);
  const [bannedCount, setBannedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: "success" | "error", text: string } | null>(null);

  // Snapshot States
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotDesc, setSnapshotDesc] = useState("");
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isRestoringSnapshotId, setIsRestoringSnapshotId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const adminName = currentUser?.username || "Admin";

  const loadModuleData = async () => {
    setIsLoading(true);
    const safeFetchJson = async (path: string) => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return await res.json();
        }
      } catch (e: any) {
        console.log(`[SystemDatabaseAuditModule] Safe fetch failed for ${path}:`, e.message || e);
      }
      return null;
    };

    try {
      // Load system error logs
      const errData = await safeFetchJson("/api/admin/error-logs");
      if (errData && Array.isArray(errData)) {
        setErrorLogs(errData);
      }

      // Load intrusion attempts
      const intData = await safeFetchJson("/api/admin/intrusion-attempts");
      if (intData && Array.isArray(intData)) {
        setIntrusionLogs(intData);
      }

      // Load health/banned IP counts
      const bannedData = await safeFetchJson("/api/admin/banned-ips");
      if (bannedData && Array.isArray(bannedData)) {
        setBannedCount(bannedData.length);
      }

      // Load app snapshots
      const snapData = await safeFetchJson("/api/admin/snapshots");
      if (snapData && Array.isArray(snapData)) {
        setSnapshots(snapData);
      }
    } catch (err: any) {
      console.log("Info: Error loading auditing module data, likely starting up:", err.message || err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModuleData();
    const interval = setInterval(loadModuleData, 15000);
    return () => clearInterval(interval);
  }, []);

  // 1. BACKUP EXPORT
  const handleExportBackup = () => {
    // We can directly open the export backup endpoint or download
    window.open("/api/admin/db-backup", "_blank");
  };

  // 1. RESTORE IMPORT
  const processRestoreFile = (file: File) => {
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      setRestoreMessage({ type: "error", text: "ڕێگەپێنەدراوە! پێویستە تەنها فایلی جۆری JSON بەکاربهێنیت بۆ هێنانەوەی باکئەپ." });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawText = e.target?.result as string;
        const backupObj = JSON.parse(rawText);

        if (!backupObj.admins || !Array.isArray(backupObj.admins)) {
          setRestoreMessage({ type: "error", text: "ئەم فایلە فۆرماتی فەرمی باکئەپی CinemaChat نییە (کەمبوونی خشتەی سەرەکی)." });
          return;
        }

        const confirmAction = confirm("⚠ سەرنج ڕاکێشە: بە ئەنجامدانی ئەم کردارە، هەموو داتاکانی ئێستای ماڵپەڕ دەسڕێنەوە و داتای نێو فایلەکە دادەنرێت. ئایا دڵنیایت؟");
        if (!confirmAction) return;

        setIsLoading(true);
        const res = await fetch("/api/admin/db-restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupData: backupObj, adminName }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setRestoreMessage({ type: "success", text: "✓ بنکەدراوە بە سەرکەوتوویی لە فایلی باکئەپەکە گەڕێندرایەوە و جێگیرکرا!" });
          loadModuleData();
        } else {
          setRestoreMessage({ type: "error", text: data.error || "کێشەیەک ڕوویدا لە کاتی ناردنی داتاکان." });
        }
      } catch (err: any) {
        setRestoreMessage({ type: "error", text: `فایلەکە تێکچووە یان فۆرماتی دروست نییە: ${err.message}` });
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processRestoreFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processRestoreFile(e.dataTransfer.files[0]);
    }
  };

  // 2. Clear System Error logs
  const handleClearErrorLogs = async () => {
    if (!confirm("⚠️ دڵنیای لە پاککردنەوەی هەموو تۆمارەکانی کێشەکانی سیستەم؟")) return;
    try {
      const res = await fetch("/api/admin/clear-error-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminName }),
      });
      if (res.ok) {
        setErrorLogs([]);
        loadModuleData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 3. Clear Intrusion Logs
  const handleClearIntrusionLogs = async () => {
    if (!confirm("⚠️ دڵنیای لە پاککردنەوەی هەموو مێژووی چاودێری هێرشە گوماناوییەکان؟")) return;
    try {
      const res = await fetch("/api/admin/clear-intrusion-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminName }),
      });
      if (res.ok) {
        setIntrusionLogs([]);
        loadModuleData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // APP.TSX SNAPSHOT HANDLERS
  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotName.trim()) return;

    setIsCreatingSnapshot(true);
    setRestoreMessage(null);
    try {
      const res = await fetch("/api/admin/snapshots/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: snapshotName,
          description: snapshotDesc,
          adminName
        })
      });
      const data = await res.json();
      if (res.ok && data.snapshots) {
        setSnapshots(data.snapshots);
        setSnapshotName("");
        setSnapshotDesc("");
        setRestoreMessage({ type: "success", text: "✓ کۆپی یەدەگی App.tsx بە سەرکەوتوویی دروستکرا!" });
      } else {
        setRestoreMessage({ type: "error", text: data.error || "کێشەیەک ڕوویدا لە کاتی دروستکردنی کۆپی یەدەگ." });
      }
    } catch (err: any) {
      setRestoreMessage({ type: "error", text: `کێشە: ${err.message}` });
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    const confirmRestore = confirm("⚠️ ئاگاداری گرنگ! بە ئەنجامدانی ئەم کردارە، فایلی سەرەکی App.tsx دەگەڕێندرێتەوە بۆ ساتی ئەم کۆپییە یەدەگە. ئایا تەواو دڵنیایت لە ئەنجامدانی ئەم کردارە گەورەیە؟");
    if (!confirmRestore) return;

    setIsRestoringSnapshotId(snapshotId);
    setRestoreMessage(null);
    try {
      const res = await fetch("/api/admin/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, adminName })
      });
      const data = await res.json();
      if (res.ok) {
        setRestoreMessage({ type: "success", text: "✓ کۆپی یەدەگ بە سەرکەوتوویی جێگیرکرایەوە! ڕاژەکە دەستپێدەکاتەوە، لەوانەیە کەمێک پێویست بکات تاوەکو زانیارییەکان نوێ ببنەوە." });
        loadModuleData();
      } else {
        setRestoreMessage({ type: "error", text: data.error || "کێشەیەک ڕوویدا لە کاتی گەڕاندنەوەی سەرچاوە." });
      }
    } catch (err: any) {
      setRestoreMessage({ type: "error", text: `شکست: ${err.message}` });
    } finally {
      setIsRestoringSnapshotId(null);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm("⚠️ ئایا دڵنیای لە سڕینەوەی ئەم کۆپییە یەدەگەی App.tsx؟")) return;

    setRestoreMessage(null);
    try {
      const res = await fetch("/api/admin/snapshots/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, adminName })
      });
      const data = await res.json();
      if (res.ok && data.snapshots) {
        setSnapshots(data.snapshots);
        setRestoreMessage({ type: "success", text: "✓ کۆپی یەدەگ بە سەرکەوتوویی سڕایەوە." });
      } else {
        setRestoreMessage({ type: "error", text: data.error || "کێشەیەک ڕوویدا" });
      }
    } catch (err: any) {
      setRestoreMessage({ type: "error", text: err.message });
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

  // Filters
  const filteredErrors = errorLogs.filter(e => 
    e.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.details.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredIntrusions = intrusionLogs.filter(i => 
    i.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.payload.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Security levels logic
  const getThreatLevel = (attempts: number) => {
    if (attempts === 0) return { label: "پارێزراو", color: "text-green-400 bg-green-500/10", border: "border-green-500/20" };
    if (attempts === 1) return { label: "ئاسایی", color: "text-yellow-400 bg-yellow-500/10", border: "border-yellow-500/20" };
    if (attempts === 2) return { label: "مەترسی ناوەنجی", color: "text-orange-400 bg-orange-500/10", border: "border-orange-500/20" };
    return { label: "مەترسی زۆر بەرز", color: "text-red-400 bg-red-500/10 animate-pulse", border: "border-red-500/30" };
  };

  const activeThreatStatus = getThreatLevel(intrusionLogs.length > 5 ? 3 : intrusionLogs.length > 1 ? 2 : intrusionLogs.length);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Module Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-br from-[#0b0c10] to-[#12141c] border border-white/5 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 h-32 w-32 bg-[#00e1ff]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-[#00e1ff]/10 rounded-2xl flex items-center justify-center text-[#00e1ff] border border-[#00e1ff]/20 shadow-lg shadow-[#00e1ff]/10">
            <Database className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">مۆدیۆڵ ١٢: ڕاپۆرت و داتابەیسی گشتی سیستەم</h2>
            <p className="text-xs text-gray-400 kurdish-text mt-1">باكئەپ و هێنانەوەی سەرانسەری، تۆمارکردنی کێشە کاترا بە کاتراکان، و چاودێریکردنی وردی هێرشە نایاساییەکان.</p>
          </div>
        </div>

        <button 
          onClick={loadModuleData}
          disabled={isLoading}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/5 flex items-center gap-2 text-xs font-semibold self-start lg:self-auto transition duration-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          نوێکردنەوەی ناواخنەکە
        </button>
      </div>

      {/* Statistics Indicator Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-gray-400 kurdish-text block">پارێزبەندی گشتی</span>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-bold inline-block border ${activeThreatStatus.color} ${activeThreatStatus.border} kurdish-text`}>
              {activeThreatStatus.label}
            </span>
          </div>
          <ShieldAlert className="w-9 h-9 text-[#00e1ff] opacity-40 shrink-0" />
        </div>

        <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-gray-400 kurdish-text block">هەوڵەکانی هاک</span>
            <span className="text-2xl font-black text-red-500 font-mono tracking-tight">{intrusionLogs.length}</span>
          </div>
          <Skull className="w-9 h-9 text-red-500 opacity-45 shrink-0" />
        </div>

        <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-gray-400 kurdish-text block">کێشە تۆمارکراوەکان</span>
            <span className="text-2xl font-black text-yellow-500 font-mono tracking-tight">{errorLogs.length}</span>
          </div>
          <Activity className="w-9 h-9 text-yellow-500 opacity-45 shrink-0" />
        </div>

        <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-gray-400 kurdish-text block">ئایپییە بلۆکراوەکان</span>
            <span className="text-2xl font-black text-gray-300 font-mono tracking-tight">{bannedCount}</span>
          </div>
          <AlertOctagon className="w-9 h-9 text-gray-400 opacity-45 shrink-0" />
        </div>
      </div>

      {/* Module Internal Sub Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[#0f1013]/50 border border-white/5 rounded-2xl">
        <button
          onClick={() => { setActiveSubTab("backup"); setSearchQuery(""); setRestoreMessage(null); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeSubTab === "backup" 
              ? "bg-[#00e1ff] text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          باکئەپ و هێنانەوەی پشتیوانی (Backup/Restore)
        </button>
        <button
          onClick={() => { setActiveSubTab("errors"); setSearchQuery(""); setRestoreMessage(null); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeSubTab === "errors" 
              ? "bg-[#00e1ff] text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          هەڵەکانی سیستەم (Error Logs - {errorLogs.length})
        </button>
        <button
          onClick={() => { setActiveSubTab("intrusions"); setSearchQuery(""); setRestoreMessage(null); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeSubTab === "intrusions" 
              ? "bg-[#00e1ff] text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          چاودێری هێرشبردن (Intrusion Tracker - {intrusionLogs.length})
        </button>
        <button
          onClick={() => { setActiveSubTab("snapshots"); setSearchQuery(""); setRestoreMessage(null); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeSubTab === "snapshots" 
              ? "bg-[#00e1ff] text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          کۆپی یەدەگ و گەڕاندنەوەی سەرەکی (App Snapshots & Rollback)
        </button>
      </div>

      {/* Tab Area Container */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 shadow-xl"
        >
          {/* SUBTAB 1: BACKUP & RESTORE */}
          {activeSubTab === "backup" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. Export Sidecard */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5 flex flex-col justify-between space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-base font-black text-white kurdish-text flex items-center gap-2">
                      <Download className="w-5 h-5 text-[#00e1ff]" />
                      هەناردەکردنی بەڵگەکانی بنکەدراوە (Export XML/JSON Database)
                    </h3>
                    <p className="text-xs text-gray-400 kurdish-text leading-relaxed">
                      دەتوانیت لە ڕێگەی ئەم کردارەوە تەواوی داتای ئێستای ماڵپەڕ لە نێویدا ئەندامان، فیلمە پۆستکراوەکان، لیستی ڕەش، قەدەغەکراوەکان و ڕێکخستنی سەرەکی بە شێوەی فایلی یەکگرتووی پشتیوانی هەناردە بکەیت بۆ پاراستنی نەتەوەیی یان فریاگوزاری خێرا.
                    </p>
                  </div>
                  <button 
                    onClick={handleExportBackup}
                    className="w-full sm:w-auto py-3.5 px-6 rounded-xl bg-[#00e1ff] hover:bg-[#00bfd6] text-black font-black text-xs kurdish-text flex items-center justify-center gap-2 transition duration-250 self-start shadow-md shadow-[#00e1ff]/5"
                  >
                    <Download className="w-4 h-4" />
                    دروستکردن و داگرتنی بەڵگەنامە (.JSON)
                  </button>
                </div>

                {/* 2. Drag & Drop Restore Sidecard */}
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`p-6 rounded-2xl border flex flex-col items-center justify-center text-center transition duration-250 cursor-pointer text-xs relative ${
                    isDragging 
                      ? "border-[#00e1ff] bg-[#00e1ff]/5" 
                      : "border-white/5 bg-white/5 hover:bg-white/10"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".json"
                    className="hidden" 
                  />
                  <Upload className="w-10 h-10 text-gray-400 mb-4 animate-bounce" />
                  <h3 className="text-sm font-black text-white kurdish-text mb-1">هێنانەوەی پشتیوانی (Restore Database Backup)</h3>
                  <p className="text-xs text-gray-400 kurdish-text max-w-sm leading-relaxed mb-4">
                    فایلی پشتیوانی (JSON) پێشتر داگیراو بۆ لێرە ڕابکێشە یان کلیک لێرە بکە بۆ هەڵبژاردن لە نێو کۆمپیوتەرەکەتدا بۆ گەڕاندنەوەی گشتی.
                  </p>
                  <span className="text-[10px] text-gray-500 font-mono">SUPPORTS: cinemachat-db-backup.json</span>
                </div>
              </div>

              {restoreMessage && (
                <div className={`p-4 rounded-xl text-xs kurdish-text font-semibold flex items-center gap-2 border ${
                  restoreMessage.type === "success" 
                    ? "bg-green-500/15 text-green-400 border-green-500/20" 
                    : "bg-red-500/15 text-red-400 border-red-500/20"
                }`}>
                  {restoreMessage.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertOctagon className="w-4 h-4" />}
                  {restoreMessage.text}
                </div>
              )}

              {/* Restore Policy Safety Banner */}
              <div className="p-4 bg-yellow-500/5 border border-yellow-500/15 rounded-2xl">
                <h4 className="text-xs font-bold text-yellow-400 kurdish-text flex items-center gap-2 mb-1">
                  <AlertOctagon className="w-3.5 h-3.5 text-yellow-500" />
                  تێبینی گرنگی پاراستنی ناوەڕۆک
                </h4>
                <p className="text-[11px] text-gray-400 kurdish-text leading-relaxed">
                  گەر هێنانەوەی باکئەپەکە کێشەی بۆ بەشی پێوەستبوونی بەکارهێنەران دروستکرد، دەتوانیت بە سڕینەوەی سێرڤەر و نوێکردنەوەی خستنەگەر دووبارە دەستپێبکەیتەوە. باکئەپیش مۆرە دیجیتاڵییەکەی ئەدمین دەپارێزێت بۆ ئەوەی ناچار نەبیت پاسوۆرد بگۆڕیتەوە.
                </p>
              </div>
            </div>
          )}

          {/* SUBTAB 2: SYSTEM ERROR LOGS */}
          {activeSubTab === "errors" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                    <Activity className="w-4 h-4 text-yellow-400" />
                    تۆماری ئاستەنگ و کێشەکانی ناوان و ڕووکاری بەکارهێنەر
                  </h3>
                  <p className="text-xs text-gray-400 kurdish-text">لێرەدا هەموو جۆرە داواکارییەکی نادروست و فێڵاوی بەکارهێنەران لەگەڵ کاتەکەی پۆست دەکرێت.</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="relative w-full sm:w-48">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="بگەڕێ لە لۆگەکان..."
                      className="w-full pr-9 pl-3 py-1.5 bg-black/40 border border-white/5 focus:border-[#00e1ff]/40 rounded-xl text-xs text-white kurdish-text outline-none"
                    />
                  </div>
                  {errorLogs.length > 0 && (
                    <button
                      onClick={handleClearErrorLogs}
                      className="p-2 py-1.5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-xl text-xs font-black kurdish-text transition duration-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {filteredErrors.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-green-500 opacity-60 mb-2" />
                  <p className="text-xs text-gray-400 kurdish-text">✓ هیچ کۆدەهەڵەیەکی سیستەم ڕووینەداوە لە لۆگی فەرمیدا.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 uppercase text-[10px] border-b border-white/5">
                        <th className="p-4 kurdish-text">سەرچاوە (Source Route)</th>
                        <th className="p-4 kurdish-text">پەیامی هەڵە (Error Event)</th>
                        <th className="p-4 kurdish-text">زانیاری زیاتر (Details)</th>
                        <th className="p-4 text-left kurdish-text">ساتی ڕووداو (Timestamp)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredErrors.map((err) => (
                        <tr key={err.id} className="hover:bg-white/5 transition duration-155">
                          <td className="p-4 font-mono font-bold text-[#00e1ff] text-[11px]">{err.source}</td>
                          <td className="p-4 text-yellow-500 font-bold max-w-[200px] truncate">{err.message}</td>
                          <td className="p-4 text-gray-300 font-mono text-[10px]">{err.details}</td>
                          <td className="p-4 text-left text-gray-400 text-[11px] font-mono">{formatDate(err.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 3: INTRUSION TRACKER */}
          {activeSubTab === "intrusions" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                    <Skull className="w-4 h-4 text-red-500 animate-pulse" />
                    تۆماری هەوڵەکانی هێرشبردن و دزەکردن (Intrusion Threat Monitor)
                  </h3>
                  <p className="text-xs text-gray-400 kurdish-text">ڕێگری کاتی ڕاستەقینە لە ترۆجان، سکریپتە تێکدەرەکان (XSS)، و فلتەرکاری تەوەری کۆدەکانی هاک (SQLi).</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="relative w-full sm:w-48">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="بگەڕێ لە هەڕەشەکان..."
                      className="w-full pr-9 pl-3 py-1.5 bg-black/40 border border-white/5 focus:border-red-500/40 rounded-xl text-xs text-white kurdish-text outline-none"
                    />
                  </div>
                  {intrusionLogs.length > 0 && (
                    <button
                      onClick={handleClearIntrusionLogs}
                      className="p-2 py-1.5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-xl text-xs font-black kurdish-text transition duration-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {filteredIntrusions.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-[#22c55e] opacity-65 mb-2" />
                  <p className="text-xs text-gray-400 kurdish-text">✓ فایەروۆڵی سەرەکی دەڵێت: هیچ نیشانەیەکی دەرەکی بۆ هێرشکردن تۆمار نەکراوە.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 uppercase text-[10px] border-b border-white/5">
                        <th className="p-4 kurdish-text">ئایپی ئامێر / شوێن (IP Location)</th>
                        <th className="p-4 kurdish-text">داواکاری بەستەر (Target Path)</th>
                        <th className="p-4 kurdish-text">بەربەستی هۆکار (Threat Pattern)</th>
                        <th className="p-4 kurdish-text">جۆر (Severity Info)</th>
                        <th className="p-4 text-left kurdish-text">ساتی تۆمارکردن (Timestamp)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredIntrusions.map((log) => (
                        <tr key={log.id} className="hover:bg-red-500/5 transition duration-150">
                          <td className="p-4 font-mono text-white text-[11px] block sm:table-cell">
                            {log.ip}
                            <span className="block text-[10px] text-gray-400 font-sans kurdish-text">📍 {log.location}</span>
                          </td>
                          <td className="p-4 text-gray-300 font-mono text-[11px]">{log.path}</td>
                          <td className="p-4 font-mono text-xs text-red-400 font-bold max-w-[220px] truncate">{log.payload}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/25 kurdish-text">
                              {log.type}
                            </span>
                          </td>
                          <td className="p-4 text-left text-gray-400 text-[11px] font-mono">{formatDate(log.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 4: APP ROLLBACK & SNAPSHOTS */}
          {activeSubTab === "snapshots" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Create Snapshot Form */}
                <div className="lg:col-span-1 p-5 rounded-2xl bg-white/5 border border-white/5 space-y-4 h-fit">
                  <div className="flex items-center gap-2 text-[#00e1ff] mb-1">
                    <Clock className="w-5 h-5 animate-pulse" />
                    <h3 className="text-sm font-bold kurdish-text">دروستکردنی کۆپی یەدەگی نوێ</h3>
                  </div>
                  <p className="text-[11px] text-gray-400 kurdish-text leading-relaxed">
                    با شێوەیەکی خۆکارانە، دۆخی بێ کێشە و جێگیری فایلی سەرەکی <code className="font-mono text-white px-1 bg-black/40 rounded">App.tsx</code> بپارێزە، تاوەکو لە ئەگەری هەر تێکچوون یان کێشەیەکی نوێدا بتوانیت بە یەک کلیک بیگەڕێنیتەوە.
                  </p>
                  <form onSubmit={handleCreateSnapshot} className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 kurdish-text font-bold">ناوی کۆپی یەدەگ (Snapshot Name)</label>
                      <input
                        type="text"
                        required
                        value={snapshotName}
                        onChange={(e) => setSnapshotName(e.target.value)}
                        placeholder="بۆ نموونە: پێش گۆڕینی لۆگۆ، دۆخی جێگیری ئێستا"
                        className="w-full px-3 py-2 bg-black/40 border border-white/5 focus:border-[#00e1ff]/40 rounded-xl text-xs text-white kurdish-text outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 kurdish-text font-bold">تێبینی زیاتر / کورتەی کار (Description)</label>
                      <textarea
                        value={snapshotDesc}
                        onChange={(e) => setSnapshotDesc(e.target.value)}
                        placeholder="داڕشتنێکی بچووک لەسەر دۆخی جێگیرییەکەی..."
                        rows={3}
                        className="w-full px-3 py-2 bg-black/40 border border-white/5 focus:border-[#00e1ff]/40 rounded-xl text-xs text-white kurdish-text outline-none resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isCreatingSnapshot}
                      className="w-full py-2.5 bg-[#00e1ff] hover:bg-[#00bfd6] text-black font-bold text-xs rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#00e1ff]/10 disabled:opacity-50"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {isCreatingSnapshot ? "خەریکە تۆمار دەکرێت..." : "تۆمارکردنی کۆپی ئێستا"}
                    </button>
                  </form>
                </div>

                {/* Snapshots List View */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white kurdish-text flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#00e1ff]" />
                        لیستی کۆپییە یەدەگەکانی پێشووی ئەپ (Saved Snapshots)
                      </h4>
                      <p className="text-[10px] text-gray-400 kurdish-text mt-0.5">ژیری "Self-Healing": گەر فایلی سەرەکی داڕما، دەتوانیت لێرەوە بە دەستبەجێ بیگەڕێنیتەوە.</p>
                    </div>
                  </div>

                  {snapshots.length === 0 ? (
                    <div className="p-12 text-center rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center justify-center">
                      <Clock className="w-10 h-10 text-gray-500 mb-2" />
                      <p className="text-xs text-gray-400 kurdish-text">تائێستا هیچ کۆپیەکی یەدەگی ناوخۆیی دروست نەکراوە. لەوانەیە بێت خۆکار یەکەم دانە بکەیت.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                      {snapshots.map((snap: any) => (
                        <div key={snap.id} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1.5 max-w-md">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-white kurdish-text">{snap.name}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/5 font-mono text-gray-400 shrink-0">{snap.size}</span>
                              {snap.adminName === "SYSTEM_AUTO" && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 font-bold text-amber-500 kurdish-text shrink-0">پاراستنی خۆکار</span>
                              )}
                            </div>
                            {snap.description && (
                              <p className="text-xs text-gray-400 kurdish-text leading-relaxed">{snap.description}</p>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 font-mono">
                              <span>نووسەر: <span className="text-gray-300 font-sans font-semibold">{snap.adminName}</span></span>
                              <span>ساتی تۆمار: <span className="text-gray-300">{formatDate(snap.createdAt)}</span></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                            <button
                              onClick={() => handleRestoreSnapshot(snap.id)}
                              disabled={isRestoringSnapshotId !== null}
                              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-black rounded-lg text-[11px] font-bold kurdish-text transition duration-200 flex items-center gap-1 shadow-lg shadow-green-500/10 cursor-pointer"
                            >
                              <RefreshCw className={`w-3 h-3 ${isRestoringSnapshotId === snap.id ? "animate-spin" : ""}`} />
                              {isRestoringSnapshotId === snap.id ? "خەریکە دەگەڕێنرێتەوە..." : "گەڕانەوە (Rollback)"}
                            </button>
                            <button
                              onClick={() => handleDeleteSnapshot(snap.id)}
                              className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition duration-200"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {restoreMessage && (
                <div className={`p-4 rounded-xl text-xs kurdish-text font-semibold flex items-center gap-2 border ${
                  restoreMessage.type === "success" 
                    ? "bg-green-500/15 text-green-400 border-green-500/20" 
                    : "bg-red-500/15 text-red-400 border-red-500/20"
                }`}>
                  {restoreMessage.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertOctagon className="w-4 h-4" />}
                  {restoreMessage.text}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
