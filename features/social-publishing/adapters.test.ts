import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSocialAdapters, SocialProviderError } from "./adapters";
import type { SocialPublicationJob } from "./types";

const job = (
  platform: "instagram" | "facebook" | "youtube" | "telegram",
  media: SocialPublicationJob["media"],
): SocialPublicationJob => ({
  id: "job-id",
  platforms: [platform],
  caption: "Original test caption",
  title: "Test title",
  description: "Test description",
  media,
  scheduledAt: new Date().toISOString(),
  status: "processing",
  platformStatus: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: "admin",
  attempts: 1,
  dueAt: Date.now(),
});

const jsonResponse = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), { status, headers });

test("Instagram video adapter waits for processing and publishes a Graph API media container", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const adapters = createSocialAdapters(
    { INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig-account", INSTAGRAM_ACCESS_TOKEN: "server-only-token" },
    {
      fetch: async (input, init) => {
        const url = String(input);
        calls.push({ url, body: String(init?.body || "") });
        if (url.endsWith("/media")) return jsonResponse({ id: "container-1" });
        if (url.includes("/container-1?")) return jsonResponse({ status_code: "FINISHED" });
        return jsonResponse({ id: "instagram-post-1" });
      },
    },
  );

  const result = await adapters.instagram.publish(
    job("instagram", { type: "video", url: "https://cdn.example.test/post.mp4" }),
  );
  assert.equal(result.providerPostId, "instagram-post-1");
  assert.equal(calls.length, 3);
  assert.match(calls[0].body, /video_url=https%3A%2F%2Fcdn\.example\.test/);
  assert.ok(calls.every((call) => call.url.startsWith("https://graph.facebook.com/")));
});

test("Facebook Pages adapter posts through the official Page Graph API", async () => {
  let requestUrl = "";
  let requestBody = "";
  const adapters = createSocialAdapters(
    { FACEBOOK_PAGE_ID: "page-1", FACEBOOK_PAGE_ACCESS_TOKEN: "server-only-token" },
    {
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestBody = String(init?.body || "");
        return jsonResponse({ id: "page-post-1" });
      },
    },
  );

  const result = await adapters.facebook.publish(
    job("facebook", { type: "image", url: "https://cdn.example.test/post.jpg" }),
  );
  assert.equal(result.providerPostId, "page-post-1");
  assert.match(requestUrl, /graph\.facebook\.com\/v23\.0\/page-1\/photos$/);
  assert.match(requestBody, /access_token=server-only-token/);
});

test("YouTube adapter refreshes OAuth and uploads a staged media file", async () => {
  const mediaRoot = await mkdtemp(path.join(os.tmpdir(), "cinemachat-social-"));
  try {
    await writeFile(path.join(mediaRoot, "clip.mp4"), Buffer.from("licensed test clip"));
    const calls: string[] = [];
    let uploadMetadata = "";
    const adapters = createSocialAdapters(
      {
        YOUTUBE_CLIENT_ID: "client-id",
        YOUTUBE_CLIENT_SECRET: "server-only-secret",
        YOUTUBE_REFRESH_TOKEN: "server-only-refresh-token",
      },
      {
        mediaRoot,
        fetch: async (input, init) => {
          const url = String(input);
          calls.push(url);
          if (url === "https://oauth2.googleapis.com/token") {
            return jsonResponse({ access_token: "short-lived-token" });
          }
          if (url.includes("uploadType=resumable")) {
            uploadMetadata = String(init?.body || "");
            return new Response(null, {
              status: 200,
              headers: { Location: "https://www.googleapis.com/upload/youtube/v3/videos/session" },
            });
          }
          assert.equal(init?.method, "PUT");
          return jsonResponse({ id: "youtube-video-1" });
        },
      },
    );

    const result = await adapters.youtube.publish(
      job("youtube", {
        type: "video",
        storagePath: "clip.mp4",
        mimeType: "video/mp4",
      }),
    );
    assert.equal(result.providerPostId, "youtube-video-1");
    assert.equal(calls.length, 3);
    assert.match(uploadMetadata, /"privacyStatus":"private"/);
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
});

test("Telegram adapter calls Bot API and does not include credentials in failures", async () => {
  let requestUrl = "";
  const adapters = createSocialAdapters(
    { TELEGRAM_BOT_TOKEN: "server-only-token", TELEGRAM_CHANNEL_ID: "@cinema" },
    {
      fetch: async (input) => {
        requestUrl = String(input);
        return jsonResponse({ ok: true, result: { message_id: 42 } });
      },
    },
  );

  const result = await adapters.telegram.publish(job("telegram", { type: "text" }));
  assert.equal(result.providerPostId, "42");
  assert.match(requestUrl, /^https:\/\/api\.telegram\.org\/botserver-only-token\/sendMessage$/);

  const failingAdapters = createSocialAdapters(
    { TELEGRAM_BOT_TOKEN: "secret-not-for-errors", TELEGRAM_CHANNEL_ID: "@cinema" },
    { fetch: async () => jsonResponse({ ok: false, description: "token must not leak" }, 401) },
  );
  await assert.rejects(
    failingAdapters.telegram.publish(job("telegram", { type: "text" })),
    (error: unknown) => {
      assert.ok(error instanceof SocialProviderError);
      assert.equal(error.message, "TELEGRAM_HTTP_401");
      assert.equal(error.message.includes("secret-not-for-errors"), false);
      return true;
    },
  );
});
