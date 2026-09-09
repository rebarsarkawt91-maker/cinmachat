/**
 * Unit tests for the in-memory push store (Firestore contract coverage).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryPushStore,
  FirestorePushStore,
  buildSubscriptionRecord,
  endpointHashOf,
  PushStoreError,
} from "./store";
import { DEFAULT_PREFERENCES, PUSH_LIMITS } from "../../src/lib/webPushShared";

function makeRecordInput(userId: string, endpoint: string, extra: Record<string, unknown> = {}) {
  return buildSubscriptionRecord({
    userId,
    endpoint,
    p256dh: `p256dh-${endpoint}`,
    auth: `auth-${endpoint}`,
    preferences: DEFAULT_PREFERENCES,
    deviceLabel: "Chrome/Windows",
    ...extra,
  });
}

test("buildSubscriptionRecord derives a deterministic endpoint hash id", () => {
  const record = makeRecordInput("u1", "https://push.example/endpoint-1");
  assert.equal(record.endpointHash, endpointHashOf("https://push.example/endpoint-1"));
  assert.equal(record.deviceLabel, "Chrome/Windows");
});

test("deviceLabel is bounded so it can never bloat the record", () => {
  const record = makeRecordInput("u1", "https://push.example/e", {
    deviceLabel: "x".repeat(PUSH_LIMITS.maxDeviceLabelLength + 200),
  });
  assert.ok(record.deviceLabel!.length <= PUSH_LIMITS.maxDeviceLabelLength);
});

test("upsert creates a record; re-upsert keeps the same doc id and updates", async () => {
  const store = new InMemoryPushStore();
  const first = await store.upsert(makeRecordInput("u1", "https://push.example/e1"));
  const second = await store.upsert(
    makeRecordInput("u1", "https://push.example/e1", { preferences: { ...DEFAULT_PREFERENCES, newMovies: false } }),
  );
  assert.equal(second.endpointHash, first.endpointHash);
  assert.equal((await store.getByEndpointHash(second.endpointHash))!.preferences.newMovies, false);
});

test("listByUser only returns the user's own records", async () => {
  const store = new InMemoryPushStore();
  await store.upsert(makeRecordInput("u1", "https://push.example/a"));
  await store.upsert(makeRecordInput("u2", "https://push.example/b"));
  await store.upsert(makeRecordInput("u1", "https://push.example/c"));
  const own = await store.listByUser("u1");
  assert.equal(own.length, 2);
  assert.ok(own.every((r) => r.userId === "u1"));
});

test("listAllEnabled excludes master-disabled subscriptions", async () => {
  const store = new InMemoryPushStore();
  const enabled = await store.upsert(makeRecordInput("u1", "https://push.example/e1"));
  const disabledRec = makeRecordInput("u1", "https://push.example/e2");
  disabledRec.enabled = false;
  await store.upsert(disabledRec);
  const all = await store.listAllEnabled();
  assert.ok(all.some((r) => r.endpointHash === enabled.endpointHash));
  assert.ok(all.every((r) => r.enabled === true));
});

test("preference and enable updates are ownership-scoped", async () => {
  const store = new InMemoryPushStore();
  const record = await store.upsert(makeRecordInput("u1", "https://push.example/e1"));
  const ok = await store.updatePreferencesForUser("u1", record.endpointHash, {
    newMovies: false,
    newTrailers: false,
    announcements: false,
  });
  assert.equal(ok, true);
  assert.equal((await store.getByEndpointHash(record.endpointHash))!.preferences.newMovies, false);
  const wrongOwner = await store.updatePreferencesForUser("u2", record.endpointHash, DEFAULT_PREFERENCES);
  assert.equal(wrongOwner, false);
  assert.equal(await store.setEnabledForUser("u2", record.endpointHash, true), false);
  assert.equal(await store.setEnabledForUser("u1", record.endpointHash, false), true);
});

test("delete only works for the owning user", async () => {
  const store = new InMemoryPushStore();
  const record = await store.upsert(makeRecordInput("u1", "https://push.example/e1"));
  assert.equal(await store.deleteByEndpointHashForUser("u2", record.endpointHash), false);
  assert.equal(await store.deleteByEndpointHashForUser("u1", record.endpointHash), true);
  assert.equal(await store.getByEndpointHash(record.endpointHash), null);
});

test("notification log dedupes per kind+id and evaluates to false by default", async () => {
  const store = new InMemoryPushStore();
  assert.equal(await store.hasNotified("newMovie", "movie-1"), false);
  await store.markNotified("newMovie", "movie-1", "Movie 1");
  assert.equal(await store.hasNotified("newMovie", "movie-1"), true);
  assert.equal(await store.hasNotified("newMovie", "movie-2"), false);
  assert.equal(await store.hasNotified("newTrailer", "movie-1"), false);
});

test("markDelivered records the delivery timestamp", async () => {
  const store = new InMemoryPushStore();
  const record = await store.upsert(makeRecordInput("u1", "https://push.example/e1"));
  await store.markDelivered(record.endpointHash);
  assert.ok((await store.getByEndpointHash(record.endpointHash))!.lastSuccessfulDeliveryAt);
});

test("FirestorePushStore degrades with a clear error when the app is missing", async () => {
  const store = new FirestorePushStore(() => null);
  await assert.rejects(() => store.listByUser("u1"), PushStoreError);
});