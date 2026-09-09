/**
 * Unit tests for PushService (real send path mocked, store in-memory).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PushService, PushServiceError } from "./service";
import { InMemoryPushStore, buildSubscriptionRecord } from "./store";
import { DEFAULT_PREFERENCES, type PushPreferences } from "../../src/lib/webPushShared";
import type { PushSender } from "./config";

// Real VAPID pair so web-push's setVapidDetails key validation passes (it
// requires a 65-byte decoded public key). Test-only values; the sender is
// mocked, so these keys are never used to sign a real push.
const READY_VAPID = {
  publicKey: "BJLQoXZ8p6Zd5OKeO2X-I1kYjAukVPYKb2g1y8Aqb473-HEo5fy73HTDRu4T5m2rgotO6s4_5c2nvXCFvQI7utE",
  privateKey: "Gvn-I9nBF7SA3S6AEP2a1ew61ZeY1Y_QLm4VxehkLnA",
  subject: "mailto:test@cinamachat.com",
  ready: true,
};

function makeContext() {
  const store = new InMemoryPushStore();
  const sent: Array<{ endpoint: string; payload: string }> = [];
  let failure: number | null = null;
  let statusCode = 201;
  const sender: PushSender = async (endpoint, _keys, payload) => {
    if (failure !== null) {
      const err: any = new Error("push failed");
      err.statusCode = failure;
      throw err;
    }
    sent.push({ endpoint, payload: String(payload) });
    return statusCode;
  };
  const svc = new PushService(store, READY_VAPID, sender);
  return { store, sent, svc, setFailure: (n: number | null) => (failure = n), setStatus: (n: number) => (statusCode = n) };
}

function seed(
  store: InMemoryPushStore,
  userId: string,
  endpoint: string,
  prefs?: Partial<PushPreferences>,
  enabled = true,
) {
  return store.upsert(
    buildSubscriptionRecord({
      userId,
      endpoint,
      p256dh: `p256-${endpoint}`,
      auth: `auth-${endpoint}`,
      preferences: prefs ? { ...DEFAULT_PREFERENCES, ...prefs } : DEFAULT_PREFERENCES,
      enabled,
      deviceLabel: "Test Device",
    }),
  );
}

describe("PushService", () => {
  test("ready and publicKey reflect the VAPID config", () => {
    const { svc } = makeContext();
    assert.equal(svc.ready, true);
    assert.equal(svc.publicKey, READY_VAPID.publicKey);
  });

  test("subscribe validates and stores the device subscription", async () => {
    const { store, svc } = makeContext();
    const masked = await svc.subscribe({
      userId: "u1",
      subscription: {
        endpoint: "https://push.example/e1",
        keys: { p256dh: "p256-1", auth: "auth-1" },
        expirationTime: null,
      },
      deviceLabel: "Safari/iPhone",
    });
    assert.equal(masked.endpoint, "https://push.example/e1");
    assert.equal("p256dh" in masked, false);
    assert.equal("auth" in masked, false);
    assert.equal(masked.deviceLabel, "Safari/iPhone");
    assert.equal((await store.listByUser("u1")).length, 1);
  });

  test("subscribe rejects malformed subscriptions with 400", async () => {
    const { svc } = makeContext();
    await assert.rejects(
      () => svc.subscribe({ userId: "u1", subscription: { endpoint: "nope" } }),
      (err: any) => err instanceof PushServiceError && err.status === 400,
    );
  });

  test("getUserSubscriptions only lists the caller's devices", async () => {
    const { store, svc } = makeContext();
    await store.upsert(
      buildSubscriptionRecord({ userId: "u1", endpoint: "https://push.example/me", p256dh: "k", auth: "a", preferences: DEFAULT_PREFERENCES, enabled: true }),
    );
    await store.upsert(
      buildSubscriptionRecord({ userId: "u2", endpoint: "https://push.example/other", p256dh: "k", auth: "a", preferences: DEFAULT_PREFERENCES, enabled: true }),
    );
    assert.equal((await svc.getUserSubscriptions("u1")).length, 1);
  });

  test("updatePreferences and setMasterEnabled are ownership-scoped", async () => {
    const { store, svc } = makeContext();
    const own = await seed(store, "u1", "https://push.example/prefme");
    await assert.rejects(
      () =>
        svc.updatePreferences("u3", own.endpoint, {
          newMovies: false,
          newTrailers: true,
          announcements: true,
        }),
      (err: any) => err instanceof PushServiceError && err.status === 404,
    );
    await svc.updatePreferences("u1", own.endpoint, {
      newMovies: false,
      newTrailers: true,
      announcements: true,
    });
    assert.equal((await store.getByEndpointHash(own.endpointHash))!.preferences.newMovies, false);
  });

  test("unsubscribe only removes an owned endpoint", async () => {
    const { store, svc } = makeContext();
    const own = await seed(store, "u1", "https://push.example/delete-me");
    await assert.rejects(
      () => svc.unsubscribe("u9", own.endpoint),
      (err: any) => err instanceof PushServiceError && err.status === 404,
    );
    await svc.unsubscribe("u1", own.endpoint);
    assert.equal(await store.getByEndpointHash(own.endpointHash), null);
  });

  test("send targets only enabled + opted-in subscribers", async () => {
    const { store, svc, sent } = makeContext();
    const a = await seed(store, "u1", "https://push.example/send-a");
    await seed(store, "u2", "https://push.example/send-b", undefined, false); // master off
    await seed(store, "u3", "https://push.example/send-c", {
      // opted out of movies
      newMovies: false,
      newTrailers: true,
      announcements: true,
    });
    await seed(store, "u4", "https://push.example/send-d"); // default: everything on

    const outcome = await svc.send({
      type: "newMovie",
      title: "فیلمی نوێ!",
      body: "Movie 1",
      url: "/",
    });
    assert.equal(outcome.recipients, 2); // a + d (b disabled, c opted out)
    assert.equal(outcome.delivered, 2);
    assert.equal(outcome.failed, 0);
    assert.equal(sent.length, 2);
    const payload = JSON.parse(sent[0].payload);
    assert.equal(payload.title, "فیلمی نوێ!");
    assert.equal(payload.tag, "cinemachat:newMovie");
    assert.ok((await store.getByEndpointHash(a.endpointHash))!.lastSuccessfulDeliveryAt);
  });

  test("send counts delivery failures and prunes 404/410 endpoints", async () => {
    const { store, svc, setFailure } = makeContext();
    await seed(store, "u1", "https://push.example/gone");

    setFailure(404);
    const notFoundOutcome = await svc.send({ type: "announcement", title: "ping", body: "gone ep" });
    assert.equal(notFoundOutcome.notFound, 1);
    assert.equal((await store.listAllEnabled()).length, 0);

    await seed(store, "u1", "https://push.example/flaky");
    setFailure(500);
    const failedOutcome = await svc.send({ type: "announcement", title: "ping", body: "failed ep" });
    assert.equal(failedOutcome.failed, 1);
    assert.equal((await store.listAllEnabled()).length, 1); // not pruned
  });

  test("notifyPublishedMovie sends once per movie id (idempotent)", async () => {
    const { store, svc, sent } = makeContext();
    await seed(store, "u1", "https://push.example/movie-fan");
    const first = await svc.notifyPublishedMovie({ id: "m-123", title: "براوە", type: "movie" });
    assert.equal(first!.recipients, 1);
    assert.equal(first!.duplicateSkipped, false);
    assert.equal(sent.length, 1);
    assert.match(JSON.parse(sent[0].payload).body, /براوە/);

    const second = await svc.notifyPublishedMovie({ id: "m-123", title: "براوە", type: "movie" });
    assert.equal(second!.recipients, 0);
    assert.equal(second!.duplicateSkipped, true);
    assert.equal(sent.length, 1); // never sent again
  });

  test("notifyPublishedMovie distinguishes trailers from movies", async () => {
    const { store, svc, sent } = makeContext();
    await seed(store, "u1", "https://push.example/trailer-fan");
    await svc.notifyPublishedMovie({ id: "t-1", title: "ترەیلەر", type: "trailer" });
    const payload = JSON.parse(sent[0].payload);
    assert.match(payload.title, /ترەیلەر/);
    assert.equal(payload.tag, "cinemachat:newTrailer");
    // The trailer kind never collides with the movie dedupe key space.
    await store.markNotified("newTrailer", "t-1", "x");
    assert.equal(await store.hasNotified("newMovie", "t-1"), false);
  });

  test("notifyPublishedMovie is a no-op when VAPID is not ready", async () => {
    const ctx = makeContext();
    const off = new PushService(ctx.store, { ...READY_VAPID, ready: false }, async () => 201);
    assert.equal(await off.notifyPublishedMovie({ id: "m-zz", title: "x" }), null);
  });

  test("sendAnnouncement rate limits an overactive admin", async () => {
    const { svc } = makeContext();
    for (let i = 0; i < 20; i++) {
      await svc.sendAnnouncement({ title: "عەلان", body: "b", adminName: "flooder", ip: "1.2.3.4" });
    }
    await assert.rejects(
      () => svc.sendAnnouncement({ title: "عەلان", body: "b", adminName: "flooder", ip: "1.2.3.4" }),
      (err: any) => err instanceof PushServiceError && err.status === 429,
    );
  });
});