import type { SocialAutomationSettings } from "./settings";
import type { SocialPublishingService } from "./service";
import type { SocialMedia, SocialPlatform, SocialPublicationInput } from "./types";
import { randomUUID } from "node:crypto";

const ZONE = "Asia/Baghdad";
const LEASE_MS = 5 * 60_000;
const RETRY_MS = 10 * 60_000;
const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60_000;
export const VERIFIED_OFFICIAL_NEWS_HOSTS = ["variety.com", "deadline.com", "hollywoodreporter.com", "soompi.com", "koreaherald.com"] as const;

export type DailyContentKind = "news" | "trailer" | "promotion";

export interface VerifiedNewsItem {
  id: string;
  title: string;
  summaryKu: string;
  articleUrl: string;
  publishedAt: string;
}

export interface AuthorizedTrailerItem {
  id: string;
  title: string;
  summaryKu: string;
  media: SocialMedia;
  licenseId: string;
  licenseExpiresAt: string;
  allowedPlatforms: SocialPlatform[];
}

export interface AvailableCatalogTitle {
  id: string;
  title: string;
  year?: string;
  description?: string;
  playbackAvailable: boolean;
  broken: boolean;
  kurdishSubtitleStatus?: string;
  kurdishSubtitleUrl?: string;
  subtitleText?: string;
}

export interface DailySocialContentProviders {
  news(count: number, regions: SocialAutomationSettings["topics"]["regions"]): Promise<VerifiedNewsItem[]>;
  trailers(count: number): Promise<AuthorizedTrailerItem[]>;
  catalog(): Promise<AvailableCatalogTitle[]>;
}

export interface OfficialNewsFeed {
  url: string;
  region: SocialAutomationSettings["topics"]["regions"][number];
}

/** RSS adapter accepts only HTTPS feeds and article links on the feed's own host. */
export class OfficialRssNewsAdapter {
  constructor(private readonly options: {
    feeds: OfficialNewsFeed[];
    summarizeToSorani: (title: string, sourceSummary: string) => Promise<string>;
    fetcher?: typeof fetch;
    now?: () => number;
    maxFeedBytes?: number;
  }) {}

  private async readFeed(url: string): Promise<string> {
    const response = await (this.options.fetcher || fetch)(url, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/rss+xml, application/xml, text/xml;q=0.9" },
    });
    if (!response.ok || !response.body) throw new Error("OFFICIAL_NEWS_FEED_UNAVAILABLE");
    const maxBytes = this.options.maxFeedBytes || 1_000_000;
    const advertised = Number(response.headers.get("content-length") || 0);
    if (advertised > maxBytes) throw new Error("OFFICIAL_NEWS_FEED_TOO_LARGE");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let xml = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw new Error("OFFICIAL_NEWS_FEED_TOO_LARGE");
        xml += decoder.decode(value, { stream: true });
      }
      return xml + decoder.decode();
    } finally { reader.releaseLock(); }
  }

  async news(count: number, regions: SocialAutomationSettings["topics"]["regions"]): Promise<VerifiedNewsItem[]> {
    const now = this.options.now?.() ?? Date.now();
    const selected = this.options.feeds.filter(feed => regions.includes(feed.region)).slice(0, 8);
    const found: VerifiedNewsItem[] = [];
    for (const feed of selected) {
      const feedUrl = new URL(feed.url);
      const officialHost = VERIFIED_OFFICIAL_NEWS_HOSTS.some(host => feedUrl.hostname === host || feedUrl.hostname.endsWith(`.${host}`));
      if (!officialHost || feedUrl.protocol !== "https:" || feedUrl.username || feedUrl.password) continue;
      const xml = await this.readFeed(feed.url);
      const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
      for (const block of blocks) {
        const field = (name: string) => {
          const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
          return (match?.[1] || "").replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
        };
        const title = field("title");
        const articleUrl = field("link");
        const publishedAt = field("pubDate");
        const sourceSummary = field("description");
        const parsedPublished = Date.parse(publishedAt);
        if (!title || !sourceSummary || !Number.isFinite(parsedPublished) || parsedPublished < now - MAX_ITEM_AGE_MS || parsedPublished > now + 5 * 60_000) continue;
        let article: URL;
        try { article = new URL(articleUrl); } catch { continue; }
        if (article.protocol !== "https:" || article.hostname.toLowerCase() !== feedUrl.hostname.toLowerCase() || article.username || article.password) continue;
        const summaryKu = await this.options.summarizeToSorani(title, sourceSummary);
        if (!isKurdishSummary(summaryKu)) continue;
        found.push({ id: `${feedUrl.hostname}:${article.pathname}`, title, summaryKu, articleUrl: article.toString(), publishedAt: new Date(parsedPublished).toISOString() });
      }
    }
    return found.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, Math.max(0, Math.min(count, 20)));
  }
}

export interface DailyAutomationRun {
  dayKey: string;
  status: "running" | "partial" | "complete" | "failed";
  leaseUntil: number;
  leaseToken: string;
  retryAt?: number;
  jobIds: string[];
  requested: Record<DailyContentKind, number>;
  created: Record<DailyContentKind, number>;
  skipped: Record<DailyContentKind, number>;
  errors: string[];
  updatedAt: string;
}

export interface DailyAutomationRunStore {
  claim(dayKey: string, now: number): Promise<string | null>;
  get(dayKey: string): Promise<DailyAutomationRun | null>;
  save(run: DailyAutomationRun, leaseToken: string): Promise<void>;
}

export function baghdadDayKey(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (name: string) => parts.find(part => part.type === name)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function baghdadWallTimeToDate(dayKey: string, time: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new Error("INVALID_BAGHDAD_TIME");
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const read = (name: string) => Number(parts.find(part => part.type === name)?.value);
    const represented = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"));
    candidate += target - represented;
  }
  return new Date(candidate);
}

function isKurdishSummary(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value) && value.trim().length >= 12;
}

function allowedArticle(url: string, hosts: Set<string>): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password &&
      [...hosts].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function interpolate(template: string, values: Record<string, string>): string {
  const expanded = template.replace(/\{(title|summary|year|source)\}/g, (_match, key: string) => values[key] || "").trim();
  return expanded || [values.title, values.summary, values.year].filter(Boolean).join("\n");
}

function distributeTimes(count: number, start: string, end: string, dayKey: string): Array<{ dayKey: string; time: string }> {
  if (!count) return [];
  const toMinutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
  const from = toMinutes(start);
  let span = toMinutes(end) - from;
  if (span <= 0) span += 24 * 60;
  return Array.from({ length: count }, (_, index) => {
    const absolute = Math.floor(from + (span * (index + 1)) / (count + 1));
    const offset = Math.floor(absolute / (24 * 60));
    const at = absolute % (24 * 60);
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return { dayKey: date.toISOString().slice(0, 10), time: `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}` };
  });
}

export class FirestoreDailyAutomationRunStore implements DailyAutomationRunStore {
  constructor(private readonly appRef: () => import("firebase-admin/app").App | null) {}

  private collection() {
    const app = this.appRef();
    if (!app) throw new Error("DAILY_AUTOMATION_STORAGE_UNAVAILABLE");
    return import("firebase-admin/firestore").then(({ getFirestore }) => getFirestore(app).collection("socialAutomationRuns"));
  }

  async get(dayKey: string): Promise<DailyAutomationRun | null> {
    const collection = await this.collection();
    const snapshot = await collection.doc(dayKey).get();
    return snapshot.exists ? snapshot.data() as DailyAutomationRun : null;
  }

  async claim(dayKey: string, now: number): Promise<string | null> {
    const collection = await this.collection();
    const ref = collection.doc(dayKey);
    const firestore = ref.firestore;
    return firestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists ? snapshot.data() as DailyAutomationRun : null;
      if (current && (current.status === "complete" || current.status === "running" && current.leaseUntil > now || current.retryAt && current.retryAt > now)) return null;
      const leaseToken = randomUUID();
      transaction.set(ref, {
        ...(current || {}), dayKey, status: "running", leaseUntil: now + LEASE_MS, leaseToken,
        jobIds: current?.jobIds || [], requested: current?.requested || { news: 0, trailer: 0, promotion: 0 },
        created: current?.created || { news: 0, trailer: 0, promotion: 0 },
        skipped: current?.skipped || { news: 0, trailer: 0, promotion: 0 }, errors: current?.errors || [], updatedAt: new Date(now).toISOString(),
      });
      return leaseToken;
    });
  }

  async save(run: DailyAutomationRun, leaseToken: string): Promise<void> {
    const collection = await this.collection();
    const ref = collection.doc(run.dayKey);
    await ref.firestore.runTransaction(async transaction => {
      const current = await transaction.get(ref);
      if (!current.exists || (current.data() as DailyAutomationRun).leaseToken !== leaseToken) throw new Error("DAILY_AUTOMATION_LEASE_LOST");
      transaction.set(ref, run);
    });
  }
}

export class DailySocialAutomationEngine {
  constructor(private readonly options: {
    runs: DailyAutomationRunStore;
    publishing: SocialPublishingService;
    providers: DailySocialContentProviders;
    officialNewsHosts: string[];
    now?: () => number;
  }) {}

  async runToday(settings: SocialAutomationSettings): Promise<DailyAutomationRun | null> {
    const now = this.options.now?.() ?? Date.now();
    if (settings.schedule.paused || !Object.values(settings.platforms).some(Boolean)) return null;
    const dayKey = baghdadDayKey(new Date(now));
    const leaseToken = await this.options.runs.claim(dayKey, now);
    if (!leaseToken) return this.options.runs.get(dayKey);

    const requested = { ...settings.dailyCounts };
    const previous = await this.options.runs.get(dayKey);
    const created: Record<DailyContentKind, number> = { news: previous?.created.news || 0, trailer: previous?.created.trailer || 0, promotion: previous?.created.promotion || 0 };
    const skipped: Record<DailyContentKind, number> = { news: requested.news, trailer: requested.trailer, promotion: requested.promotion };
    const jobIds: string[] = [...new Set(previous?.jobIds || [])];
    const errors: string[] = [];
    const hosts = new Set(this.options.officialNewsHosts.map(host => host.toLowerCase()));
    const tasks: Array<{ kind: DailyContentKind; title: string; caption: string; description?: string; scheduledAt: string; media?: SocialMedia; platforms: SocialPlatform[]; provenance: NonNullable<SocialPublicationInput["provenance"]>; key: string }> = [];

    try {
      const [newsResult, trailersResult, catalogResult] = await Promise.allSettled([
        this.options.providers.news(Math.max(0, requested.news - created.news), settings.topics.regions),
        this.options.providers.trailers(Math.max(0, requested.trailer - created.trailer)),
        this.options.providers.catalog(),
      ]);
      for (const result of [newsResult, trailersResult, catalogResult]) if (result.status === "rejected") errors.push(result.reason instanceof Error ? result.reason.name.slice(0, 80) : "PROVIDER_FAILURE");
      const news = newsResult.status === "fulfilled" ? newsResult.value : [];
      const trailers = trailersResult.status === "fulfilled" ? trailersResult.value : [];
      const catalog = catalogResult.status === "fulfilled" ? catalogResult.value : [];
      const newestAllowed = now + 5 * 60_000;
      const oldestAllowed = now - MAX_ITEM_AGE_MS;
      const seen = new Set<string>();
      const alreadyCreatedNews = created.news;
      for (const item of requested.news > created.news ? news : []) {
        const published = Date.parse(item.publishedAt);
        if (!item.id || !item.title?.trim() || !isKurdishSummary(item.summaryKu || "") || !allowedArticle(item.articleUrl, hosts) || !Number.isFinite(published) || published < oldestAllowed || published > newestAllowed) continue;
        const key = `news:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const values = { title: item.title, summary: item.summaryKu, source: item.articleUrl };
        const caption = settings.captions.news
          ? interpolate(settings.captions.news, values)
          : `${item.title}\n${item.summaryKu}\nسەرچاوە: ${item.articleUrl}`;
        tasks.push({ kind: "news", key, title: item.title.slice(0, 200), caption, description: item.articleUrl, scheduledAt: "", platforms: Object.entries(settings.platforms).filter(([, enabled]) => enabled).map(([platform]) => platform as SocialPlatform), provenance: { source: "official-news", sourceUrl: item.articleUrl, verifiedAt: new Date(now).toISOString() } });
        if (alreadyCreatedNews + tasks.filter(task => task.kind === "news").length >= requested.news) break;
      }
      // The loop above appends the final item before incrementing, so count from validated tasks.
      created.news = alreadyCreatedNews + tasks.filter(task => task.kind === "news").length;

      for (const item of requested.trailer > created.trailer ? trailers : []) {
        const licenseExpiresAt = Date.parse(item.licenseExpiresAt);
        if (!item.id || !item.title?.trim() || !isKurdishSummary(item.summaryKu || "") || !item.licenseId?.trim() || !Number.isFinite(licenseExpiresAt) || licenseExpiresAt <= now || !item.allowedPlatforms?.length || !item.media || item.media.type !== "video" || !(item.media.url || item.media.storagePath)) continue;
        const platforms = Object.entries(settings.platforms).filter(([platform, enabled]) => enabled && item.allowedPlatforms.includes(platform as SocialPlatform)).map(([platform]) => platform);
        if (!platforms.length) continue;
        const key = `trailer:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const values = { title: item.title, summary: item.summaryKu };
        tasks.push({ kind: "trailer", key, title: item.title.slice(0, 200), caption: settings.captions.trailer ? interpolate(settings.captions.trailer, values) : `${item.title}\n${item.summaryKu}`, scheduledAt: "", media: { ...item.media, rightsConfirmed: true }, platforms: platforms as SocialPlatform[], provenance: { source: "licensed-trailer", licenseId: item.licenseId.slice(0, 160), verifiedAt: new Date(now).toISOString() } });
        if (created.trailer + tasks.filter(task => task.kind === "trailer").length >= requested.trailer) break;
      }
      created.trailer += tasks.filter(task => task.kind === "trailer").length;

      const eligibleTitles = catalog.filter(title => title.id && title.title?.trim() && title.playbackAvailable && !title.broken);
      for (const title of eligibleTitles.slice(0, Math.max(0, requested.promotion - created.promotion))) {
        const summary = isKurdishSummary(title.description || "") ? title.description!.slice(0, 800) : "";
        const subtitleAvailable = title.kurdishSubtitleStatus
          ? title.kurdishSubtitleStatus === "ready"
          : Boolean(title.kurdishSubtitleUrl || title.subtitleText);
        const subtitleKnown = Boolean(title.kurdishSubtitleStatus || title.kurdishSubtitleUrl || title.subtitleText);
        const facts = [title.year, subtitleKnown ? (subtitleAvailable ? "ژێرنووسی کوردی بەردەستە" : "ژێرنووسی کوردی بەردەست نییە") : ""].filter(Boolean).join(" · ");
        const caption = interpolate(settings.captions.promotion, { title: title.title, summary: summary || facts, year: title.year || "" });
        tasks.push({ kind: "promotion", key: `promotion:${title.id}`, title: title.title.slice(0, 200), caption: settings.captions.promotion ? caption : `لە CinamaChat ببینە: ${caption}`, description: summary || facts, scheduledAt: "", platforms: Object.entries(settings.platforms).filter(([, enabled]) => enabled).map(([platform]) => platform as SocialPlatform), provenance: { source: "cinemachat-catalog", catalogTitleId: title.id.slice(0, 160), verifiedAt: new Date(now).toISOString(), kurdishSubtitleStatus: !subtitleKnown ? "unknown" : subtitleAvailable ? "available" : "unavailable" } });
      }
      created.promotion += tasks.filter(task => task.kind === "promotion").length;

      const taskTimes = distributeTimes(tasks.length, settings.schedule.startTime, settings.schedule.endTime, dayKey);
      for (let index = 0; index < tasks.length; index += 1) {
        const task = tasks[index];
        const scheduledAt = baghdadWallTimeToDate(taskTimes[index].dayKey, taskTimes[index].time).toISOString();
        const result = await this.options.publishing.enqueue({
          contentKind: task.kind,
          provenance: task.provenance,
          platforms: task.platforms,
          caption: task.caption,
          title: task.title,
          description: task.description,
          ...(task.media ? { media: task.media } : {}),
          scheduledAt,
        }, `daily-automation:${dayKey}`);
        jobIds.push(result.job.id);
      }
      skipped.news = Math.max(0, requested.news - created.news);
      skipped.trailer = Math.max(0, requested.trailer - created.trailer);
      skipped.promotion = Math.max(0, requested.promotion - created.promotion);
    } catch (error) {
      errors.push(error instanceof Error ? error.name.slice(0, 80) : "PROVIDER_FAILURE");
    }

    const complete = Object.values(skipped).every(value => value === 0) && errors.length === 0;
    const result: DailyAutomationRun = {
      dayKey, leaseToken, status: complete ? "complete" : errors.length && !jobIds.length ? "failed" : "partial",
      leaseUntil: 0, ...(complete ? {} : { retryAt: now + RETRY_MS }), jobIds,
      requested, created, skipped, errors, updatedAt: new Date(now).toISOString(),
    };
    skipped.news = Math.max(0, requested.news - created.news);
    skipped.trailer = Math.max(0, requested.trailer - created.trailer);
    skipped.promotion = Math.max(0, requested.promotion - created.promotion);
    await this.options.runs.save(result, leaseToken);
    return result;
  }
}
