import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { SocialConnectionError, type SocialAccountProviders, type VerifiedSocialAccount } from "./connectionProviders";
import type { SocialConnectionStore, StoredOAuthFlow, StoredSocialAccount } from "./connectionStore";
import type { OAuthPlatform, SocialAccountChoice, SocialAccountStatus, SocialConnectionOverview, SocialConnectionStatus } from "./connectionTypes";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "./types";

const FLOW_TTL_MS = 10 * 60_000;
const NONCE = /^[A-Za-z0-9_-]{43}$/;

interface LinkedSocialAccount extends VerifiedSocialAccount {
  verifiedAt: string;
  needsReconnect: boolean;
}

function browserNonce(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function matchesHash(value: string, expected: string): boolean {
  return NONCE.test(expected) && timingSafeEqual(Buffer.from(hash(value)), Buffer.from(expected));
}

function publicAccount({ id, name, handle }: SocialAccountChoice): SocialAccountChoice {
  return { id, name, ...(handle ? { handle } : {}) };
}

function publicStatus(account: LinkedSocialAccount): SocialAccountStatus {
  return { ...publicAccount(account), verifiedAt: account.verifiedAt, needsReconnect: account.needsReconnect };
}

export class SocialConnections {
  readonly browserProofMaxAge = FLOW_TTL_MS;
  readonly origin: string;
  private readonly key: Buffer | null;
  private readonly now: () => number;

  constructor(private readonly options: {
    origin: string;
    encryptionKey?: string;
    store: SocialConnectionStore;
    providers: SocialAccountProviders;
    now?: () => number;
  }) {
    this.origin = options.origin;
    const encoded = options.encryptionKey?.trim() || "";
    const key = /^[A-Za-z0-9+/]{43}=$/.test(encoded) ? Buffer.from(encoded, "base64") : null;
    this.key = key?.length === 32 && key.toString("base64") === encoded ? key : null;
    this.now = options.now || Date.now;
  }

  private storageReady(): boolean {
    return Boolean(this.key && this.options.store.isAvailable());
  }

  private requireStorage(): Buffer {
    if (!this.key || !this.options.store.isAvailable()) throw new SocialConnectionError("connection_unavailable", 503);
    return this.key;
  }

  private seal(value: unknown, purpose: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.requireStorage(), nonce);
    cipher.setAAD(Buffer.from(purpose));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
  }

  private unseal<T>(value: string, purpose: string): T {
    const key = this.requireStorage();
    try {
      const sealed = Buffer.from(value, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
      decipher.setAAD(Buffer.from(purpose));
      decipher.setAuthTag(sealed.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString("utf8")) as T;
    } catch {
      throw new SocialConnectionError("connection_unavailable", 503);
    }
  }

  private linked(platform: SocialPlatform, stored: StoredSocialAccount): LinkedSocialAccount {
    return this.unseal(stored.sealed, `account:${platform}:${stored.revision}`);
  }

  private stored(platform: SocialPlatform, account: LinkedSocialAccount): StoredSocialAccount {
    const revision = randomUUID();
    return { revision, sealed: this.seal(account, `account:${platform}:${revision}`) };
  }

  async overview(owner: string | null): Promise<SocialConnectionOverview> {
    const storageReady = this.storageReady();
    const entries = await Promise.all(SOCIAL_PLATFORMS.map(async platform => {
      const status: SocialConnectionStatus = { available: storageReady && this.options.providers.available(platform), account: null };
      if (!storageReady) return [platform, status] as const;
      const stored = await this.options.store.read(platform);
      if (stored.account) status.account = publicStatus(this.linked(platform, stored.account));
      const flow = stored.flow;
      if (flow && flow.expiresAt <= this.now()) {
        // An abandoned authorization must not keep its temporary grant beyond the next read.
        await this.options.store.update(platform, current => ({
          next: current.flow?.id === flow.id ? { ...current, flow: null } : current,
          result: undefined,
        }));
      } else if (owner && flow?.owner === owner) {
        status.flow = { id: flow.id, phase: flow.phase };
        if (flow.phase === "choose") {
          status.flow.choices = this.unseal<VerifiedSocialAccount[]>(flow.sealedChoices, `choices:${platform}:${flow.id}`).map(publicAccount);
        } else if (flow.phase === "denied") {
          status.flow.errorCode = flow.errorCode;
        }
      }
      return [platform, status] as const;
    }));
    return { canManage: Boolean(owner), origin: this.origin, storageReady, platforms: Object.fromEntries(entries) as SocialConnectionOverview["platforms"] };
  }

  async start(platform: OAuthPlatform, owner: string) {
    this.requireStorage();
    const state = browserNonce();
    const browserProof = browserNonce();
    const verifier = browserNonce();
    const id = randomUUID();
    const authorizationUrl = this.options.providers.authorizeUrl(platform, state, verifier).toString();
    const flow: StoredOAuthFlow = {
      id, owner, stateHash: hash(state), browserHash: hash(browserProof), expiresAt: this.now() + FLOW_TTL_MS,
      phase: "waiting", sealedVerifier: this.seal(verifier, `verifier:${platform}:${id}`),
    };
    await this.options.store.update(platform, current => ({ next: { ...current, flow }, result: undefined }));
    return { authorizationUrl, browserProof };
  }

  async callback(platform: OAuthPlatform, state: string, browserProof: string, code: string | null): Promise<"ready" | "failed" | "invalid"> {
    if (!NONCE.test(state) || !NONCE.test(browserProof) || !this.storageReady()) return "invalid";
    const flow = await this.options.store.update(platform, current => {
      const candidate = current.flow;
      if (candidate?.phase !== "waiting" || candidate.expiresAt <= this.now() ||
          !matchesHash(state, candidate.stateHash) || !matchesHash(browserProof, candidate.browserHash)) {
        return { next: current, result: null };
      }
      // Consume the callback proof in Firestore before asking the provider to redeem the code.
      const { sealedVerifier: _sealedVerifier, ...claimed } = candidate;
      return { next: { ...current, flow: { ...claimed, phase: "exchanging" } }, result: candidate };
    });
    if (!flow) return "invalid";
    const saveResult = (result: StoredOAuthFlow) => this.options.store.update(platform, current => {
      const active = current.flow?.id === flow.id && current.flow.phase === "exchanging" && current.flow.expiresAt > this.now();
      return { next: active ? { ...current, flow: result } : current, result: active };
    });
    const { sealedVerifier, ...claimed } = flow;
    try {
      if (code === null) throw new SocialConnectionError("consent_denied", 422);
      if (!/^[!-~]{1,4096}$/.test(code)) throw new SocialConnectionError("grant_unavailable", 422);
      const verifier = this.unseal<string>(sealedVerifier, `verifier:${platform}:${flow.id}`);
      const choices = await this.options.providers.exchange(platform, code, verifier);
      const sealedChoices = this.seal(choices, `choices:${platform}:${flow.id}`);
      return await saveResult({ ...claimed, phase: "choose", sealedChoices }) ? "ready" : "invalid";
    } catch (error) {
      const errorCode = error instanceof SocialConnectionError ? error.code : "provider_unavailable";
      return await saveResult({ ...claimed, phase: "denied", errorCode }) ? "failed" : "invalid";
    }
  }

  async select(platform: OAuthPlatform, owner: string, flowId: unknown, accountId: unknown): Promise<SocialAccountStatus> {
    this.requireStorage();
    if (typeof flowId !== "string" || !/^[0-9a-f-]{36}$/.test(flowId) ||
      typeof accountId !== "string" || !/^[A-Za-z0-9_-]{3,64}$/.test(accountId)) {
      throw new SocialConnectionError("invalid_input", 400);
    }
    if (!this.options.providers.available(platform)) throw new SocialConnectionError("connection_unavailable", 503);
    return this.options.store.update(platform, current => {
      const flow = current.flow;
      if (flow?.phase !== "choose" || flow.owner !== owner || flow.id !== flowId || flow.expiresAt <= this.now()) {
        throw new SocialConnectionError("flow_expired", 409);
      }
      const choice = this.unseal<VerifiedSocialAccount[]>(flow.sealedChoices, `choices:${platform}:${flow.id}`)
        .find(item => item.id === accountId);
      if (!choice) throw new SocialConnectionError("no_eligible_account", 422);
      const account = { ...choice, verifiedAt: new Date(this.now()).toISOString(), needsReconnect: false };
      return { next: { account: this.stored(platform, account), flow: null }, result: publicStatus(account) };
    });
  }

  async linkTelegram(token: unknown, channel: unknown): Promise<SocialAccountStatus> {
    this.requireStorage();
    const before = await this.options.store.read("telegram");
    const verified = await this.options.providers.telegram(token, channel);
    const account = { ...verified, verifiedAt: new Date(this.now()).toISOString(), needsReconnect: false };
    await this.options.store.update("telegram", current => {
      if (current.account?.revision !== before.account?.revision) throw new SocialConnectionError("account_changed", 409);
      return { next: { account: this.stored("telegram", account), flow: null }, result: undefined };
    });
    return publicStatus(account);
  }

  async verify(platform: SocialPlatform): Promise<SocialAccountStatus> {
    this.requireStorage();
    const { account: stored } = await this.options.store.read(platform);
    if (!stored) throw new SocialConnectionError("no_eligible_account", 404);
    const linked = this.linked(platform, stored);
    const replace = (account: LinkedSocialAccount) => this.options.store.update(platform, current => {
      if (current.account?.revision !== stored.revision) throw new SocialConnectionError("account_changed", 409);
      return { next: { ...current, account: this.stored(platform, account) }, result: publicStatus(account) };
    });
    try {
      const verified = await this.options.providers.verify(platform, linked);
      if (verified.id !== linked.id) throw new SocialConnectionError("no_eligible_account", 422);
      return await replace({ ...verified, verifiedAt: new Date(this.now()).toISOString(), needsReconnect: false });
    } catch (error) {
      if (error instanceof SocialConnectionError && error.status === 422) {
        await replace({ ...linked, needsReconnect: true });
      }
      throw error;
    }
  }

  async disconnect(platform: SocialPlatform): Promise<void> {
    this.requireStorage();
    await this.options.store.update(platform, () => ({ next: { account: null, flow: null }, result: undefined }));
  }

  async activeAccounts(): Promise<Partial<Record<SocialPlatform, VerifiedSocialAccount>>> {
    if (!this.storageReady()) return {};
    const entries = await Promise.all(SOCIAL_PLATFORMS.map(async platform => {
      if (!this.options.providers.available(platform)) return [platform, undefined] as const;
      const { account } = await this.options.store.read(platform);
      const linked = account ? this.linked(platform, account) : null;
      return [platform, linked && !linked.needsReconnect ? linked : undefined] as const;
    }));
    return Object.fromEntries(entries);
  }
}
