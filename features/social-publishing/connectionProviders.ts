import { createHash, createHmac } from "node:crypto";
import type { OAuthPlatform, SocialAccountChoice, SocialConnectionErrorCode } from "./connectionTypes";
import type { SocialPlatform } from "./types";

export const SOCIAL_OAUTH_CALLBACK_ROOT = "/api/social-connections/oauth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_CHANNEL_URL = "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=2";
const YOUTUBE_SCOPES = ["youtube.readonly", "youtube.upload"].map(scope => `https://www.googleapis.com/auth/${scope}`);
const META_SCOPES = {
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  instagram: ["pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_content_publish"],
};

type Environment = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

export interface VerifiedSocialAccount extends SocialAccountChoice {
  // A Meta Page token, a YouTube refresh token, or a Telegram bot token.
  token: string;
}

export class SocialConnectionError extends Error {
  constructor(readonly code: SocialConnectionErrorCode, readonly status: number) {
    super(code);
    this.name = "SocialConnectionError";
  }
}

export interface SocialAccountProviders {
  available(platform: SocialPlatform): boolean;
  authorizeUrl(platform: OAuthPlatform, state: string, verifier: string): URL;
  exchange(platform: OAuthPlatform, code: string, verifier: string): Promise<VerifiedSocialAccount[]>;
  telegram(botToken: unknown, channel: unknown): Promise<VerifiedSocialAccount>;
  verify(platform: SocialPlatform, account: VerifiedSocialAccount): Promise<VerifiedSocialAccount>;
}

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function credential(value: unknown): string {
  const text = string(value);
  return /^[!-~]{1,8192}$/.test(text) ? text : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function accountName(value: unknown, fallback: string): string {
  return string(value).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 160) || fallback;
}

function oauthCodeError(status: number): SocialConnectionError {
  return status === 403
    ? new SocialConnectionError("missing_permissions", 422)
    : status === 400 || status === 401 || status === 404
      ? new SocialConnectionError("grant_unavailable", 422)
      : new SocialConnectionError("provider_unavailable", 502);
}

async function providerJson(fetcher: typeof fetch, url: string | URL, init: RequestInit = {}): Promise<JsonRecord> {
  let response: Response;
  let payload: JsonRecord;
  try {
    response = await fetcher(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(7_500) });
    payload = object(await response.json());
  } catch {
    // Never propagate provider messages or URLs, which can contain credentials.
    throw new SocialConnectionError("provider_unavailable", 502);
  }
  if (!response.ok || payload.error || payload.ok === false) throw oauthCodeError(response.status);
  return payload;
}

function bearer(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function readSocialConnectionOrigin(value: string | undefined, production: boolean): string {
  const source = value?.trim() || "https://www.cinamachat.com";
  try {
    const target = new URL(source);
    const loopback = !production && target.protocol === "http:" && target.hostname === "127.0.0.1";
    if ((!loopback && target.protocol !== "https:") || target.username || target.password ||
      target.pathname !== "/" || target.search || target.hash) return "";
    return target.origin;
  } catch {
    return "";
  }
}

export function createSocialAccountProviders(options: {
  env: Environment;
  origin: string;
  outboundAllowed: boolean;
  fetcher?: typeof fetch;
}): SocialAccountProviders {
  const { env, origin, outboundAllowed, fetcher = fetch } = options;
  const metaId = string(env.META_APP_ID);
  const metaSecret = credential(env.META_APP_SECRET);
  const metaVersion = string(env.META_GRAPH_API_VERSION) || "v23.0";
  const googleId = string(env.YOUTUBE_CLIENT_ID);
  const googleSecret = credential(env.YOUTUBE_CLIENT_SECRET);
  const metaConfigured = /^\d{3,24}$/.test(metaId) && Boolean(metaSecret) && /^v\d{1,3}\.\d{1,2}$/.test(metaVersion);
  const graph = `https://graph.facebook.com/${metaVersion}`;
  const redirectUri = (platform: OAuthPlatform) => `${origin}${SOCIAL_OAUTH_CALLBACK_ROOT}/${platform}`;
  const available = (platform: SocialPlatform) => Boolean(origin && outboundAllowed && (
    platform === "telegram" || (platform === "youtube" ? googleId && googleSecret : metaConfigured)
  ));

  function requireProvider(platform: SocialPlatform): void {
    if (!available(platform)) throw new SocialConnectionError("connection_unavailable", 503);
  }

  function googleToken(params: Record<string, string>) {
    return providerJson(fetcher, GOOGLE_TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({ client_id: googleId, client_secret: googleSecret, ...params }),
    });
  }

  async function youtubeChannel(accessToken: string, refreshToken: string): Promise<VerifiedSocialAccount> {
    const response = await providerJson(fetcher, YOUTUBE_CHANNEL_URL, bearer(accessToken));
    const channels = list(response.items);
    if (channels.length !== 1 || response.nextPageToken) {
      throw new SocialConnectionError(channels.length ? "select_youtube_channel" : "no_eligible_account", 422);
    }
    const channel = object(channels[0]);
    const id = string(channel.id);
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(id)) throw new SocialConnectionError("no_eligible_account", 422);
    return { id, name: accountName(object(channel.snippet).title, id), token: refreshToken };
  }

  async function metaToken(params: Record<string, string>): Promise<string> {
    const url = new URL(`${graph}/oauth/access_token`);
    url.search = new URLSearchParams({ client_id: metaId, client_secret: metaSecret, ...params }).toString();
    const response = await providerJson(fetcher, url);
    const token = credential(response.access_token);
    if (!token) throw new SocialConnectionError("grant_unavailable", 422);
    return token;
  }

  function metaRead(path: string, token: string, params: Record<string, string> = {}) {
    const url = new URL(`${graph}/${path}`);
    url.search = new URLSearchParams({
      ...params,
      appsecret_proof: createHmac("sha256", metaSecret).update(token).digest("hex"),
    }).toString();
    return providerJson(fetcher, url, bearer(token));
  }

  async function getMetaAccounts(platform: "facebook" | "instagram", token: string): Promise<VerifiedSocialAccount[]> {
    const candidates = new Map<string, VerifiedSocialAccount>();
    let cursor = "";
    for (let pageNumber = 0; pageNumber < 4 && candidates.size < 50; pageNumber++) {
      const reply = await metaRead("me/accounts", token, {
        fields: `id,name,access_token,tasks${platform === "instagram" ? ",instagram_business_account{id,username}" : ""}`,
        limit: "50",
        ...(cursor ? { after: cursor } : {}),
      });
      for (const row of list(reply.data)) {
        const page = object(row);
        const pageId = string(page.id);
        const pageToken = credential(page.access_token);
        const canCreate = list(page.tasks).some(task => ["CREATE_CONTENT", "MANAGE", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL"].includes(string(task)));
        if (!/^\d{3,32}$/.test(pageId) || !pageToken || !canCreate) continue;
        if (platform === "facebook") {
          candidates.set(pageId, { id: pageId, name: accountName(page.name, pageId), token: pageToken });
        } else {
          const instagram = object(page.instagram_business_account);
          const id = string(instagram.id);
          const username = string(instagram.username);
          if (/^\d{3,32}$/.test(id) && /^[A-Za-z0-9_.]{1,30}$/.test(username)) {
            candidates.set(id, { id, name: `@${username}`, handle: `@${username}`, token: pageToken });
          }
        }
        if (candidates.size >= 50) break;
      }
      const paging = object(reply.paging);
      const next = string(object(paging.cursors).after);
      // Rebuild on the fixed Graph host. Never follow a provider-supplied URL with a bearer token.
      if (!paging.next || !next || next === cursor || next.length > 1024) break;
      cursor = next;
    }
    return [...candidates.values()];
  }

  async function verifyTelegram(botToken: unknown, channel: unknown): Promise<VerifiedSocialAccount> {
    requireProvider("telegram");
    const token = string(botToken);
    const chat = string(channel);
    const numericChatId = /^-100\d{5,13}$/.test(chat) ? Number(chat) : null;
    if (!/^\d{5,18}:[A-Za-z0-9_-]{20,120}$/.test(token) ||
      (!(numericChatId !== null && Number.isSafeInteger(numericChatId)) && !/^@[a-zA-Z0-9_]{5,32}$/.test(chat))) {
      throw new SocialConnectionError("invalid_input", 400);
    }
    const telegram = async (method: "getMe" | "getChat" | "getChatMember", body: JsonRecord = {}) => {
      const reply = await providerJson(fetcher, `https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (reply.ok !== true) throw new SocialConnectionError("provider_unavailable", 502);
      return object(reply.result);
    };
    const [bot, target] = await Promise.all([telegram("getMe"), telegram("getChat", { chat_id: numericChatId ?? chat })]);
    if (bot.is_bot !== true || typeof bot.id !== "number" || !Number.isSafeInteger(bot.id) || bot.id <= 0 ||
      target.type !== "channel" || typeof target.id !== "number" || !Number.isSafeInteger(target.id) || target.id >= 0) {
      throw new SocialConnectionError("no_eligible_account", 422);
    }
    const member = await telegram("getChatMember", { chat_id: target.id, user_id: bot.id });
    if (member.status !== "administrator" || member.can_post_messages !== true) {
      throw new SocialConnectionError("telegram_post_permission", 422);
    }
    const username = string(target.username);
    const id = String(target.id);
    return { id, name: accountName(target.title, id), ...(username ? { handle: `@${accountName(username, id)}` } : {}), token };
  }

  return {
    available,
    authorizeUrl(platform, state, verifier) {
      requireProvider(platform);
      const youtube = platform === "youtube";
      const url = new URL(youtube ? "https://accounts.google.com/o/oauth2/v2/auth" : `https://www.facebook.com/${metaVersion}/dialog/oauth`);
      url.search = new URLSearchParams({
        client_id: youtube ? googleId : metaId,
        redirect_uri: redirectUri(platform),
        response_type: "code",
        state,
      }).toString();
      if (youtube) {
        url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
        url.searchParams.set("access_type", "offline");
        url.searchParams.set("prompt", "consent select_account");
        url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
        url.searchParams.set("code_challenge_method", "S256");
      } else {
        const config = string(platform === "facebook" ? env.META_FACEBOOK_LOGIN_CONFIG_ID : env.META_INSTAGRAM_LOGIN_CONFIG_ID);
        if (/^\d{3,24}$/.test(config)) {
          url.searchParams.set("config_id", config);
        } else {
          url.searchParams.set("scope", META_SCOPES[platform].join(","));
          url.searchParams.set("auth_type", "rerequest");
        }
      }
      return url;
    },

    async exchange(platform, code, verifier) {
      requireProvider(platform);
      if (platform === "youtube") {
        const response = await googleToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri(platform), code_verifier: verifier });
        const accessToken = credential(response.access_token);
        const refreshToken = credential(response.refresh_token);
        if (!accessToken || !refreshToken) throw new SocialConnectionError("grant_unavailable", 422);
        const scopes = string(response.scope).split(/\s+/);
        if (!YOUTUBE_SCOPES.every(scope => scopes.includes(scope))) throw new SocialConnectionError("missing_permissions", 422);
        return [await youtubeChannel(accessToken, refreshToken)];
      }
      const shortToken = await metaToken({ code, redirect_uri: redirectUri(platform) });
      const longToken = await metaToken({ grant_type: "fb_exchange_token", fb_exchange_token: shortToken });
      const permissions = await metaRead("me/permissions", longToken, { limit: "100" });
      const granted = new Set(list(permissions.data).map(object).filter(item => item.status === "granted").map(item => item.permission));
      if (!META_SCOPES[platform].every(scope => granted.has(scope))) throw new SocialConnectionError("missing_permissions", 422);
      const accounts = await getMetaAccounts(platform, longToken);
      if (!accounts.length) throw new SocialConnectionError("no_eligible_account", 422);
      return accounts;
    },

    telegram: verifyTelegram,

    async verify(platform, account) {
      requireProvider(platform);
      if (platform === "telegram") return verifyTelegram(account.token, account.id);
      if (platform === "youtube") {
        const response = await googleToken({ grant_type: "refresh_token", refresh_token: account.token });
        const accessToken = credential(response.access_token);
        if (!accessToken) throw new SocialConnectionError("grant_unavailable", 422);
        if (response.scope && !YOUTUBE_SCOPES.every(scope => string(response.scope).split(/\s+/).includes(scope))) {
          throw new SocialConnectionError("missing_permissions", 422);
        }
        return youtubeChannel(accessToken, account.token);
      }
      const debugUrl = new URL(`${graph}/debug_token`);
      debugUrl.searchParams.set("input_token", account.token);
      const tokenInfo = object((await providerJson(fetcher, debugUrl, bearer(`${metaId}|${metaSecret}`))).data);
      if (tokenInfo.is_valid !== true || string(tokenInfo.app_id) !== metaId) {
        throw new SocialConnectionError("grant_unavailable", 422);
      }
      const scope = platform === "facebook" ? "pages_manage_posts" : "instagram_content_publish";
      const granularScopes = list(tokenInfo.granular_scopes).map(item => object(item).scope);
      if (!list(tokenInfo.scopes).includes(scope) && !granularScopes.includes(scope)) {
        throw new SocialConnectionError("missing_permissions", 422);
      }
      const response = await metaRead(encodeURIComponent(account.id), account.token, {
        fields: platform === "facebook" ? "id,name" : "id,username",
      });
      const username = string(response.username);
      return {
        id: string(response.id),
        name: platform === "instagram" && username ? `@${accountName(username, account.id)}` : accountName(response.name, account.name),
        ...(platform === "instagram" && username ? { handle: `@${accountName(username, account.id)}` } : {}),
        token: account.token,
      };
    },
  };
}
