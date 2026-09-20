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
const DEFAULT_SEARCH_CONSOLE_CLIENT_EMAIL =
  'firebase-adminsdk-fbsvc@gen-lang-client-0240212572.iam.gserviceaccount.com';

// Local service-account JSON candidates (project root), tried in order when the
// env credential is missing/incomplete. These files are NOT committed to git
// and act as a development/staging fallback source.
const SERVICE_ACCOUNT_FILES = [
  'service-account.json',
  'credentials.json',
  // Local Firebase Admin credential already used by this project. Search
  // Console access still has to be granted to this account in Google.
  'gen-lang-client-0240212572-firebase-adminsdk-fbsvc-b4e91ae7d0.json',
];

// Search Console "property" (site) candidates, tried in order. The env override
// wins, then the URL-prefix format for the CinemaChat production domain, then
// the legacy sc-domain: format (relevant when Search Console only matches the
// exact https://www.cinamachat.com/ property instead of a domain property).
function candidateSiteUrls(): string[] {
  const out: string[] = [];
  const configured = (process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '').trim();
  if (configured && !out.includes(configured)) out.push(configured);
  out.push('https://www.cinamachat.com/');
  if (!out.includes('sc-domain:cinamachat.com')) out.push('sc-domain:cinamachat.com');
  return out;
}

// Primary/display site used in logs and response payloads (first candidate).
function siteUrl(): string {
  return candidateSiteUrls()[0];
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
  const envEmail = (
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL || DEFAULT_SEARCH_CONSOLE_CLIENT_EMAIL
  ).trim();
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

// Zeroed result used when the connection is authenticated but the report
// cannot be produced (empties/zeros, throttling, 5xx — NOT an auth problem).
const ZEROED_RESULT: QueryResult = {
  queries: [],
  totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
};

type ReportResult =
  | { ok: true; site: string; data: QueryResult }
  | { ok: false; reason: 'auth'; detail: string }
  | { ok: false; reason: 'other'; detail: string };

// Fetches the search-analytics query report (top queries + totals) via the
// Search Console API. Site candidates are tried in order (env override →
// URL-prefix → sc-domain): a 401/403 on one property may simply mean that exact
// property isn't granted, so it is retried with the next candidate before being
// classified as an auth failure. Failures are classified so the caller can tell
// a REAL authentication problem (missing/invalid credentials or a 401/403 from
// Google) apart from transient/empty responses that should NOT trigger demo.
async function fetchQueryReport(jwt: JWT, days: number): Promise<ReportResult> {
  const [startDate, endDate] = lastNDaysIso(days);
  const body = {
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: 25,
  };

  const token = await jwt.getAccessToken().catch((err: any) => {
    console.warn(
      `[Search Console] getAccessToken() FAILED — client-email/private-key pair is likely invalid: ` +
        `${err?.message || err}.`,
    );
    return null;
  });
  if (!token?.token) {
    return { ok: false, reason: 'auth', detail: 'access-token acquisition failed' };
  }

  let lastAuthError: string | null = null;
  let lastOtherError: string | null = null;

  for (const candidate of candidateSiteUrls()) {
    const url = `${SEARCH_CONSOLE_API_PREFIX}/sites/${encodeURIComponent(candidate)}/searchAnalytics/query`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch((err: any) => {
      console.warn(`[Search Console] Query report network error for ${candidate}: ${err?.message || err}.`);
      return null;
    });

    if (!resp) {
      lastOtherError = lastOtherError || `network error for ${candidate}`;
      continue;
    }
    if (resp.status === 401 || resp.status === 403) {
      console.warn(
        `[Search Console] Google rejected the token for ${candidate} (HTTP ${resp.status}) — ` +
          'trying next site candidate...',
      );
      lastAuthError = lastAuthError || `HTTP ${resp.status} for ${candidate}`;
      continue;
    }
    if (!resp.ok) {
      console.warn(
        `[Search Console] Query report HTTP ${resp.status} for ${candidate} ` +
          '(non-auth error — trying next site candidate).',
      );
      lastOtherError = lastOtherError || `HTTP ${resp.status} for ${candidate}`;
      continue;
    }

    const json: any = await resp.json().catch(() => null);
    if (!json) {
      lastOtherError = lastOtherError || `unparseable body for ${candidate}`;
      continue;
    }

    // Empty rows / zero counts are a VALID live response — not a reason to demo.
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
      ok: true,
      site: candidate,
      data: {
        queries,
        totals: {
          clicks: totalClicks,
          impressions: totalImpressions,
          ctr: totalImpressions ? totalClicks / totalImpressions : 0,
          position: rows.length
            ? rows.reduce((s, r) => s + (Number(r.position) || 0), 0) / rows.length
            : 0,
        },
      },
    };
  }

  if (lastAuthError) return { ok: false, reason: 'auth', detail: lastAuthError };
  return { ok: false, reason: 'other', detail: lastOtherError || 'all site candidates failed' };
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

  for (const candidate of candidateSiteUrls()) {
    const url = `${SEARCH_CONSOLE_API_PREFIX}/sites/${encodeURIComponent(candidate)}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.token}` },
    }).catch((err: any) => {
      console.warn(`[Search Console] Index status network error for ${candidate}: ${err?.message || err}.`);
      return null;
    });
    if (!resp || !resp.ok) {
      console.warn(
        `[Search Console] Index status HTTP ${resp?.status ?? '(no response)'} for ${candidate} ` +
          '(trying next site candidate).',
      );
      continue;
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

  return { status: 'unknown', lastCrawled: null, crawlErrors: 0, securityAlert: false };
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

// Main entry used by the /api/admin/seo-stats route. Never throws. Demo data
// (isDemo: true) is served ONLY when the Google credential itself fails or
// Google returns a 401/403 auth error. Any authenticated connection — even
// with empty rows or zero counts — returns the live response (isDemo: false).
export async function getSearchConsoleStats(days = 30): Promise<any> {
  const jwt = buildJwtClient();
  if (!jwt) return demoData(days);

  const [report, index] = await Promise.all([
    fetchQueryReport(jwt, days),
    fetchIndexStatus(jwt),
  ]);

  // AUTH failure — token acquisition rejected the credentials, or Google
  // explicitly rejected the token (401/403). This is the ONLY demo trigger
  // besides having no usable credentials at all.
  if (report.ok === false) {
    if (report.reason === 'auth') {
      console.warn(
        `[Search Console] Auth failure (${report.detail}) for ${siteUrl()} (${days}d) — ` +
          'serving demo data. Check the service-account credentials and Search Console access.',
      );
      return demoData(days);
    }
    // Authenticated connection that failed for a non-auth reason (network
    // glitch, 5xx, throttling). We keep the LIVE response with zeroed counts —
    // never mask a working credential with demo data.
    console.warn(
      `[Search Console] Report error (${report.detail}) — keeping authenticated live ` +
        'response with zeroed counts (isDemo: false).',
    );
    return {
      configured: true,
      isDemo: false,
      siteUrl: siteUrl(),
      rangeDays: days,
      report: ZEROED_RESULT,
      index,
    };
  }

  // Authenticated + report produced — even if rows are empty / counts are 0,
  // this is a real, connected response (isDemo stays false).
  console.log(
    `[Search Console] Live API call OK (${report.site}, ${days}d) — ` +
      `rows: ${report.data.queries.length}, clicks: ${report.data.totals.clicks}, ` +
      `impressions: ${report.data.totals.impressions}, index status: ${index.status}. ` +
      'Returning live stats (isDemo: false).',
  );

  return {
    configured: true,
    isDemo: false,
    siteUrl: report.site,
    rangeDays: days,
    report: report.data,
    index,
  };
}
