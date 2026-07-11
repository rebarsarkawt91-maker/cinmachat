import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Tv } from "lucide-react";

interface BroadcastPreviewCardProps {
  onJoinBroadcast: () => void;
  socialProfile?: { uniqueCode?: string; name?: string } | null;
}

export const BroadcastPreviewCard: React.FC<BroadcastPreviewCardProps> = ({
  onJoinBroadcast,
  socialProfile,
}) => {
  const [previewVideoId, setPreviewVideoId] = useState<string>("");

  // Periodically fetch main broadcast room status (lightweight live feed preview monitoring)
  useEffect(() => {
    let active = true;
    const fetchPreviewUrl = async () => {
      try {
        const uCode = encodeURIComponent(socialProfile?.uniqueCode || "guest");
        const res = await fetch(`/api/rooms/main_broadcast_room?userCode=${uCode}`);
        if (res.ok && active) {
          const data = await res.json();
          const url = data.currentMovieUrl || "";
          let videoId = "";
          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
          const match = url.match(regExp);
          if (match && match[2].length === 11) {
            videoId = match[2];
          } else {
            videoId = url; // fallback
          }
          setPreviewVideoId(videoId);
        }
      } catch (err) {
        console.warn("Could not load preview broadcast room state:", err);
      }
    };

    fetchPreviewUrl();
    const interval = setInterval(fetchPreviewUrl, 10000); // lightweight: every 10 seconds
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [socialProfile?.uniqueCode]);

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden relative group h-full flex flex-col justify-between">
      <div 
        onClick={onJoinBroadcast}
        className="aspect-video relative overflow-hidden bg-gradient-to-br from-zinc-950 via-purple-950/20 to-zinc-950 flex items-center justify-center group-hover:scale-[1.01] transition-transform duration-700 shrink-0 cursor-pointer"
      >
        {/* Dynamic purple glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/10 blur-[80px] rounded-full animate-pulse pointer-events-none" />
        <div className="absolute inset-0 bg-black/40" />

        {previewVideoId ? (
          <iframe
            src={
              previewVideoId.startsWith("http://") ||
              previewVideoId.startsWith("https://") ||
              previewVideoId.includes("/")
                ? previewVideoId
                : `https://www.youtube.com/embed/${previewVideoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&playlist=${previewVideoId}&loop=1`
            }
            className="w-full h-full pointer-events-none select-none"
            title="Live Stream Preview"
            allow="autoplay; encrypted-media"
            frameBorder="0"
            tabIndex={-1}
            sandbox="allow-scripts allow-same-origin allow-presentation"
          />
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:rotate-6 transition-all duration-300">
              <Tv className="w-8 h-8 text-white" />
            </div>
            <div className="px-3 py-1 bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] font-black tracking-widest rounded-full uppercase flex items-center gap-1.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
              Tv Live Room
            </div>
          </div>
        )}

        <div className="absolute top-4 left-4 px-3 py-1 bg-purple-600 text-white text-[9px] font-black rounded-full flex items-center gap-1.5 z-10 transition-transform group-hover:scale-110">
          BROADCAST LIVE
        </div>

        {/* Live indicator badge */}
        <div className="absolute bottom-4 right-4 px-2 py-1 bg-red-600 text-[8px] font-black tracking-wider text-white uppercase rounded-md flex items-center gap-1 shadow-md border border-white/10 pointer-events-none">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          LIVE PREVIEW
        </div>
      </div>

      <div className="p-8 md:p-10 flex flex-col justify-between flex-grow gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] font-mono">
              OFFICIAL BROADCAST STREAM
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-purple-400 kurdish-text leading-tight font-bold">
            پەخشی فەرمی (Broadcast)
          </h2>
          <p className="text-gray-400 kurdish-text text-xs md:text-sm leading-relaxed line-clamp-2">
            پێشبینینی ڕاستەوخۆی پەخشی سەرەکی ئەدمین بکە. بۆ لێدانی دەنگ و بەشداریکردن لە چاتی دەستبەجێ بە یەکەوە، لێرەوە بچۆ ناو هۆڵەکەوە.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-white/5 mt-auto">
          <button
            onClick={onJoinBroadcast}
            className="px-6 py-3.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 hover:scale-[1.01] rounded-2xl font-black kurdish-text text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 shadow-xl shadow-purple-500/10 cursor-pointer"
          >
            <Tv className="w-4 h-4 text-white" />
            چوونە ناو پەخشی گشتی 📺
          </button>
          <div className="flex items-center gap-1.5 text-[10px] font-black text-purple-400 uppercase tracking-widest self-end sm:self-auto font-mono font-bold">
            EVERYONE WELCOME
          </div>
        </div>
      </div>
    </div>
  );
};
