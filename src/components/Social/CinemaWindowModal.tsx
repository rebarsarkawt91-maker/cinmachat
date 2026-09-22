import React from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import CinemaWindowSubRooms from "./CinemaWindowSubRooms";

interface CinemaWindowRoom {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface CinemaWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Kept for compatibility with existing callers. Sub-room videos now play
  // inline, so this callback is no longer part of an unlock/payment flow.
  onJoinCinemaWindow: (room: CinemaWindowRoom) => void;
  currentUser?: any;
}

/**
 * Public/admin movie sub-room hub. There is deliberately no ticket, payment,
 * or access-code branch: visitors watch active rooms, and authenticated admins
 * receive management controls whose permissions are enforced by the API.
 */
export const CinemaWindowModal: React.FC<CinemaWindowModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  if (!isOpen) return null;

  const adminRole = String(currentUser?.role || "").toLowerCase();
  const canAdministerRooms = Boolean(
    currentUser?.username &&
      (["admin", "owner", "super_admin", "deputy_manager", "staff", "cinema_room_admin"].includes(adminRole) ||
        currentUser?.isOwner === true ||
        currentUser?.isSuper === true),
  );

  return (
    <AnimatePresence>
      <div id="cinema-window-container" className="fixed inset-0 z-[900] overflow-y-auto bg-black/95 p-4 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          className="relative mx-auto my-4 min-h-[70vh] w-full max-w-7xl rounded-[2rem] border border-amber-500/15 bg-[#090a0d] p-5 shadow-2xl md:p-8"
          dir="rtl"
        >
          <button type="button" onClick={onClose} aria-label="داخستن" className="absolute left-5 top-5 z-20 rounded-full bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>

          <header className="mb-8 border-b border-white/10 pb-5 pl-12">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Cinema Window</p>
            <h1 className="mt-2 text-2xl font-black text-white kurdish-text">ژوورە فیلمییەکان</h1>
          </header>

          <CinemaWindowSubRooms currentUser={currentUser} canAdminister={canAdministerRooms} />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
