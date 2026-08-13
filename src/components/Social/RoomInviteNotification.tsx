import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Clapperboard, UserPlus, X, Loader2, Mail } from "lucide-react";
import {
  CinemaChatParticipant,
  CinemaChatInvitation,
  subscribeCinemaChatInvitations,
  markCinemaChatInvitationRead,
  respondToCinemaChatInvitation,
  joinCinemaChatSession,
} from "../../services/cinemaChat";

// ─────────────────────────────────────────────────────────────────────────────
// RoomInviteNotification — the GLOBAL "account invitation" toast for CinemaChat.
//
// The host actively invites the recipient by their CinemaChat account code
// (CC-ID) or phone; the invitation document is persisted in the `invitations`
// collection (kind: "cinemachat"). This always-mounted component listens for
// pending invitations addressed to the signed-in account uid, so the card can
// appear above any page even when the room is closed, and survives refresh
// (readAt + status are persisted in Firestore).
//
// Accepting runs joinCinemaChatSession, which replicates the EXACT persisted
// join write of the in-room code/QR flow (guest + guestApproved + PAIRING), so
// there is still exactly ONE pairing system and firestore.rules stays
// untouched. Rejecting only closes the invitation document — it never touches
// the room doc, so the host's active session is never corrupted.
//
// Mounting: only render this for ACCOUNT identities (identity.id is a real
// uid, not a device id); a device-only guest has no stable public identifier
// to receive invitations.
// ─────────────────────────────────────────────────────────────────────────────

const INVITE_ERRORS: Record<string, string> = {
  joined: "",
  already: "",
  full: "ژوورەکە پڕە — کەسێکی دیکە لەگەڵ هۆستەکەتە",
  invalid: "داواکارییەکە چیتر چالاک نییە — سەرلەنوێ هەوڵبەرەوە",
  error: "هەڵەی ڕاژە — دووبارە هەوڵبەرەوە",
};

export const RoomInviteNotification: React.FC<{
  identity: CinemaChatParticipant;
  /** Called after a successful Accept so the app opens the CinemaChat room. */
  onOpenRoom?: () => void;
}> = ({ identity, onOpenRoom }) => {
  const [invites, setInvites] = useState<CinemaChatInvitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Prevents re-marking read / re-flashing the same invite on every snapshot.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = subscribeCinemaChatInvitations(identity.id, (list) =>
      setInvites(list),
    );
    return unsub;
  }, [identity.id]);

  const active = invites[0] ?? null;

  // Persist read state the first time this invite is surfaced (once per
  // mount AND per invite id — not every snapshot).
  useEffect(() => {
    if (!active || seenRef.current.has(active.id!)) return;
    seenRef.current.add(active.id!);
    markCinemaChatInvitationRead(active.id!);
  }, [active?.id]);

  const handleAccept = async () => {
    if (!active || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await joinCinemaChatSession(identity, active);
      if (result === "joined" || result === "already") {
        await respondToCinemaChatInvitation(active.id!, "accepted");
        onOpenRoom?.();
      } else {
        setActionError(INVITE_ERRORS[result] ?? INVITE_ERRORS.error);
      }
    } catch {
      setActionError(INVITE_ERRORS.error);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!active || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await respondToCinemaChatInvitation(active.id!, "declined");
    } catch {
      setActionError("ڕەتکردنەوە سەرکەوتوو نەبوو — دووبارە هەوڵبەرەوە");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active.id}
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
            title="بانگهێشتی نوێ"
          >
            <Bell className="w-3.5 h-3.5" />
            {invites.length}
          </button>
          <div className="rounded-[1.5rem] bg-zinc-950/95 border border-brand-primary/30 shadow-2xl shadow-black/60 backdrop-blur-2xl overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <div className="w-10 h-10 rounded-2xl bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-brand-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-black text-white kurdish-text">
                    بانگهێشت بۆ سەیرکردن
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-brand-primary/15 border border-brand-primary/30 text-brand-primary text-[8px] font-black tracking-widest uppercase">
                    Invitation
                  </span>
                </div>
                <p className="text-xs text-gray-300 kurdish-text mt-1 leading-relaxed">
                  {active.fromName} بانگهێشتت دەکات بۆ «{active.roomName}
                  »{active.movieTitle ? ` بۆ سەیرکردنی «${active.movieTitle}»` : ""}
                </p>
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-gray-500 font-mono">
                  <Clapperboard className="w-3 h-3" />
                  {active.fromName} · {active.fromCode}
                </span>
                {active.movieTitle && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-gray-500 font-mono">
                    #{active.joinCode}
                  </span>
                )}
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
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span className="sr-only">Accept invitation from </span>
                    <span className="uppercase">ACCEPT {active.fromName}</span>
                    <span className="hidden">
                    بەشداری بکە
                    </span>
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
                {invites.length > 1 && (
                  <p className="text-[10px] text-gray-500 kurdish-text mt-2">
                    +{invites.length - 1} بانگهێشتی تر چاوەڕوانن
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
