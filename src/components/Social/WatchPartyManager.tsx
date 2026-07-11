import React, { useState, useEffect, useRef } from 'react';
import { 
  db, 
  auth,
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  getDocs,
  serverTimestamp,
  getDoc,
  limit,
  arrayUnion
} from '../../lib/firebase';
import { useSocialAuth } from '../../context/SocialAuthContext';
import { SyncGroup, SocialUser, Movie } from '../../types';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { 
  Users, 
  Plus, 
  Play, 
  MessageCircle, 
  UserPlus, 
  X, 
  Send, 
  Tv, 
  Activity,
  ChevronRight,
  ShieldAlert,
  QrCode,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsQR from 'jsqr';

interface WatchPartyManagerProps {
  onJoinRoom: (room: SyncGroup) => void;
}

export const WatchPartyManager: React.FC<WatchPartyManagerProps> = ({ onJoinRoom }) => {
  const { currentUser, socialProfile } = useSocialAuth();
  const [rooms, setRooms] = useState<SyncGroup[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [roomToJoinId, setRoomToJoinId] = useState('');
  const [inviteCodes, setInviteCodes] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(false);
  
  // Real-time Validation States
  const [validationStatus, setValidationStatus] = useState<"idle" | "valid-online" | "valid-offline" | "invalid">("idle");
  const [validatedUser, setValidatedUser] = useState<SocialUser | null>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!socialProfile || !currentUser || currentUser.uid === 'admin_local_bypass' || currentUser.uid !== socialProfile.uid) {
      return;
    }

    // Optimized: Use getDocs with a periodic refresh instead of onSnapshot to save quota
    const fetchRooms = async () => {
      try {
        const q = query(
          collection(db, 'syncGroups'),
          where('memberIds', 'array-contains', currentUser.uid),
          limit(20)
        );
        const snapshot = await getDocs(q);
        const roomsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SyncGroup));
        setRooms(roomsData);
      } catch (error) {
        if (error instanceof Error && error.message.includes("quota")) {
           console.warn("Firestore Quota exceeded while fetching rooms.");
        } else {
           handleFirestoreError(error, OperationType.GET, 'syncGroups');
        }
      }
    };

    fetchRooms();
    const interval = setInterval(fetchRooms, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, [socialProfile]);

  // Point 51: Real-time Live ID Validation (Optimized with Debounced getDocs to save quota)
  useEffect(() => {
    if (!roomToJoinId || roomToJoinId.length < 3) {
      setValidationStatus("idle");
      setValidatedUser(null);
      return;
    }

    const timer = setTimeout(async () => {
      const trimmedId = roomToJoinId.trim().toUpperCase();
      try {
        const q = query(collection(db, 'users'), where('uniqueCode', '==', trimmedId), limit(1));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data() as SocialUser;
          setValidatedUser(userData);
          setValidationStatus(userData.isOnline ? "valid-online" : "valid-offline");
        } else {
          setValidationStatus("invalid");
          setValidatedUser(null);
        }
      } catch (error) {
        setValidationStatus("invalid");
        handleFirestoreError(error, OperationType.GET, 'users');
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [roomToJoinId]);

  const handleCreateRoom = async () => {
    if (!socialProfile || !newRoomName) return;
    setIsLoading(true);

    try {
      // Find UIDs for invite codes
      const memberIds = [socialProfile.uid];
      for (const code of inviteCodes) {
        if (!code) continue;
        const q = query(collection(db, 'users'), where('uniqueCode', '==', code.trim().toUpperCase()), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          memberIds.push(snapshot.docs[0].id);
        }
      }

      const docRef = await addDoc(collection(db, 'syncGroups'), {
        name: newRoomName,
        creatorId: socialProfile.uid,
        memberIds,
        playback: {
          isPlaying: false,
          currentTime: 0,
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      });
      await updateDoc(docRef, { id: docRef.id });

      setShowCreateModal(false);
      setNewRoomName('');
      setInviteCodes(['']);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'syncGroups');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinById = async (forcedId?: string) => {
    const idToUse = forcedId || roomToJoinId;
    if (!socialProfile || !idToUse) return;
    setIsLoading(true);
    
    try {
      const trimmedId = idToUse.trim().toUpperCase();
      
      // Step 1: Find user by Unique Code
      const userQ = query(collection(db, 'users'), where('uniqueCode', '==', trimmedId), limit(1));
      const userSnap = await getDocs(userQ);
      
      if (userSnap.empty) {
        // Try direct Room ID if code not found
        try {
          const roomDocRef = doc(db, 'syncGroups', trimmedId);
          const roomSnap = await getDoc(roomDocRef);
          
          if (roomSnap.exists()) {
            const roomData = roomSnap.data() as SyncGroup;
            const roomId = roomSnap.id;
            const currentMembers = Array.isArray(roomData.memberIds) ? roomData.memberIds : [];
            if (!currentMembers.includes(socialProfile.uid)) {
              await updateDoc(roomDocRef, {
                memberIds: arrayUnion(socialProfile.uid)
              });
            }
            onJoinRoom({ id: roomId, ...roomData, memberIds: !currentMembers.includes(socialProfile.uid) ? [...currentMembers, socialProfile.uid] : currentMembers });
            setRoomToJoinId('');
            return;
          }
        } catch (e) {
          console.error("Direct room lookup failed:", e);
        }
        alert('ئەم کۆدە دروست نەبووە');
        return;
      }

      // Step 2: Join the user's personal room
      const targetUser = userSnap.docs[0].data() as SocialUser;
      const targetUserId = targetUser.uid;
      
      // Every user has a room with ID == UID (created at signup)
      const roomDocRef = doc(db, 'syncGroups', targetUserId);
      const roomSnap = await getDoc(roomDocRef);

      if (roomSnap.exists()) {
        const roomData = roomSnap.data() as SyncGroup;
        const currentMembers = Array.isArray(roomData.memberIds) ? roomData.memberIds : [];
        if (!currentMembers.includes(socialProfile.uid)) {
          await updateDoc(roomDocRef, {
            memberIds: arrayUnion(socialProfile.uid)
          });
        }
        onJoinRoom({ id: targetUserId, ...roomData, memberIds: !currentMembers.includes(socialProfile.uid) ? [...currentMembers, socialProfile.uid] : currentMembers });
        setRoomToJoinId('');
      } else {
        alert('ژووری ئەم بەکارهێنەرە چالاک نییە');
      }
    } catch (err) {
      console.error('Error joining room:', err);
      alert('هەڵەیەک ڕوویدا لە کاتی پەیوەندیکردندا');
    } finally {
      setIsLoading(false);
    }
  };

  // Point 52: QR Code Image Uploader
  const handleQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          // Extract ID from cinemachat://user/UID or raw code
          let extractedId = code.data;
          
          if (extractedId.startsWith('cinemachat://user/')) {
            const uid = extractedId.replace('cinemachat://user/', '');
            // We need to fetch the uniqueCode for this UID to fill the field or just join by UID
            handleJoinByUID(uid);
          } else {
            setRoomToJoinId(extractedId);
            handleJoinById(extractedId);
          }
        } else {
          alert('هیچ کۆدێک لەناو وێنەکەدا نەدۆزرایەوە');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleJoinByUID = async (uid: string) => {
    if (!socialProfile) return;
    setIsLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as SocialUser;
        setRoomToJoinId(userData.uniqueCode);
        handleJoinById(userData.uniqueCode);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const addInviteField = () => setInviteCodes([...inviteCodes, '']);

  const getBorderColor = () => {
    switch (validationStatus) {
      case "valid-online": return "border-green-500 shadow-[0_0_15px_-3px_rgba(34,197,94,0.4)]";
      case "valid-offline": return "border-orange-500 shadow-[0_0_15px_-3px_rgba(249,115,22,0.4)]";
      case "invalid": return "border-red-500 shadow-[0_0_15px_-3px_rgba(239,68,68,0.4)]";
      default: return "border-white/10";
    }
  };

  const getStatusText = () => {
    const code = (roomToJoinId || '').toUpperCase();
    switch (validationStatus) {
      case "valid-online": return `(${code}) بەردەستە - ئەم کۆدە لە ئێستادا ئۆنلاینە`;
      case "valid-offline": return `(${code}) ئەم کۆدە ئێستا ئۆفلاینە`;
      case "invalid": return `(${code}) ئەم کۆدە دروست نەبووە`;
      default: return "";
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-white kurdish-text">Watch with Friends</h2>
          <p className="text-gray-500 kurdish-text text-sm">سینەما چات لەگەڵ هاوڕێکانت</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="p-4 bg-brand-primary rounded-2xl text-white hover:bg-red-700 transition-all shadow-xl shadow-red-600/20"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Join by ID Card */}
        <div className="bg-zinc-900 border-2 border-white/5 rounded-[2.5rem] p-8 flex flex-col justify-between group transition-all relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl font-black text-white kurdish-text mb-2">چوونە ژوورەوەی ڕاستەوخۆ</h3>
            <p className="text-xs text-gray-500 kurdish-text mb-6">کۆدی کەسی یان سکانی QR بکە</p>
          </div>
          
          <div className="space-y-4 relative z-10">
            <div className="relative">
              <input 
                type="text" 
                placeholder="CC-XXXX"
                value={roomToJoinId}
                onChange={(e) => setRoomToJoinId(e.target.value)}
                className={`w-full bg-black/40 border-2 ${getBorderColor()} rounded-2xl px-6 py-4 text-white font-mono text-sm outline-none transition-all pr-24`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button 
                  onClick={() => qrInputRef.current?.click()}
                  className="p-3 bg-white/5 hover:bg-brand-primary hover:text-white text-gray-400 rounded-xl transition-all"
                  title="Upload QR"
                >
                  <QrCode className="w-5 h-5" />
                </button>
                <input 
                  type="file" 
                  ref={qrInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleQRUpload} 
                />
              </div>
            </div>

            <AnimatePresence>
              {validationStatus !== "idle" && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex items-center gap-2 text-[10px] font-bold kurdish-text px-2 ${
                    validationStatus === "valid-online" ? "text-green-500" :
                    validationStatus === "valid-offline" ? "text-orange-500" :
                    "text-red-500"
                  }`}
                >
                  {validationStatus === "valid-online" && <CheckCircle2 className="w-3 h-3" />}
                  {validationStatus === "valid-offline" && <Clock className="w-3 h-3" />}
                  {validationStatus === "invalid" && <AlertCircle className="w-3 h-3" />}
                  {getStatusText()}
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              onClick={() => handleJoinById()}
              disabled={isLoading || validationStatus === "invalid"}
              className="w-full py-4 bg-brand-primary text-white rounded-2xl font-black kurdish-text text-sm hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-red-600/10 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  چوونە ژوورەوە
                </>
              )}
            </button>
          </div>

          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2" />
        </div>

        <AnimatePresence>
          {rooms.map((room) => (
            <motion.div
              layout
              key={room.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => onJoinRoom(room)}
              className="group bg-zinc-900 border border-white/10 rounded-[2rem] p-6 hover:border-brand-primary/50 transition-all cursor-pointer relative overflow-hidden"
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-brand-primary/20 transition-colors">
                    <Play className="w-6 h-6 text-brand-primary" />
                  </div>
                  <div className="flex -space-x-3">
                    {((room && room.memberIds) || []).slice(0, 3).map((id, i) => (
                      <div key={id} className="w-8 h-8 rounded-full bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center text-[8px] font-black">
                        {(id || '').substring(0, 2).toUpperCase()}
                      </div>
                    ))}
                    {((room && room.memberIds) || []).length > 3 && (
                      <div className="w-8 h-8 rounded-full bg-brand-primary border-2 border-zinc-900 flex items-center justify-center text-[10px] font-black">
                        +{((room && room.memberIds) || []).length - 3}
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="text-xl font-black text-white kurdish-text mb-2 group-hover:text-brand-primary transition-colors">{room.name}</h3>
                
                <div className="flex items-center gap-4 text-xs font-black text-gray-500 uppercase tracking-widest">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {((room && room.memberIds) || []).length} Members
                  </div>
                  {room.playback.isPlaying && (
                    <div className="flex items-center gap-1 text-green-500 animate-pulse">
                      <Activity className="w-3 h-3" />
                      Watching
                    </div>
                  )}
                </div>
              </div>

              {/* Background Glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-brand-primary/10 transition-all" />
            </motion.div>
          ))}
        </AnimatePresence>

        {rooms.length === 0 && (
          <div className="col-span-full py-20 bg-white/5 border border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-zinc-900 rounded-[2.5rem] flex items-center justify-center mb-6">
              <Users className="w-10 h-10 text-gray-700" />
            </div>
            <h4 className="text-xl font-black text-white kurdish-text mb-2">هیچ گروپێک نییە</h4>
            <p className="text-gray-500 kurdish-text max-w-xs">ئێستا یەکەم گروپ دروست بکە و هاوڕێکانت بانگهێشت بکە بۆ بینینی فیلمەکان بە یەکەوە.</p>
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl"
            >
              <div className="p-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-brand-primary/20 rounded-2xl flex items-center justify-center">
                      <Tv className="w-7 h-7 text-brand-primary" />
                    </div>
                    <h2 className="text-2xl font-black text-white kurdish-text">دروستکردنی ڕووم</h2>
                  </div>
                  <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-white/5 rounded-full text-gray-500">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest px-2">ناوی گروپ</label>
                    <input
                      type="text"
                      placeholder="بۆ نموونە: شەوی فیلم و ئاکشن"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white kurdish-text outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="text-xs font-black text-gray-500 kurdish-text uppercase tracking-widest px-2 block">بانگهێشتکردنی هاوڕێکان (Unique Code)</label>
                    {inviteCodes.map((code, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="relative flex-1">
                          <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                          <input
                            type="text"
                            placeholder="CC-XXXX"
                            value={code}
                            onChange={(e) => {
                              const next = [...inviteCodes];
                              next[index] = e.target.value.toUpperCase();
                              setInviteCodes(next);
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-white font-mono outline-none focus:border-brand-primary"
                          />
                        </div>
                        {index === inviteCodes.length - 1 && (
                          <button 
                            onClick={addInviteField}
                            className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white"
                          >
                            <Plus className="w-6 h-6" />
                          </button>
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-600 kurdish-text px-2">هاوڕێکانت دەتوانن کۆدی کەسی خۆیان لە پرۆفایلەکەیان ببینن (وەک: CC-8291).</p>
                  </div>
                </div>

                <button
                  onClick={handleCreateRoom}
                  disabled={isLoading || !newRoomName}
                  className="w-full py-6 bg-brand-primary hover:bg-red-700 text-white rounded-[1.5rem] font-black kurdish-text text-xl transition-all shadow-xl shadow-red-600/20 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isLoading ? 'خەریکی دروستکردنە...' : 'ئێستا ڕوومەکە دروست بکە'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
