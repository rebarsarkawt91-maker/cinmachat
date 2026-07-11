import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Shield, 
  ShieldAlert, 
  Users, 
  Key, 
  Trash2, 
  Plus, 
  RefreshCw, 
  Bell, 
  UserCheck, 
  Activity,
  CheckCircle,
  Eye,
  EyeOff
} from "lucide-react";
import { useSocialAuth } from "../../context/SocialAuthContext";

interface AdminUser {
  username: string;
  isSuper: boolean;
  isOwner: boolean;
  role?: string;
}

interface NotificationAlert {
  id: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface Module17Stats {
  totalAdmins: number;
  superAdmins: number;
  deputyManagers: number;
  staff: number;
}

export const MultiLevelAdminModule = ({ currentUser }: { currentUser: any }) => {
  const { socialProfile } = useSocialAuth();
  const isOwner = currentUser?.username?.toLowerCase() === "dekan@123" || 
                  currentUser?.username?.toLowerCase() === "admin" ||
                  currentUser?.role === "owner" ||
                  currentUser?.role === "admin" ||
                  currentUser?.role === "super_admin" ||
                  currentUser?.role === "deputy_manager" ||
                  socialProfile?.role === "super_admin" || 
                  socialProfile?.userRole === "super_admin" || 
                  socialProfile?.role === "deputy_manager" ||
                  socialProfile?.userRole === "deputy_manager" ||
                  socialProfile?.role === "admin" ||
                  socialProfile?.userRole === "admin";
  
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [notifications, setNotifications] = useState<NotificationAlert[]>([]);
  const [stats, setStats] = useState<Module17Stats>({ totalAdmins: 0, superAdmins: 0, deputyManagers: 0, staff: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create Sub-Admin / Assistant inputs
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"deputy_manager" | "staff">("staff");

  // Edit/Reset password inputs
  const [targetUser, setTargetUser] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const fetchModule17Data = async () => {
    if (!isOwner) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/m17/status?adminName=${encodeURIComponent(currentUser.username)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setAdmins(data.admins || []);
        setNotifications(data.notifications || []);
        setStats(data.systemStats || { totalAdmins: 0, superAdmins: 0, deputyManagers: 0, staff: 0 });
      } else {
        setError(data.error || "خطأ في تحميل البيانات");
      }
    } catch (err) {
      setError("حەواڵەکردنی زانیاری شکستیهێنا بەهۆی هێڵی پەیوەندی");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModule17Data();
  }, [currentUser]);

  const handleCreateSubAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) {
      setError("تکایە سەرجەم خانەکان پڕبکەرەوە");
      return;
    }
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/users?adminName=${encodeURIComponent(currentUser.username)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          isSuper: newRole === "deputy_manager",
          role: newRole
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`ئەدمینی نوێ [${newUsername}] بە سەرکەوتوویی زیادکرا ✓`);
        setNewUsername("");
        setNewPassword("");
        setNewRole("staff");
        fetchModule17Data();
      } else {
        setError(data.error || "تۆمارکردنی بەکارهێنەر ڕەتکرایەوە");
      }
    } catch (err) {
      setError("نوێکردنەوە خەریک نییە، تکایە ڕاژە پشکنین بکە");
    }
  };

  const handleDeleteAdmin = async (usernameToDelete: string) => {
    if (usernameToDelete === currentUser.username) {
      setError("تۆ ناتوانیت ئەکاونتی خاوەنکاری خۆت بسڕیتەوە!");
      return;
    }
    if (!window.confirm(`ئایا دڵنیایت لە سڕینەوەی دەسەڵاتی ئەدمین: [${usernameToDelete}]؟`)) {
      return;
    }
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(usernameToDelete)}?adminName=${encodeURIComponent(currentUser.username)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`ئەدمینی ناوبراو [${usernameToDelete}] بە سەرکەوتوویی سڕایەوە ✓`);
        fetchModule17Data();
      } else {
        setError(data.error || "هەڵەیەک ڕوویدا لە کاتی سڕینەوەدا");
      }
    } catch (err) {
      setError("پەیوەندی سێرڤەر نەدۆزرایەوە");
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser || !editPassword) {
      setError("تکایە ئەدمین و پاسوۆردی نوێ دیاری بکە");
      return;
    }
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/m17/admins/password?adminName=${encodeURIComponent(currentUser.username)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUsername: targetUser,
          newPassword: editPassword
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`پاسوۆردی ئەدمین [${targetUser}] بە سەرکەوتوویی گۆڕدرا و بە پارێزراوی هاشکرا ✓`);
        setEditPassword("");
        setTargetUser("");
        fetchModule17Data();
      } else {
        setError(data.error || "گۆڕینی وشەی تێپەڕ سەرکەوتوو نەبوو");
      }
    } catch (err) {
      setError("سێرڤەر وەڵامی نییە لە ئێستادا");
    }
  };

  const handleClearNotifications = async () => {
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/m17/notifications/clear?adminName=${encodeURIComponent(currentUser.username)}`, {
        method: "POST"
      });
      if (res.ok) {
        setNotifications([]);
        setSuccessMsg("سەرجەم ئاگادارییە نامەکان پاککرانەوە ✓");
      }
    } catch (err) {
      setError("پەیوەندی شکستیهێنا");
    }
  };

  // STRICT ROUTE GUARD: Deny non-owner access with a sleek, branded block page
  if (!isOwner) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl mx-auto my-12 p-8 bg-red-950/25 border border-red-500/20 rounded-[2.5rem] text-center space-y-6 backdrop-blur-md"
        id="m17-guard-block"
      >
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500 ring-4 ring-red-500/5 animate-pulse">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-red-400 kurdish-text">
            دەسەڵاتی چوونەژوورەوەت نییە!
          </h3>
          <p className="text-gray-400 text-sm kurdish-text leading-relaxed">
            بەشی ڕێگەپێدانی فرە-ئاستی (Module 17) تەنها و تەنها تایبەتە بە 
            <span className="text-red-300 font-extrabold px-1 text-xs">خاوەنی سەرەکی پلاتفۆرم (Dekan - dekan@123)</span> 
            و بۆ ئەندامانی ئاسایی یان بەڕێوبەرانی ئاسیاستەنت ناچار ڕەتکراوەتەوە.
          </p>
        </div>
        <div className="pt-2 text-[10px] font-mono text-red-500 uppercase tracking-widest bg-red-500/5 py-2 rounded-xl">
          SECURITY BOUNDARY • ROUTE_GUARD_ACTIVE • BLOCK_403
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-8"
      id="m17-owner-dashboard"
    >
      {/* Title block */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-black uppercase rounded-full tracking-widest">
            سیستەمی نوێی دەسەڵاتەکان • مۆدیول ١٧
          </span>
          <h2 className="text-3xl font-black kurdish-text text-white mt-1.5 flex items-center gap-2">
            <Shield className="w-8 h-8 text-amber-500" />
            بەشی ڕێگەپێدانی فرە-ئاستی ئەدمینەکان
          </h2>
          <p className="text-gray-500 kurdish-text text-xs mt-1">
            کۆنترۆڵی ئاستەکانی سوپەر ئەدمین و ئەلبومی دەسەڵاتی خاوەن پلاتفۆرم.
          </p>
        </div>
        <button
          onClick={fetchModule17Data}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 text-xs font-black kurdish-text transition-all"
        >
          <RefreshCw className={`w-4 h-4 text-amber-500 ${loading ? "animate-spin" : ""}`} />
          نوێکردنەوەی داتا
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 kurdish-text text-xs font-bold">
          ⚠️ هەڵە: {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 kurdish-text text-xs font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          {successMsg}
        </div>
      )}

      {/* Bento Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-6 bg-[#0c0d12]/60 border border-white/5 rounded-3xl space-y-2 relative overflow-hidden group hover:border-amber-500/20 transition-all">
          <div className="text-gray-500 text-xs kurdish-text font-bold">کۆی گشتی ئەدمینەکان</div>
          <div className="text-3xl font-black text-white font-mono">{stats.totalAdmins}</div>
          <div className="absolute right-4 bottom-4 w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-gray-400">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="p-6 bg-[#0c0d12]/60 border border-white/5 rounded-3xl space-y-2 relative overflow-hidden group hover:border-amber-500/20 transition-all">
          <div className="text-gray-500 text-xs kurdish-text font-bold">بەرێوەبەری گشتی (Super Admin)</div>
          <div className="text-3xl font-black text-red-500 font-mono">{stats.superAdmins || 0}</div>
          <div className="absolute right-4 bottom-4 w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
            <Shield className="w-4 h-4" />
          </div>
        </div>
        <div className="p-6 bg-[#0c0d12]/60 border border-white/5 rounded-3xl space-y-2 relative overflow-hidden group hover:border-amber-500/20 transition-all">
          <div className="text-gray-500 text-xs kurdish-text font-bold">جێگری بەڕێوەبەر (Deputy Manager)</div>
          <div className="text-3xl font-black text-amber-500 font-mono">{stats.deputyManagers || 0}</div>
          <div className="absolute right-4 bottom-4 w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="p-6 bg-[#0c0d12]/60 border border-white/5 rounded-3xl space-y-2 relative overflow-hidden group hover:border-amber-500/20 transition-all">
          <div className="text-gray-500 text-xs kurdish-text font-bold">کارمەندی بەڕێوەبەر (Staff)</div>
          <div className="text-3xl font-black text-blue-400 font-mono">{stats.staff || 0}</div>
          <div className="absolute right-4 bottom-4 w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
            <Users className="w-4 h-4" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Admin List and Creation */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Admin Accounts Table */}
          <div className="bg-[#0c0d12]/60 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-sm">
            <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
              <h3 className="font-black text-sm kurdish-text text-white flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-amber-500" />
                لیستی بەڕێوبەرانی تۆمارکراوی سیستم
              </h3>
            </div>
            
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-t-amber-500 border-white/10 rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-gray-500 kurdish-text animate-pulse">خەریکی گواستنەوەی زانیاریەکانە...</p>
                </div>
              ) : admins.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-xs kurdish-text">
                  هیچ ئەکاونتێکی تر کارا نییە !
                </div>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-500">
                      <th className="p-4 kurdish-text font-black select-none">ناوی بەکارهێنەر (ئایدی)</th>
                      <th className="p-4 kurdish-text font-black select-none">ئاستی دەسەڵات لە سیستەم</th>
                      <th className="p-4 kurdish-text font-black select-none text-center">کردارەکان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {admins.map((admin) => (
                      <tr 
                        key={admin.username}
                        className={`hover:bg-white/[0.02] transition-colors ${admin.isOwner ? "bg-amber-500/5" : ""}`}
                      >
                        <td className="p-4 font-bold text-white flex items-center gap-2">
                          <span className="font-mono">{admin.username}</span>
                          {admin.isOwner && (
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[8px] font-black rounded uppercase select-none">
                              Owner / خاوەنکار
                            </span>
                          )}
                          {!admin.isOwner && admin.role === "super_admin" && (
                            <span className="px-1.5 py-0.5 bg-red-500/10 text-red-500 text-[8px] font-black rounded uppercase select-none">
                              Super Admin / ئەدمینی باڵا
                            </span>
                          )}
                          {!admin.isOwner && admin.role === "deputy_manager" && (
                            <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 text-[8px] font-black rounded uppercase select-none">
                              Deputy Manager / جێگر
                            </span>
                          )}
                          {!admin.isOwner && admin.role === "staff" && (
                            <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded uppercase select-none">
                              Staff / کارمەند
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-gray-400 font-sans kurdish-text font-black">
                          {admin.isOwner 
                            ? "تەواوی دەسەڵاتەکانی سڕینەوە، دانان، بەڕێوەبردن (Full)" 
                            : admin.role === "super_admin"
                              ? "ئەدمینی گشتی خاوەن دەسەڵاتی تەواو"
                              : admin.role === "deputy_manager"
                                ? "جێگری بەڕێوەبەر (دەسەڵاتی تەواوی سڕینەوە و بەڕێوەبردن)" 
                                : "کارمەندی بەڕێوەبەر (تەنها پۆستکردن و دانانی لینک)"}
                        </td>
                        <td className="p-4 text-center">
                          {admin.isOwner ? (
                            <span className="text-[10px] text-gray-600 kurdish-text select-none">پاراێزراوە</span>
                          ) : (
                            <button
                              onClick={() => handleDeleteAdmin(admin.username)}
                              className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                              title="Delete Admin"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Create Sub-Admin / Assistant Form */}
          <div className="p-6 bg-[#0c0d12]/60 border border-white/5 rounded-3xl space-y-4">
            <h3 className="font-black text-sm text-white kurdish-text flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-500" />
              تۆمارکردنی بەڕێوبەری نوێ (Sub-Admin / Assistant)
            </h3>
            
            <form onSubmit={handleCreateSubAdmin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 kurdish-text">ناوی بەکارهێنەر (Username)</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="نموونە: ali_cinema"
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white kurdish-text outline-none focus:border-amber-500/50 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 kurdish-text">وشەی تێپەڕ (Password)</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="هەر وشەیەکی بەهێز"
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white kurdish-text outline-none focus:border-amber-500/50 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5 py-1">
                <label className="text-[11px] font-bold text-gray-400 kurdish-text">دیاریکردنی ڕۆڵ و دەسەڵات (Role & Permissions)</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "deputy_manager" | "staff")}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white kurdish-text outline-none focus:border-amber-500/50 transition-all cursor-pointer"
                >
                  <option value="staff" className="bg-[#0c0d12] text-white">
                    کارمەندی بەڕێوەبەر (Staff) - تەنها پۆستکردن و دانانی لینک (Post & Links Only)
                  </option>
                  <option value="deputy_manager" className="bg-[#0c0d12] text-white">
                    جێگری بەڕێوەبەر (Deputy Manager) - دەسەڵاتی گشتی و بەڕێوەبردنی ئەندامان
                  </option>
                </select>
                <p className="text-[10px] text-gray-500 kurdish-text mt-1 leading-relaxed">
                  * تێبینی: کارمەندی ئاسایی نابێت بتوانێت بنکەدراوە پاک بکاتەوە، یان یوزەری تر و ئەدمینی تر پسڕێتەوە یان دەستکاری بکات.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-black rounded-xl font-black kurdish-text text-xs transition-all active:scale-95"
              >
                تۆمارکردنی فەرمی ئەدمینی نوێ
              </button>
            </form>
          </div>

        </div>

        {/* Right column: Password resetting and Notifications log */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Own / Others Password reset utility */}
          <div className="p-6 bg-[#0c0d12]/60 border border-white/5 rounded-3xl space-y-4">
            <h3 className="font-black text-sm text-white kurdish-text flex items-center gap-2">
              <Key className="w-4.5 h-4.5 text-amber-500" />
              نوێکردنەوە و گۆڕینی وشەی تێپەڕ
            </h3>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 kurdish-text">هەڵبژاردنی ئەدمینی مەبەست</label>
                <select
                  required
                  value={targetUser}
                  onChange={(e) => setTargetUser(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white kurdish-text outline-none focus:border-amber-500/50 transition-all font-mono"
                >
                  <option value="" disabled className="text-gray-500">لێرەوە دیاری بکە</option>
                  {admins.map(a => (
                    <option key={a.username} value={a.username} className="text-black bg-white">
                      {a.username} {a.username === currentUser.username ? "(من)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-gray-400 kurdish-text font-black">پاسوۆردی فەرمی نوێ</label>
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="text-gray-500 hover:text-white"
                  >
                    {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="لەکەمتر نەبێ لە ٦ هێما"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white kurdish-text outline-none focus:border-amber-500/50 transition-all font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-white hover:bg-white/80 text-black rounded-xl font-black kurdish-text text-xs transition-all active:scale-95"
              >
                کۆکراوە و پاشەکەوتکردن
              </button>
            </form>
          </div>

          {/* Real-time alert notifications display */}
          <div className="bg-[#0c0d12]/60 border border-white/5 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
              <h3 className="font-black text-sm text-white kurdish-text flex items-center gap-2">
                <Bell className="w-4.5 h-4.5 text-amber-500" />
                سەنتەری ئاگادارییە گرنگەکان 
                {notifications.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                )}
              </h3>
              {notifications.length > 0 && (
                <button
                  onClick={handleClearNotifications}
                  className="text-[10px] text-gray-400 hover:text-red-500 font-bold kurdish-text"
                >
                  پاککردنەوە
                </button>
              )}
            </div>

            <div className="p-5 max-h-[350px] overflow-y-auto space-y-3 divide-y divide-white/5">
              {notifications.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-xs kurdish-text">
                  هیچ ئاگادارییەکی نوێ نییە لە سیستمدا !
                </div>
              ) : (
                notifications.map((notif) => (
                  <div key={notif.id} className="pt-3 first:pt-0 space-y-1">
                    <p className="text-[11px] text-gray-300 kurdish-text leading-relaxed">
                      {notif.message}
                    </p>
                    <div className="flex items-center justify-between text-[9px] text-gray-500 font-mono">
                      <span>ALERT LOG</span>
                      <span>{new Date(notif.timestamp).toLocaleString("ku-IQ")}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick confirmation security badge */}
          <div className="p-5 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3">
            <Activity className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-[11px] font-black text-amber-500 kurdish-text">ئاسایشی گشتی پلاتفۆرم</h4>
              <p className="text-[10px] text-gray-400 kurdish-text leading-relaxed">
                هەموو کردارێکی زیادکردن، سڕینەوە، یان دەستکاری دەسەڵات بێ گەڕانەوە لۆگ یاخود ئۆدیت دەکرێ لە سیستەمەکەدا بۆ پاراستنی هێز و کۆنترۆڵ.
              </p>
            </div>
          </div>

        </div>

      </div>

    </motion.div>
  );
};
