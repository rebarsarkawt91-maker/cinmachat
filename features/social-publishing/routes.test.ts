import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { createSocialAdapters } from "./adapters";
import { registerSocialPublishingRoutes } from "./routes";
import { SocialPublishingService } from "./service";
import type { SocialPublicationJob } from "./types";
import type { SocialPublicationStore, SocialScheduledWindow } from "./store";

class MemoryStore implements SocialPublicationStore {
  private readonly jobs = new Map<string, SocialPublicationJob>();

  async enqueue(job: SocialPublicationJob) {
    const existing = this.jobs.get(job.id);
    if (existing) return { job: existing, duplicate: true };
    this.jobs.set(job.id, job);
    return { job, duplicate: false };
  }

  async claimDue(): Promise<null> {
    return null;
  }

  async get(id: string): Promise<SocialPublicationJob | null> {
    return this.jobs.get(id) || null;
  }

  async delete(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async save(): Promise<void> {}

  async list(limit: number, window?: SocialScheduledWindow): Promise<SocialPublicationJob[]> {
    const jobs = [...this.jobs.values()];
    if (!window) return jobs.slice(0, limit);
    return jobs.filter(job => job.scheduledAt >= window.start && job.scheduledAt < window.end)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, limit);
  }
}

test("publishing status is admin-only and never returns server credentials", async () => {
  const app = express();
  app.use(express.json());
  const store = new MemoryStore();
  const service = new SocialPublishingService({
    store,
    adapters: createSocialAdapters({
      INSTAGRAM_BUSINESS_ACCOUNT_ID: "instagram-id",
      INSTAGRAM_ACCESS_TOKEN: "instagram-secret",
      FACEBOOK_PAGE_ID: "facebook-id",
      FACEBOOK_PAGE_ACCESS_TOKEN: "facebook-secret",
      TELEGRAM_BOT_TOKEN: "telegram-secret",
      TELEGRAM_CHANNEL_ID: "@channel",
      YOUTUBE_CLIENT_ID: "youtube-client",
      YOUTUBE_CLIENT_SECRET: "youtube-secret",
      YOUTUBE_REFRESH_TOKEN: "youtube-refresh-secret",
    }),
    env: {},
  });
  registerSocialPublishingRoutes(app, {
    service,
    resolveAdmin: (request) =>
      request.headers["x-test-admin"] === "verified" ? "admin" : null,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;

  try {
    const denied = await fetch(`http://127.0.0.1:${address.port}/api/admin/social-publishing/status`);
    assert.equal(denied.status, 401);

    const allowed = await fetch(`http://127.0.0.1:${address.port}/api/admin/social-publishing/status`, {
      headers: { "X-Test-Admin": "verified" },
    });
    const body = await allowed.text();
    assert.equal(allowed.status, 200);
    assert.match(body, /"mode":"DRY_RUN"/);
    for (const secret of ["instagram-secret", "facebook-secret", "telegram-secret", "youtube-refresh-secret"]) {
      assert.equal(body.includes(secret), false);
    }

    const queued = await fetch(
      `http://127.0.0.1:${address.port}/api/admin/social-publishing/queue`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Admin": "verified",
        },
        body: JSON.stringify({
          platforms: ["telegram"],
          caption: "Watch https:&#x2F;&#x2F;cinemachat.example/?a=1&amp;b=2",
          scheduledAt: new Date().toISOString(),
          media: {
            type: "image",
            url: "https://cdn.example.test/post.jpg?token=media-download-token",
            rightsConfirmed: true,
          },
        }),
      },
    );
    const queuedBody = await queued.text();
    assert.equal(queued.status, 202);
    const queuedJob = JSON.parse(queuedBody).job as SocialPublicationJob;
    assert.equal(queuedJob.approvalStatus, "pending");
    assert.equal(queuedBody.includes("media-download-token"), false);
    assert.equal(queuedBody.includes("post.jpg"), false);
    assert.match(queuedBody, /Watch https:\/\/cinemachat\.example\/\?a=1&b=2/);

    const deniedApproval = await fetch(`http://127.0.0.1:${address.port}/api/admin/social-publishing/queue/${queuedJob.id}/approve`, { method: "POST" });
    assert.equal(deniedApproval.status, 401);
    const approved = await fetch(`http://127.0.0.1:${address.port}/api/admin/social-publishing/queue/${queuedJob.id}/approve`, {
      method: "POST",
      headers: { "X-Test-Admin": "verified" },
    });
    assert.equal(approved.status, 200);
    const approvedJob = (await approved.json() as { job: SocialPublicationJob }).job;
    assert.equal(approvedJob.approvalStatus, "approved");
    assert.equal(approvedJob.approvedBy, "admin");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("today and media preview are admin-only, use Baghdad midnight and withhold private media", async () => {
  const app = express();
  const service = new SocialPublishingService({
    store: new MemoryStore(), adapters: createSocialAdapters({}), env: {},
    now: () => Date.parse("2026-12-31T22:00:00Z"),
  });
  registerSocialPublishingRoutes(app, { service, resolveAdmin: request => request.headers["x-test-admin"] === "verified" ? "admin" : null });
  const before = "2026-12-31T20:59:59.999Z";
  const midnight = "2026-12-31T21:00:00.000Z";
  const lastMinute = "2027-01-01T20:59:59.999Z";
  const after = "2027-01-01T21:00:00.000Z";
  const video = "https://www.cinamachat.com/uploads/social/test-clip.mp4";
  const base = { platforms: ["telegram"] as const, caption: "فیلمی ئەمڕۆ\n#سینەماچات #فیلم" };
  const enqueue = (scheduledAt: string, media?: SocialPublicationJob["media"]) =>
    service.enqueue({ ...base, platforms: [...base.platforms], scheduledAt, media }, "synthetic-admin");
  const late = await enqueue(lastMinute, { type: "image", url: "https://www.cinamachat.com/assets/posters/post.jpg?token=secret-media-url", storagePath: "private/media.jpg", rightsConfirmed: true });
  const first = await enqueue(midnight, { type: "video", url: video, rightsConfirmed: true });
  await enqueue(before);
  await enqueue(after);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/social-publishing`;
  const admin = { headers: { "X-Test-Admin": "verified" } };
  const preview = (id: string) => `${root}/queue/${id}/preview`;
  try {
    assert.equal((await fetch(`${root}/today`)).status, 401);
    assert.equal((await fetch(`${root}/upcoming`)).status, 401);
    assert.equal((await fetch(preview(first.job.id))).status, 401);
    const today = await fetch(`${root}/today`, admin);
    assert.equal(today.status, 200);
    assert.equal(today.headers.get("cache-control"), "no-store");
    const body = await today.text();
    const payload = JSON.parse(body);
    assert.equal(payload.dayKey, "2027-01-01");
    assert.equal(payload.truncated, false);
    assert.deepEqual(payload.jobs.map((job: SocialPublicationJob) => job.id), [first.job.id, late.job.id]);
    assert.equal(payload.jobs[0].caption, base.caption);
    assert.equal(payload.jobs[0].approvalStatus, "pending");
    assert.deepEqual(payload.jobs[0].platformStatus, { telegram: { status: "queued" } });
    assert.doesNotMatch(body, /secret-media-url|private\/media|synthetic-admin|test-clip/);
    assert.deepEqual(await (await fetch(preview(first.job.id), admin)).json(), { success: true, mediaUrl: video });
    assert.deepEqual(await (await fetch(preview(late.job.id), admin)).json(), { success: true, mediaUrl: null });
    assert.equal((await fetch(preview("invalid-id"), admin)).status, 404);
    const inside = await enqueue("2027-01-07T21:59:59.999Z");
    const atBoundary = await enqueue("2027-01-07T22:00:00.000Z");
    const cancelledMedia = await enqueue("2027-01-02T19:00:00.000Z");
    assert.equal(await service.cancelQueued(cancelledMedia.job.id), true);
    const upcoming = await fetch(`${root}/upcoming`, admin);
    assert.equal(upcoming.status, 200);
    assert.equal(upcoming.headers.get("cache-control"), "no-store");
    const upcomingBody = await upcoming.text();
    const forecast = JSON.parse(upcomingBody);
    assert.equal(forecast.checkedAt, "2026-12-31T22:00:00.000Z");
    assert.equal(forecast.endsAt, "2027-01-07T22:00:00.000Z");
    assert.deepEqual(forecast.jobs.map((item: SocialPublicationJob) => item.scheduledAt), [late.job.scheduledAt, after, inside.job.scheduledAt]);
    assert.equal(forecast.jobs.some((item: SocialPublicationJob) => item.id === atBoundary.job.id), false);
    assert.doesNotMatch(upcomingBody, /secret-media-url|private\/media|synthetic-admin/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
