/**
 * Unit tests for the shared pure Web Push helpers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateWebPushSubscription,
  maskSubscription,
  filterSubscriptionsByType,
  sanitizeNotificationText,
  sanitizePreferences,
  deriveBellState,
  isUrlBase64,
  urlB64ToUint8Array,
  resolveSafeNotificationUrl,
  buildPushNotificationOptions,
  DEFAULT_PREFERENCES,
  PUSH_LIMITS,
  type PushSubscriptionRecord,
  type PushPreferences,
} from "../../src/lib/webPushShared";

const VALID_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB_BBBB_", auth: "AAAA_AAAA" },
  expirationTime: null,
};

function makeRecord(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    userId: "user-1",
    endpoint: "https://push.example/endpoint-a",
    endpointHash: "hash-a",
    p256dh: "key-a",
    auth: "auth-a",
    preferences: { ...DEFAULT_PREFERENCES },
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("validateWebPushSubscription accepts a valid subscription", () => {
  const result = validateWebPushSubscription(VALID_SUB);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validateWebPushSubscription rejects missing/invalid keys", () => {
  assert.equal(validateWebPushSubscription({ endpoint: VALID_SUB.endpoint }).ok, false);
  assert.equal(validateWebPushSubscription({ ...VALID_SUB, keys: {} }).ok, false);
  assert.equal(validateWebPushSubscription({ ...VALID_SUB, endpoint: "ftp://bad" }).ok, false);
  assert.equal(validateWebPushSubscription(null).ok, false);
});

test("validateWebPushSubscription rejects oversized payloads and endpoints", () => {
  const huge = {
    endpoint: "https://example.com/" + "x".repeat(PUSH_LIMITS.maxEndpointLength + 1),
    keys: { p256dh: "a", auth: "b" },
  };
  assert.equal(validateWebPushSubscription(huge).ok, false);
});

test("maskSubscription strips sender keys but keeps safe state", () => {
  const masked = maskSubscription(makeRecord());
  assert.equal("p256dh" in masked, false);
  assert.equal("auth" in masked, false);
  assert.equal(masked.endpointHash, "hash-a");
  assert.equal(masked.endpoint, "https://push.example/endpoint-a");
  assert.equal(masked.preferences.newMovies, true);
  assert.equal(masked.enabled, true);
});

test("filterSubscriptionsByType respects enabled + per-type preferences", () => {
  const rows = [
    makeRecord({ endpointHash: "a", endpoint: "https://push.example/a" }),
    makeRecord({ endpointHash: "b", endpoint: "https://push.example/b", enabled: false }),
    makeRecord({
      endpointHash: "c",
      endpoint: "https://push.example/c",
      preferences: { newMovies: false, newTrailers: true, announcements: true },
    }),
  ];
  const movies = filterSubscriptionsByType(rows, "newMovie");
  assert.deepEqual(movies.map((r) => r.endpointHash), ["a"]);
  const trailers = filterSubscriptionsByType(rows, "newTrailer");
  assert.deepEqual(trailers.map((r) => r.endpointHash), ["a", "c"]);
  const announcements = filterSubscriptionsByType(rows, "announcement");
  assert.deepEqual(announcements.map((r) => r.endpointHash), ["a", "c"]);
});

test("sanitizeNotificationText strips HTML, trims and truncates", () => {
  assert.equal(sanitizeNotificationText("<b>Hi</b><script>alert(1)</script>", 120), "Hi");
  assert.equal(sanitizeNotificationText("   سلام   ", 120), "سلام");
  assert.equal(sanitizeNotificationText("x".repeat(500), 120).length, 120);
  assert.equal(sanitizeNotificationText(12345, 120), "");
  assert.equal(sanitizeNotificationText(null, 120), "");
});

test("sanitizePreferences whitelists keys and coerces booleans", () => {
  const clean = sanitizePreferences({ newMovies: 1, newTrailers: false, evil: true, announcements: "yes" } as unknown);
  assert.deepEqual(clean, { newMovies: true, newTrailers: false, announcements: true });
  const empty: PushPreferences = sanitizePreferences({});
  assert.deepEqual(empty, { newMovies: true, newTrailers: true, announcements: true });
});

test("deriveBellState covers the full UI contract", () => {
  const base = { supported: true, permission: "default" as const, subscribed: false, busy: false };
  assert.equal(deriveBellState({ ...base, supported: false }), "unsupported");
  assert.equal(deriveBellState({ ...base, busy: true }), "busy");
  assert.equal(deriveBellState({ ...base, permission: "denied" }), "denied");
  assert.equal(deriveBellState({ ...base }), "default");
  assert.equal(deriveBellState({ ...base, permission: "granted" }), "granted");
  assert.equal(deriveBellState({ ...base, permission: "granted", subscribed: true }), "subscribed");
});

test("VAPID helpers: isUrlBase64 and urlB64ToUint8Array round-trip", () => {
  assert.equal(isUrlBase64("abc_XYZ-0123456789"), true);
  assert.equal(isUrlBase64("has spaces"), false);
  assert.equal(isUrlBase64(""), false);
  assert.equal(isUrlBase64(null), false);
  const bytes = urlB64ToUint8Array("QUJD");
  assert.deepEqual(Array.from(bytes), [0x41, 0x42, 0x43]);
});

test("resolveSafeNotificationUrl never returns a foreign origin", () => {
  const origin = "https://www.cinamachat.com";
  assert.equal(resolveSafeNotificationUrl("/", origin), `${origin}/`);
  assert.equal(resolveSafeNotificationUrl("/movie/abc?lang=ckb", origin), `${origin}/movie/abc?lang=ckb`);
  assert.equal(resolveSafeNotificationUrl("https://www.cinamachat.com/detail/1", origin), "https://www.cinamachat.com/detail/1");
  // Every hostile input collapses to the app root.
  assert.equal(resolveSafeNotificationUrl("https://evil.example.com/x", origin), `${origin}/`);
  assert.equal(resolveSafeNotificationUrl("javascript:alert(1)", origin), `${origin}/`);
  assert.equal(resolveSafeNotificationUrl("../secret", origin), `${origin}/`);
  assert.equal(resolveSafeNotificationUrl("//evil.example.com", origin), `${origin}/`);
  assert.equal(resolveSafeNotificationUrl("", origin), `${origin}/`);
  assert.equal(resolveSafeNotificationUrl(undefined, origin), `${origin}/`);
});

test("buildPushNotificationOptions produces RTL Kurdish options with safe URLs", () => {
  const built = buildPushNotificationOptions({
    title: "🎬 فیلمی نوێ!",
    body: "<b>Test</b> body",
    url: "https://evil.example.com/fish",
    tag: "newMovie",
  });
  assert.equal(built.title, "🎬 فیلمی نوێ!");
  assert.equal(built.options.dir, "rtl");
  assert.equal(built.options.lang, "ckb");
  assert.equal(built.options.icon, "/pwa/icon-192.png");
  assert.equal(built.options.badge, "/pwa/maskable-512.png");
  assert.deepEqual((built.options as any).actions?.map((a: { action: string }) => a.action), ["open", "close"]);
  // Under Node there is no `self` origin, so the safe fallback resolves to "/".
  assert.equal((built.options.data as any).fallbackUrl, "/");
});