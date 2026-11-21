import assert from "node:assert/strict";
import test from "node:test";
import type { SocialPublicationJob, SocialPlatform, SocialAdapters } from "./types";
import { SocialPublishingInputError, SocialPublishingService } from "./service";
import type { SocialPublicationStore } from "./store";
import { SocialProviderError } from "./adapters";

class MemoryStore implements SocialPublicationStore {
  readonly jobs = new Map<string, SocialPublicationJob>();

  async enqueue(job: SocialPublicationJob) {
    const existing = this.jobs.get(job.id);
    if (existing) return { job: existing, duplicate: true };
    this.jobs.set(job.id, job);
    return { job, duplicate: false };
  }

  async claimDue(now: number): Promise<SocialPublicationJob | null> {
    const job = [...this.jobs.values()]
      .filter((entry) => entry.approvalStatus === "approved" && ["queued", "retrying"].includes(entry.status) && entry.dueAt <= now)
      .sort((a, b) => a.dueAt - b.dueAt)[0];
    if (!job) return null;
    const claimed = {
      ...job,
      status: "processing" as const,
      dueAt: now + 60_000,
      attempts: job.attempts + 1,
    };
    this.jobs.set(job.id, claimed);
    return claimed;
  }

  async get(id: string): Promise<SocialPublicationJob | null> {
    return this.jobs.get(id) || null;
  }

  async delete(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async save(job: SocialPublicationJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async list(limit: number): Promise<SocialPublicationJob[]> {
    return [...this.jobs.values()].slice(0, limit);
  }
}

function adapters(
  publish: Partial<Record<SocialPlatform, () => Promise<{ providerPostId?: string }>>> = {},
): SocialAdapters {
  const makeAdapter = (platform: SocialPlatform) => ({
    isConfigured: () => true,
    publish: publish[platform] || (async () => ({ providerPostId: `${platform}-post` })),
  });
  return {
    instagram: makeAdapter("instagram"),
    facebook: makeAdapter("facebook"),
    youtube: makeAdapter("youtube"),
    telegram: makeAdapter("telegram"),
  };
}

const publication = {
  platforms: ["telegram", "facebook"] as SocialPlatform[],
  caption: "تاقیکردنەوە",
  scheduledAt: new Date(1_000).toISOString(),
};

test("queue deduplicates identical posts and DRY_RUN never calls provider adapters", async () => {
  const store = new MemoryStore();
  let adapterCalls = 0;
  const platformAdapters = adapters({
    telegram: async () => {
      adapterCalls += 1;
      return {};
    },
    facebook: async () => {
      adapterCalls += 1;
      return {};
    },
  });
  const service = new SocialPublishingService({
    store,
    adapters: platformAdapters,
    env: {},
    now: () => 1_000,
  });

  const first = await service.enqueue(publication, "admin");
  const duplicate = await service.enqueue(
    { ...publication, scheduledAt: new Date(1_500).toISOString() },
    "another-admin",
  );
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(first.job.id, duplicate.job.id);
  assert.equal(first.job.approvalStatus, "pending");
  assert.equal(await service.runOnce(), false, "unapproved jobs must not reach a delivery adapter");
  await service.approveQueued(first.job.id, "synthetic-owner");
  assert.equal(await service.runOnce(), true);
  assert.equal(adapterCalls, 0);
  assert.equal(store.jobs.get(first.job.id)?.status, "simulated");
});

test("future posts remain queued until their scheduled time", async () => {
  const store = new MemoryStore();
  let now = 1_000;
  const service = new SocialPublishingService({
    store,
    adapters: adapters(),
    env: {},
    now: () => now,
  });
  const result = await service.enqueue(
    { ...publication, scheduledAt: new Date(60_000).toISOString() },
    "admin",
  );
  await service.approveQueued(result.job.id, "synthetic-owner");

  assert.equal(await service.runOnce(), false);
  now = 60_000;
  assert.equal(await service.runOnce(), true);
  assert.equal(store.jobs.get(result.job.id)?.status, "simulated");
});

test("temporary provider failures retry without duplicating successful platform delivery", async () => {
  const store = new MemoryStore();
  let now = 1_000;
  let telegramAttempts = 0;
  let facebookAttempts = 0;
  const service = new SocialPublishingService({
    store,
    adapters: adapters({
      telegram: async () => {
        telegramAttempts += 1;
        if (telegramAttempts === 1) {
          throw new SocialProviderError("TELEGRAM_HTTP_503", true);
        }
        return { providerPostId: "telegram-post" };
      },
      facebook: async () => {
        facebookAttempts += 1;
        return { providerPostId: "facebook-post" };
      },
    }),
    env: {
      SOCIAL_PUBLISHING_MODE: "LIVE",
      SOCIAL_PUBLISHING_LIVE_ENABLED: "true",
      SOCIAL_PUBLISHING_ALLOW_LIVE: "true",
    },
    allowLive: true,
    now: () => now,
  });
  const result = await service.enqueue(publication, "admin");
  await service.approveQueued(result.job.id, "synthetic-owner");

  await service.runOnce();
  assert.equal(store.jobs.get(result.job.id)?.status, "retrying");
  assert.equal(facebookAttempts, 1);
  now += 30_000;
  await service.runOnce();

  const completed = store.jobs.get(result.job.id);
  assert.equal(completed?.status, "succeeded");
  assert.equal(telegramAttempts, 2);
  assert.equal(facebookAttempts, 1);
});

test("invalid platforms and timestamps are rejected before reaching storage", async () => {
  const store = new MemoryStore();
  const service = new SocialPublishingService({ store, adapters: adapters(), env: {} });

  await assert.rejects(
    service.enqueue({ ...publication, platforms: ["unknown" as SocialPlatform] }, "admin"),
    SocialPublishingInputError,
  );
  await assert.rejects(
    service.enqueue({ ...publication, scheduledAt: "not-a-date" }, "admin"),
    SocialPublishingInputError,
  );
  await assert.rejects(
    service.enqueue({ ...publication, media: { type: "video", url: "https://cdn.example.test/trailer.mp4" } }, "admin"),
    SocialPublishingInputError,
  );
  assert.equal(store.jobs.size, 0);
});

test("queued posts can be edited or cancelled without invoking provider adapters", async () => {
  const store = new MemoryStore();
  let publishCalls = 0;
  const service = new SocialPublishingService({
    store,
    adapters: adapters({ telegram: async () => { publishCalls += 1; return {}; } }),
    env: {},
    now: () => 1_000,
  });
  const queued = await service.enqueue({ ...publication, contentKind: "trailer" }, "admin");
  const edited = await service.updateQueued(queued.job.id, {
    title: "Authorized trailer",
    caption: "Sorani caption",
    scheduledAt: new Date(90_000).toISOString(),
  });
  assert.equal(edited.title, "Authorized trailer");
  assert.equal(edited.contentKind, "trailer");
  assert.equal(edited.status, "queued");
  assert.equal(edited.approvalStatus, "pending", "edited content returns to manual approval");
  assert.equal(await service.cancelQueued(queued.job.id), true);
  assert.equal(publishCalls, 0);
  assert.equal(store.jobs.size, 0);
});

test("live mode remains disabled without explicit code-level opt-in and every environment gate", () => {
  const service = new SocialPublishingService({
    store: new MemoryStore(),
    adapters: adapters(),
    env: {
      SOCIAL_PUBLISHING_MODE: "LIVE",
      SOCIAL_PUBLISHING_LIVE_ENABLED: "true",
      SOCIAL_PUBLISHING_ALLOW_LIVE: "true",
    },
  });
  assert.equal(service.readiness().mode, "DRY_RUN");
  assert.equal(service.readiness().livePublishingEnabled, false);

  const missingEnvironmentGate = new SocialPublishingService({
    store: new MemoryStore(),
    adapters: adapters(),
    env: { SOCIAL_PUBLISHING_MODE: "LIVE", SOCIAL_PUBLISHING_LIVE_ENABLED: "true" },
    allowLive: true,
  });
  assert.equal(missingEnvironmentGate.readiness().livePublishingEnabled, false);
});
