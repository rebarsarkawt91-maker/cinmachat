import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { getApps, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createStudioAdminSessions } from "../../studioAdminSession";
import { sanitizationMiddleware } from "../../security";
import { createConnectedSocialAdapters } from "./adapters";
import { createSocialAccountProviders, type SocialAccountProviders } from "./connectionProviders";
import { preserveSocialConnectionInput, registerSocialConnectionRoutes, registerSocialOAuthCallback } from "./connectionRoutes";
import { FirestoreSocialConnectionStore, SOCIAL_CONNECTIONS_COLLECTION, type SocialConnectionStore, type StoredPlatformConnection } from "./connectionStore";
import { SocialConnections } from "./connections";
import type { OAuthPlatform } from "./connectionTypes";
import type { SocialPlatform } from "./types";

const ORIGIN = "https://www.cinamachat.com";
const ADMIN = "/api/admin/social-connections";
const CALLBACK = "/api/social-connections/oauth";
const ID = "UCabcdefghi--lmnopqrstuvw".slice(0, 24);
const KEY = Buffer.alloc(32, 42).toString("base64");
const BOT_TOKEN = `123456:${"t".repeat(22)}--${"Z".repeat(10)}`;
const PAGE_TOKEN = "synthetic-page-access-token-do-not-return";
const REFRESH_TOKEN = "synthetic-google-refresh-token-do-not-return";
const ENV = { META_APP_ID: "12345", META_APP_SECRET: "fixture-meta-only", YOUTUBE_CLIENT_ID: "test.apps.googleusercontent.com", YOUTUBE_CLIENT_SECRET: "fixture-youtube-only" };
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

class MemoryStore implements SocialConnectionStore {
  readonly values = new Map<SocialPlatform, StoredPlatformConnection>();
  isAvailable() { return true; }
  async read(platform: SocialPlatform) { return structuredClone(this.values.get(platform) || { account: null, flow: null }); }
  async update<T>(platform: SocialPlatform, change: (value: StoredPlatformConnection) => { next: StoredPlatformConnection; result: T }): Promise<T> {
    const { next, result } = change(structuredClone(this.values.get(platform) || { account: null, flow: null }));
    this.values.set(platform, structuredClone(next));
    return result;
  }
}

function providerFixture(options: { telegramPermission?: boolean; extraGoogleChannels?: boolean; grantError?: boolean; missingMetaPermission?: boolean } = {}) {
  const calls: URL[] = [];
  let googleVerifier = "";
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.equal(init?.redirect, "error");
    assert.doesNotMatch(url.pathname, /\/(sendMessage|sendVideo|sendPhoto|feed|media_publish|videos)$/);
    if (url.host === "graph.facebook.com") {
      if (url.pathname.endsWith("/oauth/access_token")) {
        assert.equal(url.searchParams.get("client_secret"), ENV.META_APP_SECRET);
        return Response.json({ access_token: url.searchParams.has("fb_exchange_token") ? "test-long-lived" : "test-short-lived" });
      }
      if (url.pathname.endsWith("/debug_token")) {
        assert.equal(url.searchParams.get("input_token"), PAGE_TOKEN);
        assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${ENV.META_APP_ID}|${ENV.META_APP_SECRET}`);
        return Response.json({ data: { is_valid: true, app_id: ENV.META_APP_ID, scopes: ["pages_manage_posts", "instagram_content_publish"] } });
      }
      assert.match(url.searchParams.get("appsecret_proof") || "", /^[0-9a-f]{64}$/);
      if (url.pathname.endsWith("/me/permissions")) {
        const names = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"];
        return Response.json({ data: names.filter(name => !(options.missingMetaPermission && name === "instagram_content_publish")).map(permission => ({ permission, status: "granted" })) });
      }
      if (url.pathname.endsWith("/me/accounts")) {
        return Response.json({ data: [
          { id: "1111", name: "Public page without publishing rights", access_token: "viewer-token", tasks: ["ANALYZE"] },
          { id: "2222", name: "Cinema test page", access_token: PAGE_TOKEN, tasks: ["CREATE_CONTENT"], instagram_business_account: { id: "3333", username: "cinama_synthetic" } },
          { id: "4444", name: "Another test page", access_token: "other-page-token", tasks: ["PROFILE_PLUS_CREATE_CONTENT"] },
        ] });
      }
      if (url.pathname.endsWith("/3333")) return Response.json({ id: "3333", username: "cinama_synthetic" });
      if (url.pathname.endsWith("/2222")) return Response.json({ id: "2222", name: "Cinema test page" });
    }
    if (url.host === "oauth2.googleapis.com") {
      const params = init?.body as URLSearchParams;
      assert.equal(params.get("client_secret"), ENV.YOUTUBE_CLIENT_SECRET);
      if (params.get("grant_type") === "refresh_token") {
        assert.equal(params.get("refresh_token"), REFRESH_TOKEN);
        if (options.grantError) return Response.json({ error: "invalid_grant", description: "fixture-refused-secret" }, { status: 400 });
      } else {
        googleVerifier = params.get("code_verifier") || "";
        assert.equal(params.get("code"), "fixture/YouTube-code--1");
        assert.equal(params.get("redirect_uri"), `${ORIGIN}${CALLBACK}/youtube`);
      }
      return Response.json({ access_token: "fixture-only-youtube-short", refresh_token: REFRESH_TOKEN, scope: GOOGLE_SCOPES });
    }
    if (url.host === "www.googleapis.com" && url.pathname === "/youtube/v3/channels") {
      assert.equal(url.searchParams.get("mine"), "true");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-only-youtube-short");
      return Response.json({ items: [{ id: ID, snippet: { title: "Cinema test channel" } }, ...(options.extraGoogleChannels ? [{ id: `UC${"A".repeat(22)}` }] : [])] });
    }
    if (url.host === "api.telegram.org") {
      assert.ok(url.pathname.startsWith(`/bot${BOT_TOKEN}/`));
      const method = url.pathname.split("/").at(-1);
      const body = JSON.parse(String(init?.body));
      if (method === "getMe") return Response.json({ ok: true, result: { id: 123456, is_bot: true } });
      if (method === "getChat") {
        assert.ok(body.chat_id === "@Cinema_test_channel" || body.chat_id === -1001234567890);
        return Response.json({ ok: true, result: { id: -1001234567890, type: "channel", username: "Cinema_test_channel", title: "Telegram synthetic channel" } });
      }
      if (method === "getChatMember") {
        assert.deepEqual(body, { chat_id: -1001234567890, user_id: 123456 });
        return Response.json({ ok: true, result: { status: "administrator", can_post_messages: options.telegramPermission !== false } });
      }
    }
    throw new Error(`Unexpected fixture request to ${url.host}`);
  };
  return {
    providers: createSocialAccountProviders({ env: ENV, origin: ORIGIN, outboundAllowed: true, fetcher }),
    calls, verifier: () => googleVerifier,
  };
}

function fromStore(store: SocialConnectionStore, providers: SocialAccountProviders, now?: () => number, key = KEY) {
  return new SocialConnections({ origin: ORIGIN, encryptionKey: key, providers, store, now });
}

async function signedHttpFixture(service: SocialConnections) {
  const app = express();
  app.use(express.json({ type: ["application/json", "text/plain"] }));
  const observedCallbackUrls: string[] = [];
  registerSocialOAuthCallback(app, service, (request, _response, next) => { observedCallbackUrls.push(request.url); next(); });
  app.use(preserveSocialConnectionInput, sanitizationMiddleware);
  const sessions = createStudioAdminSessions("fixture-only-studio-session-key");
  const credentials: Record<string, string> = { owner: "owner-synthetic-password-hash", deputy: "deputy-synthetic-password-hash" };
  registerSocialConnectionRoutes(app, {
    service,
    resolveAdmin(request) {
      const token = request.get("Cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith("studio="))?.slice(7) || "";
      const user = sessions.verify(token, username => credentials[username] || null);
      return user && request.get("X-Admin-Username") === user ? user : null;
    },
    isOwner: username => username === "owner",
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture needs a TCP port");
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base, observedCallbackUrls,
    request(path: string, method = "GET", body?: unknown, username = "owner", origin = ORIGIN) {
      const credential = credentials[username];
      return fetch(`${base}${path}`, {
        method,
        headers: {
          "X-Admin-Username": username, Origin: origin,
          ...(credential ? { Cookie: `studio=${sessions.issue(username, credential)}` } : {}),
          ...(body ? { "Content-Type": "text/plain" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    },
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}

test("Facebook callback needs state and browser proof, is one-use, and only the signed owner can save or disconnect", async () => {
  const store = new MemoryStore();
  const { providers, calls } = providerFixture();
  const service = fromStore(store, providers);
  const http = await signedHttpFixture(service);
  try {
    assert.equal((await fetch(`${http.base}${ADMIN}`, { headers: { "X-Admin-Username": "owner", Cookie: "studio=invalid" } })).status, 401);
    assert.equal((await http.request(ADMIN, "GET", undefined, "deputy")).status, 200);
    assert.equal((await http.request(`${ADMIN}/oauth/facebook/start`, "POST", undefined, "deputy")).status, 403);
    assert.equal((await http.request(`${ADMIN}/oauth/facebook/start`, "POST", undefined, "owner", "https://elsewhere.test")).status, 403);
    const begin = await http.request(`${ADMIN}/oauth/facebook/start`, "POST");
    const cookie = begin.headers.get("Set-Cookie") || "";
    assert.match(cookie, /__Secure-cc_social_facebook=/);
    assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/i);
    const start = await begin.json();
    assert.deepEqual(Object.keys(start).sort(), ["authorizationUrl", "success"]);
    const official = new URL(start.authorizationUrl);
    assert.equal(official.origin, "https://www.facebook.com");
    assert.equal(official.searchParams.get("redirect_uri"), `${ORIGIN}${CALLBACK}/facebook`);
    const state = official.searchParams.get("state") || "";
    const callback = (proof: string, stateValue: string) => fetch(`${http.base}${CALLBACK}/facebook?${new URLSearchParams({ state: stateValue, code: "synthetic-code-never-log" })}`, { headers: { Cookie: proof }, redirect: "manual" });
    assert.match((await callback("", state)).headers.get("Location") || "", /status=failed$/);
    const proof = cookie.split(";")[0];
    assert.match((await callback(proof, "invalid-state")).headers.get("Location") || "", /status=failed$/);
    assert.equal(calls.length, 0);
    assert.match((await callback(proof, state)).headers.get("Location") || "", /status=ready$/);
    const count = calls.length;
    assert.match((await callback(proof, state)).headers.get("Location") || "", /status=failed$/);
    assert.equal(calls.length, count);
    assert.ok(http.observedCallbackUrls.every(url => url === `${CALLBACK}/facebook`));

    const deputy = await (await http.request(ADMIN, "GET", undefined, "deputy")).json();
    assert.equal(deputy.connections.platforms.facebook.flow, undefined);
    const json = await (await http.request(ADMIN)).text();
    assert.doesNotMatch(json, /synthetic-page-access-token|test-long-lived|sealed|browserProof/i);
    const flow = JSON.parse(json).connections.platforms.facebook.flow;
    assert.deepEqual(flow.choices.map((choice: { id: string }) => choice.id), ["2222", "4444"]);
    assert.equal((await http.request(`${ADMIN}/oauth/facebook/select`, "POST", { flowId: flow.id, accountId: "1111" })).status, 422);
    assert.equal((await http.request(`${ADMIN}/oauth/facebook/select`, "POST", { flowId: flow.id, accountId: "2222" })).status, 200);
    assert.equal((await http.request(`${ADMIN}/oauth/facebook/select`, "POST", { flowId: flow.id, accountId: "2222" })).status, 409);
    assert.doesNotMatch(JSON.stringify(await store.read("facebook")), /Cinema test page|synthetic-page-access-token/);
    const restarted = fromStore(store, providers);
    assert.equal((await restarted.overview(null)).platforms.facebook.account?.name, "Cinema test page");
    assert.equal((await restarted.activeAccounts()).facebook?.token, PAGE_TOKEN);
    assert.equal((await http.request(`${ADMIN}/facebook`, "DELETE", undefined, "deputy")).status, 403);
    assert.equal((await http.request(`${ADMIN}/facebook`, "DELETE")).status, 200);
    assert.equal((await restarted.overview(null)).platforms.facebook.account, null);
    assert.equal((await restarted.activeAccounts()).facebook, undefined);
  } finally {
    await http.close();
  }
});

async function consent(service: SocialConnections, platform: OAuthPlatform, code: string | null = "demo-code") {
  const flow = await service.start(platform, "owner");
  const state = new URL(flow.authorizationUrl).searchParams.get("state")!;
  return service.callback(platform, state, flow.browserProof, code);
}

test("Instagram only offers professional accounts tied to an authorized Page, and validates missing scope", async () => {
  const store = new MemoryStore();
  const svc = fromStore(store, providerFixture().providers);
  assert.equal(await consent(svc, "instagram"), "ready");
  const flow = (await svc.overview("owner")).platforms.instagram.flow!;
  assert.deepEqual(flow.choices, [{ id: "3333", name: "@cinama_synthetic", handle: "@cinama_synthetic" }]);
  await svc.select("instagram", "owner", flow.id, "3333");
  assert.equal((await svc.verify("instagram")).needsReconnect, false);

  const blocked = fromStore(new MemoryStore(), providerFixture({ missingMetaPermission: true }).providers);
  assert.equal(await consent(blocked, "instagram"), "failed");
  assert.equal((await blocked.overview("owner")).platforms.instagram.flow?.errorCode, "missing_permissions");
});

test("YouTube compares PKCE with the redeemed code, saves an offline grant, and asks to reauthorize a revoked token", async () => {
  assert.match(ID, /^UC[A-Za-z0-9_-]{22}$/);
  const store = new MemoryStore();
  const fixture = providerFixture();
  const service = fromStore(store, fixture.providers);
  const start = await service.start("youtube", "owner");
  const url = new URL(start.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(await service.callback("youtube", url.searchParams.get("state")!, start.browserProof, "fixture/YouTube-code--1"), "ready");
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(fixture.verifier()).digest("base64url"));
  const flow = (await service.overview("owner")).platforms.youtube.flow!;
  const routes = await signedHttpFixture(service);
  try {
    // The whole ID, including double dashes, survives the existing app sanitizer.
    assert.equal((await routes.request(`${ADMIN}/oauth/youtube/select`, "POST", { flowId: flow.id, accountId: ID })).status, 200);
  } finally {
    await routes.close();
  }
  assert.equal((await service.verify("youtube")).id, ID);
  assert.equal((await service.activeAccounts()).youtube?.token, REFRESH_TOKEN);
  const revoked = fromStore(store, providerFixture({ grantError: true }).providers);
  await assert.rejects(() => revoked.verify("youtube"), { code: "grant_unavailable" });
  assert.equal((await revoked.overview("owner")).platforms.youtube.account?.needsReconnect, true);
  assert.equal((await revoked.activeAccounts()).youtube, undefined);

  const ambiguous = fromStore(new MemoryStore(), providerFixture({ extraGoogleChannels: true }).providers);
  assert.equal(await consent(ambiguous, "youtube", "fixture/YouTube-code--1"), "failed");
  assert.equal((await ambiguous.overview("owner")).platforms.youtube.flow?.errorCode, "select_youtube_channel");
});

test("Telegram validates identity and channel post rights without sending any message", async () => {
  const store = new MemoryStore();
  const { providers, calls } = providerFixture();
  const service = fromStore(store, providers);
  const http = await signedHttpFixture(service);
  try {
    const response = await http.request(`${ADMIN}/telegram`, "POST", { botToken: BOT_TOKEN, channel: "@Cinema_test_channel" });
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /123456:/);
    assert.equal(calls.length, 3);
    assert.equal((await service.verify("telegram")).name, "Telegram synthetic channel");
    assert.doesNotMatch(JSON.stringify(await store.read("telegram")), /123456:/);
    assert.equal((await service.activeAccounts()).telegram?.id, "-1001234567890");
  } finally {
    await http.close();
  }
  const denied = fromStore(new MemoryStore(), providerFixture({ telegramPermission: false }).providers);
  await assert.rejects(() => denied.linkTelegram(BOT_TOKEN, "@Cinema_test_channel"), { code: "telegram_post_permission" });
  assert.equal((await denied.overview(null)).platforms.telegram.account, null);
});

test("disconnecting during an in-flight verification cannot restore the old credential", async () => {
  const store = new MemoryStore();
  const fixture = providerFixture();
  const service = fromStore(store, fixture.providers);
  await service.linkTelegram(BOT_TOKEN, "@Cinema_test_channel");
  let finishVerification!: () => void;
  const blocked = new Promise<void>(resolve => { finishVerification = resolve; });
  let signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  const otherInstance = fromStore(store, {
    ...fixture.providers,
    async verify(platform, account) {
      signalStarted();
      await blocked;
      return fixture.providers.verify(platform, account);
    },
  });
  const recheck = otherInstance.verify("telegram");
  await started;
  await service.disconnect("telegram");
  finishVerification();
  await assert.rejects(() => recheck, { code: "account_changed" });
  assert.equal((await service.overview("owner")).platforms.telegram.account, null);
});

test("an expired or replaced authorization cannot write a connection and staging makes no provider requests", async () => {
  let now = 1_800_000_000_000;
  const store = new MemoryStore();
  const fixture = providerFixture();
  const service = fromStore(store, fixture.providers, () => now);
  const old = await service.start("facebook", "owner");
  const oldState = new URL(old.authorizationUrl).searchParams.get("state")!;
  const current = await service.start("facebook", "owner");
  assert.equal(await service.callback("facebook", oldState, old.browserProof, "old"), "invalid");
  now += 10 * 60_000;
  assert.equal(await service.callback("facebook", new URL(current.authorizationUrl).searchParams.get("state")!, current.browserProof, "expired"), "invalid");
  assert.equal((await service.overview("owner")).platforms.facebook.flow, undefined);
  assert.equal((await store.read("facebook")).flow, null);
  assert.equal(fixture.calls.length, 0);

  const noNetwork = createSocialAccountProviders({ env: ENV, origin: ORIGIN, outboundAllowed: false, fetcher: () => { throw new Error("Unexpected provider call"); } });
  const staging = fromStore(store, noNetwork);
  await assert.rejects(() => staging.start("facebook", "owner"), { code: "connection_unavailable" });
  await assert.rejects(() => staging.linkTelegram(BOT_TOKEN, "@Cinema_test_channel"), { code: "connection_unavailable" });
  assert.equal(Object.values((await staging.overview("owner")).platforms).some(value => value.available), false);
  const adapters = createConnectedSocialAdapters({ TELEGRAM_CHANNEL_ID: "@old_channel", TELEGRAM_BOT_TOKEN: "legacy-credential" }, {});
  assert.equal(adapters.telegram.isConfigured(), false);
});

const hasDemoEmulator = /^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") &&
  /^demo-[a-z0-9-]+$/i.test(process.env.GCLOUD_PROJECT || "");

test("encrypted grants persist in the Firestore Emulator and a wrong encryption key fails safely", { skip: !hasDemoEmulator }, async () => {
  assert.equal(getApps().length, 0);
  const projectId = `demo-social-link-${Date.now()}`;
  const admin = initializeApp({ projectId }, projectId);
  try {
    const store = new FirestoreSocialConnectionStore(() => admin);
    const { providers } = providerFixture();
    const service = fromStore(store, providers);
    assert.equal(await consent(service, "facebook"), "ready");
    const flows = (await service.overview("owner")).platforms.facebook.flow!;
    await service.select("facebook", "owner", flows.id, "2222");
    const snapshot = await getFirestore(admin).collection(SOCIAL_CONNECTIONS_COLLECTION).doc("facebook").get();
    assert.equal(snapshot.exists, true);
    assert.doesNotMatch(JSON.stringify(snapshot.data()), /synthetic-page-access-token|Cinema test page/);
    const fresh = fromStore(new FirestoreSocialConnectionStore(() => admin), providers);
    assert.equal((await fresh.overview(null)).platforms.facebook.account?.id, "2222");
    const wrongKey = fromStore(store, providers, undefined, Buffer.alloc(32, 3).toString("base64"));
    await assert.rejects(() => wrongKey.overview(null), { code: "connection_unavailable" });
    await fresh.disconnect("facebook");
    assert.equal((await service.overview(null)).platforms.facebook.account, null);
  } finally {
    await deleteApp(admin);
  }
});
