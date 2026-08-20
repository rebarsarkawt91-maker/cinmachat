import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Subtitle types & constants — shared across ALL video players on the site.
// ---------------------------------------------------------------------------

export type SubtitleMode = "off" | "original" | "ckb" | "both";

export type SubtitleCue = { start: number; end: number; text: string };

export type SubtitleStatus = "idle" | "loading" | "ready" | "error";

export type SubtitlePayload = {
  rawText: string;
  vttText: string;
  sourceLang: string;
  source: string;
  originalRawText?: string;
  originalVttText?: string;
  subtitleWarning?: string;
};

export type CcSettings = {
  fontSize: "sm" | "md" | "lg" | "xl";
  bgOpacity: number;
  textColor: string;
  showSubtitle: boolean;
  showOriginal: boolean;
};

export const SUBTITLE_LANGUAGES = [
  { code: "off", label: "داخستن", shortLabel: "داخستن", ai: false },
  { code: "original", label: "ژێرنووسی ڕەسەن", shortLabel: "ڕەسەن", ai: false },
  { code: "ckb", label: "کوردی", shortLabel: "کوردی", ai: true },
  { code: "both", label: "هەردووکیان پێکەوە", shortLabel: "هەردوو", ai: true },
] as const;

export const CC_FONT_SIZES: { key: CcSettings["fontSize"]; label: string; cls: string; mobileCls: string }[] = [
  { key: "sm", label: "A-", cls: "text-sm md:text-base", mobileCls: "text-[11px]" },
  { key: "md", label: "A", cls: "text-lg md:text-2xl", mobileCls: "text-base" },
  { key: "lg", label: "A+", cls: "text-xl md:text-3xl", mobileCls: "text-lg" },
  { key: "xl", label: "A++", cls: "text-2xl md:text-4xl", mobileCls: "text-xl" },
];

export const CC_TEXT_COLORS = ["#ffffff", "#FFFF00", "#00FFFF", "#00FF00", "#FF8800", "#FF5555"];

const CC_SETTINGS_KEY = "cinemachat-cc-settings";
const DEFAULT_CC: CcSettings = { fontSize: "md", bgOpacity: 0.8, textColor: "#ffffff", showSubtitle: true, showOriginal: false };

export function loadCcSettings(): CcSettings {
  try {
    const raw = localStorage.getItem(CC_SETTINGS_KEY);
    if (!raw) return DEFAULT_CC;
    return { ...DEFAULT_CC, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CC;
  }
}

export function saveCcSettings(s: CcSettings) {
  try {
    localStorage.setItem(CC_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* */
  }
}

// ---------------------------------------------------------------------------
// Subtitle text utilities — sanitization, parsing, VTT conversion.
// These are pure functions with no React dependency.
// ---------------------------------------------------------------------------

const METADATA_PATTERNS = [
  /\bkurd\s*[-_.]*\s*zhin\b/i,
  /\bkurdzhin\b/i,
  /کورد\s*ژین/i,
  /\b(?:translated|subtitle(?:s)?|caption(?:s)?|sync(?:ed)?|provided|uploaded|encoded|edited)\s+(?:by|from)\b/i,
  /\b(?:telegram|t\.me\/|instagram|facebook|youtube\s+channel|subscribe|follow\s+us)\b/i,
  /^\s*(?:https?:\/\/|www\.)\S+\s*$/i,
  /^\s*[@#][\w.-]{3,}\s*$/i,
];

const SYSTEM_PATTERNS = [
  /^```[\w-]*$/i,
  /^(?:here(?:'s| is)|below is|this is)\s+(?:the\s+)?(?:translated\s+)?(?:subtitle|srt|vtt|translation)/i,
  /^(?:translated subtitle|translation|output subtitle|input subtitle file|raw subtitle file)\s*:?\s*$/i,
  /^#+\s*(?:subtitle|translation|output)/i,
];

function metadataProbe(line: string): string {
  return String(line || "")
    .replace(/<\d{2}:\d{2}:\d{2}[\.,]\d{3}>/g, "")
    .replace(/<\/?c[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function isStructureLine(line: string): boolean {
  const t = String(line || "").trim();
  return !t || /^WEBVTT$/i.test(t) || /^\d+$/.test(t) || /\d{2}:\d{2}:\d{2}[\.,]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[\.,]\d{3}/.test(t);
}

function isMetadataLine(line: string): boolean {
  const clean = metadataProbe(line);
  if (!clean) return false;
  if (/^(Kind|Language|X-TIMESTAMP-MAP):/i.test(clean)) return true;
  if (/^(NOTE|STYLE|REGION)(?:\s|$)/i.test(clean)) return true;
  return SYSTEM_PATTERNS.some((p) => p.test(clean)) || METADATA_PATTERNS.some((p) => p.test(clean));
}

function stripMetadataFragments(line: string): string {
  if (isStructureLine(line)) return line;
  return String(line || "")
    .replace(/\bkurd\s*[-_.]*\s*zhin\b/gi, "")
    .replace(/\bkurdzhin\b/gi, "")
    .replace(/کورد\s*ژین/g, "")
    .replace(/\s*(?:[-–—|•]+)\s*(?:translated|subtitle(?:s)?|caption(?:s)?)\s+(?:by|from)\s+.*$/i, "")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*[-–—|•:]+|[-–—|•:]+\s*$/g, "")
    .trim();
}

export function sanitizeSubtitleText(subtitleText: string): string {
  const normalized = String(subtitleText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const keepTrailing = /\n\s*$/.test(normalized);
  const output: string[] = [];
  let skipBlock = false;

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/i.test(trimmed)) {
      skipBlock = true;
      continue;
    }
    if (skipBlock) {
      if (!trimmed) {
        skipBlock = false;
        output.push(line);
      }
      continue;
    }
    const stripped = stripMetadataFragments(line);
    if (!isStructureLine(line) && isMetadataLine(stripped)) continue;
    if (stripped || isStructureLine(line)) output.push(stripped);
  }

  const cleaned = output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned && keepTrailing ? `${cleaned}\n` : cleaned;
}

function subtitleTextToVtt(text: string): string {
  const clean = sanitizeSubtitleText(text);
  if (!clean) return "";
  if (/^WEBVTT/i.test(clean)) return clean;
  return `WEBVTT\n\n${clean.replace(/\r+/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}\n`;
}

function parseTime(value: string): number {
  const parts = value.trim().replace(",", ".").split(":");
  if (parts.length < 3) return 0;
  return (Number(parts[0]) || 0) * 3600 + (Number(parts[1]) || 0) * 60 + (Number(parts[2]) || 0);
}

function decodeHtmlEntities(value: string): string {
  const withoutTags = value
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
    .replace(/<\/?c[^>]*>/g, "")
    .replace(/<[^>]+>/g, "");
  if (typeof document === "undefined") {
    return withoutTags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = withoutTags;
  return textarea.value;
}

export function parseSubtitleCues(text: string): SubtitleCue[] {
  const lines = sanitizeSubtitleText(text).split(/\r?\n/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const timingMatch = lines[i].match(/(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[\.,]\d{3})/);
    if (!timingMatch) continue;

    const textLines: string[] = [];
    i += 1;
    while (i < lines.length && lines[i].trim()) {
      const line = lines[i].trim();
      if (!isMetadataLine(line)) textLines.push(stripMetadataFragments(line));
      i += 1;
    }

    const cueText = sanitizeSubtitleText(decodeHtmlEntities(textLines.join("\n"))).trim();
    if (cueText) {
      cues.push({ start: parseTime(timingMatch[1]), end: parseTime(timingMatch[2]), text: cueText });
    }
  }

  return cues;
}

function isLikelyNonKurdish(text: string): boolean {
  const dialogue = sanitizeSubtitleText(text)
    .split(/\r?\n/)
    .map((l) => stripMetadataFragments(l).trim())
    .filter((l) => l && !isStructureLine(l) && !isMetadataLine(l))
    .join(" ");
  if (!dialogue) return false;
  const arabic = dialogue.match(/[\u0600-\u06FF]/g)?.length || 0;
  const latin = dialogue.match(/[A-Za-z]/g)?.length || 0;
  return arabic === 0 && latin >= 20;
}

function mergeCues(existing: SubtitleCue[], incoming: SubtitleCue[]): SubtitleCue[] {
  if (!incoming.length) return existing;
  const map = new Map<string, SubtitleCue>();
  for (const c of existing) map.set(`${c.start.toFixed(3)}:${c.end.toFixed(3)}`, c);
  for (const c of incoming) map.set(`${c.start.toFixed(3)}:${c.end.toFixed(3)}`, c);
  return Array.from(map.values()).sort((a, b) => a.start - b.start || a.end - b.end);
}

// ---------------------------------------------------------------------------
// Gemini API key from user settings (localStorage).
// ---------------------------------------------------------------------------

function getUserGeminiApiKey(): string | undefined {
  try {
    const key = localStorage.getItem("user_gemini_api_key");
    return key?.trim() || undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Server API calls.
// ---------------------------------------------------------------------------

async function requestSubtitle(
  sourceUrl: string,
  lang: string,
  signal?: AbortSignal,
  windowOptions?: { startSeconds?: number; windowSeconds?: number },
  subtitleUrl?: string,
): Promise<SubtitlePayload> {
  const userGeminiKey = getUserGeminiApiKey();
  const response = await fetch("/api/subtitle/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: sourceUrl,
      lang,
      subtitleUrl: subtitleUrl || undefined,
      ...windowOptions,
      ...(userGeminiKey ? { geminiApiKey: userGeminiKey } : {}),
    }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) throw new Error(data?.error || "Subtitle generation failed");

  const rawText = sanitizeSubtitleText(String(data?.srt || ""));
  const vttText = subtitleTextToVtt(rawText);
  if (!vttText) throw new Error("Subtitle file is empty");

  const originalRaw = sanitizeSubtitleText(String(data?.originalSrt || ""));
  const originalVtt = originalRaw ? subtitleTextToVtt(originalRaw) : "";

  return {
    rawText,
    vttText,
    sourceLang: String(data?.lang || lang),
    source: String(data?.source || ""),
    originalRawText: originalRaw || undefined,
    originalVttText: originalVtt || undefined,
  };
}

async function translateSubtitle(
  subtitleText: string,
  targetLang: string,
  sourceLang: string,
  signal?: AbortSignal,
): Promise<SubtitlePayload> {
  const userGeminiKey = getUserGeminiApiKey();
  const response = await fetch("/api/subtitle/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      srt: subtitleText,
      lang: targetLang,
      sourceLang,
      ...(userGeminiKey ? { geminiApiKey: userGeminiKey } : {}),
    }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) throw new Error(data?.error || "Subtitle translation failed");

  const rawText = sanitizeSubtitleText(String(data?.srt || ""));
  const vttText = subtitleTextToVtt(rawText);
  if (!vttText) throw new Error("Translated subtitle file is empty");

  const originalRaw = sanitizeSubtitleText(subtitleText);
  return {
    rawText,
    vttText,
    sourceLang: String(data?.lang || targetLang),
    source: String(data?.source || ""),
    originalRawText: originalRaw || undefined,
    originalVttText: originalRaw ? subtitleTextToVtt(originalRaw) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Windowed subtitle constants.
// ---------------------------------------------------------------------------

const WINDOW_STEP = 180;
const WINDOW_DURATION = 240;

const cache = new Map<string, SubtitlePayload>();

// ---------------------------------------------------------------------------
// useSubtitleManager — single hook for ALL video players on the site.
// ---------------------------------------------------------------------------

export interface UseSubtitleManagerOptions {
  /** The video source URL. Empty string = no video. */
  sourceUrl: string;
  /** Current playback position in seconds. */
  playbackTime: number;
  /** URL of a pre-existing subtitle file (.srt/.vtt) attached to the movie, if any. */
  movieSubtitleUrl?: string;
}

export interface UseSubtitleManagerReturn {
  /** Current subtitle language mode. */
  mode: SubtitleMode;
  /** Set the subtitle language mode. */
  setMode: (mode: SubtitleMode) => void;
  /** Toggle subtitles on/off (restores last active mode). */
  toggle: () => void;
  /** Current status of subtitle loading. */
  status: SubtitleStatus;
  /** Human-readable status/error message. */
  message: string;
  /** The active translated subtitle text for the current playback time. */
  activeText: string;
  /** The active original subtitle text (only non-empty in "both" mode). */
  activeOriginalText: string;
  /** CC display settings. */
  ccSettings: CcSettings;
  /** Update CC display settings. */
  updateCcSettings: (updater: (prev: CcSettings) => CcSettings) => void;
  /** Font size entry matching current CC settings. */
  ccFontSizeEntry: (typeof CC_FONT_SIZES)[number];
  /** CSS style object for subtitle text. */
  ccSubtitleStyle: React.CSSProperties;
  /** Retry loading subtitles after an error. */
  retry: () => void;
  /** All translated cues (for advanced use). */
  translatedCues: SubtitleCue[];
  /** All original cues (for advanced use). */
  originalCues: SubtitleCue[];
}

export function useSubtitleManager({
  sourceUrl,
  playbackTime,
  movieSubtitleUrl = "",
}: UseSubtitleManagerOptions): UseSubtitleManagerReturn {
  const [mode, setModeState] = useState<SubtitleMode>("off");
  const [status, setStatus] = useState<SubtitleStatus>("idle");
  const [message, setMessage] = useState("");
  const [translatedCues, setTranslatedCues] = useState<SubtitleCue[]>([]);
  const [originalCues, setOriginalCues] = useState<SubtitleCue[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const [ccSettings, setCcSettings] = useState<CcSettings>(loadCcSettings);

  const lastActiveModeRef = useRef<SubtitleMode>("ckb");
  const prevLangRef = useRef(mode);
  const prevSourceRef = useRef(sourceUrl);

  useEffect(() => {
    saveCcSettings(ccSettings);
  }, [ccSettings]);

  // -- Mode helpers --

  const isKurdish = (m: SubtitleMode) => m === "ckb" || m === "both";
  const isOriginal = (m: SubtitleMode) => m === "original" || m === "both";

  const setMode = useCallback(
    (nextMode: SubtitleMode) => {
      if (nextMode !== "off") lastActiveModeRef.current = nextMode;
      setModeState(nextMode);
      setCcSettings((s) => ({
        ...s,
        showSubtitle: nextMode !== "off",
        showOriginal: isOriginal(nextMode),
      }));
      setTranslatedCues([]);
      setOriginalCues([]);
      setStatus(nextMode === "off" ? "idle" : "loading");
      setMessage("");
      setRetryKey((k) => k + 1);
    },
    [],
  );

  const toggle = useCallback(() => {
    const shouldShow = !ccSettings.showSubtitle || mode === "off";
    setMode(shouldShow ? lastActiveModeRef.current : "off");
  }, [setMode, ccSettings.showSubtitle, mode]);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  // -- Active cue matching --

  const activeText = useMemo(() => {
    if (!ccSettings.showSubtitle || mode === "off") return "";
    if (!translatedCues.length) return "";
    const cue = translatedCues.find((c) => playbackTime >= c.start && playbackTime <= c.end);
    return cue?.text || "";
  }, [ccSettings.showSubtitle, mode, playbackTime, translatedCues]);

  const activeOriginalText = useMemo(() => {
    if (!ccSettings.showSubtitle || !isOriginal(mode)) return "";
    if (!originalCues.length) return "";
    const cue = originalCues.find((c) => playbackTime >= c.start && playbackTime <= c.end);
    return cue?.text || "";
  }, [ccSettings.showSubtitle, mode, playbackTime, originalCues]);

  // -- CC style --

  const ccFontSizeEntry = useMemo(
    () => CC_FONT_SIZES.find((e) => e.key === ccSettings.fontSize) || CC_FONT_SIZES[1],
    [ccSettings.fontSize],
  );

  const ccSubtitleStyle = useMemo<React.CSSProperties>(
    () => ({
      color: ccSettings.textColor,
      backgroundColor:
        ccSettings.textColor === "#ffffff"
          ? `rgba(0,0,0,${ccSettings.bgOpacity})`
          : `rgba(0,0,0,${Math.min(ccSettings.bgOpacity + 0.1, 1)})`,
      textShadow: "0 1px 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)",
    }),
    [ccSettings.textColor, ccSettings.bgOpacity],
  );

  // -- Subtitle fetching pipeline --

  useEffect(() => {
    let cancelled = false;

    if (!sourceUrl || mode === "off") {
      setTranslatedCues([]);
      setOriginalCues([]);
      setStatus("idle");
      setMessage("");
      prevLangRef.current = mode;
      prevSourceRef.current = sourceUrl;
      return;
    }

    const langChanged = prevLangRef.current !== mode;
    const sourceChanged = prevSourceRef.current !== sourceUrl;
    prevLangRef.current = mode;
    prevSourceRef.current = sourceUrl;

    if (langChanged || sourceChanged) {
      setTranslatedCues([]);
      setOriginalCues([]);
    }

    const needsKurdish = isKurdish(mode);
    const needsOriginal = isOriginal(mode);
    const windowOptions = needsKurdish
      ? { startSeconds: Math.max(0, Math.floor(playbackTime / WINDOW_STEP) * WINDOW_STEP - 15), windowSeconds: WINDOW_DURATION }
      : undefined;
    const windowKey = windowOptions ? `::${windowOptions.startSeconds}-${windowOptions.windowSeconds}` : "";
    const cacheKey = `${sourceUrl}::${mode}${windowKey}`;
    const originalCacheKey = `${sourceUrl}::original${windowKey}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached?.vttText || cached?.originalVttText) {
      if (cached.vttText) {
        const cued = parseSubtitleCues(cached.vttText);
        setTranslatedCues((cur) => (windowOptions ? mergeCues(cur, cued) : cued));
      }
      const origVtt = mode === "original" ? cached.vttText : cached.originalVttText;
      if (origVtt) {
        const origCued = parseSubtitleCues(origVtt);
        setOriginalCues((cur) => (windowOptions ? mergeCues(cur, origCued) : origCued));
      } else if (!windowOptions) {
        setOriginalCues([]);
      }
      setStatus("ready");
      setMessage(cached.subtitleWarning || "ئامادەیە");
      return;
    }

    setStatus("loading");
    setMessage(mode === "original" ? "هێنانی ژێرنووسی ڕەسەن..." : mode === "both" ? "هێنانی ژێرنووسی ڕەسەن و وەرگێڕانی کوردی..." : "وەرگێڕانی ژێرنوس...");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120000);

    const load = async (): Promise<SubtitlePayload | null> => {
      if (mode === "original") {
        return requestSubtitle(sourceUrl, "original", controller.signal, undefined, movieSubtitleUrl);
      }
      if (needsKurdish) {
        try {
          const sub = await requestSubtitle(sourceUrl, "ckb", controller.signal, windowOptions, movieSubtitleUrl);
          if (needsOriginal && !sub.originalVttText) {
            try {
              const orig = await requestSubtitle(sourceUrl, "original", controller.signal, windowOptions, movieSubtitleUrl);
              return { ...sub, originalRawText: orig.rawText, originalVttText: orig.vttText };
            } catch {
              return { ...sub, subtitleWarning: "کوردی ئامادەیە، بەڵام ژێرنووسی ڕەسەن بۆ دوو-هێڵی بەردەست نەبوو." };
            }
          }
          return sub;
        } catch (targetErr) {
          let lastErr: any = targetErr;
          try {
            const orig = await requestSubtitle(sourceUrl, "original", controller.signal, windowOptions, movieSubtitleUrl);
            try {
              const translated = await translateSubtitle(orig.rawText, "ckb", orig.sourceLang || "auto", controller.signal);
              return translated;
            } catch {
              if (mode === "both" && orig.vttText) {
                return { rawText: "", vttText: "", sourceLang: "ckb", source: "original-only-fallback", originalRawText: orig.rawText, originalVttText: orig.vttText, subtitleWarning: "کوردی ئامادە نەبوو؛ ژێرنووسی ڕەسەن پیشان دەدرێت." };
              }
            }
          } catch (fallbackErr) {
            lastErr = fallbackErr;
          }
          throw lastErr;
        }
      }
      return null;
    };

    load()
      .then((result) => {
        if (!result || cancelled) return;
        if (result.vttText) {
          const cued = parseSubtitleCues(result.vttText);
          if (needsKurdish && cued.length === 0) throw new Error("ژێرنووسی کوردی بێ ناوەڕۆکە؛ تکایە دووبارە هەوڵ بدەرەوە.");
          setTranslatedCues((cur) => (windowOptions ? mergeCues(cur, cued) : cued));
        }
        cache.set(cacheKey, result);
        const origVtt = mode === "original" ? result.vttText : result.originalVttText;
        if (origVtt) {
          const origCued = parseSubtitleCues(origVtt);
          setOriginalCues((cur) => (windowOptions ? mergeCues(cur, origCued) : origCued));
        } else if (!windowOptions) {
          setOriginalCues([]);
        }
        setStatus("ready");
        setMessage(result.subtitleWarning || "ئامادەیە");
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus("error");
          setMessage(err?.name === "AbortError" ? "وەرگێڕانی ژێرنوس کاتی تەواو بوو" : err?.message || "وەرگێڕانی ژێرنوس سەرکەوتوو نەبوو");
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [sourceUrl, mode, retryKey, movieSubtitleUrl, playbackTime]);

  return {
    mode,
    setMode,
    toggle,
    status,
    message,
    activeText,
    activeOriginalText,
    ccSettings,
    updateCcSettings: setCcSettings,
    ccFontSizeEntry,
    ccSubtitleStyle,
    retry,
    translatedCues,
    originalCues,
  };
}
