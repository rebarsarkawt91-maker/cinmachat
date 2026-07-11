import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Tv, 
  Send, 
  Users, 
  Clock, 
  Volume2, 
  VolumeX, 
  Info,
  ChevronLeft,
  MessageSquare,
  AlertCircle
} from "lucide-react";

interface Comment {
  id: string;
  sender: string;
  senderCode: string;
  text: string;
  timestamp: string;
}

interface Room {
  id: string;
  name: string;
  hostCode: string;
  currentMovieUrl: string;
  isPlaying: boolean;
  currentTime: number;
  activeUsers?: any[];
  chatMessages?: Comment[];
}

interface BroadcastRoomProps {
  socialProfile?: any;
  onBackToMovies: () => void;
  userCodeInput?: string;
  usernameInput?: string;
}

export const BroadcastRoom: React.FC<BroadcastRoomProps> = ({
  socialProfile,
  onBackToMovies,
  userCodeInput = "",
  usernameInput = ""
}) => {
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  
  // Public Chat states
  const [chats, setChats] = useState<Comment[]>([]);
  const [newMsgText, setNewMsgText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Fallback defaults for guest
  const localUserCodeRef = useRef<string>(
    socialProfile?.uniqueCode || 
    userCodeInput || 
    `BC_GUEST_${Math.random().toString(36).substring(2, 6).toUpperCase()}`
  );
  const localUsernameRef = useRef<string>(
    socialProfile?.name || 
    usernameInput || 
    `مێوان`
  );

  const playerRef = useRef<any>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const purgeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize YT Player API script
  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }
  }, []);

  // Poll Broadcast Room State
  const fetchRoomState = async () => {
    try {
      const uCode = encodeURIComponent(localUserCodeRef.current);
      const res = await fetch(`/api/rooms/main_broadcast_room?userCode=${uCode}`);
      if (res.ok) {
        const data: Room = await res.json();
        setActiveRoom(data);
        
        // Statically filter messages older than 1 hour for ui immediacy
        const oneHourAgo = Date.now() - 3600000;
        const validChats = (data.chatMessages || []).filter((msg) => {
          const t = new Date(msg.timestamp).getTime();
          return t > oneHourAgo;
        });
        setChats(validChats);
        setIsLoading(false);
      } else {
        setErrorText("کێشەیەک لە بارکردنی ژووری گشتی هەیە");
      }
    } catch (err) {
      console.warn("Could not load broadcast room state:", err);
    }
  };

  useEffect(() => {
    fetchRoomState();
    // Poll every 2 seconds for real-time play control updates from admin
    checkIntervalRef.current = setInterval(fetchRoomState, 2000);

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, []);

  // Auto-Delete local display purge ticker: runs every 5 seconds to wipe messages > 1 Hour immediately
  useEffect(() => {
    purgeIntervalRef.current = setInterval(() => {
      const oneHourAgo = Date.now() - 3600000;
      setChats((prev) => prev.filter((msg) => {
        const t = new Date(msg.timestamp).getTime();
        return t > oneHourAgo;
      }));
    }, 5000);

    return () => {
      if (purgeIntervalRef.current) clearInterval(purgeIntervalRef.current);
    };
  }, []);

  // Sync Player Playback (Admin Driven)
  useEffect(() => {
    if (!activeRoom) return;

    // Get YouTube Video ID
    const url = activeRoom.currentMovieUrl || "";
    let videoId = "";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      videoId = match[2];
    } else {
      videoId = url; // fallback
    }

    if (!videoId) return;

    // Direct YT Player creation/update
    if (!(window as any).YT || !(window as any).YT.Player) {
      return;
    }

    if (!playerRef.current) {
      playerRef.current = new (window as any).YT.Player("broadcast-yt-player", {
        height: "100%",
        width: "100%",
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0, // Disabled controls to make sure users cannot play/pause/seek
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3
        },
        events: {
          onReady: (event: any) => {
            if (isMuted) {
              event.target.mute();
            } else {
              event.target.unMute();
              event.target.setVolume(100);
            }
            syncPlayerWithRoom(event.target, activeRoom);
          }
        }
      });
    } else {
      try {
        const currentPlayerState = playerRef.current.getPlayerState?.();
        const currentId = playerRef.current.getVideoData?.()?.video_id;

        // If video changed, load the new draft
        if (currentId && currentId !== videoId) {
          playerRef.current.loadVideoById(videoId);
        } else {
          syncPlayerWithRoom(playerRef.current, activeRoom);
        }
      } catch (err) {
        console.warn("YT sync glitch:", err);
      }
    }
  }, [activeRoom?.currentMovieUrl, activeRoom?.isPlaying, activeRoom?.currentTime]);

  // Handle Mute changes
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.mute === "function") {
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
        playerRef.current.setVolume(100);
      }
    }
  }, [isMuted]);

  const syncPlayerWithRoom = (player: any, room: Room) => {
    try {
      const myState = player.getPlayerState();
      const myTime = player.getCurrentTime();
      const livePlaying = room.isPlaying;
      const liveTime = room.currentTime;

      // Play / Pause enforcement
      if (livePlaying && myState !== 1) {
        player.playVideo();
      } else if (!livePlaying && myState === 1) {
        player.pauseVideo();
      }

      // Max 3 seconds drift tolerated, otherwise force seek to Admin state
      if (Math.abs(myTime - liveTime) > 3) {
        player.seekTo(liveTime, true);
      }
    } catch (e) {
      // safe bypass
    }
  };

  // Scroll chat to bottom 
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chats]);

  // Send message to public broadcast chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgText.trim() || isSending) return;

    setIsSending(true);
    try {
      const msgBody = {
        sender: localUsernameRef.current,
        senderCode: localUserCodeRef.current,
        text: newMsgText.trim()
      };

      const res = await fetch("/api/rooms/main_broadcast_room/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatMessage: msgBody,
          userCode: localUserCodeRef.current
        })
      });

      if (res.ok) {
        const data = await res.json();
        setNewMsgText("");
        
        // Filter updated messages immediately in client
        const oneHourAgo = Date.now() - 3600000;
        const validChats = (data.room?.chatMessages || []).filter((msg: any) => {
          const t = new Date(msg.timestamp).getTime();
          return t > oneHourAgo;
        });
        setChats(validChats);
      }
    } catch (err) {
      console.warn("Message delivery error:", err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070a] text-zinc-100 flex flex-col font-sans relative overflow-hidden selection:bg-purple-900 selection:text-white">
      {/* Top Banner Accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-500 via-purple-500 to-pink-500 z-50"></div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-4 py-6 md:py-8 gap-6 z-10">
        
        {/* Navigation & Header Status */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToMovies}
              className="p-3 bg-zinc-900/80 border border-white/5 hover:bg-zinc-800 text-gray-300 rounded-full transition-all cursor-pointer group"
            >
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center animate-pulse">
                <Tv className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 kurdish-text">
                  هۆڵی پەخشی سەرەکی 📺
                </h1>
                <p className="text-[10px] text-zinc-400 kurdish-text mt-0.5">
                  پەخشی فەرمی فیلمە گشتییەکان — لە لایەن بەڕێوبەر کۆنتڕۆڵ دەکرێت
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-950/40 border border-red-500/20 rounded-full text-[10px] font-bold text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              RUST LIVE
            </div>

            {/* active audience */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/60 border border-white/5 rounded-full text-xs text-zinc-300">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-mono font-bold">
                {activeRoom?.activeUsers?.length || 1}
              </span>
            </div>

            {/* mute button */}
            <button
              onClick={() => setIsMuted((p) => !p)}
              className={`p-2.5 rounded-full border transition-all cursor-pointer ${
                isMuted
                  ? "bg-red-950/40 border-red-500/20 text-red-400 hover:bg-red-900/40"
                  : "bg-zinc-900/80 border-white/5 text-gray-300 hover:bg-zinc-800"
              }`}
              title={isMuted ? "Unmute Broadcast" : "Mute Broadcast"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Outer Split Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch min-h-[500px]">
          
          {/* Main Display & State Info */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            
            {/* Player Stage */}
            <div className="aspect-video w-full bg-zinc-950 rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl relative group">
              <div 
                className="w-full h-full pointer-events-none" 
                id="broadcast-yt-player"
              ></div>
              
              {/* Cover layout confirming user restriction */}
              <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-6 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-2 rounded-xl border border-white/5 self-start">
                  <Info className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[10px] text-zinc-300 kurdish-text">
                    کۆنتڕۆڵی لێدان تەنها لە لایەن ئەدمینەوەیە
                  </span>
                </div>
              </div>
            </div>

            {/* Disclaimer Information */}
            <div className="p-4 bg-zinc-950/50 border border-white/5 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-zinc-300 kurdish-text">مەرجەکانی ژووری پەخشی فەرمی</h4>
                <p className="text-[10px] text-zinc-500 leading-relaxed kurdish-text mt-0.5">
                  ئەم هۆڵە بۆ بینینی فیلمە هاوبەشەکانە. چاتی پێ خۆراک دەبێتەوە و پەیامەکان تەمەنیان ١ کاتژمێرە؛ پاش یەک کاتژمێر بە شێوەیەکی خۆکار لە بنکەدراوە پاک دەبنەوە.
                </p>
              </div>
            </div>

          </div>

          {/* Public Chat Panel */}
          <div className="bg-zinc-950/50 rounded-[2.5rem] border border-white/5 p-5 flex flex-col h-full shrink-0">
            <div className="border-b border-white/5 pb-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-black kurdish-text">چاتی گشتی پەخش</h3>
              </div>
              <div className="flex items-center gap-1 text-[9px] text-zinc-500">
                <Clock className="w-3 h-3" />
                <span>پاكبوونەوە: پاش ١ کاتژمێر</span>
              </div>
            </div>

            {/* Message Feed Canvas */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 min-h-[300px]">
              {chats.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
                  <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center animate-pulse">
                    <MessageSquare className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-zinc-400 kurdish-text">چەت چۆڵە</h5>
                    <p className="text-[10px] text-zinc-600 kurdish-text mt-1">
                      هیچ پەیامێک بوونی نییە. یەکەم نووسەر بە!
                    </p>
                  </div>
                </div>
              ) : (
                chats.map((msg) => {
                  const isMe = msg.senderCode === localUserCodeRef.current;
                  const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  return (
                    <div 
                      key={msg.id} 
                      className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[10px] font-black text-zinc-400">
                          {msg.sender}
                        </span>
                        <span className="text-[9px] text-zinc-600 font-mono">
                          {timeStr}
                        </span>
                      </div>
                      <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-xs border ${
                        isMe 
                          ? "bg-purple-950/40 border-purple-500/20 text-purple-200 rounded-tr-none" 
                          : "bg-zinc-900 border-white/5 text-zinc-300 rounded-tl-none"
                      }`}>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef}></div>
            </div>

            {/* Chat Input Dock */}
            <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t border-white/5 flex gap-2">
              <input 
                type="text"
                required
                value={newMsgText}
                onChange={(e) => setNewMsgText(e.target.value)}
                placeholder="ڕای خۆت دەربڕە یان چات بکە..."
                className="flex-1 bg-zinc-900 border border-white/5 focus:border-purple-500 focus:outline-none rounded-2xl px-4 py-3 text-xs text-white kurdish-text font-medium"
              />
              <button
                type="submit"
                disabled={!newMsgText.trim() || isSending}
                className="p-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-2xl cursor-pointer transition-all active:scale-95 flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>

        </div>

      </div>
    </div>
  );
};
