/**
 * VAPID configuration for CinemaChat Web Push.
 *
 * Keys are read from the process environment (VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_SUBJECT). The private key is NEVER exposed: it is
 * only passed to web-push inside this module and never returned through any
 * API or log.
 *
 * Development convenience: when keys are missing locally, a fresh pair is
 * generated with the web-push package and appended to the gitignored `.env`
 * file so the dev server works out of the box. Nothing is ever printed.
 */

import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { isUrlBase64 } from "../../src/lib/webPushShared";

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
  ready: boolean;
}

const ENV_PATH = path.resolve(process.cwd(), ".env");

export function readVapidConfigFromEnv(): VapidConfig {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "").trim();
  const ready = isUrlBase64(publicKey) && isUrlBase64(privateKey) && subject.length > 0;
  return { publicKey, privateKey, subject, ready };
}

function appendToLocalEnv(lines: string[]): void {
  try {
    const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
    const additions = lines.filter((line) => !existing.includes(line.split("=")[0]));
    if (additions.length) fs.appendFileSync(ENV_PATH, `\n${additions.join("\n")}\n`, "utf8");
  } catch (err: any) {
    console.warn(`[push] Could not persist generated VAPID keys to .env: ${err?.message || err}`);
  }
}

/**
 * Ensures a valid VAPID configuration exists. When the environment lacks keys
 * AND we are not in production, generates a fresh pair and stores it locally.
 * Returns the config; `ready: false` when nothing usable exists (production
 * must configure the Render env vars).
 */
export function ensureVapidConfig(forceEnvWrite = false): VapidConfig {
  const current = readVapidConfigFromEnv();
  if (current.ready) return current;

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && !forceEnvWrite) {
    return { ...current, publicKey: "", privateKey: "", ready: false };
  }

  try {
    const generated = webpush.generateVAPIDKeys();
    const subject = current.subject || "mailto:rebarsarkawt91@gmail.com";
    appendToLocalEnv([
      `VAPID_PUBLIC_KEY=${generated.publicKey}`,
      `VAPID_PRIVATE_KEY=${generated.privateKey}`,
      `VAPID_SUBJECT=${subject}`,
    ]);
    // Reflect into process.env so the rest of the process sees them too.
    process.env.VAPID_PUBLIC_KEY = generated.publicKey;
    process.env.VAPID_PRIVATE_KEY = generated.privateKey;
    process.env.VAPID_SUBJECT = subject;
    if (!isProduction) console.log("[push] Generated fresh VAPID keys for local development.");
    return { publicKey: generated.publicKey, privateKey: generated.privateKey, subject, ready: true };
  } catch (err: any) {
    console.warn(`[push] VAPID key generation failed: ${err?.message || err}`);
    return { publicKey: "", privateKey: "", subject: current.subject, ready: false };
  }
}

/** Single public-key source the frontend fetches (never the private key). */
export function getVapidPublicKey(config: VapidConfig): string {
  return config.ready ? config.publicKey : "";
}

/**
 * Configures the web-push library for outgoing sends. Throws a clear error
 * when not ready so callers can degrade the /api/push/* endpoints with 503.
 */
export function configureWebPush(config: VapidConfig): void {
  if (!config.ready) {
    throw new Error("VAPID keys are not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)");
  }
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
}

/** Wraps web-push so delivery can be mocked in automated tests. */
export type PushSender = (
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: Buffer | string,
) => Promise<number>;

export const webPushSenderAdapter: PushSender = async (endpoint, keys, payload) => {
  const result = await webpush.sendNotification({ endpoint, keys }, String(payload), { TTL: 86400 });
  return result.statusCode || 201;
};