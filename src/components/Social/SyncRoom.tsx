import React, { useState, useEffect, useRef } from 'react';
import { 
  db, 
  auth,
  collection, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  where,
  getDocs,
  getDoc,
  arrayUnion
} from '../../lib/firebase';
import { useSocialAuth } from '../../context/SocialAuthContext';
import { SyncGroup, ChatMessage, EmojiReaction, Movie, SocialUser } from '../../types';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { 
  Send, 
  Smile, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  X, 
  Users, 
  Sparkles,
  MessageCircle,
  Plus,
  Settings,
  ShieldAlert,
  Languages,
  Headphones,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AgoraRTC, { IAgoraRTCClient } from 'agora-rtc-sdk-ng';

interface SyncRoomProps {
  room: SyncGroup;
  currentMovie: Movie | null;
  onClose: () => void;
  onSyncPlayback: (time: number, playing: boolean) => void;
  vipVideoUrl?: string;
}

const AGORA_APP_ID = (import.meta.env.VITE_AGORA_APP_ID || '').trim();

export const SyncRoom: React.FC<SyncRoomProps> = ({ room, currentMovie, onClose, onSyncPlayback, vipVideoUrl }) => {
  const { socialProfile } = useSocialAuth();
  // Check for Agora ID and warn if missing
  useEffect(() => {
    if (!AGORA_APP_ID) {
      console.error("Agora App ID is missing! Voice chat will not work.");
    }
  }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [reactions, setReactions] = useState<EmojiReaction[]>([]);
  const [activeMembers, setActiveMembers] = useState<SocialUser[]>([]);
  const [isVoiceOn, setIsVoiceOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isRoomAudioMuted, setIsRoomAudioMuted] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [roomSubtitles, setRoomSubtitles] = useState<{ start: number, end: number, text: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [friendIdInput, setFriendIdInput] = useState('');
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [addFriendError, setAddFriendError] = useState<string | null>(null);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [translationLang, setTranslationLang] = useState<string | null>('Sorani');
  const [currentSubtitle, setCurrentSubtitle] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const agoraClient = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrack = useRef<any>(null);
  const isJoiningVoice = useRef(false);

  // Initialize Voice only when successfully inside the room
  useEffect(() => {
    if (room.id) {
      const timer = setTimeout(() => {
        setIsVoiceOn(true);
      }, 500); // Small delay to ensure component stability
      return () => clearTimeout(timer);
    }
  }, [room.id]);

  const [isMutedByAdmin, setIsMutedByAdmin] = useState(false);
  const [isKickedByAdmin, setIsKickedByAdmin] = useState(false);
  const [bannedKeywords, setBannedKeywords] = useState<string[]>([]);

  useEffect(() => {
    const fetchKeywords = async () => {
      try {
        const res = await fetch("/api/admin/banned-keywords");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setBannedKeywords(data);
          }
        }
      } catch (err) {
        console.warn("Error fetching banned keywords:", err);
      }
    };
    fetchKeywords();
  }, []);

  // Real-time listener for Admin Security controls (Mute & Kick)
  useEffect(() => {
    if (!socialProfile?.uid || socialProfile.uid === 'admin_local_bypass') return;
    const userRef = doc(db, 'users', socialProfile.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsMutedByAdmin(!!data.isMuted);
        if (data.isKicked) {
          setIsKickedByAdmin(true);
        }
      }
    });
    return () => unsubscribe();
  }, [socialProfile?.uid]);

  // Handle kick effect
  useEffect(() => {
    if (isKickedByAdmin) {
      alert("⚠️ تۆ لەم ژوورە دەرکرایت لەلایەن ئەدمینەوە یان ڕێکخەری سیستمەکە.");
      // Soft reset so they can join rooms normally on their next session
      const userRef = doc(db, 'users', socialProfile!.uid);
      updateDoc(userRef, { isKicked: false }).catch(() => {});
      onClose();
    }
  }, [isKickedByAdmin, onClose, socialProfile]);

  const [isChatQuotaExceeded, setIsChatQuotaExceeded] = useState(false);
  const [isReactionsQuotaExceeded, setIsReactionsQuotaExceeded] = useState(false);

  // Consolidated Firestore Listeners (Chat, Playback, Reactions)
  useEffect(() => {
    let unsubPlay: any;
    let unsubChat: any;
    let unsubReactions: any;
    
    if (!room.id) return;
    const docRef = doc(db, 'syncGroups', room.id);
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        // 1. Playback
        unsubPlay = onSnapshot(docRef, (snap) => {
          const data = snap.data();
          if (!data) return;
          
          setRoomSubtitles(data.activeSubtitles || []);
          
          const { isPlaying, currentTime, updatedAt } = data.playback || {};
          const lastUpdate = updatedAt ? new Date(updatedAt).getTime() : Date.now();
          const drift = isPlaying ? (Date.now() - lastUpdate) / 1000 : 0;
          const finalTime = (currentTime || 0) + drift;
          
          setIsPlaying(isPlaying || false);
          setCurrentTime(finalTime);
          onSyncPlayback(finalTime, isPlaying || false);
        }, (error) => {
          const messageStr = error instanceof Error ? error.message : String(error);
          const isNotFoundError = (error as any)?.code === 'not-found' || messageStr.toLowerCase().includes("not_found") || messageStr.includes("NOT_FOUND");
          
          if (isNotFoundError) {
            console.warn("SyncRoom: Playback document not found (ignoring):", docRef.path);
          } else {
            handleFirestoreError(error, OperationType.GET, `syncGroups/${room.id}`);
          }
        });

        // 2. Chat
        const isGlobal = room.id === 'global_room_official';
        const hasAuth = auth.currentUser !== null && auth.currentUser.uid !== 'admin_local_bypass';
        if (!isChatQuotaExceeded && (isGlobal || hasAuth)) {
          const qChat = query(
            collection(db, 'syncGroups', room.id, 'messages'),
            orderBy('createdAt', 'asc'),
            limit(30)
          );
          unsubChat = onSnapshot(qChat, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage)));
            setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
          }, (error) => {
            const messageStr = error instanceof Error ? error.message : String(error);
            const isNotFoundError = (error as any)?.code === 'not-found' || messageStr.toLowerCase().includes("not_found") || messageStr.includes("NOT_FOUND");
            if (isNotFoundError) {
              console.warn("SyncRoom: Chat document not found (ignoring)");
            } else if (messageStr.toLowerCase().includes("quota")) {
              console.warn("SyncRoom: Quota error for Chat (ignoring)");
            } else {
              handleFirestoreError(error, OperationType.GET, `syncGroups/${room.id}/messages`);
            }
          });
        }

        // 3. Reactions
        if (!isReactionsQuotaExceeded && (isGlobal || hasAuth)) {
          const qReact = query(
            collection(db, 'syncGroups', room.id, 'reactions'),
            orderBy('createdAt', 'desc'),
            limit(10)
          );
          unsubReactions = onSnapshot(qReact, (snapshot) => {
             setReactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmojiReaction)));
          }, (error) => {
            const messageStr = error instanceof Error ? error.message : String(error);
            const isNotFoundError = (error as any)?.code === 'not-found' || messageStr.toLowerCase().includes("not_found") || messageStr.includes("NOT_FOUND");
            if (isNotFoundError) {
              console.warn("SyncRoom: Reactions doc not found (ignoring)");
            } else if (messageStr.toLowerCase().includes("quota")) {
              console.warn("SyncRoom: Quota error for Reactions (ignoring)");
            } else {
              handleFirestoreError(error, OperationType.GET, `syncGroups/${room.id}/reactions`);
            }
          });
        }
      } else {
        console.warn("Sync listener paused: Parent document syncGroups not found.");
      }
    }).catch(err => console.warn("Failed to check existence", err));

    // Online members sync - Optimized with periodic getDocs
    const fetchMembers = async () => {
      try {
        const membersQuery = query(
          collection(db, 'users'),
          where('uid', 'in', (room.memberIds && room.memberIds.length > 0) ? room.memberIds.slice(0, 10) : ['placeholder']),
          limit(10)
        );
        const snap = await getDocs(membersQuery);
        setActiveMembers(snap.docs.map(d => d.data() as SocialUser));
      } catch (error) {
        if (error instanceof Error && !error.message.includes("quota")) {
          handleFirestoreError(error, OperationType.GET, 'users');
        }
      }
    };

    fetchMembers();
    const interval = setInterval(fetchMembers, 30000); // 30s refresh

    return () => {
      if (unsubPlay) unsubPlay();
      if (unsubChat) unsubChat();
      if (unsubReactions) unsubReactions();
      clearInterval(interval);
    };
  }, [room.id, isChatQuotaExceeded, isReactionsQuotaExceeded, onSyncPlayback]);

  // Agora Voice Chat Integration
  useEffect(() => {
    if (isVoiceOn) {
      joinVoice();
    } else {
      leaveVoice();
    }
    return () => { leaveVoice(); };
  }, [isVoiceOn]);

  const joinVoice = async () => {
    if (isJoiningVoice.current) return;
    
    try {
      if (!AGORA_APP_ID || AGORA_APP_ID === 'undefined' || AGORA_APP_ID.length < 10) {
        console.warn("Agora App ID is missing or definitely invalid. Voice chat disabled.");
        setIsVoiceOn(false);
        return;
      }
      
      if (agoraClient.current && (agoraClient.current as any)._joined) {
        return;
      }

      isJoiningVoice.current = true;

      // Silence Agora SDK internal error logs for invalid App ID scenarios
      AgoraRTC.setLogLevel(4); 
      
      if (!agoraClient.current) {
        agoraClient.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      }
      
      const client = agoraClient.current;

      // Volume Indication for ducking
      client.on('volume-indicator', (volumes) => {
        const isAnyoneSpeaking = volumes.some(v => v.level > 20);
        const plyr = (window as any).currentPlayer;
        if (plyr) {
          plyr.volume = isAnyoneSpeaking ? 0.2 : 1.0;
        }
      });
      client.enableAudioVolumeIndicator();

      await client.join(AGORA_APP_ID, room.id, null, socialProfile?.uid);
      
      if (!isJoiningVoice.current) {
        // If we were supposed to leave while joining, leave now
        await client.leave();
        return;
      }

      localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack();
      await client.publish([localAudioTrack.current]);
      
      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio') {
            if (!isRoomAudioMuted) {
              Promise.resolve(user.audioTrack?.play()).catch((playErr) => {
                console.warn("Agora remote audio track play interrupted or blocked:", playErr);
              });
            }
          }
        } catch (subErr) {
          console.error("Agora subscription failed:", subErr);
        }
      });
    } catch (err: any) {
      if (err.code === 'OPERATION_ABORTED' || err.message?.includes('cancel token canceled')) {
        console.warn('Agora join aborted (expected during rapid state changes)');
        return;
      }

      const isConfigError = err.message?.includes('invalid vendor key') || err.message?.includes('appid') || err.code === 'CAN_NOT_GET_GATEWAY_SERVER';
      
      if (isConfigError) {
        console.warn("Agora connection skipped: Invalid App ID configuration.");
      } else {
        console.error('Agora join failed:', err);
      }
      setIsVoiceOn(false);
    } finally {
      isJoiningVoice.current = false;
    }
  };

  const leaveVoice = async () => {
    isJoiningVoice.current = false;
    try {
      if (localAudioTrack.current) {
        localAudioTrack.current.stop();
        localAudioTrack.current.close();
        localAudioTrack.current = null;
      }
      if (agoraClient.current) {
        await agoraClient.current.leave();
      }
    } catch (err) {
      console.warn("Agora leave error:", err);
    }
  };

  useEffect(() => {
    if (!isPlaying) return;
    
    // If we have room subtitles, use them, otherwise fallback to AI Mock
    if (roomSubtitles.length > 0) {
      const interval = setInterval(() => {
        // We use a functional update or ref here? 
        // Actually, let's just use setCurrentTime in its own ticker and let this effect depend on it.
      }, 500);
      // Wait, let's just make it simpler.
    }
    
    // Ticker to advance local time and find subtitles
    const ticker = setInterval(() => {
      if (isPlaying) {
        setCurrentTime(prev => {
          const next = prev + 0.5;
          
          if (roomSubtitles && roomSubtitles.length > 0) {
            const found = roomSubtitles.find(s => next >= s.start && next <= s.end);
            setCurrentSubtitle(found ? found.text : null);
          } else if (translationLang) {
            // Fallback mock captions if translation is enabled and no SRT uploaded
            const mockCaptions: Record<string, string[]> = {
              'Sorani': ["بەخێرهاتیت بۆ ژووری CinemaChat.", "چێژ لە فیلمەکە وەربگرن پێکەوە.", "پەیوەندییەکە جێگیرە.", "وەرگێڕانی زیرەکی دەستکرد کارایە."],
              'English': ["Welcome to CinemaChat Room.", "Enjoy the movie together.", "The connection is stable.", "AI Translation is active."]
            };
            const lang = (translationLang === 'Sorani') ? 'Sorani' : 'English';
            const index = Math.floor(next / 4) % (mockCaptions[lang]?.length || 1);
            setCurrentSubtitle(mockCaptions[lang][index]);
          } else {
            setCurrentSubtitle(null);
          }
          return next;
        });
      }
    }, 500);

    return () => clearInterval(ticker);
  }, [isPlaying, translationLang, roomSubtitles]);
  const toggleMute = () => {
    if (localAudioTrack.current) {
      const nextMuteState = !isMuted;
      localAudioTrack.current.setEnabled(!nextMuteState);
      setIsMuted(nextMuteState);
    }
  };

  const handleSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socialProfile || socialProfile.uid !== room.creatorId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      
      // Basic SRT/VTT Parser
      const parseSubtitles = (content: string) => {
        const lines = content.trim().split(/\r?\n/);
        const subs: { start: number, end: number, text: string }[] = [];
        let currentSub: any = {};

        const timeToSeconds = (timeStr: string) => {
          const cleanTime = timeStr.replace(',', '.').trim();
          const parts = cleanTime.split(':');
          if (parts.length < 3) return 0;
          const h = parseFloat(parts[0]);
          const m = parseFloat(parts[1]);
          const s = parseFloat(parts[2]);
          return h * 3600 + m * 60 + s;
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.includes('-->')) {
            const times = line.split('-->');
            currentSub.start = timeToSeconds(times[0]);
            currentSub.end = timeToSeconds(times[1]);
          } else if (line === '' && currentSub.start !== undefined) {
            subs.push(currentSub);
            currentSub = {};
          } else if (isNaN(Number(line)) && line !== '' && !line.startsWith('WEBVTT')) {
            currentSub.text = currentSub.text ? `${currentSub.text}\n${line}` : line;
          }
        }
        if (currentSub.start !== undefined) subs.push(currentSub);
        return subs;
      };

      const parsed = parseSubtitles(text);
      if (parsed.length > 0) {
        await updateDoc(doc(db, 'syncGroups', room.id), {
          activeSubtitles: parsed.slice(0, 500) // Limit to avoid Firestore doc size limit
        });
        alert('ژێڕنووس بە سەرکەوتوویی بارکرا بۆ هەمووان.');
      }
    };
    reader.readAsText(file);
  };

  const toggleRoomAudio = () => {
    const nextState = !isRoomAudioMuted;
    setIsRoomAudioMuted(nextState);
    
    // Toggle all remote audio tracks
    if (agoraClient.current) {
      agoraClient.current.remoteUsers.forEach(user => {
        if (nextState) {
          user.audioTrack?.stop();
        } else {
          Promise.resolve(user.audioTrack?.play()).catch((playErr) => {
            console.warn("Agora remote audio track toggle play failed:", playErr);
          });
        }
      });
    }
  };

  // Add Friend Logic
  const addFriend = async () => {
    if (!friendIdInput.trim()) return;
    setIsAddingFriend(true);
    setAddFriendError(null);
    
    try {
      const trimmedCode = friendIdInput.trim().toUpperCase();
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uniqueCode', '==', trimmedCode), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setAddFriendError('بەکارهێنەر نەدۆزرایەوە');
        return;
      }
      
      const targetUser = querySnapshot.docs[0].data() as SocialUser;
      
      // Update sync group member list
      const roomRef = doc(db, 'syncGroups', room.id);
      await updateDoc(roomRef, {
        memberIds: arrayUnion(targetUser.uid)
      });
      
      setFriendIdInput('');
      setShowAddFriend(false);
      alert(`${targetUser.name} بۆ گروپەکە زیادکرا`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `syncGroups/${room.id}`);
      setAddFriendError('هەڵەیەک ڕوویدا لە کاتی زیادکردن');
    } finally {
      setIsAddingFriend(false);
    }
  };

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    if (isMutedByAdmin) {
      alert("🚫 ناتوانیت نامەی دەنگی بنێریت، چونکە لەلایەن ئەدمینەوە بێدەنگ کراویت.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (e) => {
        audioChunks.current.push(e.data);
      };
      
      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        // Convert to base64 for storage (demo purpose)
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (!socialProfile) return;
          await addDoc(collection(db, 'syncGroups', room.id, 'messages'), {
            senderId: socialProfile.uid,
            senderName: socialProfile.name,
            audio: base64Audio,
            type: 'voice',
            createdAt: serverTimestamp(),
          });
        };
      };
      
      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error starting recording:', err);
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.trim() || !socialProfile) return;
    
    if (isMutedByAdmin) {
      alert("🚫 ناتوانیت نامە بنێریت، چونکە لەلایەن ئەدمینەوە بێدەنگ کراویت.");
      return;
    }
    
    // Check if it's a video link broadcast command
    if ((socialProfile.uid === room.creatorId || room.id === 'global_room_official') && (newMsg.startsWith('http') || newMsg.includes('youtube.com/watch') || newMsg.includes('youtu.be/'))) {
       if (confirm('دەتەوێت ئەم لینکە پەخش بکەیت بۆ هەمووان؟')) {
          const url = newMsg.trim();
          await updateDoc(doc(db, 'syncGroups', room.id), {
            'playback.isPlaying': true,
            'playback.currentTime': 0,
            'playback.updatedAt': new Date().toISOString(),
            'currentMovieId': 'custom_link',
            'videoData': {
              id: 'custom_link',
              title: 'پەخشی دەستی',
              url: url,
              isYouTube: url.includes('youtube.com') || url.includes('youtu.be'),
              videoId: url.includes('youtube.com') ? url.split('v=')[1]?.split('&')[0] : (url.includes('youtu.be') ? url.split('/').pop() : null)
            }
          });
          setNewMsg('');
          return;
       }
    }

    let censoredMsg = newMsg;
    if (Array.isArray(bannedKeywords) && bannedKeywords.length > 0) {
      bannedKeywords.forEach((keyword) => {
        if (keyword.trim()) {
          const regex = new RegExp(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
          censoredMsg = censoredMsg.replace(regex, '*'.repeat(keyword.length));
        }
      });
    }

    await addDoc(collection(db, 'syncGroups', room.id, 'messages'), {
      senderId: socialProfile.uid,
      senderName: socialProfile.name,
      text: censoredMsg,
      type: 'text',
      createdAt: serverTimestamp(),
    });
    setNewMsg('');
  };

  const sendReaction = async (emoji: string) => {
    if (!socialProfile) return;
    if (isMutedByAdmin) {
      alert("🚫 ناتوانیت پەرچەکردار بنێریت، چونکە لەلایەن ئەدمینەوە بێدەنگ کراویت.");
      return;
    }
    try {
      await addDoc(collection(db, 'syncGroups', room.id, 'reactions'), {
        senderId: socialProfile.uid,
        type: emoji,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("quota")) {
         setIsReactionsQuotaExceeded(true);
      } else {
         console.error('Reaction Error:', err);
      }
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(room.id);
    alert('کۆدی ژوورەکە کۆپی کرا: ' + room.id);
  };

  const EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '🎬'];

  return (
    <div className="flex flex-col h-full bg-transparent relative overflow-hidden pointer-events-none">
      {/* Floating Reactions Layer (Absolute over everything) */}
      <div className="absolute inset-x-0 bottom-32 pointer-events-none z-40 overflow-hidden h-64">
        <AnimatePresence>
          {reactions.map((r, i) => (
            <motion.div
              key={r.id || i}
              initial={{ y: 200, x: Math.random() * 200 - 100, opacity: 0, scale: 0.5 }}
              animate={{ y: -200, opacity: 1, scale: 2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3, ease: 'easeOut' }}
              className="absolute left-1/2 bottom-0 text-4xl"
            >
              {r.type}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Interface Content */}
        <div className={`flex-1 flex flex-col transition-all ${showChat ? 'md:mr-80' : ''}`}>
           {/* Controls Bar */}
           <div className="p-4 bg-zinc-900/50 backdrop-blur-md border-b border-white/10 flex items-center justify-between z-50 pointer-events-auto">
             <div className="flex items-center gap-4">
               <button 
                  onClick={onClose} 
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-md border border-white/10"
               >
                 Exit Room
               </button>
               <div className="flex flex-col">
                 <h2 className="text-white font-black kurdish-text text-sm">{room.name}</h2>
                 <button 
                   onClick={copyRoomId}
                   className="text-[8px] text-gray-500 font-black uppercase tracking-widest flex items-center gap-1 hover:text-brand-primary"
                 >
                   <span>ID: {room.id}</span>
                   <Sparkles className="w-2 h-2" />
                 </button>
               </div>
             </div>

             <div className="flex items-center gap-2">
               {/* AI Translation Toggle */}
               <div className="flex items-center bg-black/40 rounded-2xl p-1 border border-white/5 mr-2">
                 <button 
                  onClick={() => setTranslationLang(translationLang ? null : 'Sorani')}
                  className={`flex items-center gap-2 p-3 px-4 rounded-xl transition-all ${translationLang ? 'bg-brand-primary text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                  title="AI Live Translation"
                 >
                   <Languages className="w-4 h-4" />
                   <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">
                     {translationLang ? `AI: ${translationLang}` : 'AI Translate'}
                   </span>
                 </button>
                 {translationLang && (
                   <select 
                     value={translationLang}
                     onChange={(e) => setTranslationLang(e.target.value)}
                     className="bg-transparent text-[8px] font-bold text-white outline-none px-2 border-l border-white/10"
                   >
                     <option value="Sorani" className="bg-zinc-900">Sorani</option>
                     <option value="Arabic" className="bg-zinc-900">Arabic</option>
                     <option value="Spanish" className="bg-zinc-900">Spanish</option>
                   </select>
                 )}
               </div>

               {/* Voice Controls */}
               <div className="flex items-center bg-black/40 rounded-2xl p-1 border border-white/5">
                 <button 
                  onClick={toggleMute}
                  className={`p-3 rounded-xl transition-all ${!isMuted ? 'bg-brand-primary text-white shadow-lg' : 'bg-red-600/20 text-red-500'}`}
                  title={isMuted ? "Unmute My Mic" : "Mute My Mic"}
                 >
                   {!isMuted ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                 </button>
                 <button 
                 onClick={toggleRoomAudio}
                 className={`p-3 rounded-xl transition-all ${!isRoomAudioMuted ? 'text-green-500 hover:bg-white/5' : 'text-gray-500 hover:bg-white/5'}`}
                 title={isRoomAudioMuted ? "Unmute Room Audio" : "Mute Room Audio"}
                 >
                   {!isRoomAudioMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                 </button>
               </div>

               {/* Subtitle Upload (Host Only) */}
               {socialProfile?.uid === room.creatorId && (
                 <div className="flex items-center gap-2">
                   <input 
                     type="file" 
                     ref={fileInputRef} 
                     onChange={handleSubtitleUpload} 
                     accept=".srt,.vtt" 
                     className="hidden" 
                   />
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="px-4 py-2 bg-white/5 hover:bg-brand-primary/20 border border-white/10 rounded-xl text-white text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest"
                     title="Upload Subtitles (SRT/VTT)"
                   >
                     <Plus className="w-3.5 h-3.5" />
                     <span>بارکردنی ژێڕنووس</span>
                   </button>
                 </div>
               )}

               <button 
                onClick={() => setShowChat(!showChat)}
                className={`p-3 rounded-2xl transition-all ${showChat ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
               >
                 <MessageCircle className="w-5 h-5" />
               </button>
             </div>
           </div>

           {/* Central Area (Transparent to show video) */}
           <div className="flex-1 relative flex flex-col items-center justify-center p-12 text-center overflow-hidden pointer-events-none">
              {/* Branding Watermark Layer */}
              <div className="absolute right-6 bottom-32 md:bottom-24 z-10 opacity-30 select-none">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-white tracking-[0.3em] uppercase drop-shadow-lg">CinemaChat</span>
                  <div className="h-[1px] w-12 bg-white/50 mt-1" />
                </div>
              </div>

              {/* Translation Subtitles Layer */}
              {((translationLang && currentSubtitle) || (roomSubtitles && roomSubtitles.length > 0 && currentSubtitle)) && isPlaying && (
                <div className="absolute inset-x-0 bottom-32 md:bottom-24 flex justify-center z-[1000] pointer-events-none px-8">
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="max-w-4xl bg-black/60 backdrop-blur-2xl border border-white/10 px-8 py-4 rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)]"
                  >
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                      <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] kurdish-text">
                        {roomSubtitles && roomSubtitles.length > 0 ? "ژێڕنووسی فیلم" : `AI وەرگێڕانی ڕاستەوخۆ: ${translationLang}`}
                      </span>
                    </div>
                    <p className="text-white kurdish-text text-xl md:text-2xl font-black leading-relaxed drop-shadow-2xl text-center">
                      {currentSubtitle}
                    </p>
                  </motion.div>
                </div>
              )}
           </div>
        </div>

        {/* Sidebar Chat */}
        <AnimatePresence>
          {showChat && (
            <motion.div 
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              className="w-full md:w-80 bg-zinc-950 border-l border-white/10 flex flex-col fixed right-0 top-0 bottom-0 z-50 md:relative pointer-events-auto"
            >
              <div className="p-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-white kurdish-text">کۆمەڵە</h3>
                  <button onClick={() => setShowChat(false)} className="md:hidden p-2 text-gray-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Members List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">ئەندامەکان ({activeMembers.length})</span>
                    <button 
                       onClick={() => setShowAddFriend(!showAddFriend)}
                       className="p-1 px-2 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white rounded-lg text-[8px] font-black transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-2 h-2" />
                      Add Friend
                    </button>
                  </div>
                  
                  <AnimatePresence>
                    {showAddFriend && (
                      <motion.div 
                       initial={{ opacity: 0, height: 0 }}
                       animate={{ opacity: 1, height: 'auto' }}
                       exit={{ opacity: 0, height: 0 }}
                       className="overflow-hidden"
                      >
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex gap-2">
                          <input 
                           type="text" 
                           placeholder="ID بنوسە (cc-123)..."
                           value={friendIdInput}
                           onChange={(e) => setFriendIdInput(e.target.value)}
                           className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white outline-none focus:border-brand-primary"
                          />
                          <button 
                           onClick={addFriend}
                           disabled={isAddingFriend}
                           className="bg-brand-primary text-white p-2 rounded-lg disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        {addFriendError && <p className="text-[8px] text-red-500 mt-1 kurdish-text">{addFriendError}</p>}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex -space-x-2 overflow-hidden py-1">
                    {activeMembers.map((member) => (
                      <div 
                        key={member.uid} 
                        className="w-10 h-10 rounded-full border-2 border-zinc-950 bg-zinc-800 flex items-center justify-center text-xs font-black text-white group relative cursor-help"
                        title={`${member.name} (${member.uniqueCode})`}
                      >
                        {member.avatarUrl && member.avatarUrl.length > 0 ? (
                          <img src={member.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" />
                        ) : (
                          member.name.substring(0, 1).toUpperCase()
                        )}
                        <div className={`absolute -bottom-1 -right-1 w-3 h-3 ${
                           member.currentRoomId === room.id ? 'bg-blue-500' : (member.isOnline ? 'bg-green-500' : 'bg-zinc-600')
                         } border-2 border-zinc-950 rounded-full`} />
                         
                         {/* Status Tooltip */}
                         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-[8px] text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none border border-white/10 uppercase font-black tracking-widest shadow-2xl">
                           {member.name} - {member.currentRoomId === room.id ? 'In Room' : (member.isOnline ? 'Online' : 'Offline')}
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {/* Professional Guidance Banner */}
                <div className="bg-brand-primary/10 border border-brand-primary/20 p-4 rounded-2xl flex items-start gap-3 mb-6">
                  <Headphones className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-brand-primary font-black leading-relaxed kurdish-text">
                    تکایە سەماعە و مایک بەکار بێنە تا ژاوە ژاو و کوالێتی دەنگی فیلم تێک نەچێت
                  </p>
                </div>

                {isChatQuotaExceeded && (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 mb-4">
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                    <p className="text-[9px] text-red-500 font-bold kurdish-text">
                      نامەکان ئێستا کار ناکەن بەهۆی زۆری لۆد لەسەر سیستەم. تکایە دواتر هەوڵبدەرەوە.
                    </p>
                  </div>
                )}

                <div className="px-2 py-4 border-b border-white/5 mb-4">
                  <div className="flex items-center gap-3 text-brand-primary">
                    <ShieldAlert className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest kurdish-text">Host is Watching: {room.creatorId === socialProfile?.uid ? 'You' : 'Admin'}</span>
                  </div>
                </div>
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.senderId === socialProfile?.uid ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-gray-500 font-bold mb-1 px-2">{msg.senderName}</span>
                    <div className={`max-w-[85%] px-4 py-2 rounded-2xl kurdish-text text-sm ${
                      msg.senderId === socialProfile?.uid 
                        ? 'bg-brand-primary text-white' 
                        : 'bg-white/5 text-gray-200'
                    }`}>
                      {msg.type === 'voice' ? (
                        <audio controls src={msg.audio} className="h-8 max-w-full" />
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>

              <div className="p-4 border-t border-white/5 bg-zinc-900/50">
                {/* Horizontal Emojis Picker */}
                <div className="flex justify-between items-center px-1 mb-4">
                  {['❤️', '😂', '🔥', '👏', '😮', '🎬'].map(emoji => (
                    <button 
                      key={emoji}
                      onClick={() => sendReaction(emoji)}
                      className="text-xl hover:scale-125 active:scale-95 transition-all cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <form onSubmit={sendMessage} className="relative flex items-center gap-2">
                  <button 
                    type="button"
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    className={`p-4 rounded-2xl transition-all ${isRecording ? 'bg-red-600 animate-pulse text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={newMsg}
                      onChange={(e) => setNewMsg(e.target.value)}
                      placeholder="نامە بنێرە..."
                      className="w-full bg-zinc-900 border border-white/10 rounded-2xl pl-4 pr-12 py-4 text-white kurdish-text text-sm outline-none focus:border-brand-primary"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-3 text-brand-primary hover:scale-110 transition-all">
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
