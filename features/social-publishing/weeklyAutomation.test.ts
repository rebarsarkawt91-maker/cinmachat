import assert from "node:assert/strict";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { DEFAULT_SOCIAL_AUTOMATION_SETTINGS } from "./settings";
import { FirestoreSocialPublicationStore } from "./store";
import { SocialPublishingService } from "./service";
import { createSocialAdapters } from "./adapters";
import type { SocialPublicationInput } from "./types";
import { baghdadWeekStartKey, supportsWeeklyFormat, WeeklySocialAutomationEngine, type WeeklyDraftContext } from "./weeklyAutomation";

test("weekly platform capability matrix blocks unsupported and interactive Story formats", () => {
  assert.equal(supportsWeeklyFormat("instagram", "reels", false), true);
  assert.equal(supportsWeeklyFormat("instagram", "carousel", false), false);
  assert.equal(supportsWeeklyFormat("facebook", "feed", false), true);
  assert.equal(supportsWeeklyFormat("telegram", "feed", false), true);
  assert.equal(supportsWeeklyFormat("youtube", "reels", false), false);
  assert.equal(supportsWeeklyFormat("instagram", "stories", true), false);
  assert.equal(baghdadWeekStartKey(new Date("2026-11-19T10:00:00.000Z")), "2026-11-16");
});

const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || "");
const demoProject = String(process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "");
const emulatorOnly = /^127\.0\.0\.1:\d+$/.test(emulatorHost) && /^demo-[a-z0-9-]+$/i.test(demoProject);

test("Firestore Emulator simulates seven weekly days, reconciles edits, cancellation and DRY_RUN without duplicates", { skip: !emulatorOnly }, async () => {
  let now = Date.parse("2026-11-15T00:00:00.000Z"); // Sunday Baghdad, before the Monday schedule begins.
  const weekStart = "2026-11-16";
  const isolatedProject = `${demoProject}-weekly-${Date.now()}`;
  const app = initializeApp({ projectId: isolatedProject }, `weekly-automation-test-${Date.now()}`);
  const db = getFirestore(app);
  const queue = new FirestoreSocialPublicationStore(() => app as any);
  const settings = structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
  settings.schedule.paused = false;
  settings.platforms = { instagram: true, facebook: true, youtube: true, telegram: true };
  const platformByFormat = { reels: "instagram", feed: "telegram", stories: "instagram", carousel: "instagram" } as const;
  for (const day of Object.values(settings.weeklyCalendar.days)) {
    for (const slot of day.slots) slot.platforms = [platformByFormat[slot.format]];
  }
  const wednesday = settings.weeklyCalendar.days.wednesday.slots[0];
  wednesday.count = 1; wednesday.times = ["12:00"];
  const noPublish = createSocialAdapters({});
  const service = new SocialPublishingService({ store: queue, adapters: noPublish, env: { SOCIAL_PUBLISHING_MODE: "DRY_RUN" }, now: () => now });
  const provider = async ({ scheduleId, weekday, slot, itemIndex, scheduledAt, platforms }: WeeklyDraftContext): Promise<SocialPublicationInput> => {
    const trailer = /trailer|clip/i.test(slot.category);
    const news = /news/i.test(slot.category);
    return {
      contentKind: trailer ? "trailer" : news ? "news" : "promotion",
      platforms,
      title: `${weekday} synthetic ${itemIndex + 1}`,
      caption: `پوختەی ساختەی پشتڕاستکراو بۆ ${weekday} ژمارە ${itemIndex + 1}، تەنها بۆ تاقیکردنەوەی DRY_RUN.`,
      scheduledAt,
      ...(trailer ? { media: { type: "video", url: `https://media.example.test/${scheduleId}-${weekday}-${itemIndex}.mp4`, rightsConfirmed: true } as const } : {}),
      provenance: trailer
        ? { source: "licensed-trailer", licenseId: `synthetic-license-${weekday}-${itemIndex}`, verifiedAt: new Date(now).toISOString() }
        : news
          ? { source: "official-news", sourceUrl: "https://variety.com/synthetic-test", verifiedAt: new Date(now).toISOString() }
          : { source: "verified-editorial", verifiedAt: new Date(now).toISOString() },
    };
  };
  const engine = new WeeklySocialAutomationEngine({ publishing: service, provider, now: () => now });
  const createdBy = `weekly-automation:${weekStart}`;
  try {
    const first = await engine.reconcile(settings, weekStart);
    assert.equal(first.created, 8);
    assert.equal(first.unavailable, 2); // Interactive Stories and carousel are not implemented by the current adapters.
    const second = await engine.reconcile(settings, weekStart);
    assert.equal(second.created, 0);
    assert.equal(second.retained, 8);

    let jobs = (await queue.list(100)).filter(job => job.createdBy === createdBy);
    assert.equal(jobs.length, 8);
    assert.equal(new Set(jobs.map(job => job.automation?.slotId)).size, 8);
    assert.deepEqual(new Set(jobs.map(job => job.automation?.weekday)), new Set(["monday", "tuesday", "thursday", "friday", "sunday"]));

    const monday = settings.weeklyCalendar.days.monday.slots[0];
    monday.times[0] = "14:00";
    const adjusted = await engine.reconcile(settings, weekStart);
    assert.equal(adjusted.cancelled, 1);
    assert.equal(adjusted.created, 1);

    jobs = (await queue.list(100)).filter(job => job.createdBy === createdBy && ["queued", "retrying"].includes(job.status));
    const cancelTarget = jobs.find(job => job.automation?.weekday === "tuesday");
    assert.ok(cancelTarget);
    assert.equal(await service.cancelQueued(cancelTarget.id), true);
    const afterCancel = await engine.reconcile(settings, weekStart);
    assert.equal(afterCancel.created, 0);
    assert.equal((await queue.get(cancelTarget.id))?.status, "cancelled");

    jobs = (await queue.list(100)).filter(job => job.createdBy === createdBy && job.status === "queued");
    const editTarget = jobs.find(job => job.automation?.weekday === "thursday");
    assert.ok(editTarget);
    const newSchedule = new Date(Date.parse(editTarget.scheduledAt) + 30 * 60_000).toISOString();
    await service.updateQueued(editTarget.id, { title: editTarget.title, caption: editTarget.caption, description: editTarget.description, scheduledAt: newSchedule });
    await engine.reconcile(settings, weekStart);
    assert.equal((await queue.get(editTarget.id))?.scheduledAt, newSchedule);
    assert.equal((await queue.get(editTarget.id))?.automation?.adminOverride, true);

    jobs = (await queue.list(100)).filter(job => job.createdBy === createdBy && job.status === "queued").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    for (const job of jobs) {
      await service.approveQueued(job.id, "synthetic-owner");
      now = Date.parse(job.scheduledAt) + 60_000;
      assert.equal(await service.runOnce(), true);
    }
    const completed = (await queue.list(100)).filter(job => job.createdBy === createdBy);
    assert.equal(completed.filter(job => job.status === "simulated").length, 7);
    assert.equal(completed.filter(job => job.status === "cancelled").length, 2); // rescheduled old slot + explicit cancellation
    assert.equal(service.readiness().mode, "DRY_RUN");
    assert.equal(service.readiness().livePublishingEnabled, false);
    const afterPublishedReconcile = await engine.reconcile(settings, weekStart);
    assert.equal(afterPublishedReconcile.created, 0);
    assert.equal((await queue.list(100)).filter(job => job.createdBy === createdBy).length, 9);
  } finally {
    const generated = await db.collection("socialPublications").where("createdBy", "==", createdBy).get();
    await Promise.all(generated.docs.map(document => document.ref.delete()));
    await deleteApp(app);
  }
});
