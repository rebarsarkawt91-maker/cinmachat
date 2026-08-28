import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, 
  Tv, 
  Send, 
  VolumeX, 
  Volume2, 
  Copy, 
  Plus, 
  Lock, 
  Play, 
  Pause, 
  LogOut, 
  Share2, 
  Cast,
  Check, 
  Key,
  Video,
  RefreshCw
} from "lucide-react";
import { SocialUser } from '../../types';
import { getYTId, loadYouTubeAPI } from '../../utils/youtube';
import { db, collection, getDocs } from '../../lib/firebase';
import { censorOutgoingMessage } from '../../services/bannedWords';
import {
  createFriendsRoom,
  getFriendsRoom,
  resolveRoomByCode,
  joinFriendsRoom,
  subscribeFriendsRoom,
  subscribeFriendsRooms,
  updateFriendsRoom,
  subscribeFriendsRoomMessages,
  sendFriendsRoomMessage,
  sendInvitation,
  respondToInvitation,
  subscribeInvitations,
  generateRoomCode,
} from '../../services/friendsRooms';
import type {
  FriendsRoom,
  FriendsRoomMessage,
  FriendsInvitation,
} from '../../services/friendsRooms';

interface CameHereRoomProps {
  socialProfile: SocialUser | null;
  onBackToMovies: () => void;
  initialRoomId?: string;
  onJoinBroadcast?: () => void;
}

export const CameHereRoom: React.FC<CameHereRoomProps> = ({ 
  socialProfile, 
  onBackToMovies, 
  initialRoomId, 
  onJoinBroadcast 
}) => {
  // --- Core identity (unique code + display name) ---
  const [userCodeInput, setUserCodeInput] = useState<string>(socialProfile?.uniqueCode || "");
  const [usernameInput, setUsernameInput] = useState<string>(socialProfile?.username || socialProfile?.name || "");

  // --- Join / Create form state ---
  const [roomIdInput, setRoomIdInput] = useState<string>(initialRoomId || "");
  const [activeRoom, setActiveRoom] = useState<FriendsRoom | null>(null);
  const [createRoomName, setCreateRoomName] = useState<string>("");
  const [createHostCode, setCreateHostCode] = useState<string>(socialProfile?.uniqueCode || "");
  const [createMovieUrl, setCreateMovieUrl] = useState<string>("");
  const [createMovieTitle, setCreateMovieTitle] = useState<string>("");
  const [createCategory, setCreateCategory] = useState<string>("");
  const [createGenre, setCreateGenre] = useState<string>("");
  const [createCode, setCreateCode] = useState<string>(() => generateRoomCode());

  // --- Movie catalog (durable Firestore `movies` source) ---
  const [localMovies, setLocalMovies] = useState<any[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  // Update roomIdInput when initialRoomId changes
  useEffect(() => {
    if (initialRoomId) setRoomIdInput(initialRoomId);
  }, [initialRoomId]);

  // Load the durable Firestore movie catalog once + derive category options
  useEffect(() => {
    const fetchLocalMovies = async () => {
      try {
        const [resMovies, resVip] = await Promise.all([
          getDocs(collection(db, "movies")).catch(() => null),
          getDocs(collection(db, "vip_videos")).catch(() => null),
        ]);

        let moviesList: any[] = [];
        if (resMovies) {
          moviesList = resMovies.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        }

        let vipUrlsList: string[] = [];
        if (resVip && resVip.size > 0) {
          vipUrlsList = resVip.docs.map((d) => (d.data()?.videoUrl || "").trim().toLowerCase());
        }

        // Filter out any movies registered as VIP Room videos (zero crossover)
        const filteredList = moviesList.filter((m: any) => {
          const mUrl = (m.embedUrl || m.videoUrl || "").trim().toLowerCase();
          if (!mUrl) return true;
          return !vipUrlsList.some((vipUrl) => vipUrl && (mUrl.includes(vipUrl) || vipUrl.includes(mUrl)));
        });

        setLocalMovies(filteredList);

        // Category options come from the movies collection (distinct category values)
        const cats: string[] = [];
        filteredList.forEach((m: any) => {
          if (m.category && typeof m.category === "string" && !cats.includes(m.category)) cats.push(m.category);
        });
        setCategoryOptions(cats);

        if (filteredList.length > 0) {
          const firstMovie = filteredList[0];
          setCreateRoomName(`ژووری هاوڕێیانی ${firstMovie.title}`);
        }
      } catch (e) {
        console.error("Failed to fetch local movies in CameHereRoom:", e);
      }
    };
    fetchLocalMovies();
  }, []);

  const [errorText, setErrorText] = useState<string>("");
  const [successText, setSuccessText] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Sidebar passcode / uniqueCode editor states inside room next to chat
  const [sidebarCodeInput, setSidebarCodeInput] = useState<string>(userCodeInput);
  const [sidebarNameInput, setSidebarNameInput] = useState<string>(usernameInput);
  const [sidebarFeedback, setSidebarFeedback] = useState<string>("");
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Keep sidebar local state synchronized with outer states when they change
  useEffect(() => {
    setSidebarCodeInput(userCodeInput);
  }, [userCodeInput]);

  useEffect(() => {
    setSidebarNameInput(usernameInput);
  }, [usernameInput]);

  // Player state references
  const playerRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const isHost = !!activeRoom && activeRoom.hostCode.trim().toUpperCase() === userCodeInput.trim().toUpperCase();

  // Movie URL resolution shared by create + in-room selectors (embed-first)
  const moviePlayUrl = (m: any): string =>
    (m && (m.embedUrl || m.videoUrl || m.streamingUrl || m.youtubeMovieUrl || m.external_link || m.externalMovieLink)) || "";

  // Genre options derive from the tags of movies in the chosen category
  const genreOptions = useMemo(() => {
    const source = createCategory
      ? localMovies.filter((m: any) => m.category === createCategory)
      : localMovies;
    const genres: string[] = [];
    source.forEach((m: any) => {
      const tags = Array.isArray(m.tags) ? m.tags : m.tags ? [m.tags] : [];
      tags.forEach((t: any) => {
        if (typeof t === "string" && t.trim() && !genres.includes(t)) genres.push(t);
      });
    });
    return genres;
  }, [localMovies, createCategory]);

  // Movies offered in the create picker, filtered by category + genre
  const createMovieList = useMemo(() => {
    let list = localMovies;
    if (createCategory) list = list.filter((m: any) => m.category === createCategory);
    if (createGenre) {
      list = list.filter((m: any) =>
        Array.isArray(m.tags) ? m.tags.includes(createGenre) : m.tags === createGenre,
      );
    }
    return list;
  }, [localMovies, createCategory, createGenre]);

  // Movies offered inside the active room (follows the room's category/genre)
  const roomMovieList = useMemo(() => {
    let list = localMovies;
    if (activeRoom && activeRoom.category) list = list.filter((m: any) => m.category === activeRoom.category);
    if (activeRoom && activeRoom.genre) {
      list = list.filter((m: any) =>
        Array.isArray(m.tags) ? m.tags.includes(activeRoom.genre) : m.tags === activeRoom.genre,
      );
    }
    return list;
  }, [localMovies, activeRoom?.category, activeRoom?.genre]);

  // --- Invitation & notification states ---
  const [inviteTarget, setInviteTarget] = useState<string>("");
  const [inviteError, setInviteError] = useState<string>("");
  const [inviteSuccess, setInviteSuccess] = useState<string>("");
  const [isInviting, setIsInviting] = useState<boolean>(false);
  const [activeInvitations, setActiveInvitations] = useState<FriendsInvitation[]>([]);
  const [chatMessages, setChatMessages] = useState<FriendsRoomMessage[]>([]);
  const [availableRooms, setAvailableRooms] = useState<FriendsRoom[]>([]);

  // Real-time incoming invitations for the current user (pending only)
  useEffect(() => {
    if (!userCodeInput.trim()) return;
    const unsub = subscribeInvitations(userCodeInput, (invites) => {
      setActiveInvitations(invites.filter((inv) => !activeRoom || inv.roomId !== activeRoom.id));
    });
    return unsub;
  }, [userCodeInput, activeRoom?.id]);

  // Live available rooms list (runs when not inside a room)
  useEffect(() => {
    if (activeRoom) return;
    const unsub = subscribeFriendsRooms((rooms) => setAvailableRooms(rooms));
    return unsub;
  }, [activeRoom]);

  // Load room if roomId is in search query
  useEffect((): void => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("roomId");
    if (rid) setRoomIdInput(rid);
  }, []);

  // Handle member sync safely
  const handleMemberPlaybackSync = React.useCallback((updatedRoom: FriendsRoom): void => {
    if (!playerRef.current || typeof playerRef.current.getPlayerState !== "function") return;

    try {
      const livePlaying = updatedRoom.isPlaying;
      const liveTime = updatedRoom.currentTime;
      const myTime = playerRef.current.getCurrentTime();
      const myState = playerRef.current.getPlayerState();

      // Check play/pause sync
      if (livePlaying && myState !== 1) {
        playerRef.current.playVideo();
      } else if (!livePlaying && myState === 1) {
        playerRef.current.pauseVideo();
      }

      // Max 3 seconds drift tolerated, otherwise force seek to Admin state
      if (Math.abs(myTime - liveTime) > 3) {
        playerRef.current.seekTo(liveTime, true);
      }
    } catch (e) {
      console.error("Playback sync error:", e);
    }
  }, []);

  // Real-time room state subscription + host-driven playback sync engine.
  // Guests mirror the host's isPlaying/currentTime/currentMovieUrl from the
  // friends_rooms/{id} doc; the host periodically pushes its player clock.
  useEffect((): (() => void) | undefined => {
    if (!activeRoom) return;

    // Guests follow the live doc; the host just mirrors it into UI state
    // (never force-seeks their own player).
    const unsubRoom = subscribeFriendsRoom(activeRoom.id, (room) => {
      if (!room) {
        setActiveRoom(null);
        return;
      }
      setActiveRoom((prev: FriendsRoom | null) => {
        if (!prev) return room;
        if (!isHost) handleMemberPlaybackSync(room);
        return room;
      });
    });

    // If host, periodically push playback times to the room doc (host-driven sync)
    const pushHostState = async (): Promise<void> => {
      if (!isHost || !activeRoom) return;
      try {
        let currentTime = currentVideoTimeRef.current;
        if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
          currentTime = playerRef.current.getCurrentTime();
          currentVideoTimeRef.current = currentTime;
        }

        await updateFriendsRoom(activeRoom.id, {
          currentTime,
          isPlaying: !!isPlayingRef.current,
          currentMovieUrl: activeRoom.currentMovieUrl,
        });
      } catch (err) {
        console.warn("Could not push host state:", err);
      }
    };

    // Master sync interval (2.5s)
    syncIntervalRef.current = setInterval(() => {
      if (isHost) pushHostState();
    }, 2500);

    return () => {
      unsubRoom();
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [activeRoom?.id, isHost, activeRoom?.currentMovieUrl, handleMemberPlaybackSync]);

  // YouTube Iframe API setup for Host Control & Client Muting (Player initialization)
  useEffect((): (() => void) | undefined => {
    if (!activeRoom || !activeRoom.currentMovieUrl) return;

    const videoId = getYTId(activeRoom.currentMovieUrl);
    if (!videoId) return;

    let cancelled = false;
    const id = "camehere-yt-player";

    const initPlayer = (): void => {
      if (cancelled) return;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch(e){}
      }

      playerRef.current = new (window as any).YT.Player(id, {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          mute: 1,
          controls: isHost ? 1 : 0,
          disablekb: isHost ? 0 : 1,
          fs: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: { target: any }) => {
            if (isMuted) {
              event.target.mute();
            } else {
              event.target.unMute();
            }

            if (activeRoom.currentTime > 0) {
              event.target.seekTo(activeRoom.currentTime, true);
            }
            if (activeRoom.isPlaying) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: { data: number; target: any }) => {
            const state = event.data;
            if (state === 1) isPlayingRef.current = true;
            if (state === 2 || state === 0) isPlayingRef.current = false;

            const curTime = event.target.getCurrentTime();
            currentVideoTimeRef.current = curTime;

            if (isHost) {
              setActiveRoom((prev: FriendsRoom | null) => {
                if (!prev) return prev;
                return { ...prev, isPlaying: isPlayingRef.current, currentTime: curTime };
              });
            }
          }
        }
      });
    };

    loadYouTubeAPI().then(initPlayer);
    return () => { cancelled = true; };
  }, [activeRoom?.id, activeRoom?.currentMovieUrl]);

  // Adjust volume / mute locally
  useEffect(() => { // No explicit return type needed for useEffect callback
    if (playerRef.current && typeof playerRef.current.mute === "function") {
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    }
  }, [isMuted]);

  // Create static Link copy
  const handleCopyLink = (): void => { // Explicitly type handleCopyLink
    if (!activeRoom) return;
    const link = `${window.location.origin}?roomId=${activeRoom.id}`;
    navigator.clipboard.writeText(link);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Generate / Create a fresh Room (persisted to friends_rooms)
  const handleCreateRoom = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!createRoomName.trim() || !createHostCode.trim()) {
      setErrorText("تکایە هەموو خانەکان بە دروستی پڕ بکەرەوە");
      return;
    }

    setIsLoading(true);
    setErrorText("");

    try {
      const hostCode = createHostCode.trim().toUpperCase();
      const room = await createFriendsRoom({
        name: createRoomName.trim(),
        hostCode,
        hostName: usernameInput.trim() || "خانەخوێ",
        uniqueCode: createCode,
        category: createCategory,
        genre: createGenre,
        currentMovieUrl: createMovieUrl,
        currentMovieTitle: createMovieTitle,
        currentMovieImage: "",
        isPlaying: false,
        currentTime: 0,
        activeUsers: [
          {
            username: usernameInput.trim() || "خانەخوێ",
            uniqueCode: hostCode,
            joinedAt: new Date().toISOString(),
          },
        ],
      });

      setUserCodeInput(hostCode);
      setActiveRoom(room);
      setSuccessText("ژووری تایبەتی بە سەرکەوتوویی دروستکرا!");

      // Auto update URL parameter
      const newUrl = `${window.location.origin}${window.location.pathname}?roomId=${room.id}`;
      window.history.pushState({ path: newUrl }, "", newUrl);
    } catch (err: any) {
      setErrorText("شکستی هێنا لە دروستکردنی ژورەکە");
    } finally {
      setIsLoading(false);
    }
  };

  // Join existing Room by unique code / host code / doc id
  const handleJoinRoom = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!roomIdInput.trim() || !userCodeInput.trim()) {
      setErrorText("تکایە ناسنامەی ژوور و کۆدی چوونەژوورەوەت بنووسە");
      return;
    }

    setIsLoading(true);
    setErrorText("");

    try {
      const room = await resolveRoomByCode(roomIdInput);
      if (!room) throw new Error("کۆدەکەت نادروستە یان ڕێگەت پێ نەدراوە بێیتە ناو ئەم ژوورە");

      await joinFriendsRoom(room, {
        username: usernameInput || `میوان-${userCodeInput.trim().substring(0, 4)}`,
        uniqueCode: userCodeInput.trim().toUpperCase(),
        joinedAt: new Date().toISOString(),
      });

      setActiveRoom(room);
      setSuccessText("بە سەرکەوتوویی چووە ژورەوە!");

      // Auto update URL parameter
      const newUrl = `${window.location.origin}${window.location.pathname}?roomId=${room.id}`;
      window.history.pushState({ path: newUrl }, "", newUrl);
    } catch (err: any) {
      setErrorText("کۆدەکەت متمانەپێکراو نییە یان سێرڤەر بەردەست نییە");
    } finally {
      setIsLoading(false);
    }
  };

  // Join a specific room from an invitation / link
  const joinSpecificRoom = async (targetRoomId: string): Promise<void> => {
    if (!userCodeInput.trim()) {
      setErrorText("تکایە پێشەکی کۆدی ناسنامەی خۆت بنووسە بۆ چوونەژوورەوە");
      return;
    }
    setIsLoading(true);
    setErrorText("");
    try {
      const room = await getFriendsRoom(targetRoomId);
      if (!room) throw new Error("ژوورەکە نەدۆزرایەوە");

      await joinFriendsRoom(room, {
        username: usernameInput || `میوان-${userCodeInput.trim().substring(0, 4)}`,
        uniqueCode: userCodeInput.trim().toUpperCase(),
        joinedAt: new Date().toISOString(),
      });

      setActiveRoom(room);
      setSuccessText("چوونە ژوورەوە سەرکەوتوو بوو");
      setErrorText("");
      setRoomIdInput(targetRoomId);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "نەتوانرا بچیتە ژوورەوە");
    } finally {
      setIsLoading(false);
    }
  };

  // "Global official room" now routes to the live broadcast module
  const handleJoinOfficial = (): void => {
    if (onJoinBroadcast) {
      onJoinBroadcast();
      return;
    }
    setErrorText("ژووری گشتی لە ئێستادا بەردەست نییە");
  };

  // Leave active room
  const handleLeaveRoom = (): void => {
    setActiveRoom(null);
    setChatMessages([]);
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    // Clear URL parameter safely
    const newUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.pushState({ path: newUrl }, "", newUrl);
  };

  // Send single chat messages (friends_rooms/{roomId}/messages subcollection)
  const handleSendChat = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!chatInput.trim() || !activeRoom) return;

    try {
      const censored = await censorOutgoingMessage(chatInput.trim());
      await sendFriendsRoomMessage(activeRoom.id, {
        sender: usernameInput || "بەکارهێنەر",
        senderCode: userCodeInput.trim().toUpperCase(),
        text: censored,
      });
      setChatInput("");
    } catch (err) {
      console.error("Failed to send message:", err);
      setErrorText("نەتوانرا نامەکە بنێردرێت");
    }
  };

  // Live chat subscription for the active room
  useEffect(() => {
    if (!activeRoom) return;
    const unsub = subscribeFriendsRoomMessages(activeRoom.id, (messages) => {
      setChatMessages(messages);
    });
    return unsub;
  }, [activeRoom?.id]);

  // Host playback controls (play / pause)
  const togglePlayState = async (): Promise<void> => {
    if (!activeRoom || !isHost) return;
    const nextPlaying = !activeRoom.isPlaying;
    isPlayingRef.current = nextPlaying;

    // UI update
    if (playerRef.current) {
      if (nextPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    }

    setActiveRoom((prev: FriendsRoom | null) => (prev ? { ...prev, isPlaying: nextPlaying } : prev));

    try {
      await updateFriendsRoom(activeRoom.id, {
        isPlaying: nextPlaying,
        currentTime: currentVideoTimeRef.current,
      });
    } catch (err) {
      console.error("Failed to sync play/pause action:", err);
    }
  };

  // Host selects a movie in the room strip → updates the room doc live
  const handleSelectMovieInRoom = async (movie: any): Promise<void> => {
    if (!activeRoom || !isHost) return;
    const url = moviePlayUrl(movie);
    if (!url) return;
    try {
      setActiveRoom((prev) =>
        prev ? { ...prev, currentMovieUrl: url, currentMovieTitle: movie.title, currentMovieImage: movie.image || "" } : prev,
      );
      await updateFriendsRoom(activeRoom.id, {
        currentMovieUrl: url,
        currentMovieTitle: movie.title,
        currentMovieImage: movie.image || "",
        isPlaying: false,
        currentTime: 0,
      });
    } catch (err) {
      console.error("Failed to select movie in room:", err);
    }
  };

  // Handle invite friend form submission (invitations collection)
  const handleInviteFriend = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!activeRoom || !inviteTarget.trim()) return;
    setIsInviting(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      await sendInvitation({
        fromUserCode: userCodeInput.trim().toUpperCase(),
        fromUserName: usernameInput || "هاوڕێیەک",
        targetCodeOrName: inviteTarget.trim(),
        roomId: activeRoom.id,
        roomName: activeRoom.name,
      });
      setInviteSuccess("بانگهێشتکردن سەرکەوتوو بوو ✓");
      setInviteTarget("");
    } catch (err) {
      setInviteError("کێشەیەک ڕوویدا لە پەیوەندیکردن");
    } finally {
      setIsInviting(false);
    }
  };

  // Handle respond to invitation (accept or decline)
  const handleRespondToInvite = async (inviteId: string, status: "accepted" | "declined", roomId: string): Promise<void> => {
    try {
      await respondToInvitation(inviteId, status);
      setActiveInvitations((prev) => prev.filter((inv) => inv.id !== inviteId));
      if (status === "accepted") {
        await joinSpecificRoom(roomId);
      }
    } catch (err) {
      console.error("Failed to respond to invitation:", err);
    }
  };

  // Sidebar identity registration (join/register unique code in the current room)
  const handleSidebarJoin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!sidebarCodeInput.trim()) {
      setSidebarFeedback("تکایە کۆدێکی دروست بنووسە");
      return;
    }
    setIsLoading(true);
    setSidebarFeedback("");
    try {
      if (!activeRoom) throw new Error("ژوورەکە دیار نییە");
      await joinFriendsRoom(activeRoom, {
        username: sidebarNameInput.trim() || `میوان-${sidebarCodeInput.trim().substring(0, 4)}`,
        uniqueCode: sidebarCodeInput.trim().toUpperCase(),
        joinedAt: new Date().toISOString(),
      });
      setUserCodeInput(sidebarCodeInput.trim().toUpperCase());
      setUsernameInput(sidebarNameInput.trim());
      setSidebarFeedback("ناسنامەکەت بە سەرکەوتوویی تۆمارکرا! ✓");
    } catch (err) {
      setSidebarFeedback("خەتایەک ڕوویدا لە کاتی چوونەژوورە");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-black text-gray-100 flex flex-col justify-start">
      {/* Alert Banner */}
      <AnimatePresence>
        {errorText && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-50 p-4 bg-red-950/80 border border-red-500/30 text-red-200 text-xs kurdish-text text-center rounded-2xl max-w-2xl mx-auto backdrop-blur-3xl shadow-2xl"
          >
            {errorText}
          </motion.div>
        )}
        {successText && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-50 p-4 bg-emerald-950/80 border border-emerald-500/30 text-emerald-200 text-xs kurdish-text text-center rounded-2xl max-w-2xl mx-auto backdrop-blur-3xl shadow-2xl"
          >
            {successText}
            {(() => { setTimeout(() => setSuccessText(""), 3000); return null; })()}
          </motion.div>
        )}
      </AnimatePresence>

      {!activeRoom ? (
        /* JOIN & CREATE PANELS SCREEN */
        <div className="max-w-6xl mx-auto w-full px-6 py-12 md:py-20 flex flex-col gap-10">
          
          {/* Header section with back button */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-white/5 pb-8">
            <div>
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 kurdish-text">ژوورەکانی هاوڕێیان (Came Here Rooms)</h2>
              <p className="text-xs text-gray-400 kurdish-text mt-1">فیلم و چاتی راستەوخۆ بە یەکەوە لەگەڵ هاوڕێکانت بە شێوەی خۆماڵی</p>
            </div>
            <button
              onClick={onBackToMovies}
              className="px-5 py-2.5 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-gray-300 rounded-xl text-xs font-black kurdish-text transition-all cursor-pointer"
            >
              ← گەڕانەوە بۆ لاپەڕەی فیلمەکان
            </button>
          </div>

          {/* JOIN & CREATE PANELS FIELDS */}
          <div className="flex flex-col lg:flex-row items-stretch gap-10">
            
            {/* Join Room Section */}
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 bg-gradient-to-b from-zinc-950/80 to-zinc-950/40 p-8 rounded-[2.5rem] border border-white/5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                    <Key className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white kurdish-text">چوونە ژووری هاوڕێیان (Came Here)</h3>
                    <p className="text-[10px] text-gray-400 kurdish-text">ببە بە ئەندام لە ژوورێکی نوێی جیاکراوە</p>
                  </div>
                </div>

                <form onSubmit={handleJoinRoom} className="space-y-4">
                  <div>
                    <label className="block text-[11px] text-gray-400 kurdish-text font-bold mb-2 uppercase tracking-wide">کۆدی بێهاوتای ژوور / خانەخوێ (Room ID / Unique Code)</label>
                    <input 
                      type="text" 
                      required
                      value={roomIdInput}
                      onChange={(e) => setRoomIdInput(e.target.value)}
                      placeholder="کۆدی ناسنامەی بێهاوتای فیلمەکەت (نموونە: CC-XXXX-XXXX)"
                      className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white text-center focus:outline-none focus:border-indigo-500 transition-all font-mono font-bold tracking-widest text-indigo-400"
                    />
                  </div>

                  {!socialProfile ? (
                    <>
                      <div>
                        <label className="block text-[11px] text-gray-500 kurdish-text font-bold mb-2 uppercase tracking-wide">ناو / نازناوەکەت</label>
                        <input 
                          type="text" 
                          required
                          value={usernameInput}
                          onChange={(e) => setUsernameInput(e.target.value)}
                          placeholder="نموونە: ڕێبین، کاروان..."
                          className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white kurdish-text focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-gray-500 kurdish-text font-bold mb-2 uppercase tracking-wide">کۆدی چوونەژوورە (Pass-Code)</label>
                        <input 
                          type="text" 
                          required
                          value={userCodeInput}
                          onChange={(e) => setUserCodeInput(e.target.value)}
                          placeholder="کۆدی ناسنامەی فەرمی (CC-XXXX-XXXX) یان کاتى"
                          className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white text-center focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="p-3.5 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                      <p className="text-[10px] text-gray-400 text-center kurdish-text leading-relaxed">
                        تۆ بەستراویتەوە بە ناسنامەی فەرمی خۆت: <span className="font-mono text-indigo-300 font-bold">{socialProfile.uniqueCode}</span> بە ناوی بەکارهێنەری <span className="text-white font-bold">{usernameInput || socialProfile.name}</span>
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black kurdish-text rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-indigo-600/10"
                  >
                    <Cast className="w-4 h-4" />
                    {isLoading ? "چاوەڕوان بە..." : "چوونە ژوورەوەی هاوڕێیان"}
                  </button>
                </form>
              </div>

              <div className="pt-8 border-t border-white/5 mt-8 flex flex-col sm:flex-row gap-4 justify-between items-center">
                <span className="text-[10px] text-gray-500 kurdish-text">ناتوانیت بێ کۆدی ناسنامە ببیتە ئەندام؟</span>
                <button
                  type="button"
                  onClick={handleJoinOfficial}
                  className="text-[10px] font-black text-indigo-400 hover:underline kurdish-text"
                >
                  تاقیکردنەوەی چوونە ژووری گشتی/خراوەتەکار 💬
                </button>
              </div>
            </motion.div>

            {/* Create Room Section */}
            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 bg-gradient-to-b from-zinc-950/80 to-zinc-950/40 p-8 rounded-[2.5rem] border border-white/5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                    <Plus className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white kurdish-text font-serif">دروستکردنی ژووری تایبەت (Host)</h3>
                    <p className="text-[10px] text-gray-400 kurdish-text">کۆنترۆڵ و خاوەندارێتی تەنها لەژێر دەستی خۆت بێت</p>
                  </div>
                </div>

                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <div>
                    <label className="block text-[11px] text-gray-500 kurdish-text font-bold mb-2 uppercase tracking-wide">ناوی ژوورەکە</label>
                    <input 
                      type="text" 
                      value={createRoomName}
                      onChange={(e) => setCreateRoomName(e.target.value)}
                      placeholder="بۆ نموونە: کۆمەڵگای هاوڕێیانی دڵخۆش"
                      className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white kurdish-text focus:outline-none focus:border-emerald-500/50 transition-all font-bold"
                    />
                  </div>

                  {!socialProfile ? (
                    <div>
                      <label className="block text-[11px] text-gray-500 kurdish-text font-bold mb-2 uppercase tracking-wide">کۆدی بێهاوتای خۆت (Pass-Code)</label>
                      <input 
                        type="text" 
                        required
                        value={createHostCode}
                        onChange={(e) => setCreateHostCode(e.target.value)}
                        placeholder="کۆدی پاسپۆرتی تۆماری سینەما چات"
                        className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white text-center focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
                      />
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                      <p className="text-[10px] text-gray-400 text-center kurdish-text leading-relaxed">
                        ژوورەکەت تۆماردەکرێت بە کۆدی بێهاوتاکەت: <span className="font-mono text-emerald-300 font-bold">{socialProfile.uniqueCode}</span>
                      </p>
                    </div>
                  )}

                  {/* Category + Genre selectors (data source: movies collection) */}
                  <div>
                    <label className="block text-[11px] text-gray-500 kurdish-text font-bold mb-2 uppercase tracking-wide">پۆلێن (Category)</label>
                    <select
                      value={createCategory}
                      onChange={(e) => { setCreateCategory(e.target.value); setCreateGenre(""); }}
                      className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white kurdish-text focus:outline-none focus:border-emerald-500/50 transition-all font-bold cursor-pointer"
                    >
                      <option value="">هەموو پۆلەکان</option>
                      {categoryOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-500 kurdish-text font-bold mb-2 uppercase tracking-wide">جۆر / ژانر (Genre)</label>
                    <select
                      value={createGenre}
                      onChange={(e) => setCreateGenre(e.target.value)}
                      disabled={genreOptions.length === 0}
                      className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white kurdish-text focus:outline-none focus:border-emerald-500/50 transition-all font-bold cursor-pointer disabled:opacity-50"
                    >
                      <option value="">هەموو جۆرەکان</option>
                      {genreOptions.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-500 kurdish-text font-bold mb-2 uppercase tracking-wide">کۆدی بێهاوتای ژوورەکە (بۆ بانگهێشتی هاوڕێیان)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={createCode}
                        className="flex-1 px-4 py-3 bg-zinc-900 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 text-center focus:outline-none transition-all font-mono font-bold tracking-widest"
                      />
                      <button
                        type="button"
                        onClick={() => setCreateCode(generateRoomCode())}
                        title="نوێکردنەوەی کۆدەکە"
                        className="p-3 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-gray-400 hover:text-emerald-400 rounded-xl transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[9px] text-gray-500 kurdish-text mt-1.5">هاوڕێکانت دەتوانن بەم کۆدە یان کۆدی بێهاوتای تۆ (CC-XXXX) بێنە ژوورەکە.</p>
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-400 kurdish-text font-bold mb-1.5 uppercase tracking-wide">فیلم و بەرهەمەکان (کلیک بکە بۆ دیاریکردن)</label>
                    {createMovieList.length === 0 ? (
                      <p className="text-[10px] text-gray-500 kurdish-text">هیچ فیلمێک نییە بۆ هەڵبژاردن</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1 bg-zinc-950/20 p-2 rounded-xl border border-white/5">
                        {createMovieList.slice(0, 50).map((movie) => {
                          const movieUrl = moviePlayUrl(movie);
                          const isSelected = createMovieUrl === movieUrl;
                          return (
                            <button
                              key={movie.id}
                              type="button"
                              onClick={() => {
                                setCreateMovieUrl(movieUrl);
                                setCreateMovieTitle(movie.title);
                                if (!createRoomName.trim() || createRoomName.startsWith("ژووری ")) {
                                  setCreateRoomName(`ژووری هاوڕێیانی ${movie.title}`);
                                }
                              }}
                              className={`p-1.5 px-2.5 rounded-lg border text-right transition-all hover:bg-zinc-805 active:scale-95 ${
                                isSelected 
                                  ? "bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/30"
                                  : "bg-zinc-900/60 border-white/5 hover:border-white/15"
                              }`}
                            >
                              <div className="aspect-[15/10] w-full rounded overflow-hidden shrink-0 bg-zinc-950 border border-white/5">
                                <img
                                  src={movie.image || "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800"}
                                  alt={movie.title}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                {isSelected && (
                                  <div className="absolute inset-0 bg-emerald-950/40 flex items-center justify-center">
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-black font-black text-[8px] uppercase">
                                      دیاریکرا ✓
                                    </span>
                                  </div>
                                )}
                              </div>
                              <span className="text-[9px] text-white/95 font-bold kurdish-text truncate w-full block">
                                {movie.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-500 kurdish-text font-bold mb-2 uppercase tracking-wide">لینک / ناسنامەی ڤیدیۆی یوتیوب</label>
                    <input 
                      type="text" 
                      value={createMovieUrl}
                      onChange={(e) => setCreateMovieUrl(e.target.value)}
                      placeholder="سەیری هەر فیلم و ڕاستەوخۆیەکی یوتیوب بکە"
                      className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white/80 focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-black font-black kurdish-text rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <Tv className="w-4 h-4" />
                    {isLoading ? "چاوەڕوان به..." : "دروستکردنی ژووری نوێ"}
                  </button>
                </form>
              </div>

              <div className="pt-8 border-t border-white/5 mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={onBackToMovies}
                  className="text-xs font-bold text-gray-500 hover:text-white transition-colors kurdish-text"
                >
                  ← گەڕانەوە بۆ لاپەڕەی سەرەکی فیلمەکان
                </button>
              </div>
            </motion.div>
          </div>

          {/* Live Available Rooms (real-time from friends_rooms) */}
          <div className="border-t border-white/5 pt-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white kurdish-text">ژوورە چالاکەکان</h3>
                <p className="text-[10px] text-gray-400 kurdish-text">بە ڕاستەوخۆیی بەردەستە (real-time) — کرتە بکە بۆ چوونە ژوورەوە</p>
              </div>
            </div>

            {availableRooms.length === 0 ? (
              <p className="text-[11px] text-gray-500 kurdish-text py-6 text-center bg-white/5 border border-dashed border-white/10 rounded-2xl">
                هێشتا هیچ ژوورێک دروست نەکراوە — یەکەم ژوور بۆ خۆت دروست بکە!
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableRooms.map((room) => (
                  <div
                    key={room.id}
                    onClick={async () => {
                      if (!userCodeInput.trim()) {
                        setErrorText("تکایە کۆدی ناسنامەی خۆت بنووسە لە بەشی چوونەژوورەوە");
                        return;
                      }
                      setIsLoading(true);
                      setErrorText("");
                      try {
                        await joinFriendsRoom(room, {
                          username: usernameInput || `میوان-${userCodeInput.trim().substring(0, 4)}`,
                          uniqueCode: userCodeInput.trim().toUpperCase(),
                          joinedAt: new Date().toISOString(),
                        });
                        setActiveRoom(room);
                        setSuccessText("بە سەرکەوتوویی چووە ژورەوە!");
                      } catch (err) {
                        setErrorText("نەتوانرا بچیتە ژوورەوە");
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="bg-zinc-900/60 border border-white/5 hover:border-purple-500/40 rounded-2xl p-4 cursor-pointer transition-all hover:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-black text-white kurdish-text truncate">{room.name}</h4>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${room.isPlaying ? "bg-emerald-500 animate-pulse" : "bg-gray-600"}`} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                      <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 text-purple-300 font-mono font-bold rounded-lg">{room.uniqueCode}</span>
                      {room.category && (
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-gray-300 kurdish-text font-bold rounded-lg">{room.category}</span>
                      )}
                      {room.genre && (
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-gray-300 kurdish-text font-bold rounded-lg">{room.genre}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[9px] text-gray-500 font-bold">
                      <Users className="w-3 h-3" />
                      {(room.activeUsers || []).length} ئەندام
                      {room.hostCode && (
                        <span className="ml-auto font-mono text-indigo-400/80">host: {room.hostCode}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* INSIDE ACTIVE ROOM SCREEN */
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Room Top Bar */}
          <div className="px-6 py-4 border-b border-white/5 bg-zinc-950/80 backdrop-blur-3xl flex items-center justify-between z-30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <Video className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white kurdish-text">{activeRoom.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] text-gray-500 font-mono">ID: {activeRoom.id}</span>
                  {activeRoom.uniqueCode && (
                    <span className="px-1.5 py-0.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-lg text-[8px] font-black tracking-widest font-mono">
                      کۆد: {activeRoom.uniqueCode}
                    </span>
                  )}
                  {isHost && (
                    <span className="px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-lg text-[8px] font-black tracking-widest uppercase ml-1">
                      خانەخوێ / HOST
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={handleCopyLink}
                className="px-4 py-2 bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-gray-200 text-[10px] font-black kurdish-text rounded-xl flex items-center gap-2 transition-all cursor-pointer"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-indigo-400" />}
                {isCopied ? "کۆپی کرا!" : "بانگهێشتی هاوڕێیان"}
              </button>

              <button 
                onClick={handleLeaveRoom}
                className="p-2.5 bg-red-950/20 border border-red-500/20 hover:bg-red-950/60 text-red-400 rounded-xl transition-all cursor-pointer"
                title="Leave Room"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Central Main Grid: Player vs Chat & Active Users */}
          <div className="flex-1 flex flex-col lg:flex-row items-stretch overflow-hidden">
            {/* Playback Container Zone */}
            <div className="flex-1 bg-black flex flex-col justify-between overflow-hidden relative">
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-5xl aspect-video bg-zinc-950 rounded-3xl overflow-hidden border border-white/5 relative shadow-inner">
                  {/* YouTube Iframe Player container scaled up to naturally push controls/title out of view */}
                  <div className="absolute inset-0 w-full h-full overflow-hidden scale-[1.26] scale-y-[1.24] origin-center z-0">
                    <div className="w-full h-full pointer-events-none" id="camehere-yt-player" ref={iframeRef}></div>
                  </div>
                  {/* Transparent Click Prevention Mask */}
                  <div className="absolute inset-0 z-10 bg-transparent cursor-default" />
                  {/* Solid Cinematic Letterbox Overlays to fully cover any remaining YouTube top/bottom interfaces */}
                  <div className="absolute top-0 inset-x-0 h-[12%] bg-zinc-950 border-b border-white/5 z-20 pointer-events-none" />
                  <div className="absolute bottom-0 inset-x-0 h-[12%] bg-zinc-950 border-t border-white/5 z-20 pointer-events-none" />
                  {/* Premium shading gradient under letterboxes */}
                  <div className="absolute top-[12%] inset-x-0 h-6 bg-gradient-to-b from-black to-transparent z-15 pointer-events-none opacity-90" />
                  <div className="absolute bottom-[12%] inset-x-0 h-6 bg-gradient-to-t from-black to-transparent z-15 pointer-events-none opacity-90" />
                </div>
              </div>

              {/* Movies to Play in active Room */}
              <div className="px-6 py-3 bg-zinc-950/40 border-t border-white/5 z-20 overflow-hidden">
                <p className="text-[11px] text-indigo-400 kurdish-text font-black mb-2 flex items-center gap-1.5 pb-1 border-b border-white/5">
                  <Play className="w-3.5 h-3.5 text-indigo-400 fill-current" />
                  فیلم و زنجیرە بڵاوکراوەکان بۆ لێدان لەم ژوورەدا:
                </p>
                {roomMovieList.length === 0 ? (
                  <p className="text-[10px] text-gray-500 kurdish-text">هیچ فیلمێک بەردەست نییە بۆ هەڵبژاردن</p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 pr-1 no-scrollbar">
                    {roomMovieList.map((movie) => {
                      const movieUrl = moviePlayUrl(movie);
                      const isSelected = activeRoom.currentMovieUrl === movieUrl;
                      return (
                        <div
                          key={movie.id}
                          onClick={() => handleSelectMovieInRoom(movie)}
                          className={`flex-shrink-0 cursor-pointer p-1.5 px-2.5 rounded-xl border flex items-center gap-2 transition-all hover:bg-zinc-805 active:scale-95 ${
                            isSelected 
                              ? "bg-indigo-950/45 border-indigo-500/40 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                              : "bg-zinc-900/60 border-white/5 text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          <div className="aspect-[15/10] w-full rounded overflow-hidden shrink-0 bg-zinc-950 border border-white/5">
                            <img 
                              src={movie.image || ""} 
                              className="w-full h-full object-cover" 
                              onError={(e)=>{(e.target as HTMLImageElement).src="https://images.unsplash.com/photo-1485846234645-a62644f84728?w=200"}} 
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <span className="text-[9px] text-white/95 font-bold kurdish-text truncate w-full block">
                            {movie.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Player Overlay Controls / Host Panel */}
              <div className="px-6 py-4 bg-zinc-950/60 border-t border-white/5 flex items-center justify-between gap-4 z-20">
                <div className="flex items-center gap-3">
                  {isHost ? (
                    <button 
                      onClick={togglePlayState}
                      className="p-3 bg-emerald-600 hover:bg-emerald-700 text-black rounded-full transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/15"
                    >
                      {activeRoom.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>
                  ) : (
                    <div className="px-3 py-1.5 bg-zinc-900/80 border border-white/10 text-gray-400 text-[9px] font-black kurdish-text rounded-lg">
                      بەستراوە بە لایڤی خانەخوێوە (Synced) 🔒
                    </div>
                  )}

                  {/* Client side Focus/Mute button */}
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-3 rounded-full transition-all active:scale-95 cursor-pointer ${isMuted ? 'bg-red-950/30 border border-red-500/20 text-red-400' : 'bg-zinc-900 text-gray-400 hover:text-white'}`}
                    title={isMuted ? "Unmute Movie" : "Mute Movie (Chat Focused)"}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-gray-500 kurdish-text">سەیری کاردانەوەکان بکە یان چات بکە لەگەڵ هاڕێکانت</span>
                  <div className="bg-zinc-900/30 border border-white/5 px-2.5 py-1 rounded-lg text-[9px] text-indigo-400/90 font-sans tracking-wide mt-1 select-none max-w-sm truncate">
                    🔐 لێدەرێکی پارێزراو (پەیوەستکەری چاتی هاوڕێیان)
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar Compartment - Chat Window & Handshake active users */}
            <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-white/5 bg-zinc-950/40 flex flex-col justify-between overflow-hidden">
              
              {/* Active Users Section */}
              <div className="p-4 border-b border-white/5 bg-zinc-950/60">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[10px] text-gray-400 font-black kurdish-text">ئەندامانی چالاک لەم کۆمەڵەیە ({activeRoom.activeUsers?.length || 0})</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {activeRoom.activeUsers && activeRoom.activeUsers.map((u, i) => (
                    <span 
                      key={i} 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-white/5 rounded-lg text-[9px] text-gray-200"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {u.username}
                    </span>
                  ))}
                </div>
              </div>

              {/* Host Invitation Panel */}
              {isHost && (
                <div className="p-4 border-b border-white/5 bg-zinc-900/10 space-y-2">
                  <p className="text-[10px] text-indigo-400 font-black kurdish-text flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    بانگهێشتکردنی هاوڕێ بۆ ئەم ژوورە:
                  </p>
                  <form onSubmit={handleInviteFriend} className="flex gap-2">
                    <input
                      type="text" 
                      value={inviteTarget}
                      onChange={(e) => setInviteTarget(e.target.value)}
                      placeholder="کۆدی بێهاوتا یان ناوی..."
                      className="flex-1 px-3 py-2 bg-black border border-white/5 rounded-xl text-[10px] text-white focus:outline-none focus:border-indigo-500/50 kurdish-text transition-all font-bold placeholder:text-gray-500"
                    />
                    <button
                      type="submit"
                      disabled={isInviting || !inviteTarget.trim()}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black kurdish-text cursor-pointer transition-all active:scale-95 shrink-0"
                    >
                      {isInviting ? "..." : "بانگهێشتکردن"}
                    </button>
                  </form>
                  {inviteError && (
                    <p className="text-[9px] text-red-400 font-bold kurdish-text mt-1">{inviteError}</p>
                  )}
                  {inviteSuccess && (
                    <p className="text-[9px] text-emerald-400 font-bold kurdish-text mt-1">{inviteSuccess}</p>
                  )}
                </div>
              )}

              {/* Unique Code / Persona Settings Panel */}
              <div className="p-4 border-b border-white/5 bg-zinc-900/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(!showSettings);
                    setSidebarFeedback("");
                  }}
                  className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-805 border border-white/5 rounded-xl flex items-center justify-between text-[11px] font-black kurdish-text transition-all text-indigo-300 hover:text-white"
                >
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-indigo-400" />
                    تۆمارکردن / گۆڕینی کۆدی بێ هاوتا
                  </span>
                  <span>{showSettings ? "داخستن ▲" : "ڕێکخستن / زیادکردنی کۆد ▼"}</span>
                </button>

                <AnimatePresence>
                  {showSettings && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleSidebarJoin}
                      className="space-y-3 mt-3 overflow-hidden"
                    >
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[9px] text-gray-400 kurdish-text font-bold uppercase">کۆدی بێ هاوتا (ID / Passcode)</label>
                          {socialProfile?.uniqueCode && (
                            <button
                              type="button"
                              onClick={() => {
                                setSidebarCodeInput(socialProfile.uniqueCode);
                                if (socialProfile.username) {
                                  setSidebarNameInput(socialProfile.username);
                                }
                                setSidebarFeedback("کۆدەکەت لە ئەکاونتەکەتەوە وەرگیرا ⚡");
                              }}
                              className="text-[9px] text-indigo-400 hover:underline font-bold kurdish-text cursor-pointer"
                            >
                              وەرگرتن لە پرۆفایل ↻
                            </button>
                          )}
                        </div>
                        <input
                          type="text" 
                          value={sidebarCodeInput}
                          onChange={(e) => setSidebarCodeInput(e.target.value)}
                          placeholder="کۆدی پاسپۆرت یان ناسنامە"
                          className="w-full px-3 py-2 bg-zinc-950 border border-white/5 rounded-lg text-[10px] text-white text-center focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-gray-400 kurdish-text font-bold mb-1 uppercase">ناوی نیشاندراو لە چاتدا</label>
                        <input
                          type="text" 
                          value={sidebarNameInput}
                          onChange={(e) => setSidebarNameInput(e.target.value)}
                          placeholder="ناوی خۆت بنووسە"
                          className="w-full px-3 py-2 bg-zinc-950 border border-white/5 rounded-lg text-[10px] text-white/95 kurdish-text focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                        />
                      </div>

                      {sidebarFeedback && (
                        <p className={`text-[9.5px] font-black text-center kurdish-text ${sidebarFeedback.includes("✓") || sidebarFeedback.includes("وەرگیرا") ? "text-emerald-400" : "text-amber-400"}`}>
                          {sidebarFeedback}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black kurdish-text rounded-xl text-[10px] transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10"
                      >
                        <Cast className="w-3 h-3" />
                        جێبەجێکردن و نوێکردنەوە ⚡
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>

              {/* Real-time Room Chat messages display list */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col-reverse max-h-[40vh] lg:max-h-none">
                <div className="space-y-3">
                  {chatMessages && chatMessages.map((msg, index) => (
                    <div 
                      key={msg.id || index}
                      className={`flex flex-col ${msg.senderCode === userCodeInput ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[9px] text-gray-500 mb-0.5">{msg.sender}</span>
                      <div className={`px-3 py-2 rounded-2xl text-[11px] max-w-[85%] kurdish-text leading-relaxed font-black ${
                        msg.senderCode === userCodeInput 
                          ? 'bg-indigo-600 text-white rounded-tr-none' 
                          : 'bg-zinc-900 text-gray-200 rounded-tl-none border border-white/5'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {(!chatMessages || chatMessages.length === 0) && (
                    <div className="text-center py-10 text-gray-500 text-[10px] kurdish-text">
                      هیچ نامەیەک نییە لە ژوورەکەدا، دەستپێ بکە بە نامەناردن! 💬
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Input form pad */}
              <form onSubmit={handleSendChat} className="p-4 border-t border-white/5 bg-zinc-950/60 flex items-center gap-2">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="شتێک بنووسە بۆ هاوڕێکانت..."
                  className="flex-1 px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-xs text-white kurdish-text focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

            </div>
          </div>
        </div>
      )}

      {/* Real-time Incoming Invitation Alerts */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {activeInvitations.map((inv) => (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, y: -20 }}
              className="bg-zinc-950/95 border border-amber-500/30 shadow-[0_4px_30px_rgba(245,158,11,0.15)] rounded-2xl p-4 text-right relative pointer-events-auto overflow-hidden group flex flex-col gap-3"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 to-indigo-500" />
              
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 text-right min-w-0">
                  <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider font-mono">بانگهێشتنامەی نوێ</span>
                  <p className="text-xs font-bold text-white kurdish-text mt-1 leading-relaxed">
                    هاوڕێ <span className="text-amber-300 font-black">@{inv.fromUserName}</span> تۆی بانگهێشت کرد بۆ ئەم ژوورە:
                  </p>
                  <p className="text-[11px] text-gray-300 font-black font-sans leading-relaxed mt-1 border-b border-white/5 pb-2">
                    🎬 {inv.roomName}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => handleRespondToInvite(inv.id, "declined", inv.roomId)}
                  className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-805 text-gray-400 hover:text-gray-200 text-[10px] font-black kurdish-text rounded-lg transition-all cursor-pointer"
                >
                  پاشگوێخستن
                </button>
                <button
                  type="button"
                  onClick={() => handleRespondToInvite(inv.id, "accepted", inv.roomId)}
                  className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black text-[10px] font-black kurdish-text rounded-lg transition-all shadow-md shadow-amber-500/10 active:scale-95 cursor-pointer"
                >
                  باشە و چوونە ژوورەوە ✓
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
