import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createConnectedSocialAdapters } from "./adapters";
import { createSocialAccountProviders } from "./connectionProviders";
import type { SocialPublicationJob } from "./types";

const origin = "https://www.cinamachat.com";
const env = {
  META_APP_ID: "123",
  META_APP_SECRET: "synthetic-facebook-secret",
  META_INSTAGRAM_UNIFIED_APP_ID: "456",
  META_INSTAGRAM_UNIFIED_APP_SECRET: "synthetic-unified-secret",
  META_INSTAGRAM_UNIFIED_CONFIG_ID: "789",
  META_INSTAGRAM_UNIFIED_USERNAME: "cinamachat",
};
const token = "synthetic-system-user-token";
const grant = { appId: "456", configurationId: "789", businessId: "777" };
const account = { id: "888", name: "@cinamachat", handle: "@cinamachat", token, instagramUnified: grant };
const quotaPath = "/v27.0/888/content_publishing_limit";

function providerFixture(options: {
  wrongHandle?: boolean;
  quotaDenied?: boolean;
  businessId?: string;
  environment?: typeof env;
} = {}) {
  const environment = options.environment ?? env;
  const requests: string[] = [];
  const fetcher = (async (input, init) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    assert.equal(url.hostname, "graph.facebook.com");
    assert.equal(init?.method ?? "GET", "GET");
    if (url.pathname === "/v27.0/oauth/access_token") {
      assert.equal(url.searchParams.get("client_id"), environment.META_INSTAGRAM_UNIFIED_APP_ID);
      assert.equal(url.searchParams.get("client_secret"), environment.META_INSTAGRAM_UNIFIED_APP_SECRET || environment.META_APP_SECRET);
      assert.equal(url.searchParams.get("code"), "code-fixture");
      assert.equal(url.searchParams.get("redirect_uri"), origin + "/api/social-connections/oauth/instagram");
      assert.equal(url.searchParams.has("fb_exchange_token"), false);
      return Response.json({ access_token: token });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + token);
    assert.equal(url.searchParams.has("access_token"), false);
    if (url.pathname === "/v27.0/me") {
      assert.equal(url.searchParams.get("fields"), "client_business_id");
      return Response.json({ client_business_id: options.businessId ?? grant.businessId });
    }
    if (url.pathname === "/v27.0/me/assigned_instagram_accounts") {
      assert.equal(url.searchParams.get("fields"), "id,username");
      return Response.json({
        data: [{ id: "999", username: "other_profile" }, { id: account.id, username: options.wrongHandle ? "wrong_profile" : "cinamachat" }],
      });
    }
    assert.equal(url.pathname, quotaPath);
    assert.equal(url.searchParams.get("fields"), "quota_usage");
    return options.quotaDenied ? Response.json({ error: "synthetic refusal" }, { status: 403 })
      : Response.json({ data: [{ quota_usage: 0 }] });
  }) as typeof fetch;
  return { provider: createSocialAccountProviders({ env: environment, origin, outboundAllowed: true, fetcher }), requests };
}

test("Unified Login uses the configured Meta app and verifies only the intended Instagram grant without posting", async () => {
  const { provider, requests } = providerFixture();
  const authorize = provider.authorizeUrl("instagram", "state-fixture", "");
  assert.equal(authorize.origin + authorize.pathname, "https://www.facebook.com/dialog/oauth");
  assert.equal(authorize.searchParams.get("client_id"), "456");
  assert.equal(authorize.searchParams.get("config_id"), "789");
  assert.equal(authorize.searchParams.get("state"), "state-fixture");
  assert.equal(authorize.searchParams.get("override_default_response_type"), "true");
  assert.equal(authorize.searchParams.has("scope"), false);
  assert.equal(provider.authorizeUrl("facebook", "state-fixture", "").searchParams.get("client_id"), "123");
  assert.deepEqual(await provider.exchange("instagram", "code-fixture", ""), [account]);
  assert.deepEqual(requests, ["/v27.0/oauth/access_token", "/v27.0/me", "/v27.0/me/assigned_instagram_accounts", quotaPath]);
});

test("Unified Login refuses the wrong account and token without publishing permissions", async () => {
  const wrong = providerFixture({ wrongHandle: true });
  await assert.rejects(wrong.provider.exchange("instagram", "code-fixture", ""), { code: "no_eligible_account" });
  assert.equal(wrong.requests.includes(quotaPath), false);

  const missingPermission = providerFixture({ quotaDenied: true });
  await assert.rejects(missingPermission.provider.exchange("instagram", "code-fixture", ""), { code: "missing_permissions" });
});

test("rechecking Unified Login binds the grant to the original business and configuration", async () => {
  const { provider, requests } = providerFixture();
  assert.deepEqual(await provider.verify("instagram", account), account);
  await assert.rejects(provider.verify("instagram", { ...account, instagramUnified: { ...grant, configurationId: "009" } }), {
    code: "grant_unavailable",
  });
  assert.equal(requests.length, 3);
  await assert.rejects(providerFixture({ businessId: "222" }).provider.verify("instagram", account), { code: "grant_unavailable" });
});

test("partial Unified Login configuration fails closed for Instagram and leaves Facebook available", () => {
  const provider = createSocialAccountProviders({
    origin, outboundAllowed: true, env: { ...env, META_INSTAGRAM_UNIFIED_APP_SECRET: "" },
  });
  assert.equal(provider.available("facebook"), true);
  assert.equal(provider.available("instagram"), false);
  assert.throws(() => provider.authorizeUrl("instagram", "state-fixture", ""), { code: "connection_unavailable" });
});

test("Unified Login reuses the existing Meta credential for the same app only", async () => {
  const shared = {
    ...env,
    META_INSTAGRAM_UNIFIED_APP_ID: env.META_APP_ID,
    META_INSTAGRAM_UNIFIED_APP_SECRET: "",
  };
  const { provider } = providerFixture({ environment: shared });
  const expected = { ...account, instagramUnified: { ...grant, appId: env.META_APP_ID } };

  assert.equal(provider.available("instagram"), true);
  assert.deepEqual(await provider.exchange("instagram", "code-fixture", ""), [expected]);
  assert.equal(createConnectedSocialAdapters(shared, { instagram: expected }).instagram?.isConfigured(), true);

  const mismatchedApp = { ...shared, META_INSTAGRAM_UNIFIED_APP_ID: "987" };
  assert.equal(createConnectedSocialAdapters(mismatchedApp, { instagram: expected }).instagram?.isConfigured(), false);
});

test("the Unified Instagram adapter uses a bearer token and the dedicated app proof", async () => {
  const sent: string[] = [];
  const fetcher = (async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "graph.facebook.com");
    assert.equal(url.searchParams.has("access_token"), false);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + token);
    const fields = init?.body instanceof URLSearchParams ? init.body : url.searchParams;
    assert.equal(fields.has("access_token"), false);
    assert.equal(fields.get("appsecret_proof"), createHmac("sha256", env.META_INSTAGRAM_UNIFIED_APP_SECRET).update(token).digest("hex"));
    sent.push(url.pathname);
    return Response.json({ id: sent.length === 1 ? "synthetic-container" : "synthetic-post" });
  }) as typeof fetch;
  const adapters = createConnectedSocialAdapters(env, { instagram: account }, { fetch: fetcher });
  const date = "2026-11-23T10:00:00.000Z";
  const publication: SocialPublicationJob = {
    id: "fixture",
    platforms: ["instagram"],
    caption: "تاقیکردنەوە",
    media: { type: "image", url: "https://example.test/fixture.jpg" },
    scheduledAt: date,
    createdAt: date,
    updatedAt: date,
    createdBy: "synthetic-admin",
    status: "processing",
    platformStatus: {},
    attempts: 1,
    dueAt: Date.parse(date),
  };
  assert.deepEqual(await adapters.instagram?.publish(publication), { providerPostId: "synthetic-post" });
  assert.deepEqual(sent, ["/v27.0/888/media", "/v27.0/888/media_publish"]);
  const changedConfig = createConnectedSocialAdapters({ ...env, META_INSTAGRAM_UNIFIED_CONFIG_ID: "009" }, { instagram: account });
  assert.equal(changedConfig.instagram?.isConfigured(), false);
});
