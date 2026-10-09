import crypto from 'node:crypto';
import admin from 'firebase-admin';

type Usage = { tokens: number; requests: number; quotaHits: number };
type StoredKey = {
  owner: string;
  ciphertext: string;
  iv: string;
  tag: string;
  fingerprint: string;
  createdAt: string;
  cooldownUntil?: number;
  cooldownKind?: 'capacity';
  usage?: Usage;
};

export type GeminiKeyCandidate = { id: string; key: string; owner: string };

// Secrets are never returned from the status API or written to the app's JSON DB.
// The separate vault secret must be long-lived across Render deployments.
export class GeminiKeyVault {
  private readonly records = new Map<string, StoredKey>();
  private readonly lastUsed = new Map<string, number>();
  private readonly serverCooldown = { until: 0 };
  private readonly sessionUsage = new Map<string, Usage>();
  private loading: Promise<void> | null = null;
  private loaded = false;

  constructor(private readonly firestore: () => admin.firestore.Firestore | null) {}

  private encryptionKey(): Buffer {
    const secret = process.env.GEMINI_KEY_VAULT_SECRET || '';
    if (secret.length < 32) throw new Error('Gemini key vault is not configured');
    return crypto.createHash('sha256').update(secret).digest();
  }

  private store() {
    const db = this.firestore();
    if (!db) throw new Error('Gemini key storage is unavailable');
    return db.collection('_kurdsubGeminiKeys');
  }

  async load(): Promise<void> {
    this.encryptionKey();
    if (this.loaded) return;
    if (!this.loading) {
      this.loading = (async () => {
        const snapshot = await this.store().get();
        this.records.clear();
        for (const doc of snapshot.docs) {
          const value = doc.data() as StoredKey;
          if (value.owner === doc.id && value.ciphertext && value.iv && value.tag) {
            this.records.set(doc.id, value);
          }
        }
        this.loaded = true;
      })().finally(() => { this.loading = null; });
    }
    await this.loading;
  }

  private decrypt(record: StoredKey): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  async save(owner: string, rawKey: string): Promise<void> {
    await this.load();
    const key = rawKey.trim();
    if (key.length < 20 || key.length > 512 || /\s/.test(key)) throw new Error('Invalid Gemini API key');
    const fingerprint = crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
    if ([...this.records.values()].some((record) => record.owner !== owner && record.fingerprint === fingerprint) ||
      [process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY].some((serverKey) => serverKey &&
        crypto.createHash('sha256').update(serverKey).digest('hex').slice(0, 12) === fingerprint)) {
      throw new Error('This Gemini key is already registered');
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    const record: StoredKey = {
      owner,
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      fingerprint,
      createdAt: new Date().toISOString(),
      cooldownUntil: 0,
      usage: { tokens: 0, requests: 0, quotaHits: 0 },
    };
    // A failed durable write must not make a temporary key appear saved.
    await this.store().doc(owner).set(record);
    this.records.set(owner, record);
  }

  async remove(owner: string): Promise<void> {
    await this.load();
    await this.store().doc(owner).delete();
    this.records.delete(owner);
  }

  async candidates(includeShared: boolean, activeAdmins?: Set<string>): Promise<GeminiKeyCandidate[]> {
    const candidates: GeminiKeyCandidate[] = [];
    const serverKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (serverKey && this.serverCooldown.until <= Date.now()) candidates.push({ id: 'server', key: serverKey, owner: 'server' });
    if (includeShared) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([this.load(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Gemini key storage unavailable')), 5000);
        })]);
      }
      catch (error) { if (candidates.length) return candidates; throw error; }
      finally { if (timer) clearTimeout(timer); }
      for (const [owner, record] of this.records) {
        if (activeAdmins && !activeAdmins.has(owner)) continue;
        // Old versions also cooled down invalid keys for 24h. Revalidate those
        // once instead of presenting an unverified quota warning forever.
        if (record.cooldownKind === 'capacity' && (record.cooldownUntil || 0) > Date.now()) continue;
        try { candidates.push({ id: owner, key: this.decrypt(record), owner }); }
        catch { /* A corrupt or rotated-secret record is never used. */ }
      }
    }
    return candidates.sort((a, b) => (this.lastUsed.get(a.id) || 0) - (this.lastUsed.get(b.id) || 0));
  }

  recordUse(candidate: GeminiKeyCandidate, tokens: number): void {
    this.lastUsed.set(candidate.id, Date.now());
    const usage = this.sessionUsage.get(candidate.id) || { tokens: 0, requests: 0, quotaHits: 0 };
    usage.tokens += Math.max(0, Math.floor(tokens));
    usage.requests += 1;
    this.sessionUsage.set(candidate.id, usage);
    if (candidate.id !== 'server') {
      const record = this.records.get(candidate.id);
      if (record) {
        const next = record.usage || { tokens: 0, requests: 0, quotaHits: 0 };
        next.tokens += Math.max(0, Math.floor(tokens));
        next.requests += 1;
        record.usage = next;
      }
      try {
        void this.store().doc(candidate.id).update({
          'usage.tokens': admin.firestore.FieldValue.increment(Math.max(0, Math.floor(tokens))),
          'usage.requests': admin.firestore.FieldValue.increment(1),
        }).catch(() => {});
      } catch { /* Translation still succeeds when usage logging is unavailable. */ }
    }
  }

  recordQuota(candidate: GeminiKeyCandidate, daily: boolean, retryAfterSeconds?: number): void {
    this.lastUsed.set(candidate.id, Date.now());
    const cooldownUntil = Date.now() + (retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : daily ? 24 * 60 * 60_000 : 5 * 60_000);
    if (candidate.id === 'server') this.serverCooldown.until = cooldownUntil;
    const usage = this.sessionUsage.get(candidate.id) || { tokens: 0, requests: 0, quotaHits: 0 };
    usage.quotaHits += 1;
    this.sessionUsage.set(candidate.id, usage);
    if (candidate.id !== 'server') {
      const record = this.records.get(candidate.id);
      if (record) {
        record.cooldownUntil = cooldownUntil;
        record.cooldownKind = 'capacity';
        const next = record.usage || { tokens: 0, requests: 0, quotaHits: 0 };
        next.quotaHits += 1;
        record.usage = next;
      }
      try {
        void this.store().doc(candidate.id).update({
          cooldownUntil,
          cooldownKind: 'capacity',
          'usage.quotaHits': admin.firestore.FieldValue.increment(1),
        }).catch(() => {});
      } catch { /* Keep the in-memory cooldown if Firestore is unavailable. */ }
    }
  }

  async status(viewer: string, isOwner: boolean) {
    await this.load();
    const records = [...this.records.values()].sort((a, b) => a.owner.localeCompare(b.owner));
    const keys = records.map((record, index) => ({
      slot: index + 1,
      owner: isOwner || viewer === record.owner ? record.owner : null,
      isOwn: viewer === record.owner,
      fingerprint: isOwner || viewer === record.owner ? record.fingerprint : null,
      tokensUsed: record.usage?.tokens || 0,
      requests: record.usage?.requests || 0,
      quotaHits: record.usage?.quotaHits || 0,
      cooldownUntil: record.cooldownUntil || 0,
    }));
    const server = this.sessionUsage.get('server') || { tokens: 0, requests: 0, quotaHits: 0 };
    return { keys, server: { configured: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY), ...server }, limitsNote: 'Usage tracked by this studio only; exact Gemini project quota is shown in Google AI Studio.' };
  }
}
