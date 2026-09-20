import { JWT } from 'google-auth-library';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SERVICE_ACCOUNT_FILES = [
  'service-account.json',
  'credentials.json',
  'gen-lang-client-0240212572-firebase-adminsdk-fbsvc-b4e91ae7d0.json',
].map((fileName) => path.resolve(process.cwd(), fileName));
const SEARCH_CONSOLE_API = 'https://searchconsole.googleapis.com/webmasters/v3';
const SITES = ['https://www.cinamachat.com/', 'sc-domain:cinamachat.com'];

function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function normalizePrivateKey(value: string): string {
  return value.trim().replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

async function readResponseBody(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return '(empty response body)';

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

async function main(): Promise<void> {
  console.log('=== Google Search Console API direct test ===');
  const serviceAccountFile = SERVICE_ACCOUNT_FILES.find((filePath) => existsSync(filePath));
  console.log(`Credential file: ${serviceAccountFile || SERVICE_ACCOUNT_FILES[0]}`);

  if (!serviceAccountFile) {
    throw new Error(
      `Missing ${SERVICE_ACCOUNT_FILES.join(', ')}. Place service-account.json at the project root and run this test again.`,
    );
  }

  const credentials = JSON.parse(readFileSync(serviceAccountFile, 'utf8'));
  const clientEmail = String(credentials.client_email || '').trim();
  const privateKey = normalizePrivateKey(String(credentials.private_key || ''));

  if (!clientEmail || !privateKey) {
    throw new Error('service-account.json must contain client_email and private_key.');
  }

  console.log(`Service account: ${clientEmail}`);
  const jwt = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    subject: clientEmail,
  });

  console.log('Requesting Google access token...');
  const tokenResponse = await jwt.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error('Google returned no access token.');
  }
  console.log('Access token: acquired successfully (token value omitted).');

  const { startDate, endDate } = dateRange(7);
  const body = {
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: 25,
  };
  console.log(`Date range: ${startDate} through ${endDate}`);

  for (const site of SITES) {
    const url = `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
    console.log('\n--- Search Console property ---');
    console.log(`Site: ${site}`);
    console.log(`Request: POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResponse.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Response body:');
    console.log(await readResponseBody(response));
  }
}

main().catch((error: unknown) => {
  console.error('\n=== Test failed ===');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});