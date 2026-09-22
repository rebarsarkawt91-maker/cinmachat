import React, { useEffect, useState } from "react";
import { Loader2, User } from "lucide-react";

type PublicRoom = {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  videoUrl?: string;
  movieUrl?: string;
  creatorAdminUsername?: string;
  createdBy?: string;
  active?: boolean;
  status?: string;
};

const youtubeId = (url: string) => url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1] || "";

const RoomPlayer = ({ url, title }: { url: string; title: string }) => {
  const id = youtubeId(url);
  if (id) return <iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={title} className="h-full w-full" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />;
  return <video src={url} controls preload="metadata" playsInline className="h-full w-full object-cover" aria-label={title} />;
};

export default function AdminMovieRoomCards() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin-movie-rooms", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "room fetch failed");
        setRooms((Array.isArray(data?.rooms) ? data.rooms : []).filter((room: PublicRoom) =>
          room.active !== false && !["inactive", "closed", "deleted"].includes(String(room.status || "active").toLowerCase()),
        ));
      })
      .catch((error) => { if (error?.name !== "AbortError") console.error("Admin movie rooms failed:", error); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (loading) return <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-red-500" />;
  if (rooms.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="mb-4 text-lg font-black text-white kurdish-text">ژوورە فیلمییەکانی سینەما چات</h3>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => {
          const title = room.title || room.name || "CinemaChat Movie Room";
          const url = room.videoUrl || room.movieUrl || "";
          const creator = room.creatorAdminUsername || room.createdBy || "CinemaChat";
          return <article key={room.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
            <div className="aspect-video bg-black">{url ? <RoomPlayer url={url} title={title} /> : <div className="flex h-full items-center justify-center text-xs text-zinc-600">No video</div>}</div>
            <div className="p-4"><h4 className="font-black text-white kurdish-text">{title}</h4>{room.description && <p className="mt-2 line-clamp-2 text-xs text-zinc-400 kurdish-text">{room.description}</p>}<p className="mt-3 flex items-center gap-2 text-xs font-bold text-red-400"><User className="h-3.5 w-3.5" />{creator}</p></div>
          </article>;
        })}
      </div>
    </div>
  );
}
