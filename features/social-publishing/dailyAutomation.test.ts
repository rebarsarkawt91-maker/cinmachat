import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SOCIAL_AUTOMATION_SETTINGS } from "./settings";
import { baghdadDayKey, baghdadWallTimeToDate, DailySocialAutomationEngine, FirestoreDailyAutomationRunStore, OfficialRssNewsAdapter, type DailyAutomationRun, type DailyAutomationRunStore, type DailySocialContentProviders } from "./dailyAutomation";
import { SocialPublishingService } from "./service";
import { FirestoreSocialPublicationStore } from "./store";
import type { SocialPublicationJob, SocialAdapters } from "./types";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

class MemoryRuns implements DailyAutomationRunStore {
  value: DailyAutomationRun | null = null;
  async get() { return this.value; }
  async claim(dayKey: string, now: number) {
    if (this.value?.dayKey === dayKey && (this.value.status === "complete" || this.value.status === "running" && this.value.leaseUntil > now || (this.value.retryAt || 0) > now)) return null;
    const leaseToken = `test-lease-${now}`;
    this.value = { dayKey, status: "running", leaseUntil: now + 300_000, leaseToken, jobIds: this.value?.jobIds || [], requested: this.value?.requested || { news: 0, trailer: 0, promotion: 0 }, created: this.value?.created || { news: 0, trailer: 0, promotion: 0 }, skipped: this.value?.skipped || { news: 0, trailer: 0, promotion: 0 }, errors: this.value?.errors || [], updatedAt: new Date(now).toISOString() };
    return leaseToken;
  }
  async save(run: DailyAutomationRun, leaseToken: string) { if (this.value?.leaseToken !== leaseToken) throw new Error("DAILY_AUTOMATION_LEASE_LOST"); this.value = structuredClone(run); }
}

class MemoryQueue {
  jobs = new Map<string, SocialPublicationJob>();
  async enqueue(job: SocialPublicationJob) { const existing = this.jobs.get(job.id); if (existing) return { job: existing, duplicate: true }; this.jobs.set(job.id, job); return { job, duplicate: false }; }
  async get(id: string) { return this.jobs.get(id) || null; }
  async delete(id: string) { return this.jobs.delete(id); }
  async save(job: SocialPublicationJob) { this.jobs.set(job.id, job); }
  async list(limit: number) { return [...this.jobs.values()].slice(0, limit); }
  async claimDue(now: number) { const job = [...this.jobs.values()].find(item => item.approvalStatus === "approved" && ["queued", "retrying"].includes(item.status) && item.dueAt <= now); if (!job) return null; const next = { ...job, status: "processing" as const, attempts: job.attempts + 1, dueAt: now + 30_000 }; this.jobs.set(job.id, next); return next; }
}

const neverPublish: SocialAdapters = {
  instagram: { isConfigured: () => false, publish: async () => { throw new Error("DRY_RUN_ADAPTER_MUST_NOT_RUN"); } },
  facebook: { isConfigured: () => false, publish: async () => { throw new Error("DRY_RUN_ADAPTER_MUST_NOT_RUN"); } },
  youtube: { isConfigured: () => false, publish: async () => { throw new Error("DRY_RUN_ADAPTER_MUST_NOT_RUN"); } },
  telegram: { isConfigured: () => false, publish: async () => { throw new Error("DRY_RUN_ADAPTER_MUST_NOT_RUN"); } },
};

test("daily planner creates five verified synthetic jobs, deduplicates the day, and processes them in DRY_RUN", async () => {
  let now = Date.parse("2026-11-18T06:00:00.000Z"); // 09:00 Baghdad
  const dayKey = baghdadDayKey(new Date(now));
  const settings = structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
  settings.schedule.paused = false;
  settings.platforms.telegram = true;
  const providers: DailySocialContentProviders = {
    news: async () => [1, 2].map(index => ({ id: `news-${index}`, title: `Verified news ${index}`, summaryKu: `ئەمە پوختەی پشتڕاستکراوەی هەواڵی ژمارە ${index} ـە`, articleUrl: `https://variety.com/story-${index}`, publishedAt: new Date(now - 60_000).toISOString() })),
    trailers: async () => [1, 2].map(index => ({ id: `trailer-${index}`, title: `Licensed trailer ${index}`, summaryKu: `ئەمە پوختەی کوردیی تریلەری مۆڵەتپێدراوە ${index} ـە`, media: { type: "video" as const, url: `https://media.example/trailer-${index}.mp4` }, licenseId: `demo-license-${index}`, licenseExpiresAt: new Date(now + 86_400_000).toISOString(), allowedPlatforms: ["telegram" as const] })),
    catalog: async () => [{ id: "catalog-title-1", title: "Synthetic CinemaChat title", year: "2026", description: "پوختەی کوردیی ساختەی فیلم", playbackAvailable: true, broken: false, kurdishSubtitleStatus: "ready" }],
  };
  const runs = new MemoryRuns();
  const queue = new MemoryQueue();
  const publishing = new SocialPublishingService({ store: queue, adapters: neverPublish, env: { SOCIAL_PUBLISHING_MODE: "DRY_RUN" }, now: () => now });
  const engine = new DailySocialAutomationEngine({ runs, publishing, providers, officialNewsHosts: ["variety.com"], now: () => now });

  const run = await engine.runToday(settings);
  assert.equal(run?.status, "complete");
  assert.deepEqual(run?.created, { news: 2, trailer: 2, promotion: 1 });
  assert.equal(queue.jobs.size, 5);
  assert.deepEqual(await engine.runToday(settings), run);

  for (const job of [...queue.jobs.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
    await publishing.approveQueued(job.id, "synthetic-owner");
    now = Date.parse(job.scheduledAt) + 60_000;
    assert.equal(await publishing.runOnce(), true);
  }
  assert.equal(publishing.readiness().mode, "DRY_RUN");
  assert.ok([...queue.jobs.values()].every(job => job.status === "simulated"));
  assert.ok([...queue.jobs.values()].filter(job => job.contentKind === "trailer").every(job => job.media?.rightsConfirmed === true));
  assert.equal(dayKey, "2026-11-18");
  assert.equal(baghdadWallTimeToDate(dayKey, "09:00").toISOString(), "2026-11-18T06:00:00.000Z");
});

test("planner skips unverified news, unlicensed trailers and unavailable/broken catalog items", async () => {
  const now = Date.parse("2026-11-18T06:00:00.000Z");
  const settings = structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
  settings.schedule.paused = false; settings.platforms.telegram = true;
  const providers: DailySocialContentProviders = {
    news: async () => [{ id: "bad-news", title: "Unverified", summaryKu: "پوختەی ساختەیە و پشتڕاست نییە", articleUrl: "https://evil.example/fake", publishedAt: new Date(now).toISOString() }],
    trailers: async () => [{ id: "unlicensed", title: "No rights", summaryKu: "پوختەی کوردیی تریلەری بێ مۆڵەتە", media: { type: "video", url: "https://media.example/file.mp4" }, licenseId: "", licenseExpiresAt: new Date(now + 100_000).toISOString(), allowedPlatforms: ["telegram"] }],
    catalog: async () => [{ id: "broken", title: "Broken", playbackAvailable: false, broken: true }],
  };
  const queue = new MemoryQueue();
  const engine = new DailySocialAutomationEngine({ runs: new MemoryRuns(), publishing: new SocialPublishingService({ store: queue, adapters: neverPublish, now: () => now }), providers, officialNewsHosts: ["variety.com"], now: () => now });
  const run = await engine.runToday(settings);
  assert.equal(run?.status, "partial");
  assert.deepEqual(run?.created, { news: 0, trailer: 0, promotion: 0 });
  assert.deepEqual(run?.skipped, { news: 2, trailer: 2, promotion: 1 });
  assert.equal(queue.jobs.size, 0);
});

test("official RSS adapter rejects off-host links and requires a Sorani summary", async () => {
  const now = Date.parse("2026-11-18T06:00:00.000Z");
  const item = (title: string, link: string) => `<item><title>${title}</title><link>${link}</link><pubDate>${new Date(now - 60_000).toUTCString()}</pubDate><description><![CDATA[Official source description.]]></description></item>`;
  const xml = `<rss><channel>${item("Trusted item", "https://variety.com/trusted")}${item("Spoof item", "https://evil.example/story")}</channel></rss>`;
  const adapter = new OfficialRssNewsAdapter({
    feeds: [{ url: "https://variety.com/feed/", region: "foreign" }],
    fetcher: async () => new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } }),
    summarizeToSorani: async title => `پوختەی کوردی بۆ ${title} وە پشتڕاستکراوە`,
    now: () => now,
  });
  const news = await adapter.news(5, ["foreign"]);
  assert.equal(news.length, 1);
  assert.equal(news[0].articleUrl, "https://variety.com/trusted");
  assert.match(news[0].summaryKu, /[\u0600-\u06FF]/);
});

const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || "");
const demoProject = String(process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "");
const emulatorOnly = /^127\.0\.0\.1:\d+$/.test(emulatorHost) && /^demo-[a-z0-9-]+$/i.test(demoProject);

test("daily run claim and status persist idempotently in the demo Firestore emulator", { skip: !emulatorOnly }, async () => {
  const app = initializeApp({ projectId: `demo-daily-run-${Date.now()}` }, `daily-run-test-${Date.now()}`);
  const dayKey = "2026-11-17";
  const ref = getFirestore(app).collection("socialAutomationRuns").doc(dayKey);
  const store = new FirestoreDailyAutomationRunStore(() => app);
  try {
    await ref.delete();
    const leaseToken = await store.claim(dayKey, Date.now());
    assert.equal(typeof leaseToken, "string");
    assert.equal(await store.claim(dayKey, Date.now()), null);
    const current = await store.get(dayKey);
    assert.equal(current?.status, "running");
    await store.save({ ...current!, status: "complete", leaseUntil: 0, jobIds: ["synthetic-job"], updatedAt: new Date().toISOString() }, leaseToken!);
    assert.equal((await store.get(dayKey))?.jobIds[0], "synthetic-job");
    assert.equal(await store.claim(dayKey, Date.now() + 1), null);
  } finally {
    await ref.delete();
    await deleteApp(app);
  }
});

test("five synthetic daily jobs persist and complete in DRY_RUN against Firestore emulator", { skip: !emulatorOnly }, async () => {
  let now = Date.parse("2026-11-18T06:00:00.000Z");
  const dayKey = baghdadDayKey(new Date(now));
  const app = initializeApp({ projectId: `demo-daily-five-${Date.now()}` }, `daily-five-test-${Date.now()}`);
  const db = getFirestore(app);
  const runRef = db.collection("socialAutomationRuns").doc(dayKey);
  const queue = new FirestoreSocialPublicationStore(() => app as any);
  const runs = new FirestoreDailyAutomationRunStore(() => app);
  const settings = structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
  settings.schedule.paused = false; settings.platforms.telegram = true;
  const providers: DailySocialContentProviders = {
    news: async () => [1, 2].map(index => ({ id: `firestore-news-${index}`, title: `Verified synthetic story ${index}`, summaryKu: `ئەمە پوختەی پشتڕاستکراوەی ڕۆژنامەی ژمارە ${index} ـە`, articleUrl: `https://variety.com/firestore-${index}`, publishedAt: new Date(now - 60_000).toISOString() })),
    trailers: async () => [1, 2].map(index => ({ id: `firestore-trailer-${index}`, title: `Licensed synthetic trailer ${index}`, summaryKu: `ئەمە پوختەی کوردیی تریلەری مۆڵەتپێدراوە ${index} ـە`, media: { type: "video" as const, url: `https://media.example/firestore-${index}.mp4` }, licenseId: `demo-license-firestore-${index}`, licenseExpiresAt: new Date(now + 86_400_000).toISOString(), allowedPlatforms: ["telegram" as const] })),
    catalog: async () => [{ id: `firestore-catalog-${Date.now()}`, title: "Synthetic available title", year: "2026", description: "پوختەی کوردیی ساختەی کاڵۆگ", playbackAvailable: true, broken: false, kurdishSubtitleStatus: "ready" }],
  };
  const publishing = new SocialPublishingService({ store: queue, adapters: neverPublish, env: { SOCIAL_PUBLISHING_MODE: "DRY_RUN" }, now: () => now });
  const engine = new DailySocialAutomationEngine({ runs, publishing, providers, officialNewsHosts: ["variety.com"], now: () => now });
  try {
    await runRef.delete();
    const run = await engine.runToday(settings);
    assert.equal(run?.status, "complete");
    assert.deepEqual(run?.created, { news: 2, trailer: 2, promotion: 1 });
    let jobs = (await queue.list(100)).filter(job => job.createdBy === `daily-automation:${dayKey}`);
    assert.equal(jobs.length, 5);
    for (const job of [...jobs].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
      await publishing.approveQueued(job.id, "synthetic-owner");
      now = Date.parse(job.scheduledAt) + 60_000;
      assert.equal(await publishing.runOnce(), true);
    }
    jobs = (await queue.list(100)).filter(job => job.createdBy === `daily-automation:${dayKey}`);
    assert.ok(jobs.every(job => job.status === "simulated"));
    assert.equal((await engine.runToday(settings))?.status, "complete");
    assert.equal((await queue.list(100)).filter(job => job.createdBy === `daily-automation:${dayKey}`).length, 5);
  } finally {
    const jobs = await db.collection("socialPublications").where("createdBy", "==", `daily-automation:${dayKey}`).get();
    await Promise.all(jobs.docs.map(document => document.ref.delete()));
    await runRef.delete();
    await deleteApp(app);
  }
});
