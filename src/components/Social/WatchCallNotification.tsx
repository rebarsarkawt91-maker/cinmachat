import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Film, UserCheck, X, Loader2 } from "lucide-react";
import { useSocialAuth } from "../../context/SocialAuthContext";
import {
  WatchCall,
  expireWatchCallIfStale,
  respondToWatchCall,
  subscribeWatchCalls,
  WATCH_CALL_TTL_MS,
} from "../../services/friendConnect";

// ─────────────────────────────────────────────────────────────────────────────
// WatchCallNotification — the GLOBAL "call invitation" ring for CinemaChat.
//
// Mounted at the app root (like FriendPresenceNotification / the invite toasts)
// so a "Call Invitation" pressed on a found friend's card rings the RECEIVER
// anywhere in the app — even with FriendConnectRoom closed. The signal lives in
// the `invitations` collection (kind: "watchcall"), which already ships
// permissive rules, so no firestore.rules change is needed.
//
// Dedupe: Repeating snapshots (e.g. heartbeat-style writes) must not re-ring.
// Each invitation id is rung once; when a ring resolves (accepted / declined /
// ended) its guard is cleared so a FUTURE re-call rings again. Rings older than
// WATCH_CALL_TTL_MS (caller offline/closed) are dropped client-side and the doc
// is passively expired.
// ─────────────────────────────────────────────────────────────────────────────

const WatchCallNotification: React.FC<{
  /** Called after a successful Accept so the app opens the FriendConnectRoom
   *  (the private 1-to-1 chat the call was placed through). The accepted call
   *  is passed up so the room can join THAT connection deterministically —
   *  never a guessed "latest accepted" pair. */
  onOpenRoom?: (call: WatchCall) => void;
}> = ({ onOpenRoom }) => {
  const { currentUser, socialProfile } = useSocialAuth();
  const [rings, setRings] = useState<WatchCall[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // One ring per invitation id — reset once the ring resolves (so re-calls ring
  // again from a fresh start).
  const shownRef = useRef<Set<string>>(new Set());

  const uid = String(currentUser?.uid || "");
  // Only real accounts have a stable Firebase UID to receive call invitations
  // (guests and the local-admin shell never qualify).
  const ready = uid.length >= 20 && uid !== "admin_local_bypass" && !!socialProfile;
  // Normalized phone from the signed-in profile — matched (via canonical key)
  // against the sender's typed/search phone, so address + identity always agree.
  const myPhone =
    (socialProfile as any)?.phoneNumber || socialProfile?.phone || "";

  useEffect(() => {
    if (!ready) return;
    return subscribeWatchCalls(
      { uid, phone: myPhone },
      (calls) => {
        const now = Date.now();
        const live = calls.filter((call) => {
          const age = now - new Date(call.startedAt).getTime();
          if (age >= WATCH_CALL_TTL_MS) {
            // Caller disconnected / abandoned the ring — expire it quietly.
            void expireWatchCallIfStale(call).catch(() => {});
            return false;
          }
          return true;
        });
        const ids = new Set(live.map((c) => c.id));
        setRings((prev) => {
          // Rings that disappeared resolved — forget their guard so a re-call
          // (a brand-new doc) can ring again.
          const resolved = prev.filter((c) => !ids.has(c.id));
          resolved.forEach((c) => shownRef.current.delete(c.id));
          const kept = prev.filter((c) => ids.has(c.id));
          const fresh = live.filter((c) => !shownRef.current.has(c.id));
          fresh.forEach((c) => shownRef.current.add(c.id));
          return [...kept, ...fresh];
        });
      },
      () => {},
    );
  }, [ready, uid, myPhone]);

  // Safety net: rings still on screen that outlive the TTL are dismissed.
  useEffect(() => {
    const iv = window.setInterval(() => {
      setRings((prev) =>
        prev.filter((c) => Date.now() - new Date(c.startedAt).getTime() < WATCH_CALL_TTL_MS),
      );
    }, 20_000);
    return () => window.clearInterval(iv);
  }, []);

  const handleAccept = async (call: WatchCall) => {
    if (!call || busyId) return;
    setBusyId(call.id);
    setActionError(null);
    try {
      const acceptedCall = {
        ...call,
        connectionId: call.connectionId || call.id,
      };
      await respondToWatchCall(
        acceptedCall.id,
        acceptedCall.connectionId,
        "accepted",
        {
          uid,
          name: socialProfile?.name || "",
          code: socialProfile?.uniqueCode || "",
          avatar:
            (socialProfile as any)?.avatarUrl || socialProfile?.avatar || null,
        },
      );
      // The underlying friend connection is now accepted — open the exact
      // shared private room immediately using the deterministic connection id.
      onOpenRoom?.(acceptedCall);
      window.dispatchEvent(
        new CustomEvent("cinemachat:watch-call-accepted", {
          detail: acceptedCall,
        }),
      );
    } catch {
      setActionError("پەسەندکردنی بانگهێشتی پەیوەندی سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (call: WatchCall) => {
    if (!call || busyId) return;
    setBusyId(call.id);
    setActionError(null);
    try {
      await respondToWatchCall(call.id, call.connectionId, "declined");
    } catch {
      setActionError("ڕەتکردنەوەی بانگهێشتی پەیوەندی سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) return null;

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-[1100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {rings.map((call) => (
          <motion.div
            key={call.id}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            role="alert"
            className="pointer-events-auto"
          >
            <div className="rounded-[1.5rem] bg-zinc-950/95 border border-amber-500/40 shadow-2xl shadow-black/60 backdrop-blur-2xl overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <div className="relative w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
                  <span className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
                  <BellRing className="w-5 h-5 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-white kurdish-text">
                      بانگهێشتی پەیوەندی
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[8px] font-black tracking-widest uppercase">
                      Call Invitation
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 kurdish-text mt-1 leading-relaxed">
                    {call.fromName} دەوێت بەیەکەوە لەگەڵت فیلمێک ببینێت
                  </p>
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-gray-500 font-mono">
                    <Film className="w-3 h-3" />
                    {call.fromName} · {call.fromCode}
                  </span>
                  {actionError && (
                    <p className="text-[10px] font-bold text-red-400 kurdish-text mt-1">
                      {actionError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => void handleAccept(call)}
                      disabled={busyId !== null}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-xs font-black kurdish-text flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {busyId === call.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                      وەرگرتن • {call.fromName}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReject(call)}
                      disabled={busyId !== null}
                      className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 text-xs font-black kurdish-text flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      ڕەتکردنەوە
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default WatchCallNotification;