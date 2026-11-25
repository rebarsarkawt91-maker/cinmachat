import type { Express, Request, Response } from "express";
import { SocialPublishingInputError, SocialPublishingService } from "./service";
import { SocialPublicationStoreError } from "./store";
import type { SocialMediaType, SocialPublicationJob } from "./types";
import { catalogCardImage } from "./catalogCardMedia";

export interface SocialPublishingRoutesOptions {
  service: SocialPublishingService;
  resolveAdmin: (request: Request) => string | null;
  schedulerEnabled?: boolean;
}

function requireAdmin(
  request: Request,
  response: Response,
  resolveAdmin: SocialPublishingRoutesOptions["resolveAdmin"],
): string | null {
  const username = resolveAdmin(request);
  if (!username) {
    response.status(401).json({ success: false, error: "Admin authentication required" });
    return null;
  }
  return username;
}

function sendFailure(response: Response, error: unknown): void {
  if (error instanceof SocialPublishingInputError) {
    response.status(error.status).json({ success: false, error: error.message });
    return;
  }
  if (error instanceof SocialPublicationStoreError) {
    response.status(503).json({ success: false, error: "Social publishing storage unavailable" });
    return;
  }
  response.status(500).json({ success: false, error: "Social publishing request failed" });
}

function restoreSanitizedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#x27;": "'",
    "&#x2F;": "/",
  };
  return value.replace(/&amp;|&lt;|&gt;|&quot;|&#x27;|&#x2F;/g, (entity) => entities[entity]);
}

function responseJob(job: SocialPublicationJob): Omit<SocialPublicationJob, "media"> & {
  media?: { type: SocialMediaType; mimeType?: string };
} {
  const { media, ...safeJob } = job;
  return {
    ...safeJob,
    ...(media ? {
      media: {
        type: media.type,
        ...(media.rightsConfirmed ? { rightsConfirmed: true } : {}),
        ...(media.mimeType ? { mimeType: media.mimeType } : {}),
      },
    } : {}),
  };
}

function previewMediaUrl(job: SocialPublicationJob): string | null {
  const media = job.media;
  if (!media?.url || media.type === "text") return null;
  const catalogImage = job.contentKind === "promotion" && job.provenance?.source === "cinemachat-catalog" && media.type === "image"
    ? catalogCardImage({ posterUrl: media.url }) : undefined;
  try {
    const url = new URL(catalogImage ?? media.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
    // Direct previews use public assets and never proxy a job's stored media.
    const siteAsset = ["www.cinamachat.com", "cinamachat.com"].includes(url.hostname) && /^\/(?:assets|uploads)\//.test(url.pathname);
    const tmdbPoster = media.type === "image" && url.hostname === "image.tmdb.org" && url.pathname.startsWith("/t/p/");
    return catalogImage || siteAsset || tmdbPoster ? url.href : null;
  } catch {
    return null;
  }
}

function responsePreviewJob(job: SocialPublicationJob) {
  const { id, contentKind, title, caption, description, platforms, scheduledAt, status, createdAt, approvalStatus, automation, provenance, media } = job;
  const platformStatus = Object.fromEntries(platforms.flatMap(platform => {
    const delivery = job.platformStatus?.[platform];
    return delivery ? [[platform, { status: delivery.status }]] : [];
  }));
  return {
    id, contentKind, title, caption, description, platforms, platformStatus, scheduledAt, status, createdAt, approvalStatus, automation,
    provenance: provenance && { source: provenance.source, kurdishSubtitleStatus: provenance.kurdishSubtitleStatus },
    media: media && { type: media.type, rightsConfirmed: media.rightsConfirmed === true },
  };
}

export function registerSocialPublishingRoutes(
  app: Express,
  options: SocialPublishingRoutesOptions,
): void {
  const { service, resolveAdmin } = options;

  app.get("/api/admin/social-publishing/status", (request: Request, response: Response) => {
    if (!requireAdmin(request, response, resolveAdmin)) return;
    response.setHeader("Cache-Control", "no-store");
    response.json({
      success: true,
      readiness: { ...service.readiness(), schedulerEnabled: options.schedulerEnabled === true },
    });
  });

  app.get("/api/admin/social-publishing/queue", async (request: Request, response: Response) => {
    if (!requireAdmin(request, response, resolveAdmin)) return;
    try {
      const limit = Number(request.query.limit) || 50;
      const jobs = await service.list(limit);
      response.setHeader("Cache-Control", "no-store");
      response.json({ success: true, jobs: jobs.map(responseJob) });
    } catch (error) {
      sendFailure(response, error);
    }
  });

  app.get("/api/admin/social-publishing/history", async (request: Request, response: Response) => {
    if (!requireAdmin(request, response, resolveAdmin)) return;
    try {
      const limit = Number(request.query.limit) || 50;
      const jobs = await service.list(limit);
      response.setHeader("Cache-Control", "no-store");
      response.json({ success: true, jobs: jobs.map(responseJob) });
    } catch (error) {
      sendFailure(response, error);
    }
  });

  app.get("/api/admin/social-publishing/today", async (request: Request, response: Response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!requireAdmin(request, response, resolveAdmin)) return;
    try {
      const { dayKey, jobs, truncated } = await service.listToday();
      response.json({ success: true, dayKey, truncated, jobs: jobs.map(responsePreviewJob) });
    } catch (error) {
      sendFailure(response, error);
    }
  });

  app.get("/api/admin/social-publishing/upcoming", async (request: Request, response: Response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!requireAdmin(request, response, resolveAdmin)) return;
    try {
      const { checkedAt, endsAt, jobs, truncated } = await service.listUpcoming();
      response.json({ success: true, checkedAt, endsAt, truncated, jobs: jobs.map(responsePreviewJob) });
    } catch (error) {
      sendFailure(response, error);
    }
  });

  app.get("/api/admin/social-publishing/queue/:id/preview", async (request: Request, response: Response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!requireAdmin(request, response, resolveAdmin)) return;
    try {
      const job = await service.getForPreview(String(request.params.id || ""));
      if (!job) {
        response.status(404).json({ success: false, error: "Publication not found" });
        return;
      }
      response.json({ success: true, mediaUrl: previewMediaUrl(job) });
    } catch (error) {
      sendFailure(response, error);
    }
  });

  app.post("/api/admin/social-publishing/queue", async (request: Request, response: Response) => {
    const adminName = requireAdmin(request, response, resolveAdmin);
    if (!adminName) return;
    try {
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const result = await service.enqueue({
        ...body,
        contentKind: body.contentKind,
        caption: restoreSanitizedText(body.caption),
        title: restoreSanitizedText(body.title),
        description: restoreSanitizedText(body.description),
      }, adminName);
      response.status(result.duplicate ? 200 : 202).json({
        success: true,
        duplicate: result.duplicate,
        mode: service.readiness().mode,
        job: responseJob(result.job),
      });
    } catch (error) {
      sendFailure(response, error);
    }
  });

  app.patch("/api/admin/social-publishing/queue/:id", async (request: Request, response: Response) => {
    if (!requireAdmin(request, response, resolveAdmin)) return;
    try {
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const updated = await service.updateQueued(String(request.params.id || ""), {
        title: restoreSanitizedText(body.title),
        caption: restoreSanitizedText(body.caption) || "",
        description: restoreSanitizedText(body.description),
        scheduledAt: body.scheduledAt,
      });
      response.setHeader("Cache-Control", "no-store");
      response.json({ success: true, mode: service.readiness().mode, job: responseJob(updated) });
    } catch (error) { sendFailure(response, error); }
  });

  app.post("/api/admin/social-publishing/queue/:id/approve", async (request: Request, response: Response) => {
    const adminName = requireAdmin(request, response, resolveAdmin);
    if (!adminName) return;
    try {
      const approved = await service.approveQueued(String(request.params.id || ""), adminName);
      response.setHeader("Cache-Control", "no-store");
      response.json({ success: true, mode: service.readiness().mode, job: responseJob(approved) });
    } catch (error) { sendFailure(response, error); }
  });

  app.delete("/api/admin/social-publishing/queue/:id", async (request: Request, response: Response) => {
    if (!requireAdmin(request, response, resolveAdmin)) return;
    try {
      const cancelled = await service.cancelQueued(String(request.params.id || ""));
      if (!cancelled) {
        response.status(409).json({ success: false, error: "Only queued or retrying publications can be cancelled" });
        return;
      }
      response.status(200).json({ success: true });
    } catch (error) { sendFailure(response, error); }
  });
}
