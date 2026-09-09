/**
 * Integration-ish tests for the push HTTP routes (real express app + fetch).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Express } from "express";
import { registerPushRoutes } from "./routes";
import { PushService } from "./service";
import { InMemoryPushStore, buildSubscriptionRecord } from "./store";
import { DEFAULT_PREFERENCES } from "../../src/lib/webPushShared";

const VALID_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB_BBBB_", auth: "AAAA_AAAA" },
  expirationTime: null,
};

const sender = async () => 201;

interface TestCluster {
  baseUrl: string;
  store: InMemoryPushStore;
  svc: PushService;
  close: () => Promise<void>;
}

async function startCluster(ready = true): Promise<TestCluster> {
  const store = new InMemoryPushStore();
  const vapid = {
    publicKey: ready
      ? "BJLQoXZ8p6Zd5OKeO2X-I1kYjAukVPYKb2g1y8Aqb473-HEo5fy73HTDRu4T5m2rgotO6s4_5c2nvXCFvQI7utE"
      : "",
    privateKey: ready ? "Gvn-I9nBF7SA3S6AEP2a1ew61ZeY1Y_QLm4VxehkLnA" : "",
    subject: "mailto:test@cinamachat.com",
    ready,
  };
  const svc = new PushService(store, vapid, sender);
  const verifyToken = async (authorization: string | undefined): Promise<string> => {
    if (!authorization || authorization === "Bearer bad") {
      const err: any = new Error("invalid token");
      err.status = 401;
      throw err;
    }
    return "user-1";
  };
  const app: Express = express();
  app.use(express.json());
  // Minimal stand-in for the real global admin guard (sets adminUsername).
  app.post("/api/admin/*", (req, _res, next) => {
    (req as any).adminUsername = String((req.body as any)?.adminName || "admin-test");
    next();
  });
  registerPushRoutes(app, { pushService: svc, verifyToken });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseUrl,
    store,
    svc,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/** Always tears the server down, even when the test body throws. */
async function withCluster(fn: (cluster: TestCluster) => Promise<void>, ready = true) {
  const cluster = await startCluster(ready);
  try {
    await fn(cluster);
  } finally {
    await cluster.close();
  }
}

async function request(baseUrl: string, method: string, path: string, body?: unknown, token = "ok") {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test("GET /api/push/vapid-public-key returns the public key; 503 when not ready", async () => {
  await withCluster(async (cluster) => {
    const ok = await request(cluster.baseUrl, "GET", "/api/push/vapid-public-key");
    assert.equal(ok.status, 200);
    assert.equal(ok.data.publicKey, cluster.svc.publicKey);
  });
  await withCluster(async (cluster) => {
    const notReady = await request(cluster.baseUrl, "GET", "/api/push/vapid-public-key");
    assert.equal(notReady.status, 503);
  }, false);
});

test("POST /api/push/subscribe requires a valid bearer token", async () => {
  await withCluster(async (cluster) => {
    const noToken = await request(cluster.baseUrl, "POST", "/api/push/subscribe", { subscription: VALID_SUB }, "");
    assert.equal(noToken.status, 401);
    const badToken = await request(cluster.baseUrl, "POST", "/api/push/subscribe", { subscription: VALID_SUB }, "bad");
    assert.equal(badToken.status, 401);
  });
});

test("POST /api/push/subscribe stores the device and never leaks keys", async () => {
  await withCluster(async (cluster) => {
    const res = await request(cluster.baseUrl, "POST", "/api/push/subscribe", {
      subscription: VALID_SUB,
      deviceLabel: "Chrome/Windows <img src=x>",
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal("p256dh" in res.data.subscription, false);
    assert.equal("auth" in res.data.subscription, false);
    assert.equal(res.data.subscription.deviceLabel, "Chrome/Windows");
  });
});

test("POST /api/push/subscribe rejects an invalid subscription", async () => {
  await withCluster(async (cluster) => {
    const res = await request(cluster.baseUrl, "POST", "/api/push/subscribe", {
      subscription: { endpoint: "ftp://x" },
    });
    assert.equal(res.status, 400);
  });
});

test("GET /api/push/subscriptions lists only the caller's devices (masked)", async () => {
  await withCluster(async (cluster) => {
    await cluster.store.upsert(
      buildSubscriptionRecord({
        userId: "user-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/listed",
        p256dh: "key",
        auth: "auth",
        preferences: DEFAULT_PREFERENCES,
        enabled: true,
      }),
    );
    const res = await request(cluster.baseUrl, "GET", "/api/push/subscriptions");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.subscriptions));
    assert.ok(res.data.subscriptions.every((s: any) => !("p256dh" in s) && !("auth" in s)));
  });
});

test("PATCH /api/push/preferences updates preferences; 404 for unknown", async () => {
  await withCluster(async (cluster) => {
    const rec = await cluster.store.upsert(
      buildSubscriptionRecord({
        userId: "user-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/pref-endpoint",
        p256dh: "key",
        auth: "auth",
        preferences: DEFAULT_PREFERENCES,
        enabled: true,
      }),
    );
    const ok = await request(cluster.baseUrl, "PATCH", "/api/push/preferences", {
      endpoint: rec.endpoint,
      preferences: { newMovies: false, newTrailers: true, announcements: false },
    });
    assert.equal(ok.status, 200);
    assert.equal((await cluster.store.getByEndpointHash(rec.endpointHash))!.preferences.newMovies, false);

    const missing = await request(cluster.baseUrl, "PATCH", "/api/push/preferences", {
      endpoint: "https://fcm.googleapis.com/fcm/send/nope",
      preferences: { newMovies: true, newTrailers: true, announcements: true },
    });
    assert.equal(missing.status, 404);
  });
});

test("PATCH /api/push/preferences supports the master enable switch", async () => {
  await withCluster(async (cluster) => {
    const rec = await cluster.store.upsert(
      buildSubscriptionRecord({
        userId: "user-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/master-endpoint",
        p256dh: "key",
        auth: "auth",
        preferences: DEFAULT_PREFERENCES,
        enabled: true,
      }),
    );
    const res = await request(cluster.baseUrl, "PATCH", "/api/push/preferences", {
      endpoint: rec.endpoint,
      masterEnabled: false,
    });
    assert.equal(res.status, 200);
    assert.equal((await cluster.store.getByEndpointHash(rec.endpointHash))!.enabled, false);
  });
});

test("DELETE /api/push/unsubscribe removes an owned endpoint", async () => {
  await withCluster(async (cluster) => {
    const rec = await cluster.store.upsert(
      buildSubscriptionRecord({
        userId: "user-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/delete-endpoint",
        p256dh: "key",
        auth: "auth",
        preferences: DEFAULT_PREFERENCES,
        enabled: true,
      }),
    );
    const res = await request(cluster.baseUrl, "DELETE", "/api/push/unsubscribe", { endpoint: rec.endpoint });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(await cluster.store.getByEndpointHash(rec.endpointHash), null);
  });
});

test("POST /api/admin/push/send validates title/body/type/url", async () => {
  await withCluster(async (cluster) => {
    const send = (body: Record<string, unknown>) => request(cluster.baseUrl, "POST", "/api/admin/push/send", body);
    assert.equal((await send({ body: "hello" })).status, 400);
    assert.equal((await send({ title: "hello" })).status, 400);
    assert.equal((await send({ title: "t", body: "b", notificationType: "newMovie" })).status, 400);
    assert.equal((await send({ title: "t", body: "b", url: "javascript:alert(1)" })).status, 400);
    assert.equal((await send({ title: "t", body: "b", url: "https://evil.example.com/x" })).status, 400);
  });
});

test("POST /api/admin/push/send broadcasts to enabled announcement subscribers", async () => {
  await withCluster(async (cluster) => {
    await cluster.store.upsert(
      buildSubscriptionRecord({
        userId: "u-a",
        endpoint: "https://fcm.googleapis.com/fcm/send/broadcast-a",
        p256dh: "key-a",
        auth: "auth-a",
        preferences: DEFAULT_PREFERENCES,
        enabled: true,
      }),
    );
    const res = await request(cluster.baseUrl, "POST", "/api/admin/push/send", {
      title: "تاقیکردنەوە",
      body: "ئاگاداری تایبەت",
      adminName: "admin-test",
      url: "/privacy-policy",
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.outcome.recipients, 1);
    assert.equal(res.data.outcome.delivered, 1);
    assert.equal(res.data.outcome.type, "announcement");
  });
});

test("POST /api/admin/push/send is rate-limited", async () => {
  // A fresh admin identity floods 21 sends inside the rolling hour window; the
  // service rejects the excess with 429 while allowing the first batch.
  await withCluster(async (cluster) => {
    const results: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await request(cluster.baseUrl, "POST", "/api/admin/push/send", {
        title: `عەلان #${i}`,
        body: "body",
        adminName: "flooder",
        url: "/",
      });
      results.push(res.status);
    }
    assert.ok(results.filter((s) => s === 429).length >= 1);
  });
});