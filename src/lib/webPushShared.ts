/**
 * CinemaChat Web Push — shared, pure helpers.
 *
 * This module has ZERO runtime dependencies so it can be imported by the
 * Node/Express bundle (server.ts), the browser bundle (Vite) and the service
 * worker (src/sw.ts) without pulling any environment-specific code into the
 * wrong runtime. All functions here are synchronous and side-effect free so
 * they can be unit-tested directly.
 */

export type PushPreferenceKey = "newMovies" | "newTrailers" | "announcements";
export type PushPreferences = Record<PushPreferenceKey, boolean>;

/** Every stored subscription, including the push-send keys (never exposed). */
export interface PushSubscriptionRecord {
  /** Firebase auth UID that owns this device subscription. */
  userId: string;
  /** Full push endpoint URL. */
  endpoint: string;
  /** SHA-256 of the endpoint — the safe unique key used as the doc id. */
  endpointHash: string;
  /** p256dh client public key (base64url). */
  p256dh: string;
  /** auth secret (base64url). */
  auth: string;
  preferences: PushPreferences;
  /** Master switch: when false the subscription is ignored during sends. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Last time a send to this endpoint was acknowledged successfully. */
  lastSuccessfulDeliveryAt?: string;
  /** Short privacy-safe device label (e.g. "Chrome/Windows"). */
  deviceLabel?: string;
}

/** Public, safe projection of a subscription (never includes keys). */
export interface MaskedPushSubscription {
  endpointHash: string;
  endpoint: string;
  preferences: PushPreferences;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSuccessfulDeliveryAt?: string;
  deviceLabel?: string;
}

export const PUSH_PREFERENCE_KEYS: ReadonlyArray<PushPreferenceKey> = [
  "newMovies",
  "newTrailers",
  "announcements",
];

export const DEFAULT_PREFERENCES: PushPreferences = {
  newMovies: true,
  newTrailers: true,
  announcements: true,
};

/** Notification types that a send can target, mapped to a user preference. */
export const NOTIFICATION_TYPE_PREFERENCE = {
  newMovie: "newMovies",
  newTrailer: "newTrailers",
  announcement: "announcements",
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPE_PREFERENCE;

/** Validated payload accepted by the admin send endpoint. */
export interface PushNotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  /** Movie id used by automatic triggers (idempotency key). */
  movieId?: string;
}

export const PUSH_LIMITS = {
  maxEndpointLength: 2048,
  maxKeyLength: 512,
  maxTitleLength: 120,
  maxBodyLength: 500,
  maxMessageTotalBytes: 4096,
  maxDeviceLabelLength: 80,
} as const;

const WIRE_PREFIXES = new Set(["https:", "http:"]);

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return WIRE_PREFIXES.has(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Validates a browser push subscription object. Never trusts implicit shapes:
 * endpoint must be an http(s) URL within a sane length, both keys must be
 * non-empty base64url-ish strings within length limits, and the serialized
 * payload must stay under the browser push message ceiling.
 */
export function validateWebPushSubscription(sub: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!sub || typeof sub !== "object") {
    return { ok: false, errors: ["subscription must be an object"] };
  }
  const s = sub as Record<string, unknown>;
  const endpoint = typeof s.endpoint === "string" ? s.endpoint : "";
  if (!endpoint || endpoint.length > PUSH_LIMITS.maxEndpointLength) {
    errors.push("endpoint is missing or too long");
  } else if (!isHttpUrl(endpoint)) {
    errors.push("endpoint must be an http(s) URL");
  }
  const keys = (s.keys || {}) as Record<string, unknown>;
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (!p256dh || p256dh.length > PUSH_LIMITS.maxKeyLength) {
    errors.push("keys.p256dh is missing or too long");
  }
  if (!auth || auth.length > PUSH_LIMITS.maxKeyLength) {
    errors.push("keys.auth is missing or too long");
  }
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(sub));
    if (bytes.length > PUSH_LIMITS.maxMessageTotalBytes) {
      errors.push("subscription payload is too large");
    }
  } catch {
    errors.push("subscription payload is not serializable");
  }
  return { ok: errors.length === 0, errors };
}

/** Safe public projection of a stored subscription. */
export function maskSubscription(record: PushSubscriptionRecord): MaskedPushSubscription {
  return {
    endpointHash: record.endpointHash,
    endpoint: record.endpoint,
    preferences: record.preferences,
    enabled: record.enabled,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSuccessfulDeliveryAt: record.lastSuccessfulDeliveryAt,
    deviceLabel: record.deviceLabel,
  };
}

/**
 * Preference filtering: a subscription only receives a notification when the
 * matching preference is enabled AND the master switch is on. Missing or
 * malformed preference maps fall back to the safe default (all on), matching
 * the upgrade path for older rows.
 */
export function filterSubscriptionsByType(
  subscriptions: PushSubscriptionRecord[],
  type: NotificationType,
): PushSubscriptionRecord[] {
  const preference = NOTIFICATION_TYPE_PREFERENCE[type];
  return subscriptions.filter((sub) => {
    if (!sub || !sub.enabled) return false;
    const prefs = sub.preferences && typeof sub.preferences === "object" ? sub.preferences : DEFAULT_PREFERENCES;
    return prefs[preference] !== false;
  });
}

/** Strips control characters, HTML tags and executable/fragment patterns. */
export function sanitizeNotificationText(value: unknown, maxLength: number): string {
  const raw = typeof value === "string" ? value : "";
  let clean = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .trim();
  if (clean.length > maxLength) clean = clean.slice(0, maxLength).trim();
  return clean;
}

const BOOLEAN_PREFERENCES_PICKED = new Set([
  "newMovies",
  "newTrailers",
  "announcements",
]);

/** Coerces an unknown preferences blob into a safe, complete preferences map. */
export function sanitizePreferences(value: unknown): PushPreferences {
  const prefs: PushPreferences = { ...DEFAULT_PREFERENCES };
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    for (const key of PUSH_PREFERENCE_KEYS) {
      if (BOOLEAN_PREFERENCES_PICKED.has(key) && typeof raw[key] === "boolean") {
        prefs[key] = raw[key] as boolean;
      }
    }
  }
  return prefs;
}

/**
 * Builds the fully safe NotificationOptions for the service worker. Every
 * value is defensive: Kurdish RTL defaults, the verified PWA icon paths, an
 * appropriate monochrome badge, a vibration pattern and a renotify tag.
 */
export const PUSH_ICON_URL = "/pwa/icon-192.png";
export const PUSH_BADGE_URL = "/pwa/maskable-512.png";
export const PUSH_DEFAULT_TITLE = "سینەما چات";
export const PUSH_DEFAULT_BODY = "نۆتیفیکەیشنێکی نوێ هەیە";

export function buildPushNotificationOptions(payload: unknown): {
  title: string;
  body: string;
  data: { url?: string };
  options: NotificationOptions;
} {
  const data =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const title = sanitizeNotificationText(data.title, PUSH_LIMITS.maxTitleLength) || PUSH_DEFAULT_TITLE;
  const body = sanitizeNotificationText(data.body, PUSH_LIMITS.maxBodyLength) || PUSH_DEFAULT_BODY;
  const rawUrl = typeof data.url === "string" ? data.url : "";
  const origin = typeof self !== "undefined" && self?.location?.origin ? self.location.origin : "";
  const safeUrl = resolveSafeNotificationUrl(rawUrl, origin);
  const rawOptions = {
    dir: "rtl",
    lang: "ckb",
    icon: PUSH_ICON_URL,
    badge: PUSH_BADGE_URL,
    vibrate: [200, 100, 200],
    renotify: true,
    tag: `cinemachat:${typeof data.tag === "string" ? data.tag : "default"}`,
    data: { url: rawUrl, fallbackUrl: safeUrl },
    actions: [
      { action: "open", title: "کردنەوە" },
      { action: "close", title: "داخستن" },
    ],
  } as const;
  // This TS lib's NotificationOptions omits vibrate/actions; they are valid
  // under the notification spec and honored by all supporting browsers.
  const options = rawOptions as unknown as NotificationOptions;
  return { title, body, data: { url: rawUrl }, options };
}

/**
 * Returns a URL that is guaranteed to stay on the CinemaChat origin. The raw
 * push payload is attacker-controllable, so arbitrary schemes/hosts must never
 * be opened from a notification click.
 */
export function resolveSafeNotificationUrl(rawUrl: unknown, origin: string): string {
  const root = origin && !origin.endsWith("/") ? `${origin}/` : origin || "/";
  if (typeof rawUrl !== "string" || !rawUrl) return root;
  const trimmed = rawUrl.trim();
  // Same-origin relative path (single leading slash, no backslashes, no "..").
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    const normalized = trimmed.replace(/\\/g, "/");
    if (normalized.split("/").includes("..")) return root;
    if (root.length > 1) {
      // Resolve to an absolute same-origin URL so the SW can hand it straight
      // to openWindow/navigate without reinterpreting a loose path.
      const base = root.endsWith("/") ? root.slice(0, -1) : root;
      return `${base}/${normalized.replace(/^\/+/, "")}`;
    }
    return normalized;
  }
  // Only https absolute URLs on exactly this origin are acceptable.
  try {
    const url = new URL(trimmed);
    const originUrl = new URL(root);
    if (url.protocol !== "https:" || url.origin !== originUrl.origin) return root;
    return url.href;
  } catch {
    return root;
  }
}

/** Tracks every discrete push state the bell can be in (UI contract). */
export type BellState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied"
  | "subscribed"
  | "busy";

export interface BellStateInput {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  busy: boolean;
  iOSInstalledPwa?: boolean;
}

/** Pure state machine for the bell button — mirrors the required UI states. */
export function deriveBellState(input: BellStateInput): BellState {
  if (!input.supported) return "unsupported";
  if (input.busy) return "busy";
  if (input.permission === "denied") return "denied";
  if (input.permission === "granted") return input.subscribed ? "subscribed" : "granted";
  return "default";
}

const BASE64_URL_REGEX = /^[A-Za-z0-9_-]+$/;

/** Whether a VAPID applicationServerKey is a valid base64url string. */
export function isUrlBase64(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && BASE64_URL_REGEX.test(value);
}

/**
 * Converts a base64url applicationServerKey into a Uint8Array for
 * `PushManager.subscribe({ applicationServerKey })`. No global btoa needed so
 * it also runs safely inside the service worker.
 */
export function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}