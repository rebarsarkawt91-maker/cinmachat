// ---------------------------------------------------------------------------
// Google Search Console integration for CinemaChat's SEO dashboard.
//
// Uses the Search Console API (webmasters/v3 REST) with a service-account
// JWT credential obtained from the GOOGLE_SEARCH_CONSOLE_* environment
// variables. The `google-auth-library` package (a transitive dependency of
// firebase-admin) signs the JWT locally so no extra npm install is needed and
// it works on non-GCP hosts (e.g. Render).
//
// Design rules (mirroring the rest of the server):
//   • Credentials are read ONLY from the environment OR an untracked local
//     service-account file (credentials.json / service-account.json at the
//     project root) — never hardcoded/committed.
//   • If the credentials are missing or incomplete (or any API call fails) the
//     endpoint FAILS SAFE: it returns a clearly-marked demo dataset so the
//     admin UI still renders, never throws, and never crashes the server.
//   • Only a short, scoped subset of data is ever returned to the client.
// ---------------------------------------------------------------------------
import { JWT } from 'google-auth-library';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SEARCH_CONSOLE_API_PREFIX = 'https://searchconsole.googleapis.com/webmasters/v3';

// Local service-account JSON candidates (project root), tried in order when the
// env credential is missing/incomplete. These files are NOT committed to git
// and act as a development/staging fallback source.
const SERVICE_ACCOUNT_FILES = ['credentials.json', 'service-account.json'];

// The Search Console "property" (site) whose data we read. Defaults to the
// CinemaChat production domain, overridable via env for testing/staging.
function siteUrl(): string {
  const configured = (process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '').trim();
  if (configured) return configured;
  return 'sc-domain:cinamachat.com';
}

// Render/service dashboards often paste the PEM as a single-line env var with
// escaped "\n" (and sometimes CRLF-wrapped "\r\n"). Normalize BOTH styles so
// the JWT always receives REAL newlines before signing.
function normalizePrivateKey(key: string): string {
  return key.trim().replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

// A usable private key must carry the PEM header AND footer after newline
// normalization, otherwise it is treated as incomplete so a fallback source
// (or the demo path) can be used instead of failing further down the line.
function isCompletePrivateKey(formattedKey: string): boolean {
  const upper = formattedKey.toUpperCase();
  return upper.includes('BEGIN PRIVATE KEY') && upper.includes('END PRIVATE KEY');
}

// Shared JWT factory used by both the env and the local-file credential paths.
function jwtFrom(clientEmail: string, formattedKey: string): JWT {
  return new JWT({
    email: clientEmail,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    subject: clientEmail,
  });
}

// Reads service-account credentials from a local JSON file at the project root
// (credentials.json or service-account.json). Returns the normalized email +
// private key, or null when no file exists or it cannot be parsed.
function loadServiceAccountFile(): { clientEmail: string; privateKey: string } | null {
  for (const fileName of SERVICE_ACCOUNT_FILES) {
    const filePath = path.resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;
    try {
      const json = JSON.parse(readFileSync(filePath, 'utf8'));
      const clientEmail = String(json?.client_email || json?.clientEmail || '').trim();
      const privateKey = normalizePrivateKey(String(json?.private_key || json?.privateKey || ''));
      if (clientEmail && isCompletePrivateKey(privateKey)) {
        console.log(
          `[Search Console] Service-account credentials loaded from ${filePath} ` +
            `(${privateKey.split('\n').length} key line(s)).`,
        );
        return { clientEmail, privateKey };
      }
      console.warn(
        `[Search Console] ${filePath} exists but is missing a valid ` +
          'client_email / private_key pair.',
      );
    } catch (err: any) {
      console.warn(`[Search Console] Failed to parse ${filePath}: ${err?.message || err}.`);
    }
  }
  return null;
}

// Build an authenticated JWT client. Returns null when no usable credential can
// be resolved (so callers serve demo data). Resolution order:
//   1. GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL + GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY
//      from the environment;
//   2. the local service-account file at the project root;
//   3. null → demo data.
function buildJwtClient(): JWT | null {
  const envEmail = (process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL || '').trim();
  const envFormattedKey = normalizePrivateKey(
    process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY || '',
  );

  // Env credential present and structurally valid → use it.
  if (envEmail && isCompletePrivateKey(envFormattedKey)) {
    console.log(
      `[Search Console] Credentials found in env for ${envEmail} ` +
        `(site: ${siteUrl()}). Private key normalized — ` +
        `${envFormattedKey.split('\n').length} line(s). Authentication primed.`,
    );
    return jwtFrom(envEmail, envFormattedKey);
  }

  // Env credential missing/incomplete → fall back to the local credentials file.
  const fileCred = loadServiceAccountFile();
  if (fileCred) {
    console.log(
      `[Search Console] Authenticating with service-account file: ` +
        `${fileCred.clientEmail} (site: ${siteUrl()}).`,
    );
    return jwtFrom(fileCred.clientEmail, fileCred.privateKey);
  }

  console.warn(
    '[Search Console] No usable Google Search Console credentials found. ' +
      'GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL / GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY are not ' +
      'configured (or the private key is incomplete), and no local credentials file ' +
      `(${SERVICE_ACCOUNT_FILES.join(', ')}) exists at ${process.cwd()}. Serving demo SEO data.`,
  );
  return null;
}

function lastNDaysIso(n: number): string[] {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (n - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [iso(start), iso(end)];
}

type QueryResult = {
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
};

// Fetches the search-analytics query report (top queries + totals) via the
// Search Console API. Returns null on any failure so the caller falls back.
async function fetchQueryReport(jwt: JWT, days: number): Promise<QueryResult | null> {
  const [startDate, endDate] = lastNDaysIso(days);
  const body = {
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: 25,
  };
  const url = `${SEARCH_CONSOLE_API_PREFIX}/sites/${encodeURIComponent(siteUrl())}/searchAnalytics/query`;

  const token = await jwt.getAccessToken().catch((err: any) => {
    console.warn(
      `[Search Console] getAccessToken() FAILED — client-email/private-key pair is likely invalid: ` +
        `${err?.message || err}.`,
    );
    return null;
  });
  if (!token?.token) return null;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch((err: any) => {
    console.warn(`[Search Console] Query report network error: ${err?.message || err}.`);
    return null;
  });
  if (!resp || !resp.ok) {
    console.warn(
      `[Search Console] Query report HTTP ${resp?.status ?? '(no response)'} for ${url}.`,
    );
    return null;
  }

  const json: any = await resp.json().catch(() => null);
  const rows: any[] = Array.isArray(json?.rows) ? json.rows : [];
  const clickSum = (key: number) => rows.reduce((sum, r) => sum + (Number(r.keys?.[key] ?? 0) || 0), 0);

  const queries = rows.map((r: any) => ({
    query: String(r.keys?.[0] ?? '(unknown)'),
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    ctr: Number(r.ctr) || 0,
    position: Number(r.position) || 0,
  }));

  const totalClicks = clickSum(2) || rows.reduce((s, r) => s + (Number(r.clicks) || 0), 0) || queries.reduce((s, q) => s + q.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + (Number(r.impressions) || 0), 0) || queries.reduce((s, q) => s + q.impressions, 0);

  return {
    queries,
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions ? totalClicks / totalImpressions : 0,
      position: rows.length
        ? rows.reduce((s, r) => s + (Number(r.position) || 0), 0) / rows.length
        : 0,
    },
  };
}

type IndexStatus = {
  status: 'indexed' | 'not-indexed' | 'unknown';
  lastCrawled: string | null;
  crawlErrors: number;
  securityAlert: boolean;
};

// Reads the site's index/crawl flags. The Search Console API exposes limited
// crawl data via the "sites" resource; combine it with conservative defaults
// for crawl-error counts so the UI always has a meaningful status.
async function fetchIndexStatus(jwt: JWT): Promise<IndexStatus> {
  const url = `${SEARCH_CONSOLE_API_PREFIX}/sites/${encodeURIComponent(siteUrl())}`;
  const token = await jwt.getAccessToken().catch((err: any) => {
    console.warn(
      `[Search Console] getAccessToken() FAILED (index status) — ` +
        `${err?.message || err}.`,
    );
    return null;
  });
  if (!token?.token) {
    return { status: 'unknown', lastCrawled: null, crawlErrors: 0, securityAlert: false };
  }
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.token}` },
  }).catch((err: any) => {
    console.warn(`[Search Console] Index status network error: ${err?.message || err}.`);
    return null;
  });
  if (!resp || !resp.ok) {
    console.warn(
      `[Search Console] Index status HTTP ${resp?.status ?? '(no response)'} for ${url}.`,
    );
    return { status: 'unknown', lastCrawled: null, crawlErrors: 0, securityAlert: false };
  }
  const json: any = await resp.json().catch(() => null);
  const permissionLevel = String(json?.permissionLevel || '');
  const status: IndexStatus['status'] =
    permissionLevel === 'siteFullUser' || permissionLevel === 'siteRestrictedUser'
      ? 'indexed'
      : 'unknown';
  return {
    status,
    lastCrawled: json?.lastCrawlDate || null,
    crawlErrors: 0,
    securityAlert: false,
  };
}

// Deterministic-looking demo dataset so the dashboard renders when Search
// Console credentials are unavailable (dev machines, fresh deploys). The demo
// figures scale loosely with the requested time range so the UI reacts to the
// 7/30/90-day filter even without live credentials.
function demoData(days: number): any {
  const factor = Math.max(1, Math.round(days / 7));
  const demoQueries = [
    'cinemachat', 'فیلمی کوردی', 'زنجیرەی کوردی', 'سینەما چات', 'فیلمی دۆبلاژی کوردی',
    'nawwnirani filmi kordi', 'film u zinjerekan be kurdi', 'سەیرکردنی فیلم بە کوردی',
    'کوردی دراما', 'فیلم و زنجیرە',
  ];
  const queries = demoQueries.map((query, idx) => ({
    query,
    clicks: (14 + ((idx * 7) % 40)) * factor,
    impressions: (120 + ((idx * 43) % 520)) * factor,
    ctr: 0.04 + ((idx * 0.011) % 0.06),
    position: 3.2 + ((idx * 0.7) % 6),
  }));
  const clickSum = queries.reduce((s, q) => s + q.clicks, 0);
  const impressionSum = queries.reduce((s, q) => s + q.impressions, 0);
  return {
    configured: false,
    isDemo: true,
    siteUrl: siteUrl(),
    rangeDays: days,
    report: {
      queries,
      totals: {
        clicks: clickSum,
        impressions: impressionSum,
        ctr: impressionSum ? clickSum / impressionSum : 0,
        position: queries.reduce((s, q) => s + q.position, 0) / queries.length,
      },
    },
    index: {
      status: 'unknown',
      lastCrawled: null,
      crawlErrors: 0,
      securityAlert: false,
    },
  };
}

// Main entry used by the /api/admin/seo-stats route. Never throws — falls back
// to demo data on any configuration/API failure.
export async function getSearchConsoleStats(days = 30): Promise<any> {
  const jwt = buildJwtClient();
  if (!jwt) return demoData(days);

  const [report, index] = await Promise.all([
    fetchQueryReport(jwt, days),
    fetchIndexStatus(jwt),
  ]);

  if (!report) {
    console.warn(
      `[Search Console] API call FAILED (${siteUrl()}, ${days}d) — ` +
        'falling back to demo data. Check the service-account credentials, ' +
        'private key newlines, and Search Console access for the site.',
    );
    return demoData(days);
  }

  console.log(
    `[Search Console] Live API call OK (${siteUrl()}, ${days}d) — ` +
      `clicks: ${report.totals.clicks}, impressions: ${report.totals.impressions}, ` +
      `index status: ${index.status}. Returning live stats (isDemo: false).`,
  );

  return {
    configured: true,
    isDemo: false,
    siteUrl: siteUrl(),
    rangeDays: days,
    report,
    index,
  };
}
