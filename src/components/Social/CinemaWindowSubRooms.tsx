import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Edit3, Loader2, Pause, Play, Plus, Trash2, User, Volume2, VolumeX, X } from "lucide-react";
import { api } from "../../services/api";

type MovieRoom = {
  id: string;
  title?: string;
  name?: string;
  videoUrl?: string;
  movieUrl?: string;
  creatorAdminUsername?: string;
  createdBy?: string;
  active?: boolean;
  status?: string;
  localOnly?: boolean;
  uniqueCode?: string;
  whatsappNumber?: string;
  bankAccountNumber?: string;
  telegramChannel?: string;
  accessPrice?: number;
  showWhatsapp?: boolean;
};

const activeRoom = (room: MovieRoom) =>
  room.active !== false && !["inactive", "closed", "deleted"].includes(String(room.status || "active").toLowerCase());

const LOCAL_ROOM_CACHE_KEY = "cinemachat_local_admin_movie_rooms";
const UNLOCKED_ROOMS_KEY = "unlocked_rooms";
const UNLOCK_DURATION_MS = 24 * 60 * 60 * 1000;
const loadCachedLocalRooms = (): MovieRoom[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_ROOM_CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((room) => room?.id && room?.localOnly) : [];
  } catch {
    return [];
  }
};
const hasValidRoomUnlock = (roomId: string): boolean => {
  try {
    const unlocks = JSON.parse(window.localStorage.getItem(UNLOCKED_ROOMS_KEY) || "{}");
    let unlockedAt = Number(unlocks?.[roomId] || 0);

    // One-time migration for browsers that unlocked a room before the shared
    // unlocked_rooms map was introduced.
    if (!unlockedAt) {
      const legacyRaw = window.localStorage.getItem(`unlocked_room_${roomId}`);
      const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
      unlockedAt = new Date(legacy?.verifiedAt || 0).getTime();
      if (Number.isFinite(unlockedAt) && unlockedAt > 0) unlocks[roomId] = unlockedAt;
    }
    if (!Number.isFinite(unlockedAt) || Date.now() - unlockedAt >= UNLOCK_DURATION_MS) {
      delete unlocks[roomId];
      window.localStorage.removeItem(`unlocked_room_${roomId}`);
      window.localStorage.setItem(UNLOCKED_ROOMS_KEY, JSON.stringify(unlocks));
      return false;
    }
    window.localStorage.setItem(UNLOCKED_ROOMS_KEY, JSON.stringify(unlocks));
    return true;
  } catch {
    return false;
  }
};

const saveRoomUnlock = (roomId: string) => {
  const unlockedAt = Date.now();
  try {
    const unlocks = JSON.parse(window.localStorage.getItem(UNLOCKED_ROOMS_KEY) || "{}");
    unlocks[roomId] = unlockedAt;
    window.localStorage.setItem(UNLOCKED_ROOMS_KEY, JSON.stringify(unlocks));
  } catch {
    try {
      window.localStorage.setItem(UNLOCKED_ROOMS_KEY, JSON.stringify({ [roomId]: unlockedAt }));
    } catch {
      // Private browsing may disable storage; the current in-memory session
      // still opens immediately after successful verification.
    }
  }
};

const youtubeId = (url: string) =>
  url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1] || "";

const roomDirectUrl = (roomId: string) => {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("cinemaWindowRoom", roomId);
  url.hash = `cinema-sub-room-${roomId}`;
  return url.toString();
};

const formatAccessPrice = (value: number) => new Intl.NumberFormat("ku-IQ", { maximumFractionDigits: 0 }).format(value);

const VideoPlayer = ({ room }: { room: MovieRoom }) => {
  const title = room.title || room.name || "Cinema Window";
  const url = room.videoUrl || room.movieUrl || "";
  const id = youtubeId(url);
  if (!url) return <div className="flex h-full items-center justify-center text-xs text-zinc-600">No video</div>;
  if (id) {
    const embedParams = new URLSearchParams({
      autoplay: "1",
      mute: "1",
      playsinline: "1",
      controls: "0",
      modestbranding: "1",
      rel: "0",
      showinfo: "0",
      iv_load_policy: "3",
      fs: "0",
      disablekb: "1",
    });
    return <iframe title={title} src={`https://www.youtube-nocookie.com/embed/${id}?${embedParams.toString()}`} loading="eager" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" className="pointer-events-none h-full w-full border-0" />;
  }
  return <video src={url} controls autoPlay muted preload="auto" playsInline className="h-full w-full object-contain" />;
};

const FullscreenVideoPlayer = ({ room }: { room: MovieRoom }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [volume, setVolume] = useState(100);
  const url = room.videoUrl || room.movieUrl || "";
  const id = youtubeId(url);
  const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "https://www.youtube-nocookie.com");
  };
  const togglePlayback = () => {
    if (id) sendYouTubeCommand(playing ? "pauseVideo" : "playVideo");
    else if (videoRef.current) playing ? videoRef.current.pause() : void videoRef.current.play();
    setPlaying((current) => !current);
  };
  const setPlayerVolume = (next: number) => {
    setVolume(next);
    if (id) {
      sendYouTubeCommand(next === 0 ? "mute" : "unMute");
      sendYouTubeCommand("setVolume", [next]);
    } else if (videoRef.current) {
      videoRef.current.muted = next === 0;
      videoRef.current.volume = next / 100;
    }
  };
  const params = new URLSearchParams({ autoplay: "1", mute: "0", playsinline: "1", controls: "0", modestbranding: "1", rel: "0", showinfo: "0", iv_load_policy: "3", fs: "0", disablekb: "1", enablejsapi: "1", origin: window.location.origin });

  return <div className="relative h-full w-full overflow-hidden bg-black" dir="ltr">
    {id ? <iframe ref={iframeRef} title={room.title || room.name || "Cinema Window"} src={`https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`} onLoad={() => { sendYouTubeCommand("unMute"); sendYouTubeCommand("setVolume", [100]); sendYouTubeCommand("playVideo"); }} allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" className="pointer-events-none absolute inset-0 h-full w-full border-0" /> : <video ref={videoRef} src={url} autoPlay playsInline preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} className="h-full w-full object-contain" />}
    <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black via-black/70 to-transparent" />
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-4 bg-gradient-to-t from-black via-black/90 to-transparent px-5 pb-5 pt-16 text-white">
      <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"} className="rounded-full bg-amber-500 p-3 text-black transition hover:scale-105">{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
      <button type="button" onClick={() => setPlayerVolume(volume === 0 ? 100 : 0)} aria-label={volume === 0 ? "Unmute" : "Mute"} className="rounded-full bg-white/10 p-3 hover:bg-white/20">{volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
      <input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={(event) => setPlayerVolume(Number(event.target.value))} className="h-1 w-28 accent-amber-500" />
    </div>
  </div>;
};

export default function CinemaWindowSubRooms({ currentUser, canAdminister = false }: { currentUser: any; canAdminister?: boolean }) {
  const adminName = String(currentUser?.username || "").trim();
  const role = String(currentUser?.role || "").toLowerCase();
  const canManageAll = canAdminister && (currentUser?.isOwner === true || ["owner", "super_admin", "deputy_manager"].includes(role));
  const [rooms, setRooms] = useState<MovieRoom[]>(loadCachedLocalRooms);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<MovieRoom | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [telegramChannel, setTelegramChannel] = useState("");
  const [accessPrice, setAccessPrice] = useState("");
  const [showWhatsapp, setShowWhatsapp] = useState(true);
  const [message, setMessage] = useState("");
  const [roomCodes, setRoomCodes] = useState<Record<string, string>>({});
  const [checkingRoomId, setCheckingRoomId] = useState("");
  const [, setUnlockedRoomIds] = useState<Set<string>>(() => new Set());
  const [fullScreenRoom, setFullScreenRoom] = useState<MovieRoom | null>(null);

  const visibleRooms = useMemo(() => rooms.filter(activeRoom), [rooms]);
  const ownActiveCount = visibleRooms.filter((room) =>
    String(room.creatorAdminUsername || room.createdBy || "").toLowerCase() === adminName.toLowerCase()).length;

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const path = canAdminister ? `/api/admin-movie-rooms?adminName=${encodeURIComponent(adminName)}` : "/api/admin-movie-rooms";
      const response = await fetch(api.resolveApiUrl(path), {
        headers: canAdminister ? { "x-admin-username": adminName } : undefined,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "نەتوانرا ژوورەکان بهێنرێن");
      const fetchedRooms: MovieRoom[] = Array.isArray(data?.rooms) ? data.rooms : [];
      // Keep only emergency-local rooms alongside canonical database rooms.
      // This makes a locally-created card remain public after admin logout,
      // while normal server-created rooms always come from the database.
      setRooms((current) => [
        ...fetchedRooms,
        ...current.filter((room) => room.localOnly && !fetchedRooms.some((remote) => remote.id === room.id)),
      ]);
    } catch (error: any) {
      // The UI remains usable while an older localhost/backend process is
      // running without this route. Do not surface its generic 404 banner.
      console.warn("Admin movie rooms API unavailable; keeping local rooms:", error);
      setMessage("");
    } finally {
      setLoading(false);
    }
  }, [adminName, canAdminister]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);

  useEffect(() => {
    if (loading) return;
    const roomId = new URLSearchParams(window.location.search).get("cinemaWindowRoom");
    if (!roomId) return;
    window.requestAnimationFrame(() => document.getElementById(`cinema-sub-room-${roomId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [loading, visibleRooms]);

  useEffect(() => {
    try {
      const publicLocalRooms = rooms
        .filter((room) => room.localOnly && activeRoom(room))
        .map(({ uniqueCode: _privateCode, ...room }) => room);
      window.localStorage.setItem(LOCAL_ROOM_CACHE_KEY, JSON.stringify(publicLocalRooms));
    } catch {
      // Storage can be disabled in private browsing; in-memory fallback remains.
    }
  }, [rooms]);

  const openCreate = () => {
    if (ownActiveCount >= 3) {
      setMessage("ناتوانیت زیاتر لە ٣ ژووری چالاک دروست بکەیت.");
      return;
    }
    setEditing(null);
    setTitle("");
    setVideoUrl("");
    setWhatsappNumber("");
    setBankAccountNumber("");
    setTelegramChannel("");
    setAccessPrice("");
    setShowWhatsapp(true);
    setMessage("");
    setShowForm(true);
  };

  const openEdit = (room: MovieRoom) => {
    setEditing(room);
    setTitle(room.title || room.name || "");
    setVideoUrl(room.videoUrl || room.movieUrl || "");
    setWhatsappNumber(room.whatsappNumber || "");
    setBankAccountNumber(room.bankAccountNumber || "");
    setTelegramChannel(room.telegramChannel || "");
    setAccessPrice(room.accessPrice === undefined ? "" : String(room.accessPrice));
    setShowWhatsapp(room.showWhatsapp !== false);
    setMessage("");
    setShowForm(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const applyLocalFallback = () => {
      if (editing) {
        const locallyUpdated: MovieRoom = {
          ...editing,
          title: title.trim(),
          videoUrl: videoUrl.trim(),
          movieUrl: videoUrl.trim(),
          creatorAdminUsername: editing.creatorAdminUsername || editing.createdBy || adminName,
          whatsappNumber: whatsappNumber.replace(/\D/g, ""),
          bankAccountNumber: bankAccountNumber.replace(/\D/g, ""),
          telegramChannel: telegramChannel.trim(),
          accessPrice: Number(accessPrice || 0),
          showWhatsapp,
          localOnly: true,
        };
        setRooms((current) => current.map((room) => room.id === editing.id ? locallyUpdated : room));
      } else {
        const localRoom: MovieRoom = {
          id: `local_movie_room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: title.trim(),
          videoUrl: videoUrl.trim(),
          movieUrl: videoUrl.trim(),
          creatorAdminUsername: adminName,
          createdBy: adminName,
          status: "active",
          active: true,
          localOnly: true,
          uniqueCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
          whatsappNumber: whatsappNumber.replace(/\D/g, ""),
          bankAccountNumber: bankAccountNumber.replace(/\D/g, ""),
          telegramChannel: telegramChannel.trim(),
          accessPrice: Number(accessPrice || 0),
          showWhatsapp,
        };
        setRooms((current) => [localRoom, ...current]);
      }
      setShowForm(false);
      setEditing(null);
      setTitle("");
      setVideoUrl("");
      setWhatsappNumber("");
      setBankAccountNumber("");
      setMessage("ژوورەکە بە سەرکەوتوویی لەم لاپەڕەیە زیادکرا.");
    };

    try {
      const path = editing ? `/api/admin-movie-rooms/${encodeURIComponent(editing.id)}` : "/api/admin-movie-rooms";
      const response = await fetch(api.resolveApiUrl(path), {
        method: editing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-admin-username": adminName,
        },
        body: JSON.stringify({
          adminName,
          movieTitle: title.trim(),
          movieVideoUrl: videoUrl.trim(),
          whatsappNumber: whatsappNumber.replace(/\D/g, ""),
          bankAccountNumber: bankAccountNumber.replace(/\D/g, ""),
          telegramChannel: telegramChannel.trim(),
          accessPrice: Number(accessPrice || 0),
          showWhatsapp,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const limitReached = response.status === 400 && /3 active|more than 3/i.test(String(data?.error || ""));
        if (response.status === 404) {
          applyLocalFallback();
          return;
        }
        setMessage(limitReached ? "ناتوانیت زیاتر لە ٣ ژووری چالاک دروست بکەیت." : (data?.error || "پاشەکەوتکردن سەرکەوتوو نەبوو"));
        return;
      }
      setShowForm(false);
      // Render the returned room immediately, then reconcile with the server so
      // creation/editing never requires a manual page refresh.
      if (data?.room?.id) {
        setRooms((current) => editing
          ? current.map((room) => room.id === data.room.id ? data.room : room)
          : [data.room, ...current.filter((room) => room.id !== data.room.id)]);
      }
      setEditing(null);
      setTitle("");
      setVideoUrl("");
      setWhatsappNumber("");
      setBankAccountNumber("");
      setTelegramChannel("");
      setAccessPrice("");
      setShowWhatsapp(true);
      void loadRooms();
    } catch (error: any) {
      console.warn("Admin movie room write API unavailable; using local state:", error);
      applyLocalFallback();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (room: MovieRoom) => {
    if (!window.confirm(`ژووری «${room.title || room.name}» بسڕدرێتەوە؟`)) return;
    try {
      if (room.localOnly) {
        setRooms((current) => current.filter((candidate) => candidate.id !== room.id));
        return;
      }
      const response = await fetch(api.resolveApiUrl(`/api/admin-movie-rooms/${encodeURIComponent(room.id)}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-username": adminName },
        body: JSON.stringify({ adminName }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          setRooms((current) => current.filter((candidate) => candidate.id !== room.id));
          return;
        }
        throw new Error(data?.error || "سڕینەوە سەرکەوتوو نەبوو");
      }
      await loadRooms();
    } catch (error: any) {
      console.warn("Admin movie room delete API unavailable; removing local card:", error);
      setRooms((current) => current.filter((candidate) => candidate.id !== room.id));
      setMessage("");
    }
  };

  const copyRoomCode = async (room: MovieRoom) => {
    if (!room.uniqueCode) {
      setMessage("کۆدی ئەم ژوورە تەنها بۆ دروستکەر یان بەڕێوەبەر بەردەستە.");
      return;
    }
    try {
      await navigator.clipboard.writeText(room.uniqueCode);
      setMessage(`کۆدی ژوور کۆپی کرا: ${room.uniqueCode}`);
    } catch {
      setMessage(`کۆدی ژوور: ${room.uniqueCode}`);
    }
  };

  const verifyRoomCode = async (event: React.FormEvent, room: MovieRoom) => {
    event.preventDefault();
    const uniqueCode = String(roomCodes[room.id] || "").trim();
    const accessError = "تکایە کۆدی بێهاوتای ژوورەکە بنووسە بۆ چوونەژوورەوە";
    if (!/^[A-Za-z0-9]{8}$/.test(uniqueCode)) {
      setMessage(accessError);
      window.alert(accessError);
      return;
    }
    setCheckingRoomId(room.id);
    try {
      const response = await fetch(api.resolveApiUrl("/api/admin-movie-rooms/access"), { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ roomId: room.id, uniqueCode }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success !== true) throw new Error(data?.error || "کۆدەکە دروست نییە");
      setUnlockedRoomIds((current) => new Set(current).add(room.id));
      saveRoomUnlock(room.id);
      setMessage(data?.message || "کۆدەکە دروستە");
      setRoomCodes((current) => ({ ...current, [room.id]: "" }));
      setFullScreenRoom(room);
    } catch (error: any) {
      console.warn("Movie room access denied:", error?.message || error);
      setMessage(accessError);
      window.alert(accessError);
    } finally {
      setCheckingRoomId("");
    }
  };

  return <div dir="rtl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-xl font-black text-white kurdish-text">ژوورە فیلمییەکانی Cinema Window</h2><p className="mt-1 text-xs text-zinc-500 kurdish-text">فیلمەکان ڕاستەوخۆ لە کارتەکاندا پەخش بکە</p></div>
      {canAdminister && <button onClick={openCreate} disabled={ownActiveCount >= 3} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-5 w-5" /> دروستکردنی ژووری نوێ</button>}
    </div>
    {message && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 kurdish-text">{message}</div>}
    {loading ? <Loader2 className="mx-auto my-16 h-8 w-8 animate-spin text-amber-400" /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {visibleRooms.map((room) => {
        const creator = room.creatorAdminUsername || room.createdBy || "CinemaChat";
        const canEdit = canAdminister && (canManageAll || creator.toLowerCase() === adminName.toLowerCase());
        const isUnlocked = hasValidRoomUnlock(room.id);
        const directUrl = roomDirectUrl(room.id);
        return <article id={`cinema-sub-room-${room.id}`} key={room.id} className="group relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 transition-all hover:scale-[1.02] hover:border-red-500/40">
          <div className="aspect-video overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-950"><VideoPlayer room={room} /></div>
          <div className="p-4">
            <h3 className="line-clamp-1 text-sm font-black leading-snug text-white kurdish-text">{room.title || room.name}</h3>
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-300"><User className="h-3.5 w-3.5" />دروستکراوە لەلایەن: {creator}</p>
            {canEdit && <button type="button" onClick={() => void copyRoomCode(room)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-2 text-xs font-black text-fuchsia-200"><Copy className="h-4 w-4" /> کۆپی کردنی کۆد</button>}
            {room.accessPrice !== undefined && <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-center text-xs font-black text-amber-300 kurdish-text">نرخی چوونەژوورەوە بۆ ئەم ژوورە: {formatAccessPrice(Number(room.accessPrice) || 0)} دینار</div>}
            {!canAdminister && <form noValidate onSubmit={(event) => void verifyRoomCode(event, room)} className="mt-3 rounded-xl border border-white/10 bg-black/50 p-3">
              <label className="mb-2 block text-xs font-black text-zinc-300 kurdish-text">کۆدی بێ هاوتا بۆ ژووری {room.title || room.name}</label>
              <div dir="ltr" className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input required minLength={8} maxLength={8} pattern="[A-Za-z0-9]{8}" value={roomCodes[room.id] || ""} onChange={(event) => setRoomCodes((current) => ({ ...current, [room.id]: event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) }))} placeholder="کۆدی بێ هاوتا" aria-label="کۆدی بێ هاوتا" className="min-w-0 rounded-xl border border-fuchsia-500/50 bg-black px-3 py-2 text-left font-mono text-xs uppercase text-white outline-none focus:border-fuchsia-400" />
                <button disabled={checkingRoomId === room.id} className={`rounded-xl px-3 py-2 text-xs font-black text-white disabled:opacity-50 ${isUnlocked ? "border border-emerald-400/50 bg-gradient-to-r from-emerald-600 to-amber-500" : "bg-red-600 hover:bg-red-500"}`}>{checkingRoomId === room.id ? "..." : isUnlocked ? "چوونەژوورەوە (چالاکە بۆ ٢٤ کاتژمێر)" : "چوونەژوورەوە"}</button>
              </div>
            </form>}
            {room.showWhatsapp !== false && room.whatsappNumber && <a href={`https://wa.me/${room.whatsappNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-300"><svg viewBox="0 0 32 32" className="h-5 w-5 fill-current" aria-hidden="true"><path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6c-2.1 0-4.1-.6-5.8-1.7l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-2-.8-3.4-1.9-4.5-3.8-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 3s1.3 3.5 1.5 3.7c.2.2 2.5 3.9 6.2 5.4 2.3 1 3.2 1.1 4.4.9.7-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" /></svg> پەیوەندی لە وەتسئەپ / ناردنی پسوولە — {room.whatsappNumber}</a>}
            {room.telegramChannel && <a href={room.telegramChannel} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-300"><svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true"><path d="M21.7 3.3 18.5 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.1c.4-.4-.1-.6-.6-.2L6 13.8l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.2 3.5c.9-.3 1.7.2 1.5-.2Z" /></svg> جۆینبوون لە چەناڵی تەلەگرام</a>}
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(directUrl)}`} alt={`QR code for ${room.title || room.name || "Cinema Window"}`} loading="lazy" className="h-20 w-20 shrink-0 rounded-lg bg-white p-1" /><div className="min-w-0 text-xs text-zinc-400 kurdish-text"><p className="font-black text-white">QR Code</p><p className="mt-1">سکانی بکە بۆ کردنەوەی ئەم ژوورە</p></div></div>
            {room.bankAccountNumber && <div className="mt-3 max-w-full overflow-hidden rounded-xl border border-blue-500/40 bg-blue-500/10 p-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><div className="flex shrink-0 items-center gap-1"><span className="rounded bg-blue-700 px-2 py-1 text-[9px] font-black italic text-white">VISA</span><span className="flex -space-x-1"><span className="h-5 w-5 rounded-full bg-red-500" /><span className="h-5 w-5 rounded-full bg-amber-400 opacity-90" /></span></div><div className="min-w-0 flex-1 basis-[130px]"><p className="text-[10px] font-bold text-blue-300">ژمارەی حیسابی بانکی</p><p dir="ltr" className="max-w-full break-all whitespace-normal font-mono text-xs font-black leading-5 tracking-wide text-blue-100">{room.bankAccountNumber}</p></div><button type="button" onClick={() => void navigator.clipboard.writeText(room.bankAccountNumber || "")} className="w-full shrink-0 rounded-lg bg-blue-500 px-3 py-2 text-[10px] font-black text-white sm:w-auto">کۆپیکردن</button></div></div>}
          </div>
          {canEdit && <div className="absolute left-3 top-3 z-10 flex gap-2"><button onClick={() => openEdit(room)} aria-label="دەستکاری" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white hover:text-red-500"><Edit3 className="h-3.5 w-3.5" /></button><button onClick={() => void remove(room)} aria-label="سڕینەوە" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></div>}
        </article>;
      })}
      {visibleRooms.length === 0 && <p className="text-sm text-zinc-500 kurdish-text">هێشتا هیچ ژوورێکی چالاک نییە.</p>}
    </div>}

    {fullScreenRoom && <div className="fixed inset-0 z-[980] flex flex-col bg-black p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={fullScreenRoom.title || fullScreenRoom.name || "Cinema Window"}>
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="truncate text-lg font-black text-white kurdish-text">{fullScreenRoom.title || fullScreenRoom.name}</h2><button type="button" onClick={() => setFullScreenRoom(null)} aria-label="داخستن" className="rounded-full bg-white/10 p-3 text-white hover:bg-white/20"><X className="h-6 w-6" /></button></div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950"><FullscreenVideoPlayer room={fullScreenRoom} /></div>
    </div>}

    {showForm && <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="relative w-full max-w-lg space-y-4 rounded-3xl border border-amber-500/20 bg-[#0b0c10] p-6 shadow-2xl">
        <button type="button" onClick={() => setShowForm(false)} className="absolute left-5 top-5 rounded-lg bg-white/5 p-2 text-zinc-400"><X className="h-4 w-4" /></button>
        <h3 className="text-lg font-black text-white kurdish-text">{editing ? "دەستکاریکردنی ژوور" : "دروستکردنی ژووری نوێ"}</h3>
        <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="ناوی فیلم" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-amber-500/50" />
        <input required type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="لینکی ڤیدیۆی فیلم" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-amber-500/50" />
        <input inputMode="tel" value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="ژمارەی وەتسئەپ (بە کۆدی وڵات)" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-emerald-500/50" />
        <input type="url" value={telegramChannel} onChange={(event) => setTelegramChannel(event.target.value)} placeholder="لینکی چەناڵی تەلەگرام — https://t.me/..." className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-sky-500/50" />
        <input inputMode="numeric" value={accessPrice} onChange={(event) => setAccessPrice(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="نرخی چوونەژوورەوە - بۆ نموونە: 1000 دینار" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-amber-500/50" />
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black px-4 py-3 font-bold text-white kurdish-text"><input type="checkbox" checked={showWhatsapp} onChange={(event) => setShowWhatsapp(event.target.checked)} className="h-5 w-5 accent-emerald-500" /><span>پیشاندانی ژمارەی وەتسئەپ لەسەر ژوورەکە</span></label>
        <input required inputMode="numeric" pattern="[0-9]{16}" maxLength={16} value={bankAccountNumber} onChange={(event) => setBankAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 16))} placeholder="ژمارەی حیسابی بانکی - ١٦ ژمارە" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-blue-500/50" />
        <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-black text-black disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} پاشەکەوتکردن</button>
      </form>
    </div>}
  </div>;
}
