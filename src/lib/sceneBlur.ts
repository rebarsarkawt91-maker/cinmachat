/** Per-movie visual masking ranges use the video's own playback clock. */
export interface SceneBlurRange {
  start: number;
  end: number;
}

export interface SceneBlurConfig {
  enabled: boolean;
  ranges: SceneBlurRange[];
}

export const MAX_SCENE_BLUR_RANGES = 100;
export const MAX_SCENE_BLUR_TIME = 86_400;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validRange = (value: unknown): value is SceneBlurRange => {
  if (!isRecord(value)) return false;
  return typeof value.start === "number" && Number.isFinite(value.start) && value.start >= 0 &&
    typeof value.end === "number" && Number.isFinite(value.end) && value.end > value.start &&
    value.end <= MAX_SCENE_BLUR_TIME;
};

const copySortedRanges = (ranges: SceneBlurRange[]): SceneBlurRange[] =>
  ranges.map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

/** Tolerant catalog reader for legacy movies with no scene-mask settings. */
export function normalizeSceneBlurConfig(value: unknown): SceneBlurConfig {
  if (!isRecord(value)) return { enabled: false, ranges: [] };
  const ranges = Array.isArray(value.ranges)
    ? value.ranges.filter(validRange).slice(0, MAX_SCENE_BLUR_RANGES) : [];
  return { enabled: value.enabled === true, ranges: copySortedRanges(ranges) };
}

/** Strict write boundary. Never silently discard an administrator's bad range. */
export function validateSceneBlurConfig(value: unknown): SceneBlurConfig {
  if (!isRecord(value) || typeof value.enabled !== "boolean") {
    throw new Error("Scene blur settings must include an enabled boolean.");
  }
  if (!Array.isArray(value.ranges) || value.ranges.length > MAX_SCENE_BLUR_RANGES) {
    throw new Error(`Scene blur settings require at most ${MAX_SCENE_BLUR_RANGES} ranges.`);
  }
  if (!value.ranges.every(validRange)) {
    throw new Error("Every scene blur range must have finite seconds: 0 <= start < end <= 86400.");
  }
  return { enabled: value.enabled, ranges: copySortedRanges(value.ranges) };
}

/** Kurdish keyboards may enter either Arabic or Persian digit characters. */
const asciiTime = (value: string): string => value
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/٫/g, ".");

/** Accept seconds, mm:ss, or hh:mm:ss; only the seconds part may be fractional. */
export function parseSceneTime(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const text = asciiTime(raw).trim();
  if (!text) return null;
  const parts = text.split(":").map(part => part.trim());
  if (parts.length > 3 || parts.some(part => !part)) return null;
  const secondsPart = parts[parts.length - 1];
  if (!/^\d+(?:\.\d{1,3})?$/.test(secondsPart) ||
      parts.slice(0, -1).some(part => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some(part => !Number.isFinite(part))) return null;
  if (parts.length > 1 && numbers[numbers.length - 1] >= 60) return null;
  if (parts.length === 3 && numbers[1] >= 60) return null;
  const total = numbers.length === 3 ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    : numbers.length === 2 ? numbers[0] * 60 + numbers[1] : numbers[0];
  return total <= MAX_SCENE_BLUR_TIME ? total : null;
}

/** Keep editable millisecond precision without displaying unnecessary zeros. */
export function formatSceneTime(seconds: number): string {
  const milliseconds = Number.isFinite(seconds)
    ? Math.round(Math.max(0, Math.min(MAX_SCENE_BLUR_TIME, seconds)) * 1000) : 0;
  const whole = Math.floor(milliseconds / 1000);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole % 3600 / 60);
  const remaining = whole % 60;
  const fraction = milliseconds % 1000;
  const suffix = fraction ? `.${String(fraction).padStart(3, "0").replace(/0+$/, "")}` : "";
  const clock = `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}${suffix}`;
  return hours ? `${String(hours).padStart(2, "0")}:${clock}` : clock;
}

/** Stateless on seeks/pauses. Unknown clocks obscure until a valid clock arrives. */
export function isSceneBlurActive(config: SceneBlurConfig | null | undefined, time: number | null | undefined): boolean {
  if (!config?.enabled || !config.ranges.length) return false;
  if (typeof time !== "number" || !Number.isFinite(time) || time < 0) return true;
  return config.ranges.some(range => time >= range.start && time < range.end);
}
