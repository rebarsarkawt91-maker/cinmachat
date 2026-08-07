import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import net from 'node:net';
import { rateLimiter, sanitizationMiddleware, createAdminGuard, logFailedAttempt } from './security';
import { generateSubtitle, translateSrtViaGemini } from './features/subtitles/subtitleGenerator.js';
import { execFile } from 'node:child_process';
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Pure Node.js YouTube caption fetcher — no yt-dlp, no external npm packages.
// Extracts the video ID, fetches the YouTube page to locate caption tracks,
// downloads the first available caption track, and returns the raw text.
// ---------------------------------------------------------------------------
function extractYoutubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  const patterns = [
    /youtu\.be\/([^#&?\s]{11})/i,
    /embed\/([^#&?\s]{11})/i,
    /\/v\/([^#&?\s]{11})/i,
    /youtube\.com\/shorts\/([^#&?\s]{11})/i,
    /[?&]v=([^#&?\s]{11})/i,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function normalizeSubtitleText(rawText: string): string {
  const cleanText = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return '';
  return cleanText.startsWith('WEBVTT')
    ? cleanText
        .replace(/^WEBVTT\s*(\n|$)/, '')
        .replace(/\nNOTE[^\n]*(\n|$)/g, '\n')
        .trim()
    : cleanText;
}

type YouTubeCaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  langCode?: string;
  kind?: string;
  isTranslatable?: boolean;
};

const YT_HTTP_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchTextWithTimeout(url: string, timeoutMs = 20000, init: RequestInit = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...YT_HTTP_HEADERS,
        ...(init.headers || {}),
      },
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout<T = any>(url: string, timeoutMs = 20000, init: RequestInit = {}): Promise<T> {
  const text = await fetchTextWithTimeout(url, timeoutMs, init);
  return JSON.parse(text) as T;
}

function extractPlayerResponseFromHtml(html: string): any | null {
  const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractInnertubeKeyFromHtml(html: string): string | null {
  const match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  return match?.[1] || null;
}

function getCaptionTracksFromPlayerResponse(playerResponse: any): YouTubeCaptionTrack[] {
  return playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}

function getTrackLang(track: YouTubeCaptionTrack): string {
  return (track.languageCode || track.langCode || '').toLowerCase();
}

function buildGenericTimedtextCandidates(videoId: string, lang: string): string[] {
  const candidates: string[] = [];
  const add = (url: string) => {
    if (!candidates.includes(url)) candidates.push(url);
  };

  for (const host of ['https://www.youtube.com/api/timedtext', 'https://video.google.com/timedtext']) {
    const base = `${host}?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}`;
    add(`${base}&fmt=vtt`);
    add(`${base}&kind=asr&fmt=vtt`);
    add(`${base}`);
  }
  return candidates;
}

function buildTrackTimedtextCandidates(track: YouTubeCaptionTrack, videoId: string, targetLang: string): string[] {
  const candidates: string[] = [];
  const add = (url: string) => {
    if (!candidates.includes(url)) candidates.push(url);
  };

  if (!track.baseUrl) return candidates;

  try {
    const raw = new URL(track.baseUrl);
    add(raw.toString());

    const withFmt = new URL(raw.toString());
    withFmt.searchParams.set('fmt', 'vtt');
    add(withFmt.toString());

    const sanitized = new URL(raw.toString());
    const volatileParams = [
      'ip', 'ipbits', 'expire', 'ei', 'signature', 'sig', 'sparams', 'lsparams', 'xospf', 'xowf', 'xoaf', 'exp', 'opi',
    ];
    for (const p of volatileParams) sanitized.searchParams.delete(p);
    sanitized.searchParams.set('v', videoId);
    sanitized.searchParams.set('fmt', 'vtt');
    add(sanitized.toString());

    const videoGoogle = new URL(sanitized.toString());
    videoGoogle.host = 'video.google.com';
    add(videoGoogle.toString());

    const trackLang = getTrackLang(track);
    if (targetLang && targetLang !== trackLang && (track.isTranslatable ?? true)) {
      const translated = new URL(videoGoogle.toString());
      translated.searchParams.set('tlang', targetLang);
      add(translated.toString());
    }
  } catch {
    // ignore malformed track URLs
  }

  return candidates;
}

function isLikelyCaptionPayload(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    t.startsWith('WEBVTT') ||
    t.startsWith('<transcript') ||
    /<text\s+start=/i.test(t) ||
    /\d{2}:\d{2}:\d{2}[\.,]\d{3}\s+-->/.test(t)
  );
}

function captionPayloadToSrt(raw: string): string {
  const clean = raw.replace(/^\uFEFF/, '').trim();
  if (!clean) return '';
  if (clean.startsWith('WEBVTT')) {
    return normalizeSubtitleText(clean);
  }
  if (clean.startsWith('<transcript') || /<text\s+start=/i.test(clean)) {
    return normalizeSubtitleText(youtubeCaptionXmlToSrt(clean));
  }
  return normalizeSubtitleText(clean);
}

async function fetchYouTubeCaptionTracks(videoId: string): Promise<YouTubeCaptionTrack[]> {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const html = await fetchTextWithTimeout(pageUrl);

  const playerResponse = extractPlayerResponseFromHtml(html);
  const pageTracks = getCaptionTracksFromPlayerResponse(playerResponse);
  if (pageTracks.length) return pageTracks;

  const innertubeKey = extractInnertubeKeyFromHtml(html);
  if (!innertubeKey) return [];

  const body = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240709.01.00',
        hl: 'en',
        gl: 'US',
      },
    },
    videoId,
  };

  const playerJson = await fetchTextWithTimeout(
    `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(innertubeKey)}`,
    20000,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  try {
    const playerData = JSON.parse(playerJson);
    return getCaptionTracksFromPlayerResponse(playerData);
  } catch {
    return [];
  }
}

type InvidiousCaption = {
  label?: string;
  languageCode?: string;
  url?: string;
  autoGenerated?: boolean;
};

const INVIDIOUS_INSTANCES = [
  'https://yewtu.be',
  'https://inv.nadeko.net',
  'https://invidious.jing.rocks',
  'https://invidious.privacyredirect.com',
];

function pickBestInvidiousCaption(captions: InvidiousCaption[], targetLang: string): InvidiousCaption | null {
  if (!captions.length) return null;
  const lang = (targetLang || 'en').toLowerCase();
  const exact = captions.find((c) => (c.languageCode || '').toLowerCase() === lang);
  if (exact) return exact;
  const autoExact = captions.find((c) => (c.languageCode || '').toLowerCase() === lang && c.autoGenerated);
  if (autoExact) return autoExact;
  const english = captions.find((c) => (c.languageCode || '').toLowerCase() === 'en');
  if (english) return english;
  return captions[0] || null;
}

async function fetchCaptionsViaInvidious(
  videoId: string,
  targetLang: string,
): Promise<{ srt: string; source: string; fetchUrl: string } | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const listUrl = `${instance}/api/v1/captions/${encodeURIComponent(videoId)}`;
      const rawList = await fetchJsonWithTimeout<any>(listUrl, 12000);
      const captions: InvidiousCaption[] = Array.isArray(rawList)
        ? rawList
        : Array.isArray(rawList?.captions)
          ? rawList.captions
          : [];
      if (!Array.isArray(captions) || captions.length === 0) {
        continue;
      }

      const picked = pickBestInvidiousCaption(captions, targetLang);
      if (!picked?.url) {
        continue;
      }

      const captionUrl = picked.url.startsWith('http') ? picked.url : `${instance}${picked.url}`;
      const raw = await fetchTextWithTimeout(captionUrl, 15000);
      if (!isLikelyCaptionPayload(raw)) {
        continue;
      }

      const srt = captionPayloadToSrt(raw);
      if (!srt) {
        continue;
      }

      return {
        srt,
        source: `invidious-${picked.languageCode || 'unknown'}`,
        fetchUrl: captionUrl,
      };
    } catch {
      // try the next instance
    }
  }

  return null;
}

async function fetchYouTubeCaptionsFromWeb(
  videoId: string,
  targetLang: string,
): Promise<{ srt: string; source: string; fetchUrl: string }> {
  const lang = (targetLang || 'en').toLowerCase();
  const tracks = await fetchYouTubeCaptionTracks(videoId);
  const errors: string[] = [];

  const candidates: Array<{ url: string; source: string }> = [];
  const pushCandidate = (url: string, source: string) => {
    if (!candidates.some((c) => c.url === url)) {
      candidates.push({ url, source });
    }
  };

  for (const u of buildGenericTimedtextCandidates(videoId, lang)) {
    pushCandidate(u, `generic-${lang}`);
  }

  for (const track of tracks) {
    for (const u of buildTrackTimedtextCandidates(track, videoId, lang)) {
      const trackLang = getTrackLang(track) || 'unknown';
      pushCandidate(u, `track-${trackLang}${track.kind === 'asr' ? '-asr' : ''}`);
    }
  }

  if (lang !== 'en') {
    for (const u of buildGenericTimedtextCandidates(videoId, 'en')) {
      pushCandidate(u, 'generic-en-fallback');
    }
    for (const track of tracks) {
      for (const u of buildTrackTimedtextCandidates(track, videoId, 'en')) {
        const trackLang = getTrackLang(track) || 'unknown';
        pushCandidate(u, `track-en-fallback-${trackLang}`);
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const raw = await fetchTextWithTimeout(candidate.url, 15000);
      if (!isLikelyCaptionPayload(raw)) {
        errors.push(`${candidate.source}: non-caption payload (${raw.length} chars)`);
        continue;
      }
      const srt = captionPayloadToSrt(raw);
      if (!srt) {
        errors.push(`${candidate.source}: empty after normalize`);
        continue;
      }
      return {
        srt,
        source: candidate.source,
        fetchUrl: candidate.url,
      };
    } catch (err: any) {
      errors.push(`${candidate.source}: ${err?.message || err}`);
    }
  }

  const invidiousResult = await fetchCaptionsViaInvidious(videoId, lang);
  if (invidiousResult) {
    return invidiousResult;
  }

  throw new Error(`Web caption extractors failed. ${errors.join(' | ')}`);
}

// ---------------------------------------------------------------------------
// yt-dlp caption fetch. YouTube's timedtext URLs need a signature that the
// player JS computes (attestation/botguard), which plain HTTP cannot obtain.
// yt-dlp handles that, so it is the primary caption source; the web extractors
// above remain as a fallback.
// ---------------------------------------------------------------------------
function execFileText(cmd: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 120000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          (error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }).stdout = stdout;
          (error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }).stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function findSubtitleFileInDir(dir: string, lang: string): string | null {
  const entries = (() => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  })();
  const vtt = entries.find((f: string) => f.endsWith(`.${lang}.vtt`)) || entries.find((f: string) => f.endsWith(`.${lang}.en.vtt`));
  if (vtt) return vtt;
  const en = entries.find((f: string) => f.endsWith('.en.vtt')) || entries.find((f: string) => f.endsWith('.vtt'));
  return en || null;
}

async function fetchYoutubeCaptionsViaYtDlp(
  videoUrl: string,
  workDir: string,
  targetLang: string,
): Promise<{ srt: string; mode: string; lang: string }> {
  const lang = (targetLang || 'en').toLowerCase();
  const outputBase = path.join(workDir, 'subs');
  const attempts: Array<{ mode: string; args: string[] }> = [
    {
      mode: `yt-dlp-${lang}`,
      args: [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', lang,
        '--sub-format', 'vtt',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--js-runtimes', 'node',
        '--output', `${outputBase}.%(ext)s`,
        videoUrl,
      ],
    },
    {
      mode: 'yt-dlp-en',
      args: [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', 'en',
        '--sub-format', 'vtt',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--js-runtimes', 'node',
        '--output', `${outputBase}.%(ext)s`,
        videoUrl,
      ],
    },
  ];

  const logs: string[] = [];
  for (const attempt of attempts) {
    if (lang === 'en' && attempt.mode !== 'yt-dlp-en') continue;
    try {
      const { stdout, stderr } = await execFileText('yt-dlp', attempt.args, {
        cwd: workDir,
        timeoutMs: 120000,
      });
      const subtitleFile = findSubtitleFileInDir(workDir, lang);
      if (!subtitleFile) {
        logs.push(`[${attempt.mode}] no subtitle file (stdout=${(stdout || '').trim().slice(0, 120) || '<empty>'} stderr=${(stderr || '').trim().slice(0, 120) || '<empty>'})`);
        continue;
      }
      const raw = readFileSync(path.join(workDir, subtitleFile), 'utf-8');
      const normalized = normalizeSubtitleText(raw);
      if (!normalized) {
        logs.push(`[${attempt.mode}] subtitle file ${subtitleFile} was empty`);
        continue;
      }
      const fileLang = subtitleFile.endsWith(`.${lang}.vtt`) || subtitleFile.endsWith(`.${lang}.en.vtt`) ? lang : 'en';
      return { srt: normalized, mode: attempt.mode, lang: fileLang };
    } catch (error: any) {
      const cause = error?.cause;
      if (cause?.code === 'ENOENT') {
        throw new Error('yt-dlp not found on PATH. Rebuild the server with "pip install yt-dlp" (see render.yaml).');
      }
      logs.push(`[${attempt.mode}] error=${error?.message?.split('\n')[0] || error}`);
    }
  }

  throw new Error(`yt-dlp could not fetch subtitles. ${logs.join(' | ')}`);
}

// ---------------------------------------------------------------------------
// Direct YouTube stream resolution (yt-dlp) — powers the player's fallback so
// posted movies still play when YouTube blocks embedding (the "Playback ID"
// error). yt-dlp already exists on the server (used for captions) and returns a
// progressive MP4 URL that any <video> element can stream directly without CORS.
// Results are cached in-memory (signed URLs stay valid for hours, so a 15-minute
// cache is safe) to avoid hammering YouTube on every player mount.
// ---------------------------------------------------------------------------
type DirectStreamInfo = {
  url: string;
  height: number | null;
  ext: string | null;
  formatId: string | null;
};

const ytStreamCache = new Map<string, { at: number; streams: DirectStreamInfo[] }>();
const YT_STREAM_CACHE_TTL_MS = 15 * 60 * 1000;

async function resolveYoutubeDirectStreams(videoId: string): Promise<DirectStreamInfo[]> {
  const cached = ytStreamCache.get(videoId);
  if (cached && Date.now() - cached.at < YT_STREAM_CACHE_TTL_MS) return cached.streams;

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  // Prefer a progressive MP4 (plays natively in <video>); fall back to whatever
  // yt-dlp considers the single best stream.
  const selector = 'best[ext=mp4][height<=720]/best[ext=mp4]/best';
  const args = [
    '--no-playlist',
    '--quiet',
    '--no-warnings',
    '--js-runtimes', 'node',
    '-f', selector,
    '--print', '%(url)s',
    '--print', '%(format_id)s',
    '--print', '%(height)s',
    '--print', '%(ext)s',
    watchUrl,
  ];

  const { stdout } = await execFileText('yt-dlp', args, { timeoutMs: 60000 }).catch(
    (error: any) => {
      // Convert "binary not installed" into a message the route can detect (501).
      if (error?.code === 'ENOENT' || error?.cause?.code === 'ENOENT') {
        throw new Error('yt-dlp not found on PATH. Rebuild the server with "pip install yt-dlp" (see render.yaml).');
      }
      throw error;
    },
  );
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines[0]) throw new Error('yt-dlp returned no stream URL');

  const [streamUrl, formatId, heightRaw, ext] = lines;
  const streams: DirectStreamInfo[] = [];
  if (streamUrl && /^https?:\/\//i.test(streamUrl)) {
    const height = parseInt(heightRaw, 10) || null;
    streams.push({ url: streamUrl, height, ext: ext || null, formatId: formatId || null });
  }
  if (streams.length === 0) throw new Error('yt-dlp returned no playable stream');

  ytStreamCache.set(videoId, { at: Date.now(), streams });
  return streams;
}

// Convert YouTube caption XML to SRT format.
function youtubeCaptionXmlToSrt(xml: string): string {
  // YouTube caption XML uses <text> elements with start and duration attributes.
  const entries: string[] = [];
  const textRegex = /<text[^>]*\sstart="([^"]+)"[^>]*\sduration="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  let index = 1;
  while ((match = textRegex.exec(xml)) !== null) {
    const startSec = parseFloat(match[1]);
    const durationSec = parseFloat(match[2]);
    const endSec = startSec + durationSec;
    const text = match[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (!text) continue;
    const startFmt = formatSrtTime(startSec);
    const endFmt = formatSrtTime(endSec);
    entries.push(`${index}\n${startFmt} --> ${endFmt}\n${text}\n`);
    index++;
  }
  return entries.join('\n');
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// Sanitize URLs to decode HTML entities (e.g. &#x2F; → /) and convert YouTube watch links to embed links
function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  let cleanUrl = url
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x2f;/gi, '/')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  // Convert YouTube watch links to embed links
  const ytWatchRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const ytMatch = cleanUrl.match(ytWatchRegex);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  return cleanUrl;
}

// Global error handlers - Move to top to catch early errors
process.on('uncaughtException', (err: any) => {
  console.error('UNCAUGHT EXCEPTION:', err.message || err);
  if (err.stack) console.error(err.stack);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED REJECTION:', reason?.message || reason);
  if (reason?.stack) console.error(reason.stack);
});

const DB_PATH = path.join(process.cwd(), 'db.json');

// Firestore is the durable cross-deploy store for movie view counts. Render's
// filesystem is ephemeral — db.json (and its viewsCounts) resets on every
// deploy/restart, which wiped the lifetime counters in production. The counters
// are written through to Firestore and re-hydrated at boot so they survive
// redeploys. Same project + public web API key the client already uses
// (src/lib/firebase.ts); all overridable via env (e.g. local QA isolation).
const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'gen-lang-client-0240212572';
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY ||
  process.env.VITE_FIREBASE_API_KEY ||
  'AIzaSyDQBu-FwP9w7O6KqaWQOsqyTP6NudH9eBI';
// Doc that stores { counts: { movieId: views } } in the `config` collection
// (rules: allow read, write: if true — no deploy of firestore.rules needed).
const MOVIE_VIEWS_DOC = process.env.MOVIE_VIEWS_DOC || 'config/movieViews';

// Initial DB Structure
const INITIAL_DB = {
  admins: [
    { username: 'admin', password: 'password123', isSuper: true, isOwner: true, role: 'owner' }
  ],
  users: [] as any[],
  categories: ["هەمووی", "ئاکشن", "کۆمیدی", "دراما", "ترسناک", "ئەنیمێ", "دۆکیومێنتاری"],
  heroConfig: {
    heroVideoUrl: '',
    heroPlaylist: [] as string[]
  },
  syncGroups: {
    "global_room_official": {
      id: "global_room_official",
      name: "پەخشی ڕاستەوخۆ",
      currentMovieId: "hero-promo",
      playback: {
        isPlaying: true,
        currentTime: 0,
        updatedAt: new Date().toISOString()
      },
      videoData: {
        id: "hero-promo",
        title: "پەخشی ڕاستەوخۆ",
        isYouTube: false,
        url: ""
      }
    }
  },
  deletedIds: [] as string[],
  bannedIps: [] as string[],
  // Auto-banned browser/device fingerprints (X-Device-Id header / body deviceId).
  // These are the PRIMARY target of the auto-ban system: each blocked device is
  // isolated, so a failed-login storm on ONE mobile device can never block the
  // whole site or other devices that share the same public IP (mobile NAT).
  bannedDevices: [] as string[],
  // Ban start times per device so temporary (owner-exempt) blocks can be measured.
  bannedDeviceTimestamps: {} as Record<string, string>,
  // Extra context for each banned device (ip, user-agent, reason, requester).
  bannedDevicesInfo: {} as Record<string, any>,
  // Unblock request queue: filled by blocked users via the public
  // /api/unblock-request endpoint, managed by admins in Security Shield.
  unblockRequests: [] as any[],
  // Permanent archive of unblock-request history: resolved/deleted/cleared
  // requests are preserved here (with status + resolvedBy metadata) instead of
  // being hard-deleted, so admins keep a full audit trail.
  unblockArchive: [] as any[],
  // Super Admin (Owner) IP/device whitelist: ip -> last seen ISO timestamp.
  // Whitelisted IPs receive a 1-minute temporary block instead of a permanent
  // ban, and are auto-unblocked after exactly 1 minute (see evaluateOwnerBlock).
  ownerWhitelist: {} as Record<string, string>,
  // Ban start times per IP so temporary (owner-exempt) blocks can be measured.
  bannedIpTimestamps: {} as Record<string, string>,
  manualMovies: [] as any[],
  posterUploads: [] as any[],
  vipVideos: [] as any[],
  tagOverrides: {} as Record<string, string[]>,
  favorites: {} as Record<string, Record<string, number>>,
  // Per-movie favorite count (movieId -> number of users who favorited it).
  // Derived from `favorites` but cached so trending/enrichment stays O(1).
  favoriteCounts: {} as Record<string, number>,
  // Per-movie lifetime view count (movieId -> number of watch sessions).
  // The single source of truth for every card's "📈 Views" counter. Covers
  // movies that only exist in Firestore (not in manualMovies), seeded at boot
  // from the movies' existing `views` field and incremented once per session.
  viewsCounts: {} as Record<string, number>,
  // CinemaChat user ratings: movieId -> { uid: score(1-10) }.
  ratings: {} as Record<string, Record<string, number>>,
  // Search history per identity (uid or device id): id -> [ { query, at } ].
  searchHistory: {} as Record<string, any[]>,
  // Aggregated popular search terms: term -> total count.
  popularSearchTerms: {} as Record<string, number>,
  // Continue-watching progress per identity: id -> { movieId: { progress, duration, updatedAt } }.
  continueWatching: {} as Record<string, Record<string, any>>,
  rooms: {} as Record<string, any>,
  // Drama Rooms: curated collections (cover, title, description, unlimited dramas).
  // Stored as an object map keyed by id so the whole collection is one atomic write.
  dramaRooms: {} as Record<string, any>
};

const INITIAL_BROADCAST_ROOM = {
  id: 'main_broadcast_room',
  name: 'هۆڵی پەخشی سەرەکی (Broadcast)',
  hostCode: 'ADMIN_BROADCAST',
  currentMovieUrl: '',
  isPlaying: false,
  currentTime: 0,
  activeUsers: [],
  chatMessages: [],
  updatedAt: new Date().toISOString()
};

const INITIAL_GLOBAL_ROOM = {
  id: 'global_room_official',
  name: 'ژووری سەرەکی',
  hostCode: 'GLOBAL_HOST',
  currentMovieUrl: '',
  isPlaying: false,
  currentTime: 0,
  activeUsers: [],
  chatMessages: [],
  updatedAt: new Date().toISOString()
};

async function loadDB() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    const db = JSON.parse(data);
    
    // Safety check & Deduplication to prevent key collisions in frontend
    if (db.manualMovies && Array.isArray(db.manualMovies)) {
      const initialCount = db.manualMovies.length;
      const uniqueMovies = Array.from(
        new Map(db.manualMovies.map((m: any) => [m.id, m])).values()
      );
      
      if (uniqueMovies.length !== initialCount) {
        console.log(`[DB] Automatically deduplicated ${initialCount - uniqueMovies.length} movies during load.`);
        db.manualMovies = uniqueMovies;
        // Persist the clean version
        await saveDB(db);
      }
    }
    
    return db;
  } catch (e: any) {
    // Preserve the corrupt file as a backup before replacing it, so no history
    // is silently lost, then write a clean database to recover from the parse error.
    console.error('[DB] Failed to parse db.json, restoring a clean database:', e?.message || e);
    try {
      const corrupt = await fs.readFile(DB_PATH, 'utf-8');
      const backupPath = `${DB_PATH}.corrupt-${Date.now()}`;
      await fs.writeFile(backupPath, corrupt);
      console.warn(`[DB] Corrupt db.json backed up to: ${backupPath}`);
    } catch { /* no readable file to back up */ }
    const freshDB = {
      ...INITIAL_DB,
      unblockRequests: [] as any[],
      unblockArchive: [] as any[]
    };
    await saveDB(freshDB);
    return freshDB;
  }
}

// Serialized DB writer: queues writes so two concurrent saveDB() calls can never
// interleave/truncate db.json mid-write (which would leave malformed JSON and
// crash or hang the next loadDB parse).
let dbWriteChain: Promise<void> = Promise.resolve();
async function saveDB(db: any) {
  const snapshot = JSON.stringify(db, null, 2);
  dbWriteChain = dbWriteChain.then(() => fs.writeFile(DB_PATH, snapshot));
  await dbWriteChain;
}

// Helper for fetch with timeout
async function fetchWithTimeout(url: string, options: any = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// --- Durable movie view counts (Firestore) ---
// Render's ephemeral filesystem resets db.json on every deploy/restart, which
// wiped the lifetime view counters in production. These helpers persist
// viewsCounts to Firestore and re-hydrate them at boot so the counters survive
// redeploys (firestore.rules allows public validated writes on `config`).
const firestoreDocUrl = (docPath: string, query: string) =>
  `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    FIREBASE_PROJECT_ID
  )}/databases/(default)/documents/${docPath}?key=${encodeURIComponent(
    FIREBASE_API_KEY
  )}${query}`;

// Load the persisted per-movie view counts. Returns {} when the doc has never
// been written (e.g. first deploy) so boot can proceed with the local seed.
const loadMovieViewsFromFirestore = async (): Promise<Record<string, number>> => {
  const res = await fetchWithTimeout(
    firestoreDocUrl(MOVIE_VIEWS_DOC, ''),
    { headers: { Accept: 'application/json' } },
    8000
  );
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const fields = data?.fields?.counts?.mapValue?.fields;
  if (!fields || typeof fields !== 'object') return {};
  const counts: Record<string, number> = {};
  for (const [key, val] of Object.entries(fields)) {
    const n = Number((val as any)?.integerValue ?? (val as any)?.doubleValue);
    if (Number.isFinite(n) && n >= 0) counts[key] = n;
  }
  return counts;
};

// Persist the current view counts to Firestore (best-effort, fire-and-forget:
// a Firestore hiccup must never break the view endpoint).
const saveMovieViewsToFirestore = (counts: Record<string, number>): void => {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    fields[key] = Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  const url = firestoreDocUrl(
    MOVIE_VIEWS_DOC,
    '&updateMask.fieldPaths=counts&updateMask.fieldPaths=updatedAt'
  );
  fetchWithTimeout(
    url,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          counts: { mapValue: { fields } },
          updatedAt: { stringValue: new Date().toISOString() }
        }
      })
    },
    8000
  )
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    })
    .catch((err: any) =>
      console.warn('[views] Firestore write-through failed:', err?.message || err)
    );
};

// Persist a single movie's category tags to Firestore (movies/{id}) — the
// durable catalog store the client reads via getDocs — so an admin "پۆلێن"
// change is visible to every client immediately, not just in the server cache.
// Throws on non-OK so the caller can surface a failed Firestore write.
const saveMovieTagsToFirestore = async (movieId: string, tags: string[]): Promise<void> => {
  const url = firestoreDocUrl(
    `movies/${encodeURIComponent(movieId)}`,
    '&updateMask.fieldPaths=tags'
  );
  const res = await fetchWithTimeout(
    url,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          tags: {
            arrayValue: {
              values: tags.map((t) => ({ stringValue: String(t) }))
            }
          }
        }
      })
    },
    8000
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

// --- Durable movie catalog sync (Firestore → server cache) ---
// The homepage catalog lives in Firestore (movies/{id}) — the admin panel writes
// every movie there from the browser. The backend used to serve only the local
// db.json manual list, so /api/movies returned a near-empty payload in production
// (Render's filesystem is ephemeral) and the frontend had to block on a full
// Firestore read before a single card could render. This mirrors the Firestore
// catalog into an in-memory server cache merged over the local manual list, so
// /api/movies returns the complete catalog instantly and the homepage can paint
// cards immediately, then refine live through the client's own Firestore listener.
const firestoreMoviesCache: Record<string, any> = {};

// Convert a single Firestore REST "Value" object into a plain JS value
// (string/number/boolean/array/map/timestamp), so a Firestore movie doc can be
// re-serialized by /api/movies without the Firestore wire format.
const firestoreValueToPlain = (val: any): any => {
  if (!val || typeof val !== 'object') return null;
  if (val.nullValue !== undefined) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.doubleValue !== undefined) return Number(val.doubleValue);
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.referenceValue !== undefined) return val.referenceValue;
  if (Array.isArray(val.arrayValue?.values)) return val.arrayValue.values.map(firestoreValueToPlain);
  if (val.mapValue?.fields) {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(val.mapValue.fields)) {
      out[key] = firestoreValueToPlain(value);
    }
    return out;
  }
  return null;
};

const firestoreMoviesUrl = (query: string) =>
  `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    FIREBASE_PROJECT_ID
  )}/databases/(default)/documents/movies?key=${encodeURIComponent(
    FIREBASE_API_KEY
  )}${query}`;

// One-shot read of the Firestore movies collection (capped at 300 docs — the
// whole catalog is far below that). Returns plain movie objects keyed by doc id.
const loadFirestoreMovies = async (): Promise<any[]> => {
  const res = await fetchWithTimeout(
    firestoreMoviesUrl('&pageSize=300'),
    { headers: { Accept: 'application/json' } },
    12000
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const docs = Array.isArray(data?.documents) ? data.documents : [];
  return docs.map((doc: any) => {
    const id = String((doc?.name || '').split('/').pop() || '');
    const fields = (doc?.fields && typeof doc.fields === 'object') ? doc.fields : {};
    const plain: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      plain[key] = firestoreValueToPlain(value);
    }
    return { ...plain, id };
  });
};

// Mirror the Firestore catalog into the server cache. Purely additive: it can
// never remove a locally-managed movie, and a sync failure is non-fatal.
const syncFirestoreMovies = async (): Promise<void> => {
  try {
    const remote = await loadFirestoreMovies();
    if (remote.length === 0) return;
    for (const movie of remote) {
      if (movie && typeof movie.id === 'string' && movie.id) {
        firestoreMoviesCache[movie.id] = movie;
      }
    }
    console.log(
      `[Movies] Firestore catalog synced: ${remote.length} movie(s) in server cache.`
    );
  } catch (err: any) {
    console.warn('[Movies] Firestore catalog sync failed:', err?.message || err);
  }
};

// Stored URLs may arrive HTML-entity-encoded (e.g. "https:&#x2F;&#x2F;…?a=1&amp;b=2")
// when a URL was pasted from an HTML source or saved through a form. If left
// raw, a browser resolves such a string to a malformed request like
// "https://&/" (the "&#x2F;" "&#x2F;" becomes a "#fragment" / "&" and Chrome
// rewrites the host), so posters break and console fills with
// ERR_NAME_NOT_RESOLVED. Decode the common entities here so consumers never
// see encoded URLs.
const decodeStoredUrl = (url: any): any => {
  if (typeof url !== 'string' || !url.includes('&')) return url;
  return url
    .replace(/&#x2F;/gi, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
};

// Merge the local manual movies with the Firestore catalog into one list.
// Firestore entries win on id conflicts because Firestore is the durable,
// admin-controlled source of truth.
const mergeCatalogWithFirestore = (local: any[]): any[] => {
  const merged = new Map<string, any>();
  const store = (movie: any) => {
    if (!movie || typeof movie.id !== 'string') return;
    if (movie.image) movie = { ...movie, image: decodeStoredUrl(movie.image) };
    if (movie.posterUrl) movie = { ...movie, posterUrl: decodeStoredUrl(movie.posterUrl) };
    merged.set(movie.id, movie);
  };
  for (const movie of local) store(movie);
  for (const movie of Object.values(firestoreMoviesCache)) store(movie);
  return Array.from(merged.values());
};

async function startServer() {
  console.log('==================================================');
  console.log(`[${new Date().toISOString()}] CinemaChat Server Starting...`);
  console.log('==================================================');

  const app = express();

  const getAvailablePort = async (preferredPort: number): Promise<number> => {
    const canUsePort = (port: number) => new Promise<boolean>((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          tester.close(() => resolve(true));
        })
        .listen(port, '0.0.0.0');
    });

    if (await canUsePort(preferredPort)) {
      return preferredPort;
    }
    for (let port = preferredPort + 1; port <= preferredPort + 20; port++) {
      if (await canUsePort(port)) {
        return port;
      }
    }
    return preferredPort;
  };

  const preferredPort = Number(process.env.PORT) || 3001;
  const PORT = await getAvailablePort(preferredPort);

  // Database initialization
  let db: any = {};
  try {
    db = await loadDB();
    console.log('[DB] Database loaded successfully');
  } catch (err) {
    console.error('[DB] Critical failed to load/init database:', err);
    db = { ...INITIAL_DB }; // Fallback to memory
  }
  
  // Ensure all top-level properties exist
  if (!db.deletedIds) db.deletedIds = [];
  if (!db.manualMovies) db.manualMovies = [];
  if (!db.users) db.users = [];
  if (!db.tagOverrides) db.tagOverrides = {};
  if (!db.bannedIps) db.bannedIps = [];
  if (!db.unblockRequests) db.unblockRequests = [];
  if (!db.unblockArchive) db.unblockArchive = [];
  if (!db.ownerWhitelist) db.ownerWhitelist = {};
  if (!db.bannedIpTimestamps) db.bannedIpTimestamps = {};
  if (!db.bannedDevices) db.bannedDevices = [];
  if (!db.bannedDeviceTimestamps) db.bannedDeviceTimestamps = {};
  if (!db.bannedDevicesInfo) db.bannedDevicesInfo = {};
  if (!db.youtubeChannelUrl) db.youtubeChannelUrl = "https://www.youtube.com/";
  if (!db.youtubeUrl) db.youtubeUrl = "https://www.youtube.com/";
  if (!db.tiktokUrl) db.tiktokUrl = "https://www.tiktok.com/";
  if (!db.instagramUrl) db.instagramUrl = "https://www.instagram.com/";
  if (!db.facebookUrl) db.facebookUrl = "https://www.facebook.com/";
  if (!db.failedLoginAttempts) db.failedLoginAttempts = [];
  if (!db.bannedKeywords) db.bannedKeywords = [];
  if (db.emergencyLock === undefined) db.emergencyLock = false;
  if (!db.securityAuditLogs) db.securityAuditLogs = [];
  if (!db.systemErrorLogs) db.systemErrorLogs = [];
  if (!db.intrusionAttempts) db.intrusionAttempts = [];
  if (!db.vipTickets) db.vipTickets = [];
  if (!db.vipRequests) db.vipRequests = [];
  if (!db.invitations) db.invitations = [];
  if (!db.directMessages) db.directMessages = [];
  if (!db.appSnapshots) db.appSnapshots = [];
  if (!db.categories) db.categories = ["هەمووی", "ئاکشن", "کۆمیدی", "دراما", "ترسناک", "ئەنیمێ", "دۆکیومێنتاری"];
  if (!db.favorites) db.favorites = {};
  if (!db.favoriteCounts) db.favoriteCounts = {};
  if (!db.ratings) db.ratings = {};
  if (!db.searchHistory) db.searchHistory = {};
  if (!db.popularSearchTerms) db.popularSearchTerms = {};
  if (!db.continueWatching) db.continueWatching = {};

  // Initialize syncGroups if not present, ensuring global room exists
  if (!db.syncGroups) db.syncGroups = {};
  if (!db.syncGroups["global_room_official"]) db.syncGroups["global_room_official"] = { ...INITIAL_DB.syncGroups["global_room_official"] };
  // Initialize dramaRooms collection if not present (Drama Rooms feature)
  if (!db.dramaRooms) db.dramaRooms = {};
  if (!db.vipVideos) db.vipVideos = [];
  // if (!Array.isArray(db.rooms)) db.rooms = []; // Removed
  if (!db.vipSettings) db.vipSettings = {
    qrCodeUrl: "https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png",
    paymentDetails: "ژمارەی باڵانسی فاستپەی / زین کاش: 07501234567\nبانکی واڵێت: FIb - 12345678", // Default payment details
    instructions: "بۆ بەژداریکردن و بینینی پەخشی ڕاستەوخۆی VIP CinemaChat بە شێوەی هەمیشەیی، بڕی پارەی تیکێتەکە بنێرە و پاشان پەیوەندی بە ئەدمینەوە بکە لە تێلیگرام (@cinemasupport) بۆ وەرگرتنی کۆدەکەت."
  };

  // Support Module 17 - Super Admin (Owner) Seed
  const ownerUserSeedName = "admin";
  const ownerUserSeedPassHash = bcrypt.hashSync('password123', 10);
  if (!db.admins) db.admins = [];

  // Ensure 'admin' user exists and has correct roles/hashed password
  // Retain only 'admin' and ensure all system permissions are assigned to it
  let adminAccount = db.admins.find((a: any) => a.username?.toLowerCase() === "admin");
  if (!adminAccount) {
    adminAccount = {
      username: "admin",
      // password: ownerUserSeedPassHash, // Removed
      password: bcrypt.hashSync('password123', 10), // Added
      isSuper: true, isOwner: true, role: "owner"
    };
    db.admins.push(adminAccount);
  } else {
    // Update existing admin password if it's not bcrypt hashed
    // Check if existing password is not bcrypt, then update
    if (adminAccount.password && !adminAccount.password.startsWith('$2a$') && !adminAccount.password.startsWith('$2b$') && !adminAccount.password.startsWith('$2y$')) { // Added
      adminAccount.password = bcrypt.hashSync('password123', 10); // Added
    } else if (!adminAccount.password) { // Handle case where password might be empty
      adminAccount.password = bcrypt.hashSync('password123', 10); // Added
    }
    adminAccount.isSuper = true;
    adminAccount.isOwner = true;
    adminAccount.role = "owner";
    // Ensure password is set if it's missing (e.g., from old db.json)
    if (!adminAccount.password) adminAccount.password = bcrypt.hashSync('password123', 10);
  }

  // Multi-Level Admin Model: keep EVERY registered sub-admin / staff account.
  // (Previously this list was normalised down to 'admin' on every restart,
  // which silently wiped newly created sub-admin accounts such as "nazyar".)
  console.log(`[Module 17] Multi-level admin model active. ${db.admins.length} admin account(s) registered.`);

  fs.writeFile(DB_PATH, JSON.stringify(db, null, 2)).catch(console.error);
  if (!db.ownerNotifications) db.ownerNotifications = [];

  // State
  const syncRateLimits: Record<string, number[]> = {};
  const failedLoginCounts: Record<string, number> = {};

  // Super Admin (Owner) temporary-block exemption: a whitelisted owner IP/device
  // that gets blocked (testing wrong credentials, security rules, etc.) is
  // auto-unblocked after exactly 1 minute instead of staying permanently banned.
  // Normal (non-owner) IPs keep the standard permanent-ban rules unchanged.
  const OWNER_BLOCK_EXEMPTION_MS =
    (Number(process.env.OWNER_BLOCK_EXEMPTION_SECONDS) || 60) * 1000;

  const normalizeIpKey = (ip: string): string => String(ip || '').trim();

  // Normalize a browser/device fingerprint (X-Device-Id) header. Only the raw
  // characters that make a valid identifier survive, and length is capped so a
  // hostile client can never flood the DB with arbitrarily large values.
  const normalizeDeviceKey = (deviceId: string): string =>
    String(deviceId || '').trim().replace(/[^\w.:@-]/g, '').slice(0, 128);

  // Resolve the caller's identity from a request:
  //   deviceId — the unique browser/device fingerprint sent by the client.
  //   ip       — the client's public IP (shared on mobile NAT networks).
  //   key      — the identity used for auto-ban counting: the device fingerprint
  //              whenever it is present, otherwise the IP (non-browser clients).
  // Preferring the device fingerprint is what isolates a single misbehaving
  // device instead of blocking the whole platform / every user behind the IP.
  const getClientIdentity = (req: any): { deviceId: string; ip: string; key: string } => {
    const headerDevice = normalizeDeviceKey(req.headers && req.headers['x-device-id']);
    const bodyDevice = normalizeDeviceKey(req.body && req.body.deviceId);
    const deviceId = headerDevice || bodyDevice;
    const clientIp =
      (req.headers && req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.socket?.remoteAddress ||
      req.ip ||
      "Unknown";
    const ip = String(clientIp).trim();
    return { deviceId, ip, key: deviceId || ip };
  };

  // Whitelist the Owner's IP after a verified Owner login so any future
  // accidental block becomes a temporary 1-minute exemption, not a permanent ban.
  const whitelistOwnerIp = (ip: string) => {
    const key = normalizeIpKey(ip);
    if (!key) return;
    if (!db.ownerWhitelist) db.ownerWhitelist = {};
    db.ownerWhitelist[key] = new Date().toISOString();
    console.log(`[Owner Whitelist] Owner IP added: ${key}`);
  };

  // Same owner-exemption whitelist for the Owner's device fingerprint. Both are
  // stored in the same map (keys are distinct enough: UUIDs vs IPs).
  const whitelistOwnerDevice = (deviceId: string) => {
    const key = normalizeDeviceKey(deviceId);
    if (!key) return;
    if (!db.ownerWhitelist) db.ownerWhitelist = {};
    db.ownerWhitelist[key] = new Date().toISOString();
    console.log(`[Owner Whitelist] Owner device added: ${key}`);
  };

  const isOwnerWhitelisted = (key: string): boolean => {
    const clean = String(key || '').trim();
    return !!(db.ownerWhitelist && clean && db.ownerWhitelist[clean]);
  };

  // Exact IP match only — a substring match previously let a banned IP such as
  // "1.2.3.4" also block "1.2.3.40" or "101.2.3.4" (over-blocking whole ranges).
  const isIpBanned = (ip: string): boolean => {
    const cleanIp = normalizeIpKey(ip);
    return !!(db.bannedIps && db.bannedIps.some((item: string) => {
      return String(item).trim() === cleanIp;
    }));
  };

  const isDeviceBanned = (deviceId: string): boolean => {
    const key = normalizeDeviceKey(deviceId);
    if (!key) return false;
    return !!(db.bannedDevices && db.bannedDevices.some((item: string) => {
      return String(item).trim() === key;
    }));
  };

  const recordBanTime = (ip: string) => {
    const key = normalizeIpKey(ip);
    if (!key) return;
    if (!db.bannedIpTimestamps) db.bannedIpTimestamps = {};
    if (!db.bannedIpTimestamps[key]) {
      db.bannedIpTimestamps[key] = new Date().toISOString();
    }
  };

  const clearBanTime = (ip: string) => {
    const key = normalizeIpKey(ip);
    if (key && db.bannedIpTimestamps) {
      delete db.bannedIpTimestamps[key];
    }
  };

  // Record a device auto-ban. `info` carries extra context (ip, user-agent,
  // reason, requester name/phone) so the admin dashboard can identify the device.
  const recordBanDevice = (deviceId: string, info?: any) => {
    const key = normalizeDeviceKey(deviceId);
    if (!key) return;
    if (!db.bannedDevices) db.bannedDevices = [];
    if (!db.bannedDevices.includes(key)) db.bannedDevices.push(key);
    if (!db.bannedDeviceTimestamps) db.bannedDeviceTimestamps = {};
    if (!db.bannedDeviceTimestamps[key]) {
      db.bannedDeviceTimestamps[key] = new Date().toISOString();
    }
    if (info) {
      if (!db.bannedDevicesInfo) db.bannedDevicesInfo = {};
      db.bannedDevicesInfo[key] = { ...info, bannedAt: db.bannedDeviceTimestamps[key] };
    }
  };

  const clearBanDevice = (deviceId: string) => {
    const key = normalizeDeviceKey(deviceId);
    if (!key) return;
    if (db.bannedDevices) db.bannedDevices = db.bannedDevices.filter((item: string) => String(item).trim() !== key);
    if (db.bannedDeviceTimestamps) delete db.bannedDeviceTimestamps[key];
    if (db.bannedDevicesInfo) delete db.bannedDevicesInfo[key];
  };

  // Resolve the owner-exemption state for a blocked IP/device key.
  // Returns:
  //   { exempt: false }            -> normal permanent block (non-owner)
  //   { exempt: true, remainingMs, unblockAt } -> owner temp block still active
  // When the 1-minute window has elapsed this REMOVES the ban (auto-unblock)
  // and returns { exempt: true, remainingMs: 0 } so callers pass the request.
  const evaluateOwnerBlock = (key: string, isDevice: boolean): { exempt: boolean; remainingMs: number; unblockAt: number | null } => {
    const cleanKey = String(key || '').trim();
    if (!cleanKey || !isOwnerWhitelisted(cleanKey)) {
      return { exempt: false, remainingMs: 0, unblockAt: null };
    }
    const banIso = isDevice
      ? db.bannedDeviceTimestamps && db.bannedDeviceTimestamps[cleanKey]
      : db.bannedIpTimestamps && db.bannedIpTimestamps[cleanKey];
    const banTime = banIso ? new Date(banIso).getTime() : Date.now();
    const unblockAt = banTime + OWNER_BLOCK_EXEMPTION_MS;
    const remainingMs = Math.max(0, unblockAt - Date.now());

    if (remainingMs <= 0) {
      // Window elapsed -> auto-unblock this owner IP/device immediately.
      if (isDevice) {
        clearBanDevice(cleanKey);
      } else {
        if (db.bannedIps) {
          db.bannedIps = db.bannedIps.filter((item: string) => String(item).trim() !== cleanKey);
        }
        clearBanTime(cleanKey);
      }
      db.ownerWhitelist[cleanKey] = new Date().toISOString(); // keep whitelisted for the future
      saveDB(db).catch(console.error);
      console.log(`[Owner Whitelist] Auto-unblocked owner ${isDevice ? 'device' : 'IP'} after ${OWNER_BLOCK_EXEMPTION_MS / 1000}s: ${cleanKey}`);
      return { exempt: true, remainingMs: 0, unblockAt };
    }

    return { exempt: true, remainingMs, unblockAt };
  };

  function getIpLocation(ip: string): string {
    if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.")) {
      return "ناوەخۆ (Erbil, KR)";
    }
    const cities = ["Erbil", "Sulaymaniyah", "Duhok", "Kirkuk", "Halabja", "Zakho", "Sorani"];
    const sum = ip.split('.').reduce((acc, val) => acc + (parseInt(val) || 0), 0);
    const city = cities[sum % cities.length] || "Erbil";
    return `${city}, Kurdistan`;
  }

  async function addAuditLog(dbAny: any, admin: string, action: string, details: string) {
    if (!dbAny.securityAuditLogs) dbAny.securityAuditLogs = [];
    dbAny.securityAuditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substring(2, 9),
      admin: admin || "Admin",
      action,
      details,
      timestamp: new Date().toISOString()
    });
    if (dbAny.securityAuditLogs.length > 500) {
      // Keep only the latest 500 logs
      dbAny.securityAuditLogs = dbAny.securityAuditLogs.slice(0, 500);
    }
  }

  async function addSystemErrorLog(dbAny: any, source: string, message: string, details: string) {
    if (!dbAny.systemErrorLogs) dbAny.systemErrorLogs = [];
    dbAny.systemErrorLogs.unshift({
      id: 'err-' + Math.random().toString(36).substring(2, 9),
      source,
      message,
      details,
      timestamp: new Date().toISOString()
    });
    if (dbAny.systemErrorLogs.length > 200) {
      // Keep only the latest 200 logs
      dbAny.systemErrorLogs = dbAny.systemErrorLogs.slice(0, 200);
    }
  }

  function logUserActivity(dbAny: any, uniqueCode: string, action: string, details: string, ip: string) {
    if (!dbAny.userActivities) dbAny.userActivities = [];
    dbAny.userActivities.unshift({
      id: 'act-' + Math.random().toString(36).substring(2, 9),
      uniqueCode: (uniqueCode || '').trim().toUpperCase(),
      action,
      details,
      ip: ip || "Unknown",
      timestamp: new Date().toISOString()
    });
    // Keep only the latest 2000 logs
    if (dbAny.userActivities.length > 2000) {
      dbAny.userActivities = dbAny.userActivities.slice(0, 2000);
    }
  }

  async function addIntrusionAttempt(dbAny: any, ip: string, path: string, payload: string, type: string, deviceId?: string) {
    if (!dbAny.intrusionAttempts) dbAny.intrusionAttempts = [];
    const loc = getIpLocation(ip);
    dbAny.intrusionAttempts.unshift({
      id: 'int-' + Math.random().toString(36).substring(2, 9),
      ip,
      deviceId: deviceId || '',
      location: loc,
      path,
      payload,
      type,
      timestamp: new Date().toISOString()
    });
    if (dbAny.intrusionAttempts.length > 200) {
      // Keep only the latest 200 logs
      dbAny.intrusionAttempts = dbAny.intrusionAttempts.slice(0, 200);
    }
  }
  let trackerText = "بەخێربێن بۆ CinamaChat - نوێترین فیلم و زنجیرەکان لێرە ببینە";
  let trackerType = "normal"; 
  let lastFetchTime = new Date().toISOString();

  // Real-time live presence tracking: every /api/stats poll carries a per-tab
  // session id and registers a heartbeat. Sessions that stop pinging for longer
  // than SESSION_TTL_MS are pruned, so `visitors` reflects the ACTUAL number of
  // concurrent viewers instead of a fake ever-growing counter.
  const activeSessions = new Map<string, number>();
  const SESSION_TTL_MS = 25000;
  setInterval(() => {
    const now = Date.now();
    for (const [sid, lastSeen] of activeSessions) {
      if (now - lastSeen > SESSION_TTL_MS) activeSessions.delete(sid);
    }
  }, 10000);

  // Per-movie live viewer tracking: movieId -> sessionId -> lastSeen heartbeat.
  // Mirrors activeSessions but scoped per movie so movie cards can show "watching
  // now" counts. Sessions that stop pinging for longer than MOVIE_VIEWER_TTL_MS
  // are pruned, so liveViewers reflects ACTUAL concurrent viewers.
  const movieViewerSessions = new Map<string, Map<string, number>>();
  // TTL is a bit larger than the 20s client heartbeat so a session can never be
  // pruned between two consecutive pings (prune runs every 10s).
  const MOVIE_VIEWER_TTL_MS = 25000;
  // Sessions already counted toward a movie's lifetime `views` (deduped once).
  const countedViewSessions = new Set<string>();
  setInterval(() => {
    const now = Date.now();
    for (const [movieId, sessions] of movieViewerSessions) {
      for (const [sid, lastSeen] of sessions) {
        if (now - lastSeen > MOVIE_VIEWER_TTL_MS) sessions.delete(sid);
      }
      if (sessions.size === 0) movieViewerSessions.delete(movieId);
    }
  }, 10000);
  
  // Movie Store (In-Memory Cache) - Use a copy to prevent reference sharing with DB
  let moviesCache: any[] = db.manualMovies ? [...db.manualMovies] : [];

  let ads = {
    banner: { image: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1200', link: '#' },
    sidebar: { image: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?auto=format&fit=crop&q=80&w=800', link: '#' }
  };
  
  function setMoviesCache(updater: (prev: any[]) => any[]) {
    moviesCache = updater(moviesCache);
  }

  // ================================
  // MOVIE METRICS HELPERS
  // (user ratings, favorite counts, trending score)
  // ================================

  // Aggregate CinemaChat user rating for a movie: mean of all per-user scores.
  const getMovieRating = (movieId: string): { ccRating: number; ratingCount: number } => {
    const ratings = db.ratings?.[movieId] as Record<string, number> | undefined;
    if (!ratings) return { ccRating: 0, ratingCount: 0 };
    const scores: number[] = [];
    for (const v of Object.values(ratings)) {
      if (typeof v === 'number' && v >= 0) scores.push(v);
    }
    if (scores.length === 0) return { ccRating: 0, ratingCount: 0 };
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { ccRating: Math.round(avg * 10) / 10, ratingCount: scores.length };
  };

  // Favorite count for a movie (cached + always derivable from db.favorites).
  const getFavoriteCount = (movieId: string): number => {
    if (typeof db.favoriteCounts?.[movieId] === 'number') return db.favoriteCounts[movieId];
    let count = 0;
    for (const uid in db.favorites || {}) {
      if (db.favorites[uid]?.[movieId]) count++;
    }
    return count;
  };

  // Rebuild the cached per-movie favorite counts from db.favorites. Called at
  // boot and whenever a favorite is added/removed.
  const rebuildFavoriteCounts = () => {
    const counts: Record<string, number> = {};
    for (const uid in db.favorites || {}) {
      for (const movieId in db.favorites[uid]) {
        counts[movieId] = (counts[movieId] || 0) + 1;
      }
    }
    db.favoriteCounts = counts;
  };

  // Lifetime view count for a movie. `viewsCounts` is authoritative (it also
  // covers Firestore-only movies), with the movie's own `views` as a fallback
  // so pre-existing data is never lost.
  const getViewsCount = (movieId: string): number => {
    if (typeof db.viewsCounts?.[movieId] === 'number') {
      return db.viewsCounts[movieId];
    }
    const movie = db.manualMovies.find((m: any) => m.id === movieId);
    return movie ? Number(movie.views) || 0 : 0;
  };

  // Rebuild the cached per-movie view counts from the movies' existing `views`
  // plus any counts already tracked server-side. Called at boot so cards show
  // real totals immediately, even before the first new view arrives.
  const rebuildViewsCounts = () => {
    const counts: Record<string, number> = { ...(db.viewsCounts || {}) };
    for (const m of db.manualMovies || []) {
      const v = Number(m.views) || 0;
      if (v > 0 && v > (counts[m.id] || 0)) counts[m.id] = v;
    }
    db.viewsCounts = counts;
  };

  // Normalize an arbitrary number into 0..1 using a soft log1p scale so huge
  // outliers (a movie with 10k views) can never drown out every other signal.
  const normLog = (n: number): number => {
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(1, Math.log1p(n) / Math.log1p(1000));
  };

  // Trending score: live viewers (heaviest), likes, favorites, lifetime views,
  // IMDb rating, and a recency boost for recently published movies. Scores are
  // computed on demand so rankings always reflect the current live activity.
  const computeTrendingScore = (movie: any): number => {
    const movieId = String(movie?.id || '');
    const live = movieViewerSessions.get(movieId)?.size || 0;
    const likes = Number(movie?.likes) || 0;
    const favoriteCount = getFavoriteCount(movieId);
    const views = getViewsCount(movieId);
    const imdb = parseFloat(String(movie?.rating || ''));
    const imdbScore = Number.isFinite(imdb) && imdb > 0 ? imdb / 10 : 0;

    const liveBoost = Math.min(1, live / 20);          // 20 concurrent viewers = max live boost
    const likeScore = normLog(likes) * 0.8;
    const favScore = normLog(favoriteCount) * 0.8;
    const viewScore = normLog(views) * 0.6;

    let recencyBoost = 0;
    if (movie?.date) {
      const ageDays = (Date.now() - new Date(movie.date).getTime()) / 86400000;
      if (Number.isFinite(ageDays) && ageDays >= 0) recencyBoost = Math.max(0, 1 - ageDays / 60) * 0.4;
    }

    return Math.round(
      ((liveBoost * 1.0 + likeScore * 0.9 + favScore * 0.9 + viewScore * 0.6 + imdbScore * 0.8 + recencyBoost) / 4.6) * 1000,
    ) / 10;
  };

  // Attach every dynamic metric a card needs to one movie object.
  const enrichMovie = (movie: any): any => {
    const id = String(movie?.id || '');
    const sessions = movieViewerSessions.get(id);
    const { ccRating, ratingCount } = getMovieRating(id);
    const trendingScore = computeTrendingScore(movie);
    return {
      ...movie,
      liveViewers: sessions ? sessions.size : 0,
      likes: Number(movie?.likes) || 0,
      views: getViewsCount(id),
      favoriteCount: getFavoriteCount(id),
      ccRating,
      ratingCount,
      trendingScore,
      isTrending: trendingScore >= 1,
    };
  };

  // Detect the highest live-viewer movie so cards can render the 🔥 #1 Live
  // badge without a client round-trip.
  const getTopLiveMovieId = (): string => {
    let topId = '';
    let top = 0;
    for (const [id, sessions] of movieViewerSessions) {
      if (sessions.size > top) {
        top = sessions.size;
        topId = id;
      }
    }
    return top ? topId : '';
  };

  // Sortable list of the most popular movies by live viewers or trending score.
  const getTrendingMovies = (limit = 20, sortBy: 'trending' | 'live' = 'trending'): any[] => {
    const results = moviesCache
      .map((m) => enrichMovie(m))
      .filter((m) => m.trendingScore > 0)
      .sort((a, b) =>
        sortBy === 'live' ? b.liveViewers - a.liveViewers : b.trendingScore - a.trendingScore,
      )
      .slice(0, limit);
    return results;
  };

  // Rebuild the favorite-count cache from persisted favorites at boot.
  try { rebuildFavoriteCounts(); } catch (e) { /* favorites may be empty */ }
  // Rebuild the view-count cache from persisted movie data at boot.
  try { rebuildViewsCounts(); } catch (e) { /* views may be empty */ }
  // Re-hydrate the durable view counts from Firestore so they survive Render
  // deploys/restarts (Render's ephemeral filesystem resets db.json). Firestore
  // is authoritative where it has an entry; local seeds remain a fallback.
  try {
    const remoteViews = await loadMovieViewsFromFirestore();
    if (remoteViews && Object.keys(remoteViews).length > 0) {
      db.viewsCounts = { ...(db.viewsCounts || {}), ...remoteViews };
      console.log(
        `[DB] Restored ${Object.keys(remoteViews).length} movie view count(s) from Firestore.`
      );
    }
  } catch (err: any) {
    console.warn('[DB] Could not load view counts from Firestore:', err?.message || err);
  }

  // Mirror the Firestore movie catalog into the server cache at boot so
  // /api/movies can serve the full homepage instantly, then keep it fresh with
  // a periodic re-sync (Firestore remains the durable source of truth).
  syncFirestoreMovies();
  setInterval(() => { syncFirestoreMovies(); }, 5 * 60 * 1000);

  // Social Links updated for WhatsApp
  let socialLinks = {
    whatsapp: '9647701966649',
    group: 'https://chat.whatsapp.com/Cinmachat',
    instagram: '#',
    facebook: '#'
  };

  // --- START CORS CONFIGURATION ---
  // Move CORS middleware BEFORE body parsers so CORS headers are always set,
  // even when body parsing fails (prevents "Network error" masking real errors).
  // Determine allowed origins dynamically from environment variable
  // CLIENT_ORIGINS should be a comma-separated string, e.g., "https://example.com,https://www.example.com"
  const clientOrigins = process.env.CLIENT_ORIGINS
    ? process.env.CLIENT_ORIGINS.split(',').map(o => o.trim())
    : [
        'https://gen-lang-client-0240212572.web.app',
        'https://gen-lang-client-0240212572.firebaseapp.com',
        'https://www.cinamachat.com',
        'https://cinamachat.com',
        'https://cinemachat-server.onrender.com',
        'http://localhost:5173', // Common dev origins
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001', // Production server's own origin (same-origin SPA + assets)
        'http://127.0.0.1:3001',
      ];

  // If not in production, also allow '*' for flexibility during development
  if (process.env.NODE_ENV !== 'production') {
    clientOrigins.push('*');
  }

  // Use the 'cors' package for robust CORS handling
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      // or if the origin is explicitly allowed or if '*' is allowed.
      if (!origin) return callback(null, true);

      // Check if the origin is in our allowed list
      if (clientOrigins.includes(origin) || clientOrigins.includes('*')) {
        callback(null, true);
      }
      else {
        console.warn(`[CORS] Blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Admin-Username', 'X-Device-Id'], // Added X-Admin-Username, X-Device-Id
  }));
  // --- END CORS CONFIGURATION ---

  // Body parsers — also accept text/plain so POST requests routed through
  // Firebase's 307 redirect can avoid CORS preflight (simple content-type).
  app.use(express.json({ type: ['application/json', 'text/plain'], limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Security Middlewares
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      return next();
    }
    return rateLimiter(req as any, res as any, next as any);
  });
  app.use(sanitizationMiddleware);

  // Request logger. High-frequency GET polling probes (stats, rooms, live
  // metrics, status, config, DM refresh) are skipped so they don't bury real
  // traffic in the terminal. Mutations and anything else are always logged.
  const SILENT_POLL_PREFIXES = [
    '/api/stats',
    '/api/rooms',
    '/api/tracker',
    '/api/config',
    '/api/status',
    '/api/health',
    '/api/movies',
    '/api/search/',
    '/api/dms/',
  ];
  // Read-only POST probes (bulk live metrics) are also polling noise.
  const SILENT_POLL_EXACT_POST = new Set(['/api/movies/live']);
  app.use((req, res, next) => {
    const path = req.url.split('?')[0];
    const isPoll =
      (req.method === 'GET' && SILENT_POLL_PREFIXES.some((p) => path.startsWith(p))) ||
      (req.method === 'POST' && SILENT_POLL_EXACT_POST.has(path));
    if (!isPoll) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  });

  // Failed Request Error Logger Middleware
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400 && req.url.startsWith('/api/')) {
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
        const cleanIp = clientIp.trim();
        addSystemErrorLog(
          db, 
          `${req.method} ${req.url}`, 
          `شکست لە داواکاری بە کۆدی HTTP ${res.statusCode}`, 
          `ئایپی بەکارهێنەر: ${cleanIp}`
        );
      }
    });
    next();
  });

  // Global Intrusion/Hack Attempt Tracker Middleware
  app.use(async (req, res, next) => {
    if (req.url.startsWith('/api/')) {
      const identity = getClientIdentity(req);
      const cleanIp = identity.ip;

      // Look for common patterns
      const suspectPatterns = [
        /union\s+select/i,
        /or\s+1\s*=\s*1/i,
        /['"]\s*or\s*['"]\s*1/i,
        /<script\b[^>]*>/i,
        /javascript:/i,
        /etc\/passwd/i,
        /\.\.\/\.\./,
        /\b(drop|truncate|delete)\s+table\b/i
      ];

      let urlToTest = "";
      try {
        urlToTest = decodeURIComponent(req.originalUrl || req.url || "");
      } catch {
        urlToTest = req.originalUrl || req.url || "";
      }
      
      const bodyToTest = req.body ? JSON.stringify(req.body) : "";

      let matchedPattern = "";
      for (const pattern of suspectPatterns) {
        if (pattern.test(urlToTest)) {
          matchedPattern = `URL matched: ${pattern.toString()}`;
          break;
        }
        if (pattern.test(bodyToTest)) {
          matchedPattern = `BODY matched: ${pattern.toString()}`;
          break;
        }
      }

      if (matchedPattern) {
        console.warn(`[SECURITY WARNING] Threat detected from IP: ${cleanIp} device: ${identity.deviceId || 'unknown'}. Matched: ${matchedPattern}`);
        await addIntrusionAttempt(db, cleanIp, req.url, matchedPattern, "SQL Injection / XSS Probe", identity.deviceId);
        
        // Count total threat records for this identity (device fingerprint when
        // present, else IP). Auto-banning the DEVICE isolates the offender —
        // never the whole site / other users behind a shared mobile IP.
        const threatKey = identity.key;
        const threatCount = db.intrusionAttempts.filter((att: any) => {
          const attKey = String(att.deviceId || '').trim() || String(att.ip || '').trim();
          return attKey === threatKey;
        }).length;
        if (threatCount >= 3) {
          if (identity.deviceId) {
            recordBanDevice(identity.deviceId, {
              ip: cleanIp,
              device: (req.headers['user-agent'] as string || '').slice(0, 150),
              reason: 'Intrusion / XSS attempt'
            });
          } else {
            if (!db.bannedIps) db.bannedIps = [];
            if (!db.bannedIps.includes(cleanIp)) {
              db.bannedIps.push(cleanIp);
              recordBanTime(cleanIp);
            }
          }
          await addAuditLog(db, "SYSTEM_AUTO_SHIELD", "Auto Device/IP Block (Intrusion)", `بلۆککردنی خۆکاری ${identity.deviceId ? `ئامێری ${identity.deviceId}` : `ئایپی ${cleanIp}`} بەهۆی زیاتر لە ٣ هەوڵی هێرشبردن.`);
          await saveDB(db);
          return res.status(403).json({ error: "سیستەمی قەڵغانی ئاسایش ڕێگری لێکردیت بەهۆی گۆڕانکاری گوماناوی لکێندراو" });
        }
        
        await saveDB(db);
        return res.status(400).json({ error: "کرداری گوماناوی دۆزرایەوە (Potential Threat Blocked by Security Shield)" });
      }
    }
    next();
  });

  // IP/Device Ban Guard Middleware (Point 2: Rejects banned visitor IPs/devices
  // with 403 Forbidden). A blocked DEVICE fingerprint only blocks that device;
  // a blocked IP only blocks that exact IP. Auto-bans target devices, admin
  // bans may target IPs. Owner-whitelisted identities get a 1-minute temporary
  // block instead of a permanent ban and are auto-unblocked by
  // evaluateOwnerBlock once it expires.
  app.use((req, res, next) => {
    if (req.url === '/api/check-ban' || req.url === '/api/unblock-request') {
      return next();
    }
    if (req.url.startsWith('/api/')) {
      const identity = getClientIdentity(req);
      const deviceBanned = identity.deviceId ? isDeviceBanned(identity.deviceId) : false;
      const ipBanned = isIpBanned(identity.ip);
      const isBanned = deviceBanned || ipBanned;
      const isAdminUnban = req.url.startsWith('/api/admin/unban-ip') || req.url.startsWith('/api/admin/unban-device');
      if (isBanned && !isAdminUnban) {
        // Owner-whitelisted identity gets a 1-minute temporary block.
        if (deviceBanned && identity.deviceId) {
          const exemption = evaluateOwnerBlock(identity.deviceId, true);
          if (exemption.exempt) {
            if (exemption.remainingMs > 0) {
              console.warn(`[Owner Whitelist] Owner device temp-blocked (${Math.ceil(exemption.remainingMs / 1000)}s left): ${identity.deviceId} to ${req.url}`);
              return res.status(403).json({
                banned: true,
                ownerExempt: true,
                unblockAt: new Date(exemption.unblockAt || Date.now()).toISOString(),
                error: 'تۆ بلۆک کراویت (بۆ خاوەنی سیستەم — دەکرێتەوە بە خۆکاری دوای ١ خولەک)'
              });
            }
            return next(); // Auto-unblocked owner device — allow the request.
          }
        }
        if (ipBanned) {
          const exemption = evaluateOwnerBlock(identity.ip, false);
          if (exemption.exempt) {
            if (exemption.remainingMs > 0) {
              console.warn(`[Owner Whitelist] Owner IP temp-blocked (${Math.ceil(exemption.remainingMs / 1000)}s left): ${identity.ip} to ${req.url}`);
              return res.status(403).json({
                banned: true,
                ownerExempt: true,
                unblockAt: new Date(exemption.unblockAt || Date.now()).toISOString(),
                error: 'تۆ بلۆک کراویت (بۆ خاوەنی سیستەم — دەکرێتەوە بە خۆکاری دوای ١ خولەک)'
              });
            }
            return next(); // Auto-unblocked owner IP/device — allow the request.
          }
        }
        console.warn(`[Blocked] Blocked request from banned ${deviceBanned ? `device: ${identity.deviceId}` : `IP: ${identity.ip}`} to ${req.url}`);
        return res.status(403).json({ banned: true, error: 'تۆ بلۆک کراویت' });
      }
    }
    next();
  });

  // Site Emergency Lock Middleware (Point 5: Access Gateway / Emergency Lock)
  app.use((req, res, next) => {
    if (db.emergencyLock) {
      const isApiCall = req.url.startsWith('/api/');
      const isAdminCall = req.url.startsWith('/api/admin/') || req.url === '/api/admin/login' || req.url === '/api/check-ban' || req.url === '/api/unblock-request';
      const isStaticAsset = req.url.includes('.') && !isApiCall;

      if (isApiCall && !isAdminCall && !isStaticAsset) {
        return res.status(503).json({ emergencyLock: true, error: '⚠️ ماڵپەڕ لە ئێستادا بە شێوەیەکی کاتی داخراوە بەهۆی باری نائاسایی.' });
      }
    }
    next();
  });

  // Strict Server-Side Admin Guard Enforcement
  app.use(createAdminGuard(db));

  // Check-ban status endpoint
  app.get('/api/check-ban', (req, res) => {
    const identity = getClientIdentity(req);
    const deviceBanned = identity.deviceId ? isDeviceBanned(identity.deviceId) : false;
    const ipBanned = isIpBanned(identity.ip);
    const isBanned = deviceBanned || ipBanned;
    if (isBanned) {
      // Owner-whitelisted device: return the live exemption window so the
      // client can render a countdown; evaluateOwnerBlock auto-unblocks at 0.
      if (deviceBanned && identity.deviceId) {
        const exemption = evaluateOwnerBlock(identity.deviceId, true);
        if (exemption.exempt && exemption.remainingMs > 0) {
          return res.json({
            banned: true,
            ip: identity.ip,
            deviceId: identity.deviceId,
            emergencyLock: !!db.emergencyLock,
            ownerExempt: true,
            remainingMs: exemption.remainingMs,
            unblockAt: new Date(exemption.unblockAt || Date.now()).toISOString()
          });
        }
        if (exemption.exempt) {
          // Auto-unblocked just now — report the owner device as no longer banned.
          return res.json({ banned: false, ip: identity.ip, deviceId: identity.deviceId, emergencyLock: !!db.emergencyLock });
        }
      }
      // Owner-whitelisted IP: same temporary-block countdown.
      if (ipBanned) {
        const exemption = evaluateOwnerBlock(identity.ip, false);
        if (exemption.exempt && exemption.remainingMs > 0) {
          return res.json({
            banned: true,
            ip: identity.ip,
            deviceId: identity.deviceId,
            emergencyLock: !!db.emergencyLock,
            ownerExempt: true,
            remainingMs: exemption.remainingMs,
            unblockAt: new Date(exemption.unblockAt || Date.now()).toISOString()
          });
        }
        if (exemption.exempt) {
          return res.json({ banned: false, ip: identity.ip, deviceId: identity.deviceId, emergencyLock: !!db.emergencyLock });
        }
      }
    }
    res.json({ banned: !!isBanned, ip: identity.ip, deviceId: identity.deviceId, emergencyLock: !!db.emergencyLock });
  });

  // Public unblock-request endpoint (no auth — reachable by blocked users so
  // they can request their IP/device to be unblocked). A light per-IP rate
  // limit prevents bots from flooding the admin queue.
  const unblockRequestRate: Record<string, { attempts: number; firstAt: number }> = {};
  app.post('/api/unblock-request', async (req, res) => {
    const identity = getClientIdentity(req);
    const cleanIp = identity.ip;
    const cleanDeviceId = identity.deviceId;
    const now = Date.now();

    // Max 3 requests per identity (device fingerprint, else IP) per 10 minutes.
    const rateKey = identity.key;
    const existing = unblockRequestRate[rateKey];
    if (existing && now - existing.firstAt < 10 * 60 * 1000) {
      if (existing.attempts >= 3) {
        return res.status(429).json({ success: false, error: 'زۆر داواکاری نێردراوە لەم ئامێرەوە. تکایە دواتر هەوڵبدەوە.' });
      }
      existing.attempts += 1;
    } else {
      unblockRequestRate[rateKey] = { attempts: 1, firstAt: now };
    }

    const { name, phone } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 60) : '';
    const cleanPhone = typeof phone === 'string' ? phone.trim().replace(/\s+/g, '') : '';

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'تکایە ناوی خۆت بنووسە.' });
    }
    if (!/^\+?\d{6,15}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, error: 'تکایە ژمارەی مۆبایلی دروست بنووسە.' });
    }

    if (!db.unblockRequests) db.unblockRequests = [];
    db.unblockRequests.unshift({
      id: `unblock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      phone: cleanPhone,
      ip: cleanIp,
      deviceId: cleanDeviceId,
      device: (req.headers['user-agent'] as string || '').slice(0, 150),
      blockedAt: cleanDeviceId && db.bannedDeviceTimestamps && db.bannedDeviceTimestamps[cleanDeviceId]
        ? db.bannedDeviceTimestamps[cleanDeviceId]
        : ((db.bannedIpTimestamps && db.bannedIpTimestamps[cleanIp]) || new Date().toISOString()),
      status: 'pending',
      timestamp: new Date().toISOString()
    });
    if (db.unblockRequests.length > 200) db.unblockRequests = db.unblockRequests.slice(0, 200);

    // Persist safely: if the write fails, respond with 500 instead of leaving
    // the client's request hanging (unhandled rejection).
    try {
      await addAuditLog(db, "USER_UNBLOCK_REQUEST", "New Unblock Request", `داواکاری لابردنی بلۆک لە ${cleanName} (${cleanPhone}) ئایپی: ${cleanIp}${cleanDeviceId ? ` ئامێر: ${cleanDeviceId}` : ''}`);
      await saveDB(db);
    } catch (err) {
      console.error('[Unblock Request] Failed to persist unblock request:', err);
      return res.status(500).json({ success: false, error: 'هەڵەی ناوخۆیی ڕوویدا لە تۆمارکردنی داواکاری. تکایە دواتر هەوڵبدەوە.' });
    }
    console.log(`[Unblock Request] ${cleanName} (${cleanPhone}) from ${cleanIp} device=${cleanDeviceId || 'unknown'}`);
    res.json({ success: true });
  });

  // Banned IPs administration endpoints
  app.get('/api/admin/banned-ips', (req, res) => {
    res.json(db.bannedIps || []);
  });

  app.post('/api/admin/ban-ip', async (req, res) => {
    const { ip, adminName } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP address required' });
    if (!db.bannedIps) db.bannedIps = [];
    const cleanIp = String(ip).trim();
    if (!db.bannedIps.includes(cleanIp)) {
      db.bannedIps.push(cleanIp);
      recordBanTime(cleanIp);
      await addAuditLog(db, adminName, "Ban IP", `ئایپی بلۆککرا: ${cleanIp}`);
      await saveDB(db);
      console.log(`[Ban IP] Admin banned IP: ${cleanIp}`);
    }
    res.json({ success: true, bannedIps: db.bannedIps });
  });

  app.post('/api/admin/unban-ip', async (req, res) => {
    const { ip, adminName } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP address required' });
    if (!db.bannedIps) db.bannedIps = [];
    const cleanIp = String(ip).trim();
    db.bannedIps = db.bannedIps.filter((item: string) => String(item).trim() !== cleanIp);
    clearBanTime(cleanIp);
    await addAuditLog(db, adminName, "Unban IP", `بلۆکی ئایپی لادرا: ${cleanIp}`);
    await saveDB(db);
    console.log(`[Unban IP] Admin unbanned IP: ${cleanIp}`);
    res.json({ success: true, bannedIps: db.bannedIps });
  });

  // Banned-devices administration endpoints. Auto-bans target the device
  // fingerprint (X-Device-Id), so admins unban devices here — while the
  // manual approval flow (resolve-unblock-request) unblocks both at once.
  app.get('/api/admin/banned-devices', (req, res) => {
    const list = (db.bannedDevices || []).map((deviceId: string) => ({
      deviceId,
      bannedAt: (db.bannedDeviceTimestamps && db.bannedDeviceTimestamps[deviceId]) || null,
      info: (db.bannedDevicesInfo && db.bannedDevicesInfo[deviceId]) || null,
    }));
    res.json(list);
  });

  app.post('/api/admin/unban-device', async (req, res) => {
    const { deviceId, adminName } = req.body || {};
    const key = normalizeDeviceKey(deviceId);
    if (!key) return res.status(400).json({ error: 'Device ID required' });
    clearBanDevice(key);
    await addAuditLog(db, adminName, "Unban Device", `بلۆکی ئامێر لادرا: ${key}`);
    await saveDB(db);
    console.log(`[Unban Device] Admin unbanned device: ${key}`);
    res.json({ success: true, bannedDevices: db.bannedDevices });
  });

  // Unblock-request management endpoints (view, single delete, clear all)
  app.get('/api/admin/unblock-requests', (req, res) => {
    res.json(db.unblockRequests || []);
  });

  app.delete('/api/admin/unblock-request/:id', async (req, res) => {
    const { id } = req.params;
    const { adminName } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Request ID required' });
    if (!db.unblockRequests) db.unblockRequests = [];
    const target = db.unblockRequests.find((r: any) => r.id === id);
    if (target) {
      db.unblockRequests = db.unblockRequests.filter((r: any) => r.id !== id);
      db.unblockArchive = db.unblockArchive || [];
      db.unblockArchive.unshift({ ...target, status: 'deleted', resolvedBy: adminName || 'Admin', resolvedAt: new Date().toISOString() });
      await addAuditLog(db, adminName, "Delete Unblock Request", `داواکاری لابردنی بلۆک سڕایەوە: ${target.name} (${target.phone})`);
      await saveDB(db);
    }
    res.json({ success: true, unblockRequests: db.unblockRequests });
  });

  app.post('/api/admin/clear-unblock-requests', async (req, res) => {
    const { adminName } = req.body || {};
    const count = (db.unblockRequests || []).length;
    db.unblockArchive = db.unblockArchive || [];
    db.unblockRequests.forEach((r: any) => {
      db.unblockArchive.unshift({ ...r, status: 'archived', resolvedBy: adminName || 'Admin', resolvedAt: new Date().toISOString() });
    });
    db.unblockRequests = [];
    await addAuditLog(db, adminName, "Clear Unblock Requests", `هەموو داواکارییەکانی لابردنی بلۆک سڕانەوە (${count})`);
    await saveDB(db);
    res.json({ success: true });
  });

  // Resolve an unblock request: instantly unban the requester's IP/device AND
  // archive the request (status -> resolved) in a single admin action.
  app.post('/api/admin/resolve-unblock-request', async (req, res) => {
    const { id, adminName } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Request ID required' });
    if (!db.unblockRequests) db.unblockRequests = [];
    const target = db.unblockRequests.find((r: any) => r.id === id);
    if (!target) return res.status(404).json({ error: 'Unblock request not found' });

    // Unban the requester's device fingerprint (the primary auto-ban target) and
    // IP (for manually IP-banned requests). Only the exact device/IP is lifted —
    // other devices and users are never affected.
    const requesterDevice = String(target.deviceId || '').trim();
    if (requesterDevice) clearBanDevice(requesterDevice);
    const requesterIp = String(target.ip || '').trim();
    if (requesterIp && db.bannedIps && db.bannedIps.includes(requesterIp)) {
      db.bannedIps = db.bannedIps.filter((item: string) => String(item).trim() !== requesterIp);
      clearBanTime(requesterIp);
    }
    // Move the request to the permanent archive with a resolved status
    db.unblockRequests = db.unblockRequests.filter((r: any) => r.id !== id);
    db.unblockArchive = db.unblockArchive || [];
    db.unblockArchive.unshift({
      ...target,
      status: 'resolved',
      resolvedBy: adminName || 'Admin',
      resolvedAt: new Date().toISOString()
    });

    await addAuditLog(db, adminName, "Resolve Unblock Request",
      requesterDevice
        ? `داواکاری لابردنی بلۆکی پەسەندکرا و بلۆکی ئامێر/ئایپی (${requesterDevice}${requesterIp ? ` / ${requesterIp}` : ''}) لابرا بۆ ${target.name} (${target.phone})`
        : requesterIp
          ? `داواکاری لابردنی بلۆکی پەسەندکرا و بلۆکی ${requesterIp} لابرا بۆ ${target.name} (${target.phone})`
          : `داواکاری لابردنی بلۆک لابرا: ${target.name} (${target.phone})`);
    await saveDB(db);
    console.log(`[Unblock Request] Resolved by ${adminName}: ${target.name} (${target.phone}) ip=${requesterIp} device=${requesterDevice || 'unknown'}`);
    res.json({ success: true, bannedIps: db.bannedIps, bannedDevices: db.bannedDevices, unblockRequests: db.unblockRequests });
  });

  // Archive history: resolved/deleted/cleared unblock requests (permanent audit trail)
  app.get('/api/admin/unblock-requests/archive', (req, res) => {
    res.json(db.unblockArchive || []);
  });

  // Export helpers for Section 11 (Security Shield) reports
  const buildExportWorkbook = (rows: Record<string, any>[], sheetName: string, columnWidths: number[]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = columnWidths.map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return wb;
  };

  const sendXlsx = (res: any, wb: any, filename: string) => {
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  };

  app.get('/api/admin/export/blocked-users/xlsx', (req, res) => {
    const rows = (db.bannedIps || []).map((ip: string, idx: number) => ({
      '#': idx + 1,
      'IP ئایپی بلۆککراو': ip,
      'کاتی بلۆک (Blocked At)': (db.bannedIpTimestamps && db.bannedIpTimestamps[ip])
        ? new Date(db.bannedIpTimestamps[ip]).toLocaleString('ku-IQ') : 'نەزانراو (Unknown)',
      'جۆری بلۆک': (db.ownerWhitelist && db.ownerWhitelist[ip]) ? 'کاتی بۆ ئەدمین (Owner temp)' : 'بلۆکی تەواو (Permanent)'
    }));
    sendXlsx(res, buildExportWorkbook(rows, 'Blocked Users', [6, 20, 30, 28]), 'blocked-users.xlsx');
  });

  app.get('/api/admin/export/unblock-requests/xlsx', (req, res) => {
    const rows = (db.unblockRequests || []).map((r: any, idx: number) => ({
      '#': idx + 1,
      'ناو (Name)': r.name || '',
      'ژمارەی مۆبایل (Phone)': r.phone || '',
      'IP ئایپی': r.ip || '',
      'کاتی بلۆک (Blocked At)': r.blockedAt ? new Date(r.blockedAt).toLocaleString('ku-IQ') : 'نەزانراو',
      'کاتی داواکاری (Requested At)': r.timestamp ? new Date(r.timestamp).toLocaleString('ku-IQ') : 'نەزانراو',
      'ئامێر/بەشێوە (Device)': r.device || ''
    }));
    sendXlsx(res, buildExportWorkbook(rows, 'Unblock Requests', [6, 18, 18, 18, 28, 28, 45]), 'unblock-requests.xlsx');
  });

  // Firewall Logs Tracking (Point 2: Firewall Logs & Point 3: Auto-Ban count)
  app.get('/api/admin/firewall-logs', (req, res) => {
    res.json(db.failedLoginAttempts || []);
  });

  // Banned Keywords List (Point 4: Content Filter)
  app.get('/api/admin/banned-keywords', (req, res) => {
    res.json(db.bannedKeywords || []);
  });

  // Public Banned Keywords for Chat filters
  app.get('/api/banned-keywords', (req, res) => {
    res.json(db.bannedKeywords || []);
  });

  app.post('/api/admin/add-banned-keyword', async (req, res) => {
    const { keyword, adminName } = req.body;
    if (!keyword || !keyword.trim()) return res.status(400).json({ error: 'Keyword required' });
    const cleanKw = String(keyword).trim();
    if (!db.bannedKeywords) db.bannedKeywords = [];
    if (!db.bannedKeywords.includes(cleanKw)) {
      db.bannedKeywords.push(cleanKw);
      await addAuditLog(db, adminName, "Add Keyword", `وشەی قەدەغەکراو زیادکرا: "${cleanKw}"`);
      await saveDB(db);
    }
    res.json({ success: true, bannedKeywords: db.bannedKeywords });
  });

  app.post('/api/admin/delete-banned-keyword', async (req, res) => {
    const { keyword, adminName } = req.body;
    if (!keyword) return res.status(400).json({ error: 'Keyword required' });
    const cleanKw = String(keyword).trim();
    if (!db.bannedKeywords) db.bannedKeywords = [];
    db.bannedKeywords = db.bannedKeywords.filter((k: string) => String(k).trim() !== cleanKw);
    await addAuditLog(db, adminName, "Delete Keyword", `وشەی قەدەغەکراو لادرا: "${cleanKw}"`);
    await saveDB(db);
    res.json({ success: true, bannedKeywords: db.bannedKeywords });
  });

  // Emergency Lock Toggle (Point 5: Access Gateway)
  app.get('/api/admin/emergency-lock', (req, res) => {
    res.json({ emergencyLock: !!db.emergencyLock });
  });

  app.post('/api/admin/toggle-emergency-lock', async (req, res) => {
    const { enabled, adminName } = req.body;
    db.emergencyLock = !!enabled;
    await addAuditLog(db, adminName, "Emergency Lock", `قوفڵی باری نائاسایی ماڵپەڕ ${db.emergencyLock ? "چالاککرا 🛑" : "ناچالاککرا 🔓"}`);
    await saveDB(db);
    res.json({ success: true, emergencyLock: db.emergencyLock });
  });

  // Security Audit Logs (Point 6: History Log)
  app.get('/api/admin/audit-logs', (req, res) => {
    res.json(db.securityAuditLogs || []);
  });

  // --- MODULE 12: DATABASE & SYSTEM AUDIT ENDPOINTS ---

  // Export full DB backup
  app.get('/api/admin/db-backup', (req, res) => {
    res.setHeader('Content-disposition', 'attachment; filename=cinemachat-db-backup.json');
    res.setHeader('Content-type', 'application/json');
    res.write(JSON.stringify(db, null, 2));
    res.end();
  });

  // Restore DB backup
  app.post('/api/admin/db-restore', async (req, res) => {
    try {
      const { backupData, adminName } = req.body;
      if (!backupData) {
        return res.status(400).json({ error: 'داتای باکئەپ بنێرە' });
      }

      // Basic validation
      if (!backupData.admins || !Array.isArray(backupData.admins)) {
        return res.status(400).json({ error: 'داتاکە گونجاو نییە، پێویستە لیستی لایەنگری ئەدمین و فۆرماتە دروستەکانی تێدابێت' });
      }

      // Overwrite
      db.admins = backupData.admins;
      if (backupData.manualMovies) db.manualMovies = backupData.manualMovies;
      if (backupData.categories) db.categories = backupData.categories;
      if (backupData.bannedIps) db.bannedIps = backupData.bannedIps;
      if (backupData.bannedDevices) db.bannedDevices = backupData.bannedDevices;
      if (backupData.bannedDeviceTimestamps) db.bannedDeviceTimestamps = backupData.bannedDeviceTimestamps;
      if (backupData.bannedDevicesInfo) db.bannedDevicesInfo = backupData.bannedDevicesInfo;
      if (backupData.bannedKeywords) db.bannedKeywords = backupData.bannedKeywords;
      if (backupData.heroConfig) db.heroConfig = backupData.heroConfig;
      if (backupData.securityAuditLogs) db.securityAuditLogs = backupData.securityAuditLogs;
      if (backupData.syncGroups) db.syncGroups = backupData.syncGroups; // Restore syncGroups
      delete db.rooms; // Ensure old db.rooms is removed after restore
      if (backupData.systemErrorLogs) db.systemErrorLogs = backupData.systemErrorLogs;
      if (backupData.intrusionAttempts) db.intrusionAttempts = backupData.intrusionAttempts;
      
      await addAuditLog(db, adminName || "Admin", "Restore Database", "بنکەدراوەی گشتی بە سەرکەوتوویی لە دروستکراوەیەکی کۆن گەڕێندرایەوە");
      await saveDB(db);
      
      if (db.manualMovies) {
        setMoviesCache(() => [...db.manualMovies]);
      }

      res.json({ success: true, message: 'داتابەیس بە سەرکەوتوویی گەڕێندرایەوە' });
    } catch (err: any) {
      res.status(500).json({ error: `شکست لە گەڕاندنەوەی داتابەیس: ${err.message}` });
    }
  });

  // System Error Logs Endpoints
  app.get('/api/admin/error-logs', (req, res) => {
    try {
      if (!db) {
        return res.json([]);
      }
      if (!db.systemErrorLogs || !Array.isArray(db.systemErrorLogs)) {
        db.systemErrorLogs = [];
      }
      res.json(db.systemErrorLogs);
    } catch (err: any) {
      console.error("ERROR fetching error-logs:", err);
      res.status(500).json({ status: "error", error: err.message || "Failed to load system error logs" });
    }
  });

  app.post('/api/admin/clear-error-logs', async (req, res) => {
    const { adminName } = req.body;
    db.systemErrorLogs = [];
    await addAuditLog(db, adminName || "Admin", "Clear Error Logs", "هەموو تۆماری هەڵەکانی سیستەم سڕدرانەوە");
    await saveDB(db);
    res.json({ success: true, errorLogs: [] });
  });

  // Intrusion Attempts Endpoints
  app.get('/api/admin/intrusion-attempts', (req, res) => {
    try {
      if (!db) {
        return res.json([]);
      }
      if (!db.intrusionAttempts || !Array.isArray(db.intrusionAttempts)) {
        db.intrusionAttempts = [];
      }
      res.json(db.intrusionAttempts);
    } catch (err: any) {
      console.error("ERROR fetching intrusion-attempts:", err);
      res.status(500).json({ status: "error", error: err.message || "Failed to load intrusion attempts" });
    }
  });

  app.post('/api/admin/clear-intrusion-attempts', async (req, res) => {
    const { adminName } = req.body;
    db.intrusionAttempts = [];
    await addAuditLog(db, adminName || "Admin", "Clear Intrusion Attempts", "هەموو تۆماری هێرشە گوماناوییەکان سڕدرانەوە");
    await saveDB(db);
    res.json({ success: true, intrusionAttempts: [] });
  });

  // --- APP.TSX SNAPSHOT & ROLLBACK ENDPOINTS ---

  // Get all App snapshots
  app.get('/api/admin/snapshots', (req, res) => {
    res.json(db.appSnapshots || []);
  });

  // Create an App snapshot
  app.post('/api/admin/snapshots/create', async (req, res) => {
    try {
      const { name, description, adminName } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'ناوی کۆپی یەدەگ پێویستە' });
      }

      const filePath = path.join(process.cwd(), 'src', 'App.tsx');
      const content = await fs.readFile(filePath, 'utf-8');
      
      const newSnapshot = {
        id: 'snap_' + Date.now(),
        name: String(name).trim(),
        description: String(description || "").trim(),
        content,
        size: (content.length / 1024).toFixed(2) + " KB",
        adminName: adminName || "Admin",
        createdAt: new Date().toISOString()
      };

      if (!db.appSnapshots) db.appSnapshots = [];
      db.appSnapshots.unshift(newSnapshot);

      await addAuditLog(db, adminName || "Admin", "Create Code Snapshot", `کۆپی یەدەگی نوێ دروستکرا بۆ App.tsx بە ناوی: ${name}`);
      await saveDB(db);

      res.json({ success: true, snapshots: db.appSnapshots });
    } catch (err: any) {
      res.status(500).json({ error: `شکست لە دروستکردنی کۆپی یەدەگی App.tsx: ${err.message}` });
    }
  });

  // Restore an App snapshot
  app.post('/api/admin/snapshots/restore', async (req, res) => {
    if (process.env.NODE_ENV === 'production') { // Added
      return res.status(403).json({ error: 'بۆ پاراستنی ئەمنییەتی سێرڤەر، گەڕاندنەوەی کۆپی یەدەگی کۆد لە ژینگەی بەرهەمهێنان (Production) بلۆک کراوە.' }); // Added
    } // Added
    try {
      const { snapshotId, adminName } = req.body;
      if (!snapshotId) {
        return res.status(400).json({ error: 'کۆدی ناسنامەی کۆپی یەدەگ پێویستە' });
      }

      const snapshots = db.appSnapshots || [];
      const snapshot = snapshots.find((s: any) => s.id === snapshotId);
      if (!snapshot) {
        return res.status(404).json({ error: 'ئەم کۆپییە یەدەگە بوونی نییە لە سیستەمدا!' });
      }

      const filePath = path.join(process.cwd(), 'src', 'App.tsx');
      
      // Auto pre-restore system safety backup of current state
      try {
        const currentContent = await fs.readFile(filePath, 'utf-8');
        const autoBackup = {
          id: 'snap_auto_' + Date.now(),
          name: `سیستەمی خۆکار (پێش گەڕاندنەوەی ${snapshot.name})`,
          description: "سیستەمی خۆکار بە شێوەیەکی خۆکارانە پێش گەڕاندنەوە جێگریکرد.",
          content: currentContent,
          size: (currentContent.length / 1024).toFixed(2) + " KB",
          adminName: "SYSTEM_AUTO",
          createdAt: new Date().toISOString()
        };
        db.appSnapshots.unshift(autoBackup);
      } catch (backupErr) {
        console.error("Auto safety backup fail:", backupErr);
      }

      // Write snapshot content to file
      await fs.writeFile(filePath, snapshot.content, 'utf-8');

      await addAuditLog(db, adminName || "Admin", "Restore Code Snapshot", `کۆپی پێشووی گەڕێندرایەوە بۆ App.tsx لە ڕێگەی لۆگی: ${snapshot.name}`);
      await saveDB(db);

      res.json({ success: true, message: 'کۆپی یەدەگ بە سەرکەوتوویی گەڕێندرایەوە، سیستەمەکە دەستپێدەکاتەوە' });
    } catch (err: any) {
      res.status(500).json({ error: `شکست لە گەڕاندنەوەی کۆپی یەدەگی App.tsx: ${err.message}` });
    }
  });

  // Delete an App snapshot
  app.post('/api/admin/snapshots/delete', async (req, res) => {
    if (process.env.NODE_ENV === 'production') { // Added
      return res.status(403).json({ error: 'بۆ پاراستنی ئەمنییەتی سێرڤەر، گەڕاندنەوەی کۆپی یەدەگی کۆد لە ژینگەی بەرهەمهێنان (Production) بلۆک کراوە.' }); // Added
    } // Added
    try {
      const { snapshotId, adminName } = req.body;
      if (!snapshotId) {
        return res.status(400).json({ error: 'کۆدی ناسنامەی کۆپی پێویستە' });
      }

      if (!db.appSnapshots) db.appSnapshots = [];
      const index = db.appSnapshots.findIndex((s: any) => s.id === snapshotId);
      if (index === -1) {
        return res.status(404).json({ error: 'کۆپی نادۆزرایەوە یان پێشتر سڕاوەتەوە' });
      }

      const deletedSnap = db.appSnapshots[index];
      db.appSnapshots.splice(index, 1);

      await addAuditLog(db, adminName || "Admin", "Delete Code Snapshot", `کۆپی یەدەگ سڕایەوە: ${deletedSnap.name}`);
      await saveDB(db);

      res.json({ success: true, snapshots: db.appSnapshots });
    } catch (err: any) {
      res.status(500).json({ error: `شکست لە سڕینەوەی کۆپی یەدەگ: ${err.message}` });
    }
  });

  // --- MODULE 14: TICKET VIP SYSTEM ENDPOINTS ---

  // Get all VIP Tickets
  app.get('/api/admin/vip/tickets', (req, res) => {
    res.json(db.vipTickets || []);
  });

  // Generate a VIP Ticket
  app.post('/api/admin/vip/tickets/generate', async (req, res) => {
    const { customerName, customerPhone, videoUrl, adminName } = req.body;
    if (!customerName || !customerPhone) {
      return res.status(400).json({ error: 'ناوی کڕیار و ژمارەی مۆبایل پێویستە بۆ دروستکردنی تیکێت' });
    }

    // Generate unique code in format: 10 digit order number + random hex string of size 7
    const orderNum = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const randomHex = Math.random().toString(16).substring(2, 9);
    const code = `${orderNum}${randomHex}`;

    const newTicket = {
      code,
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone).trim(),
      videoUrl: String(videoUrl || "").trim(),
      usedCount: 0,
      verifiedDevices: [],
      lastIp: "",
      lastDevice: "",
      status: "Active", // Active | Expired
      createdAt: new Date().toISOString()
    };

    if (!db.vipTickets) db.vipTickets = [];
    db.vipTickets.unshift(newTicket);

    await addAuditLog(db, adminName || "Admin", "Generate VIP Code", `کۆدی نوێی VIP دروستکرا بۆ: ${customerName} (${code})`);
    await saveDB(db);

    res.json({ success: true, ticket: newTicket });
  });

  // Get VIP payment configuration settings
  app.get('/api/admin/vip/settings', (req, res) => {
    res.json(db.vipSettings || {
      qrCodeUrl: "https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png",
      paymentDetails: "ژمارەی باڵانسی فاستپەی / زین کاش: 07501234567\nبانکی واڵێت: FIb - 12345678",
      instructions: "بۆ بەژداریکردن و بینینی پەخشی ڕاستەوخۆی VIP CinemaChat بە شێوەی هەمیشەیی، بڕی پارەی تیکێتەکە بنێرە و پاشان پەیوەندی بە ئەدمینەوە بکە لە تێلیگرام (@cinemasupport) بۆ وەرگرتنی کۆدەکەت.",
      paymentLogoUrl: ""
    });
  });

  // Save VIP payment configuration settings
  app.post('/api/admin/vip/settings', async (req, res) => {
    const { qrCodeUrl, paymentDetails, instructions, paymentLogoUrl, adminName } = req.body;
    db.vipSettings = {
      qrCodeUrl: qrCodeUrl || "https://i.ibb.co/3kWy3m9/fastpay-qr-mock.png",
      paymentDetails: paymentDetails || "",
      instructions: instructions || "",
      paymentLogoUrl: paymentLogoUrl || ""
    };

    await addAuditLog(db, adminName || "Admin", "Update VIP Settings", "ڕێکخستنەکانی پارەدان و تیکێتی VIP نوێکرایەوە");
    await saveDB(db);

    res.json({ success: true, settings: db.vipSettings });
  });

  // Upload handler for VIP assets (QR code, payment Logo, etc.)
  app.post('/api/admin/vip/upload', async (req, res) => {
    try {
      const { fileData, fileName, adminName } = req.body;
      if (!fileData) {
        return res.status(400).json({ success: false, error: "داتای فایل نەنێردراوە!" });
      }

      // Safe regex match to extract MIME and base64 representation
      const matches = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ success: false, error: "فۆرماتی وێنەکە دروست نییە (تەنها Base64 Data URL پێشوازیکراوە)" });
      }

      const mimeType = matches[1];
      const base64Content = matches[2];

      // Format validation: jpeg/jpg/png/webp
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp", "image/svg+xml"];
      if (!allowedMimeTypes.includes(mimeType)) {
        return res.status(400).json({ success: false, error: "ڕێگە تەنها بە وێنەی فۆرماتی PNG, JPEG, WEBP و SVG دراوە" });
      }

      // File size constraint: Max 2MB (2 * 1024 * 1024 bytes)
      const approxSizeBytes = Math.floor((base64Content.length * 3) / 4);
      if (approxSizeBytes > 2 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "قەبارەی وێنە ناتوانێت لە ٢ مێگابایت زیاتر بێت!" });
      }

      // Extract extension
      let extension = "png";
      if (mimeType.includes("jpeg") || mimeType.includes("jpg")) extension = "jpg";
      else if (mimeType.includes("webp")) extension = "webp";
      else if (mimeType.includes("svg")) extension = "svg";

      const safeBaseName = fileName 
        ? fileName.replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 50) 
        : "vip_asset";
      
      const uniqueFileName = `${safeBaseName}_${Date.now()}_${Math.floor(Math.random() * 100000)}.${extension}`;
      const relativeUploadPath = `/uploads/${uniqueFileName}`;
      const absoluteUploadPath = path.join(process.cwd(), 'uploads', uniqueFileName);

      // Ensure uploads folder exists and write file
      await fs.mkdir(path.join(process.cwd(), 'uploads'), { recursive: true });
      const buffer = Buffer.from(base64Content, 'base64');
      await fs.writeFile(absoluteUploadPath, buffer);

      return res.json({ 
        success: true, 
        url: relativeUploadPath,
        mimeType
      });

    } catch (err: any) {
      console.error("Error in VIP Upload Route:", err);
      return res.status(500).json({ 
        success: false, 
        error: "کێشەیەک ڕوویدا لە بارکردنی فایلەکەدا: " + (err.message || String(err)) 
      });
    }
  });

  // Module 4: Movie & YouTube Publishing — secure poster image upload endpoint.
  // Accepts the Base64 data-URL produced by the client-side canvas compressor,
  // validates MIME + size, writes a durable copy under /uploads and records the
  // upload in db.posterUploads. The returned `url` is the self-contained data-URL
  // so the poster is stored directly in db.json with the movie record and can
  // never 404 or disappear after a redeploy.
  app.post('/api/admin/upload-image', async (req, res) => {
    try {
      const { imageData, fileName, adminName } = req.body;
      if (!imageData || typeof imageData !== 'string') {
        return res.status(400).json({ success: false, error: "داتای وێنە نەنێردراوە (imageData پێویستە)" });
      }

      // Safe regex match to extract MIME and base64 representation
      const matches = imageData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ success: false, error: "فۆرماتی وێنەکە دروست نییە (تەنها Base64 Data URL پێشوازیکراوە)" });
      }

      const mimeType = matches[1];
      const base64Content = matches[2];

      // Raster poster formats only (no SVG — keeps the published poster safe)
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
      if (!allowedMimeTypes.includes(mimeType)) {
        return res.status(400).json({ success: false, error: "ڕێگە تەنها بە وێنەی فۆرماتی PNG, JPEG یان WEBP دراوە" });
      }

      // File size constraint: Max 2MB
      const approxSizeBytes = Math.floor((base64Content.length * 3) / 4);
      if (approxSizeBytes > 2 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "قەبارەی وێنە ناتوانێت لە ٢ مێگابایت زیاتر بێت!" });
      }

      let extension = "png";
      if (mimeType.includes("jpeg") || mimeType.includes("jpg")) extension = "jpg";
      else if (mimeType.includes("webp")) extension = "webp";

      const safeBaseName = fileName
        ? fileName.replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 50)
        : "movie_poster";

      // Durable disk copy under /uploads (also served as /uploads/<name> on the API server)
      const uniqueFileName = `${safeBaseName}_${Date.now()}_${Math.floor(Math.random() * 100000)}.${extension}`;
      await fs.mkdir(path.join(process.cwd(), 'uploads'), { recursive: true });
      await fs.writeFile(path.join(process.cwd(), 'uploads', uniqueFileName), Buffer.from(base64Content, 'base64'));

      // Database integration: keep an auditable, persistent list of poster uploads
      if (!db.posterUploads) db.posterUploads = [];
      db.posterUploads.unshift({
        id: `poster-${Date.now()}`,
        fileName: `${safeBaseName}.${extension}`,
        url: `/uploads/${uniqueFileName}`,
        uploadedBy: String(adminName || 'Admin'),
        mimeType,
        sizeBytes: approxSizeBytes,
        timestamp: new Date().toISOString()
      });
      if (db.posterUploads.length > 200) db.posterUploads = db.posterUploads.slice(0, 200);

      await addAuditLog(db, String(adminName || 'Admin'), "Upload Poster", `پۆستەری فیلم بارکرا: "${safeBaseName}.${extension}"`);
      await saveDB(db);

      return res.json({
        success: true,
        url: imageData, // self-contained poster URL (persists inside db.json with the movie)
        fileUrl: `/uploads/${uniqueFileName}`,
        mimeType,
        sizeBytes: approxSizeBytes
      });

    } catch (err: any) {
      console.error("Error in Movie Poster Upload Route:", err);
      return res.status(500).json({
        success: false,
        error: "کێشەیەک ڕوویدا لە بارکردنی پۆستەرەکەدا: " + (err.message || String(err))
      });
    }
  });

  // Get all Pending VIP Requests
  app.get('/api/admin/vip/requests', (req, res) => {
    try {
      res.json(db.vipRequests || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Submit VIP Access Request (User side)
  app.post('/api/vip/request', async (req, res) => {
    try {
      const { customerName, customerPhone, bankScreenshot } = req.body;
      if (!customerName || !customerPhone || !bankScreenshot) {
        return res.status(400).json({ success: false, error: 'تکایە سەرجەم خانەکان پڕبکەرەوە و وێنەی پێبڵاوکردن باربکە!' });
      }

      const newRequest = {
        id: 'req_' + Date.now() + Math.random().toString(36).substring(2, 7),
        customerName: String(customerName).trim(),
        customerPhone: String(customerPhone).trim(),
        bankScreenshot: String(bankScreenshot), // Contains Base64 dataURL
        status: "Pending", // Pending | Approved | Rejected
        createdAt: new Date().toISOString()
      };

      if (!db.vipRequests) db.vipRequests = [];
      db.vipRequests.unshift(newRequest);
      await saveDB(db);

      res.json({ success: true, request: newRequest });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Approve VIP Request
  app.post('/api/admin/vip/requests/approve', async (req, res) => {
    try {
      const { requestId, videoUrl, adminName } = req.body;
      if (!requestId) {
        return res.status(400).json({ success: false, error: 'ناسنامەی داواکاری نادیارە.' });
      }

      if (!db.vipRequests) db.vipRequests = [];
      const reqIndex = db.vipRequests.findIndex((r: any) => r.id === requestId);
      if (reqIndex === -1) {
        return res.status(404).json({ success: false, error: 'ئەم داواکارییە نەدۆزرایەوە.' });
      }

      const reqData = db.vipRequests[reqIndex];
      
      // Generate unique VIP ticket code
      const orderNum = String(Math.floor(1000000000 + Math.random() * 9000000000));
      const randomHex = Math.random().toString(16).substring(2, 9);
      const code = `${orderNum}${randomHex}`;

      const newTicket = {
        code,
        customerName: reqData.customerName,
        customerPhone: reqData.customerPhone,
        videoUrl: String(videoUrl || "").trim(),
        usedCount: 0,
        verifiedDevices: [],
        lastIp: "",
        lastDevice: "",
        status: "Active",
        createdAt: new Date().toISOString()
      };

      if (!db.vipTickets) db.vipTickets = [];
      db.vipTickets.unshift(newTicket);

      // Update request status to Approved
      reqData.status = "Approved";
      reqData.approvedCode = code;

      await addAuditLog(db, adminName || "Admin", "Approve VIP Request", `داواکاری VIP پەسەندکرا بۆ: ${reqData.customerName} و کۆد دروستکرا (${code})`);
      await saveDB(db);

      res.json({ success: true, ticket: newTicket });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Decline/Delete Request
  app.post('/api/admin/vip/requests/delete', async (req, res) => {
    try {
      const { requestId, adminName } = req.body;
      if (!requestId) {
        return res.status(400).json({ success: false, error: 'ناسنامەی داواکاری نادیارە.' });
      }

      if (!db.vipRequests) db.vipRequests = [];
      const index = db.vipRequests.findIndex((r: any) => r.id === requestId);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'داواکاری نەدۆزرایەوە.' });
      }

      const deletedReq = db.vipRequests[index];
      db.vipRequests.splice(index, 1);

      await addAuditLog(db, adminName || "Admin", "Decline VIP Request", `داواکاری ڕەتکرایەوە یان سڕایەوە بۆ: ${deletedReq.customerName}`);
      await saveDB(db);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Simple in-memory rate limiter store for VIP verification
  const vipRateLimits: Record<string, { attempts: number; resetTime: number }> = {};

  // Client Ticket Verification & Check-in
  app.post('/api/vip/verify', async (req, res) => {
    // Determine user client IP
    const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown").trim();
    
    // Rate Limiter logic: max 5 requests per 1 minute per IP
    const nowLocal = Date.now();
    const limitTimeFrameLocal = 60 * 1000; // 1 minute
    const maxAttemptsLocal = 5;

    if (!vipRateLimits[clientIp]) {
      vipRateLimits[clientIp] = { attempts: 1, resetTime: nowLocal + limitTimeFrameLocal };
    } else {
      const record = vipRateLimits[clientIp];
      if (nowLocal > record.resetTime) {
        record.attempts = 1;
        record.resetTime = nowLocal + limitTimeFrameLocal;
      } else {
        record.attempts += 1;
        if (record.attempts > maxAttemptsLocal) {
          return res.status(429).json({ 
            success: false, 
            message: 'سیستەمی چاودێری سوودوەرگرتنی نادروست و هەوڵی توندڕەوی دۆزییەوە! تکایە دوای خولەکێک تاقی بکەرەوە (Rate Limited).' 
          });
        }
      }
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'کۆدی تیکێتی VIP پێویستە.' });
    }

    const cleanCode = String(code).trim();
    if (!db.vipTickets) db.vipTickets = [];
    
    const ticketIndex = db.vipTickets.findIndex((t: any) => t.code === cleanCode);
    if (ticketIndex === -1) {
      return res.status(404).json({ success: false, message: 'ئەم کۆدی VIPیە نادروستە یان بوونی نییە لە سیستەمدا!' });
    }

    const ticket = db.vipTickets[ticketIndex];

    if (ticket.status === "Expired") {
      return res.status(400).json({ 
        success: false, 
        message: 'ئەم بلیتە بەسەرچووە و لەلایەن بەڕێوبەرەوە یان بەهۆی تێپەڕاندنی ڕێژەی ئامێرەکان ڕاگیراوە!' 
      });
    }

    // Read or initialize device verification list
    if (!ticket.verifiedDevices) {
      ticket.verifiedDevices = [];
    }

    // IP Check-in for 2 device limit
    const isAlreadyRegistered = ticket.verifiedDevices.includes(clientIp);

    if (!isAlreadyRegistered) {
      if (ticket.verifiedDevices.length >= 2) {
        ticket.status = "Expired";
        await saveDB(db);
        return res.status(400).json({ 
          success: false, 
          message: 'ئەم تیکێتە پێشتر لەسەر کەسی جیاواز چالاککراوە و تەنها ڕێگە بە ٢ ئامێری جیاواز دەدرێت لەسەر لۆگی داتابەیس!' 
        });
      }
      ticket.verifiedDevices.push(clientIp);
    }

    const userAgent = req.headers['user-agent'] || "Unknown Device";
    
    // Parse simplified user agent device info
    let deviceInfo = "کارپێکەری ئاسایی (PC/Web)";
    if (/android/i.test(userAgent)) deviceInfo = "مۆبایل (Android)";
    else if (/iphone|ipad/i.test(userAgent)) deviceInfo = "مۆبایل (iOS / iPhone)";
    else if (/macintosh/i.test(userAgent)) deviceInfo = "کۆمپیوتەر (Apple macOS)";
    else if (/windows/i.test(userAgent)) deviceInfo = "کۆمپیوتەر (MS Windows)";

    ticket.usedCount = (ticket.usedCount || 0) + 1;
    ticket.lastIp = clientIp;
    ticket.lastDevice = deviceInfo;

    if (ticket.usedCount >= 2) {
      ticket.status = "Expired";
    }

    await saveDB(db);

    res.json({ 
      success: true, 
      ticket, 
      settings: db.vipSettings 
    });
  });

  // Check ticket validity without modifying database status or counts
  app.post('/api/vip/check-validity', (req, res) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'کۆدی تیکێتی VIP پێویستە.' });
    }

    const cleanCode = String(code).trim();
    if (!db.vipTickets) db.vipTickets = [];

    const ticket = db.vipTickets.find((t: any) => t.code === cleanCode);
    if (!ticket) {
      return res.json({ success: false, message: 'ئەم بلیتە بوونی نییە!' });
    }

    if (ticket.status === "Expired") {
      return res.json({ success: false, message: 'ئەم بلیتە بەسەرچووە!' });
    }

    res.json({ success: true, ticket });
  });

  // Get all VIP Videos
  app.get('/api/admin/vip/videos', (req, res) => {
    res.json(db.vipVideos || []);
  });

  // Add VIP Video
  app.post('/api/admin/vip/videos/add', async (req, res) => {
    const { title, videoUrl, adminName } = req.body;
    if (!title || !videoUrl) {
      return res.status(400).json({ error: 'ناوی ڤیدیۆ و لینکی ڤیدیۆ پێویستن' });
    }

    const newVideo = {
      id: 'vid_' + Date.now(),
      title: String(title).trim(),
      videoUrl: String(videoUrl).trim(),
      createdAt: new Date().toISOString()
    };

    if (!db.vipVideos) db.vipVideos = [];
    db.vipVideos.push(newVideo);

    await addAuditLog(db, adminName || "Admin", "Add VIP Video", `ڤیدیۆی نوێی VIP زیادکرا: "${title}"`);
    await saveDB(db);

    res.json({ success: true, video: newVideo });
  });

  // Delete VIP Video
  app.post('/api/admin/vip/videos/delete', async (req, res) => {
    const { id, adminName } = req.body;
    if (!id) return res.status(400).json({ error: 'کۆدی ڤیدیۆ پێویستە' });
    
    if (!db.vipVideos) db.vipVideos = [];
    db.vipVideos = db.vipVideos.filter((v: any) => v.id !== id);

    await addAuditLog(db, adminName || "Admin", "Delete VIP Video", `ڤیدیۆی VIP سڕایەوە: ${id}`);
    await saveDB(db);

    res.json({ success: true, videos: db.vipVideos });
  });

  // --- MODULE 13: SMART ANALYTICS ENDPOINTS ---
  app.get('/api/admin/smart-analytics', (req, res) => {
    const usersCount = Array.isArray(db.users) ? db.users.length : 0;
    const roomsCount = db.syncGroups ? Object.keys(db.syncGroups).length : 0;
    const moviesCount = Array.isArray(db.manualMovies) ? db.manualMovies.length : 0;
    const bannedIpsCount = Array.isArray(db.bannedIps) ? db.bannedIps.length : 0;
    const errorsCount = Array.isArray(db.systemErrorLogs) ? db.systemErrorLogs.length : 0;
    const intrusionCount = Array.isArray(db.intrusionAttempts) ? db.intrusionAttempts.length : 0;
    const vipCount = Array.isArray(db.vipTickets) ? db.vipTickets.length : 0;
    const vipUsedCount = Array.isArray(db.vipTickets) ? db.vipTickets.filter((t: any) => t.usedCount > 0).length : 0;

    // Build some elegant aggregations or time graphs
    const sampleTimelineDays = ["شەممە", "یەکشەممە", "دووشەممە", "سێشەممە", "چوارشەممە", "پێنجشەممە", "هەینی"];
    const trafficByDay = sampleTimelineDays.map((day, idx) => {
      // seed custom ratios
      const base = 250 + (idx * 45) % 180;
      return {
        day,
        visitors: base + (intrusionCount * 4) + (vipCount * 3),
        messages: base * 3 + idx * 80
      };
    });

    res.json({
      summary: {
        usersCount,
        roomsCount,
        moviesCount,
        bannedIpsCount,
        errorsCount,
        intrusionCount,
        vipCount,
        vipUsedCount
      },
      trafficByDay,
      threatReport: {
        totalBlocks: bannedIpsCount + Math.floor(intrusionCount / 3),
        activeDefenseRatio: "100%",
        firewallHealth: "Perfect (Shield Active)"
      }
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      time: new Date().toISOString(), 
      server: 'CinemaChat', 
      node: process.version,
      platform: process.platform,
      memory: process.memoryUsage().rss
    });
  });

  // --- DIRECT YOUTUBE STREAM FALLBACK ---
  // Resolves a YouTube URL into a direct progressive-MP4 stream (via yt-dlp) so
  // the player can bypass YouTube's embed restrictions ("Playback ID" errors).
  // Cached server-side for YT_STREAM_CACHE_TTL_MS; SSRF-safe because only real
  // YouTube video IDs are ever handed to yt-dlp.
  app.post('/api/resolve-stream', async (req, res) => {
    try {
      const videoId = extractYoutubeVideoId(String((req.body as any)?.url || ''));
      if (!videoId) {
        return res.status(400).json({ ok: false, error: 'Invalid YouTube URL' });
      }
      const streams = await resolveYoutubeDirectStreams(videoId);
      res.json({ ok: true, videoId, streams, expiresIn: YT_STREAM_CACHE_TTL_MS });
    } catch (err: any) {
      const msg = err?.message || String(err);
      const notFound = msg.includes('yt-dlp not found');
      console.error(`[resolve-stream] ${msg}`);
      res.status(notFound ? 501 : 422).json({ ok: false, error: msg });
    }
  });

  // --- BULK LIVE STATS (Firestore movies) ---
  // Returns concurrent-viewer + lifetime-view + like counts for an arbitrary set
  // of movie ids. The grid polls this every 30s so "watching now" badges and
  // like counts also reflect Firestore movies that are not part of the server
  // movie cache (which only holds db.manualMovies). Registered BEFORE the
  // :movieId routes so `live` is never captured as a movie id.
  app.post('/api/movies/live', async (req, res) => {
    try {
      const rawIds: unknown = (req.body as any)?.ids;
      if (!Array.isArray(rawIds)) {
        return res.status(400).json({ status: 'error', error: 'ids must be an array' });
      }
      const ids = rawIds
        .filter((x: unknown): x is string => typeof x === 'string')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && s.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(s))
        .slice(0, 400);
      const stats: Record<string, { liveViewers: number; views: number; likes: number; ccRating: number; ratingCount: number; favoriteCount: number; trendingScore: number }> = {};
      for (const id of ids) {
        const sessions = movieViewerSessions.get(id);
        const movie = db.manualMovies.find((m: any) => m.id === id) || firestoreMoviesCache[id];
        const { ccRating, ratingCount } = getMovieRating(id);
        stats[id] = {
          liveViewers: sessions ? sessions.size : 0,
          views: getViewsCount(id),
          likes: movie ? Number(movie.likes) || 0 : 0,
          ccRating,
          ratingCount,
          favoriteCount: getFavoriteCount(id),
          trendingScore: movie ? computeTrendingScore(movie) : 0,
        };
      }
      res.json({ status: 'ok', stats });
    } catch (err: any) {
      console.error('[movies/live]', err?.message || err);
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  });

  // --- LIVE VIEWERS & VIEWS ---
  // Registers a heartbeat for a movieId + session and bumps the movie's lifetime
  // `views` counter once per session. Returns the current concurrent viewer
  // count so the player can reflect "watching now" immediately.
  app.post('/api/movies/:movieId/view', async (req, res) => {
    try {
      const movieId = String((req.params as any).movieId || '').trim();
      const session = String((req.body as any)?.session || '').trim();
      // Device identity (persistent, same across tabs) — used ONLY to dedupe
      // lifetime `views`. Live concurrent viewers are keyed by `session` so two
      // tabs of the same device count as two live viewers.
      const deviceId = String((req.body as any)?.deviceId || '').trim();
      if (!movieId || movieId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(movieId)) {
        return res.status(400).json({ ok: false, error: 'Invalid movie id' });
      }
      if (!session || session.length > 64) {
        return res.status(400).json({ ok: false, error: 'Invalid session' });
      }
      if (deviceId && deviceId.length > 128) {
        return res.status(400).json({ ok: false, error: 'Invalid device id' });
      }

      const now = Date.now();
      let sessions = movieViewerSessions.get(movieId);
      if (!sessions) {
        sessions = new Map<string, number>();
        movieViewerSessions.set(movieId, sessions);
      }
      sessions.set(session, now);
      // Prune stale sessions so the count never includes dead tabs
      for (const [sid, lastSeen] of sessions) {
        if (now - lastSeen > MOVIE_VIEWER_TTL_MS) sessions.delete(sid);
      }

      // Lifetime view count: count each session once per DEVICE, persist to the
      // DB + cache. `viewsCounts` is the single source of truth so movies that
      // only exist in Firestore (not in manualMovies) also accumulate real views.
      const viewKey = `${movieId}:${deviceId || session}`;
      let views = 0;
      const movie = db.manualMovies.find((m: any) => m.id === movieId);
      if (!countedViewSessions.has(viewKey)) {
        countedViewSessions.add(viewKey);
        views = getViewsCount(movieId) + 1;
        db.viewsCounts = db.viewsCounts || {};
        db.viewsCounts[movieId] = views;
        // Persist the updated counters to the durable Firestore copy so they
        // survive the next Render deploy/restart.
        saveMovieViewsToFirestore(db.viewsCounts);
        if (movie) {
          movie.views = views;
          setMoviesCache(prev =>
            prev.map((m: any) =>
              m.id === movieId ? { ...m, views } : m
            )
          );
        }
        await saveDB(db);
      } else {
        views = getViewsCount(movieId);
      }

      res.json({ ok: true, movieId, viewers: sessions.size, views });
    } catch (err: any) {
      console.error(`[view] ${err?.message || err}`);
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // --- LIKES ---
  // Toggles a per-user like on a movie. Persists `likes` (count) and `likedBy`
  // (uid list) to the DB + cache so cards can render a live like count.
  app.post('/api/movies/:movieId/like', async (req, res) => {
    try {
      const movieId = String((req.params as any).movieId || '').trim();
      const uid = String((req.body as any)?.uid || '').trim();
      if (!movieId || movieId.length > 128) {
        return res.status(400).json({ ok: false, error: 'Invalid movie id' });
      }
      if (!uid || uid.length > 128) {
        return res.status(400).json({ ok: false, error: 'Missing uid' });
      }
      const movie = db.manualMovies.find((m: any) => m.id === movieId);
      if (!movie) return res.status(404).json({ ok: false, error: 'Movie not found' });

      const likedBy: string[] = Array.isArray(movie.likedBy) ? movie.likedBy : [];
      const already = likedBy.includes(uid);
      const nextLikedBy = already
        ? likedBy.filter((id: string) => id !== uid)
        : [...likedBy, uid];
      movie.likes = nextLikedBy.length;
      movie.likedBy = nextLikedBy;
      await saveDB(db);
      setMoviesCache(prev =>
        prev.map((m: any) =>
          m.id === movieId ? { ...m, likes: movie.likes, likedBy: movie.likedBy } : m
        )
      );
      res.json({ ok: true, movieId, likes: movie.likes, liked: !already });
    } catch (err: any) {
      console.error(`[like] ${err?.message || err}`);
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // --- USER RATINGS (CinemaChat rating) ---
  // Persists a per-user score (1-10) on a movie and returns the aggregated
  // CinemaChat rating + how many users rated it. Ratings never overwrite the
  // movie's IMDb `rating` field — they are stored separately and displayed
  // alongside it on every card.
  app.post('/api/movies/:movieId/rate', async (req, res) => {
    try {
      const movieId = String((req.params as any).movieId || '').trim();
      const uid = String((req.body as any)?.uid || '').trim();
      const rawScore = Number((req.body as any)?.score);
      if (!movieId || movieId.length > 128) {
        return res.status(400).json({ ok: false, error: 'Invalid movie id' });
      }
      if (!uid || uid.length > 128) {
        return res.status(400).json({ ok: false, error: 'Missing uid' });
      }
      if (!Number.isFinite(rawScore) || rawScore < 0.5 || rawScore > 10) {
        return res.status(400).json({ ok: false, error: 'Score must be between 0.5 and 10' });
      }
      const score = Math.round(rawScore * 2) / 2; // snap to half-stars

      if (!db.ratings) db.ratings = {};
      if (!db.ratings[movieId]) db.ratings[movieId] = {};
      db.ratings[movieId][uid] = score;

      const { ccRating, ratingCount } = getMovieRating(movieId);
      await saveDB(db);
      res.json({ ok: true, movieId, ccRating, ratingCount, userRating: score });
    } catch (err: any) {
      console.error(`[rate] ${err?.message || err}`);
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // Fetch a movie's aggregated rating + the calling user's own score.
  app.get('/api/movies/:movieId/rating', (req, res) => {
    try {
      const movieId = String((req.params as any).movieId || '').trim();
      const uid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';
      const { ccRating, ratingCount } = getMovieRating(movieId);
      const userRating = uid && db.ratings?.[movieId]?.[uid]
        ? db.ratings[movieId][uid]
        : 0;
      res.json({ ok: true, movieId, ccRating, ratingCount, userRating });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Internal server error' });
    }
  });

  // --- FAVORITES ---
  // Per-user favorite movie ids, persisted in db.favorites (movieId -> addedAt)
  // and mirrored onto the user record so the frontend can hydrate both stores.
  app.get('/api/favorites', (req, res) => {
    try {
      const uid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';
      if (!uid || uid.length > 128) {
        return res.status(400).json({ status: 'error', error: 'Missing uid' });
      }
      const favorites = db.favorites?.[uid] || {};
      res.json({ status: 'ok', results: Object.keys(favorites) });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: err?.message || 'Internal server error' });
    }
  });

  app.post('/api/favorites/:movieId', async (req, res) => {
    try {
      const movieId = String((req.params as any).movieId || '').trim();
      const uid = String((req.body as any)?.uid || '').trim();
      if (!movieId || movieId.length > 128) {
        return res.status(400).json({ ok: false, error: 'Invalid movie id' });
      }
      if (!uid || uid.length > 128) {
        return res.status(400).json({ ok: false, error: 'Missing uid' });
      }
      if (!db.favorites) db.favorites = {};
      if (!db.favorites[uid]) db.favorites[uid] = {};
      db.favorites[uid][movieId] = Date.now();
      const user = (db.users || []).find((u: any) => u.uid === uid);
      if (user) {
        user.favorites = Array.from(
          new Set([...(Array.isArray(user.favorites) ? user.favorites : []), movieId])
        );
      }
      rebuildFavoriteCounts();
      await saveDB(db);
      res.json({ ok: true, movieId, added: true, favoriteCount: db.favoriteCounts?.[movieId] || 0 });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Internal server error' });
    }
  });

  app.delete('/api/favorites/:movieId', async (req, res) => {
    try {
      const movieId = String((req.params as any).movieId || '').trim();
      const uid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';
      if (!movieId || movieId.length > 128) {
        return res.status(400).json({ ok: false, error: 'Invalid movie id' });
      }
      if (!uid || uid.length > 128) {
        return res.status(400).json({ ok: false, error: 'Missing uid' });
      }
      if (db.favorites?.[uid]) delete db.favorites[uid][movieId];
      const user = (db.users || []).find((u: any) => u.uid === uid);
      if (user && Array.isArray(user.favorites)) {
        user.favorites = user.favorites.filter((id: string) => id !== movieId);
      }
      rebuildFavoriteCounts();
      await saveDB(db);
      res.json({ ok: true, movieId, added: false, favoriteCount: db.favoriteCounts?.[movieId] || 0 });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Internal server error' });
    }
  });

  // Redirects to the freshest direct stream for a video id. Media elements fetch
  // in no-cors mode, so no CORS is required from the client. 302 keeps playback
  // off the Render instance while staying IP/geo neutral.
  app.get('/api/stream/:videoId', async (req, res) => {
    try {
      const videoId = String((req.params as any).videoId || '').trim();
      if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ ok: false, error: 'Invalid video id' });
      }
      const streams = await resolveYoutubeDirectStreams(videoId);
      if (!streams[0]?.url) {
        return res.status(404).json({ ok: false, error: 'No stream available' });
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.redirect(302, streams[0].url);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(`[stream] ${msg}`);
      res.status(502).json({ ok: false, error: msg });
    }
  });

  app.get('/api/status', (req, res) => {
    res.json({ 
      connected: true, 
      uptime: process.uptime(),
      dbSize: moviesCache.length,
      lastSync: lastFetchTime,
      webhook: !!process.env.WHATSAPP_WEBHOOK_SECRET
    });
  });

  app.get('/api/stats', (req, res) => {
    const session = typeof req.query.session === 'string' ? req.query.session.trim() : '';
    const now = Date.now();
    if (session && session.length <= 64) {
      activeSessions.set(session, now);
    }
    // Prune sessions that have gone quiet so the count only reflects live viewers
    for (const [sid, lastSeen] of activeSessions) {
      if (now - lastSeen > SESSION_TTL_MS) activeSessions.delete(sid);
    }
    res.json({ visitors: activeSessions.size });
  });

  // --- MODULE 14: DYNAMIC 'CAME HERE' ROOMS ENDPOINTS ---
  // --- MODULE 15: INVITATIONS & NOTIFICATIONS ENDPOINTS ---
  app.get('/api/notifications/:userCode', (req, res) => {
    try {
      const { userCode } = req.params;
      const cleanCode = userCode.trim().toUpperCase();
      if (!db.invitations) {
        db.invitations = [];
      }
      const userInvites = db.invitations.filter((inv: any) => 
        inv.toUserCode === cleanCode && inv.status === 'pending'
      );
      res.json(userInvites);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/send', async (req, res) => {
    try {
      const { fromUserCode, fromUserName, targetCodeOrName, roomId, roomName } = req.body;
      
      if (!targetCodeOrName || !fromUserCode || !roomId) {
        return res.status(400).json({ error: 'داخڵکراوەکان ناتەواون' });
      }

      const cleanTarget = targetCodeOrName.trim().toUpperCase();
      const cleanFromCode = fromUserCode.trim().toUpperCase();

      if (!db.users) {
        db.users = [];
      }

      const targetUser = db.users.find((u: any) => {
        const uCode = (u.uniqueCode || '').trim().toUpperCase();
        const uName = (u.username || u.name || '').trim().toUpperCase();
        return uCode === cleanTarget || uName === cleanTarget;
      });

      if (!targetUser) {
        return res.status(404).json({ error: 'بەکارھێنەرەکە نەدۆزرایەوە! تکایە ناوی بەکارهێنەر یان کۆدی بێهاوتا بە دروستی بنووسە.' });
      }

      const targetUserCode = (targetUser.uniqueCode || '').toUpperCase();

      if (!db.invitations) {
        db.invitations = [];
      }

      if (cleanFromCode === targetUserCode) {
        return res.status(400).json({ error: 'ناتوانیت خۆت بانگهێشت بکەیت!' });
      }

      const newInvitation = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        fromUserCode: cleanFromCode,
        fromUserName: fromUserName || 'هاوڕێیەک',
        toUserCode: targetUserCode,
        roomId,
        roomName: roomName || 'ژووری هاوڕێیان',
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      db.invitations.push(newInvitation);
      await saveDB(db);

      res.json({ success: true, invitation: newInvitation });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/:id/respond', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!db.invitations) {
        db.invitations = [];
      }

      const inviteIndex = db.invitations.findIndex((inv: any) => inv.id === id);
      if (inviteIndex === -1) {
        return res.status(404).json({ error: 'بانگهێشتنامەکە نەدۆزرایەوە' });
      }

      db.invitations[inviteIndex].status = status;
      db.invitations[inviteIndex].updatedAt = new Date().toISOString();
      await saveDB(db);

      res.json({ success: true, invitation: db.invitations[inviteIndex] });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- MODULE 16: DIRECT MESSAGING (DMs) ENDPOINTS ---
  app.get('/api/dms/:userCode', (req, res) => {
    try {
      const { userCode } = req.params;
      const cleanCode = userCode.trim().toUpperCase();
      
      if (!db.directMessages) {
        db.directMessages = [];
      }

      // Filter messages sent by or received by this user
      const userDms = db.directMessages.filter((dm: any) => 
        (dm.senderCode || '').toUpperCase() === cleanCode || 
        (dm.receiverCode || '').toUpperCase() === cleanCode
      );

      res.json(userDms);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dms/send', async (req, res) => {
    try {
      const { senderCode, senderName, targetCodeOrName, message } = req.body;

      if (!senderCode || !targetCodeOrName || !message || !message.trim()) {
        return res.status(400).json({ error: 'داخڵکراوەکان ناتەواون' });
      }

      const cleanSenderCode = senderCode.trim().toUpperCase();
      const cleanTarget = targetCodeOrName.trim().toUpperCase();

      if (!db.users) {
        db.users = [];
      }

      // Find target user by uniqueCode or username/name
      const targetUser = db.users.find((u: any) => {
        const uCode = (u.uniqueCode || '').trim().toUpperCase();
        const uName = (u.username || u.name || '').trim().toUpperCase();
        return uCode === cleanTarget || uName === cleanTarget;
      });

      if (!targetUser) {
        return res.status(404).json({ error: 'وەرگرەکە نەدۆزرایەوە! تکایە ناوی بەکارهێنەر یان کۆدی بێهاوتا بە دروستی بنووسە.' });
      }

      const receiverCode = (targetUser.uniqueCode || '').toUpperCase();
      const receiverName = targetUser.username || targetUser.name || 'بەکارھێنەر';

      if (cleanSenderCode === receiverCode) {
        return res.status(400).json({ error: 'ناتوانیت نامەی دایرێکت بۆ خۆت بنێریت!' });
      }

      if (!db.directMessages) {
        db.directMessages = [];
      }

      const newDm = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        senderCode: cleanSenderCode,
        senderName: senderName || 'هاوڕێیەک',
        receiverCode: receiverCode,
        receiverName: receiverName,
        message: message.trim(),
        timestamp: new Date().toISOString()
      };

      db.directMessages.push(newDm);
      await saveDB(db);

      res.json({ success: true, message: newDm });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Consolidated room data is now in db.syncGroups (Removed db.rooms)
  app.get('/api/rooms', (req, res) => {
    res.json(Object.values(db.syncGroups || {}));
  }); // End /api/rooms
  app.post('/api/rooms/create', async (req, res) => {
    try {
      const { name, hostCode, currentMovieUrl } = req.body;
      if (!name || !hostCode) {
        return res.status(400).json({ success: false, error: 'ناو و کۆدی خانەخوێ پێویستە' });
      }

      if (!db.syncGroups) db.syncGroups = {};
      // Set roomId directly to the host's unique code to prevent duplicate/random codes
      const roomId = hostCode.trim().toUpperCase(); // Room ID is host code
      const newRoom = { // New room object
        id: roomId,
        name: name.trim(),
        hostCode: hostCode.trim().toUpperCase(),
        currentTime: 0,
        // activeUsers: [ // Removed
        // ], // Removed
        // If room exists, preserve activeUsers and chatMessages, otherwise initialize empty
        activeUsers: db.syncGroups[roomId]?.activeUsers || [],
        chatMessages: db.syncGroups[roomId]?.chatMessages || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      // Use db.syncGroups for all room data
      if (db.syncGroups[roomId]) {
        db.syncGroups[roomId] = { ...db.syncGroups[roomId], ...newRoom };
      } else {
        db.syncGroups[roomId] = newRoom;
      }
      await saveDB(db);

      console.log(`[Came Here Room] Created/Updated room ${roomId} using host code`); // Log room creation
      res.json({ success: true, room: newRoom });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/rooms/:id', async (req, res) => {
    const { id } = req.params;
    const { userCode } = req.query;

    if (!db.syncGroups) db.syncGroups = {};
    let room = db.syncGroups[id] || db.syncGroups[id.trim().toUpperCase()];
    if (!room) {
      if (id === 'global_room_official') {
        room = INITIAL_GLOBAL_ROOM;
      } else if (id === 'main_broadcast_room') {
        room = INITIAL_BROADCAST_ROOM;
      } else { // Room not found
        return res.status(404).json({ error: 'ژوور بەردەست نییە' }); // Return 404
      }
    }

    // Update active user last seen if userCode is supplied
    // Update active user last seen if code is supplied
    if (userCode) {
      const cleanCode = String(userCode).trim().toUpperCase();
      if (!room.activeUsers) room.activeUsers = [];
      const userObj = room.activeUsers.find((u: any) => u.uniqueCode === cleanCode);
      if (userObj) {
        userObj.lastSeen = new Date().toISOString();
      } else {
        room.activeUsers.push({
          username: cleanCode === room.hostCode ? 'خانەخوێ (Host)' : `بینەر-${cleanCode.substring(0, 5)}`,
          uniqueCode: cleanCode,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        });
      }
      db.syncGroups[room.id] = room; // Persist changes to the room object (important for activeUsers)
      room.updatedAt = new Date().toISOString();
      await saveDB(db);
    }

    res.json(room);
  });

  app.post('/api/rooms/:id/update', async (req, res) => {
    try {
      const { id } = req.params;
      const { currentTime, isPlaying, currentMovieUrl, chatMessage, userCode, videoData } = req.body; // Added videoData
      if (!db.syncGroups) db.syncGroups = {};

      const roomId = id.trim().toUpperCase();
      if (!db.syncGroups[roomId]) {
        return res.status(404).json({ error: 'ژوور بەردەست نییە' }); // Room not found
      } // End if room not found

      // Update room data
      const room = db.syncGroups[roomId];

      // Handle user heartbeat (lastSeen update)
      if (userCode) {
        const cleanCode = String(userCode).trim().toUpperCase();
        if (!room.activeUsers) room.activeUsers = [];
        const userObj = room.activeUsers.find((u: any) => u.uniqueCode === cleanCode);
        if (userObj) {
          userObj.lastSeen = new Date().toISOString();
        } else {
          room.activeUsers.push({
            username: cleanCode === room.hostCode ? 'خانەخوێ (Host)' : `بینەر-${cleanCode.substring(0, 5)}`,
            uniqueCode: cleanCode,
            joinedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
          });
        }
      }
      if (currentTime !== undefined) room.playback.currentTime = Number(currentTime);
      if (isPlaying !== undefined) room.playback.isPlaying = Boolean(isPlaying);
      if (currentMovieUrl !== undefined) room.currentMovieUrl = currentMovieUrl;
      if (videoData !== undefined) room.videoData = videoData; // Update videoData


      // Handle new chat message
      if (chatMessage) {
        if (!room.chatMessages) room.chatMessages = [];
        room.chatMessages.push({
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          sender: chatMessage.sender || 'Anonymous',
          senderCode: chatMessage.senderCode || '',
          text: chatMessage.text || '',
          timestamp: new Date().toISOString()
        });
        if (room.chatMessages.length > 150) {
          room.chatMessages = room.chatMessages.slice(-150);
        }
      }

      // Auto-delete logic: Purge messages in main_broadcast_room older than 1 hour on update as well (important for broadcast room)
      // Ensure chatMessages is an array before filtering
      if (room.id === 'main_broadcast_room' && Array.isArray(room.chatMessages)) {
        const oneHourAgo = Date.now() - 3600000;
        room.chatMessages = room.chatMessages.filter((msg: any) => {
          const t = msg.timestamp ? new Date(msg.timestamp).getTime() : 0; // Ensure timestamp is valid
          return t > oneHourAgo;
        });
      }

      room.updatedAt = new Date().toISOString();
      await saveDB(db); // Save changes to DB

      res.json({ success: true, room: db.syncGroups[roomId] });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/rooms/:id/join', async (req, res) => {
    try {
      const { id } = req.params;
      const { uniqueCode, username } = req.body;
      const isBroadcastRoom = id === 'main_broadcast_room';
      const roomId = id.trim().toUpperCase(); // Room ID is uppercase

      let cleanCode = uniqueCode ? uniqueCode.trim().toUpperCase() : ''; // Clean unique code
      if (isBroadcastRoom && !cleanCode) {
        // Generate automatic unique identifier for guest
        cleanCode = 'GUEST_' + Math.random().toString(36).substring(2, 8).toUpperCase();
      }

      if (!db.syncGroups) db.syncGroups = {}; // Ensure syncGroups exists
      let room = db.syncGroups[roomId];

      // Access Control check: validate uniqueCode in database (bypass for Broadcast Room)
      const userExists = db.users && db.users.some((u: any) => {
        const uCode = (u.uniqueCode || '').trim().toUpperCase();
        return uCode === cleanCode;
      });

      const isGlobalHost = cleanCode === 'GLOBAL_HOST';
      const isRoomHost = room?.hostCode && (cleanCode === room.hostCode.toUpperCase());
      const isVipTicketCode = db.vipTickets && db.vipTickets.some((t: any) => (t.code || '').trim().toUpperCase() === cleanCode);

      if (!cleanCode && !isBroadcastRoom) { // Only require code if not broadcast room
        return res.status(400).json({ error: 'پێویستە کۆدی خۆت بنەخشێنیت' });
      }

      // Initialize broadcast room if it doesn't exist
      if (!db.syncGroups[roomId] && isBroadcastRoom) {
        db.syncGroups[roomId] = INITIAL_BROADCAST_ROOM;
        room = db.syncGroups[roomId]; // Refresh after init
        await saveDB(db); // Persist the new room
      }

      if (!db.syncGroups[roomId]) { // If room still not found
        return res.status(404).json({ error: 'ژوور بەردەست نییە' }); // Return 404
      }

      if (!isBroadcastRoom && !userExists && !isGlobalHost && !isRoomHost && !isVipTicketCode && cleanCode !== 'ADMIN') {
        return res.status(403).json({ error: 'ژمارەی چوونەژوورە نادروستە یان تۆمار نەکراوە!' });
      }

      if (!room.activeUsers) room.activeUsers = [];

      // Add user if they are not already active
      const alreadyIn = room.activeUsers.some((u: any) => u.uniqueCode === cleanCode);
      if (!alreadyIn) {
        room.activeUsers.push({
          username: username || `بینەر-${cleanCode.substring(0, 5)}`,
          uniqueCode: cleanCode,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        });
      } else {
        const userObj = room.activeUsers.find((u: any) => u.uniqueCode === cleanCode);
        if (userObj) {
          userObj.lastSeen = new Date().toISOString();
          if (username) userObj.username = username;
        }
      }

      room.updatedAt = new Date().toISOString();
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      logUserActivity(db, cleanCode, "Join Room", `چووە ناو ژووری تەلەفزیۆنی "${room.name || id}"`, clientIp); // Log user activity
      db.syncGroups[roomId] = room; // Persist changes to the room object
      await saveDB(db);

      res.json({ success: true, room });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/rooms/:id', async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    if (!db.syncGroups) db.syncGroups = {}; // Ensure syncGroups exists
    if (!db.syncGroups[id]) db.syncGroups[id] = { id, name: id, activeUsers: [], chatMessages: [], playback: { isPlaying: false, currentTime: 0, updatedAt: new Date().toISOString() } }; // Initialize if not exists
    db.syncGroups[id] = { ...db.syncGroups[id], ...updateData, updatedAt: new Date().toISOString() };
    const room = db.syncGroups[id];

    await saveDB(db);
    res.json({ success: true, room });
  });

  // --- Drama Rooms API (public, persisted in db.dramaRooms) ---
  // Curated collections: cover, title, description, unlimited dramas. These
  // endpoints are intentionally NOT admin-guarded so the app can read them at
  // runtime; writes are still gated client-side by the verified-owner check.
  app.get('/api/drama-rooms', (req, res) => {
    try {
      const rooms = Object.values(db.dramaRooms || {});
      // Newest rooms first so the homepage gallery stays fresh
      rooms.sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      res.json({ success: true, rooms });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/drama-rooms/:id', (req, res) => {
    try {
      const room = (db.dramaRooms || {})[req.params.id];
      if (!room) return res.status(404).json({ error: 'ئەم ژوورە بەردەست نییە' });
      res.json({ success: true, room });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/drama-rooms', async (req, res) => {
    try {
      const { title, description, coverUrl, dramas } = req.body || {};
      if (!title || !String(title).trim()) {
        return res.status(400).json({ success: false, error: 'ناونیشانی ژوورەکە پێویستە' });
      }
      if (!db.dramaRooms) db.dramaRooms = {};
      const now = new Date().toISOString();
      const id = `drama_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const room = {
        id,
        title: String(title).trim(),
        description: String(description || '').trim(),
        coverUrl: String(coverUrl || '').trim(),
        dramas: Array.isArray(dramas) ? dramas : [],
        createdAt: now,
        updatedAt: now
      };
      db.dramaRooms[id] = room;
      await saveDB(db);
      console.log(`[Drama Rooms] Created room "${room.title}" (${id})`);
      res.json({ success: true, room });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/drama-rooms/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, coverUrl, dramas } = req.body || {};
      if (!db.dramaRooms) db.dramaRooms = {};
      if (!db.dramaRooms[id]) return res.status(404).json({ success: false, error: 'ئەم ژوورە بەردەست نییە' });
      const existing = db.dramaRooms[id];
      if (title !== undefined) {
        if (!String(title).trim()) return res.status(400).json({ success: false, error: 'ناونیشانی ژوورەکە پێویستە' });
        existing.title = String(title).trim();
      }
      if (description !== undefined) existing.description = String(description || '').trim();
      if (coverUrl !== undefined) existing.coverUrl = String(coverUrl || '').trim();
      if (dramas !== undefined) existing.dramas = Array.isArray(dramas) ? dramas : existing.dramas || [];
      existing.updatedAt = new Date().toISOString();
      await saveDB(db);
      console.log(`[Drama Rooms] Updated room "${existing.title}" (${id})`);
      res.json({ success: true, room: existing });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/drama-rooms/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!db.dramaRooms) db.dramaRooms = {};
      if (!db.dramaRooms[id]) return res.status(404).json({ success: false, error: 'ئەم ژوورە بەردەست نییە' });
      const removed = db.dramaRooms[id];
      delete db.dramaRooms[id];
      await saveDB(db);
      console.log(`[Drama Rooms] Deleted room "${removed.title}" (${id})`);
      res.json({ success: true, id });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/imdb-fetch', async (req, res) => {
    const { url, imdbId } = req.query;
    
    let targetUrl = url as string;
    if (imdbId) {
      const ttId = String(imdbId).startsWith('tt') ? imdbId : `tt${imdbId}`;
      targetUrl = `https://www.imdb.com/title/${ttId}/`;
    }

    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'لینک یان کۆدی پێویستە' });
    }

    try {
      console.log(`[Proxy Fetch] Fetching raw content for client-side AI: ${targetUrl}`);
      
      const response = await fetchWithTimeout(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
      }, 15000); 

      if (!response.ok) {
        // Log details but don't crash
        console.warn(`[Proxy Fetch] Failed: ${response.status} ${response.statusText}`);
        return res.json({ success: false, error: `نەتوانرا پەڕەی ${targetUrl} باربکرێت (${response.status})` });
      }

      const html = await response.text();
      // Only keep head and start of body to save tokens but retain metadata
      const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      const bodyStart = html.match(/<body[^>]*>([\s\S]{0,50000})/i);
      const smallHtml = (headMatch ? headMatch[0] : "") + (bodyStart ? bodyStart[0] : "");

      // Return HTML for client-side Gemini processing
      res.json({ success: true, html: smallHtml.substring(0, 150000) });
    } catch (err: any) {
      console.error('[Proxy Fetch Error]', err.message || err);
      res.status(200).json({ success: false, error: 'هەڵەیەک ڕوویدا لە کاتی هێنانی زانیارییەکان' });
    }
  });

  app.get('/api/admin/categories', (req, res) => {
    res.json(db.categories || []);
  });

  app.post('/api/admin/categories', async (req, res) => {
    const { name, adminName } = req.body;
    if (!name) return res.status(400).json({ error: 'ناوی پۆلێن پێویستە' });
    if (!db.categories) db.categories = [];
    if (db.categories.includes(name)) return res.status(400).json({ error: 'ئەم پۆلێنە پێشتر هەبووە' });
    db.categories.push(name);
    await addAuditLog(db, adminName, "Add Category", `کاڵا/پۆلێنی نوێ زیادکرا: "${name}"`);
    await saveDB(db);
    res.json({ success: true, categories: db.categories });
  });

  app.delete('/api/admin/categories/:name', async (req, res) => {
    const { name } = req.params;
    const adminName = req.query.adminName as string;
    
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
    const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const canDelete = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!canDelete) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! کارمەند (Staff) ناتوانێت پۆلێنەکان بسڕێتەوە.' });
    }

    if (!db.categories) db.categories = [];
    db.categories = db.categories.filter((c: string) => c !== name);
    await addAuditLog(db, adminName, "Delete Category", `پۆلێن سڕایەوە: "${name}"`);
    await saveDB(db);
    res.json({ success: true, categories: db.categories });
  });

  app.get('/api/categories', (req, res) => {
    res.json(db.categories || []);
  });

  // -------------------------------------------------------------
  // TEMPORARY FIREBASE MOCK FOR SERVER SIDE (MOCK DB & MOCK AUTH)
  // -------------------------------------------------------------
  // NOTE: This mock is for server-side endpoints that mimic Firebase interactions.
  // The frontend (App.tsx) directly uses Firebase SDK. If you intend to use real Firebase
  // for these server-side endpoints, you must replace these mocks with actual Firebase Admin SDK calls.
  class MockFirestoreDoc {

    private colName: string;
    private docId: string;
    private serverDb: any;

    constructor(colName: string, docId: string, serverDb: any) {
      this.colName = colName;
      this.docId = docId;
      this.serverDb = serverDb;
    }

    async get() {
      let data: any = null;
      if (this.colName === 'users') {
        const u = this.serverDb.users?.find((u: any) => u.uid === this.docId || u.uniqueCode === this.docId);
        if (u) data = u;
      } else if (this.colName === 'config') {
        if (this.docId === 'friends_room') {
          data = { roomVideoUrl: this.serverDb.config?.friendsRoomVideoUrl || '', videoUrl: this.serverDb.config?.friendsRoomVideoUrl || '' };
        } else if (this.docId === 'featured') {
          data = this.serverDb.heroConfig;
        } else if (this.docId === 'general') {
          data = this.serverDb.config?.general;
        }
      } else if (this.colName === 'syncGroups') {
        data = this.serverDb.syncGroups[this.docId];
      }

      return {
        // Mock Firestore DocumentSnapshot
        id: this.docId,
        exists: !!data,
        data: () => data || null
      };
    }

    async set(data: any, options?: { merge?: boolean }) {
      if (this.colName === 'users') {
        if (!this.serverDb.users) this.serverDb.users = [];
        const idx = this.serverDb.users.findIndex((u: any) => u.uid === this.docId);
        const isNew = idx === -1;
        const existing = isNew ? {} : this.serverDb.users[idx];
        const merged = (options?.merge ?? true) ? { ...existing, ...data } : { ...data };
        merged.uid = this.docId;
        if (isNew) {
          this.serverDb.users.push(merged);
        } else {
          this.serverDb.users[idx] = merged;
        }
      } else if (this.colName === 'config') {
        if (this.docId === 'friends_room') {
          this.serverDb.friendsRoomVideoUrl = data.videoUrl || data.roomVideoUrl || '';
        } else if (this.docId === 'general') {
          if (!this.serverDb.config) this.serverDb.config = {};
          this.serverDb.config.general = { ...this.serverDb.config.general, ...data };
        } else if (this.docId === 'featured') {
          if (!this.serverDb.heroConfig) this.serverDb.heroConfig = {};
          this.serverDb.heroConfig = { ...this.serverDb.heroConfig, ...data };
        }
      } else if (this.colName === 'syncGroups') {
        if (!this.serverDb.syncGroups) this.serverDb.syncGroups = {};
        this.serverDb.syncGroups[this.docId] = (options?.merge ?? true) ? { ...this.serverDb.syncGroups[this.docId], ...data } : { ...data };
      }
      if (typeof saveDB === 'function') {
        await saveDB(this.serverDb);
      }
    }

    async update(data: any) {
      await this.set(data, { merge: true });
    }

    async delete() {
      if (this.colName === 'users') {
        this.serverDb.users = this.serverDb.users?.filter((u: any) => u.uid !== this.docId) || [];
      } else if (this.colName === 'syncGroups') {
        if (this.serverDb.syncGroups) {
          delete this.serverDb.syncGroups[this.docId];
        }
      }
      if (typeof saveDB === 'function') {
        await saveDB(this.serverDb);
      }
    }

  }

  class MockFirestoreCollection {
    private colName: string;
    private serverDb: any;

    constructor(colName: string, serverDb: any) {
      this.colName = colName;
      this.serverDb = serverDb;
    }

    doc(id: string) {
      return new MockFirestoreDoc(this.colName, id, this.serverDb);
    }

    where(field: string, op: string, value: any): any {
      return {
        get: async () => {
          let matched: any[] = [];
          if (this.colName === 'users') {
            matched = this.serverDb.users?.filter((u: any) => {
              let val = u[field];
              // Handle case-insensitive uniqueCode lookup
              if (field === 'uniqueCode' && typeof val === 'string' && typeof value === 'string') {
                val = val.toUpperCase();
                value = value.toUpperCase();
                // Also handle potential prefixes like 'CC-CC-' vs 'CC-'
                if (value.startsWith('CC-CC-')) value = value.replace('CC-CC-', 'CC-');
                if (val.startsWith('CC-CC-')) val = val.replace('CC-CC-', 'CC-');
              }
              if (op === '==') return val === value;
              return false;
            }) || [];
          }
          return {
            docs: matched.map(m => ({
              id: m.uid || m.uniqueCode || 'unknown',
              data: () => m,
              ref: new MockFirestoreDoc(this.colName, m.uid || m.uniqueCode || 'unknown', this.serverDb)
            })),
            forEach: (cb: any) => {
              matched.forEach(m => cb({
                id: m.uid || m.uniqueCode || 'unknown',
                data: () => m,
                ref: new MockFirestoreDoc(this.colName, m.uid || m.uniqueCode || 'unknown', this.serverDb)
              }));
            }
          };
        }
      };
    }

    async get() {
      let list: any[] = [];
      if (this.colName === 'users') {
        list = this.serverDb.users || [];
      } else if (this.colName === 'invitations') {
        list = this.serverDb.invitations || [];
      }
      return {
        docs: list.map(m => ({
          id: m.uid || m.uniqueCode || 'unknown',
          data: () => m,
          ref: new MockFirestoreDoc(this.colName, m.uid || m.uniqueCode || 'unknown', this.serverDb)
        })),
        forEach: (cb: any) => {
          list.forEach(m => cb({
            id: m.uid || m.uniqueCode || 'unknown',
            data: () => m,
            ref: new MockFirestoreDoc(this.colName, m.uid || m.uniqueCode || 'unknown', this.serverDb)
          }));
        }
      };
    }
  }

  class MockFirestore {
    private serverDb: any;
    constructor(serverDb: any) {
      this.serverDb = serverDb;
    }
    collection(name: string) {
      return new MockFirestoreCollection(name, this.serverDb);
    }
  }

  class MockAdminAuth {
    async createUser(data: any) {
      const uid = 'mock_auth_uid_' + Math.random().toString(36).substring(2, 10);
      return { uid };
    }
    async createCustomToken(uid: string) {
      return 'mock_custom_token_' + uid;
    }
  }

  let adminDbInstance: any = null;

  function getAdminDb() {
    if (!adminDbInstance) {
      adminDbInstance = new MockFirestore(db);
      console.log("[Firestore Sync] Mock Firestore is activated. Bypassing real Firebase server.");
    }
    return adminDbInstance;
  }

  let adminAuthInstance: any = null;

  function getAdminAuthService() {
    if (!adminAuthInstance) {
      adminAuthInstance = new MockAdminAuth();
      console.log("[Firebase Auth] Mock Auth Service is activated. Bypassing real Firebase server.");
    }
    return adminAuthInstance;
  }

  app.post('/api/auth/register-by-id', async (req, res) => {
    const { name, email, password, uniqueCode, phone, age, gender, residence, country } = req.body;
    try {
      const adminAuth = getAdminAuthService();
      const adminDb = getAdminDb();
      if (!adminAuth || !adminDb) {
        return res.status(500).json({ success: false, error: 'Auth or DB service not available' });
      }

      // Check if user already exists in Firestore by phone/uniqueCode
      const usersRef = adminDb.collection('users'); // Uses MockFirestoreCollection
      const querySnapshot = await usersRef.where('uniqueCode', '==', uniqueCode).get();
      if (!querySnapshot.empty) {
        return res.status(400).json({ success: false, error: 'ئەم بەکارهێنەرە پێشتر هەیە!' });
      }

      // Create Firebase Auth user
      const userRecord = await adminAuth.createUser({
        email: email || `${uniqueCode.toLowerCase()}@cinemachat.local`,
        password: password,
        displayName: name
      });

      // Save to Firestore
      await adminDb.doc('users', userRecord.uid).set({ // Uses MockFirestoreDoc
        uid: userRecord.uid,
        name,
        phone,
        email: userRecord.email,
        uniqueCode,
        isOnline: true,
        createdAt: new Date().toISOString(),
        age,
        gender,
        residence,
        country,
        role: 'user',
      });

      // Save locally to db.users in db.json for admin view with credentials
      if (!db.users) db.users = [];
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      
      const existsIdx = db.users.findIndex((u: any) => u.uid === userRecord.uid || (u.uniqueCode && u.uniqueCode.toUpperCase() === uniqueCode.toUpperCase()));
      const newUserObj = {
        uid: userRecord.uid,
        name,
        username: name,
        phone: phone || "",
        email: userRecord.email,
        uniqueCode,
        createdAt: new Date().toISOString(),
        deviceIp: clientIp,
        ip: clientIp,
        password: password || "Cc_CinemaChat123",
        role: 'user',
        active: true,
        kicked: false,
        age: age || "",
        gender: gender || "",
        residence: residence || "",
        country: country || ""
      };

      if (existsIdx !== -1) {
        db.users[existsIdx] = { ...db.users[existsIdx], ...newUserObj };
      } else {
        db.users.push(newUserObj);
      }

      logUserActivity(db, uniqueCode, "Register", `هەژمارێکی نوێی تۆمارکرد بەناوی "${name}"`, clientIp);
      await saveDB(db);

      // Create Custom Token
      const customToken = await adminAuth.createCustomToken(userRecord.uid);
      
      return res.json({ success: true, customToken });
    } catch (err: any) {
      console.error("[ID Register] Failed details:", err);
      return res.status(500).json({ success: false, error: err.message, code: err.code });
    }
  });

  app.post('/api/auth/login-by-id', async (req, res) => {
    const { uniqueCode } = req.body;
    if (!uniqueCode || typeof uniqueCode !== 'string') {
      return res.status(400).json({ success: false, error: 'ناسنامەی چوونە ژوورەوە پێویستە' });
    }

    try {
      const adminDb = getAdminDb();
      if (!adminDb) {
        console.error("Firestore Admin database not available during login-by-id query");
        return res.status(500).json({ success: false, error: 'Database not available' });
      }

      const adminAuth = getAdminAuthService();
      if (!adminAuth) {
        console.error("Firebase Admin Auth service not available during login-by-id query");
        return res.status(500).json({ success: false, error: 'Auth service not available' });
      }

      // 1. Normalize uniqueCode
      let cleanInput = uniqueCode.replace(/[\s\s]+/g, '').replace(/\s/g, '').toUpperCase();
      // Replace duplicate dashes
      cleanInput = cleanInput.replace(/-+/g, '-');
      // If prefix is CC-CC-, replace with CC-
      cleanInput = cleanInput.replace(/^CC-CC-/, 'CC-');

      console.log(`[ID Auth] Looking up uniqueCode. Raw: "${uniqueCode}", Clean: "${cleanInput}"`);

      // 2. Database Lookup
      const usersRef = adminDb.collection('users'); // Uses MockFirestoreCollection
      let querySnapshot = await usersRef.where('uniqueCode', '==', cleanInput).get();

      // If not found, try lookup with original trimmed upper
      if (querySnapshot.empty) {
        const upperTrimmed = uniqueCode.trim().toUpperCase();
        if (upperTrimmed !== cleanInput) {
          querySnapshot = await usersRef.where('uniqueCode', '==', upperTrimmed).get();
        }
      }

      // If still empty, check if they typed without 'CC-' prefix
      if (querySnapshot.empty) {
        let normalizedNoPrefix = cleanInput;
        if (cleanInput.startsWith('CC-')) {
          normalizedNoPrefix = cleanInput.substring(3);
        }
        querySnapshot = await usersRef.where('uniqueCode', '==', 'CC-' + normalizedNoPrefix).get();
      }

      if (querySnapshot.empty) {
        console.warn(`[ID Auth] User not found for code: "${uniqueCode}"`);
        return res.status(404).json({ success: false, error: 'ئەم کۆدەی ID-یە هەڵەیە، تکایە جارێکی تر هەوڵ بدە' });
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const uid = userDoc.id;

      // Create custom token using mock auth
      const customToken = await adminAuth.createCustomToken(uid);

      console.log(`[ID Auth] Successfully authenticated user: ${userData.name || uid} via uniqueCode: ${userData.uniqueCode}`);

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      logUserActivity(db, userData.uniqueCode, "Login", `کۆدی بێهاوتا بە سەرکەوتوویی داخل کرا و چوونە ژوورەوە ئەنجامدرا`, clientIp);
      await saveDB(db);

      return res.json({
        success: true,
        customToken,
        user: {
          uid,
          name: userData.name,
          email: userData.email,
          uniqueCode: userData.uniqueCode,
          role: userData.role || 'user'
        }
      });
    } catch (err: any) {
      console.error("[ID Auth] Login by ID logic failed with error:", err);
      return res.status(500).json({ success: false, error: `هەڵەی کاتی سێرڤەر: ${err.message || err}`, code: err.code });
    }
  });

  app.post('/api/admin/verify-secret-login', async (req, res) => {
    const { phone, password, name } = req.body;
    const sysSecret = process.env.ADMIN_SECRET_KEY || "RebarSarkawtAdmin2026!";
    
    const inputMatchesSecret = 
      (phone && String(phone).trim() === sysSecret) || 
      (password && String(password).trim() === sysSecret) || 
      (name && String(name).trim() === sysSecret);

    if (!inputMatchesSecret) {
      return res.json({ isSecret: false });
    }

    try {
      const displayName = (name && String(name).trim() !== sysSecret) ? name : "Admin User";
      const usePhone = (phone && String(phone).trim() !== sysSecret) ? phone : "07701966640";

      // Return isSecret: true status, directing client-side code to perform the registration/login safely
      // and call the Firestore direct update promotion endpoint (/api/admin/promote-with-secret)
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
      await addAuditLog(db, displayName, "Login Secret Match Tried", `هەوڵی چوونەژوورەوەی ئەدمین بە کۆدی نهێنی.`);
      await saveDB(db);

      res.json({
        isSecret: true,
        requiresClientAuth: true,
        displayName,
        phone: usePhone,
        adminUser: { username: displayName, isSuper: true, isOwner: true, role: 'super_admin', ROLE_SUPER_ADMIN: true }
      });
    } catch (err: any) {
      console.error("Secret login verification failed:", err);
      res.status(500).json({ success: false, message: `هەڵەیەک ڕوویدا: ${err.message || err}` });
    }
  });

  app.post('/api/admin/promote-with-secret', async (req, res) => {
    const { secret, uid, phone, name } = req.body;
    const sysSecret = process.env.ADMIN_SECRET_KEY || "RebarSarkawtAdmin2026!";
    
    if (secret !== sysSecret) {
      return res.status(401).json({ success: false, message: "کۆدی نهێنی هەڵەیە!" });
    }

    try {
      const dbInstance = getAdminDb();
      if (!dbInstance) {
        return res.status(500).json({ success: false, message: "داتابەیس بەردەست نییە لە سێرڤەر." });
      }

      if (uid) {
        const userRef = dbInstance.doc('users', uid); // Uses MockFirestoreDoc
        const docSnap = await userRef.get();
        const existingData = docSnap.exists ? docSnap.data() : {};

        const updatedData = {
          ...existingData,
          uid: uid,
          role: 'super_admin',
          userRole: 'super_admin',
          updatedAt: new Date().toISOString()
        };
        if (!existingData.name && name) updatedData.name = name;
        if (!existingData.phone && phone) updatedData.phone = phone;
        if (!existingData.createdAt) updatedData.createdAt = new Date().toISOString();
        if (!existingData.uniqueCode) {
          updatedData.uniqueCode = `CC-ADM-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        await userRef.set(updatedData, { merge: true });
        console.log(`User ${uid} successfully promoted to super_admin in Firestore.`);
      }

      const displayName = name || "Admin User";
      if (!db.admins) db.admins = [];
      const hasAdmin = db.admins.find((a: any) => a.username?.toLowerCase() === displayName.toLowerCase());
      if (!hasAdmin) {
        db.admins.push({
          username: displayName,
          password: crypto.randomBytes(8).toString('hex'),
          isSuper: true,
          role: 'super_admin'
        });
      } else {
        hasAdmin.role = 'super_admin';
        hasAdmin.isSuper = true;
      }

      await addAuditLog(db, displayName, "Role Promotion via Key", `سەرکەوتووانە ڕۆڵی یوزەر گۆڕدرا بۆ ئەدمینی گشتی (Super Admin) لە ڕێگەی کۆدی نهێنی.`);
      await saveDB(db);

      res.json({
        success: true,
        message: "پلەکەت کرا بە ئەدمینی گشتی بە سەرکەوتوویی!",
        adminUser: { username: displayName, isSuper: true, isOwner: true, role: 'super_admin', ROLE_SUPER_ADMIN: true }
      });
    } catch (err: any) {
      console.error("Admin promotion failed:", err);
      res.status(500).json({ success: false, message: `خراپ بەڕێوەچوو: ${err.message || err}` });
    }
  });

  app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const identity = getClientIdentity(req);
    const cleanIp = identity.ip;
    const cleanDeviceId = identity.deviceId;

    // Perform check first: is this device/IP already banned? Owner-whitelisted
    // identities get the 1-minute temporary-block exemption instead of a
    // permanent rejection. Auto-bans target the device fingerprint, so one
    // blocked device never blocks the whole site / other users on the same IP.
    const deviceBanned = cleanDeviceId ? isDeviceBanned(cleanDeviceId) : false;
    const ipBanned = isIpBanned(cleanIp);
    const isBanned = deviceBanned || ipBanned;
    if (isBanned) {
      if (deviceBanned) {
        const exemption = evaluateOwnerBlock(cleanDeviceId, true);
        if (exemption.exempt) {
          if (exemption.remainingMs > 0) {
            return res.status(403).json({
              success: false,
              ownerExempt: true,
              unblockAt: new Date(exemption.unblockAt || Date.now()).toISOString(),
              message: 'ئەم ئامێرە کاتییە بلۆک کراوە بۆ خاوەنی سیستەم — دەکرێتەوە بە خۆکاری دوای ١ خولەک.'
            });
          }
          // Auto-unblocked already — fall through and allow the login attempt.
        } else {
          return res.status(403).json({ success: false, message: 'تۆ بلۆک کراویت لەم سیستمەدا.' });
        }
      } else {
        const exemption = evaluateOwnerBlock(cleanIp, false);
        if (exemption.exempt) {
          if (exemption.remainingMs > 0) {
            return res.status(403).json({
              success: false,
              ownerExempt: true,
              unblockAt: new Date(exemption.unblockAt || Date.now()).toISOString(),
              message: 'ئەم ئایپیە کاتییە بلۆک کراوە بۆ خاوەنی سیستەم — دەکرێتەوە بە خۆکاری دوای ١ خولەک.'
            });
          }
          // Auto-unblocked already — fall through and allow the login attempt.
        } else {
          return res.status(403).json({ success: false, message: 'تۆ بلۆک کراویت لەم سیستمەدا.' });
        }
      }
    }

    const inputPassword = String(password || '');
    const hashedPassInput = crypto.createHash('sha256').update(inputPassword).digest('hex');
    const sysSecret = process.env.ADMIN_SECRET_KEY || "RebarSarkawtAdmin2026!";
    const isSecretPassword = inputPassword === sysSecret;

    const cleanLoginUsername = String(username || '').trim().toLowerCase();
    // Owner usernames — the ONLY identities allowed to fall back to the master
    // secret key. Never grant sub-admin/staff usernames the master bypass.
    const OWNER_USERNAMES = ['admin', 'dekan@123'];

    // verifyStoredPassword authenticates a password against a SINGLE account's
    // OWN stored credential only (legacy plaintext, legacy sha256, or bcrypt).
    // This is deliberately strict: once an admin record exists, only its own
    // unique password can unlock it — the Owner's master secret key must never
    // authenticate or elevate another account, otherwise every sub-admin would
    // effectively log in with the Owner's password (or fail with their own).
    const verifyStoredPassword = (storedPassword: string): boolean => {
      if (!storedPassword) return false;
      if (storedPassword === inputPassword || storedPassword === hashedPassInput) return true;

      const isBcrypt =
        storedPassword.startsWith('$2a$') ||
        storedPassword.startsWith('$2b$') ||
        storedPassword.startsWith('$2y$');
      if (!isBcrypt) return false;

      try {
        return bcrypt.compareSync(inputPassword, storedPassword);
      } catch {
        // Malformed/legacy hash — never a silent login; treat as mismatch.
        return false;
      }
    };

    // Step 1 — authenticate against the account's OWN stored password.
    let admin = db.admins.find((a: any) => String(a?.username || '').trim().toLowerCase() === cleanLoginUsername);

    if (admin && !verifyStoredPassword(String(admin.password || ''))) {
      // Wrong password for an existing account — reject. Do NOT fall through to
      // the secret-key path: existing accounts can only ever use their own key.
      admin = null;
    }

    // Step 2 — Owner-only master-secret fallback for the platform owner when no
    // account record exists yet. Never persists a fake record with an unknown
    // password, and never applies to sub-admin/staff usernames.
    if (!admin && isSecretPassword && OWNER_USERNAMES.includes(cleanLoginUsername)) {
      admin = { username: cleanLoginUsername, isSuper: true, isOwner: true, role: 'owner' };
    }

    if (admin) {
      failedLoginCounts[identity.key] = 0;

      // Whitelist the Owner's IP/device after a verified Owner login so any
      // accidental future block (bad creds testing, security rules) is only a
      // temporary 1-minute exemption, never a permanent ban for the owner.
      const ownerName = String(admin.username || '').toLowerCase();
      if (ownerName === "admin" || ownerName === "dekan@123") {
        whitelistOwnerIp(cleanIp);
        if (cleanDeviceId) whitelistOwnerDevice(cleanDeviceId);
      }

      await addAuditLog(db, admin.username, "Login Successful", `دەستپێکردنی دانیشتن لە ڕێگەی ئایپی ${cleanIp}`);
      await saveDB(db);

      // The assigned role is ALWAYS derived from the account itself. An owner
      // account resolves to "owner" regardless of stored drift; a sub-admin
      // keeps exactly the role that was assigned to it at creation time — the
      // secret key can no longer silently upgrade a staff/deputy account.
      let responseRole = admin.role || (admin.isSuper ? "deputy_manager" : "staff");
      if (ownerName === "admin" || ownerName === "dekan@123") {
        responseRole = "owner";
      }

      const isSuperAdmin = responseRole === "ROLE_SUPER_ADMIN" || responseRole === "super_admin" || responseRole === "owner";
      const isOwner = ownerName === "admin" || ownerName === "dekan@123" || responseRole === "owner";

      res.json({ 
        success: true, 
        user: { 
          username: admin.username, 
          isSuper: admin.isSuper || isSuperAdmin, 
          isOwner,
          role: responseRole,
          ROLE_SUPER_ADMIN: isSuperAdmin
        },
        admin: { 
          username: admin.username, 
          isSuper: admin.isSuper || isSuperAdmin, 
          isOwner,
          role: responseRole,
          ROLE_SUPER_ADMIN: isSuperAdmin
        }
      });
    } else {
      const loc = getIpLocation(cleanIp);
      const timestamp = new Date().toISOString();
      
      // Log to secure audit_security.log file
      logFailedAttempt("Invalid Login Attempt", `Username tried: "${username || 'Unknown'}" from IP: ${cleanIp} (Loc: ${loc})`);

      if (!db.failedLoginAttempts) db.failedLoginAttempts = [];
      db.failedLoginAttempts.unshift({
        ip: cleanIp,
        username: username || "Unknown",
        location: loc,
        timestamp
      });
      if (db.failedLoginAttempts.length > 500) {
        db.failedLoginAttempts = db.failedLoginAttempts.slice(0, 500);
      }

      failedLoginCounts[identity.key] = (failedLoginCounts[identity.key] || 0) + 1;
      
      let bannedStatus = false;
      let ownerTempBan = false;
      if (failedLoginCounts[identity.key] >= 5) {
        // Auto-ban the DEVICE fingerprint when the browser sent one (isolating
        // that single device, never the shared IP / whole site). Only clients
        // that send NO device id (curl, scripts, legacy) fall back to an IP ban.
        if (cleanDeviceId) {
          recordBanDevice(cleanDeviceId, {
            ip: cleanIp,
            device: (req.headers['user-agent'] as string || '').slice(0, 150),
            reason: '5 failed admin login attempts'
          });
          bannedStatus = true;
          ownerTempBan = isOwnerWhitelisted(cleanDeviceId);
          await addAuditLog(db, "SYSTEM_AUTO_BAN", "Auto Device Ban", `بلۆکی ئۆتۆماتیکیی ئامێر ${cleanDeviceId} بەهۆی ٥ هەوڵی شکستخواردووی چوونەژوورەوە (IP: ${cleanIp}).`);
        } else {
          if (!db.bannedIps) db.bannedIps = [];
          if (!db.bannedIps.includes(cleanIp)) {
            db.bannedIps.push(cleanIp);
            recordBanTime(cleanIp);
            bannedStatus = true;
            // Whitelisted owner IPs only get a 1-minute temporary block and
            // auto-unblock afterwards; normal IPs stay permanently banned.
            ownerTempBan = isOwnerWhitelisted(cleanIp);
            await addAuditLog(db, "SYSTEM_AUTO_BAN", "Auto IP Ban", `بلۆکی ئۆتۆماتیکیی ئایپی ${cleanIp} بەهۆی ٥ هەوڵی شکستخواردووی چوونەژوورەوە.`);
          }
        }
      }
      
      await saveDB(db);
      res.status(401).json({ 
        success: false, 
        message: bannedStatus 
          ? (ownerTempBan
              ? 'ئەم ئایپیە بۆ خاوەنی سیستەم کاتییە بلۆک کراوە — دەکرێتەوە بە خۆکاری دوای ١ خولەک.'
              : 'ئەم ئایپیە بلۆک کرا بە شێوەیەکی کاتی بەهۆی زۆری هەوڵە شکستخواردووەکان (٥ شکست).')
          : 'ناوی بەکارهێنەر یان وشەی تێپەڕ هەڵەیە' 
      });
    }
  });

  app.get('/api/admin/users', (req, res) => {
    res.json(db.admins.map((a: any) => ({ 
      username: a.username, 
      isSuper: !!a.isSuper,
      role: a.role || (a.isSuper ? "deputy_manager" : "staff")
    })));
  });

  // Module 17 role hierarchy — HIGHER number = MORE privilege. Every create /
  // delete / password-change guard below is derived from these levels so a user
  // can never escalate their own privileges or touch accounts at or above their
  // own level (except changing their own password).
  const ROLE_LEVEL: Record<string, number> = { owner: 4, super_admin: 3, deputy_manager: 2, staff: 1 };
  const roleLevel = (admin: any): number => {
    if (!admin) return 0;
    const name = String(admin.username || '').toLowerCase();
    if (name === 'admin' || name === 'dekan@123' || admin.role === 'owner') return 4;
    return ROLE_LEVEL[admin.role || ''] || (admin.isSuper ? 2 : 1);
  };
  const requesterInfo = (req: any) => {
    const name = (req.query.adminName as string || req.headers['x-admin-username'] as string || '').trim().toLowerCase();
    const record = db.admins.find((a: any) => a.username?.toLowerCase() === name) || null;
    let level = roleLevel(record);
    if (!record && (name === 'admin' || name === 'dekan@123')) level = 4;
    return { name, record, level };
  };
  const VALID_ROLES = ['staff', 'deputy_manager', 'super_admin'];

  app.post('/api/admin/users', async (req, res) => {
    const { username, password, isSuper, role } = req.body || {};
    const requester = requesterInfo(req);
    if (requester.level < 2) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! تەنها خاوەن سەرپەرشتیار (dekan@123 یان بەڕێوەبەری سەرەکی کەنالەکە) دەتوانێت ئەدمین بەڕێوەببات.' });
    }

    // Input validation — strict length + charset, never expose internals
    const safeUsername = String(username || '').trim();
    const safePassword = String(password || '');
    if (!safeUsername || !safePassword) return res.status(400).json({ error: 'ناوی بەکارهێنەر و وشەی تێپەڕ پێویستن' });
    if (safeUsername.length < 3 || safeUsername.length > 32) return res.status(400).json({ error: 'ناوی بەکارهێنەر دەبێت ٣ بۆ ٣٢ پیت بێت' });
    if (!/^[a-zA-Z0-9_.-]+$/.test(safeUsername)) return res.status(400).json({ error: 'ناوی بەکارهێنەر تەنها پیتی ئینگلیزی، ژمارە و _ . - پەسەندە' });
    if (safePassword.length < 6) return res.status(400).json({ error: 'وشەی تێپەڕ دەبێت لە کەمتر نەبێت لە ٦ هێما' });
    if (safePassword.length > 128) return res.status(400).json({ error: 'وشەی تێپەڕ زۆر درێژە' });

    if (db.admins.some((a: any) => a.username?.toLowerCase() === safeUsername.toLowerCase())) {
      return res.status(400).json({ error: 'ئەم ناوە پێشتر بەکارهاتووە' });
    }

    // Map the requested role onto a safe allow-list and enforce hierarchy: you
    // can only create accounts with STRICTLY less privilege than your own.
    const requestedRole = VALID_ROLES.includes(role) ? role : (isSuper ? 'deputy_manager' : 'staff');
    const requestedLevel = ROLE_LEVEL[requestedRole] || 1;
    if (requestedLevel >= requester.level) {
      return res.status(403).json({ error: 'ناتوانیت ئەدمین بە ئاستی یەکسان یان بەرزتر لە خۆت دروست بکەیت' });
    }

    const secureHashedPassword = bcrypt.hashSync(safePassword, 10);

    db.admins.push({ 
      username: safeUsername, 
      password: secureHashedPassword, 
      isSuper: requestedRole === 'deputy_manager' || requestedRole === 'super_admin',
      role: requestedRole
    });

    // Secure Alert system: automatically notify the owner whenever a new admin is created
    if (!db.ownerNotifications) db.ownerNotifications = [];
    db.ownerNotifications.unshift({
      id: `notif-${Date.now()}`,
      message: `🔔 ئاگاداری گرنگ: خۆکارانە ئەکاونتی ئەدمینی نوێ بە ناوی [${safeUsername}] وەک [${requestedRole}] لەلایەن [${requester.name || "خاوەنکار"}] دروستکرا لە بەگی داتابەیس.`,
      timestamp: new Date().toISOString(),
      read: false
    });

    await addAuditLog(db, requester.name || 'system', "Create Admin", `ئەدمینی نوێ دروستکرا: "${safeUsername}" وەک "${requestedRole}"`);
    await saveDB(db);
    res.json({ success: true });
  });

  app.delete('/api/admin/users/:username', async (req, res) => {
    const { username } = req.params;
    const requester = requesterInfo(req);
    if (requester.level < 2) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! تەنها خاوەن سەرپەرشتیار (dekan@123 یان بەڕێوەبەر) دەتوانێت ئەدمین بسڕێتەوە.' });
    }

    const targetName = String(username || '').trim().toLowerCase();
    const target = db.admins.find((a: any) => a.username?.toLowerCase() === targetName);
    if (!target) return res.status(404).json({ error: 'ئەم ئەدمینە نەدۆزرایەوە' });

    if (requester.name === targetName) return res.status(400).json({ error: 'تۆ ناتوانیت ئەکاونتی خۆت بسڕیتەوە' });
    if (targetName === 'admin' || targetName === 'dekan@123') return res.status(400).json({ error: 'ناتوانرێت ئەدمینی سەرەکی بسڕدرێتەوە' });

    // Can never delete an account at or above your own privilege level
    if (roleLevel(target) >= requester.level) {
      return res.status(403).json({ error: 'ناتوانیت ئەدمین بە ئاستی یەکسان یان بەرزتر لە خۆت بسڕیتەوە' });
    }

    db.admins = db.admins.filter((a: any) => a.username?.toLowerCase() !== targetName);
    await addAuditLog(db, requester.name || 'system', "Delete Admin", `ئەدمینی سڕایەوە: "${target.username}"`);
    await saveDB(db);
    res.json({ success: true });
  });

  // --- ADMIN MODULE 17: MULTI-LEVEL ADMIN AUTHORIZATION SYSTEM ENDPOINTS ---
  app.get('/api/admin/m17/status', async (req, res) => {
    const requester = (req.query.adminName as string || req.headers['x-admin-username'] as string || '').trim().toLowerCase();
    
    // Strict Route Guard for Module 17
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === requester);
    const requesterRole = adminRecord?.role || (requester === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const isAuthorized = requester === 'dekan@123' || requester === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!isAuthorized) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! تەنها خاوەن سەرپەرشتیاری باڵا (dekan@123 یان بەڕێوەبەر) دەتوانێت بچێتە ناو بەشی ڕێگەپێدانی ئاستەکان.' });
    }

    res.json({
      success: true,
      admins: db.admins.map((a: any) => ({
        username: a.username,
        isSuper: !!a.isSuper,
        isOwner: roleLevel(a) >= 4,
        role: a.role || (a.isSuper ? "deputy_manager" : "staff")
      })),
      notifications: db.ownerNotifications || [],
      systemStats: {
        totalAdmins: db.admins.length,
        superAdmins: db.admins.filter((a: any) => roleLevel(a) >= 3).length,
        deputyManagers: db.admins.filter((a: any) => roleLevel(a) === 2).length,
        staff: db.admins.filter((a: any) => roleLevel(a) === 1).length,
      }
    });
  });

  app.post('/api/admin/m17/admins/password', async (req, res) => {
    const requester = requesterInfo(req);
    if (requester.level < 2) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! تەنها خاوەن سەرپەرشتیاری باڵا (dekan@123 یان super_admin) دەتوانێت وشەی تێپەڕی ئەدمینەکان بگۆڕێت.' });
    }

    const { targetUsername, newPassword, isSuper } = req.body || {};
    const targetName = String(targetUsername || '').trim().toLowerCase();
    const adminIndex = db.admins.findIndex((a: any) => a.username?.toLowerCase() === targetName);

    if (adminIndex === -1) {
      return res.status(404).json({ error: 'ئەم ئەدمینە نەدۆزرایەوە.' });
    }

    const target = db.admins[adminIndex];
    // You may always reset your own password, or the password of an account
    // with strictly less privilege — never the platform owner's password.
    if (requester.name !== targetName) {
      if (targetName === 'admin' || targetName === 'dekan@123') {
        return res.status(403).json({ error: 'ناتوانیت وشەی تێپەڕی خاوەن پلاتفۆرم بگۆڕیت' });
      }
      if (roleLevel(target) >= requester.level) {
        return res.status(403).json({ error: 'ناتوانیت وشەی تێپەڕی ئەدمین بە ئاستی یەکسان یان بەرزتر لە خۆت بگۆڕیت' });
      }
    }

    // Securely hash the password if provided (bcrypt)
    const safeNewPassword = String(newPassword || '');
    if (safeNewPassword) {
      if (safeNewPassword.length < 6) return res.status(400).json({ error: 'وشەی تێپەڕ دەبێت لە کەمتر نەبێت لە ٦ هێما' });
      if (safeNewPassword.length > 128) return res.status(400).json({ error: 'وشەی تێپەڕ زۆر درێژە' });
      db.admins[adminIndex].password = bcrypt.hashSync(safeNewPassword, 10);
    }

    // Only privileged admins may change the privilege flag of another account
    if (isSuper !== undefined && requester.level >= 3) {
      db.admins[adminIndex].isSuper = !!isSuper;
    }

    await addAuditLog(db, requester.name || 'system', "Modify Admin Credentials", `دەسەڵات یان پاسوۆرد گۆڕدرا بۆ ئەدمینی "${target.username}"`);
    await saveDB(db);
    res.json({ success: true, message: 'ڕێکخستنەکان بە سەرکەوتوویی نوێکرانەوە ✓' });
  });

  app.post('/api/admin/m17/notifications/clear', async (req, res) => {
    const requester = requesterInfo(req);
    if (requester.level < 3) {
      return res.status(403).json({ error: 'کردارەکە ڕەتکرایەوە چونکە دەسەڵاتی پێویستت نییە!' });
    }

    db.ownerNotifications = [];
    await saveDB(db);
    res.json({ success: true, message: 'ئاگادارییەکان پاککرانەوە ✓' });
  });

  // --- NEW USER MANAGEMENT ENDPOINTS ---
  
  app.post('/api/users/sync', async (req, res) => {
    const userData = req.body;
    if (!userData || !userData.uid) return res.status(400).json({ error: 'Data required' });
    
    // Capture IP precisely
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || req.ip || "Unknown";
    
    // Rate Limiting Guard (Point 1: Ensure max 3 submits/syncs per minute)
    const now = Date.now();
    if (!syncRateLimits[clientIp]) {
      syncRateLimits[clientIp] = [];
    }
    syncRateLimits[clientIp] = syncRateLimits[clientIp].filter(ts => now - ts < 60000);
    if (syncRateLimits[clientIp].length >= 3) {
      console.warn(`[Sync Rate Limit] Rate limited request from IP: ${clientIp}`);
      return res.status(429).json({ error: 'چاوەڕوان بە! ناتوانیت لە خولەکێکدا زیاتر لە ٣ جار داخڵکردن یان هاوکاتکردن بکەیت.' });
    }
    syncRateLimits[clientIp].push(now);

    // Input Sanitization (Point 1: Strip html and script tags)
    if (userData.name) {
      userData.name = userData.name.replace(/<\/?[^>]+(>|$)/g, "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").trim();
    }

    if (!db.users) db.users = [];
    
    const index = db.users.findIndex((u: any) => u.uid === userData.uid);
    const updatedUser = { 
      ...userData, 
      deviceIp: clientIp, 
      lastActive: new Date().toISOString()
    };

    if (index !== -1) {
      // Check if user was kicked
      if (db.users[index].kicked) {
        return res.json({ success: true, user: { ...db.users[index], ...updatedUser, kicked: true } });
      }
      db.users[index] = { ...db.users[index], ...updatedUser, active: true };
    } else {
      updatedUser.role = updatedUser.role || 'Member';
      updatedUser.active = true;
      updatedUser.kicked = false;
      db.users.push(updatedUser);
    }

    logUserActivity(db, userData.uniqueCode || "", "Sync Session", `چوونەناو و هاوکاتکردنی داتاکانی بەکارهێنەر لەگەڵ سێرڤەر`, clientIp);
    await saveDB(db);
    res.json({ success: true, user: index !== -1 ? db.users[index] : updatedUser });
  });

  app.get('/api/admin/managed-users', (req, res) => {
    if (!db.users) db.users = [];
    res.json(db.users);
  });

  app.get('/api/admin/monitored-users', (req, res) => {
    try {
      const adminName = (req.query.adminName || req.headers['x-admin-username'] || "") as string;
      const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
      const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
      
      const isAuthorized = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'staff' || requesterRole === 'owner';
      if (!isAuthorized) {
        return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! ناتوانیت ئەم زانیارییە ببینی چونکە ئەکاونتەکەت ئەدمین نییە.' });
      }

      if (!db.users) db.users = [];

      // Ensure every user has realistic fallback passwords for UI and IP values
      const enrichedUsers = db.users.map((user: any) => {
        const fallbackPass = user.password || `Cc_${user.uniqueCode?.replace(/-/g, '') || 'Pass123'}`;
        const devIp = user.deviceIp || user.ip || "192.168.1.100";
        return {
          ...user,
          password: fallbackPass,
          ip: devIp,
          deviceIp: devIp,
          username: user.username || user.name || "بەکارهێنەر"
        };
      });

      res.json(enrichedUsers);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/user-details/:uniqueCode', (req, res) => {
    try {
      const { uniqueCode } = req.params;
      const cleanCode = uniqueCode.trim().toUpperCase();
      const adminName = (req.query.adminName || req.headers['x-admin-username'] || "") as string;
      const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
      const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
      
      const isAuthorized = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'staff' || requesterRole === 'owner';
      if (!isAuthorized) {
        return res.status(403).json({ error: 'Access Denied' });
      }

      // Find user
      if (!db.users) db.users = [];
      const user = db.users.find((u: any) => (u.uniqueCode || '').trim().toUpperCase() === cleanCode);
      if (!user) {
        return res.status(404).json({ error: 'بەکارهێنەرەکە نەدۆزرایەوە' });
      }

      // 1. Full history of all messages sent by that user (DMs and Room Messages)
      if (!db.directMessages) db.directMessages = [];
      const sentDms = db.directMessages.filter((dm: any) => (dm.senderCode || '').toUpperCase() === cleanCode);

      // Room chatMessages
      const roomMsgs: any[] = [];
      const roomsObj = db.syncGroups || {};
      Object.values(roomsObj).forEach((r: any) => {
        if (r && Array.isArray(r.chatMessages)) {
          r.chatMessages.forEach((msg: any) => {
            if ((msg.userCode || '').trim().toUpperCase() === cleanCode) {
              roomMsgs.push({
                id: msg.id,
                roomName: r.name || r.id,
                text: msg.text,
                timestamp: msg.timestamp
              });
            }
          });
        }
      });

      // Combine messages sorted by timestamp
      const allMessages = [
        ...sentDms.map((dm: any) => ({
          id: dm.id,
          type: 'Direct Message',
          destination: `${dm.receiverName || 'بەکارھێنەر'} (${dm.receiverCode || ''})`,
          text: dm.message,
          timestamp: dm.timestamp
        })),
        ...roomMsgs.map((msg: any) => ({
          id: msg.id,
          type: `Room Chat (${msg.roomName})`,
          destination: msg.roomName,
          text: msg.text,
          timestamp: msg.timestamp
        }))
      ].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // 2. Full history of all activities performed by that user
      if (!db.userActivities) db.userActivities = [];
      const userActivities = db.userActivities.filter((act: any) => (act.uniqueCode || '').trim().toUpperCase() === cleanCode);

      // 3. Their registration and login metadata (IP, timestamps)
      const metadata = {
        registeredAt: user.createdAt || user.lastActive || "Unknown",
        registeredIp: user.deviceIp || user.ip || "Unknown",
        lastActive: user.lastActive || "Unknown",
        registrationDetails: {
          phone: user.phone || "بێ مۆبایل",
          email: user.email || "بێ ئیمەیڵ",
          age: user.age || "دیاری نەکراوە",
          gender: user.gender || "دیاری نەکراوە",
          residence: user.residence || "دیاری نەکراوە",
          country: user.country || "دیاری نەکراوە",
        }
      };

      res.json({
        user: {
          name: user.name,
          username: user.username || user.name,
          uniqueCode: user.uniqueCode,
          role: user.role,
          password: user.password || `Cc_${user.uniqueCode?.replace(/-/g, '') || 'Pass123'}`
        },
        messages: allMessages,
        activities: userActivities,
        metadata
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/managed-users/:uid', async (req, res) => {
    const { uid } = req.params;
    const adminName = (req.query.adminName || req.headers['x-admin-username'] || "") as string;

    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
    const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const canDelete = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!canDelete) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! کارمەند (Staff) ناتوانێت بەکارهێنەران بسڕێتەوە.' });
    }

    if (!db.users) db.users = [];
    db.users = db.users.filter((u: any) => u.uid !== uid);
    await saveDB(db);
    res.json({ success: true });
  });

  app.post('/api/admin/managed-users/kick/:uid', async (req, res) => {
    const { uid } = req.params;
    if (!db.users) db.users = [];
    const index = db.users.findIndex((u: any) => u.uid === uid);
    if (index !== -1) {
      db.users[index].active = false;
      db.users[index].kicked = true;
      db.users[index].lastKickedAt = new Date().toISOString();
      await saveDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });

  app.post('/api/admin/managed-users/role', async (req, res) => {
    const { uid, role } = req.body;
    if (!db.users) db.users = [];
    const index = db.users.findIndex((u: any) => u.uid === uid);
    if (index !== -1) {
      db.users[index].role = role;
      await saveDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });
  // -------------------------------------

  app.delete('/api/admin/movies/:id', async (req, res) => {
    const { id } = req.params;
    const adminName = (req.query.adminName || req.body.adminName || "Admin") as string;
    
    const adminRecord = db.admins.find((a: any) => a.username?.toLowerCase() === adminName?.trim().toLowerCase());
    const requesterRole = adminRecord?.role || (adminName?.trim().toLowerCase() === 'dekan@123' ? 'super_admin' : (adminRecord?.isSuper ? 'deputy_manager' : 'staff'));
    const canDelete = adminName?.trim().toLowerCase() === 'dekan@123' || adminName?.trim().toLowerCase() === 'admin' || requesterRole === 'super_admin' || requesterRole === 'deputy_manager' || requesterRole === 'owner';
    if (!canDelete) {
      return res.status(403).json({ error: 'شایستەی دەسەڵاتی پێویست نییە! کارمەند (Staff) ناتوانێت فیلمەکان بسڕێتەوە.' });
    }

    const targetMovie = db.manualMovies.find((m: any) => m.id === id);
    const movieTitle = targetMovie ? targetMovie.title : id;

    // Add to deleted IDs to prevent resync
    if (!db.deletedIds.includes(id)) {
      db.deletedIds.push(id);
    }

    // Remove from manual movies if applicable
    db.manualMovies = db.manualMovies.filter((m: any) => m.id !== id);

    await addAuditLog(db, adminName, "Delete Movie", `فیلمی پۆستکراو سڕایەوە: "${movieTitle}"`);
    await saveDB(db);
    setMoviesCache(prev => prev.filter(m => m.id !== id));
    
    res.json({ success: true });
  });

  app.patch('/api/admin/movies/:id/tags', async (req, res) => {
    const { id } = req.params;
    const rawTags: any[] = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const tags = rawTags
      .map((t: any) => (typeof t === 'string' ? t.trim() : ''))
      .filter(Boolean);

    // Firestore is the durable source of truth the client reads (movies/{id}),
    // so persist the category change there FIRST. If that write fails, do not
    // pretend success — the client keeps the previous selection on the grid.
    try {
      await saveMovieTagsToFirestore(id, tags);
    } catch (err: any) {
      console.warn(
        `[movies] Firestore tags write failed for ${id}:`,
        err?.message || err
      );
      return res.status(500).json({ success: false, error: 'Firestore update failed' });
    }

    // Mirror into the in-memory Firestore catalog cache + /api/movies cache so
    // the server response reflects the change immediately.
    if (firestoreMoviesCache[id]) {
      firestoreMoviesCache[id] = { ...firestoreMoviesCache[id], tags };
    }
    setMoviesCache(prev => prev.map(m => m.id === id ? { ...m, tags } : m));

    const manualIndex = db.manualMovies.findIndex((m: any) => m.id === id);
    if (manualIndex !== -1) {
      db.manualMovies[manualIndex].tags = tags;
      await saveDB(db);
    } else {
      if (!db.tagOverrides) db.tagOverrides = {};
      db.tagOverrides[id] = tags;
      await saveDB(db);
    }

    res.json({ success: true });
  });

  app.get('/api/syncGroups/:id', (req, res) => {
    const { id } = req.params;
    console.log(`[Sync] Reading SyncGroup: ${id}`);
    if (!db.syncGroups) db.syncGroups = {};
    if (!db.syncGroups[id]) {
      db.syncGroups[id] = {
        id,
        name: id === 'global_room_official' ? 'ژووری سەرەکی' : 'ژووری تایبەت',
        playback: { isPlaying: false, currentTime: 0, updatedAt: new Date().toISOString() }
      };
    }
    res.json(db.syncGroups[id]);
  });

  app.patch('/api/syncGroups/:id', async (req, res) => {
    const { id } = req.params;
    const update = req.body;
    if (!db.syncGroups) db.syncGroups = {};
    db.syncGroups[id] = { ...(db.syncGroups[id] || { id }), ...update };

    await saveDB(db);
    res.json({ success: true, data: db.syncGroups[id] });
  });

  app.get('/api/admin/hero', (req, res) => {
    res.json(db.heroConfig);
  });

  app.post('/api/admin/hero', async (req, res) => {
    const playlist = req.body.heroPlaylist;
    const { adminName } = req.body;
    if (playlist && Array.isArray(playlist)) {
      db.heroConfig.heroPlaylist = playlist.filter(Boolean);
      db.heroConfig.heroVideoUrl = playlist[0] || '';
      await addAuditLog(db, adminName, "Update Hero Playlist", `پلیلیستی ڤیدیۆ نوێکرایەوە`);
      await saveDB(db);
    }
    res.json({ success: true, config: db.heroConfig });
  });

  // Alias for hero update
  app.post('/api/movies/hero', async (req, res) => {
    if (!req.body) return res.status(400).json({ success: false, error: "Body is empty" });
    const playlist = req.body.heroPlaylist;
    if (playlist && Array.isArray(playlist)) {
      db.heroConfig.heroPlaylist = playlist.filter(Boolean);
      db.heroConfig.heroVideoUrl = playlist[0] || '';
      await saveDB(db);
      return res.json({ success: true, config: db.heroConfig });
    }
    res.status(400).json({ success: false, error: "heroPlaylist is required" });
  });

  app.post('/api/admin/post-movie', async (req, res) => {
    if (!req.body) {
      return res.status(400).json({ success: false, error: "Body is empty — check Content-Type header (use application/json or text/plain)" });
    }
    const { title, description, image, posterUrl, videoUrl, trailerUrl, streamingUrl, mainTrailerUrl, streamingSourceUrl, vidmolyUrl, streamwishUrl, fileLrunUrl, quality, tags, category, rating, year, type, duration } = req.body;
    
    // VALIDATION: Detailed error reporting as requested
    if (!title) return res.status(400).json({ success: false, error: "ناونیشان پێویستە (Title is required)" });
    if (!category) return res.status(400).json({ success: false, error: "پۆلێن پێویستە (Category is required)" });
    
    // Primary video source - accept ANY valid URL
    const activeVideoSource = streamingUrl || videoUrl || req.body.external_link;
    if (!activeVideoSource) return res.status(400).json({ success: false, error: "لینکی ڤیدیۆ پێویستە (Video source is required)" });

    const finalPoster = decodeStoredUrl(posterUrl || image || 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800');

    console.log(`[Admin] Posting movie: ${title} | Source: ${activeVideoSource}`);
    
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    
    // Check if the main source is YouTube
    const ytMatch = activeVideoSource?.match(ytRegex);
    const ytEmbedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}` : null;

    // Process trailer
    const trailerYtMatch = trailerUrl?.match(ytRegex);
    const trailerEmbedUrl = trailerYtMatch ? `https://www.youtube.com/embed/${trailerYtMatch[1]}` : trailerUrl;

    const newMovie = {
      id: `manual-${Date.now()}`,
      title: title,
      description: description || "",
      image: finalPoster,
      posterUrl: finalPoster,
      embedUrl: ytEmbedUrl || activeVideoSource,
      videoUrl: activeVideoSource,
      trailerUrl: trailerEmbedUrl,
      mainTrailerUrl: mainTrailerUrl || "",
      streamingSourceUrl: streamingSourceUrl || "",
      streamingUrl: activeVideoSource,
      vidmolyUrl: vidmolyUrl || "",
      streamwishUrl: streamwishUrl || "",
      fileLrunUrl: fileLrunUrl || "",
      external_link: activeVideoSource,
      isYouTube: !!ytEmbedUrl,
      quality: quality || 'HD',
      date: new Date().toISOString(),
      isNetflixOriginal: title?.toLowerCase().includes('netflix'),
      tags: Array.isArray(tags) ? tags : [category || "هەمووی"],
      category: category || "هەمووی",
      rating: rating || "",
      year: year || "",
      duration: typeof duration === 'string' ? duration.trim() : "",
      type: type || "movie",
      likes: 0,
      likedBy: [],
      views: 0,
      whatsappLink: 'https://chat.whatsapp.com/Cinmachat'
    };

    try {
      // Admin save: local only
    } catch (e: any) {
      console.error('CRITICAL: Local save failed:', e.message || e);
    }

    const adminName = req.body.adminName || "Admin";
    db.manualMovies.push(newMovie);
    await addAuditLog(db, adminName, "Post Movie", `فیلمی نوێ زیادکرا: "${newMovie.title}"`);
    await saveDB(db);
    // Add to cache while preventing duplicates
    setMoviesCache(prev => [newMovie, ...prev.filter(m => m.id !== newMovie.id)]);
    res.json({ success: true, movie: newMovie });
  });

  // CRITICAL: WhatsApp Automation Webhook
  // This endpoint is used by external automation tools to post movies via WhatsApp Channel
  app.post('/api/webhooks/whatsapp', async (req, res) => {
    try {
      const { sender, text, secret } = req.body;
      const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || 'Cinemachat_Secure_2024';
      const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER || '9647701966649';
      // 2. Security Check: Admin number enforcement (handling with/without +)
      const normalizedSender = String(sender).replace(/\D/g, '');
      const normalizedAdmin = adminNumber.replace(/\D/g, '');

      // 1. Security Check: Secret verification
      if (secret !== webhookSecret) {
        console.warn(`[Webhook Security] Unauthorized attempt from: ${sender}`);
        await addIntrusionAttempt(db, normalizedSender, req.url, "Unauthorized WhatsApp Webhook Access", "Webhook Security Breach"); // Added
        return res.status(401).json({ error: 'Unauthorized webhook access' });
      }

      if (normalizedSender !== normalizedAdmin) {
        console.warn(`[Webhook Security] Non-admin number attempt: ${sender} (Normalized: ${normalizedSender})`);
        return res.status(403).json({ error: 'Access restricted to authorized admin number' });
      }

      // 3. Extraction Logic (YouTube, Vimeo & Direct links)
      const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|u\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
      const vimeoRegex = /(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com\/)([0-9]+)/;
      const directRegex = /(https?:\/\/[^\s]+\.(mp4|mkv|mov|avi))/i;
      
      const ytMatch = text.match(ytRegex);
      const vimeoMatch = text.match(vimeoRegex);
      const directMatch = text.match(directRegex);

      let videoUrl = null;
      let title = "فیلمی نوێ (بە وەتسئەپ)";
      let thumbnail = 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800';
      let isYouTube = false;
      let videoId = null;

      if (ytMatch) {
        videoId = ytMatch[1];
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        isYouTube = true;
        thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        
        try {
          const ytRes = await fetchWithTimeout(`https://www.youtube.com/oembed?url=${videoUrl}&format=json`, {}, 3000);
          if (ytRes.ok) {
            const ytData = await ytRes.json() as any;
            if (ytData && ytData.title) title = ytData.title;
          }
        } catch (e) {
          console.error('oEmbed fetch failed for YouTube URL');
        }
      } else if (vimeoMatch) {
        videoUrl = vimeoMatch[0];
        try {
          const vimeoRes = await fetchWithTimeout(`https://vimeo.com/api/oembed.json?url=${videoUrl}`, {}, 3000);
          if (vimeoRes.ok) {
            const vimeoData = await vimeoRes.json() as any;
            title = vimeoData.title || title;
            thumbnail = vimeoData.thumbnail_url || thumbnail;
          }
        } catch (e) {
          console.error('oEmbed fetch failed for Vimeo URL');
        }
      } else if (directMatch) {
        videoUrl = directMatch[1];
      } else {
        return res.status(400).json({ error: 'No valid movie link found in text' });
      }

      // 4. Persistence Logic
      const newMovie = {
        id: `wa-auto-${Date.now()}`,
        title,
        description: `بڵاوکراوەی ئۆتۆماتیکی لە ڕێگەی گرووپی واتسئەپەوە.\n\nOriginal Text excerpt:\n${text.substring(0, 200)}`,
        image: thumbnail,
        embedUrl: isYouTube ? `https://www.youtube.com/embed/${videoId}` : videoUrl,
        isYouTube,
        quality: 'New Release',
        category: 'New Releases', // Enforced category
        date: new Date().toISOString(),
        isNetflixOriginal: title.toLowerCase().includes('netflix'),
        tags: ['New Releases', 'WhatsApp Import', 'New'],
        whatsappLink: 'https://chat.whatsapp.com/Cinmachat'
      }; // Use db.socialLinks.group

      try {
        // WhatsApp save: local only
        console.log(`[WhatsApp Automation] Saving to local DB: ${title}`);
      } catch (e) {
        console.error('Save failed for WhatsApp webhook:', e);
      }

      db.manualMovies.push(newMovie);
      await saveDB(db);
      setMoviesCache(prev => [newMovie, ...prev.filter(m => m.id !== newMovie.id)]);

      console.log(`[WhatsApp Automation] Successfully posted: ${title}`);
      res.json({ success: true, movie: newMovie });
    } catch (err) {
      console.error('Webhook processing failed:', err);
      res.status(500).json({ error: 'Internal server error during processing' });
    }
  });



  app.get('/api/config', (req, res) => {
    res.json({
      ads,
      trackerText, // Expose tracker text
      socialLinks,
      heroVideoUrl: db.heroConfig?.heroVideoUrl || '',
      youtubeChannelUrl: db.youtubeUrl || db.youtubeChannelUrl || 'https://www.youtube.com/',
      youtubeUrl: db.youtubeUrl || 'https://www.youtube.com/',
      tiktokUrl: db.tiktokUrl || 'https://www.tiktok.com/',
      instagramUrl: db.instagramUrl || 'https://www.instagram.com/',
      facebookUrl: db.facebookUrl || 'https://www.facebook.com/'
    });
  });

  app.post('/api/config', async (req, res) => {
    const { ads: newAds, socialLinks: newSocialLinks, heroVideoUrl, youtubeChannelUrl, youtubeUrl, tiktokUrl, instagramUrl, facebookUrl, roomVideoUrl, trackerText: newTrackerText } = req.body;
    if (newAds) ads = newAds;
    if (newSocialLinks) socialLinks = newSocialLinks;
    if (heroVideoUrl !== undefined) {
      if (!db.heroConfig) db.heroConfig = {};
      db.heroConfig.heroVideoUrl = heroVideoUrl;
      // Also update heroPlaylist if only heroVideoUrl is provided
      db.heroConfig.heroPlaylist = [heroVideoUrl];
    }
    if (youtubeChannelUrl !== undefined) {
      db.youtubeChannelUrl = youtubeChannelUrl;
    }
    if (youtubeUrl !== undefined) {
      db.youtubeUrl = youtubeUrl;
      db.youtubeChannelUrl = youtubeUrl; // Sync for safety
    }
    if (tiktokUrl !== undefined) {
      db.tiktokUrl = tiktokUrl;
    }
    if (instagramUrl !== undefined) {
      db.instagramUrl = instagramUrl;
    }
    if (facebookUrl !== undefined) {
      db.facebookUrl = facebookUrl;
    }
    if (roomVideoUrl !== undefined) {
      if (!db.config) db.config = {};
      db.config.roomVideoUrl = roomVideoUrl;
    }
    if (newTrackerText !== undefined) trackerText = newTrackerText;
    await saveDB(db);
    res.json({
      success: true,
      ads,
      socialLinks,
      heroVideoUrl: db.heroConfig?.heroVideoUrl || '',
      roomVideoUrl: db.config?.roomVideoUrl || '',
      youtubeChannelUrl: db.youtubeUrl || db.youtubeChannelUrl,
      youtubeUrl: db.youtubeUrl,
      tiktokUrl: db.tiktokUrl,
      instagramUrl: db.instagramUrl,
      facebookUrl: db.facebookUrl
    });
  });

  app.post('/api/admin/config', async (req, res) => {
    const { youtubeChannelUrl, youtubeUrl, tiktokUrl, instagramUrl, facebookUrl } = req.body;
    if (youtubeUrl !== undefined || youtubeChannelUrl !== undefined) {
      db.youtubeUrl = youtubeUrl || youtubeChannelUrl || 'https://www.youtube.com/';
      db.youtubeChannelUrl = db.youtubeUrl;
    }
    if (tiktokUrl !== undefined) {
      db.tiktokUrl = tiktokUrl || 'https://www.tiktok.com/';
    }
    if (instagramUrl !== undefined) {
      db.instagramUrl = instagramUrl || 'https://www.instagram.com/';
    }
    if (facebookUrl !== undefined) {
      db.facebookUrl = facebookUrl || 'https://www.facebook.com/';
    }
    await saveDB(db);
    res.json({
      success: true,
      youtubeChannelUrl: db.youtubeUrl,
      youtubeUrl: db.youtubeUrl,
      tiktokUrl: db.tiktokUrl,
      instagramUrl: db.instagramUrl,
      facebookUrl: db.facebookUrl
    });
  });

  app.get('/api/tracker', (req, res) => {
    res.json({ text: trackerText, type: trackerType });
  });

  app.post('/api/tracker', (req, res) => {
    const { text, type } = req.body;
    if (text) trackerText = text;
    if (type) trackerType = type;
    res.json({ success: true });
  });

  app.get('/api/movies', async (req, res) => {
    try {
      console.log(`[${new Date().toISOString()}] REQUEST: /api/movies from ${req.ip}`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      // Start from the local manual list and merge the Firestore catalog (the
      // durable store the admin panel writes to) so the homepage gets the full
      // catalog in one fast request instead of blocking on a Firestore read.
      let results: any[] = mergeCatalogWithFirestore(moviesCache);

      // Enrich with ephemeral live-viewer counts + normalized metric fields so
      // cards can show "watching now" badges, CinemaChat ratings, favorite counts
      // and trending scores without a separate request. Live counts live in
      // memory; likes/views/ratings/favorites persist in db.json.
      results = results.map((m: any) => enrichMovie(m));
      
      const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const heroUrl = db.heroConfig.heroVideoUrl;
      const ytMatch = heroUrl ? heroUrl.match(ytRegex) : null;
      const isYouTube = !!ytMatch;
      const embedUrl = isYouTube ? `https://www.youtube.com/embed/${ytMatch![1]}` : (heroUrl || '');

      const heroPlaylist = db.heroConfig.heroPlaylist || [];
      const heroMovie: any = {
        id: 'hero-promo',
        title: 'پرۆمۆی تایبەت',
        description: 'نوێترین بەرهەمی CinamaChat ببینە لێرە دەتوانیت زانیاری زیاتر وەربگریت.',
        image: isYouTube ? `https://img.youtube.com/vi/${ytMatch![1]}/maxresdefault.jpg` : 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800',
        embedUrl: embedUrl,
        isYouTube: isYouTube,
        videoId: ytMatch ? ytMatch![1] : null,
        quality: '4K',
        date: new Date().toISOString(),
        tags: ['Trailer', 'Trailers'],
        whatsappLink: socialLinks.group || 'https://chat.whatsapp.com/Cinmachat',
        heroPlaylist: heroPlaylist,
        liveViewers: movieViewerSessions.get('hero-promo')?.size || 0,
        likes: 0,
        views: 0,
        ccRating: 0,
        ratingCount: 0,
        favoriteCount: 0,
        trendingScore: 0,
      };

      // Convert to a Map then back to array to ensure ID uniqueness
      const uniqueResults = Array.from(
        new Map([heroMovie, ...results].map(m => [m.id, m])).values()
      );
      
      console.log(`[${new Date().toISOString()}] SUCCESS: Returning ${uniqueResults.length} movies from local DB`);
      res.json({
        status: 'ok',
        results: uniqueResults,
        topLiveId: getTopLiveMovieId(),
      });
    } catch (err) {
      console.error('CRITICAL ERROR in /api/movies:', err);
      res.status(500).json({ status: 'error', error: 'Internal Server Error' });
    }
  });

  // Trending ranking (server-computed): the top movies by trending score or live
  // viewers. Lets the client render a "sort by live viewers / trending" control
  // without re-implementing the algorithm.
  app.get('/api/movies/trending', (req, res) => {
    try {
      const limitRaw = parseInt(String(req.query.limit || '20'), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
      const sortBy = req.query.sort === 'live' ? 'live' : 'trending';
      res.json({ status: 'ok', results: getTrendingMovies(limit, sortBy), topLiveId: getTopLiveMovieId() });
    } catch (err: any) {
      console.error('[movies/trending]', err?.message || err);
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  });

  // ================================
  // SMART SEARCH SYSTEM
  // (fuzzy title search + genre filter + AI semantic search + history/trending)
  // ================================

  // Normalize a search string for fuzzy matching (case + whitespace folding).
  const normalizeSearch = (s: string): string =>
    String(s || '')
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '') // strip Arabic diacritics
      .replace(/\s+/g, ' ')
      .trim();

  // Damerau-Levenshtein distance between two strings (max 1 substitution
  // swap). Used for typo-tolerant title matching.
  const editDistance = (a: string, b: string): number => {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array<number>(n + 1);
    let curr = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          curr[j] = Math.min(curr[j], prev[j - 2] + 1);
        }
      }
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[n];
  };

  // Score a movie against a query. Returns 0 when no meaningful match and a
  // higher number for stronger matches (exact prefix > substring > token match
  // > fuzzy/typo match). Genres (tags/category) also match so "Action" works.
  const fuzzyMatchMovie = (movie: any, query: string): number => {
    const q = normalizeSearch(query);
    if (!q) return 0;
    const title = normalizeSearch(String(movie?.title || ''));
    const tags = (Array.isArray(movie?.tags) ? movie.tags : [])
      .concat(movie?.category ? [movie.category] : [])
      .map((t: any) => normalizeSearch(String(t)))
      .filter(Boolean);
    const description = normalizeSearch(String(movie?.description || ''));

    if (!title && tags.length === 0) return 0;

    // Exact / prefix match on the title is the strongest signal.
    if (title === q) return 100;
    if (title.startsWith(q)) return 80;
    if (title.includes(q)) return 70;

    // Whole-word prefix match inside the title (e.g. "the dark" -> "The Dark Knight").
    const titleWords = title.split(' ');
    if (titleWords.some((w) => w === q)) return 65;
    if (titleWords.some((w) => w.startsWith(q))) return 55;

    // Fuzzy typo tolerance: allow the whole-title edit distance up to ~25%.
    const titleDist = editDistance(title, q);
    if (q.length >= 4 && titleDist <= Math.max(1, Math.floor(q.length * 0.25))) return 50;

    // Tag / genre match.
    if (tags.some((t) => t === q || t.startsWith(q) || t.includes(q))) return 60;
    if (tags.some((t) => {
      const d = editDistance(t, q);
      return q.length >= 3 && d <= Math.max(1, Math.floor(q.length * 0.3));
    })) return 45;

    // Description keyword match (weaker).
    if (q.length >= 5 && description.includes(q)) return 35;

    // Token-level partial match: e.g. query "dark knight" matches when both
    // tokens appear anywhere in the title.
    const tokens = q.split(' ').filter((t) => t.length >= 2);
    if (tokens.length > 1 && tokens.every((t) => title.includes(t))) return 75;
    if (tokens.length > 1 && tokens.some((t) => title.includes(t))) return 30;

    return 0;
  };

  // Rank the full catalog against a query, merging movie + genre matches.
  const searchMovies = (query: string, genres: string[], limit = 50): any[] => {
    const q = normalizeSearch(query);
    const genreSet = new Set(genres.map((g) => normalizeSearch(g)).filter(Boolean));
    let scored = moviesCache
      .map((m: any) => {
        let score = q ? fuzzyMatchMovie(m, q) : 1;
        const movieTags = (Array.isArray(m.tags) ? m.tags : [])
          .concat(m.category ? [m.category] : [])
          .map((t: any) => normalizeSearch(String(t)));
        // Genre filter (multi-select OR) — always applied when provided.
        if (genreSet.size > 0) {
          const hasGenre = movieTags.some((t) => genreSet.has(t)) ||
            (genreSet.size === 1 && movieTags.some((t) => t.includes([...genreSet][0])));
          if (!hasGenre) score = 0;
          else if (!q) score = 60; // pure genre browse
        }
        return { movie: enrichMovie(m), score };
      })
      .filter((x: any) => x.score > 0)
      .sort((a: any, b: any) => b.score - a.score || b.movie.trendingScore - a.movie.trendingScore)
      .slice(0, limit)
      .map((x: any) => x.movie);
    return scored;
  };

  // Search endpoints are registered before the /api/movies/:movieId routes so a
  // path segment can never be captured as a movie id.
  app.get('/api/search', (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const rawGenres = Array.isArray(req.query.genres)
        ? req.query.genres
        : req.query.genres ? [req.query.genres] : [];
      const genres = rawGenres
        .map((g) => String(g).trim())
        .filter((g) => g.length > 0 && g.length <= 64);
      const limitRaw = parseInt(String(req.query.limit || '50'), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
      if (q.length > 128) {
        return res.status(400).json({ status: 'error', error: 'Query too long' });
      }
      const results = searchMovies(q, genres, limit);
      // Suggestions double as a live dropdown payload (title prefix matches).
      const suggestions = q
        ? moviesCache
            .map((m: any) => ({ title: String(m.title || ''), id: String(m.id || '') }))
            .filter((m: any) => normalizeSearch(m.title).startsWith(normalizeSearch(q)))
            .slice(0, 8)
        : [];
      res.json({ status: 'ok', query: q, genres, results, suggestions });
    } catch (err: any) {
      console.error('[search]', err?.message || err);
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  });

  // Record a search term for a given identity (uid or device id) and update the
  // popular-terms ranking used by "trending searches".
  app.post('/api/search/history', async (req, res) => {
    try {
      const query = String((req.body as any)?.query || '').trim().slice(0, 128);
      const identity = String((req.body as any)?.identity || 'guest').trim().slice(0, 128);
      if (!query) return res.status(400).json({ ok: false, error: 'Missing query' });
      if (!db.searchHistory) db.searchHistory = {};
      if (!db.searchHistory[identity]) db.searchHistory[identity] = [];
      db.searchHistory[identity].unshift({ query, at: Date.now() });
      db.searchHistory[identity] = db.searchHistory[identity].slice(0, 50);
      if (!db.popularSearchTerms) db.popularSearchTerms = {};
      const term = normalizeSearch(query);
      if (term) db.popularSearchTerms[term] = (db.popularSearchTerms[term] || 0) + 1;
      await saveDB(db);
      res.json({ ok: true, history: db.searchHistory[identity] });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Internal server error' });
    }
  });

  // Recent search history for an identity (uid or device id).
  app.get('/api/search/history', (req, res) => {
    try {
      const identity = typeof req.query.identity === 'string'
        ? req.query.identity.trim().slice(0, 128)
        : 'guest';
      const history = db.searchHistory?.[identity] || [];
      res.json({ status: 'ok', history: history.slice(0, 20) });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  });

  // Trending / popular searches ranked by aggregate usage.
  app.get('/api/search/trending', (req, res) => {
    try {
      const top = (Object.entries(db.popularSearchTerms || {}) as [string, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([term, count]) => ({ term, count }));
      // Fall back to popular genre names when there is no recorded history yet.
      const fallback = top.length === 0
        ? ['ئاکشن', 'دراما', 'کۆمیدی', 'ترسناک', 'New Releases'].map((term) => ({ term, count: 0 }))
        : [];
      res.json({ status: 'ok', results: top.length ? top : fallback });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  });

  // Live suggestion payload: fast prefix + fuzzy title suggestions for the
  // search box dropdown while the user types.
  app.get('/api/search/suggestions', (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q || q.length > 64) return res.json({ status: 'ok', results: [] });
      const nq = normalizeSearch(q);
      const scored = moviesCache
        .map((m: any) => {
          const title = normalizeSearch(String(m.title || ''));
          let s = 0;
          if (title.startsWith(nq)) s = 100 - (title.length - nq.length);
          else if (title.includes(nq)) s = 60;
          else if (q.length >= 3) {
            const d = editDistance(title, nq);
            if (d <= Math.max(1, Math.floor(q.length * 0.3))) s = 40;
          }
          return { title: String(m.title || ''), id: String(m.id || ''), image: m.image || '', year: m.year || '', s };
        })
        .filter((x: any) => x.s > 0)
        .sort((a: any, b: any) => b.s - a.s)
        .slice(0, 8)
        .map(({ title, id, image, year }: any) => ({ title, id, image, year }));
      res.json({ status: 'ok', results: scored });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  });

  // --- AI SEMANTIC SEARCH ---
  // Turns a natural-language description (English, Kurdish, Arabic, ...) into a
  // ranked list of movies. Gemini understands the MEANING of the query, extracts
  // topics/genres + likely movie titles, and the local fuzzy engine then ranks
  // the catalog. Falls back to keyword search when the API is unavailable.
  const aiSearchCache = new Map<string, { at: number; results: any[] }>();
  const AI_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

  const callAiSearch = async (query: string): Promise<{ keywords: string[]; genres: string[]; titles: string[] }> => {
    const apiKey = process.env.GEMINI_API_KEY;
    const fallback: { keywords: string[]; genres: string[]; titles: string[] } = { keywords: [], genres: [], titles: [] };
    if (!apiKey) return fallback;

    const prompt =
      `You are a movie search engine for a Kurdish streaming platform. Given the user's ` +
      `natural-language description below, extract:\n` +
      `1. "keywords": up to 8 topical keywords that describe the film (e.g. space survival, zombies, time travel).\n` +
      `2. "genres": up to 4 matching genres (use standard genre names like Action, Drama, Comedy, Animation, Sci-Fi, Romance, Adventure, Crime, Fantasy, Thriller, Horror, Documentary, Family, Mystery, War).\n` +
      `3. "titles": up to 4 real movie/tv titles this description most likely refers to (their exact common English names).\n` +
      `Respond with STRICT JSON only — no markdown, no commentary — in this exact shape:\n` +
      `{"keywords":[],"genres":[],"titles":[]}\n` +
      `User description: ${query.slice(0, 500)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) return fallback;
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
      const parsed = JSON.parse(text);
      return {
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).slice(0, 8) : [],
        genres: Array.isArray(parsed.genres) ? parsed.genres.map(String).slice(0, 4) : [],
        titles: Array.isArray(parsed.titles) ? parsed.titles.map(String).slice(0, 4) : [],
      };
    } catch (e: any) {
      if (controller.signal.aborted) console.warn('[ai-search] Gemini timed out; falling back to keyword search');
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  };

  const semanticScoreMovie = (movie: any, parsed: { keywords: string[]; genres: string[]; titles: string[] }): number => {
    const title = normalizeSearch(String(movie?.title || ''));
    const description = normalizeSearch(String(movie?.description || ''));
    const tags = (Array.isArray(movie?.tags) ? movie.tags : [])
      .concat(movie?.category ? [movie.category] : [])
      .map((t: any) => normalizeSearch(String(t)));

    let score = 0;
    for (const t of parsed.titles) {
      const nt = normalizeSearch(t);
      if (nt && title.includes(nt)) score += 60;
    }
    for (const g of parsed.genres) {
      const ng = normalizeSearch(g);
      if (ng && tags.some((tag) => tag.includes(ng) || ng.includes(tag))) score += 25;
    }
    for (const k of parsed.keywords) {
      const nk = normalizeSearch(k);
      if (!nk || nk.length < 2) continue;
      if (title.includes(nk)) score += 20;
      if (description.includes(nk)) score += 12;
      if (tags.some((tag) => tag.includes(nk))) score += 10;
    }
    return score;
  };

  app.post('/api/search/ai', async (req, res) => {
    try {
      const query = String((req.body as any)?.query || '').trim();
      if (!query || query.length > 500) {
        return res.status(400).json({ status: 'error', error: 'Query must be 1-500 characters' });
      }
      const cacheKey = normalizeSearch(query);
      const cached = aiSearchCache.get(cacheKey);
      if (cached && Date.now() - cached.at < AI_SEARCH_CACHE_TTL_MS) {
        return res.json({ status: 'ok', query, ai: true, cached: true, results: cached.results });
      }

      const parsed = await callAiSearch(query);
      let results: any[] = [];
      if (parsed.keywords.length || parsed.genres.length || parsed.titles.length) {
        const scored = moviesCache
          .map((m: any) => ({ movie: enrichMovie(m), score: semanticScoreMovie(m, parsed) }))
          .filter((x: any) => x.score > 0)
          .sort((a: any, b: any) => b.score - a.score || b.movie.trendingScore - a.movie.trendingScore)
          .slice(0, 24)
          .map((x: any) => x.movie);
        results = scored;
      }

      // Fallback: even when Gemini succeeds but ranks nothing (very new movie),
      // a plain keyword fuzzy search over the query still returns candidates.
      if (results.length === 0) {
        results = searchMovies(query, [], 12);
      }

      aiSearchCache.set(cacheKey, { at: Date.now(), results });
      if (aiSearchCache.size > 200) aiSearchCache.delete(aiSearchCache.keys().next().value);

      res.json({
        status: 'ok',
        query,
        ai: parsed.keywords.length > 0,
        keywords: parsed.keywords,
        genres: parsed.genres,
        titles: parsed.titles,
        results,
      });
    } catch (err: any) {
      console.error('[search/ai]', err?.message || err);
      res.status(500).json({ status: 'error', error: 'Internal server error' });
    }
  });

  // --- CONTINUE WATCHING ---
  // Persists per-movie playback progress per identity so the homepage can offer
  // a "Continue Watching" row. Progress is best-effort (never blocks playback).
  app.post('/api/movies/:movieId/progress', async (req, res) => {
    try {
      const movieId = String((req.params as any).movieId || '').trim();
      const identity = String((req.body as any)?.identity || 'guest').trim().slice(0, 128);
      const progress = Number((req.body as any)?.progress);
      const duration = Number((req.body as any)?.duration);
      if (!movieId || movieId.length > 128) {
        return res.status(400).json({ ok: false, error: 'Invalid movie id' });
      }
      if (!Number.isFinite(progress) || progress < 0) {
        return res.status(400).json({ ok: false, error: 'Invalid progress' });
      }
      if (!db.continueWatching) db.continueWatching = {};
      if (!db.continueWatching[identity]) db.continueWatching[identity] = {};
      db.continueWatching[identity][movieId] = {
        progress: Math.round(progress),
        duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0,
        updatedAt: Date.now(),
      };
      await saveDB(db);
      res.json({ ok: true, movieId, progress: db.continueWatching[identity][movieId].progress });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Internal server error' });
    }
  });

  // Continue-watching entries for an identity, enriched with full movie objects.
  app.get('/api/movies/continue-watching', (req, res) => {
    try {
      const identity = typeof req.query.identity === 'string'
        ? req.query.identity.trim().slice(0, 128)
        : 'guest';
      const entries = db.continueWatching?.[identity] || {};
      const list = Object.entries(entries)
        .map(([movieId, data]: any) => {
          const movie = db.manualMovies.find((m: any) => m.id === movieId);
          if (!movie) return null;
          return {
            movie: enrichMovie(movie),
            progress: data.progress || 0,
            duration: data.duration || 0,
            updatedAt: data.updatedAt || 0,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
        .slice(0, 20);
      res.json({ status: 'ok', results: list });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: err?.message || 'Internal server error' });
    }
  });


  // Generates SRT subtitles for a movie source on the server (ffmpeg + Whisper +
  // optional Gemini translation). Used by the player's "درستکردنی وەرگێڕان" button.
  // YouTube / streaming-source URLs use pure web caption extraction (timedtext +
  // player-response track discovery) without yt-dlp.
  // direct .mp4/.webm file URLs are downloaded with a plain HTTP fetch instead.
  app.post('/api/subtitle/generate', async (req, res) => {
    const { url, subtitleUrl, lang } = req.body || {};

    // Fast path: the movie already has a subtitle file attached (movie.subtitleUrl).
    // Fetch that file and translate it with Gemini directly — no audio download, no
    // ffmpeg, no Whisper transcription. This is much faster and is used whenever the
    // caller provides a subtitleUrl. Whisper is only a fallback for movies WITHOUT
    // an existing subtitle file (see below).
    if (typeof subtitleUrl === 'string' && subtitleUrl.trim()) {
      const subtitleSource = sanitizeUrl(subtitleUrl);
      if (!/^https?:\/\//i.test(subtitleSource)) {
        return res.status(400).json({ error: 'subtitleUrl must be a valid http(s) URL' });
      }
      const targetLangSub =
        typeof lang === 'string' && /^[a-z]{2,3}$/i.test(lang) ? lang.toLowerCase() : 'en';
      const startedSub = Date.now();
      const stepLogSub = (msg: string) =>
        console.log(`[${new Date().toISOString()}] [subtitle-api] ${msg}`);

      try {
        stepLogSub(`translating existing subtitle file ${subtitleSource.slice(0, 120)} (lang=${targetLangSub})`);
        const controller = new AbortController();
        const dlTimer = setTimeout(() => controller.abort(), 60000);
        let resp;
        try {
          resp = await fetch(subtitleSource, { signal: controller.signal });
        } catch (e: any) {
          throw new Error(
            `Subtitle download failed: ${e?.name === 'AbortError' ? 'timed out after 60s' : e?.message}`,
          );
        } finally {
          clearTimeout(dlTimer);
        }
        if (!resp.ok) throw new Error(`Subtitle download failed: HTTP ${resp.status}`);
        const rawText = await resp.text();
        if (rawText.length > 10 * 1024 * 1024) throw new Error('Subtitle file is too large (> 10 MB)');
        const cleanText = rawText.replace(/^\uFEFF/, '').trim();
        if (!cleanText) throw new Error('Subtitle file is empty');
        const normalized = normalizeSubtitleText(cleanText);

        const srtText = await translateSrtViaGemini(normalized, targetLangSub);
        stepLogSub(
          `translated ${srtText.length} chars in ${((Date.now() - startedSub) / 1000).toFixed(1)}s`,
        );
        res.json({ success: true, srt: srtText, lang: targetLangSub, source: 'subtitle-file' });
      } catch (err: any) {
        console.error(`[${new Date().toISOString()}] [subtitle-api] subtitle-file ERROR:`, err?.message || err);
        res.status(500).json({ error: err?.message || 'Subtitle translation failed' });
      }
      return;
    }

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "url" in request body' });
    }
    const targetLang =
      typeof lang === 'string' && /^[a-z]{2,3}$/i.test(lang) ? lang.toLowerCase() : 'en';
    const sourceUrl = sanitizeUrl(url);
    if (!/^https?:\/\//i.test(sourceUrl)) {
      return res.status(400).json({ error: 'Source must be a valid http(s) URL' });
    }

const osMod = await import('os');
const fsMod = await import('fs');
const workDir = fsMod.mkdtempSync(path.join(osMod.tmpdir(), 'cinemachat-sub-api-'));
const videoPath = path.join(workDir, 'source.mp4');
const started = Date.now();
const stepLog = (msg: string) =>
  console.log(`[${new Date().toISOString()}] [subtitle-api] ${msg}`);

let videoDownloaded = false;

    const downloadTimeout = Number(process.env.SUBTITLE_DOWNLOAD_TIMEOUT) || 900000; // 15 min
    // Only fetch the first N seconds of the video by default. Transcribing a
    // 1-2 hour movie with Whisper on CPU would take hours; a 5-minute sample is
    // enough to demo and test the feature quickly. Set SUBTITLE_MAX_DURATION=0
    // to download the full video instead.
    const maxDurationSec = Math.floor(Number(process.env.SUBTITLE_MAX_DURATION) || 300);

    try {
      const isDirectVideo = /\.(mp4|m4v|webm|ogv)(\?|#|$)/i.test(sourceUrl);
      if (isDirectVideo) {
        stepLog(`downloading direct video ${sourceUrl.slice(0, 80)}`);
        const controller = new AbortController();
        const dlTimer = setTimeout(() => controller.abort(), downloadTimeout);
        let resp;
        try {
          resp = await fetch(sourceUrl, { signal: controller.signal });
        } catch (e: any) {
          throw new Error(
            `Download failed: ${e?.name === 'AbortError' ? `timed out after ${Math.round(downloadTimeout / 1000)}s` : e?.message}`,
          );
        } finally {
          clearTimeout(dlTimer);
        }
        if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        fsMod.writeFileSync(videoPath, buf);
        videoDownloaded = true;
        stepLog(`downloaded ${(buf.length / 1048576).toFixed(1)} MB`);
      } else {
        // Non-direct-video URL: fetch YouTube captions. yt-dlp is tried first
        // because it handles YouTube's signature/attestation bot-protection;
        // the web timedtext extractors below are a fallback for when yt-dlp
        // is unavailable or returns nothing.
        const videoId = extractYoutubeVideoId(sourceUrl);
        if (!videoId) {
          return res.status(400).json({ error: 'Unsupported URL — only direct video files and YouTube links are supported' });
        }
        stepLog(`fetching YouTube captions for video ${videoId} via yt-dlp`);

        // 1) yt-dlp (primary). Returns exact target-language captions when they
        //    exist, otherwise English/auto captions that still need translating.
        try {
          const ytDlpResult = await fetchYoutubeCaptionsViaYtDlp(sourceUrl, workDir, targetLang);
          if (ytDlpResult.lang === targetLang) {
            stepLog(
              `returned YouTube captions via yt-dlp (${ytDlpResult.mode}, ${ytDlpResult.srt.length} chars)`,
            );
            res.json({
              success: true,
              srt: ytDlpResult.srt,
              lang: targetLang,
              source: `youtube-captions-${ytDlpResult.mode}`,
            });
            return;
          }
          stepLog(`yt-dlp got ${ytDlpResult.lang} captions for target ${targetLang}; translating via Gemini`);
          const translatedSrt = await translateSrtViaGemini(ytDlpResult.srt, targetLang);
          stepLog(`translated yt-dlp captions via Gemini (${translatedSrt.length} chars, mode=${ytDlpResult.mode})`);
          res.json({
            success: true,
            srt: translatedSrt,
            lang: targetLang,
            source: `youtube-captions-${ytDlpResult.mode}-gemini`,
          });
          return;
        } catch (ytDlpErr: any) {
          stepLog(`yt-dlp caption fetch failed: ${ytDlpErr?.message || ytDlpErr}`);
          stepLog(`trying timedtext/web extractors for video ${videoId}`);
        }

        // 2) Web timedtext extractors (fallback when yt-dlp is unavailable).
        try {
          const webCaptionResult = await fetchYouTubeCaptionsFromWeb(videoId, targetLang);
          stepLog(
            `returned YouTube captions via web extractor (${webCaptionResult.source}, ${webCaptionResult.srt.length} chars)`,
          );
          res.json({
            success: true,
            srt: webCaptionResult.srt,
            lang: targetLang,
            source: `youtube-captions-web-${webCaptionResult.source}`,
          });
          return;
        } catch (webErr: any) {
          stepLog(`timedtext/web caption fetch failed: ${webErr?.message || webErr}`);
          if (targetLang !== 'en') {
            stepLog(`trying English caption fallback + Gemini translation for video ${videoId}`);
            try {
              const enCaptionResult = await fetchYouTubeCaptionsFromWeb(videoId, 'en');
              const translatedSrt = await translateSrtViaGemini(enCaptionResult.srt, targetLang);
              stepLog(
                `translated fallback English captions via Gemini (${translatedSrt.length} chars, source=${enCaptionResult.source})`,
              );
              res.json({
                success: true,
                srt: translatedSrt,
                lang: targetLang,
                source: `youtube-captions-web-en-gemini-${enCaptionResult.source}`,
              });
              return;
            } catch (geminiFallbackErr: any) {
              stepLog(`English+Gemini fallback failed: ${geminiFallbackErr?.message || geminiFallbackErr}`);
            }
          }

          return res.status(400).json({
            error: 'Could not fetch YouTube captions. yt-dlp, timedtext extractors and fallbacks failed for this video.',
          });
        }
      }

      if (!videoDownloaded && (!fsMod.existsSync(videoPath) || fsMod.statSync(videoPath).size < 1024)) {
        throw new Error('Downloaded video is empty');
      }

      stepLog(`starting whisper + Gemini pipeline (lang=${targetLang})`);
      const srtPath = await generateSubtitle(videoPath, targetLang);
      const srtText = fsMod.readFileSync(srtPath, 'utf-8');
      stepLog(`generated ${srtText.length} chars in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      res.json({ success: true, srt: srtText, lang: targetLang });
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] [subtitle-api] ERROR:`, err?.message || err);
      res.status(500).json({ error: err?.message || 'Subtitle generation failed' });
    } finally {
      try {
        fsMod.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  app.all('/api/*', (req, res, next) => {
    if (res.headersSent) return next();
    console.warn(`[${new Date().toISOString()}] 404 API: ${req.method} ${req.url}`);
    res.status(404).json({ 
       status: 'error', 
       error: 'API route not found',
       path: req.url,
       method: req.method
    });
  });

  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: { port: 0 } }, appType: 'spa' }); // Ensure HMR is configured
    app.use(vite.middlewares);
    // Fallback for development if Vite doesn't handle the request (e.g., Vite dev server is not running)
    app.get('*', (req, res, next) => { // Added next to allow other routes to handle
      if (!res.headersSent) {
        res.status(200).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head><meta charset="UTF-8"><title>CinemaChat Backend</title></head>
          <body><h1>CinemaChat Backend is Running!</h1><p>If you see this, the backend server is active. Please ensure your frontend development server (Vite) is also running, usually on port 5173.</p></body>
          </html>
        `);
      } else {
        next(); // Pass to next middleware if headers already sent
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.use((err: any, req: any, res: any, next: any) => {
    console.error('EXPRESS ERROR:', err);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  });

  // Start background tasks
  console.log('Finalizing server setup...');

  // Stale Session Automatic Cleanup (Database Maintenance - Point 3)
  // Periodically cleans up inactive users, room sync data & syncGroups in db.json if idle for > 5 hours
  const runDatabaseMaintenance = async () => {
    try {
      console.log(`[Maintenance] Starting db.json session/room automatic cleanup at ${new Date().toISOString()}`);
      let dbModified = false;
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);

      // Clean stale users in db.users
      if (db.users) {
        const initialUserCount = db.users.length;
        db.users = db.users.filter((user: any) => {
          // Keep users that don't have lastActive (e.g., newly registered) or are recently active
          return !user.lastActive || new Date(user.lastActive) > fiveHoursAgo;
        });
        if (db.users.length !== initialUserCount) {
          console.log(`[Maintenance] Cleaned ${initialUserCount - db.users.length} idle/stale user sessions from db.users.`);
          dbModified = true;
        }
      }

      // Clean stale syncGroups (rooms)
      if (db.syncGroups) {
        for (const groupId of Object.keys(db.syncGroups)) {
          if (groupId === 'global_room_official' || groupId === 'main_broadcast_room') continue; // Always keep global and broadcast rooms
          const group = db.syncGroups[groupId];
          // Use playback.updatedAt if available, otherwise updatedAt, otherwise createdAt
          const updatedAtStr = group?.playback?.updatedAt || group?.updatedAt || group?.createdAt;
          
          // If no timestamp, or if it's older than 5 hours, delete the group
          if (!updatedAtStr || new Date(updatedAtStr) < fiveHoursAgo) {
            delete db.syncGroups[groupId];
            console.log(`[Maintenance] Purged stale temporary syncGroup: ${groupId}`);
            dbModified = true;
          }
        }
      }

      if (dbModified) {
        await saveDB(db);
        console.log('[Maintenance] db.json persisted after active cleanup round.');
      }
    } catch (err) {
      console.error('[Maintenance] Error during periodic session automatic cleanup:', err);
    }
  };

  // Run immediately on boot, and then every 15 minutes
  runDatabaseMaintenance();
  setInterval(runDatabaseMaintenance, 15 * 60 * 1000);

  // Room empty cleanup interval - runs every 10 seconds
  setInterval(async () => {
    try {
      if (!db || !db.syncGroups) return;
      const now = new Date();
      let changed = false;
      
      for (const roomId of Object.keys(db.syncGroups)) {
        if (roomId === 'global_room_official' || roomId === 'main_broadcast_room') continue; // Always keep global and broadcast rooms
        
        const room = db.syncGroups[roomId];
        if (!room) continue; // Should not happen, but for safety

        // 1. Filter out inactive users (no heartbeat in last 20 seconds)
        if (Array.isArray(room.activeUsers)) {
          const initialUserCount = room.activeUsers.length;
          room.activeUsers = room.activeUsers.filter((u: any) => {
            const timeLimit = 20000; // 20 seconds threshold for active user
            const userTime = u.lastSeen || u.joinedAt;
            if (!userTime) return false; // If no timestamp, assume stale
            return (now.getTime() - new Date(userTime).getTime()) < timeLimit;
          });
          if (room.activeUsers.length !== initialUserCount) {
            changed = true;
          }
        } else {
          room.activeUsers = []; // Ensure it's an array
          changed = true;
        }

        // 2. Track & handle empty rooms
        if (room.activeUsers.length === 0) {
          if (!room.emptySince) {
            room.emptySince = now.toISOString();
            changed = true;
          } else {
            const emptyMs = now.getTime() - new Date(room.emptySince).getTime();
            if (emptyMs >= 60000) { // 60 seconds (1 minute) threshold
              console.log(`[Dynamic Clean] Room ${room.id} (${room.name}) was empty for >1 min. Auto-deleted.`);
              delete db.syncGroups[roomId]; // DELETE room
              changed = true;
            }
          }
        } else {
          // Room has active users, clear emptySince timer if present
          if (room.emptySince) {
            delete room.emptySince;
            changed = true;
          }
        }
      }

      if (changed) {
        await saveDB(db);
      }
    } catch (e) {
      console.error("Error in empty room cleanup setInterval:", e);
    }
  }, 10000);
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log('==================================================');
    console.log(`CinemaChat Server started on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('==================================================');
  });
}

startServer().catch(err => {
  console.error('FATAL SERVER ERROR:', err);
});
