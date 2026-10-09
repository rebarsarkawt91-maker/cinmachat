import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiKeyVault } from './geminiKeyVault';

test('server key works when optional shared-key storage is unavailable', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-server-key';
  try {
    assert.equal((await new GeminiKeyVault(() => null).candidates(true))[0].id, 'server');
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test('Gemini keys are encrypted, private, persistent, and shareable without disclosure', async () => {
  const previousSecret = process.env.GEMINI_KEY_VAULT_SECRET;
  const previousServerKey = process.env.GEMINI_API_KEY;
  const previousGoogleKey = process.env.GOOGLE_API_KEY;
  process.env.GEMINI_KEY_VAULT_SECRET = 'test-only-vault-secret-at-least-32-characters-long';
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const documents = new Map<string, any>();
  const fakeFirestore = {
    collection: () => ({
      get: async () => ({ docs: [...documents].map(([id, value]) => ({ id, data: () => value })) }),
      doc: (id: string) => ({
        set: async (value: any) => { documents.set(id, value); },
        delete: async () => { documents.delete(id); },
        update: async () => {},
      }),
    }),
  } as any;
  try {
    const first = new GeminiKeyVault(() => fakeFirestore);
    const aliceKey = 'AIza-alice-test-key-1234567890';
    const bobKey = 'AIza-bob-test-key-123456789012';
    await first.save('alice', aliceKey);
    await first.save('bob', bobKey);
    assert.equal(JSON.stringify([...documents.values()]).includes(aliceKey), false);
    assert.equal(JSON.stringify([...documents.values()]).includes(bobKey), false);
    const restarted = new GeminiKeyVault(() => fakeFirestore);
    const visible = await restarted.status('alice', false);
    assert.equal(visible.keys.length, 2);
    assert.equal(visible.keys.find((key) => key.isOwn)?.owner, 'alice');
    assert.equal(visible.keys.find((key) => !key.isOwn)?.owner, null);
    const candidates = await restarted.candidates(true, new Set(['alice', 'bob']));
    assert.deepEqual(new Set(candidates.map((candidate) => candidate.key)), new Set([aliceKey, bobKey]));
    assert.equal((await restarted.candidates(true, new Set(['alice']))).length, 1);
    restarted.recordQuota(candidates.find((candidate) => candidate.owner === 'alice')!, false);
    assert.deepEqual((await restarted.candidates(true, new Set(['alice', 'bob']))).map((candidate) => candidate.owner), ['bob']);
    await assert.rejects(() => restarted.save('charlie', aliceKey), /already registered/);
    await restarted.remove('alice');
    assert.equal(documents.has('alice'), false);
  } finally {
    if (previousSecret === undefined) delete process.env.GEMINI_KEY_VAULT_SECRET;
    else process.env.GEMINI_KEY_VAULT_SECRET = previousSecret;
    if (previousServerKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousServerKey;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = previousGoogleKey;
  }
});
