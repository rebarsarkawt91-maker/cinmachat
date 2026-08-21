import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Users, Phone, X } from "lucide-react";

const DEFAULT_GROUP = "https://chat.whatsapp.com/DIwWkE5ZGuTYJrmODE0mI0";
const DEFAULT_DIRECT = "https://wa.me/9647701966649";

export const resolveWhatsAppUrl = (
  whatsappNumber?: string,
  whatsappGroupLink?: string,
): string => {
  const group = (whatsappGroupLink || "").trim();
  if (group) return group;
  const number = (whatsappNumber || "").replace(/[^0-9]/g, "");
  if (number) return `https://wa.me/${number}`;
  return DEFAULT_DIRECT;
};

interface WhatsAppFloatButtonProps {
  groupLink?: string;
  directNumberUrl?: string;
}

export const WhatsAppFloatButton: React.FC<WhatsAppFloatButtonProps> = ({
  groupLink,
  directNumberUrl,
}) => {
  const [phase, setPhase] = useState<"idle" | "tooltip" | "modal">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedGroup = groupLink?.trim() || DEFAULT_GROUP;
  const resolvedDirect = directNumberUrl?.trim() || DEFAULT_DIRECT;

  const openModal = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("modal");
  }, []);

  const handleClick = () => {
    if (phase === "modal") return;
    setPhase("tooltip");
    timerRef.current = setTimeout(() => openModal(), 1500);
  };

  const handleProceed = () => openModal();

  const handleOption = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setPhase("idle");
  };

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("idle");
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <>
      <motion.button
        onClick={handleClick}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        className="fixed bottom-6 left-6 z-50 w-11 h-11 bg-[#25D366] rounded-full flex items-center justify-center shadow-2xl shadow-[#25D366]/40 text-white cursor-pointer"
        aria-label="WhatsApp"
        title="WhatsApp"
      >
        <MessageCircle className="w-5 h-5" />
        <div className="absolute inset-0 bg-[#25D366] rounded-full animate-ping opacity-20 pointer-events-none" />
      </motion.button>

      <AnimatePresence>
        {phase === "tooltip" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 left-6 z-50 bg-white rounded-2xl px-5 py-4 shadow-2xl max-w-[220px] border border-white/10"
          >
            <p className="text-sm font-bold text-gray-800 kurdish-text leading-relaxed mb-3">
              ڕەخەنە و پێشنیارەکانت بنێرە
            </p>
            <button
              onClick={handleProceed}
              className="w-full bg-[#25D366] text-white text-xs font-bold py-2 rounded-xl hover:bg-[#1ebe5d] transition-colors cursor-pointer"
            >
              بەردەوامبوون
            </button>
            <div className="absolute -bottom-2 left-6 w-4 h-4 bg-white rotate-45 border-r border-b border-white/10" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "modal" && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={handleClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-20 left-6 z-50 bg-white rounded-3xl shadow-2xl p-5 w-[260px]"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-black text-gray-900 kurdish-text">
                  هەڵبژێرە
                </h3>
                <button
                  onClick={handleClose}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 kurdish-text mb-4 leading-relaxed">
                ڕەخەنە و پێشنیارەکانت بنێرە
              </p>
              <div className="space-y-2.5">
                <button
                  onClick={() => handleOption(resolvedGroup)}
                  className="w-full flex items-center gap-3 p-3 bg-green-50 hover:bg-green-100 rounded-2xl transition-colors text-left cursor-pointer"
                >
                  <div className="w-10 h-10 bg-[#25D366] rounded-xl flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 kurdish-text leading-tight">
                      گرووپی واتسئەپ
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">WhatsApp Group</p>
                  </div>
                </button>
                <button
                  onClick={() => handleOption(resolvedDirect)}
                  className="w-full flex items-center gap-3 p-3 bg-green-50 hover:bg-green-100 rounded-2xl transition-colors text-left cursor-pointer"
                >
                  <div className="w-10 h-10 bg-[#25D366] rounded-xl flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 kurdish-text leading-tight">
                      پەیوەندی ڕاستەوخۆ
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Direct Number</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
