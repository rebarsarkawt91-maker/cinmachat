import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Film, UserCheck, X, Loader2, Clapperboard } from "lucide-react";
import {
  CinemaChatParticipant,
  CinemaChatRoomState,
  SESSION_STATES,
  normalizeCinemaChatState,
  subscribeCinemaChatState,
  acceptCinemaChatPairingRequest,
  declineCinemaChatPairingRequest,
  touchCinemaChatPresence,
  PRESENCE_HEARTBEAT_MS,
} from "../../services/cinemaChat";

// ─────────────────────────────────────────────────────────────────────────────
// CinemaChatInviteNotification — the GLOBAL "watch together" invitation toast.
//
// Mounted at the app root (NOT inside CinemaChatRoom) so it floats above the
// whole UI, even when the host is browsing the movie list, home page, or any
// other section without the room open. The room document
// (cinemaChatRoom/main_broadcast_room) is the single source of truth: the card
// only appears on the device of the ACTUAL host of the matched join-code
// session once a guest is seated and the host has not approved yet.
//
// Accept/Reject call the EXACT same service helpers as the in-room approval
// card (acceptCinemaChatPairingRequest / declineCinemaChatPairingRequest), so
// there is NO second pairing system and firestore.rules stays untouched.
//
// Dedupe: presence heartbeats rewrite the room doc every ~10s while a request
// is open, so without a guard the toast would flash on every snapshot. A stable
// request key (sessionId + guest id) ensures the SAME request is only ever shown
// once — a new/retried guest (new id) naturally produces a new key, and the key
// resets whenever the request resolves, so the next guest's request is shown.
// ─────────────────────────────────────────────────────────────────────────────

export const CinemaChatInviteNotification: React.FC<{
  identity: CinemaChatParticipant;
  /** Whether the CinemaChat room modal is currently open. While it is open the
   *  room itself runs the host presence heartbeat; this component only
   *  heartbeats the host while the room is CLOSED, so the session stays alive
   *  (and the toast can still appear) while the host browses the app. */
  roomOpen?: boolean;
  /** Called after a successful Accept so the Watch Together flow continues —
   *  the app opens the CinemaChat room modal. Optional; defaults to no-op. */
  onOpenRoom?: () => void;
}> = ({ identity, roomOpen = false, onOpenRoom }) => {
  const [state, setState] = useState<CinemaChatRoomState>(() =>
    normalizeCinemaChatState(null),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Guards against re-showing the SAME request on repeated Firestore snapshots
  // (presence heartbeats) while the request is still open.
  const shownKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = subscribeCinemaChatState(setState);
    return unsub;
  }, []);

  const meIsHost = !!state.host && state.host.id === identity.id;

  // The room component only heartbeats the host while its modal is open. This
  // always-mounted notification takes over while the room is closed so a host
  // who owns an active session but is browsing elsewhere stays "present" — the
  // session is not marked DISCONNECTED and a guest joining later still wakes
  // the toast. The heartbeat is gated to the HOST only (the guest heartbeats
  // from the room they have open), and it stops as soon as the session is gone.
  useEffect(() => {
    if (roomOpen || !meIsHost) return;
    const hasActiveSession =
      !!state.sessionId &&
      state.sessionState !== SESSION_STATES.EMPTY &&
      state.sessionState !== SESSION_STATES.ENDED;
    if (!hasActiveSession) return;
    touchCinemaChatPresence("hostLastSeen", identity.id).catch(() => {});
    const iv = window.setInterval(() => {
      touchCinemaChatPresence("hostLastSeen", identity.id).catch(() => {});
    }, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(iv);
  }, [roomOpen, meIsHost, state.sessionId, state.sessionState, identity.id]);

  // The invitation is pending while a guest is seated and the host hasn't
  // approved yet (guest approval is already persisted at join time). Mirrors the
  // room's showPairingCard condition; WAITING_FOR_APPROVAL is included with or
  // without a movie proposal so the title/poster can be shown when available.
  const requestPending =
    meIsHost &&
    !!state.guest &&
    !state.hostApproved &&
    (state.sessionState === SESSION_STATES.PAIRING ||
      state.sessionState === SESSION_STATES.WAITING_FOR_APPROVAL);

  const requestKey =
    requestPending && state.guest
      ? `${state.sessionId}:${state.guest.id}`
      : null;

  useEffect(() => {
    if (requestKey) {
      if (shownKeyRef.current !== requestKey) {
        shownKeyRef.current = requestKey;
        setPendingKey(requestKey);
      }
    } else {
      // Request resolved (accepted / rejected / guest left) — reset the guard
      // so the NEXT guest's request can be shown again.
      shownKeyRef.current = null;
      setPendingKey(null);
      setActionError(null);
    }
  }, [requestKey]);

  const requester =
    requestPending && pendingKey === requestKey ? state.guest : null;

  const proposedMovie = requester ? state.movieProposal?.movieData ?? null : null;

  const handleAccept = async () => {
    if (!requestPending || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await acceptCinemaChatPairingRequest(state, identity.id);
      // Request is now approved — open the room so the Watch Together flow
      // continues (movie proposal / playback) exactly as the in-room flow.
      onOpenRoom?.();
    } catch {
      setActionError("پەسەندکردن سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!requestPending || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await declineCinemaChatPairingRequest(state, identity.id);
    } catch {
      setActionError("ڕەتکردنەوە سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {requester && (
        <motion.div
          key={pendingKey}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          role="alert"
          className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-[1100] pointer-events-auto"
        >
          <button
            type="button"
            onClick={() => onOpenRoom?.()}
            className="absolute -top-2 -left-2 z-10 min-w-8 h-8 px-2 rounded-full bg-brand-primary text-white text-xs font-black flex items-center justify-center gap-1 shadow-lg shadow-red-600/30 animate-pulse"
            title="Watch together invitation"
          >
            <Bell className="w-3.5 h-3.5" />
            1
          </button>
          <div className="rounded-[1.5rem] bg-zinc-950/95 border border-brand-primary/30 shadow-2xl shadow-black/60 backdrop-blur-2xl overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              {proposedMovie?.image ? (
                <img
                  src={proposedMovie.image}
                  alt=""
                  className="w-11 h-14 rounded-xl object-cover border border-white/10 flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-2xl bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                  <Film className="w-5 h-5 text-brand-primary" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-black text-white kurdish-text">
                    سەیرکردن پێکەوە
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[8px] font-black tracking-widest uppercase">
                    Watch Together
                  </span>
                </div>
                {proposedMovie ? (
                  <p className="text-xs text-gray-300 kurdish-text mt-1 leading-relaxed">
                    {requester.name} دەوێت «{proposedMovie.title}» لەگەڵت ببینێت
                  </p>
                ) : (
                  <p className="text-xs text-gray-300 kurdish-text mt-1 leading-relaxed">
                    {requester.name} دەوێت لەگەڵت فیلمێک ببینێت
                  </p>
                )}
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-gray-500 font-mono">
                  <Clapperboard className="w-3 h-3" />
                  {requester.name} · {requester.code}
                </span>
                {actionError && (
                  <p className="text-[10px] font-bold text-red-400 kurdish-text mt-1">
                    {actionError}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={busy}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-xs font-black kurdish-text flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    وەرگرە • {requester.name}
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={busy}
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
      )}
    </AnimatePresence>
  );
};
