import { createHash } from "node:crypto";
import type {
  PlatformDelivery,
  SocialAdapters,
  SocialPlatform,
  SocialPlatformReadiness,
  SocialPublicationInput,
  SocialPublicationJob,
  SocialPublishingReadiness,
} from "./types";
import { SOCIAL_PLATFORMS } from "./types";
import { SocialProviderError } from "./adapters";
import { baghdadDayKey, baghdadWallTimeToDate } from "./dailyAutomation";
import {
  TERMINAL_DUE_AT,
  type SocialPublicationStore,
} from "./store";

const MAX_CAPTION_LENGTH = 5000;
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60 * 1000;
const DEFAULT_MODE = "DRY_RUN";

export interface SocialPublishingServiceOptions {
  store: SocialPublicationStore;
  adapters: SocialAdapters;
  loadConnectedAdapters?: () => Promise<SocialAdapters>;
  env?: Record<string, string | undefined>;
  now?: () => number;
  allowLive?: boolean;
}

export class SocialPublishingInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "SocialPublishingInputError";
  }
}

function stableJobId(input: SocialPublicationInput): string {
  const canonical = JSON.stringify({
    contentKind: input.contentKind || "",
    automation: input.automation || null,
    platforms: [...input.platforms].sort(),
    caption: input.caption,
    title: input.title || "",
    description: input.description || "",
    media: input.media || null,
    provenance: input.provenance || null,
    scheduledMinute: Math.floor(Date.parse(input.scheduledAt) / 60_000),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function normalizeInput(raw: SocialPublicationInput): SocialPublicationInput {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.platforms)) {
    throw new SocialPublishingInputError("Invalid publication");
  }
  const platforms = [...new Set(raw.platforms)];
  if (
    !platforms.length ||
    platforms.some((platform) => !SOCIAL_PLATFORMS.includes(platform as SocialPlatform))
  ) {
    throw new SocialPublishingInputError("Unsupported publishing platform");
  }
  if (typeof raw.caption !== "string" || !raw.caption.trim() || raw.caption.length > MAX_CAPTION_LENGTH) {
    throw new SocialPublishingInputError("Caption is required and must be 5000 characters or fewer");
  }
  const scheduledAt = new Date(raw.scheduledAt);
  if (!raw.scheduledAt || !Number.isFinite(scheduledAt.getTime())) {
    throw new SocialPublishingInputError("A valid scheduledAt timestamp is required");
  }
  if (raw.title !== undefined && (typeof raw.title !== "string" || raw.title.length > 200)) {
    throw new SocialPublishingInputError("Invalid publication title");
  }
  if (raw.description !== undefined && (typeof raw.description !== "string" || raw.description.length > 5000)) {
    throw new SocialPublishingInputError("Invalid publication description");
  }
  let provenance: SocialPublicationInput["provenance"];
  if (raw.provenance !== undefined) {
    const value = raw.provenance as Record<string, unknown>;
    if (!value || !["official-news", "licensed-trailer", "cinemachat-catalog", "verified-editorial"].includes(String(value.source)) || typeof value.verifiedAt !== "string" || !Number.isFinite(Date.parse(value.verifiedAt))) {
      throw new SocialPublishingInputError("Invalid content verification data");
    }
    if (value.sourceUrl !== undefined) {
      try {
        const url = new URL(String(value.sourceUrl));
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid");
      } catch { throw new SocialPublishingInputError("Invalid verified source URL"); }
    }
    if (value.licenseId !== undefined && (typeof value.licenseId !== "string" || !value.licenseId.trim() || value.licenseId.length > 160)) throw new SocialPublishingInputError("Invalid media license reference");
    if (value.catalogTitleId !== undefined && (typeof value.catalogTitleId !== "string" || value.catalogTitleId.length > 160)) throw new SocialPublishingInputError("Invalid catalog title reference");
    if (value.kurdishSubtitleStatus !== undefined && !["available", "unavailable", "unknown"].includes(String(value.kurdishSubtitleStatus))) throw new SocialPublishingInputError("Invalid subtitle verification state");
    provenance = {
      source: value.source as NonNullable<SocialPublicationInput["provenance"]>["source"],
      verifiedAt: value.verifiedAt,
      ...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl.slice(0, 2048) } : {}),
      ...(typeof value.licenseId === "string" ? { licenseId: value.licenseId.slice(0, 160) } : {}),
      ...(typeof value.catalogTitleId === "string" ? { catalogTitleId: value.catalogTitleId.slice(0, 160) } : {}),
      ...(typeof value.kurdishSubtitleStatus === "string" ? { kurdishSubtitleStatus: value.kurdishSubtitleStatus as "available" | "unavailable" | "unknown" } : {}),
    };
  }
  let automation: SocialPublicationInput["automation"];
  if (raw.automation !== undefined) {
    const value = raw.automation as Record<string, unknown>;
    if (!value || typeof value.scheduleId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.scheduleId) || typeof value.weekday !== "string" || !/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(value.weekday) || typeof value.slotId !== "string" || !/^[a-z0-9-]{1,64}$/.test(value.slotId) || !["reels", "feed", "stories", "carousel"].includes(String(value.format)) || typeof value.category !== "string" || !value.category.trim() || value.category.length > 100) throw new SocialPublishingInputError("Invalid automation schedule metadata");
    if (value.adminOverride !== undefined && typeof value.adminOverride !== "boolean") throw new SocialPublishingInputError("Invalid automation override marker");
    automation = { scheduleId: value.scheduleId, weekday: value.weekday, slotId: value.slotId, format: value.format as NonNullable<SocialPublicationInput["automation"]>["format"], category: value.category.trim(), ...(value.adminOverride === true ? { adminOverride: true } : {}) };
  }
  let media = raw.media;
  if (media !== undefined) {
    if (!media || !["text", "image", "video"].includes(media.type)) {
      throw new SocialPublishingInputError("Invalid publication media");
    }
    if (media.type !== "text" && media.rightsConfirmed !== true) {
      throw new SocialPublishingInputError("Media publication rights must be confirmed");
    }
    if (media.url !== undefined && (typeof media.url !== "string" || media.url.length > 2048)) {
      throw new SocialPublishingInputError("Invalid media URL");
    }
    if (media.url) {
      try {
        const mediaUrl = new URL(media.url.trim());
        if (mediaUrl.protocol !== "https:" || mediaUrl.username || mediaUrl.password) {
          throw new Error("invalid");
        }
      } catch {
        throw new SocialPublishingInputError("Media URLs must use HTTPS and cannot contain credentials");
      }
    }
    if (media.storagePath !== undefined && (typeof media.storagePath !== "string" || media.storagePath.length > 300)) {
      throw new SocialPublishingInputError("Invalid media storage path");
    }
    if (media.mimeType !== undefined && (typeof media.mimeType !== "string" || media.mimeType.length > 100)) {
      throw new SocialPublishingInputError("Invalid media type");
    }
    media = {
      type: media.type,
      ...(media.rightsConfirmed === true ? { rightsConfirmed: true } : {}),
      ...(media.url ? { url: media.url.trim() } : {}),
      ...(media.storagePath ? { storagePath: media.storagePath.trim() } : {}),
      ...(media.mimeType ? { mimeType: media.mimeType.trim().toLowerCase() } : {}),
    };
  }
  return {
    ...(raw.contentKind && ["news", "trailer", "promotion"].includes(raw.contentKind)
      ? { contentKind: raw.contentKind }
      : {}),
    ...(provenance ? { provenance } : {}),
    ...(automation ? { automation } : {}),
    platforms: platforms as SocialPlatform[],
    caption: raw.caption.trim(),
    ...(raw.title?.trim() ? { title: raw.title.trim() } : {}),
    ...(raw.description?.trim() ? { description: raw.description.trim() } : {}),
    ...(media ? { media } : {}),
    scheduledAt: scheduledAt.toISOString(),
  };
}

function jobStatus(deliveries: Partial<Record<SocialPlatform, PlatformDelivery>>): SocialPublicationJob["status"] {
  const values = Object.values(deliveries);
  if (values.some((delivery) => delivery?.status === "retrying")) return "retrying";
  if (values.every((delivery) => delivery?.status === "simulated")) return "simulated";
  if (values.every((delivery) => delivery?.status === "succeeded")) return "succeeded";
  if (values.every((delivery) => delivery?.status === "failed")) return "failed";
  if (values.some((delivery) => delivery?.status === "succeeded" || delivery?.status === "simulated")) return "partial";
  return "failed";
}

function safeErrorCode(error: unknown): string {
  if (error instanceof SocialProviderError) return error.code.slice(0, 80);
  return "PUBLISHING_FAILED";
}

function isRetryable(error: unknown): boolean {
  return error instanceof SocialProviderError && error.retryable;
}

export class SocialPublishingService {
  private readonly store: SocialPublicationStore;
  private readonly adapters: SocialAdapters;
  private readonly env: Record<string, string | undefined>;
  private readonly loadConnectedAdapters?: () => Promise<SocialAdapters>;
  private readonly now: () => number;
  private readonly allowLive: boolean;
  private worker: ReturnType<typeof setInterval> | null = null;
  private workerRunning = false;

  constructor(options: SocialPublishingServiceOptions) {
    this.store = options.store;
    this.adapters = options.adapters;
    this.loadConnectedAdapters = options.loadConnectedAdapters;
    this.env = options.env || process.env;
    this.now = options.now || Date.now;
    this.allowLive = options.allowLive === true;
  }

  private liveRequested(): boolean {
    return this.allowLive &&
      this.env.SOCIAL_PUBLISHING_MODE === "LIVE" &&
      this.env.SOCIAL_PUBLISHING_LIVE_ENABLED === "true" &&
      this.env.SOCIAL_PUBLISHING_ALLOW_LIVE === "true";
  }

  readiness(adapters = this.adapters): SocialPublishingReadiness {
    const platforms = {} as Record<SocialPlatform, SocialPlatformReadiness>;
    for (const platform of SOCIAL_PLATFORMS) {
      platforms[platform] = { configured: adapters[platform].isConfigured() };
    }
    const accountsConfigured = SOCIAL_PLATFORMS.every((platform) =>
      platforms[platform].configured,
    );
    const livePublishingEnabled = this.liveRequested() && accountsConfigured;
    return {
      mode: livePublishingEnabled ? "LIVE" : DEFAULT_MODE,
      livePublishingEnabled,
      platforms,
    };
  }

  async enqueue(raw: SocialPublicationInput, createdBy: string) {
    const input = normalizeInput(raw);
    const now = this.now();
    const id = stableJobId(input);
    const timestamp = new Date(now).toISOString();
    const platformStatus: Partial<Record<SocialPlatform, PlatformDelivery>> = {};
    for (const platform of input.platforms) {
      platformStatus[platform] = {
        status: "queued",
        attempts: 0,
        updatedAt: timestamp,
      };
    }
    const job: SocialPublicationJob = {
      ...input,
      id,
      status: "queued",
      approvalStatus: "pending",
      platformStatus,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: createdBy.slice(0, 80),
      attempts: 0,
      dueAt: Math.max(now, Date.parse(input.scheduledAt)),
    };
    return this.store.enqueue(job);
  }

  async list(limit = 50): Promise<SocialPublicationJob[]> {
    return this.store.list(Math.max(1, Math.min(100, Math.floor(limit))));
  }

  async listToday() {
    const dayKey = baghdadDayKey(new Date(this.now()));
    const nextDay = new Date(`${dayKey}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const limit = 100;
    const jobs = await this.store.list(limit + 1, {
      start: baghdadWallTimeToDate(dayKey, "00:00").toISOString(),
      end: baghdadWallTimeToDate(nextDay.toISOString().slice(0, 10), "00:00").toISOString(),
    });
    return { dayKey, jobs: jobs.slice(0, limit), truncated: jobs.length > limit };
  }

  async listUpcoming() {
    const checkedAt = new Date(this.now());
    const endsAt = new Date(checkedAt.getTime() + 7 * 24 * 60 * 60_000).toISOString();
    const limit = 100;
    const jobs = await this.store.list(limit + 1, { start: checkedAt.toISOString(), end: endsAt });
    const pending = jobs.slice(0, limit).filter(job => ["queued", "retrying", "processing"].includes(job.status));
    return { checkedAt: checkedAt.toISOString(), endsAt, jobs: pending, truncated: jobs.length > limit };
  }

  async getForPreview(id: string): Promise<SocialPublicationJob | null> {
    return /^[a-f0-9]{64}$/.test(id) ? this.store.get(id) : null;
  }

  async updateQueued(id: string, patch: Pick<SocialPublicationInput, "title" | "caption" | "description" | "scheduledAt">): Promise<SocialPublicationJob> {
    const existing = await this.store.get(id);
    if (!existing) throw new SocialPublishingInputError("Publication not found");
    if (!["queued", "retrying"].includes(existing.status)) throw new SocialPublishingInputError("Only queued publications can be edited");
    const normalized = normalizeInput({ ...existing, ...patch });
    const now = this.now();
    const updated: SocialPublicationJob = {
      ...existing,
      ...normalized,
      ...(existing.automation ? { automation: { ...existing.automation, adminOverride: true } } : {}),
      id: existing.id,
      status: "queued",
      approvalStatus: "pending",
      platformStatus: Object.fromEntries(existing.platforms.map(platform => [platform, {
        status: "queued",
        attempts: 0,
        updatedAt: new Date(now).toISOString(),
      }])) as SocialPublicationJob["platformStatus"],
      updatedAt: new Date(now).toISOString(),
      attempts: 0,
      dueAt: Math.max(now, Date.parse(normalized.scheduledAt)),
    };
    delete updated.leaseUntil;
    delete updated.approvedAt;
    delete updated.approvedBy;
    await this.store.save(updated);
    return updated;
  }

  async approveQueued(id: string, approvedBy: string): Promise<SocialPublicationJob> {
    const existing = await this.store.get(id);
    if (!existing) throw new SocialPublishingInputError("Publication not found");
    if (!["queued", "retrying"].includes(existing.status)) throw new SocialPublishingInputError("Only pending publications can be approved");
    if (existing.approvalStatus === "approved") return existing;
    const now = this.now();
    const approved: SocialPublicationJob = {
      ...existing,
      approvalStatus: "approved",
      approvedAt: new Date(now).toISOString(),
      approvedBy: approvedBy.slice(0, 80),
      updatedAt: new Date(now).toISOString(),
    };
    await this.store.save(approved);
    return approved;
  }

  async cancelQueued(id: string): Promise<boolean> {
    const existing = await this.store.get(id);
    if (!existing || !["queued", "retrying"].includes(existing.status)) return false;
    if (existing.automation) {
      const cancelled: SocialPublicationJob = {
        ...existing,
        status: "cancelled",
        updatedAt: new Date(this.now()).toISOString(),
        dueAt: TERMINAL_DUE_AT,
      };
      delete cancelled.leaseUntil;
      await this.store.save(cancelled);
      return true;
    }
    return this.store.delete(id);
  }

  async runOnce(): Promise<boolean> {
    const now = this.now();
    const adapters = this.liveRequested() && this.loadConnectedAdapters
      ? await this.loadConnectedAdapters()
      : this.adapters;
    const job = await this.store.claimDue(now);
    if (!job) return false;
    const readiness = this.readiness(adapters);
    const deliveries = { ...job.platformStatus };
    const retryTimes: number[] = [];

    for (const platform of job.platforms) {
      const prior = deliveries[platform];
      if (prior?.status === "succeeded" || prior?.status === "simulated" || prior?.status === "failed") continue;
      if (prior?.nextAttemptAt && Date.parse(prior.nextAttemptAt) > now) {
        retryTimes.push(Date.parse(prior.nextAttemptAt));
        continue;
      }

      if (readiness.mode === "DRY_RUN") {
        deliveries[platform] = {
          status: "simulated",
          attempts: prior?.attempts || 0,
          updatedAt: new Date(now).toISOString(),
        };
        continue;
      }
      if (!readiness.platforms[platform].configured) {
        deliveries[platform] = {
          status: "failed",
          attempts: prior?.attempts || 0,
          updatedAt: new Date(now).toISOString(),
          errorCode: "PLATFORM_NOT_CONFIGURED",
        };
        continue;
      }

      try {
        const result = await adapters[platform].publish(job);
        deliveries[platform] = {
          status: "succeeded",
          attempts: (prior?.attempts || 0) + 1,
          updatedAt: new Date(this.now()).toISOString(),
          ...(result.providerPostId ? { providerPostId: result.providerPostId.slice(0, 200) } : {}),
        };
      } catch (error) {
        const attempts = (prior?.attempts || 0) + 1;
        const retryable = isRetryable(error) && attempts < MAX_RETRIES;
        const retryAt = this.now() + Math.min(RETRY_BASE_MS * (2 ** (attempts - 1)), RETRY_MAX_MS);
        deliveries[platform] = {
          status: retryable ? "retrying" : "failed",
          attempts,
          updatedAt: new Date(this.now()).toISOString(),
          ...(retryable ? { nextAttemptAt: new Date(retryAt).toISOString() } : {}),
          errorCode: safeErrorCode(error),
        };
        if (retryable) retryTimes.push(retryAt);
      }
    }

    const status = jobStatus(deliveries);
    const finishedJob: SocialPublicationJob = {
      ...job,
      status,
      platformStatus: deliveries,
      updatedAt: new Date(this.now()).toISOString(),
      dueAt: retryTimes.length ? Math.min(...retryTimes) : TERMINAL_DUE_AT,
    };
    delete finishedJob.leaseUntil;
    await this.store.save(finishedJob);
    return true;
  }

  startWorker(intervalMs = 15_000): void {
    if (this.worker) return;
    const tick = async () => {
      if (this.workerRunning) return;
      this.workerRunning = true;
      try {
        for (let count = 0; count < 10; count += 1) {
          if (!(await this.runOnce())) break;
        }
      } catch (error) {
        console.error("[social-publishing] queue worker failed", safeErrorCode(error));
      } finally {
        this.workerRunning = false;
      }
    };
    this.worker = setInterval(() => void tick(), intervalMs);
    this.worker.unref?.();
    void tick();
  }

  stopWorker(): void {
    if (!this.worker) return;
    clearInterval(this.worker);
    this.worker = null;
  }
}
