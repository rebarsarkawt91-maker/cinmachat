import {
  baghdadDayKey,
  baghdadWallTimeToDate,
} from "./dailyAutomation";
import type { SocialAutomationSettings, SocialWeekday, WeeklyContentSlot } from "./settings";
import { SOCIAL_WEEKDAYS } from "./settings";
import type { SocialPlatform, SocialPublicationInput, SocialPublicationJob } from "./types";
import { SocialPublishingService } from "./service";
import { supportsWeeklyFormat } from "./weeklyCalendarPreview";

export { supportsWeeklyFormat } from "./weeklyCalendarPreview";

const WEEKDAY_INDEX = new Map<SocialWeekday, number>(SOCIAL_WEEKDAYS.map((weekday, index) => [weekday, index]));
const OFFICIAL_NEWS_HOSTS = ["variety.com", "deadline.com", "hollywoodreporter.com", "soompi.com", "koreaherald.com"];

export interface WeeklyDraftContext {
  scheduleId: string;
  weekday: SocialWeekday;
  slot: WeeklyContentSlot;
  itemIndex: number;
  scheduledAt: string;
  platforms: SocialPlatform[];
}

export type WeeklyContentProvider = (context: WeeklyDraftContext) => Promise<SocialPublicationInput | null>;

export interface WeeklyAutomationResult {
  scheduleId: string;
  created: number;
  retained: number;
  cancelled: number;
  skipped: number;
  unavailable: number;
  jobIds: string[];
}

function weekdayForBaghdad(dayKey: string): SocialWeekday {
  const date = baghdadWallTimeToDate(dayKey, "12:00");
  const value = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Baghdad", weekday: "long" }).format(date).toLowerCase();
  if (!SOCIAL_WEEKDAYS.includes(value as SocialWeekday)) throw new Error("INVALID_WEEKDAY");
  return value as SocialWeekday;
}

export function baghdadWeekStartKey(instant: Date): string {
  const today = baghdadDayKey(instant);
  const weekday = weekdayForBaghdad(today);
  const offset = WEEKDAY_INDEX.get(weekday) || 0;
  const monday = baghdadWallTimeToDate(today, "12:00");
  monday.setUTCDate(monday.getUTCDate() - offset);
  return baghdadDayKey(monday);
}

function planIdentity(job: SocialPublicationJob | SocialPublicationInput): string | null {
  const automation = job.automation;
  return automation ? `${automation.scheduleId}:${automation.weekday}:${automation.slotId}` : null;
}

function samePendingPlan(existing: SocialPublicationJob, expected: SocialPublicationInput): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return existing.scheduledAt === new Date(expected.scheduledAt).toISOString() &&
    existing.title === expected.title && existing.caption === expected.caption &&
    existing.description === expected.description &&
    canonical([...existing.platforms].sort()) === canonical([...expected.platforms].sort()) &&
    canonical(existing.media || null) === canonical(expected.media || null) &&
    canonical(existing.provenance || null) === canonical(expected.provenance || null);
}

function verifiedForCategory(slot: WeeklyContentSlot, draft: SocialPublicationInput): boolean {
  if (!draft.provenance || !/[\u0600-\u06FF]/.test(draft.caption) || draft.caption.trim().length < 12) return false;
  if (/trailer|clip/i.test(slot.category)) return draft.provenance.source === "licensed-trailer" && Boolean(draft.provenance.licenseId?.trim()) && draft.media?.type === "video" && draft.media.rightsConfirmed === true;
  if (/news|هەواڵ/i.test(slot.category)) {
    if (draft.provenance.source !== "official-news" || !draft.provenance.sourceUrl) return false;
    try {
      const article = new URL(draft.provenance.sourceUrl);
      return article.protocol === "https:" && OFFICIAL_NEWS_HOSTS.some(host => article.hostname === host || article.hostname.endsWith(`.${host}`));
    } catch { return false; }
  }
  if (/cinemachat/i.test(slot.category)) return draft.provenance.source === "cinemachat-catalog" && Boolean(draft.provenance.catalogTitleId);
  return draft.provenance.source === "verified-editorial";
}

/** Reconciles only this weekly automation's pending jobs. Terminal jobs are retained and never re-enqueued. */
export class WeeklySocialAutomationEngine {
  constructor(private readonly options: {
    publishing: SocialPublishingService;
    provider: WeeklyContentProvider;
    now?: () => number;
  }) {}

  async reconcile(settings: SocialAutomationSettings, weekStart = baghdadWeekStartKey(new Date(this.options.now?.() ?? Date.now()))): Promise<WeeklyAutomationResult> {
    const now = this.options.now?.() ?? Date.now();
    const expected = new Map<string, SocialPublicationInput>();
    let skipped = 0;
    let unavailable = 0;
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const dayDate = baghdadWallTimeToDate(weekStart, "12:00");
      dayDate.setUTCDate(dayDate.getUTCDate() + dayOffset);
      const dayKey = baghdadDayKey(dayDate);
      const weekday = weekdayForBaghdad(dayKey);
      const day = settings.weeklyCalendar.days[weekday];
      if (!day.enabled) continue;
      for (const slot of day.slots) {
        const platforms = slot.platforms.filter(platform => settings.platforms[platform] && supportsWeeklyFormat(platform, slot.format, slot.interactive));
        if (slot.count && !platforms.length) { unavailable += slot.count; continue; }
        for (let index = 0; index < slot.count; index += 1) {
          const at = baghdadWallTimeToDate(dayKey, slot.times[index]);
          if (at.getTime() <= now) { skipped += 1; continue; }
          const slotId = `${slot.id}-${index + 1}`;
          const draft = await this.options.provider({ scheduleId: weekStart, weekday, slot, itemIndex: index, scheduledAt: at.toISOString(), platforms });
          if (!draft) { skipped += 1; continue; }
          if (draft.platforms.some(platform => !platforms.includes(platform)) || !verifiedForCategory(slot, draft)) { skipped += 1; continue; }
          const input: SocialPublicationInput = {
            ...draft,
            platforms,
            scheduledAt: at.toISOString(),
            automation: { scheduleId: weekStart, weekday, slotId, format: slot.format, category: slot.category },
          };
          expected.set(`${weekStart}:${weekday}:${slotId}`, input);
        }
      }
    }

    const current = (await this.options.publishing.list(100)).filter(job => job.automation?.scheduleId === weekStart);
    const manualOverrides = new Map(current.flatMap(job => {
      const identity = planIdentity(job);
      return identity && job.automation?.adminOverride && ["queued", "retrying", "processing"].includes(job.status)
        ? [[identity, job] as const] : [];
    }));
    const pendingIdentities = new Set(current.filter(job => ["queued", "retrying", "processing"].includes(job.status)).map(planIdentity).filter((value): value is string => Boolean(value)));
    const terminalIdentities = new Set(current.filter(job => !["queued", "retrying", "processing"].includes(job.status) && !pendingIdentities.has(planIdentity(job) || "")).map(planIdentity).filter((value): value is string => Boolean(value)));
    let cancelled = 0;
    for (const job of current) {
      if (!["queued", "retrying"].includes(job.status)) continue;
      if (job.automation?.adminOverride) continue;
      const identity = planIdentity(job);
      const target = identity ? expected.get(identity) : undefined;
      if (!target || !samePendingPlan(job, target)) {
        if (await this.options.publishing.cancelQueued(job.id)) cancelled += 1;
      }
    }

    let created = 0;
    let retained = 0;
    const jobIds: string[] = [];
    for (const [identity, input] of expected) {
      const manual = manualOverrides.get(identity);
      if (manual) {
        retained += 1;
        jobIds.push(manual.id);
        continue;
      }
      if (terminalIdentities.has(identity)) {
        const terminal = current.find(job => planIdentity(job) === identity && job.status !== "cancelled") || current.find(job => planIdentity(job) === identity);
        if (terminal) jobIds.push(terminal.id);
        retained += 1;
        continue;
      }
      const result = await this.options.publishing.enqueue(input, `weekly-automation:${weekStart}`);
      if (result.duplicate) retained += 1;
      else created += 1;
      jobIds.push(result.job.id);
    }
    return { scheduleId: weekStart, created, retained, cancelled, skipped, unavailable, jobIds };
  }
}
