import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { createSocialAdapters } from "./adapters";
import { registerSocialPublishingRoutes } from "./routes";
import { SocialPublishingService } from "./service";
import type { SocialPublicationJob } from "./types";
import type { SocialPublicationStore } from "./store";

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

  async list(limit: number): Promise<SocialPublicationJob[]> {
    return [...this.jobs.values()].slice(0, limit);
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
