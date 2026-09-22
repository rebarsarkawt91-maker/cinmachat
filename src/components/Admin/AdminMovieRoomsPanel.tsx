import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Edit3, Film, KeyRound, Loader2, LogOut, Plus, Trash2, X } from "lucide-react";
import { api } from "../../services/api";

type AdminMovieRoom = {
  id: string;
  title: string;
  description?: string;
  movieUrl?: string;
  videoUrl?: string;
  status?: string;
  active?: boolean;
  creatorAdminUsername?: string;
  createdBy?: string;
  whatsappNumber?: string;
  bankAccountNumber?: string;
  uniqueCode?: string;
  localOnly?: boolean;
};

interface Props {
  currentUser: any;
  onLogout: () => void;
  onClose: () => void;
}

const isActiveRoom = (room: AdminMovieRoom) =>
  room.active !== false && !["inactive", "closed", "deleted"].includes(String(room.status || "active").toLowerCase());

const LOCAL_ROOM_CACHE_KEY = "cinemachat_local_admin_movie_rooms";
const loadLocalRooms = (): AdminMovieRoom[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_ROOM_CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((room) => room?.id && room?.localOnly) : [];
  } catch { return []; }
};

export default function AdminMovieRoomsPanel({ currentUser, onLogout, onClose }: Props) {
  const adminName = String(currentUser?.username || "").trim();
  const [rooms, setRooms] = useState<AdminMovieRoom[]>(loadLocalRooms);
  const [editing, setEditing] = useState<AdminMovieRoom | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeView, setActiveView] = useState<"rooms" | "analytics">("rooms");
  const [codeRows, setCodeRows] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const ownRooms = useMemo(
    () => rooms.filter((room) =>
      String(room.creatorAdminUsername || room.createdBy || "").toLowerCase() === adminName.toLowerCase()),
    [rooms, adminName],
  );
  const activeCount = ownRooms.filter(isActiveRoom).length;

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(api.resolveApiUrl(`/api/admin-movie-rooms?adminName=${encodeURIComponent(adminName)}`), {
        headers: { "x-admin-username": adminName },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "نەتوانرا ژوورەکان بهێنرێن");
      const fetched: AdminMovieRoom[] = Array.isArray(data?.rooms) ? data.rooms : [];
      setRooms((current) => [...fetched, ...current.filter((room) => room.localOnly && !fetched.some((remote) => remote.id === room.id))]);
    } catch (error: any) {
      console.warn("Admin movie rooms API unavailable; keeping local rooms:", error);
      setMessage("");
    } finally {
      setLoading(false);
    }
  }, [adminName]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);

  useEffect(() => {
    try {
      const publicFallback = rooms.filter((room) => room.localOnly && isActiveRoom(room)).map(({ uniqueCode: _code, ...room }) => room);
      window.localStorage.setItem(LOCAL_ROOM_CACHE_KEY, JSON.stringify(publicFallback));
    } catch { /* local fallback remains in memory */ }
  }, [rooms]);

  const loadCodeAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const response = await fetch(`/api/admin-movie-rooms/code-analytics?adminName=${encodeURIComponent(adminName)}`, { headers: { "x-admin-username": adminName }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "نەتوانرا ئاماری کۆدەکان بهێنرێت");
      setCodeRows(Array.isArray(data?.codes) ? data.codes : []);
    } catch (error: any) {
      setMessage(error?.message || "هەڵەیەک ڕوویدا");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [adminName]);

  useEffect(() => { if (activeView === "analytics") void loadCodeAnalytics(); }, [activeView, loadCodeAnalytics]);

  const generateRoomCode = async (roomId: string) => {
    try {
      const response = await fetch(`/api/admin-movie-rooms/${encodeURIComponent(roomId)}/codes`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-username": adminName }, body: JSON.stringify({ adminName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "دروستکردنی کۆد سەرکەوتوو نەبوو");
      await navigator.clipboard.writeText(data.code).catch(() => undefined);
      setMessage(`کۆدی نوێ دروست و کۆپی کرا: ${data.code}`);
      await loadCodeAnalytics();
    } catch (error: any) {
      setMessage(error?.message || "هەڵەیەک ڕوویدا");
    }
  };

  if (activeView === "analytics") return (
    <div className="fixed inset-0 z-[510] overflow-y-auto bg-[#070707] text-white" dir="rtl"><div className="mx-auto min-h-full max-w-6xl px-5 py-8 md:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-xs font-black uppercase tracking-widest text-red-500">Restricted Admin</p><h1 className="mt-2 text-2xl font-black kurdish-text">ئاماری کۆدەکان</h1></div><div className="flex gap-2"><button onClick={onClose} className="rounded-xl bg-white/5 p-3"><X className="h-5 w-5" /></button><button onClick={onLogout} className="rounded-xl bg-red-600 px-4 py-3"><LogOut className="h-4 w-4" /></button></div></header>
      <nav className="mb-6 grid max-w-xl grid-cols-2 gap-2"><button onClick={() => setActiveView("rooms")} className="flex items-center justify-center gap-2 rounded-xl bg-white/5 p-3 font-black kurdish-text"><Film className="h-4 w-4" />ژوورەکانی فیلم</button><button className="flex items-center justify-center gap-2 rounded-xl bg-red-600 p-3 font-black kurdish-text"><BarChart3 className="h-4 w-4" />ئاماری کۆدەکان</button></nav>
      {message && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{message}</div>}
      {analyticsLoading ? <Loader2 className="mx-auto mt-20 h-8 w-8 animate-spin text-red-500" /> : <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[850px] text-right text-sm"><thead className="bg-white/5 text-zinc-400"><tr><th className="p-4">کۆدی بێ هاوتا</th><th className="p-4">فیلم / ژوور</th><th className="p-4">دۆخ</th><th className="p-4">کاتی بەکارهێنان</th><th className="p-4">User ID / IP</th><th className="p-4">کردار</th></tr></thead><tbody>{codeRows.map((row) => <tr key={`${row.roomId}-${row.uniqueCode}`} className="border-t border-white/10"><td className="p-4 font-mono text-amber-300">{row.uniqueCode}</td><td className="p-4 font-bold">{row.roomTitle}</td><td className="p-4"><span className={row.status === "used" ? "text-emerald-400" : "text-zinc-400"}>{row.status === "used" ? "بەکارهاتووە" : "بەکارنەهاتووە"}</span></td><td className="p-4 text-zinc-400">{row.usedAt ? new Date(row.usedAt).toLocaleString() : "—"}</td><td className="p-4 text-zinc-400">{row.usedByUserId || row.usedByIp || "—"}</td><td className="p-4"><button onClick={() => void generateRoomCode(row.roomId)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 font-black"><KeyRound className="h-4 w-4" />کۆدی نوێ</button></td></tr>)}</tbody></table>{codeRows.length === 0 && <p className="p-8 text-center text-zinc-500">هیچ کۆدێک نییە.</p>}</div>}
    </div></div>
  );

  const openCreate = () => {
    if (activeCount >= 3) {
      setMessage("ناتوانیت زیاتر لە ٣ ژووری چالاک هەبێت.");
      return;
    }
    setEditing(null);
    setTitle("");
    setVideoUrl("");
    setDescription("");
    setWhatsappNumber("");
    setBankAccountNumber("");
    setMessage("");
    setShowForm(true);
  };

  const openEdit = (room: AdminMovieRoom) => {
    setEditing(room);
    setTitle(room.title || "");
    setVideoUrl(room.videoUrl || room.movieUrl || "");
    setDescription(room.description || "");
    setWhatsappNumber(room.whatsappNumber || "");
    setBankAccountNumber(room.bankAccountNumber || "");
    setMessage("");
    setShowForm(true);
  };

  const saveRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const applyLocalFallback = () => {
      if (editing) {
        setRooms((current) => current.map((room) => room.id === editing.id ? { ...room, title, videoUrl, movieUrl: videoUrl, description, whatsappNumber, bankAccountNumber, localOnly: true } : room));
      } else {
        const localRoom: AdminMovieRoom = { id: `local_movie_room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, title, videoUrl, movieUrl: videoUrl, description, whatsappNumber, bankAccountNumber, creatorAdminUsername: adminName, createdBy: adminName, active: true, status: "active", localOnly: true, uniqueCode: Math.random().toString(36).slice(2, 10).toUpperCase() };
        setRooms((current) => [localRoom, ...current]);
      }
      setShowForm(false);
      setEditing(null);
      setMessage("ژوورەکە دەستبەجێ زیادکرا.");
    };
    try {
      const endpoint = editing ? `/api/admin-movie-rooms/${encodeURIComponent(editing.id)}` : "/api/admin-movie-rooms";
      const response = await fetch(api.resolveApiUrl(endpoint), {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "x-admin-username": adminName },
        body: JSON.stringify({ movieTitle: title, movieVideoUrl: videoUrl, whatsappNumber, bankAccountNumber, description }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) { applyLocalFallback(); return; }
        setMessage(data?.error || "پاشەکەوتکردن سەرکەوتوو نەبوو");
        return;
      }
      setShowForm(false);
      if (data?.room?.id) setRooms((current) => editing ? current.map((room) => room.id === data.room.id ? data.room : room) : [data.room, ...current.filter((room) => room.id !== data.room.id)]);
      setEditing(null);
      void loadRooms();
    } catch (error: any) {
      console.warn("Admin movie room write API unavailable; using local state:", error);
      applyLocalFallback();
    } finally {
      setSaving(false);
    }
  };

  const deleteRoom = async (room: AdminMovieRoom) => {
    if (!window.confirm(`ژووری «${room.title}» بسڕدرێتەوە؟`)) return;
    setMessage("");
    try {
      if (room.localOnly) { setRooms((current) => current.filter((candidate) => candidate.id !== room.id)); return; }
      const response = await fetch(api.resolveApiUrl(`/api/admin-movie-rooms/${encodeURIComponent(room.id)}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-username": adminName },
        body: JSON.stringify({ adminName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "سڕینەوە سەرکەوتوو نەبوو");
      await loadRooms();
    } catch (error: any) {
      setMessage(error?.message || "هەڵەیەک ڕوویدا");
    }
  };

  return (
    <div className="fixed inset-0 z-[510] overflow-y-auto bg-[#070707] text-white" dir="rtl">
      <div className="mx-auto min-h-full max-w-5xl px-5 py-8 md:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-red-500">main_broadcast_room</p>
            <h1 className="mt-2 text-2xl font-black kurdish-text">بەڕێوەبردنی ژوورەکانی سینەما چات</h1>
            <p className="mt-1 text-sm text-zinc-500 kurdish-text">{adminName} · {activeCount}/3 ژووری چالاک</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 p-3" aria-label="داخستن"><X className="h-5 w-5" /></button>
            <button onClick={onLogout} className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black kurdish-text"><LogOut className="h-4 w-4" />چوونەدەرەوە</button>
          </div>
        </header>

        <nav className="mb-6 grid max-w-xl grid-cols-2 gap-2"><button className="flex items-center justify-center gap-2 rounded-xl bg-red-600 p-3 font-black kurdish-text"><Film className="h-4 w-4" />ژوورەکانی فیلم</button><button onClick={() => setActiveView("analytics")} className="flex items-center justify-center gap-2 rounded-xl bg-white/5 p-3 font-black kurdish-text"><BarChart3 className="h-4 w-4" />ئاماری کۆدەکان</button></nav>

        <button
          onClick={openCreate}
          disabled={activeCount >= 3}
          className="mb-6 flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 font-black kurdish-text disabled:cursor-not-allowed disabled:opacity-40"
        ><Plus className="h-5 w-5" /> ژووری فیلمی نوێ</button>

        {message && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 kurdish-text">{message}</div>}

        {showForm && (
          <form onSubmit={saveRoom} className="mb-8 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="font-black kurdish-text">{editing ? "دەستکاریکردنی ژوور" : "دروستکردنی ژووری نوێ"}</h2>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ناوی فیلم" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 outline-none" />
            <input required type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="لینکی ڤیدیۆ / YouTube" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 outline-none" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="کورتە باس" className="min-h-24 w-full rounded-xl border border-white/10 bg-black px-4 py-3 outline-none" />
            <input inputMode="tel" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="ژمارەی وەتسئەپ (بە کۆدی وڵات)" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 outline-none" />
            <input required inputMode="numeric" pattern="[0-9]{16}" maxLength={16} value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 16))} placeholder="ژمارەی حیسابی بانکی - ١٦ ژمارە" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 outline-none" />
            <div className="flex gap-3">
              <button disabled={saving} className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-black disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} پاشەکەوتکردن</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-white/10 px-5 py-3">پاشگەزبوونەوە</button>
            </div>
          </form>
        )}

        {loading ? <Loader2 className="mx-auto mt-20 h-8 w-8 animate-spin text-red-500" /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {ownRooms.map((room) => (
              <article key={room.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="font-black kurdish-text">{room.title}</h3><p className="mt-1 text-xs text-zinc-500">{isActiveRoom(room) ? "چالاک" : "ناچالاک"}</p></div>
                  <div className="flex gap-2"><button onClick={() => openEdit(room)} className="rounded-lg bg-white/10 p-2" aria-label="دەستکاری"><Edit3 className="h-4 w-4" /></button><button onClick={() => void deleteRoom(room)} className="rounded-lg bg-red-500/15 p-2 text-red-400" aria-label="سڕینەوە"><Trash2 className="h-4 w-4" /></button></div>
                </div>
              </article>
            ))}
            {ownRooms.length === 0 && <p className="text-sm text-zinc-500 kurdish-text">هێشتا هیچ ژوورێکت دروست نەکردووە.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
