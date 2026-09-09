/**
 * CinemaChat push subscription persistence.
 *
 * Subscriptions live ONLY in the protected Firestore collection
 * `pushSubscriptions` (server-side Admin SDK access — rules deny every client
 * read/write). The document id is the SHA-256 of the endpoint, so:
 *   - an endpoint can never be duplicated (idempotent upsert per device);
 *   - the id never contains an actual endpoint or key;
 *   - multiple devices per user are naturally supported.
 *
 * The Admin SDK bypasses Firestore rules, exactly like the existing
 * `_authRecords` pattern in server.ts.
 */

import type { Firestore } from "firebase-admin/firestore";
import type admin from "firebase-admin";
import { createHash } from "node:crypto";
import {
  DEFAULT_PREFERENCES,
  PUSH_LIMITS,
  sanitizePreferences,
  type PushPreferences,
  type PushSubscriptionRecord,
} from "../../src/lib/webPushShared";

export class PushStoreError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PushStoreError";
    this.status = status;
  }
}

export const endpointHashOf = (endpoint: string): string =>
  createHash("sha256").update(endpoint).digest("hex");

/**
 * Persistence contract. All mutating methods are already ownership-scoped:
 * the `userId` must match the stored record's owner.
 */
export interface PushStore {
  upsert(record: PushSubscriptionRecord): Promise<PushSubscriptionRecord>;
  getByEndpointHash(endpointHash: string): Promise<PushSubscriptionRecord | null>;
  listByUser(userId: string): Promise<PushSubscriptionRecord[]>;
  listAllEnabled(): Promise<PushSubscriptionRecord[]>;
  updatePreferencesForUser(userId: string, endpointHash: string, preferences: PushPreferences): Promise<boolean>;
  setEnabledForUser(userId: string, endpointHash: string, enabled: boolean): Promise<boolean>;
  deleteByEndpointHashForUser(userId: string, endpointHash: string): Promise<boolean>;
  markDelivered(endpointHash: string): Promise<void>;
  hasNotified(kind: string, movieId: string): Promise<boolean>;
  markNotified(kind: string, movieId: string, title: string): Promise<void>;
}

/** Stable Firestore field layout (server-written, never trusted from clients). */
export const PUSH_SUBSCRIPTIONS_COLLECTION = "pushSubscriptions";
const PUSH_NOTIFICATION_LOG_COLLECTION = "pushNotificationLog";

function toRecord(doc: { id: string; data(): unknown }): PushSubscriptionRecord {
  const d = (doc.data() || {}) as Record<string, unknown>;
  return {
    userId: String(d.userId || ""),
    endpoint: String(d.endpoint || ""),
    endpointHash: doc.id,
    p256dh: String(d.p256dh || ""),
    auth: String(d.auth || ""),
    preferences: sanitizePreferences(d.preferences),
    enabled: d.enabled !== false,
    createdAt: String(d.createdAt || ""),
    updatedAt: String(d.updatedAt || ""),
    lastSuccessfulDeliveryAt: d.lastSuccessfulDeliveryAt ? String(d.lastSuccessfulDeliveryAt) : undefined,
    deviceLabel: d.deviceLabel ? String(d.deviceLabel).slice(0, 100) : undefined,
  };
}

/** Firestore-backed store. Degrades to 503 whenever Firestore is unavailable. */
export class FirestorePushStore implements PushStore {
  private readonly appRef: () => admin.app.App | null;

  constructor(appRef: () => admin.app.App | null) {
    this.appRef = appRef;
  }

  private db(): Firestore {
    const app = this.appRef();
    if (!app) {
      throw new PushStoreError(503, "Firebase Admin (Firestore) is not configured");
    }
    try {
      return app.firestore() as unknown as Firestore;
    } catch (err: any) {
      throw new PushStoreError(503, `Firestore unavailable: ${err?.message || err}`);
    }
  }

  async upsert(record: PushSubscriptionRecord): Promise<PushSubscriptionRecord> {
    try {
      await this.db()
        .collection(PUSH_SUBSCRIPTIONS_COLLECTION)
        .doc(record.endpointHash)
        .set(
          {
            userId: record.userId,
            endpoint: record.endpoint,
            p256dh: record.p256dh,
            auth: record.auth,
            preferences: record.preferences,
            enabled: record.enabled,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            ...(record.lastSuccessfulDeliveryAt ? { lastSuccessfulDeliveryAt: record.lastSuccessfulDeliveryAt } : {}),
            ...(record.deviceLabel ? { deviceLabel: record.deviceLabel } : {}),
          },
          { merge: true },
        );
      return record;
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store write failed: ${err?.message || err}`);
    }
  }

  async getByEndpointHash(endpointHash: string): Promise<PushSubscriptionRecord | null> {
    try {
      const snapshot = await this.db().collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(endpointHash).get();
      if (!snapshot.exists) return null;
      return toRecord({ id: snapshot.id, data: () => snapshot.data() });
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store read failed: ${err?.message || err}`);
    }
  }

  async listByUser(userId: string): Promise<PushSubscriptionRecord[]> {
    try {
      const snapshot = await this.db()
        .collection(PUSH_SUBSCRIPTIONS_COLLECTION)
        .where("userId", "==", userId)
        .limit(200)
        .get();
      return snapshot.docs.map((d) => toRecord({ id: d.id, data: () => d.data() }));
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store read failed: ${err?.message || err}`);
    }
  }

  async listAllEnabled(): Promise<PushSubscriptionRecord[]> {
    try {
      const snapshot = await this.db()
        .collection(PUSH_SUBSCRIPTIONS_COLLECTION)
        .where("enabled", "==", true)
        .limit(5000)
        .get();
      return snapshot.docs.map((d) => toRecord({ id: d.id, data: () => d.data() }));
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store read failed: ${err?.message || err}`);
    }
  }

  async updatePreferencesForUser(userId: string, endpointHash: string, preferences: PushPreferences): Promise<boolean> {
    try {
      const current = await this.getByEndpointHash(endpointHash);
      if (!current || current.userId !== userId) return false;
      await this.db()
        .collection(PUSH_SUBSCRIPTIONS_COLLECTION)
        .doc(endpointHash)
        .set(
          { preferences, updatedAt: new Date().toISOString() },
          { merge: true },
        );
      return true;
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store write failed: ${err?.message || err}`);
    }
  }

  async setEnabledForUser(userId: string, endpointHash: string, enabled: boolean): Promise<boolean> {
    try {
      const current = await this.getByEndpointHash(endpointHash);
      if (!current || current.userId !== userId) return false;
      await this.db()
        .collection(PUSH_SUBSCRIPTIONS_COLLECTION)
        .doc(endpointHash)
        .set({ enabled, updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store write failed: ${err?.message || err}`);
    }
  }

  async deleteByEndpointHashForUser(userId: string, endpointHash: string): Promise<boolean> {
    try {
      const current = await this.getByEndpointHash(endpointHash);
      // Ownership guard: an endpoint belonging to ANOTHER account is never
      // deleted, even if the caller knows/supplies its hash.
      if (!current || current.userId !== userId) return false;
      await this.db().collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(endpointHash).delete();
      return true;
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store write failed: ${err?.message || err}`);
    }
  }

  async markDelivered(endpointHash: string): Promise<void> {
    try {
      await this.db()
        .collection(PUSH_SUBSCRIPTIONS_COLLECTION)
        .doc(endpointHash)
        .set({ lastSuccessfulDeliveryAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store write failed: ${err?.message || err}`);
    }
  }

  async hasNotified(kind: string, movieId: string): Promise<boolean> {
    try {
      const snapshot = await this.db().collection(PUSH_NOTIFICATION_LOG_COLLECTION).doc(`${kind}:${movieId}`).get();
      return snapshot.exists;
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store read failed: ${err?.message || err}`);
    }
  }

  async markNotified(kind: string, movieId: string, title: string): Promise<void> {
    try {
      await this.db()
        .collection(PUSH_NOTIFICATION_LOG_COLLECTION)
        .doc(`${kind}:${movieId}`)
        .set({ kind, movieId, title, sentAt: new Date().toISOString() }, { merge: true });
    } catch (err: any) {
      if (err instanceof PushStoreError) throw err;
      throw new PushStoreError(503, `Push store write failed: ${err?.message || err}`);
    }
  }
}

/**
 * In-memory store — used by automated tests ONLY (never in production paths).
 */
export class InMemoryPushStore implements PushStore {
  private rows = new Map<string, PushSubscriptionRecord>();
  private notified = new Map<string, { title: string; sentAt: string }>();

  async upsert(record: PushSubscriptionRecord): Promise<PushSubscriptionRecord> {
    this.rows.set(record.endpointHash, { ...record });
    return this.rows.get(record.endpointHash)!;
  }

  async getByEndpointHash(endpointHash: string): Promise<PushSubscriptionRecord | null> {
    return this.rows.get(endpointHash) || null;
  }

  async listByUser(userId: string): Promise<PushSubscriptionRecord[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }

  async listAllEnabled(): Promise<PushSubscriptionRecord[]> {
    return [...this.rows.values()].filter((r) => r.enabled);
  }

  async updatePreferencesForUser(userId: string, endpointHash: string, preferences: PushPreferences): Promise<boolean> {
    const current = this.rows.get(endpointHash);
    if (!current || current.userId !== userId) return false;
    current.preferences = { ...preferences };
    current.updatedAt = new Date().toISOString();
    return true;
  }

  async setEnabledForUser(userId: string, endpointHash: string, enabled: boolean): Promise<boolean> {
    const current = this.rows.get(endpointHash);
    if (!current || current.userId !== userId) return false;
    current.enabled = enabled;
    current.updatedAt = new Date().toISOString();
    return true;
  }

  async deleteByEndpointHashForUser(userId: string, endpointHash: string): Promise<boolean> {
    const current = this.rows.get(endpointHash);
    if (!current || current.userId !== userId) return false;
    this.rows.delete(endpointHash);
    return true;
  }

  async markDelivered(endpointHash: string): Promise<void> {
    const current = this.rows.get(endpointHash);
    if (current) current.lastSuccessfulDeliveryAt = new Date().toISOString();
  }

  async hasNotified(kind: string, movieId: string): Promise<boolean> {
    return this.notified.has(`${kind}:${movieId}`);
  }

  async markNotified(kind: string, movieId: string, title: string): Promise<void> {
    this.notified.set(`${kind}:${movieId}`, { title, sentAt: new Date().toISOString() });
  }
}

/** Record factory used by tests and the subscribe route. */
export function buildSubscriptionRecord(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  preferences?: PushPreferences;
  enabled?: boolean;
  deviceLabel?: string;
}): PushSubscriptionRecord {
  const now = new Date().toISOString();
  return {
    userId: input.userId,
    endpoint: input.endpoint,
    endpointHash: endpointHashOf(input.endpoint),
    p256dh: input.p256dh,
    auth: input.auth,
    preferences: sanitizePreferences(input.preferences || DEFAULT_PREFERENCES),
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
    // Defense-in-depth: labels are client-controlled and clamped to the share
    // limit here even if a route forgets to sanitize them.
    ...(input.deviceLabel
      ? { deviceLabel: String(input.deviceLabel).slice(0, PUSH_LIMITS.maxDeviceLabelLength) }
      : {}),
  };
}