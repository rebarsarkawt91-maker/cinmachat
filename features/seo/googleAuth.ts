import { createPrivateKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { JWT } from 'google-auth-library';

const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

type ServiceAccountCredentials = {
  client_email?: string;
  clientEmail?: string;
  private_key?: string;
  privateKey?: string;
};

export function cleanPrivateKey(value: string | undefined): string | undefined {
  if (!value) return undefined;

  let key = value.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n');

  const body = key
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/gi, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/gi, '')
    .replace(/\\["']/g, '')
    .replace(/["'\s]/g, '');

  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return undefined;

  const chunks = body.match(/.{1,64}/g);
  if (!chunks) return undefined;
  return `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

function credentialCandidates(): string[] {
  const configuredPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  const candidates = [
    configuredPath,
    '/etc/secrets/firebase-service-account.json',
    '/etc/secrets/service-account.json',
    'firebase-service-account.json',
    'service-account.json',
    'credentials.json',
    'gen-lang-client-0240212572-firebase-adminsdk-fbsvc-b4e91ae7d0.json',
  ].filter(Boolean);

  return [...new Set(candidates.map((candidate) => path.resolve(process.cwd(), candidate)))];
}

function loadCredentials(): { clientEmail: string; privateKey: string; source: string } | null {
  for (const filePath of credentialCandidates()) {
    if (!existsSync(filePath)) continue;
    try {
      const json = JSON.parse(readFileSync(filePath, 'utf8')) as ServiceAccountCredentials;
      const clientEmail = String(json.client_email || json.clientEmail || '').trim();
      const privateKey = cleanPrivateKey(json.private_key || json.privateKey);
      if (!clientEmail || !privateKey) {
        console.warn(`[Search Console] Ignoring incomplete credential file: ${filePath}.`);
        continue;
      }

      // OpenSSL parsing catches malformed base64/ASN.1 before Google receives a JWT.
      createPrivateKey({ key: privateKey, format: 'pem' });
      return { clientEmail, privateKey, source: filePath };
    } catch (error: any) {
      console.error(
        `[Search Console] Invalid credential file ${filePath}: ${error?.message || error}.`,
      );
    }
  }
  return null;
}

export function getSearchConsoleClient(): JWT | null {
  const credentials = loadCredentials();
  if (!credentials) {
    console.error('[Search Console] No OpenSSL-valid service-account JSON credential was found.');
    return null;
  }

  console.log(
    `[Search Console] Using validated credentials from ${credentials.source} ` +
      `for ${credentials.clientEmail}.`,
  );
  return new JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: [SEARCH_CONSOLE_SCOPE],
    subject: credentials.clientEmail,
  });
}
