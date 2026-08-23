import React from "react";
import { AlertCircle, Loader2, PauseCircle, RefreshCw } from "lucide-react";
import type { CcSettings, SubtitleMode, SubtitleStatus } from "../../hooks/useSubtitleManager";
import {
  CC_FONT_SIZES,
  ccSubtitleBottomPercent,
  useDelayedSubtitleLoad,
} from "../../hooks/useSubtitleManager";

// ---------------------------------------------------------------------------
// SubtitleOverlay — renders subtitle cues on top of ANY video player.
// Used by: main modal player, Cinema Window, Drama Rooms, CinemaChat, and
// any future video player that adopts the global subtitle pipeline.
//
// Features:
//  - Vertical position control via ccSettings.subtitleOffsetY (up/down shift).
//  - Slow-network prompt: when loading drags on, users are told to pause the
//    video until subtitles finish loading (matches the ready-notification style).
// ---------------------------------------------------------------------------

/** How long a "loading" state may last before we show the pause hint (ms). */
const SLOW_LOAD_HINT_MS = 9000;

interface SubtitleOverlayProps {
  /** Whether the subtitle system is active (not "off"). */
  active: boolean;
  /** Current subtitle language mode. */
  mode: SubtitleMode;
  /** Status of the subtitle loading pipeline. */
  status: SubtitleStatus;
  /** Status/error message. */
  message: string;
  /** Active translated subtitle text for the current playback time. */
  activeText: string;
  /** Active original subtitle text (shown above when mode === "both"). */
  activeOriginalText: string;
  /** CC display settings (font, opacity, color, vertical position). */
  ccSettings: CcSettings;
  /** Pre-computed font size entry. */
  ccFontSizeEntry: (typeof CC_FONT_SIZES)[number];
  /** Pre-computed CSS style for subtitle text. */
  ccSubtitleStyle: React.CSSProperties;
  /** Retry callback after an error. */
  onRetry?: () => void;
}

export default function SubtitleOverlay({
  active,
  mode,
  status,
  message,
  activeText,
  activeOriginalText,
  ccSettings,
  ccFontSizeEntry,
  ccSubtitleStyle,
  onRetry,
}: SubtitleOverlayProps) {
  const delayedLoad = useDelayedSubtitleLoad(status, SLOW_LOAD_HINT_MS);

  if (!active || mode === "off") return null;

  const hasTranslated = !!activeText;
  const hasOriginal = mode === "both" && !!activeOriginalText;
  const showSubtitles = hasTranslated || hasOriginal;
  const showLoading = status === "loading" && !hasTranslated && !hasOriginal;
  const showError = status === "error";

  return (
    <>
      {/* Dual subtitle display — bottom edge follows the user's position setting */}
      {showSubtitles && (
        <div
          className="pointer-events-none absolute inset-x-3 z-10 flex flex-col items-center gap-1 transition-[bottom] duration-300"
          style={{ bottom: ccSubtitleBottomPercent(ccSettings.subtitleOffsetY) }}
        >
          {hasOriginal && (
            <div
              dir="auto"
              className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-1.5 text-center font-bold leading-snug opacity-80 shadow-[0_2px_12px_rgba(0,0,0,0.65)] ${ccFontSizeEntry.mobileCls} md:${ccFontSizeEntry.cls}`}
              style={{
                ...ccSubtitleStyle,
                color: "#e5e7eb",
                backgroundColor: `rgba(0,0,0,${Math.max(ccSettings.bgOpacity - 0.15, 0.35)})`,
              }}
            >
              {activeOriginalText}
            </div>
          )}
          {hasTranslated && (
            <div
              dir="auto"
              className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-2 text-center font-bold leading-snug shadow-[0_2px_14px_rgba(0,0,0,0.75)] ${ccFontSizeEntry.mobileCls} md:${ccFontSizeEntry.cls}`}
              style={ccSubtitleStyle}
            >
              {activeText}
            </div>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {showLoading && !delayedLoad && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 px-4 py-3 pointer-events-none">
          <div className="flex items-center gap-2 rounded-xl bg-black/70 px-3 py-2 text-xs text-red-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="kurdish-text">{message || "وەردەگێڕدرێت..."}</span>
          </div>
        </div>
      )}

      {/* Slow-network prompt — swap the spinner pill for a clear instruction:
          pause playback until the subtitles finish downloading. */}
      {showLoading && delayedLoad && (
        <div className="absolute inset-x-0 bottom-16 z-20 flex items-center justify-center gap-2 px-4 pointer-events-none">
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-black/85 px-4 py-2 text-xs text-amber-300 shadow-[0_2px_14px_rgba(0,0,0,0.8)] backdrop-blur-sm">
            <PauseCircle className="w-4 h-4 shrink-0 animate-pulse" />
            <span className="kurdish-text font-bold">
              ئینتەرنێت خاویە — تکایە ڤیدیۆکە وەستێنە (Pause) تا ژێرنووس بار بێت
            </span>
          </div>
        </div>
      )}

      {/* Error indicator with retry */}
      {showError && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-red-950/80 border border-red-500/20 px-3 py-2 text-xs text-red-300">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="kurdish-text">{message || "بەردەست نییە"}</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="ml-1 p-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors shrink-0 cursor-pointer"
                title="Retry subtitle generation"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
