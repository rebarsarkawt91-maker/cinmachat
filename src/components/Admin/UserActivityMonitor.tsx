import React, { useState, useEffect } from "react";
import { 
  Search, Eye, EyeOff, User, History, Globe, Activity, Mail, 
  Lock, Clock, X, Calendar, MapPin, RefreshCw, ChevronLeft, Layout
} from "lucide-react";

interface UserActivityMonitorProps {
  currentUser: any;
  fetchApi: (url: string, options?: any) => Promise<any>;
}

export default function UserActivityMonitor({ currentUser, fetchApi }: UserActivityMonitorProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Inspector modal states
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"messages" | "activities" | "metadata">("messages");

  // Passwords toggle display states
  const [showPassMap, setShowPassMap] = useState<Record<string, boolean>>({});

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch users dynamically from the guaranteed admin endpoint
      const res = await fetch(`/api/admin/monitored-users?adminName=${encodeURIComponent(currentUser?.username || "")}`, {
        headers: {
          "x-admin-username": currentUser?.username || ""
        }
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("شایستەی دەسەڵاتی پێویست نییە چونکە ئەم بەشە تەنها بۆ ئەدمینە.");
        }
        throw new Error("سەرکەوتوو نەبوو لە هێنانی زانیاری بەکارهێنەران");
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
      } else {
        setUsers([]);
      }
    } catch (err: any) {
      setError(err.message || "هەڵەیەک ڕوویدا لە کاتی بارکردن");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentUser]);

  const togglePasswordVisibility = (uid: string) => {
    setShowPassMap(prev => ({
      ...prev,
      [uid]: !prev[uid]
    }));
  };

  const handleInspectUser = async (uniqueCode: string) => {
    try {
      setDetailsLoading(true);
      setInspectModalOpen(true);
      setActiveSubTab("messages");
      
      const res = await fetch(`/api/admin/user-details/${encodeURIComponent(uniqueCode)}?adminName=${encodeURIComponent(currentUser?.username || "")}`, {
        headers: {
          "x-admin-username": currentUser?.username || ""
        }
      });
      if (!res.ok) {
        throw new Error("سەرکەوتوو نەبوو لە هێنانی زانیارییە وردەکانی ئەم بەکارهێنەرە");
      }
      const data = await res.json();
      setSelectedUser(data);
    } catch (err: any) {
      alert(err.message || "هەڵەیەک لە بارکردنی لۆگەکانی بەکارهێنەر ڕوویدا");
      setInspectModalOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Filter users by Unique Code or Name
  const filteredUsers = users.filter(user => {
    const code = (user.uniqueCode || "").toLowerCase();
    const name = (user.username || user.name || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return code.includes(query) || name.includes(query);
  });

  return (
    <div className="space-y-8" dir="rtl">
      {/* Upper header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 bg-gradient-to-r from-red-950/20 via-zinc-950/40 to-indigo-950/20 border border-white/5 rounded-3xl backdrop-blur-md shadow-inner">
        <div>
          <h2 className="text-2xl font-black text-white kurdish-text flex items-center gap-3">
            <Activity className="w-7 h-7 text-red-500 animate-pulse" />
            چاودێری نامەکان و چالاکی بەکارهێنەران
          </h2>
          <p className="text-gray-400 kurdish-text text-xs mt-1.5 font-medium">
            پشکنین، چاودێریکردنی ڕاستەوخۆی هاتوچۆی نامەی حاشار، چالاکی گشتی و زانیاری نهێنی ئەندامان.
          </p>
        </div>
        <div>
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 px-5 py-3 bg-zinc-900 hover:bg-zinc-850 text-white rounded-2xl border border-white/10 text-xs font-bold kurdish-text transition-all shadow-md active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            نوێکردنەوەی داتا
          </button>
        </div>
      </div>

      {/* Errors or Warnings */}
      {error && (
        <div className="p-6 bg-red-950/30 border border-red-500/20 text-red-400 rounded-2xl text-xs kurdish-text leading-relaxed">
          ⚠️ {error}
        </div>
      )}

      {/* Main Panel Content */}
      <div className="bg-[#0c0d10] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
        {/* Filter controls */}
        <div className="p-6 border-b border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between bg-zinc-950/20">
          <div className="w-full md:max-w-md relative">
            <Search className="absolute right-4 top-3.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="گەڕان بەپێی کۆدی بێهاوتا (Unique Code) یان ناوی بەکارهێنەر..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-11 pl-4 py-3 bg-zinc-900 border border-white/5 rounded-2xl text-xs text-white kurdish-text placeholder-gray-500 focus:outline-none focus:border-red-500/55 focus:ring-1 focus:ring-red-500/20 transition-all font-mono"
            />
          </div>
          <div className="text-xs text-gray-400 kurdish-text font-semibold">
            کۆی دۆزراوەکان: <span className="text-white font-bold">{filteredUsers.length}</span> بەکارهێنەر
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
              <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
              <p className="text-xs text-gray-400 kurdish-text">سەرقاڵی بارکردنی لیستی بەکارهێنەرانین...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 text-center space-y-3">
              <User className="w-12 h-12 text-gray-700" />
              <p className="text-xs text-gray-400 kurdish-text">هیچ بەکارهێنەرێک نەدۆزرایەوە بۆ گەڕانەکەت.</p>
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-white/5 text-gray-400 kurdish-text uppercase tracking-wider bg-zinc-950/40">
                  <th className="px-6 py-4 font-black">ناو / بەکارهێنەر</th>
                  <th className="px-6 py-4 font-black">کۆدی بێهاوتا (ID Code)</th>
                  <th className="px-6 py-4 font-black">ناونیشانی سێرڤەر (IP Address)</th>
                  <th className="px-6 py-4 font-black">وشەی تێپەڕ (Admin-only)</th>
                  <th className="px-6 py-4 font-black text-center">چالاکی / پشکنین</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((user) => {
                  const uId = user.uid || user.uniqueCode || Math.random().toString();
                  const showPass = !!showPassMap[uId];
                  return (
                    <tr 
                      key={uId} 
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => handleInspectUser(user.uniqueCode)}
                    >
                      {/* Name / Username */}
                      <td className="px-6 py-4.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500/10 to-indigo-500/10 border border-white/5 flex items-center justify-center text-white shrink-0 font-black">
                            {user.username ? user.username.charAt(0).toUpperCase() : "U"}
                          </div>
                          <div>
                            <p className="text-white font-bold kurdish-text group-hover:text-red-400 transition-colors">
                              {user.username || user.name || "بەکارهێنەر"}
                            </p>
                            <p className="text-[10px] text-gray-500 font-medium">
                              {user.role === "admin" ? "بەڕێوەبەر (Admin)" : (user.role || "ئەندام")}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Unique Code */}
                      <td className="px-6 py-4.5 font-mono text-zinc-300 font-bold tracking-wider">
                        <span className="px-2.5 py-1 bg-zinc-900 border border-white/5 rounded-lg text-[11px]">
                          {user.uniqueCode || "بێ کۆد"}
                        </span>
                      </td>

                      {/* IP address */}
                      <td className="px-6 py-4.5 font-mono text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-gray-600" />
                          {user.ip || user.deviceIp || "127.0.0.1"}
                        </span>
                      </td>

                      {/* Password (Admin visual) */}
                      <td className="px-6 py-4.5 font-mono" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] px-2.5 py-1 rounded-lg border leading-tight ${showPass ? "bg-red-950/10 border-red-500/20 text-red-400 font-bold" : "bg-zinc-900 border-white/5 text-gray-500 font-medium"}`}>
                            {showPass ? (user.password || "********") : "••••••••"}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(uId)}
                            className="p-1 px-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-gray-400 hover:text-white rounded-lg transition-all"
                            title={showPass ? "شاردنەوەی پاسوۆرد" : "پیشاندانی پاسوۆرد"}
                          >
                            {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      {/* Click-to-View Action */}
                      <td className="px-6 py-4.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleInspectUser(user.uniqueCode)}
                          className="px-3.5 py-2 bg-red-600/10 text-red-400 border border-red-600/20 hover:bg-red-600 hover:text-white rounded-xl text-[10px] font-black kurdish-text transition-all inline-flex items-center gap-1.5 active:scale-95 shadow-md"
                        >
                          <History className="w-3.5 h-3.5" />
                          پشکنین و لۆگەکان
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* DETAILED USER INSPECTION MODAL */}
      {inspectModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg">
          <div 
            className="w-full max-w-4xl max-h-[90vh] bg-[#0c0d10] border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-950/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-600/20 text-red-400 flex items-center justify-center font-black border border-red-600/30">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white kurdish-text">
                    هێڵی پشکنینی بەکارهێنەر: {detailsLoading ? "باردەکرێت..." : (selectedUser?.user?.username || selectedUser?.user?.name)}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-mono tracking-wider">
                    {selectedUser?.user?.uniqueCode || "باردەکرێت..."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setInspectModalOpen(false);
                }}
                className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-gray-400 hover:text-white rounded-xl transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Sub Tabs */}
            <div className="flex border-b border-white/5 bg-zinc-950/20">
              <button
                onClick={() => setActiveSubTab("messages")}
                className={`flex-1 py-3.5 text-xs font-black kurdish-text border-b-2 text-center transition-all flex items-center justify-center gap-2 ${
                  activeSubTab === "messages"
                    ? "border-red-500 text-white bg-red-500/5"
                    : "border-transparent text-gray-400 hover:text-white hover:bg-white/[0.01]"
                }`}
              >
                <Mail className="w-4 h-4 text-red-500" />
                مێژووی نامەکانی نێردراو ({selectedUser?.messages?.length || 0})
              </button>
              <button
                onClick={() => setActiveSubTab("activities")}
                className={`flex-1 py-3.5 text-xs font-black kurdish-text border-b-2 text-center transition-all flex items-center justify-center gap-2 ${
                  activeSubTab === "activities"
                    ? "border-red-500 text-white bg-red-500/5"
                    : "border-transparent text-gray-400 hover:text-white hover:bg-white/[0.01]"
                }`}
              >
                <Activity className="w-4 h-4 text-orange-500" />
                خشتەی چالاکییەکان ({selectedUser?.activities?.length || 0})
              </button>
              <button
                onClick={() => setActiveSubTab("metadata")}
                className={`flex-1 py-3.5 text-xs font-black kurdish-text border-b-2 text-center transition-all flex items-center justify-center gap-2 ${
                  activeSubTab === "metadata"
                    ? "border-red-500 text-white bg-red-500/5"
                    : "border-transparent text-gray-400 hover:text-white hover:bg-white/[0.01]"
                }`}
              >
                <Globe className="w-4 h-4 text-blue-500" />
                زانیاری تۆمارکردن و میتاداتا
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 min-h-[350px]">
              {detailsLoading ? (
                <div className="flex flex-col items-center justify-center p-20 space-y-4">
                  <RefreshCw className="w-10 h-10 text-red-500 animate-spin" />
                  <p className="text-xs text-gray-400 kurdish-text animate-pulse">خەریکە داتا و نامەکانی ئەم ئەندامە کۆدەکەینەوە...</p>
                </div>
              ) : selectedUser ? (
                <div className="space-y-6">
                  
                  {/* SUB TAB 1: ALL MESSAGES SENT */}
                  {activeSubTab === "messages" && (
                    <div className="space-y-4">
                      {selectedUser.messages?.length === 0 ? (
                        <div className="p-12 text-center border border-dashed border-white/5 rounded-2xl">
                          <Mail className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                          <p className="text-xs text-gray-400 kurdish-text">ئەم بەکارهێنەرە هیچ نامەیەکی نەناردووە تا ئێستا.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedUser.messages.map((msg: any) => (
                            <div 
                              key={msg.id} 
                              className="p-4 rounded-2xl bg-[#111217] border border-white/5 hover:border-white/10 transition-colors flex flex-col justify-between gap-2.5"
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="px-2 py-0.5 rounded-md text-red-400 bg-red-500/10 border border-red-500/10 kurdish-text font-bold">
                                  {msg.type}
                                </span>
                                <span className="text-gray-500 font-mono flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(msg.timestamp).toLocaleString("ku-IQ") || msg.timestamp}
                                </span>
                              </div>
                              <p className="text-white text-xs leading-relaxed kurdish-text whitespace-pre-wrap font-medium">
                                {msg.text}
                              </p>
                              {msg.destination && (
                                <div className="text-[10px] text-gray-400 flex items-center gap-1 font-mono">
                                  <span className="kurdish-text font-bold">وەرگر/ژوور:</span>
                                  <span className="text-red-400/80 font-bold">{msg.destination}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB TAB 2: ACTIVITIES TIMELINE */}
                  {activeSubTab === "activities" && (
                    <div className="space-y-4">
                      {selectedUser.activities?.length === 0 ? (
                        <div className="p-12 text-center border border-dashed border-white/5 rounded-2xl">
                          <Activity className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                          <p className="text-xs text-gray-400 kurdish-text">هیچ لۆگێکی چالاکی ڕاستەوخۆ دەستنیشان نەکراوە بۆ ئەم فیلتەرە.</p>
                        </div>
                      ) : (
                        <div className="relative border-r-2 border-white/5 pr-4 mr-2 space-y-6">
                          {selectedUser.activities.map((act: any) => (
                            <div key={act.id} className="relative group">
                              {/* Dot marker on history line */}
                              <div className="absolute right-[-21px] top-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-[#0c0d10] group-hover:scale-125 transition-transform" />
                              
                              <div className="p-4 bg-[#111217] rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-white/10 transition-colors">
                                <div>
                                  <h4 className="text-white font-bold text-xs kurdish-text">
                                    {act.action}
                                  </h4>
                                  <p className="text-gray-400 text-[11px] kurdish-text mt-1">
                                    {act.details}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(act.timestamp).toLocaleString("ku-IQ")}
                                  </span>
                                  <span className="text-[10px] text-gray-500 font-mono bg-zinc-950 px-2 py-0.5 rounded-md border border-white/5">
                                    IP: {act.ip}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB TAB 3: IP, REGISTRATION AND LOGIN METADATA */}
                  {activeSubTab === "metadata" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left: Metadata Details */}
                      <div className="p-5 bg-[#111217] rounded-2xl border border-white/5 space-y-4">
                        <h4 className="text-white font-black text-xs border-b border-white/5 pb-2.5 kurdish-text flex items-center gap-2">
                          <Globe className="w-4 h-4 text-blue-400" />
                          زانیاری گشتی و ناونیشانی یەکەمین
                        </h4>
                        
                        <div className="space-y-3.5 text-xs">
                          <div className="flex justify-between items-center bg-zinc-900/35 p-2 rounded-lg">
                            <span className="text-gray-400 kurdish-text">ئایپی تۆمارکردن / چوونەژوورەوە</span>
                            <span className="text-white font-mono font-bold bg-zinc-950 px-2 py-0.5 rounded border border-white/5">
                              {selectedUser.metadata?.registeredIp || "Unknown"}
                            </span>
                          </div>

                          <div className="flex justify-between items-center bg-zinc-900/35 p-2 rounded-lg">
                            <span className="text-gray-400 kurdish-text">بەرواری دروستکردن</span>
                            <span className="text-white font-mono font-bold">
                              {selectedUser.metadata?.registeredAt !== "Unknown" 
                                ? new Date(selectedUser.metadata.registeredAt).toLocaleDateString("ku-IQ")
                                : "دیاری نەکراوە"
                              }
                            </span>
                          </div>

                          <div className="flex justify-between items-center bg-zinc-900/35 p-2 rounded-lg">
                            <span className="text-gray-400 kurdish-text">کۆتا بینین / چوونەژوورە</span>
                            <span className="text-white font-mono font-bold">
                              {selectedUser.metadata?.lastActive !== "Unknown"
                                ? new Date(selectedUser.metadata.lastActive).toLocaleString("ku-IQ")
                                : "دیاری نەکراوە"
                              }
                            </span>
                          </div>

                          <div className="flex justify-between items-center bg-zinc-900/35 p-2 rounded-lg">
                            <span className="text-gray-400 kurdish-text">وشەی تێپەڕی نهێنی</span>
                            <span className="text-red-400 font-mono font-bold">
                              {selectedUser.user?.password}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Registration fields */}
                      <div className="p-5 bg-[#111217] rounded-2xl border border-white/5 space-y-4">
                        <h4 className="text-white font-black text-xs border-b border-white/5 pb-2.5 kurdish-text flex items-center gap-2">
                          <User className="w-4 h-4 text-red-400" />
                          فۆرمی تۆمارکراو لەلایەن بەکارهێنەرەوە
                        </h4>
                        
                        <div className="space-y-3 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 kurdish-text">مۆبایل / تەلەفۆن</span>
                            <span className="text-white font-bold font-mono">{selectedUser.metadata?.registrationDetails?.phone}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 kurdish-text">ئیمەیڵی فەرمی</span>
                            <span className="text-white font-bold font-mono">{selectedUser.metadata?.registrationDetails?.email}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 kurdish-text">تەمەن (Age)</span>
                            <span className="text-white font-bold">{selectedUser.metadata?.registrationDetails?.age || "دیاری نەکراوە"}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 kurdish-text">ڕەگەز (Gender)</span>
                            <span className="text-white font-bold kurdish-text">{selectedUser.metadata?.registrationDetails?.gender === "male" ? "نێر" : (selectedUser.metadata?.registrationDetails?.gender === "female" ? "مێ" : "دیاری نەکراوە")}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 kurdish-text">شوێنی نیشتەجێبوون</span>
                            <span className="text-white font-bold kurdish-text">{selectedUser.metadata?.registrationDetails?.residence || "دیاری نەکراوە"}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 kurdish-text">وڵات (Country)</span>
                            <span className="text-white font-bold kurdish-text">{selectedUser.metadata?.registrationDetails?.country || "دیاری نەکراوە"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 flex justify-end bg-zinc-950/40">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setInspectModalOpen(false);
                }}
                className="px-6 py-2.5 bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-white rounded-xl text-xs font-black kurdish-text transition-colors"
              >
                داخستن
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
