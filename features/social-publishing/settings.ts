import type { Express, Request, Response } from "express";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type admin from "firebase-admin";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "./types";

export const SOCIAL_AUTOMATION_SETTINGS_COLLECTION = "socialAutomationSettings";
export const SOCIAL_AUTOMATION_SETTINGS_ID = "global";
const MAX_DAILY_POSTS_PER_KIND = 20;
const MAX_TEXT_LENGTH = 500;

export const SOCIAL_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export const SOCIAL_FORMATS = ["reels", "feed", "stories", "carousel"] as const;
export type SocialWeekday = (typeof SOCIAL_WEEKDAYS)[number];
export type SocialFormat = (typeof SOCIAL_FORMATS)[number];

export interface WeeklyContentSlot {
  id: string;
  category: string;
  format: SocialFormat;
  interactive: boolean;
  count: number;
  platforms: SocialPlatform[];
  times: string[];
}

export interface WeeklyDaySchedule {
  enabled: boolean;
  slots: WeeklyContentSlot[];
}

export interface WeeklyAutomationCalendar {
  dailyTargets: {
    reels: { min: number; max: number };
    feed: { min: number; max: number };
    stories: { min: number; max: number };
    cinemaChatCards: number;
  };
  days: Record<SocialWeekday, WeeklyDaySchedule>;
}

const emptyPlatforms: SocialPlatform[] = [];
const slot = (id: string, category: string, format: SocialFormat, count: number, times: string[], platforms: SocialPlatform[] = emptyPlatforms, interactive = false): WeeklyContentSlot => ({ id, category, format, interactive, count, platforms, times });
const day = (slots: WeeklyContentSlot[]): WeeklyDaySchedule => ({ enabled: true, slots });

export const DEFAULT_WEEKLY_AUTOMATION_CALENDAR: WeeklyAutomationCalendar = {
  dailyTargets: {
    reels: { min: 1, max: 2 }, feed: { min: 1, max: 2 }, stories: { min: 1, max: 2 }, cinemaChatCards: 1,
  },
  days: {
    monday: day([slot("monday-trailers", "Movie clips and trailers", "reels", 2, ["13:00", "19:00"])]),
    tuesday: day([slot("tuesday-verified-news", "Verified foreign movie news", "feed", 1, ["18:00"])]),
    // Interactive story stickers are not enabled by this project’s current platform adapters.
    wednesday: day([slot("wednesday-polls", "Polls and questions (official support required)", "stories", 0, [], emptyPlatforms, true)]),
    thursday: day([slot("thursday-reviews", "Movie reviews: Why watch this movie?", "feed", 1, ["18:00"])]),
    friday: day([slot("friday-memes", "Movie memes and comedy", "reels", 1, ["16:00"]), slot("friday-post", "Movie memes and comedy", "feed", 1, ["20:00"])]),
    saturday: day([slot("saturday-top-five", "Top 5 movie recommendations", "carousel", 1, ["17:00"])]),
    sunday: day([slot("sunday-nostalgia", "Nostalgia and behind-the-scenes", "feed", 1, ["18:00"]), slot("sunday-reel", "Nostalgia and behind-the-scenes", "reels", 1, ["20:00"])]),
  },
};

export interface SocialAutomationSettings {
  version: number;
  dailyCounts: { news: number; trailer: number; promotion: number };
  topics: { regions: Array<"foreign" | "korean" | "chinese">; categories: string[] };
  platforms: Record<SocialPlatform, boolean>;
  schedule: {
    timezone: "Asia/Baghdad";
    startTime: string;
    endTime: string;
    paused: boolean;
  };
  weeklyCalendar: WeeklyAutomationCalendar;
  captions: { news: string; trailer: string; promotion: string };
  design: { template: "cinemachat-cinematic" | "cinemachat-minimal"; includeBranding: boolean };
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_SOCIAL_AUTOMATION_SETTINGS: SocialAutomationSettings = {
  version: 0,
  dailyCounts: { news: 2, trailer: 2, promotion: 1 },
  topics: { regions: ["foreign", "korean", "chinese"], categories: ["news", "trailers", "catalog-promotions"] },
  platforms: { instagram: false, facebook: false, youtube: false, telegram: false },
  schedule: { timezone: "Asia/Baghdad", startTime: "09:00", endTime: "21:00", paused: true },
  weeklyCalendar: DEFAULT_WEEKLY_AUTOMATION_CALENDAR,
  captions: { news: "", trailer: "", promotion: "" },
  design: { template: "cinemachat-cinematic", includeBranding: true },
  updatedAt: null,
  updatedBy: null,
};

/** Checks the configured delivery window in Baghdad's fixed application timezone. */
export function isWithinSocialScheduleWindow(
  schedule: SocialAutomationSettings["schedule"],
  instant: Date,
): boolean {
  if (schedule.paused || !Number.isFinite(instant.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baghdad",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const current = hour * 60 + minute;
  const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export class SocialAutomationSettingsError extends Error {
  readonly status = 503;

  constructor() {
    super("Social automation settings unavailable");
    this.name = "SocialAutomationSettingsError";
  }
}

export class SocialAutomationSettingsConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("Social automation settings changed; reload before saving");
    this.name = "SocialAutomationSettingsConflictError";
  }
}

export interface SocialAutomationSettingsStore {
  get(): Promise<SocialAutomationSettings>;
  save(expectedVersion: number, value: SocialAutomationSettings, updatedBy: string): Promise<SocialAutomationSettings>;
}

export class FirestoreSocialAutomationSettingsStore implements SocialAutomationSettingsStore {
  private readonly appRef: () => admin.app.App | null;

  constructor(appRef: () => admin.app.App | null) {
    this.appRef = appRef;
  }

  private db(): Firestore {
    const app = this.appRef();
    if (!app) throw new SocialAutomationSettingsError();
    try {
      return getFirestore(app) as unknown as Firestore;
    } catch {
      throw new SocialAutomationSettingsError();
    }
  }

  async get(): Promise<SocialAutomationSettings> {
    try {
      const ref = this.db().collection(SOCIAL_AUTOMATION_SETTINGS_COLLECTION).doc(SOCIAL_AUTOMATION_SETTINGS_ID);
      const snapshot = await ref.get();
      return snapshot.exists
        ? { ...DEFAULT_SOCIAL_AUTOMATION_SETTINGS, ...(snapshot.data() as Partial<SocialAutomationSettings>) }
        : structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
    } catch (error) {
      if (error instanceof SocialAutomationSettingsError) throw error;
      throw new SocialAutomationSettingsError();
    }
  }

  async save(expectedVersion: number, value: SocialAutomationSettings, updatedBy: string): Promise<SocialAutomationSettings> {
    try {
      const db = this.db();
      const ref = db.collection(SOCIAL_AUTOMATION_SETTINGS_COLLECTION).doc(SOCIAL_AUTOMATION_SETTINGS_ID);
      return await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists
          ? { ...DEFAULT_SOCIAL_AUTOMATION_SETTINGS, ...(snapshot.data() as Partial<SocialAutomationSettings>) }
          : structuredClone(DEFAULT_SOCIAL_AUTOMATION_SETTINGS);
        if (current.version !== expectedVersion) throw new SocialAutomationSettingsConflictError();
        const next: SocialAutomationSettings = {
          ...value,
          version: current.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy.slice(0, 80),
        };
        transaction.set(ref, next);
        return next;
      });
    } catch (error) {
      if (error instanceof SocialAutomationSettingsError || error instanceof SocialAutomationSettingsConflictError) throw error;
      throw new SocialAutomationSettingsError();
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

const isTime = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function boundedCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_DAILY_POSTS_PER_KIND;
}

function parseWeeklyCalendar(value: unknown): WeeklyAutomationCalendar {
  if (!isRecord(value) || !exactKeys(value, ["dailyTargets", "days"]) || !isRecord(value.dailyTargets) || !exactKeys(value.dailyTargets, ["reels", "feed", "stories", "cinemaChatCards"]) || !isRecord(value.days) || !exactKeys(value.days, [...SOCIAL_WEEKDAYS])) throw new Error("INVALID_WEEKLY_CALENDAR");
  const targets = value.dailyTargets;
  for (const format of ["reels", "feed", "stories"] as const) {
    const target = targets[format];
    if (!isRecord(target) || !exactKeys(target, ["min", "max"]) || !Number.isInteger(target.min) || !Number.isInteger(target.max) || Number(target.min) < 0 || Number(target.max) > 20 || Number(target.min) > Number(target.max)) throw new Error("INVALID_WEEKLY_TARGETS");
  }
  if (!boundedCount(targets.cinemaChatCards)) throw new Error("INVALID_WEEKLY_TARGETS");
  const days = {} as WeeklyAutomationCalendar["days"];
  for (const weekday of SOCIAL_WEEKDAYS) {
    const dayValue = value.days[weekday];
    if (!isRecord(dayValue) || !exactKeys(dayValue, ["enabled", "slots"]) || typeof dayValue.enabled !== "boolean" || !Array.isArray(dayValue.slots) || dayValue.slots.length > 8) throw new Error("INVALID_WEEKLY_DAY");
    const ids = new Set<string>();
    const slots: WeeklyContentSlot[] = dayValue.slots.map((raw) => {
      if (!isRecord(raw) || !exactKeys(raw, ["id", "category", "format", "interactive", "count", "platforms", "times"]) || typeof raw.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(raw.id) || ids.has(raw.id) || typeof raw.category !== "string" || !raw.category.trim() || raw.category.length > 100 || !SOCIAL_FORMATS.includes(raw.format as SocialFormat) || typeof raw.interactive !== "boolean" || !boundedCount(raw.count) || Number(raw.count) > 8 || !Array.isArray(raw.platforms) || raw.platforms.some(platform => !SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) || new Set(raw.platforms).size !== raw.platforms.length || !Array.isArray(raw.times) || raw.times.length !== Number(raw.count) || raw.times.some(time => !isTime(time)) || new Set(raw.times).size !== raw.times.length) throw new Error("INVALID_WEEKLY_SLOT");
      ids.add(raw.id);
      return { id: raw.id, category: raw.category.trim(), format: raw.format as SocialFormat, interactive: raw.interactive, count: Number(raw.count), platforms: [...raw.platforms] as SocialPlatform[], times: [...raw.times] as string[] };
    });
    days[weekday] = { enabled: dayValue.enabled, slots };
  }
  return {
    dailyTargets: {
      reels: { min: Number((targets.reels as Record<string, unknown>).min), max: Number((targets.reels as Record<string, unknown>).max) },
      feed: { min: Number((targets.feed as Record<string, unknown>).min), max: Number((targets.feed as Record<string, unknown>).max) },
      stories: { min: Number((targets.stories as Record<string, unknown>).min), max: Number((targets.stories as Record<string, unknown>).max) },
      cinemaChatCards: Number(targets.cinemaChatCards),
    },
    days,
  };
}

export function parseSocialAutomationSettings(input: unknown): SocialAutomationSettings {
  if (!isRecord(input) || !exactKeys(input, ["version", "dailyCounts", "topics", "platforms", "schedule", "weeklyCalendar", "captions", "design", "updatedAt", "updatedBy"]) || !Number.isInteger(input.version) || Number(input.version) < 0) throw new Error("INVALID_SETTINGS");
  if (!isRecord(input.dailyCounts) || !exactKeys(input.dailyCounts, ["news", "trailer", "promotion"]) || !Object.values(input.dailyCounts).every(boundedCount)) throw new Error("INVALID_DAILY_COUNTS");
  if (!isRecord(input.topics) || !exactKeys(input.topics, ["regions", "categories"])) throw new Error("INVALID_TOPICS");
  const regions = input.topics.regions;
  const categories = input.topics.categories;
  if (!Array.isArray(regions) || regions.some(value => !["foreign", "korean", "chinese"].includes(String(value))) || new Set(regions).size !== regions.length) throw new Error("INVALID_REGIONS");
  if (!Array.isArray(categories) || categories.length > 12 || categories.some(value => typeof value !== "string" || value.length > 60 || !/^[a-z0-9-]+$/.test(value))) throw new Error("INVALID_CATEGORIES");
  if (!isRecord(input.platforms) || !exactKeys(input.platforms, [...SOCIAL_PLATFORMS]) || Object.values(input.platforms).some(value => typeof value !== "boolean")) throw new Error("INVALID_PLATFORMS");
  // The global input sanitizer HTML-escapes slashes before this route runs.
  // Accept only that exact escaped form and normalize it back to the canonical
  // IANA timezone; every other timezone and malformed value remains rejected.
  const scheduleTimezone = isRecord(input.schedule) && input.schedule.timezone === "Asia&#x2F;Baghdad"
    ? "Asia/Baghdad"
    : isRecord(input.schedule) ? input.schedule.timezone : undefined;
  if (!isRecord(input.schedule) || !exactKeys(input.schedule, ["timezone", "startTime", "endTime", "paused"]) || scheduleTimezone !== "Asia/Baghdad" || !isTime(input.schedule.startTime) || !isTime(input.schedule.endTime) || typeof input.schedule.paused !== "boolean" || input.schedule.startTime === input.schedule.endTime) throw new Error("INVALID_SCHEDULE");
  if (!isRecord(input.captions) || !exactKeys(input.captions, ["news", "trailer", "promotion"]) || Object.values(input.captions).some(value => typeof value !== "string" || value.length > MAX_TEXT_LENGTH)) throw new Error("INVALID_CAPTIONS");
  if (!isRecord(input.design) || !exactKeys(input.design, ["template", "includeBranding"]) || !["cinemachat-cinematic", "cinemachat-minimal"].includes(String(input.design.template)) || typeof input.design.includeBranding !== "boolean") throw new Error("INVALID_DESIGN");

  return {
    version: Number(input.version),
    dailyCounts: { news: Number(input.dailyCounts.news), trailer: Number(input.dailyCounts.trailer), promotion: Number(input.dailyCounts.promotion) },
    topics: { regions: [...regions] as SocialAutomationSettings["topics"]["regions"], categories: [...categories] as string[] },
    platforms: { ...(input.platforms as Record<SocialPlatform, boolean>) },
    schedule: { timezone: "Asia/Baghdad", startTime: input.schedule.startTime, endTime: input.schedule.endTime, paused: input.schedule.paused },
    weeklyCalendar: parseWeeklyCalendar(input.weeklyCalendar),
    captions: { news: input.captions.news as string, trailer: input.captions.trailer as string, promotion: input.captions.promotion as string },
    design: { template: input.design.template as SocialAutomationSettings["design"]["template"], includeBranding: input.design.includeBranding },
    updatedAt: null,
    updatedBy: null,
  };
}

export function registerSocialAutomationSettingsRoutes(
  app: Express,
  options: { store: SocialAutomationSettingsStore; resolveAdmin: (request: Request) => string | null; onSaved?: (settings: SocialAutomationSettings) => Promise<unknown> },
): void {
  const requireAdmin = (request: Request, response: Response): string | null => {
    const username = options.resolveAdmin(request);
    if (!username) response.status(401).json({ success: false, error: "Admin authentication required" });
    return username;
  };
  const fail = (response: Response, error: unknown) => {
    if (error instanceof SocialAutomationSettingsConflictError) {
      response.status(error.status).json({ success: false, error: error.message });
    } else if (error instanceof SocialAutomationSettingsError) {
      response.status(error.status).json({ success: false, error: "Social automation settings unavailable" });
    } else if (error instanceof Error && error.message.startsWith("INVALID_")) {
      response.status(400).json({ success: false, error: "Invalid social automation settings" });
    } else {
      response.status(500).json({ success: false, error: "Social automation settings request failed" });
    }
  };

  app.get("/api/admin/social-automation/settings", async (request, response) => {
    if (!requireAdmin(request, response)) return;
    try {
      response.setHeader("Cache-Control", "no-store");
      response.json({ success: true, settings: await options.store.get() });
    } catch (error) { fail(response, error); }
  });

  app.put("/api/admin/social-automation/settings", async (request, response) => {
    const username = requireAdmin(request, response);
    if (!username) return;
    try {
      const settings = parseSocialAutomationSettings(request.body);
      const saved = await options.store.save(settings.version, settings, username);
      response.setHeader("Cache-Control", "no-store");
      let reconciliation: unknown;
      if (options.onSaved) {
        try { reconciliation = await options.onSaved(saved); }
        catch { reconciliation = { error: "PENDING_JOBS_RECONCILIATION_FAILED" }; }
      }
      response.json({ success: true, settings: saved, ...(reconciliation === undefined ? {} : { reconciliation }) });
    } catch (error) { fail(response, error); }
  });
}
