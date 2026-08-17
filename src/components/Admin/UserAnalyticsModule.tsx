import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  User,
  UserX,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

/**
 * User Info / Analytics admin module — "Item 11".
 *
 * Lists every registered account with:
 *   • Activity-status color-coding (GREEN / ORANGE / RED / GRAY)
 *   • Full Account Details Viewer (modal with all user fields)
 *   • Color-coded account deletion module (Name + Mobile + Delete button)
 *
 * Status thresholds:
 *   • GREEN  — active within the last 1 week (7 days)
 *   • ORANGE — inactive between 1 week and 4 months (~120 days)
 *   • RED    — inactive for more than 1 year (365 days)
 *   • GRAY   — no activity timestamp recorded
 */

interface AdminUserAnalyticsProps {
  currentUser: any;
}

type UserStatus = "green" | "orange" | "red" | "unknown";

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
const FOUR_MONTHS_DAYS = 120;
const ONE_YEAR_DAYS = 365;

const STATUS_LABELS: Record<UserStatus, { text: string; dot: string; badge: string }> = {
  green: {
    text: "چالاک (لە حەوت ڕۆژی ڕابردوودا)",
    dot: "bg-emerald-500",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  orange: {
    text: "ناچالاک (٧ ڕۆژ–٤ مانگ)",
    dot: "bg-orange-400",
    badge: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  },
  red: {
    text: "نەگەڕاوەتەوە (زیاتر لە ساڵێک)",
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
  const lastMs =
    toEpoch(user?.lastActive) ?? toEpoch(user?.createdAt) ?? toEpoch(user?.registeredAt);
  if (lastMs === null) return "unknown";
  const days = (Date.now() - lastMs) / DAY_MS;
  if (days <= 7) return "green";
  if (days <= FOUR_MONTHS_DAYS) return "orange";
  if (days > ONE_YEAR_DAYS) return "red";
  // Between 4 months and 1 year — still red for inactivity > 1yr check
  // If between 4mo and 1yr, it's technically inactive for a long time but
  // per spec, red is strictly >1yr. Anything between 4mo and 1yr is orange.
  return "orange";
};

const formatLastActive = (user: any): string => {
  if (user?.isOnline === true) return "لەسەر هێڵە ئێستا";
  const ms =
    toEpoch(user?.lastActive) ?? toEpoch(user?.createdAt) ?? toEpoch(user?.registeredAt);
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

export const UserAnalyticsModule: React.FC<AdminUserAnalyticsProps> = ({
  currentUser,
}) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  // Full Account Details Viewer state
  const [detailUser, setDetailUser] = useState<any | null>(null);

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
      setMessage({
        kind: "err",
        text: `بارکردنی بەکارهێنەران سەرکەوتوو نەبوو: ${err?.message || ""}`,
      });
    } finally {
      setLoading(false);
    }
  }, [adminName]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const counts = useMemo(() => {
    const c = { green: 0, orange: 0, red: 0, unknown: 0 };
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
      setMessage({
        kind: "ok",
        text: `بەکارهێنەر ${targetName} بە تەواوی سڕایەوە.`,
      });
    } catch (err: any) {
      setMessage({
        kind: "err",
        text: `سڕینەوە سەرکەوتوو نەبوو: ${err?.message || ""}`,
      });
    } finally {
      setBusyUid(null);
    }
  };

  const statCards = [
    {
      key: "green" as const,
      label: "چالاک (حەوت ڕۆژ)",
      color: "text-emerald-400",
      dot: "bg-emerald-500",
    },
    {
      key: "orange" as const,
      label: "ناچالاک (٧ ڕۆژ–٤ مانگ)",
      color: "text-orange-400",
      dot: "bg-orange-400",
    },
    {
      key: "red" as const,
      label: "نەگەڕاوەتەوە (١ ساڵ+)",
      color: "text-red-400",
      dot: "bg-red-500",
    },
    {
      key: "unknown" as const,
      label: "بەبێ تۆمار",
      color: "text-gray-400",
      dot: "bg-gray-500",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-950/40 via-[#0f1013] to-slate-900/40 border border-white/5">
        <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text flex items-center gap-2">
          <Users className="w-6 h-6 text-brand-primary" />
          زانیاری و شیکاری بەکارهێنەران
        </h2>
        <p className="text-xs text-gray-400 kurdish-text mt-1">
          دۆخی بەکارهێنەران (سەوز/پرتەقاڵی/سوور) + تۆماری تەواو + سڕینەوەی
          ئەکاونت لە داتابەیس و سێرڤەر.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs font-black text-gray-300 kurdish-text transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            نوێکردنەوە
          </button>
          <span className="text-[10px] text-gray-500 kurdish-text">
            {loading ? "بارکردن..." : `${users.length} بەکارهێنەر`}
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.key}
            className="p-5 bg-[#0f1013] border border-white/5 rounded-3xl"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${card.dot}`} />
              <span className="text-[11px] text-gray-400 kurdish-text font-bold">
                {card.label}
              </span>
            </div>
            <p
              className={`mt-2 text-3xl font-black font-mono ${card.color}`}
            >
              {counts[card.key]}
            </p>
          </div>
        ))}
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-black kurdish-text ${
            message.kind === "ok"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/25 bg-red-500/10 text-red-300"
          }`}
        >
          {message.kind === "ok" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {message.text}
        </div>
      )}

      {/* Search */}
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

      {/* Users table */}
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
                  <th className="px-4 py-3 font-black hidden md:table-cell">
                    CC-ID
                  </th>
                  <th className="px-4 py-3 font-black hidden lg:table-cell">
                    مۆبایل / ئیمەیڵ
                  </th>
                  <th className="px-4 py-3 font-black">دۆخ</th>
                  <th className="px-4 py-3 font-black hidden sm:table-cell">
                    دوایین چالاکی
                  </th>
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
                      {/* User info */}
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
                              {(user?.name || user?.username || "؟")
                                .substring(0, 1)
                                .toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-white">
                              {user?.name || user?.displayName || "بەکارهێنەر"}
                            </p>
                            <p
                              className="truncate text-[10px] text-gray-500 font-mono"
                              dir="ltr"
                            >
                              {user?.username || user?.uid || ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* CC-ID */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs font-black font-mono text-gray-300">
                          {user?.uniqueCode || "—"}
                        </span>
                      </td>

                      {/* Phone / Email */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span
                          className="text-[11px] font-mono text-gray-400"
                          dir="ltr"
                        >
                          {user?.phoneNumber ||
                            user?.phone ||
                            user?.email ||
                            "—"}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black kurdish-text ${st.badge}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${st.dot}`}
                          />
                          {status === "green" && user?.isOnline === true
                            ? "لەسەر هێڵە"
                            : st.text}
                        </span>
                      </td>

                      {/* Last active */}
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

                      {/* Actions: View Details + Delete */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailUser(user)}
                            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-black text-gray-300 transition hover:bg-white/10 hover:text-white"
                            title="تۆماری تەواوی ئەکاونت"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
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
                            سڕینەوە
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deletion warning */}
      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 text-[11px] leading-5 text-amber-200/80 kurdish-text">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p>
          سڕینەوەی بە تەواوی (Hard Delete) ئەکاونتەکە لە Firebase Auth،
          Firestore و بنکەدراوەکە دەسڕێتەوە و ئیمەیڵ/مۆبایلەکەی بۆ هەمیشە
          بەربەست دەبێت لە دروستکردنەوە — ناتوانرێت پاشگەز بکرێتەوە. کارمەند
          (Staff) دەسەڵاتی ئەم کارەی نییە.
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-gray-600 kurdish-text">
        <UserX className="h-3.5 w-3.5" />
        سەوز = چالاک لە حەوت ڕۆژ · پرتەقاڵی = ناچالاک ٧ ڕۆژ–٤ مانگ ·
        سوور = نەگەڕاوەتەوە زیاتر لە ساڵێک
      </div>

      {/* ─── Full Account Details Viewer Modal ─── */}
      {detailUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg">
          <div
            className="w-full max-w-lg bg-[#0f1013] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            dir="rtl"
          >
            {/* Modal header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-red-950/20 via-transparent to-blue-950/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white kurdish-text">
                    تۆماری تەواوی ئەکاونت
                  </h3>
                  <p className="text-[10px] text-gray-500 font-mono" dir="ltr">
                    {detailUser?.uid || ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status bar */}
            {(() => {
              const status = computeStatus(detailUser);
              const st = STATUS_LABELS[status];
              return (
                <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-black/20">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black kurdish-text ${st.badge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.text}
                  </span>
                  <span className="text-[10px] text-gray-500 kurdish-text">
                    {formatLastActive(detailUser)}
                  </span>
                </div>
              );
            })()}

            {/* Account fields */}
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* Avatar + Name */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                {detailUser?.avatarUrl || detailUser?.avatar ? (
                  <img
                    src={detailUser?.avatarUrl || detailUser?.avatar}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-lg font-black text-white">
                    {(
                      detailUser?.name ||
                      detailUser?.username ||
                      "?"
                    )
                      .substring(0, 1)
                      .toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-black text-white kurdish-text">
                    {detailUser?.name || detailUser?.displayName || "بەکارهێنەر"}
                  </p>
                  <p className="text-[11px] text-gray-400 font-mono" dir="ltr">
                    @{detailUser?.username || "—"}
                  </p>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    icon: <User className="h-3.5 w-3.5" />,
                    label: "ناوی تەواو",
                    value: detailUser?.displayName || detailUser?.name || "—",
                  },
                  {
                    icon: <Phone className="h-3.5 w-3.5" />,
                    label: "ژمارەی مۆبایل",
                    value:
                      detailUser?.phoneNumber || detailUser?.phone || "—",
                    mono: true,
                  },
                  {
                    icon: <Mail className="h-3.5 w-3.5" />,
                    label: "ئیمەیڵ",
                    value: detailUser?.email || "—",
                    mono: true,
                  },
                  {
                    icon: <MapPin className="h-3.5 w-3.5" />,
                    label: "ناونیشان",
                    value:
                      [detailUser?.country, detailUser?.city || detailUser?.residence]
                        .filter(Boolean)
                        .join(", ") || detailUser?.address || "—",
                  },
                  {
                    icon: <Activity className="h-3.5 w-3.5" />,
                    label: "تەمەن",
                    value: detailUser?.age || "—",
                  },
                  {
                    icon: <ShieldAlert className="h-3.5 w-3.5" />,
                    label: "CC-ID",
                    value: detailUser?.uniqueCode || "—",
                    mono: true,
                    highlight: true,
                  },
                  {
                    icon: <User className="h-3.5 w-3.5" />,
                    label: "ڕەگەز",
                    value:
                      detailUser?.gender || "—",
                  },
                  {
                    icon: <User className="h-3.5 w-3.5" />,
                    label: "لەدایکبوون",
                    value: detailUser?.birthday || "—",
                  },
                  {
                    icon: <User className="h-3.5 w-3.5" />,
                    label: "زمان",
                    value: detailUser?.language || "—",
                  },
                  {
                    icon: <User className="h-3.5 w-3.5" />,
                    label: "بایۆ",
                    value: detailUser?.bio || "—",
                  },
                ].map((field) => (
                  <div
                    key={field.label}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5"
                  >
                    <div className="flex items-center gap-2 text-gray-500">
                      {field.icon}
                      <span className="text-[10px] font-black kurdish-text">
                        {field.label}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-bold max-w-[55%] truncate ${
                        field.highlight
                          ? "text-brand-primary font-mono"
                          : field.mono
                            ? "text-white font-mono"
                            : "text-white"
                      }`}
                      dir={field.mono ? "ltr" : undefined}
                    >
                      {field.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Cover photo */}
              {detailUser?.cover && (
                <div className="rounded-2xl border border-white/5 overflow-hidden">
                  <img
                    src={detailUser.cover}
                    alt="Cover"
                    className="w-full h-24 object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 flex justify-between items-center bg-black/20">
              <span className="text-[10px] text-gray-600 font-mono" dir="ltr">
                {detailUser?.isOnline === true ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Wifi className="h-3 w-3" /> Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <WifiOff className="h-3 w-3" /> Offline
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-gray-300 hover:bg-white/10 hover:text-white transition-colors kurdish-text"
              >
                داخستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAnalyticsModule;
