import crypto from 'node:crypto';

// Signed, HttpOnly login proof. Never trust the UI's stored username as auth.
export function createStudioAdminSessions(secret: string, now = () => Date.now()) {
  const sign = (value: string) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return {
    issue(username: string, credential: string) {
      const payload = Buffer.from(JSON.stringify({ username, credential: sign(credential), expires: now() + 12 * 60 * 60_000 })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    verify(token: string, credentialFor: (username: string) => string | null): string | null {
      try {
        if (token.length > 2048) return null;
        const [payload, signature, extra] = token.split('.');
        if (!payload || !signature || extra) return null;
        const expected = Buffer.from(sign(payload));
        const received = Buffer.from(signature);
        if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (typeof data.username !== 'string' || !Number.isFinite(data.expires) || data.expires <= now()) return null;
        const credential = credentialFor(data.username);
        return credential && sign(credential) === data.credential ? data.username : null;
      } catch { return null; }
    },
  };
}
