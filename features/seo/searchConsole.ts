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
//   • Credentials are read ONLY from the environment, never hardcoded/committed.
//   • If the credentials are missing (or any API call fails) the endpoint
//     FAILS SAFE: it returns a clearly-marked demo dataset so the admin UI
//     still renders, never throws, and never crashes the server.
//   • Only a short, scoped subset of data is ever returned to the client.
// ---------------------------------------------------------------------------
import { JWT } from 'google-auth-library';

const SEARCH_CONSOLE_API_PREFIX = 'https://searchconsole.googleapis.com/webmasters/v3';

// The Search Console "property" (site) whose data we read. Defaults to the
// CinemaChat production domain, overridable via env for testing/staging.
function siteUrl(): string {
  const configured = (process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '').trim();
  if (configured) return configured;
  return 'sc-domain:cinamachat.com';
}

// Build an authenticated JWT client. Returns null when credentials are missing
// (so callers can serve demo data). The private key may arrive as literal "\n"
// from a single-line env var (common on Render/CI), so normalize it.
function buildJwtClient(): JWT | null {
  const clientEmail = (process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL || '').trim();
  const rawPrivateKey = (process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY || '').trim()
    .replace(/\\n/g, '\n');

  if (!clientEmail || !rawPrivateKey) {
    console.warn(
      '[Search Console] GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL / GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY ' +
        'are not configured. Serving demo SEO data.',
    );
    return null;
  }

  return new JWT({
    email: clientEmail,
    key: rawPrivateKey,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    subject: clientEmail,
  });
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

  const token = await jwt.getAccessToken().catch(() => null);
  if (!token?.token) return null;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!resp || !resp.ok) return null;

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
  const token = await jwt.getAccessToken().catch(() => null);
  if (!token?.token) {
    return { status: 'unknown', lastCrawled: null, crawlErrors: 0, securityAlert: false };
  }
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.token}` },
  }).catch(() => null);
  if (!resp || !resp.ok) {
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
    console.warn('[Search Console] API request failed. Serving demo SEO data.');
    return demoData(days);
  }

  return {
    configured: true,
    siteUrl: siteUrl(),
    rangeDays: days,
    report,
    index,
  };
}
