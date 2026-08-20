import React from "react";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";

type VideoLoadOverlayStatus = "loading" | "buffering" | "error";

interface VideoLoadOverlayProps {
  status: VideoLoadOverlayStatus;
  message?: string;
  onRetry?: () => void;
}

const DEFAULT_MESSAGES: Record<VideoLoadOverlayStatus, string> = {
  loading: "Preparing video...",
  buffering: "Network is slow. Buffering video...",
  error: "Video could not be loaded.",
};

export default function VideoLoadOverlay({
  status,
  message,
  onRetry,
}: VideoLoadOverlayProps) {
  const isError = status === "error";

  return (
    <div className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 text-center">
      <div className="flex max-w-xs flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/80 px-5 py-4 shadow-2xl backdrop-blur-md">
        {isError ? (
          <AlertCircle className="h-7 w-7 text-red-400" />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        )}
        <p className="text-xs font-bold leading-relaxed text-white kurdish-text">
          {message || DEFAULT_MESSAGES[status]}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-[11px] font-black text-white transition-colors hover:bg-red-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
