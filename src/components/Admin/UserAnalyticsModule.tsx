import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserX,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

/**
 * User Info / Analytics admin module.
 *
 * Lists every registered account with a live status indicator:
 *   • GREEN  — active within the last 7 days (or currently online)
 *   • AMBER  — last seen 8–30 days ago
 *   • RED    — has not returned in 1 month+ (last seen > 30 days)
 *   • GRAY   — no activity timestamp recorded
 *
 * It also provides the HARD DELETE action: the account is removed from the
 * database AND the server (Firebase Auth + Firestore + local db.json), and its
 * canonical email/phone are permanently blocked from re-registration.
 * Deletion requires owner / super_admin / deputy_manager privileges (the server
 * enforces this independently of the UI).
 */

interface AdminUserAnalyticsProps {
  currentUser: any;
}

type UserStatus = "green" | "amber" | "red" | "unknown";

const toEpoch = (value: unknown): number | null => {
  if (!value) return null;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "object" && (value as any).toMillis) {
    try {
      return (value as any).toMillis();
    } catch {
      return null;
    }
  }
  return null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<UserStatus, { text: string; dot: string; badge: string }> = {
  green: {
    text: "چالاک (لە حەوت ڕۆژی ڕابردوودا)",
    dot: "bg-emerald-500",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  amber: {
    text: "ناچالاک (٨–٣٠ ڕۆژ)",
    dot: "bg-amber-400",
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  red: {
    text: "نەگەڕاوەتەوە (زیاتر لە مانگێک)",
    dot: "bg-red-500",
    badge: "border-red-500/30 bg-red-500/10 text-red-300",
  },
  unknown: {
    text: "بەبێ تۆماری چالاکی",
    dot: "bg-gray-500",
    badge: "border-gray-500/30 bg-gray-500/10 text-gray-400",
  },
};

const computeStatus = (user: any): UserStatus => {
  if (user?.isOnline === true) return "green";
  const lastMs = toEpoch(user?.lastActive) ?? toEpoch(user?.createdAt) ?? toEpoch(user?.registeredAt);
  if (lastMs === null) return "unknown";
  const days = (Date.now() - lastMs) / DAY_MS;
  if (days <= 7) return "green";
  if (days <= 30) return "amber";
  return "red";
};

const formatLastActive = (user: any): string => {
  if (user?.isOnline === true) return "لەسەر هێڵە ئێستا";
  const ms = toEpoch(user?.lastActive) ?? toEpoch(user?.createdAt) ?? toEpoch(user?.registeredAt);
  if (ms === null) return "نەزانراو";
  const days = Math.floor((Date.now() - ms) / DAY_MS);
  if (days <= 0) return "ئەمڕۆ";
  if (days === 1) return "دوێنێ";
  if (days < 7) return `${days} ڕۆژ لەمەوبەر`;
  if (days < 30) return `${Math.floor(days / 7)} هەفتە لەمەوبەر`;
  if (days < 365) return `${Math.floor(days / 30)} مانگ لەمەوبەر`;
  return `${Math.floor(days / 365)} ساڵ لەمەوبەر`;
};

const isAdminShell = (user: any, currentUser: any): boolean =>
  user?.uid === currentUser?.uid ||
  user?.username === currentUser?.username ||
  String(user?.role || "").toLowerCase() === "admin" ||
  String(user?.role || "").toLowerCase() === "owner" ||
  String(user?.role || "").toLowerCase() === "super_admin";

export const UserAnalyticsModule: React.FC<AdminUserAnalyticsProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const adminName = currentUser?.username || "Admin";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/managed-users?adminName=${encodeURIComponent(adminName)}`,
        { headers: { "x-admin-username": adminName } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as any[];
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setMessage({ kind: "err", text: `بارکردنی بەکارهێنەران سەرکەوتوو نەبوو: ${err?.message || ""}` });
    } finally {
      setLoading(false);
    }
  }, [adminName]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const counts = useMemo(() => {
    const c = { green: 0, amber: 0, red: 0, unknown: 0 };
    for (const u of users) c[computeStatus(u)] += 1;
    return c;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u?.name, u?.username, u?.uniqueCode, u?.uid, u?.email, u?.phoneNumber, u?.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [users, search]);

  const handleHardDelete = async (user: any) => {
    if (isAdminShell(user, currentUser)) {
      setMessage({ kind: "err", text: "ناتوانیت ئەکاونتێکی ئەدمینی بسڕیتەوە." });
      return;
    }
    const targetName = user?.name || user?.username || user?.uniqueCode || user?.uid;
    const confirmed = window.confirm(
      `⚠️ سڕینەوەی بە تەواوی (Hard Delete)\n\nتۆ لەسەرەتی سڕینەوەی هەمیشەیی ئەم بەکارهێنەرە:\n${targetName}\n(${user?.uniqueCode || ""})\n\nئەم کارە دەتوانرێت و هەموو داتاکانی (ئەکاونت، پڕۆفایل، پەیوەندییەکان) بۆ هەمیشە دەسڕدرێتەوە و ئیمەیڵ/مۆبایلەکەی ناتوانرێت دووبارە بەکاربهێنرێت.\n\nدڵنیایت؟`,
    );
    if (!confirmed) return;

    setBusyUid(user?.uid);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/managed-users/${encodeURIComponent(user?.uid || "")}?adminName=${encodeURIComponent(adminName)}`,
        { method: "DELETE", headers: { "x-admin-username": adminName } },
      );
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setUsers((prev) => prev.filter((u) => u?.uid !== user?.uid));
      setMessage({ kind: "ok", text: `بەکارهێنەر ${targetName} بە تەواوی سڕایەوە.` });
    } catch (err: any) {
      setMessage({ kind: "err", text: `سڕینەوە سەرکەوتوو نەبوو: ${err?.message || ""}` });
    } finally {
      setBusyUid(null);
    }
  };

  const statCards = [
    { key: "green" as const, label: "چالاک (حەوت ڕۆژ)", color: "text-emerald-400", dot: "bg-emerald-500" },
    { key: "amber" as const, label: "ناچالاک (٨–٣٠ ڕۆژ)", color: "text-amber-300", dot: "bg-amber-400" },
    { key: "red" as const, label: "نەگەڕاوەتەوە (١ مانگ+)", color: "text-red-400", dot: "bg-red-500" },
    { key: "unknown" as const, label: "بەبێ تۆمار", color: "text-gray-400", dot: "bg-gray-500" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-950/40 via-[#0f1013] to-slate-900/40 border border-white/5">
        <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text flex items-center gap-2">
          <Users className="w-6 h-6 text-brand-primary" />
          زانیاری و شیکاری بەکارهێنەران
        </h2>
        <p className="text-xs text-gray-400 kurdish-text mt-1">
          دۆخی بەکارهێنەران (سەوز/زەرد/سوور) + سڕینەوەی بە تەواوی ئەکاونت لە
          داتابەیس و سێرڤەر.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs font-black text-gray-300 kurdish-text transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            نوێکردنەوە
          </button>
          <span className="text-[10px] text-gray-500 kurdish-text">
            {loading ? "بارکردن..." : `${users.length} بەکارهێنەر`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.key} className="p-5 bg-[#0f1013] border border-white/5 rounded-3xl">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${card.dot}`} />
              <span className="text-[11px] text-gray-400 kurdish-text font-bold">{card.label}</span>
            </div>
            <p className={`mt-2 text-3xl font-black font-mono ${card.color}`}>{counts[card.key]}</p>
          </div>
        ))}
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-black kurdish-text ${
            message.kind === "ok"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/25 bg-red-500/10 text-red-300"
          }`}
        >
          {message.kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="relative">
        <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="گەڕان بە ناو، ناوی بەکارهێنەر، CC-ID، ئیمەیڵ یان مۆبایل..."
          className="w-full rounded-2xl border border-white/10 bg-[#0f1013] py-3 pl-4 pr-11 text-sm font-bold text-white outline-none transition focus:border-brand-primary/60 kurdish-text placeholder:text-gray-600"
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
          <p className="text-xs font-bold kurdish-text">بارکردنی بەکارهێنەران...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
          <Activity className="h-8 w-8 text-gray-600" />
          <p className="text-xs font-bold kurdish-text">هیچ بەکارهێنەرێک نەدۆزرایەوە</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0f1013]">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <table className="w-full text-right">
              <thead className="sticky top-0 bg-[#0f1013] border-b border-white/10">
                <tr className="text-[10px] uppercase tracking-wider text-gray-500 kurdish-text">
                  <th className="px-4 py-3 font-black">بەکارهێنەر</th>
                  <th className="px-4 py-3 font-black hidden md:table-cell">CC-ID</th>
                  <th className="px-4 py-3 font-black hidden lg:table-cell">ئیمەیڵ</th>
                  <th className="px-4 py-3 font-black">دۆخ</th>
                  <th className="px-4 py-3 font-black hidden sm:table-cell">دوایین چالاکی</th>
                  <th className="px-4 py-3 font-black">کردار</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const status = computeStatus(user);
                  const st = STATUS_LABELS[status];
                  const canDelete = !isAdminShell(user, currentUser);
                  return (
                    <tr
                      key={user?.uid || user?.uniqueCode || Math.random()}
                      className="border-b border-white/5 transition hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {user?.avatarUrl || user?.avatar ? (
                            <img
                              src={user?.avatarUrl || user?.avatar}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-sm font-black text-white">
                              {(user?.name || user?.username || "؟").substring(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-white">
                              {user?.name || user?.displayName || "بەکارهێنەر"}
                            </p>
                            <p className="truncate text-[10px] text-gray-500 font-mono" dir="ltr">
                              {user?.username || user?.uid || ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs font-black font-mono text-gray-300">{user?.uniqueCode || "—"}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-[11px] font-mono text-gray-400" dir="ltr">
                          {user?.email || user?.phoneNumber || user?.phone || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black kurdish-text ${st.badge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          {status === "green" && user?.isOnline === true ? "لەسەر هێڵە" : st.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 kurdish-text">
                          {user?.isOnline === true ? (
                            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <WifiOff className="h-3.5 w-3.5 text-gray-600" />
                          )}
                          {formatLastActive(user)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void handleHardDelete(user)}
                          disabled={!canDelete || busyUid === user?.uid}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black transition disabled:opacity-40 ${
                            canDelete
                              ? "bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20"
                              : "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
                          } kurdish-text`}
                          title={
                            canDelete
                              ? "سڕینەوەی بە تەواوی لە داتابەیس و سێرڤەر"
                              : "ئەکاونتە ئەدمینییەکان ناسڕێنەوە"
                          }
                        >
                          {busyUid === user?.uid ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          سڕینەوەی بە تەواوی
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 text-[11px] leading-5 text-amber-200/80 kurdish-text">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p>
          سڕینەوەی بە تەواوی (Hard Delete) ئەکاونتەکە لە Firebase Auth،
          Firestore و بنکەدراوەکە دەسڕێتەوە و ئیمەیڵ/مۆبایلەکەی بۆ هەمیشە
          بەربەست دەبێت لە دروستکردنەوە — ناتوانرێت پاشگەز بکرێتەوە. کارمەند
          (Staff) دەسەڵاتی ئەم کارەی نییە.
        </p>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-gray-600 kurdish-text">
        <UserX className="h-3.5 w-3.5" />
        سەوز = چالاک لە حەوت ڕۆژی ڕابردوو · زەرد = ناچالاک ٨–٣٠ ڕۆژ · سوور = نەگەڕاوەتەوە زیاتر لە مانگێک
      </div>
    </div>
  );
};

export default UserAnalyticsModule;
