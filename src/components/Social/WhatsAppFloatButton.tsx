import React from "react";
import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";

// Resolves the permanent WhatsApp contact target for the floating button.
// Priority: explicit group link > wa.me number link > hardcoded fallback so the
// button is never missing even when env vars are unavailable in a production build.
export const resolveWhatsAppUrl = (
  whatsappNumber?: string,
  whatsappGroupLink?: string,
): string => {
  const group = (whatsappGroupLink || "").trim();
  if (group) return group;
  const number = (whatsappNumber || "").replace(/[^0-9]/g, "");
  if (number) return `https://wa.me/${number}`;
  return "https://wa.me/9647701966649";
};

const DEFAULT_WHATSAPP_URL = "https://wa.me/9647701966649";

interface WhatsAppFloatButtonProps {
  href?: string;
}

// Global floating WhatsApp button rendered once in the root layout (App.tsx).
// Fixed bottom-left so it stays permanently visible on every view of the site,
// never gated behind build-time env vars (a guaranteed fallback URL is used).
export const WhatsAppFloatButton: React.FC<WhatsAppFloatButtonProps> = ({
  href,
}) => {
  const target =
    href && href.trim() ? href.trim() : DEFAULT_WHATSAPP_URL;
  return (
    <motion.a
      href={target}
      target="_blank"
      rel="noreferrer"
      aria-label="WhatsApp"
      title="WhatsApp"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-2xl shadow-[#25D366]/40 text-white cursor-pointer"
    >
      <MessageCircle className="w-7 h-7" />
      <div className="absolute inset-0 bg-[#25D366] rounded-full animate-ping opacity-20 pointer-events-none"></div>
    </motion.a>
  );
};
