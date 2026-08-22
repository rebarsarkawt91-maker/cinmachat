/* ===========================================================================
 * UniversalSubtitleSelector
 * ---------------------------------------------------------------------------
 * One subtitle-language control reused by every player surface in the app:
 *   - Main player overlay (Movie / Drama Room / VIP virtual movie)
 *   - Cinema Window native-video sidebar
 *   - Cinema Chat Room control bar
 *
 * Design contract:
 *   - CONTROLLED component. The parent owns the language state and the fetch
 *     pipeline; this component only renders UI and reports intent via onChange.
 *   - `status` + `message` mirror the parent pipeline so users always see
 *     loading / ready / error feedback without duplicated fetching logic.
 *   - Two visual variants:
 *       variant="floating" -> round trigger button + popup menu (players)
 *       variant="inline"   -> chip row for panels/sidebars
 * =========================================================================== */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Captions, CheckCircle2, RefreshCw, Settings2 } from "lucide-react";
import "../styles/subtitle-selector.css";

export type UniversalSubtitleLang = "off" | "original" | "ku" | "ar" | "tr";

export type UniversalSubtitleStatus = "idle" | "loading" | "ready" | "error";

export interface UniversalSubtitleLanguage {
  code: UniversalSubtitleLang;
  /** Kurdish display name shown in menus */
  label: string;
  /** Short latin badge shown on the trigger button */
  shortLabel: string;
}

/** Default language set: EN / KU / AR / TR (+ Off) */
export const UNIVERSAL_SUBTITLE_LANGUAGES: UniversalSubtitleLanguage[] = [
  { code: "original", label: "ئینگلیزی", shortLabel: "EN" },
  { code: "ku", label: "کوردی", shortLabel: "KU" },
  { code: "ar", label: "عەرەبی", shortLabel: "AR" },
  { code: "tr", label: "تورکی", shortLabel: "TR" },
];

const OFF_LANGUAGE: UniversalSubtitleLanguage = {
  code: "off",
  label: "داخستن",
  shortLabel: "OFF",
};

const READY_TOAST_MS = 2400;
const LOADING_TOAST_MS = 3200;
const ERROR_TOAST_MS = 6500;

interface ToastState {
  kind: "loading" | "success" | "error";
  text: string;
}

export interface UniversalSubtitleSelectorProps {
  /** Currently active language (controlled) */
  value: UniversalSubtitleLang;
  /** Called when the user picks a language */
  onChange: (lang: UniversalSubtitleLang) => void;
  /** Mirrors the parent pipeline state */
  status?: UniversalSubtitleStatus;
  /** Optional pipeline message (e.g. "وەرگێڕان...") shown in toasts/status */
  message?: string;
  /** Retry handler surfaced on error toasts */
  onRetry?: () => void;
  /** Language list override (defaults to EN/KU/AR/TR) */
  languages?: UniversalSubtitleLanguage[];
  /** "floating" (default) = round button + popup, "inline" = chip row */
  variant?: "floating" | "inline";
  /** Tooltip/title on the trigger button */
  title?: string;
  /** Optional extra action in the menu footer (e.g. open CC settings panel) */
  onSettingsClick?: () => void;
  /** Highlights the settings footer entry while the parent panel is open */
  settingsActive?: boolean;
}

export function UniversalSubtitleSelector({
  value,
  onChange,
  status = "idle",
  message = "",
  onRetry,
  languages = UNIVERSAL_SUBTITLE_LANGUAGES,
  variant = "floating",
  title = "ژێرنوس (Subtitles)",
  onSettingsClick,
  settingsActive = false,
}: UniversalSubtitleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // RTL awareness (Kurdish/Arabic layouts flip anchoring + text direction)
  const [isRtl] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dir === "rtl",
  );

  const allLanguages = useMemo(() => [OFF_LANGUAGE, ...languages], [languages]);
  const activeLanguage =
    allLanguages.find((lang) => lang.code === value) || OFF_LANGUAGE;

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (next: ToastState, durationMs: number) => {
      clearToastTimer();
      setToast(next);
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, durationMs);
    },
    [clearToastTimer],
  );

  // Mirror pipeline status changes into transient toasts
  useEffect(() => {
    if (status === "loading") {
      showToast(
        { kind: "loading", text: message || "وەرگێڕانی ژێرنوس..." },
        LOADING_TOAST_MS,
      );
    } else if (status === "ready") {
      if (value === "off") {
        setToast(null);
      } else {
        showToast(
          {
            kind: "success",
            text: message || `${activeLanguage.label} ئامادەیە`,
          },
          READY_TOAST_MS,
        );
      }
    } else if (status === "error") {
      showToast({ kind: "error", text: message || "هەڵە لە ژێرنوس" }, ERROR_TOAST_MS);
    } else {
      setToast(null);
    }
    return clearToastTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => clearToastTimer, [clearToastTimer]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const pickLanguage = (lang: UniversalSubtitleLang) => {
    if (lang !== value) onChange(lang);
    else setIsOpen(false);
  };

  /* ---------------------------------------------------------------- */
  /* Inline variant — chip row for sidebars/panels                     */
  /* ---------------------------------------------------------------- */
  if (variant === "inline") {
    const statusLine =
      status === "error"
        ? message || "هەڵە لە وەرگێڕان"
        : status === "loading"
          ? message || "وەرگێڕان..."
          : status === "ready"
            ? message || `${activeLanguage.label} ئامادەیە`
            : "";

    return (
      <div className={`uss-root${isRtl ? " uss-root--rtl" : ""}`} dir="auto">
        <div className="uss-inline">
          {allLanguages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => pickLanguage(lang.code)}
              className={`uss-chip${value === lang.code ? " uss-chip--active" : ""}`}
              aria-pressed={value === lang.code}
            >
              <span className="uss-chip-dot" />
              <span>{lang.label}</span>
            </button>
          ))}
          {(statusLine || status === "error") && (
            <div
              className={`uss-inline-status uss-inline-status--${status}`}
              dir="auto"
            >
              <span className="uss-inline-status-dot" />
              <span className="truncate">{statusLine}</span>
              {status === "error" && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="uss-toast-retry"
                >
                  دووبارە
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Floating variant — round trigger + popup menu                     */
  /* ---------------------------------------------------------------- */
  const triggerStateClass =
    status === "loading"
      ? "uss-trigger--loading"
      : status === "error"
        ? "uss-trigger--error"
        : status === "ready" && value !== "off"
          ? "uss-trigger--ready"
          : "";

  const showBadge =
    (status === "ready" || status === "idle") &&
    value !== "off" &&
    activeLanguage.code !== "off";

  return (
    <div className={`uss-root${isRtl ? " uss-root--rtl" : ""}`}>
      {/* Toasts float above the trigger */}
      {toast && (
        <div className="uss-toasts" dir="auto">
          <div className={`uss-toast uss-toast--${toast.kind}`}>
            <span>{toast.text}</span>
            {toast.kind === "error" && onRetry && (
              <button
                type="button"
                onClick={() => {
                  setToast(null);
                  onRetry();
                }}
                className="uss-toast-retry"
              >
                دووبارە
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`uss-trigger ${triggerStateClass}`.trim()}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={title}
      >
        {status === "loading" ? (
          <span className="uss-spinner" />
        ) : (
          <Captions className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.5} />
        )}
        {showBadge && (
          <span className="uss-badge">{activeLanguage.shortLabel}</span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Click-away shield */}
          <div
            className="fixed inset-0 z-[85]"
            onClick={() => setIsOpen(false)}
          />
          <div className="uss-panel" role="menu" dir="auto">
            <div className="uss-heading">زمانی ژێرنوس</div>

            {[OFF_LANGUAGE, ...languages].map((lang) => {
              const isActive = value === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={() => pickLanguage(lang.code)}
                  className={`uss-item${isActive ? " uss-item--active" : ""}${
                    lang.code === "off" ? " uss-item--off" : ""
                  }`}
                >
                  <span>{lang.label}</span>
                  {isActive && (
                    <CheckCircle2 className="uss-item-check" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}

            {(onSettingsClick || onRetry) && (
              <div className="uss-panel-foot">
                {onSettingsClick && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onSettingsClick();
                    }}
                    className={`uss-foot-btn${settingsActive ? " uss-foot-btn--active" : ""}`}
                  >
                    <Settings2 className="w-3 h-3" />
                    <span>ڕێکخستن</span>
                  </button>
                )}
                {status === "error" && onRetry && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onRetry();
                    }}
                    className="uss-foot-btn uss-foot-btn--retry"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>دووبارە</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default UniversalSubtitleSelector;
