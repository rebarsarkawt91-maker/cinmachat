import type { App } from "firebase-admin/app";
import { getFirestore, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import type { SocialConnectionErrorCode } from "./connectionTypes";
import type { SocialPlatform } from "./types";

export const SOCIAL_CONNECTIONS_COLLECTION = "_cinamachat_social_connections_v1";

export interface StoredSocialAccount {
  revision: string;
  sealed: string;
}

interface PendingOAuthFlow {
  id: string;
  owner: string;
  stateHash: string;
  browserHash: string;
  expiresAt: number;
}

export type StoredOAuthFlow = PendingOAuthFlow & (
  | { phase: "waiting"; sealedVerifier: string }
  | { phase: "exchanging" }
  | { phase: "choose"; sealedChoices: string }
  | { phase: "denied"; errorCode: SocialConnectionErrorCode }
);

export interface StoredPlatformConnection {
  account: StoredSocialAccount | null;
  flow: StoredOAuthFlow | null;
}

export interface SocialConnectionStore {
  isAvailable(): boolean;
  read(platform: SocialPlatform): Promise<StoredPlatformConnection>;
  update<T>(platform: SocialPlatform, change: (current: StoredPlatformConnection) => {
    next: StoredPlatformConnection;
    result: T;
  }): Promise<T>;
}

export class SocialConnectionStorageError extends Error {
  constructor() {
    super("Social account connection storage is unavailable");
    this.name = "SocialConnectionStorageError";
  }
}

export class FirestoreSocialConnectionStore implements SocialConnectionStore {
  constructor(private readonly getApp: () => App | null) {}

  isAvailable(): boolean {
    return Boolean(this.getApp());
  }

  private db(): Firestore {
    const adminApp = this.getApp();
    if (!adminApp) throw new SocialConnectionStorageError();
    return getFirestore(adminApp);
  }

  private document(snapshot: DocumentSnapshot): StoredPlatformConnection {
    return snapshot.exists
      ? snapshot.data() as StoredPlatformConnection
      : { account: null, flow: null };
  }

  async read(platform: SocialPlatform): Promise<StoredPlatformConnection> {
    try {
      return this.document(await this.db().collection(SOCIAL_CONNECTIONS_COLLECTION).doc(platform).get());
    } catch {
      throw new SocialConnectionStorageError();
    }
  }

  async update<T>(platform: SocialPlatform, change: (current: StoredPlatformConnection) => {
    next: StoredPlatformConnection;
    result: T;
  }): Promise<T> {
    const db = this.db();
    const ref = db.collection(SOCIAL_CONNECTIONS_COLLECTION).doc(platform);
    return db.runTransaction(async transaction => {
      const current = this.document(await transaction.get(ref));
      const { next, result } = change(current);
      if (current !== next) transaction.set(ref, next);
      return result;
    });
  }
}
