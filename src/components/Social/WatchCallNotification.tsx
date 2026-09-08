import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Film, UserCheck, X, Loader2 } from "lucide-react";
import { useSocialAuth } from "../../context/SocialAuthContext";
import {
  describeWatchCallError,
  respondToWatchCall,
  subscribeWatchCalls,
  WATCH_CALL_TTL_MS,
  isAnswerableWatchCallStatus,
  type WatchCall,
} from "../../services/friendConnect";
import {
  ensureCallSignaling,
  onCallEvent,
  type WatchCallWire,
} from "../../services/callSignaling";

// ─────────────────────────────────────────────────────────────────────────────
// WatchCallNotification — the GLOBAL "call invitation" ring for CinemaChat.
//
// Delivery paths (in order of speed):
//   1. /ws/call-signaling push  — INSTANT (server-authoritative, no Firestore)
//   2. 20s REST safety-net poll — store-backed, works with Firestore quota-dead
//   3. Firestore onSnapshot     — legacy mirror path (best-effort only)
// All three merge into ONE ring list deduped by call id, so a transition can
// arrive on any path exactly once on screen.
// ─────────────────────────────────────────────────────────────────────────────

const wireToCall = (wire: WatchCallWire): WatchCall =>
  ({
    ...(wire as any),
    id: wire.callId || (wire as any).id,
  }) as WatchCall;

const WatchCallNotification: React.FC<{
  /** Called after a successful Accept (server-confirmed) so the app opens the
   *  FriendConnectRoom on the EXACT accepted call/connection/room identity. */
  onOpenRoom?: (call: WatchCall) => void;
}> = ({ onOpenRoom }) => {
  const { currentUser, socialProfile } = useSocialAuth();
  const [rings, setRings] = useState<WatchCall[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const onOpenRoomRef = useRef(onOpenRoom);
  onOpenRoomRef.current = onOpenRoom;

  const uid = String(currentUser?.uid || "");
  const ready = !!uid && uid !== "admin_local_bypass";

  /** One merge point for every delivery path. Deduped by id; only answerable
   *  calls within the TTL are shown — expired ones can never resurface. */
  const mergeCalls = (incoming: WatchCall[]) => {
    setRings((prev) => {
      const now = Date.now();
      const byId = new Map(prev.map((call) => [call.id, call]));
      for (const call of incoming) {
        if (!isAnswerableWatchCallStatus(call.status)) {
          byId.delete(call.id); // any transition removes the ring everywhere
          continue;
        }
        const age = now - new Date(call.startedAt || call.createdAt || "").getTime();
        if (age >= WATCH_CALL_TTL_MS) {
          byId.delete(call.id);
          continue;
        }
        byId.set(call.id, call);
      }
      return [...byId.values()];
    });
  };

  const replaceCalls = (incoming: WatchCall[]) => {
    const now = Date.now();
    setRings(
      incoming.filter((call) =>
        isAnswerableWatchCallStatus(call.status) &&
        now - new Date(call.startedAt || call.createdAt || "").getTime() < WATCH_CALL_TTL_MS,
      ),
    );
  };

  // Path 1: instant server push.
  useEffect(() => {
    if (!ready) return;
    void ensureCallSignaling(uid);
    return onCallEvent((event) => {
      if (event.type === "watch_call:ringing") {
        mergeCalls([wireToCall(event.call)]);
      } else if (event.type === "watch_call:state_sync") {
        replaceCalls((event.incoming || []).map(wireToCall));
      } else if (
        event.type === "watch_call:accepted" ||
        event.type === "watch_call:declined" ||
        event.type === "watch_call:cancelled" ||
        event.type === "watch_call:expired" ||
        event.type === "watch_call:ended"
      ) {
        // Any non-ringing transition removes the ring immediately — including
        // a call accepted on ANOTHER device of this account.
        mergeCalls([wireToCall(event.call)]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid]);

  // Paths 2+3: bounded safety-net (REST poll 20s + Firestore snapshots).
  useEffect(() => {
    if (!ready) return;
    return subscribeWatchCalls(
      { uid, phone: (socialProfile as any)?.phoneNumber || socialProfile?.phone || "" },
      (calls) => mergeCalls(calls),
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid]);

  // Safety net: rings still on screen that outlive the TTL are dismissed.
  useEffect(() => {
    const iv = window.setInterval(() => {
      setRings((prev) =>
        prev.filter(
          (c) =>
            Date.now() - new Date(c.startedAt || c.createdAt || "").getTime() <
            WATCH_CALL_TTL_MS,
        ),
      );
    }, 20_000);
    return () => window.clearInterval(iv);
  }, []);

  const handleAccept = async (call: WatchCall) => {
    if (!call || busyId) return;
    setBusyId(call.id);
    setActionError(null);
    try {
      const acceptedCall = { ...call, connectionId: call.connectionId || call.id };
      // SERVER-CONFIRMED accept: the response carries the canonical
      // call/connection/roomId from the store. The room opens ONLY after this
      // succeeds — never on an unconfirmed local guess.
      const confirmed = await respondToWatchCall(
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
      const roomCall: WatchCall = confirmed?.call
        ? { ...acceptedCall, ...confirmed.call, connectionId: confirmed.connectionId }
        : acceptedCall;
      setRings((prev) => prev.filter((c) => c.id !== call.id));
      onOpenRoomRef.current?.(roomCall);
      window.dispatchEvent(
        new CustomEvent("cinemachat:watch-call-accepted", { detail: roomCall }),
      );
    } catch (err) {
      setActionError(describeWatchCallError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (call: WatchCall) => {
    if (!call || busyId) return;
    setBusyId(call.id);
    setActionError(null);
    try {
      await respondToWatchCall(call.id, call.connectionId || call.id, "declined");
      setRings((prev) => prev.filter((c) => c.id !== call.id));
    } catch (err) {
      setActionError(describeWatchCallError(err));
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) return null;

  return createPortal(
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
    </div>,
    document.body,
  );
};

export default WatchCallNotification;
