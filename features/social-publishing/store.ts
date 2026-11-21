import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type admin from "firebase-admin";
import type { SocialPublicationJob } from "./types";

export const SOCIAL_PUBLICATIONS_COLLECTION = "socialPublications";
const TERMINAL_DUE_AT = 8_640_000_000_000_000;
const CLAIM_LEASE_MS = 30 * 60 * 1000;

export interface SocialPublicationStore {
  enqueue(job: SocialPublicationJob): Promise<{ job: SocialPublicationJob; duplicate: boolean }>;
  claimDue(now: number): Promise<SocialPublicationJob | null>;
  get(id: string): Promise<SocialPublicationJob | null>;
  delete(id: string): Promise<boolean>;
  save(job: SocialPublicationJob): Promise<void>;
  list(limit: number): Promise<SocialPublicationJob[]>;
}

export class SocialPublicationStoreError extends Error {
  readonly status = 503;

  constructor() {
    super("Social publishing storage unavailable");
    this.name = "SocialPublicationStoreError";
  }
}

export class FirestoreSocialPublicationStore implements SocialPublicationStore {
  private readonly appRef: () => admin.app.App | null;

  constructor(appRef: () => admin.app.App | null) {
    this.appRef = appRef;
  }

  private db(): Firestore {
    const app = this.appRef();
    if (!app) throw new SocialPublicationStoreError();
    try {
      return getFirestore(app) as unknown as Firestore;
    } catch {
      throw new SocialPublicationStoreError();
    }
  }

  async enqueue(job: SocialPublicationJob): Promise<{ job: SocialPublicationJob; duplicate: boolean }> {
    try {
      const db = this.db();
      const ref = db.collection(SOCIAL_PUBLICATIONS_COLLECTION).doc(job.id);
      return await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(ref);
        if (existing.exists) {
          return { job: existing.data() as SocialPublicationJob, duplicate: true };
        }
        transaction.create(ref, job);
        return { job, duplicate: false };
      });
    } catch (error) {
      if (error instanceof SocialPublicationStoreError) throw error;
      throw new SocialPublicationStoreError();
    }
  }

  async claimDue(now: number): Promise<SocialPublicationJob | null> {
    try {
      const db = this.db();
      const snapshot = await db
        .collection(SOCIAL_PUBLICATIONS_COLLECTION)
        .where("dueAt", "<=", now)
        .orderBy("dueAt", "asc")
        .limit(25)
        .get();
      for (const candidate of snapshot.docs) {
        const claimed = await db.runTransaction(async (transaction) => {
          const current = await transaction.get(candidate.ref);
          if (!current.exists) return null;
          const job = current.data() as SocialPublicationJob;
          const expiredLease = job.status === "processing" && (job.leaseUntil || 0) <= now;
          if (
            job.approvalStatus !== "approved" ||
            (!["queued", "retrying"].includes(job.status) && !expiredLease) ||
            job.dueAt > now
          ) return null;
          const next: SocialPublicationJob = {
            ...job,
            status: "processing",
            attempts: (job.attempts || 0) + 1,
            updatedAt: new Date(now).toISOString(),
            dueAt: now + CLAIM_LEASE_MS,
            leaseUntil: now + CLAIM_LEASE_MS,
          };
          transaction.set(candidate.ref, next);
          return next;
        });
        if (claimed) return claimed;
      }
      return null;
    } catch (error) {
      if (error instanceof SocialPublicationStoreError) throw error;
      throw new SocialPublicationStoreError();
    }
  }

  async save(job: SocialPublicationJob): Promise<void> {
    try {
      await this.db().collection(SOCIAL_PUBLICATIONS_COLLECTION).doc(job.id).set(job);
    } catch (error) {
      if (error instanceof SocialPublicationStoreError) throw error;
      throw new SocialPublicationStoreError();
    }
  }

  async get(id: string): Promise<SocialPublicationJob | null> {
    try {
      const snapshot = await this.db().collection(SOCIAL_PUBLICATIONS_COLLECTION).doc(id).get();
      return snapshot.exists ? snapshot.data() as SocialPublicationJob : null;
    } catch (error) {
      if (error instanceof SocialPublicationStoreError) throw error;
      throw new SocialPublicationStoreError();
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const ref = this.db().collection(SOCIAL_PUBLICATIONS_COLLECTION).doc(id);
      return await this.db().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return false;
        const job = snapshot.data() as SocialPublicationJob;
        if (!["queued", "retrying"].includes(job.status)) return false;
        transaction.delete(ref);
        return true;
      });
    } catch (error) {
      if (error instanceof SocialPublicationStoreError) throw error;
      throw new SocialPublicationStoreError();
    }
  }

  async list(limit: number): Promise<SocialPublicationJob[]> {
    try {
      const snapshot = await this.db()
        .collection(SOCIAL_PUBLICATIONS_COLLECTION)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      return snapshot.docs.map((doc) => doc.data() as SocialPublicationJob);
    } catch (error) {
      if (error instanceof SocialPublicationStoreError) throw error;
      throw new SocialPublicationStoreError();
    }
  }
}

export { CLAIM_LEASE_MS, TERMINAL_DUE_AT };
