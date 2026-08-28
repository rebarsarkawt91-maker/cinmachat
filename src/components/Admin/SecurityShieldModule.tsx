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
  Shield,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import {
  db,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  deleteDoc,
} from "../../lib/firebase";

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

// Unblock requests are written by blocked clients DIRECTLY to the Firestore
// `unblockRequests` collection (they cannot rely on reaching the app server),
// so this interface mirrors that document shape. Timestamps arrive as Firestore
// Timestamp objects and are normalized to ISO strings when mapping snapshots.
interface UnblockRequest {
  id: string;
  name: string;
  phone: string;
  ip?: string;
  deviceId?: string;
  device?: string;
  browser?: string;
  location?: string;
  blockedAt?: string;
  status?: string; // 'pending' | 'resolved' | 'deleted' | 'archived'
  resolvedBy?: string; // archive entries only (server-side history)
  resolvedAt?: string; // archive entries only
  requestedAt?: string;
  timestamp: string;
}

interface SecurityShieldModuleProps {
  currentUser: any;
}

export const SecurityShieldModule: React.FC<SecurityShieldModuleProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<"gateway" | "firewall" | "autoban" | "filter" | "audit" | "unblock">("gateway");
  const [isLoading, setIsLoading] = useState(false);
  const [emergencyLock, setEmergencyLock] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState<FailedLogin[]>([]);
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [bannedKeywords, setBannedKeywords] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [unblockRequests, setUnblockRequests] = useState<UnblockRequest[]>([]);
  const [unblockArchive, setUnblockArchive] = useState<UnblockRequest[]>([]);
  // Approve-in-flight id (disables the button + shows a spinner so the same
  // request cannot be double-submitted) and the last action result message.
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [unblockMessage, setUnblockMessage] = useState<{ ok: boolean; msg: string } | null>(null);
  
  // Inputs
  const [manualIpToBan, setManualIpToBan] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [filterQuery, setFilterQuery] = useState("");

  const adminName = currentUser?.username || "Admin";
  // Admin endpoints on the server require the requester name; send it as a header
  const adminHeaders = { "x-admin-username": adminName };

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load emergency lock status
      const lockRes = await fetch("/api/admin/emergency-lock", { headers: adminHeaders });
      const lockData = await lockRes.json();
      setEmergencyLock(!!lockData.emergencyLock);

      // Load failed log attempts
      const attemptsRes = await fetch("/api/admin/firewall-logs", { headers: adminHeaders });
      const attemptsData = await attemptsRes.json();
      if (Array.isArray(attemptsData)) setFailedAttempts(attemptsData);

      // Load banned IPs
      const ipsRes = await fetch("/api/admin/banned-ips", { headers: adminHeaders });
      const ipsData = await ipsRes.json();
      if (Array.isArray(ipsData)) setBannedIps(ipsData);

      // Load banned keywords
      const kwRes = await fetch("/api/admin/banned-keywords", { headers: adminHeaders });
      const kwData = await kwRes.json();
      if (Array.isArray(kwData)) setBannedKeywords(kwData);

      // Load audit logs
      const auditRes = await fetch("/api/admin/audit-logs", { headers: adminHeaders });
      const auditData = await auditRes.json();
      if (Array.isArray(auditData)) setAuditLogs(auditData);

      // Load unblock request archive history (resolved/deleted/cleared)
      const ubqArchRes = await fetch("/api/admin/unblock-requests/archive", { headers: adminHeaders });
      const ubqArchData = await ubqArchRes.json();
      if (Array.isArray(ubqArchData)) setUnblockArchive(ubqArchData);

    } catch (err) {
      console.error("Error loading security module data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Real-time Firestore listener for the unblock-request queue. Requests are
  // written by blocked clients straight into `unblockRequests`, so onSnapshot
  // is the only reliable source — it updates instantly and keeps the tab
  // badge count accurate without waiting for the REST poll.
  useEffect(() => {
    const q = query(
      collection(db, "unblockRequests"),
      orderBy("timestamp", "desc"),
      limit(200),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setUnblockRequests(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, any>;
            // Normalize Firestore Timestamps to ISO strings so every render
            // path (formatDate, Excel export labels) receives plain strings.
            const toIso = (v: any): string | undefined => {
              if (!v) return undefined;
              if (typeof v === "string") return v;
              if (typeof v.toDate === "function") {
                try {
                  return v.toDate().toISOString();
                } catch {
                  return undefined;
                }
              }
              if (typeof v.seconds === "number") {
                return new Date(v.seconds * 1000).toISOString();
              }
              return String(v);
            };
            return {
              id: d.id,
              name: data.name ?? "",
              phone: data.phone ?? "",
              ip: data.ip || "",
              deviceId: data.deviceId || "",
              device: data.device || "",
              browser: data.browser || "",
              location: data.location || "",
              blockedAt: toIso(data.blockedAt),
              requestedAt: toIso(data.requestedAt),
              status: data.status || "pending",
              timestamp: toIso(data.timestamp) || toIso(data.requestedAt) || new Date().toISOString(),
            } as UnblockRequest;
          }),
        );
      },
      (err) => console.warn("unblockRequests listener:", err),
    );
    return () => unsub();
  }, []);

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

  // Remove a request document from the Firestore queue (reviewed & dismissed
  // without unblocking anyone).
  const handleDeleteUnblockRequest = async (id: string) => {
    try {
      await deleteDoc(doc(db, "unblockRequests", id));
      loadData(); // refresh archive/history panels
    } catch (err) {
      console.error("Failed to delete unblock request:", err);
    }
  };

  const handleClearUnblockRequests = async () => {
    if (!confirm("ئایا دڵنیایت لە سڕینەوەی هەموو داواکارییەکانی لابردنی بلۆک؟")) return;
    try {
      // writeBatch isn't part of the shared firebase lib export, and queues are
      // capped at 200 — sequential deletes are simple, safe and fast enough.
      await Promise.all(
        unblockRequests.map((r) => deleteDoc(doc(db, "unblockRequests", r.id))),
      );
      loadData();
    } catch (err) {
      console.error("Failed to clear unblock requests:", err);
    }
  };

  // Unblock & remove: instantly unbans the requester's device fingerprint and
  // IP via the existing server endpoints — the unban-ip call is what actually
  // removes the IP from the banned list — then clears the Firestore request
  // document in one admin action. The document is only deleted AFTER every
  // unban call returned success, so a failed request stays in the queue and can
  // be retried instead of silently vanishing while the user stays banned.
  const handleResolveUnblockRequest = async (req: UnblockRequest) => {
    if (resolvingId) return; // one approve at a time
    if (!confirm("ئایا دڵنیایت لە کردنەوەی بلۆکی ئەم بەکارهێنەرە و سڕینەوەی داواکارییەکەی؟")) return;
    setResolvingId(req.id);
    setUnblockMessage(null);
    try {
      const jsonBody = { "Content-Type": "application/json" };

      // 1) Lift the device-fingerprint ban (the primary auto-ban target).
      if (req.deviceId) {
        const res = await fetch("/api/admin/unban-device", {
          method: "POST",
          headers: { ...jsonBody, ...adminHeaders },
          body: JSON.stringify({ deviceId: req.deviceId, adminName }),
        });
        if (!res.ok) throw new Error(`unban-device failed (${res.status})`);
      }

      // 2) Lift the IP ban. The endpoint echoes the fresh banned list, so the
      //    Auto-Ban tab reflects the removal immediately, not only after the
      //    next 15s poll.
      if (req.ip) {
        const res = await fetch("/api/admin/unban-ip", {
          method: "POST",
          headers: { ...jsonBody, ...adminHeaders },
          body: JSON.stringify({ ip: req.ip, adminName }),
        });
        if (!res.ok) throw new Error(`unban-ip failed (${res.status})`);
        const data = await res.json();
        if (Array.isArray(data?.bannedIps)) {
          setBannedIps(data.bannedIps);
        } else {
          // Belt-and-suspenders: mirror the removal locally if the payload
          // unexpectedly lacks the list.
          setBannedIps((prev) => prev.filter((ip) => ip !== req.ip));
        }
      }

      // 3) Only once every unban succeeded, remove the Firestore request —
      //    onSnapshot then updates the queue and its tab badge in real time.
      await deleteDoc(doc(db, "unblockRequests", req.id));
      setUnblockMessage({ ok: true, msg: `✓ بلۆک لابرا بۆ ${req.name} (${req.phone}) — داواکارییەکە سڕایەوە.` });
    } catch (err) {
      console.error("Failed to resolve unblock request:", err);
      setUnblockMessage({ ok: false, msg: "هەڵەیەک ڕوویدا لە لابردنی بلۆک — داواکارییەکە ماوەتەوە. تکایە دووبارە هەوڵبدەوە." });
    } finally {
      setResolvingId(null);
      loadData(); // refresh the archive + banned-IP health state
    }
  };

  // Download helper for Excel reports (server returns the .xlsx file)
  const downloadExport = (path: string) => {
    window.open(`/api/admin/export/${path}?adminName=${encodeURIComponent(adminName)}`, "_blank");
  };

  // Export the LIVE Firestore-backed unblock-request queue (same source the
  // onSnapshot listener renders), so the spreadsheet always matches the list
  // and count shown in this tab.
  const exportUnblockRequests = () => {
    const rows = unblockRequests.map((r, idx) => ({
      "#": idx + 1,
      "ناو (Name)": r.name || "",
      "ژمارەی مۆبایل (Phone)": r.phone || "",
      "IP ئایپی": r.ip || "",
      "وێبگەڕ (Browser)": r.browser || "",
      "ناونیشان (Location)": r.location || "",
      "کاتی بلۆک (Blocked At)": r.blockedAt ? new Date(r.blockedAt).toLocaleString("ku-IQ") : "نەزانراو",
      "کاتی داواکاری (Requested At)": r.timestamp ? new Date(r.timestamp).toLocaleString("ku-IQ") : "نەزانراو",
      "ئامێر/بەشێوە (Device)": r.device || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [6, 18, 18, 18, 18, 22, 28, 28, 45].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Unblock Requests");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const url = URL.createObjectURL(
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "unblock-requests.xlsx";
    a.click();
    URL.revokeObjectURL(url);
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
        <button
          onClick={() => { setActiveTab("unblock"); setFilterQuery(""); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold kurdish-text transition duration-200 flex items-center gap-2 ${
            activeTab === "unblock" 
              ? "bg-brand-primary text-black" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <User className="w-3.5 h-3.5" />
          داواکاری لابردنی بلۆک ({unblockRequests.length})
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-white kurdish-text flex items-center gap-2">
                    <Ban className="w-4 h-4 text-red-500" />
                    ئایپییە بلۆککراوەکان لە نێو سیستمدا ({bannedIps.length})
                  </h4>
                  <button
                    onClick={() => downloadExport("blocked-users/xlsx")}
                    disabled={bannedIps.length === 0}
                    className="px-3 py-2 bg-green-500/10 hover:bg-green-600 text-green-500 hover:text-white rounded-xl text-[11px] font-bold kurdish-text flex items-center gap-2 transition duration-200 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    هەناردەی بلۆککراوەکان (Excel)
                  </button>
                </div>

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

          {/* TAB 6: UNBLOCK REQUESTS (Blocked users asking to be unblocked) */}
          {activeTab === "unblock" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div>
                  <h3 className="text-sm font-bold text-white kurdish-text">داواکارییەکانی لابردنی بلۆک</h3>
                  <p className="text-[11px] text-gray-400 kurdish-text mt-1">بەکارهێنەرانی بلۆککراو بە ناو و ژمارەی مۆبایل داوا دەکەن بلۆکەکەیان لاببرێت. بەرپرسیارە لە وەڵامدانەوەیان.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    onClick={exportUnblockRequests}
                    disabled={unblockRequests.length === 0}
                    className="px-3 py-2 bg-green-500/10 hover:bg-green-600 text-green-500 hover:text-white rounded-xl text-[11px] font-bold kurdish-text flex items-center gap-2 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    هەناردە (Excel)
                  </button>
                  {unblockRequests.length > 0 && (
                    <button
                      onClick={handleClearUnblockRequests}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white rounded-xl text-[11px] font-bold kurdish-text flex items-center gap-2 transition duration-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      سڕینەوەی هەموو ({unblockRequests.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Approve / unblock action feedback (success or retry error) */}
              {unblockMessage && (
                <div className={`p-3 rounded-xl border text-xs font-bold kurdish-text flex items-center gap-2 ${
                  unblockMessage.ok
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}>
                  {unblockMessage.ok ? <ShieldCheck className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  {unblockMessage.msg}
                </div>
              )}

              {unblockRequests.length === 0 ? (
                <div className="p-10 text-center rounded-2xl border border-white/5 bg-white/5">
                  <User className="w-12 h-12 text-brand-primary mx-auto opacity-55 mb-3" />
                  <p className="text-xs text-gray-400 kurdish-text">هیچ داواکارییەک لەم کاتەدا نەهاتووە.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {unblockRequests.map((reqItem) => (
                    <div key={reqItem.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col sm:flex-row justify-between gap-3 hover:border-white/10 transition duration-200">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                            <User className="w-4 h-4" />
                          </span>
                          <span className="text-sm font-black text-white kurdish-text truncate">{reqItem.name}</span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-black kurdish-text shrink-0">
                            چاوەڕوانە
                          </span>
                        </div>
                        <p className="text-xs text-gray-200 flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500 kurdish-text">مۆبایل:</span>
                          <span className="font-mono" dir="ltr">{reqItem.phone}</span>
                        </p>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500 kurdish-text">ئایپی بلۆککراو:</span>
                          <span className="font-mono" dir="ltr">{reqItem.ip || "نەزانراو"}</span>
                        </p>
                        {(reqItem.browser || reqItem.location) && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1.5 flex-wrap">
                            {reqItem.browser && (
                              <span className="font-mono" dir="ltr">{reqItem.browser}</span>
                            )}
                            {reqItem.browser && reqItem.location && <span className="text-gray-600">•</span>}
                            {reqItem.location && (
                              <span dir="ltr">{reqItem.location}</span>
                            )}
                          </p>
                        )}
                        {reqItem.device && (
                          <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
                            <span className="text-[10px] text-gray-500 kurdish-text mt-0.5">ئامێر/دەزیڵ:</span>
                            <span className="break-all leading-snug" dir="ltr">{reqItem.device}</span>
                          </p>
                        )}
                        <span className="text-[11px] text-gray-500 flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-red-400" />
                          بلۆککرا لە: {formatDate(reqItem.blockedAt || reqItem.timestamp)}
                        </span>
                        <span className="text-[11px] text-gray-500 flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-brand-primary" />
                          داواکاری لە: {formatDate(reqItem.timestamp)}
                        </span>
                      </div>
                      <div className="text-left shrink-0 self-end sm:self-center flex sm:flex-col gap-2">
                        <button
                          onClick={() => handleResolveUnblockRequest(reqItem)}
                          disabled={resolvingId === reqItem.id}
                          className="px-3 py-1.5 bg-green-500/10 hover:bg-green-600 text-green-500 hover:text-white rounded-lg text-[10px] font-bold kurdish-text flex items-center gap-1.5 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {resolvingId === reqItem.id ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              خەریکە...
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3 h-3" />
                              لابردنی بلۆک
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteUnblockRequest(reqItem.id)}
                          className="px-3 py-1.5 bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white rounded-lg text-[10px] font-bold kurdish-text flex items-center gap-1.5 transition duration-200"
                        >
                          <Trash2 className="w-3 h-3" />
                          سڕینەوە
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Permanent archive history (resolved / deleted / cleared) */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-white kurdish-text flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand-primary" />
                    ئەرشیفی مێژووی داواکارییەکان ({unblockArchive.length})
                  </h4>
                </div>
                {unblockArchive.length === 0 ? (
                  <p className="text-xs text-gray-500 kurdish-text">هیچ داواکارییەکی ئەرشیفکراو نییە لەم کاتەدا.</p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {unblockArchive.map((arch) => (
                      <div key={arch.id} className="p-4 rounded-2xl bg-black/30 border border-white/5 flex flex-col sm:flex-row justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-white kurdish-text truncate">{arch.name}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black kurdish-text ${
                              arch.status === "resolved"
                                ? "bg-green-500/15 text-green-400"
                                : arch.status === "archived"
                                ? "bg-yellow-500/15 text-yellow-400"
                                : "bg-red-500/15 text-red-400"
                            }`}>
                              {arch.status === "resolved" ? "کراوەتەوە" : arch.status === "archived" ? "سڕاوە (Clear)" : "سڕاوە"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-300 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono" dir="ltr">{arch.phone}</span>
                            <span className="text-gray-600">•</span>
                            <span className="font-mono" dir="ltr">{arch.ip}</span>
                          </p>
                          <span className="text-[11px] text-gray-500 flex items-center gap-1.5">
                            <User className="w-3 h-3 text-brand-primary" />
                            لەلایەن: {arch.resolvedBy || "Admin"} — {formatDate(arch.resolvedAt || arch.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
