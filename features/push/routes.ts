/**
 * CinemaChat push API routes.
 *
 * Secured mutation endpoints follow the existing profile-sync convention:
 * `Authorization: Bearer <Firebase idToken>` verified server-side. The admin
 * send endpoint is additionally protected by the global createAdminGuard
 * (server-side role enforcement — never hidden UI controls).
 */

import type { Express, Request, Response } from "express";
import { PUSH_LIMITS, sanitizeNotificationText } from "../../src/lib/webPushShared";
import { PushService, PushServiceError } from "./service";
import { PushStoreError } from "./store";

type VerifyToken = (authorization: string | undefined) => Promise<string>;

export interface PushRoutesDeps {
  pushService: PushService;
  verifyToken: VerifyToken;
  /** Optional audit hook (e.g. addAuditLog) invoked after a successful admin send. */
  onAdminSend?: (adminName: string, outcome: { type: string; delivered: number; notFound: number }) => Promise<void>;
}

const TRUSTED_SEND_HOSTS = new Set([
  "www.cinamachat.com",
  "cinamachat.com",
  "gen-lang-client-0240212572.web.app",
]);

function sendAuthError(res: Response, err: any): void {
  const status = err?.status || 401;
  res.status(status).json({ error: status === 503 ? "ئاماری نۆتیفیکەیشن کاتی بەکارە؛ دواتر هەوڵبدەوە." : "نەیتوانی پەسەند بیت؛ تکایە دووبارە هەوڵبدەوە." });
}

/** Same-origin/relative URL gate for the admin send payload. */
function validateSendUrl(value: unknown): { ok: boolean; url?: string } {
  if (value === undefined || value === null || value === "") return { ok: true };
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw.length > 500) return { ok: false };
  if (/javascript:/i.test(raw) || /<[^>]*>/.test(raw)) return { ok: false };
  if (raw.startsWith("/")) return { ok: true, url: raw };
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !TRUSTED_SEND_HOSTS.has(url.hostname)) return { ok: false };
    return { ok: true, url: url.href };
  } catch {
    return { ok: false };
  }
}

export function registerPushRoutes(app: Express, deps: PushRoutesDeps): void {
  const { pushService, verifyToken, onAdminSend } = deps;

  // Public: VAPID applicationServerKey for client subscriptions.
  app.get("/api/push/vapid-public-key", (_req: Request, res: Response) => {
    if (!pushService.ready || !pushService.publicKey) {
      return res.status(503).json({ error: "نۆتیفیکەیشن لەم ڕاژەیەدا ناچالاکە" });
    }
    res.json({ publicKey: pushService.publicKey });
  });

  // Authenticated: list the current user's subscriptions (masked).
  app.get("/api/push/subscriptions", async (req: Request, res: Response) => {
    try {
      const userId = await verifyToken(req.headers.authorization);
      const subscriptions = await pushService.getUserSubscriptions(userId);
      res.json({ subscriptions });
    } catch (err: any) {
      if (err instanceof PushStoreError) {
        console.warn(`[push] store unavailable: ${err?.message || err}`);
        return res.status(503).json({ error: "ئاماری نۆتیفیکەیشن کاتی بەکارە" });
      }
      sendAuthError(res, err);
    }
  });

  // Authenticated: store (or re-store) this device's push subscription.
  app.post("/api/push/subscribe", async (req: Request, res: Response) => {
    try {
      const userId = await verifyToken(req.headers.authorization);
      const { subscription, preferences, deviceLabel } = req.body || {};
      const masked = await pushService.subscribe({
        userId,
        subscription,
        preferences,
        deviceLabel: typeof deviceLabel === "string" ? deviceLabel : undefined,
      });
      res.json({ success: true, subscription: masked });
    } catch (err: any) {
      if (err instanceof PushServiceError) return res.status(err.status).json({ error: err.message });
      if (err instanceof PushStoreError) {
        console.warn(`[push] store unavailable: ${err?.message || err}`);
        return res.status(503).json({ error: "ئاماری نۆتیفیکەیشن کاتی بەکارە؛ دواتر هەوڵبدەوە" });
      }
      sendAuthError(res, err);
    }
  });

  // Authenticated: update preferences, or the master enable/disable switch.
  app.patch("/api/push/preferences", async (req: Request, res: Response) => {
    try {
      const userId = await verifyToken(req.headers.authorization);
      const { endpoint, preferences, masterEnabled } = req.body || {};
      if (typeof endpoint !== "string" || !endpoint) {
        return res.status(400).json({ error: "endpoint داواکراوە" });
      }
      if (typeof masterEnabled === "boolean" && preferences === undefined) {
        await pushService.setMasterEnabled(userId, endpoint, masterEnabled);
        return res.json({ success: true, masterEnabled });
      }
      if (preferences === undefined || typeof preferences !== "object") {
        return res.status(400).json({ error: "preferences داواکراوە" });
      }
      await pushService.updatePreferences(userId, endpoint, preferences);
      res.json({ success: true, preferences });
    } catch (err: any) {
      if (err instanceof PushServiceError) return res.status(err.status).json({ error: err.message });
      if (err instanceof PushStoreError) {
        console.warn(`[push] store unavailable: ${err?.message || err}`);
        return res.status(503).json({ error: "ئاماری نۆتیفیکەیشن کاتی بەکارە؛ دواتر هەوڵبدەوە" });
      }
      sendAuthError(res, err);
    }
  });

  // Authenticated: remove THIS user's endpoint. Ownership is enforced in the
  // store, so another account's endpoint can never be detached.
  app.delete("/api/push/unsubscribe", async (req: Request, res: Response) => {
    try {
      const userId = await verifyToken(req.headers.authorization);
      const { endpoint } = req.body || {};
      if (typeof endpoint !== "string" || !endpoint) {
        return res.status(400).json({ error: "endpoint داواکراوە" });
      }
      await pushService.unsubscribe(userId, endpoint);
      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof PushServiceError) return res.status(err.status).json({ error: err.message });
      if (err instanceof PushStoreError) {
        console.warn(`[push] store unavailable: ${err?.message || err}`);
        return res.status(503).json({ error: "ئاماری نۆتیفیکەیشن کاتی بەکارە" });
      }
      sendAuthError(res, err);
    }
  });

  // Admin-only: manual special announcement broadcast.
  app.post("/api/admin/push/send", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const title = sanitizeNotificationText(body.title, PUSH_LIMITS.maxTitleLength);
      const announcementBody = sanitizeNotificationText(body.body, PUSH_LIMITS.maxBodyLength);
      if (!title || !announcementBody) {
        return res.status(400).json({ error: "ناونیشان و ناوەڕۆک داواکراون" });
      }
      // Manual sends carry only announcements; automatic movie/trailer titles
      // are generated server-side and can never be spoofed here.
      if (body.notificationType && body.notificationType !== "announcement") {
        return res.status(400).json({ error: "فەرمی بۆ ئاگاداری تایبەتە" });
      }
      const urlCheck = validateSendUrl(body.url);
      if (!urlCheck.ok) {
        return res.status(400).json({ error: "URL نادروستە" });
      }
      if (body.movieId !== undefined && (typeof body.movieId !== "string" || body.movieId.length > 128)) {
        return res.status(400).json({ error: "movieId نادروستە" });
      }
      const adminName = String((req as any).adminUsername || body.adminName || "").trim();
      const clientIp = String(
        (req.headers["x-forwarded-for"] as string || "").split(",")[0] || req.socket?.remoteAddress || req.ip || "unknown",
      );
      const outcome = await pushService.sendAnnouncement({
        title,
        body: announcementBody,
        url: urlCheck.url,
        adminName,
        ip: clientIp,
      });
      if (onAdminSend && adminName) {
        try {
          await onAdminSend(adminName, {
            type: outcome.type,
            delivered: outcome.delivered,
            notFound: outcome.notFound,
          });
        } catch {
          // Audit failure never affects the actual send response.
        }
      }
      res.json({ success: true, outcome });
    } catch (err: any) {
      if (err instanceof PushServiceError) {
        const status = err.status;
        if (status === 429) return res.status(429).json({ error: err.message });
        return res.status(status).json({ error: err.message });
      }
      if (err instanceof PushStoreError) {
        console.warn(`[push] store unavailable: ${err?.message || err}`);
        return res.status(503).json({ error: "ئاماری نۆتیفیکەیشن کاتی بەکارە" });
      }
      console.warn(`[push] admin send failed: ${err?.message || err}`);
      res.status(500).json({ error: "ناردنی نۆتیفیکەیشن سەرکەوتوو نەبوو" });
    }
  });
}