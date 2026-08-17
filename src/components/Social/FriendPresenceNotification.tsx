import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Wifi, WifiOff, X } from "lucide-react";
import { useSocialAuth } from "../../context/SocialAuthContext";
import { db, doc, onSnapshot } from "../../lib/firebase";
import {
  FriendConnection,
  subscribeConnectionsForUser,
} from "../../services/friendConnect";

/**
 * Global friend-presence notifications (Chat Rooms Part 3).
 *
 * Mounted once in App.tsx (outside every room) for signed-in account users.
 * It subscribes to the user's ACCEPTED friend connections and watches each
 * peer's Firestore `users/{peerUid}` doc, showing a toast whenever a friend
 * comes online or goes offline. The presence source of truth is the same
 * `isOnline` field the server flips on login/logout, so toasts reflect real
 * sessions. The initial snapshot of each peer is used as the baseline and never
 * triggers a toast — only subsequent transitions do.
 */
interface ToastItem {
  id: string;
  peerName: string;
  peerAvatar?: string | null;
  online: boolean;
}

const TOAST_MS = 5000;

const peerDisplayName = (
  connection: FriendConnection,
  uid: string,
): { name: string; avatar?: string | null } => {
  if (connection.requesterUid === uid) {
    return { name: connection.targetName || connection.targetCode || "بەکارهێنەر", avatar: connection.targetAvatar };
  }
  return { name: connection.requesterName || connection.requesterCode || "بەکارهێنەر", avatar: connection.requesterAvatar };
};

const FriendPresenceNotification: React.FC = () => {
  const { currentUser, socialProfile } = useSocialAuth();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const presenceRef = useRef<Record<string, boolean | null>>({});
  const unsubsRef = useRef<Record<string, () => void>>({});
  const lastUidRef = useRef<string>("");
  const uid = String(currentUser?.uid || "");

  // Only real accounts have a stable Firebase UID to receive friend
  // notifications; guests and the local-admin shell never qualify.
  const ready = uid.length >= 20 && uid !== "admin_local_bypass" && !!socialProfile;

  const pushToast = (
    peerUid: string,
    peerName: string,
    peerAvatar: string | null | undefined,
    online: boolean,
  ) => {
    const id = `${peerUid}_${Date.now()}`;
    setToasts((prev) => [...prev.slice(-3), { id, peerName, peerAvatar, online }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_MS);
  };

  useEffect(() => {
    // Tear down peer listeners + presence state whenever the account changes.
    if (lastUidRef.current !== uid) {
      Object.values(unsubsRef.current).forEach((unsub) => unsub());
      unsubsRef.current = {};
      presenceRef.current = {};
      lastUidRef.current = uid;
    }

    if (!ready) return;

    return subscribeConnectionsForUser(
      uid,
      (connections) => {
        const accepted = connections.filter((c) => c.status === "accepted");
        const activePeers = new Set<string>();

        for (const connection of accepted) {
          const peerUid = connection.requesterUid === uid ? connection.targetUid : connection.requesterUid;
          if (!peerUid || activePeers.has(peerUid)) continue;
          activePeers.add(peerUid);
          if (unsubsRef.current[peerUid]) continue;

          const { name, avatar } = peerDisplayName(connection, uid);
          const unsub = onSnapshot(
            doc(db, "users", peerUid),
            (snap) => {
              const data = snap.data();
              const isOnline = !!data?.isOnline;
              const prev = presenceRef.current[peerUid];
              // The first snapshot is the baseline — only real transitions toast.
              if (prev !== undefined && prev !== isOnline) {
                pushToast(peerUid, name, avatar, isOnline);
              }
              presenceRef.current[peerUid] = isOnline;
            },
            () => {
              /* peer doc missing/denied — ignore */
            },
          );
          unsubsRef.current[peerUid] = unsub;
        }

        // Drop listeners for peers that are no longer accepted friends.
        for (const peerUid of Object.keys(unsubsRef.current)) {
          if (!activePeers.has(peerUid)) {
            unsubsRef.current[peerUid]?.();
            delete unsubsRef.current[peerUid];
            delete presenceRef.current[peerUid];
          }
        }
      },
      () => {},
    );
  }, [ready, uid]);

  // Full cleanup on unmount.
  useEffect(
    () => () => {
      Object.values(unsubsRef.current).forEach((unsub) => unsub());
      unsubsRef.current = {};
    },
    [],
  );

  if (!ready) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[999] flex flex-col gap-2" dir="rtl">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            className="flex w-[min(92vw,340px)] items-center gap-3 rounded-2xl border border-white/10 bg-[#0f1013]/95 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur"
          >
            {t.peerAvatar ? (
              <img
                src={t.peerAvatar}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-sm font-black text-white">
                {(t.peerName || "؟").substring(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-white kurdish-text">
                {t.peerName}
              </p>
              <p
                className={`text-[10px] font-bold kurdish-text ${
                  t.online ? "text-emerald-400" : "text-gray-400"
                }`}
              >
                {t.online ? "لەسەر هێڵە ئێستا" : "لە هێڵ چووە دەرەوە"}
              </p>
            </div>
            {t.online ? (
              <Wifi className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 shrink-0 text-gray-500" />
            )}
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="داخستن"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default FriendPresenceNotification;
