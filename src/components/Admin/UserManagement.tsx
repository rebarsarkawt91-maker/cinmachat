import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Key, 
  ShieldCheck, 
  UserX, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle 
} from "lucide-react";

interface AdminUser {
  username: string;
  isSuper: boolean;
  isOwner?: boolean;
}

interface UserManagementProps {
  currentUser: { username: string; isSuper: boolean; isOwner: boolean };
}

export const UserManagement = ({ currentUser }: UserManagementProps) => {
  const isOwner = currentUser?.username?.toLowerCase() === "dekan@123" || currentUser?.username?.toLowerCase() === "admin";

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create sub-admin form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSuper, setIsSuper] = useState(false);

  // Password reset form state
  const [selectedUser, setSelectedUser] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const fetchAdmins = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        // Tag client-side if username is dekan@123 as the Owner
        const formatted = data.map((admin: any) => ({
          ...admin,
          isOwner: admin.username?.toLowerCase() === "dekan@123"
        }));
        setAdmins(formatted);
      } else {
        setError("نشست ناتوان بوو لە خوێندنەوەی بەکارهێنەرانی دەسەڵاتدار");
      }
    } catch (err) {
      setError("کێشەیەک لە پەیوەندی هەیە لەگەڵ سێرڤەرەکەت!");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      setError("ڕێگەپێنەدراو: تەنها خاوەن سەرپەرشتیار (dekan@123) دەتوانێت ئەدمین دروست بکات!");
      return;
    }

    if (!username || !password) {
      setError("تکایە سەرجەم خانەکان پڕبکەرەوە!");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/users?adminName=${encodeURIComponent(currentUser.username)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, isSuper }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(`ئەدمینی نوێ [ ${username} ] بە سەرکەوتوویی دروستکرا و هاشکرا ✓`);
        setUsername("");
        setPassword("");
        setIsSuper(false);
        fetchAdmins();
      } else {
        setError(data.error || "دروستکردنی ئەکاونتی نوێ سەرکەوتوو نەبوو!");
      }
    } catch (err) {
      setError("پەیوەندی تێکچوو لە کاتی دروستکردندا.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (targetUsername: string) => {
    if (!isOwner) {
      setError("ڕێگەپێنەدراو: تەنها خاوەن سەرپەرشتیار دەتوانێت ئەکاونت بسڕێتەوە.");
      return;
    }

    if (targetUsername.toLowerCase() === "dekan@123" || targetUsername.toLowerCase() === "admin") {
      setError("ناتوانیت ئەکاونتی شاهانەی خاوەن بکوژێنیتەوە!");
      return;
    }

    if (!window.confirm(`ئایا دڵنیایت لە سڕینەوەی کاتی یان هەمیشەیی ${targetUsername}؟`)) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUsername)}?adminName=${encodeURIComponent(currentUser.username)}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(`ئەکاونتی ئەدمینی ${targetUsername} بسڕایەوە ✓`);
        fetchAdmins();
      } else {
        setError(data.error || "سڕینەوەی ستاف سەرکەوتوو نەبوو!");
      }
    } catch (err) {
      setError("هەڵەیەکی چاوەڕواننەکراو لە دەسەڵاتی پەیوەندیدا.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      setError("تەنها خاوەنی فەرمی دەتوانێت گۆڕانکاری لە پاسوۆرد دەرەک بکات.");
      return;
    }

    if (!selectedUser || !newPassword) {
      setError("تکایە بەکارهێنەر و پاسوۆرد دیاریبکە.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/m17/admins/password?adminName=${encodeURIComponent(currentUser.username)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUsername: selectedUser,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(`پاسوۆردی دەسەڵاتداری [ ${selectedUser} ] بە سەرکەوتوویی نوێکرایەوە ✓`);
        setSelectedUser("");
        setNewPassword("");
      } else {
        setError(data.error || "نوێکردنەوەی وشەی تێپەڕ بوونی نەبوو.");
      }
    } catch (err) {
      setError("پەیوەندی شکستیهێنا.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 bg-[#0a0c10] p-6 sm:p-8 rounded-[2.5rem] border border-white/5 shadow-xl text-white font-sans" id="user-management-panel">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-mono tracking-widest text-amber-500 font-black uppercase">
              ADMIN CONTROL • UNIT 17
            </span>
          </div>
          <h2 className="text-2xl font-black kurdish-text flex items-center gap-2">
            <Users className="w-7 h-7 text-amber-500" />
            سیستەمی بەڕێوەبردنی ستاف و دەسەڵاتەکان
          </h2>
          <p className="text-gray-400 text-xs kurdish-text">
            کۆنترۆڵکردنی پلەی ئەدمینەکان، زیادکردنی هاوکاران و پاراستنی فەرمی لۆگینەکان.
          </p>
        </div>
        <button
          onClick={fetchAdmins}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-xs font-semibold kurdish-text transition-all duration-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${loading ? "animate-spin" : ""}`} />
          تازەکردنەوە
        </button>
      </div>

      {/* Message alerts */}
      {error && (
        <div className="p-4 bg-red-950/40 border border-red-500/20 rounded-2xl text-xs text-red-400 kurdish-text font-bold flex items-center gap-2.5 animate-fadeIn">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/20 rounded-2xl text-xs text-emerald-400 kurdish-text font-bold flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle className="w-5 h-5 shrink-0" />
          {success}
        </div>
      )}

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Column 1: Existing Admins table (lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-black/30 border border-white/5 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-white/[0.01]">
              <h3 className="text-sm font-black kurdish-text flex items-center gap-2 text-white">
                <ShieldCheck className="w-4.5 h-4.5 text-amber-500" />
                ئەدمین و بەڕێوبەرانی تۆمارکراو لە خزمەتگوزاری
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-gray-500 font-black">
                    <th className="p-4 kurdish-text">ناوی کارا (ئایدی)</th>
                    <th className="p-4 kurdish-text">ئاستی فەرمی دەسەڵات</th>
                    <th className="p-4 kurdish-text text-center">ئاسایش</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {admins.map((user) => (
                    <tr key={user.username} className={`hover:bg-white/[0.01] transition-all ${user.isOwner ? "bg-amber-500/[0.03]" : ""}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">{user.username}</span>
                          {user.isOwner && (
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[8px] font-black uppercase rounded">
                              Owner / خاوەنکار
                            </span>
                          )}
                          {!user.isOwner && user.isSuper && (
                            <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 text-[8px] font-black uppercase rounded">
                              Super Admin
                            </span>
                          )}
                          {!user.isSuper && (
                            <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase rounded">
                              Assistant
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-gray-400 kurdish-text font-medium">
                        {user.isOwner 
                          ? "خاوەنی سەرەکی پرۆژە کە گۆڕانکاری دەکات لە هەمووان" 
                          : user.isSuper 
                            ? "سوپەر ئەدمین کە دەسەڵاتی تەواوی بەڕێوەبردنی هەیە" 
                            : "ئەسیستانت کە دەسەڵاتی سڕینەوە و ڕێکخستنی نییە"}
                      </td>
                      <td className="p-4 text-center">
                        {user.isOwner ? (
                          <span className="text-[10px] text-gray-600 font-mono select-none">SYSTEM_LOCKED</span>
                        ) : isOwner ? (
                          <button
                            onClick={() => handleDeleteUser(user.username)}
                            className="p-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-black rounded-xl transition-all duration-200"
                            title="Delete Admin"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span title="No Permissions">
                            <UserX className="w-4 h-4 text-gray-600 mx-auto" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Creation Section (Strictly restricted to dekan@123) */}
          <div className="p-6 bg-black/20 border border-white/5 rounded-3xl space-y-4">
            <h3 className="text-sm font-black kurdish-text flex items-center gap-2 text-white">
              <UserPlus className="w-5 h-5 text-amber-500" />
              تۆمارکردنی ئەکاونتی نوێ بۆ ئەدمین
            </h3>

            {!isOwner ? (
              <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 text-[11px] text-amber-400 kurdish-text">
                🔒 تێبینی: تەنها سەرۆکی سیستم <strong>(dekan@123 / admin)</strong> دەتوانێت سوپەر ئەدمین یان یارمەتیدەری نوێ دەستنیشان بکات.
              </div>
            ) : (
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 kurdish-text">ناوی بەکارهێنەری نوێ (Username)</label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="نموونە: sub_admin_hawkar"
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs outline-none focus:border-amber-500/50 transition-all font-mono text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 kurdish-text">پاسوۆردی ئەدمین (Password)</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs outline-none focus:border-amber-500/50 transition-all font-mono text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is-super-check"
                    checked={isSuper}
                    onChange={(e) => setIsSuper(e.target.checked)}
                    className="w-4 h-4 rounded border-white/10 bg-black text-amber-500 focus:ring-0 accent-amber-500 cursor-pointer"
                  />
                  <label htmlFor="is-super-check" className="text-xs font-bold text-gray-300 kurdish-text cursor-pointer select-none">
                    پێدانی دەسەڵاتی Super Admin (توانای دەستکاریکردنی فیلم و ڕێکخستنەکان)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-black rounded-xl font-black kurdish-text text-xs transition-all active:scale-[0.98]"
                >
                  {loading ? "خەریکی زیادکردنە..." : "زیادکردنی فەرمی ئەدمین"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Column 2: Route Guard visualizer & Password Resetter (lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-6">

          {/* Quick password reset form panel */}
          <div className="p-6 bg-black/20 border border-white/5 rounded-3xl space-y-4">
            <h3 className="text-sm font-black kurdish-text flex items-center gap-2 text-white">
              <Key className="w-4.5 h-4.5 text-amber-500" />
              وشەی تێپەڕی نوێی ئەدمین
            </h3>

            {!isOwner ? (
              <div className="text-[11px] text-gray-500 kurdish-text leading-relaxed">
                تەنها خاوەنکار دەتوانێت پاسوۆردی ئەندامەکانی تر نوێ بکاتەوە لێرەوە. ئەکاونتی گۆڕدراو ڕاستەوخۆ بە شێوەی SHA256 لە بەگی داتابەیس پاشەکەوت دەکرێت.
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 kurdish-text">دیاریکردنی ئەدمین</label>
                  <select
                    required
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white kurdish-text outline-none focus:border-amber-500/50 transition-all font-mono"
                  >
                    <option value="" disabled className="text-gray-500 bg-[#0c0d12]">لێرەوە هەڵبژێرە</option>
                    {admins.map((u) => (
                      <option key={u.username} value={u.username} className="text-black bg-white">
                        {u.username} {u.username === currentUser.username ? "(من)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 kurdish-text">نووسینی پاسوۆردی نوێ</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="مینیماڵ ٦ پیت یان هێما"
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs outline-none focus:border-amber-500/50 transition-all font-mono text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-white hover:bg-gray-200 text-black font-black kurdish-text text-xs rounded-xl transition-all active:scale-[0.98]"
                >
                  نوێکردنەوەی پاسوۆرد
                </button>
              </form>
            )}
          </div>

          {/* Safety protocol details */}
          <div className="p-5 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 mt-1 animate-ping" />
            <div className="space-y-1">
              <h5 className="text-[11px] font-black text-amber-500 kurdish-text">پاراستنی حەق و قەواڵەکان</h5>
              <p className="text-[10.5px] text-gray-400 kurdish-text leading-relaxed">
                بەپێی مەرج و یاساکانی مۆدیول ١٧، هەر کاتێک ئەکاونتێکی نوێ دروست دەبێت یان جێگۆڕکێ بە چات دەکرێت، ڕاستەوخۆ دەسپێشخەری بە ئاگاداری فەرمی بۆ خاوەنی ماڵپەڕ <strong>(dekan@123)</strong> دەڕوات.
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
