import React, { useState } from "react";
import { Captions, CheckCircle2 } from "lucide-react";
import type { CcSettings, SubtitleMode, SubtitleStatus } from "../../hooks/useSubtitleManager";
import { SUBTITLE_LANGUAGES, CC_FONT_SIZES, CC_TEXT_COLORS } from "../../hooks/useSubtitleManager";

// ---------------------------------------------------------------------------
// SubtitleDropdown — floating CC language picker + settings panel for ANY
// video player. Matches the Drama Room / CinemaChat subtitle menu style.
// ---------------------------------------------------------------------------

interface SubtitleDropdownProps {
  /** Current subtitle language mode. */
  mode: SubtitleMode;
  /** Pipeline status (drives button indicator color). */
  status: SubtitleStatus;
  /** Called when user picks a language. */
  onModeChange: (mode: SubtitleMode) => void;
  /** CC display settings. */
  ccSettings: CcSettings;
  /** Update CC settings. */
  onUpdateCcSettings: (updater: (prev: CcSettings) => CcSettings) => void;
  /** Optional: position class override (default: bottom-[60px] right-0). */
  positionClass?: string;
}

export default function SubtitleDropdown({
  mode,
  status,
  onModeChange,
  ccSettings,
  onUpdateCcSettings,
  positionClass = "bottom-[60px] right-0",
}: SubtitleDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="relative overflow-visible">
      {/* CC toggle button */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setShowSettings(false);
        }}
        className={`w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border border-white/10 ${
          status === "ready"
            ? "bg-brand-primary text-white"
            : status === "loading"
              ? "bg-red-600 text-white animate-pulse"
              : "bg-black/60 hover:bg-white/10 text-white"
        }`}
        title="زمانی ژێرنوس (Subtitles)"
      >
        <Captions className="w-3.5 h-3.5 md:w-4 md:h-4" />
      </button>

      {/* Language picker menu */}
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className={`absolute ${positionClass} z-[90] w-44 max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0c]/95 backdrop-blur-xl p-2 shadow-2xl space-y-1.5 overscroll-contain`}>
            <div className="px-1 pb-1 text-[8px] font-black text-zinc-400 uppercase tracking-widest kurdish-text">
              زمانی ژێرنوس
            </div>
            {SUBTITLE_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  onModeChange(lang.code as SubtitleMode);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                  mode === lang.code
                    ? "bg-brand-primary text-white"
                    : "bg-white/5 hover:bg-white/10 text-zinc-300"
                }`}
              >
                <span>{lang.label}</span>
                {mode === lang.code && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            ))}

            {/* Settings toggle */}
            <div className="border-t border-white/10 pt-1.5 space-y-1">
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white/5 hover:bg-white/10 text-zinc-300 cursor-pointer transition-all"
              >
                <span>⚙️ ڕێکخستن</span>
                {showSettings && <span className="ml-auto text-[8px] text-brand-primary">●</span>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* CC Settings Panel */}
      {showSettings && (
        <>
          <div className="fixed inset-0 z-[65]" onClick={() => setShowSettings(false)} />
          <div className={`absolute ${positionClass} z-[100] w-56 max-h-[65vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0c]/95 backdrop-blur-xl p-3 shadow-2xl space-y-3 overscroll-contain`}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest kurdish-text">ڕێکخستنی ژێرنوس</span>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white text-xs cursor-pointer">✕</button>
            </div>

            {/* Show / Hide toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-300">show / hide</span>
              <button
                type="button"
                onClick={() => {
                  const shouldShow = !ccSettings.showSubtitle || mode === "off";
                  onModeChange(shouldShow ? "ckb" : "off");
                }}
                className={`w-8 h-4 rounded-full transition-all cursor-pointer ${ccSettings.showSubtitle ? "bg-brand-primary" : "bg-zinc-600"}`}
              >
                <span className={`block w-3 h-3 rounded-full bg-white shadow transition-transform ${ccSettings.showSubtitle ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>

            {/* Font size */}
            <div>
              <span className="text-[9px] font-bold text-zinc-500 block mb-1">ئەندازەی فۆنت</span>
              <div className="flex gap-1">
                {CC_FONT_SIZES.map((fs) => (
                  <button
                    key={fs.key}
                    type="button"
                    onClick={() => onUpdateCcSettings((s) => ({ ...s, fontSize: fs.key }))}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      ccSettings.fontSize === fs.key ? "bg-brand-primary text-white" : "bg-white/5 hover:bg-white/10 text-zinc-400"
                    }`}
                  >
                    {fs.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold text-zinc-500">کاڵکردنەوە</span>
                <span className="text-[8px] text-zinc-600">{Math.round(ccSettings.bgOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.1}
                value={ccSettings.bgOpacity}
                onChange={(e) => onUpdateCcSettings((s) => ({ ...s, bgOpacity: Number(e.target.value) }))}
                className="w-full h-1 accent-brand-primary cursor-pointer"
              />
            </div>

            {/* Text color */}
            <div>
              <span className="text-[9px] font-bold text-zinc-500 block mb-1">ڕەنگ</span>
              <div className="flex gap-1.5">
                {CC_TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onUpdateCcSettings((s) => ({ ...s, textColor: color }))}
                    className={`w-5 h-5 rounded-full border-2 transition-all cursor-pointer ${
                      ccSettings.textColor === color ? "border-white scale-110" : "border-zinc-600 hover:border-zinc-400"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
