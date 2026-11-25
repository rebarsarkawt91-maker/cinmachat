import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  DEFAULT_SOCIAL_AUTOMATION_SETTINGS,
  FirestoreSocialAutomationSettingsStore,
  isWithinSocialScheduleWindow,
  parseSocialAutomationSettings,
  registerSocialAutomationSettingsRoutes,
  SOCIAL_AUTOMATION_SETTINGS_COLLECTION,
  SOCIAL_AUTOMATION_SETTINGS_ID,
  SocialAutomationSettingsConflictError,
  type SocialAutomationSettings,
  type SocialAutomationSettingsStore,
} from "./settings";
import { FirestoreSocialPublicationStore, SOCIAL_PUBLICATIONS_COLLECTION } from "./store";
import type { SocialPublicationJob } from "./types";
import { SocialPublishingService } from "./service";
import { createSocialAdapters } from "./adapters";
import type { AddressInfo } from "node:net";

class MemorySettingsStore implements SocialAutomationSettingsStore {
  value = structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
  async get() { return structuredClone(this.value); }
  async save(expectedVersion: number, value: SocialAutomationSettings, updatedBy: string) {
    if (this.value.version !== expectedVersion) throw new SocialAutomationSettingsConflictError();
    this.value = { ...value, version: expectedVersion + 1, updatedAt: new Date().toISOString(), updatedBy };
    return structuredClone(this.value);
  }
}

test("settings accept bounded values and reject secret or unknown fields", () => {
  const input = structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
  const parsed = parseSocialAutomationSettings(input);
  assert.deepEqual(parsed.dailyCounts, { news: 2, trailer: 2, promotion: 1 });
  assert.equal(parsed.schedule.timezone, "Asia/Baghdad");
  const sanitizedTimezone = structuredClone(input);
  sanitizedTimezone.schedule.timezone = "Asia&#x2F;Baghdad" as "Asia/Baghdad";
  assert.equal(parseSocialAutomationSettings(sanitizedTimezone).schedule.timezone, "Asia/Baghdad");
  assert.throws(() => parseSocialAutomationSettings({ ...input, accessToken: "should-never-persist" }));
  assert.throws(() => parseSocialAutomationSettings({ ...input, dailyCounts: { news: 21, trailer: 2, promotion: 1 } }));
  assert.throws(() => parseSocialAutomationSettings({ ...input, schedule: { ...input.schedule, timezone: "UTC" } }));
});

test("weekly calendar validates all days, counts, formats, platforms and Baghdad times", () => {
  const input = structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
  const parsed = parseSocialAutomationSettings(input);
  assert.equal(parsed.weeklyCalendar.dailyTargets.reels.min, 1);
  assert.equal(parsed.weeklyCalendar.dailyTargets.reels.max, 2);
  assert.equal(parsed.weeklyCalendar.dailyTargets.cinemaChatCards, 1);
  assert.equal(parsed.weeklyCalendar.days.monday.slots[0].format, "reels");
  assert.equal(parsed.weeklyCalendar.days.wednesday.slots[0].interactive, true);
  const invalid = structuredClone(input);
  invalid.weeklyCalendar.days.monday.slots[0].times.pop();
  assert.throws(() => parseSocialAutomationSettings(invalid), /INVALID_WEEKLY_SLOT/);
});

test("scheduler respects Baghdad delivery windows, midnight crossover, and pause", () => {
  const schedule = { ...DEFAULT_SOCIAL_AUTOMATION_SETTINGS.schedule, startTime: "09:00", endTime: "21:00", paused: false };
  assert.equal(isWithinSocialScheduleWindow(schedule, new Date("2026-11-18T06:00:00.000Z")), true);
  assert.equal(isWithinSocialScheduleWindow(schedule, new Date("2026-11-18T18:00:00.000Z")), false);
  const overnight = { ...schedule, startTime: "22:00", endTime: "06:00" };
  assert.equal(isWithinSocialScheduleWindow(overnight, new Date("2026-11-18T20:30:00.000Z")), true);
  assert.equal(isWithinSocialScheduleWindow(overnight, new Date("2026-11-18T02:00:00.000Z")), true);
  assert.equal(isWithinSocialScheduleWindow(overnight, new Date("2026-11-18T04:00:00.000Z")), false);
  assert.equal(isWithinSocialScheduleWindow({ ...schedule, paused: true }, new Date("2026-11-18T06:00:00.000Z")), false);
});

test("settings routes are admin-only and save with optimistic versioning", async () => {
  const app = express();
  app.use(express.json());
  const store = new MemorySettingsStore();
  registerSocialAutomationSettingsRoutes(app, {
    store,
    resolveAdmin: request => request.headers["x-test-admin"] === "owner" ? "admin" : null,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/social-automation/settings`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const get = await fetch(url, { headers: { "X-Test-Admin": "owner" } });
    assert.equal(get.status, 200);
    const settings = (await get.json() as any).settings;
    settings.dailyCounts.news = 3;
    const saved = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-Test-Admin": "owner" }, body: JSON.stringify(settings) });
    assert.equal(saved.status, 200);
    const stored = (await saved.json() as any).settings;
    assert.equal(stored.version, 1);
    assert.equal(stored.dailyCounts.news, 3);
    const stale = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-Test-Admin": "owner" }, body: JSON.stringify(settings) });
    assert.equal(stale.status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || "");
const demoProject = String(process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "");
const emulatorOnly = /^127\.0\.0\.1:\d+$/.test(emulatorHost) && /^demo-[a-z0-9-]+$/i.test(demoProject);

test("Firestore settings persist only against an explicit demo-project emulator", { skip: !emulatorOnly }, async () => {
  const isolatedProject = `${demoProject}-settings-${Date.now()}`;
  const app = initializeApp({ projectId: isolatedProject }, `social-settings-test-${Date.now()}`);
  const db = getFirestore(app);
  const ref = db.collection(SOCIAL_AUTOMATION_SETTINGS_COLLECTION).doc(SOCIAL_AUTOMATION_SETTINGS_ID);
  const store = new FirestoreSocialAutomationSettingsStore(() => app as any);
  try {
    await ref.delete();
    const initial = await store.get();
    assert.equal(initial.version, 0);
    const changed = { ...initial, dailyCounts: { ...initial.dailyCounts, promotion: 4 }, weeklyCalendar: { ...initial.weeklyCalendar, days: { ...initial.weeklyCalendar.days, monday: { ...initial.weeklyCalendar.days.monday, slots: initial.weeklyCalendar.days.monday.slots.map((slot, index) => index === 0 ? { ...slot, category: "Verified scheduled trailer news" } : slot) } } } };
    const saved = await store.save(initial.version, changed, "synthetic-admin");
    assert.equal(saved.version, 1);
    assert.equal((await store.get()).dailyCounts.promotion, 4);
    assert.equal((await store.get()).weeklyCalendar.days.monday.slots[0].category, "Verified scheduled trailer news");
    await assert.rejects(store.save(initial.version, changed, "synthetic-admin"), SocialAutomationSettingsConflictError);
    const snapshot = await ref.get();
    assert.equal(snapshot.get("updatedBy"), "synthetic-admin");
    assert.equal(snapshot.get("dailyCounts.promotion"), 4);
  } finally {
    await ref.delete();
    await deleteApp(app);
  }
});

test("Firestore social queue persists and cancels synthetic jobs in the demo emulator", { skip: !emulatorOnly }, async () => {
  const isolatedProject = `${demoProject}-queue-${Date.now()}`;
  const app = initializeApp({ projectId: isolatedProject }, `social-queue-test-${Date.now()}`);
  const db = getFirestore(app);
  const id = `synthetic-${Date.now()}`;
  const ref = db.collection(SOCIAL_PUBLICATIONS_COLLECTION).doc(id);
  const store = new FirestoreSocialPublicationStore(() => app as any);
  const now = new Date().toISOString();
  const job: SocialPublicationJob = {
    id,
    contentKind: "promotion",
    platforms: ["telegram"],
    caption: "تاقیکردنەوەی synthetic",
    title: "فیلمی تاقیکردنەوە",
    scheduledAt: new Date(Date.now() - 1_000).toISOString(),
    status: "queued",
    approvalStatus: "pending",
    platformStatus: { telegram: { status: "queued", attempts: 0, updatedAt: now } },
    createdAt: now,
    updatedAt: now,
    createdBy: "synthetic-admin",
    attempts: 0,
    dueAt: Date.now() - 1_000,
  };
  try {
    assert.equal((await store.enqueue(job)).duplicate, false);
    assert.equal((await store.get(id))?.contentKind, "promotion");
    assert.ok((await store.list(10)).some(item => item.id === id));
    assert.deepEqual((await store.list(10, { start: job.scheduledAt, end: now })).map(item => item.id), [id]);
    assert.deepEqual(await store.list(10, { start: new Date(Date.parse(job.scheduledAt) - 60_000).toISOString(), end: job.scheduledAt }), []);
    const service = new SocialPublishingService({ store, adapters: createSocialAdapters({}), env: {} });
    assert.equal(await service.runOnce(), false, "Firestore must not claim an unapproved publication");
    await service.approveQueued(id, "synthetic-admin");
    assert.equal(await service.runOnce(), true);
    assert.equal((await store.get(id))?.status, "simulated");
    assert.equal(await store.delete(id), false);
    assert.equal((await store.get(id))?.status, "simulated");
  } finally {
    await ref.delete();
    await deleteApp(app);
  }
});
