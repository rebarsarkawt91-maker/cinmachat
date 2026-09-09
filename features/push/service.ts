/**
 * CinemaChat push service — subscription management, targeted sending and the
 * automatic new-movie / new-trailer triggers.
 *
 * Delivery goes through the real Web Push protocol via the `web-push` library.
 * The sender is injected so automated tests can mock push delivery and never
 * hit a real push service.
 */

import { sanitizeNotificationText, validateWebPushSubscription, maskSubscription, filterSubscriptionsByType, NOTIFICATION_TYPE_PREFERENCE, PUSH_LIMITS, DEFAULT_PREFERENCES, sanitizePreferences, type NotificationType, type MaskedPushSubscription, type PushSubscriptionRecord, type PushPreferenceKey } from "../../src/lib/webPushShared";
import { buildSubscriptionRecord, PushStoreError, endpointHashOf, type PushStore } from "./store";
import { getVapidPublicKey, configureWebPush, type PushSender, type VapidConfig } from "./config";

export interface SubscribeInput {
  userId: string;
  subscription: unknown;
  preferences?: unknown;
  deviceLabel?: string;
}

export interface SendRequest {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  movieId?: string;
}

export interface SendOutcome {
  type: NotificationType;
  recipients: number;
  delivered: number;
  failed: number;
  notFound: number;
  duplicateSkipped: boolean;
  startedAt: string;
  finishedAt: string;
}

const ADMIN_SEND_HOUR_LIMIT = 20;
const ADMIN_WINDOW_MS = 60 * 60 * 1000;
const adminSendLog = new Map<string, number[]>();

function enforceAdminSendLimit(adminName: string, ip: string): { ok: boolean; waitMs: number } {
  const key = `${adminName}@${ip}`;
  const now = Date.now();
  const recent = (adminSendLog.get(key) || []).filter((t) => now - t < ADMIN_WINDOW_MS);
  if (recent.length >= ADMIN_SEND_HOUR_LIMIT) {
    const nextSlot = recent[0] + ADMIN_WINDOW_MS - now;
    return { ok: false, waitMs: Math.max(nextSlot, 1000) };
  }
  adminSendLog.set(key, [...recent, now]);
  return { ok: true, waitMs: 0 };
}

/** Error carrying an HTTP status + safe client message. */
export class PushServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PushServiceError";
    this.status = status;
  }
}

export class PushService {
  constructor(
    private readonly store: PushStore,
    private readonly vapid: VapidConfig,
    private readonly sender: PushSender,
  ) {}

  get ready(): boolean {
    return this.vapid.ready;
  }

  get publicKey(): string {
    return getVapidPublicKey(this.vapid);
  }

  /** Applies VAPID details once at first use. */
  private ensureConfigured(): void {
    if (!this.ready) throw new PushServiceError(503, "Web Push is not configured on this server.");
    configureWebPush(this.vapid);
  }

  async subscribe(input: SubscribeInput): Promise<MaskedPushSubscription> {
    this.ensureConfigured();
    const validation = validateWebPushSubscription(input.subscription);
    if (!validation.ok) {
      throw new PushServiceError(400, "ئاماری نۆتیفیکەیشن نادروستە");
    }
    const sub = input.subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
    const deviceLabel = sanitizeNotificationText(input.deviceLabel, PUSH_LIMITS.maxDeviceLabelLength);
    const record = buildSubscriptionRecord({
      userId: input.userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      preferences: sanitizePreferences(input.preferences || DEFAULT_PREFERENCES),
      deviceLabel: deviceLabel || undefined,
    });
    const stored = await this.store.upsert(record);
    return maskSubscription(stored);
  }

  async getUserSubscriptions(userId: string): Promise<MaskedPushSubscription[]> {
    const rows = await this.store.listByUser(userId);
    return rows.map(maskSubscription);
  }

  async updatePreferences(userId: string, endpoint: string, preferences: unknown): Promise<boolean> {
    const clean = sanitizePreferences(preferences);
    const updated = await this.store.updatePreferencesForUser(userId, endpointHashOf(endpoint), clean);
    if (!updated) throw new PushServiceError(404, "سەبسکرایپشنەکە نەدۆزرایەوە");
    return true;
  }

  async setMasterEnabled(userId: string, endpoint: string, enabled: boolean): Promise<boolean> {
    const updated = await this.store.setEnabledForUser(userId, endpointHashOf(endpoint), enabled);
    if (!updated) throw new PushServiceError(404, "سەبسکرایپشنەکە نەدۆزرایەوە");
    return true;
  }

  async unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    const deleted = await this.store.deleteByEndpointHashForUser(userId, endpointHashOf(endpoint));
    if (!deleted) throw new PushServiceError(404, "سەبسکرایپشنەکە نەدۆزرایەوە");
    return true;
  }

  /**
   * Sends a notification to every active subscription that opted in for the
   * given notification type. 404/410 endpoints (uninstalled/expired) are
   * pruned automatically. Returns aggregate counts — never subscriber secrets.
   */
  async send(input: SendRequest): Promise<SendOutcome> {
    this.ensureConfigured();
    const type = input.type;
    const title = sanitizeNotificationText(input.title, PUSH_LIMITS.maxTitleLength);
    const body = sanitizeNotificationText(input.body, PUSH_LIMITS.maxBodyLength);
    const startedAt = new Date().toISOString();
    const payload = JSON.stringify({ title, body, ...(input.url ? { url: input.url } : {}), tag: `cinemachat:${type}` });

    const all = await this.store.listAllEnabled();
    const targets = filterSubscriptionsByType(all, type);
    let delivered = 0;
    let failed = 0;
    let notFound = 0;

    for (const target of targets) {
      try {
        const status = await this.sender(target.endpoint, { p256dh: target.p256dh, auth: target.auth }, payload);
        if (status >= 200 && status < 300) {
          delivered += 1;
          try {
            await this.store.markDelivered(target.endpointHash);
          } catch {
            // Delivery-timestamp write failing is not fatal for the send.
          }
        } else {
          failed += 1;
        }
      } catch (err: any) {
        const statusCode = Number(err?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          // Endpoint is gone (app uninstalled / push provider expired it).
          notFound += 1;
          try {
            await this.store.deleteByEndpointHashForUser(target.userId, target.endpointHash);
          } catch {
            // Non-fatal: the stale row will be retried and pruned again later.
          }
        } else {
          failed += 1;
        }
      }
    }

    return {
      type,
      recipients: targets.length,
      delivered,
      failed,
      notFound,
      duplicateSkipped: false,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  /**
   * Automatic trigger for a freshly PUBLISHED movie/trailer. Caller must have
   * already committed the movie write successfully (post-movie flow).
   *
   * Idempotency: the movie id is recorded in `pushNotificationLog` before any
   * send. Edits keep the same id, retries and repeated requests keep the same
   * id, and every service restart re-checks the durable log — so exactly one
   * notification is ever sent per published movie id.
   */
  async notifyPublishedMovie(movie: {
    id?: unknown;
    title?: unknown;
    type?: unknown;
  }): Promise<SendOutcome | null> {
    const movieId = String(movie?.id || "");
    if (!movieId || !this.ready) return null;
    this.ensureConfigured();
    const isTrailer = String(movie?.type || "").toLowerCase() === "trailer";
    const kind = isTrailer ? "newTrailer" : "newMovie";
    try {
      if (await this.store.hasNotified(kind, movieId)) {
        return { type: isTrailer ? "newTrailer" : "newMovie", recipients: 0, delivered: 0, failed: 0, notFound: 0, duplicateSkipped: true, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
      }
      const movieName = typeof movie.title === "string" ? movie.title : "CinemaChat";
      const title = isTrailer ? "🎥 ترەیلەری نوێ!" : "🎬 فیلمی نوێ!";
      const body = isTrailer ? `ترەیلەری فیلمی ${movieName} بڵاو بوویەوە!` : `فیلمی ${movieName} ئێستا بەردەستە!`;
      const outcome = await this.send({
        type: isTrailer ? "newTrailer" : "newMovie",
        title,
        body,
        url: "/",
        movieId,
      });
      // Mark AFTER the send so a failed send can be retried later.
      try {
        await this.store.markNotified(kind, movieId, title);
      } catch {
        // Non-fatal; the dedupe window is the durable Firestore log.
      }
      return { ...outcome, duplicateSkipped: false };
    } catch (err: any) {
      if (err instanceof PushStoreError || err instanceof PushServiceError) {
        console.warn(`[push] Automatic ${kind} notification skipped: ${err?.message || err}`);
        return null;
      }
      throw err;
    }
  }

  /** Manual announcement (admin-only, validated at the route boundary). */
  async sendAnnouncement(input: {
    title: string;
    body: string;
    url?: string;
    adminName: string;
    ip: string;
  }): Promise<SendOutcome> {
    const limit = enforceAdminSendLimit(input.adminName, input.ip);
    if (!limit.ok) {
      throw new PushServiceError(429, "زۆر ناردنت کردووە؛ تکایە کەمێک چاوەڕێ بکە");
    }
    const outcome = await this.send({
      type: "announcement",
      title: sanitizeNotificationText(input.title, PUSH_LIMITS.maxTitleLength),
      body: sanitizeNotificationText(input.body, PUSH_LIMITS.maxBodyLength),
      url: input.url && /^https?:\/\//i.test(input.url) ? input.url : undefined,
    });
    return outcome;
  }

  /** Convenience for preference-based type checks (used by announcements UI). */
  preferenceFor(type: NotificationType): PushPreferenceKey {
    return NOTIFICATION_TYPE_PREFERENCE[type];
  }
}

export type { PushSubscriptionRecord };