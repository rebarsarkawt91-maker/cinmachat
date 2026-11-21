import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
  SocialAdapters,
  SocialMedia,
  SocialPlatform,
  SocialPlatformAdapter,
  SocialPublicationJob,
  SocialPublishResult,
} from "./types";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_YOUTUBE_UPLOAD_BYTES = 256 * 1024 * 1024;
const INSTAGRAM_VIDEO_PROCESSING_ATTEMPTS = 6;
const INSTAGRAM_VIDEO_PROCESSING_DELAY_MS = 2_000;
const SAFE_MEDIA_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/mpeg",
]);

export class SocialProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean) {
    super(code);
    this.name = "SocialProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

type AdapterEnvironment = Record<string, string | undefined>;
type Fetcher = typeof fetch;

function providerError(platform: SocialPlatform, status: number): SocialProviderError {
  return new SocialProviderError(
    `${platform.toUpperCase()}_HTTP_${status}`,
    status === 408 || status === 425 || status === 429 || status >= 500,
  );
}

async function fetchWithTimeout(
  fetcher: Fetcher,
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch {
    throw new SocialProviderError("PROVIDER_NETWORK_ERROR", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response: Response, platform: SocialPlatform): Promise<any> {
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.error) {
    throw providerError(platform, response.status || 502);
  }
  return payload;
}

function required(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function validatePublicMediaUrl(media: SocialMedia | undefined): string {
  if (!media?.url) throw new SocialProviderError("PUBLIC_MEDIA_URL_REQUIRED", false);
  try {
    const url = new URL(media.url);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      throw new Error("invalid");
    }
    return url.toString();
  } catch {
    throw new SocialProviderError("PUBLIC_HTTPS_MEDIA_URL_REQUIRED", false);
  }
}

function youtubeMediaPath(media: SocialMedia | undefined, root: string): string {
  if (media?.type !== "video" || !media.storagePath) {
    throw new SocialProviderError("YOUTUBE_VIDEO_FILE_REQUIRED", false);
  }
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(resolvedRoot, media.storagePath);
  if (
    resolvedFile === resolvedRoot ||
    !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new SocialProviderError("YOUTUBE_MEDIA_PATH_INVALID", false);
  }
  return resolvedFile;
}

async function resolveYoutubeMediaFile(media: SocialMedia | undefined, root: string): Promise<string> {
  const expectedPath = youtubeMediaPath(media, root);
  try {
    const [resolvedRoot, resolvedFile] = await Promise.all([realpath(root), realpath(expectedPath)]);
    if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new SocialProviderError("YOUTUBE_MEDIA_PATH_INVALID", false);
    }
    return resolvedFile;
  } catch (error) {
    if (error instanceof SocialProviderError) throw error;
    throw new SocialProviderError("YOUTUBE_MEDIA_FILE_NOT_FOUND", false);
  }
}

async function youtubeAccessToken(
  env: AdapterEnvironment,
  fetcher: Fetcher,
): Promise<string> {
  const response = await fetchWithTimeout(fetcher, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required(env.YOUTUBE_CLIENT_ID),
      client_secret: required(env.YOUTUBE_CLIENT_SECRET),
      refresh_token: required(env.YOUTUBE_REFRESH_TOKEN),
      grant_type: "refresh_token",
    }),
  });
  const payload = await readJson(response, "youtube");
  if (typeof payload?.access_token !== "string" || !payload.access_token) {
    throw new SocialProviderError("YOUTUBE_OAUTH_TOKEN_UNAVAILABLE", false);
  }
  return payload.access_token;
}

function makeInstagramAdapter(env: AdapterEnvironment, fetcher: Fetcher): SocialPlatformAdapter {
  const accountId = required(env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  const accessToken = required(env.INSTAGRAM_ACCESS_TOKEN);
  const version = required(env.META_GRAPH_API_VERSION) || "v23.0";
  const validVersion = /^v\d+\.\d+$/.test(version);
  return {
    isConfigured: () => Boolean(accountId && accessToken && validVersion),
    async publish(publication): Promise<SocialPublishResult> {
      if (!accountId || !accessToken || !validVersion) {
        throw new SocialProviderError("PLATFORM_NOT_CONFIGURED", false);
      }
      if (!publication.media || !["image", "video"].includes(publication.media.type)) {
        throw new SocialProviderError("INSTAGRAM_MEDIA_REQUIRED", false);
      }
      if (publication.caption.length > 2200) {
        throw new SocialProviderError("INSTAGRAM_CAPTION_TOO_LONG", false);
      }
      const mediaUrl = validatePublicMediaUrl(publication.media);
      const params = new URLSearchParams({
        access_token: accessToken,
        caption: publication.caption,
        ...(publication.media.type === "video"
          ? { media_type: "REELS", video_url: mediaUrl }
          : { image_url: mediaUrl }),
      });
      const base = `https://graph.facebook.com/${version}/${encodeURIComponent(accountId)}`;
      const containerResponse = await fetchWithTimeout(fetcher, `${base}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      const container = await readJson(containerResponse, "instagram");
      if (typeof container?.id !== "string" || !container.id) {
        throw new SocialProviderError("INSTAGRAM_CONTAINER_CREATE_FAILED", true);
      }
      if (publication.media.type === "video") {
        const statusUrl = new URL(
          `https://graph.facebook.com/${version}/${encodeURIComponent(container.id)}`,
        );
        statusUrl.searchParams.set("fields", "status_code");
        statusUrl.searchParams.set("access_token", accessToken);
        let mediaReady = false;
        for (let attempt = 0; attempt < INSTAGRAM_VIDEO_PROCESSING_ATTEMPTS; attempt += 1) {
          const statusResponse = await fetchWithTimeout(fetcher, statusUrl, { method: "GET" });
          const statusPayload = await readJson(statusResponse, "instagram");
          if (statusPayload?.status_code === "FINISHED") {
            mediaReady = true;
            break;
          }
          if (statusPayload?.status_code === "ERROR") {
            throw new SocialProviderError("INSTAGRAM_MEDIA_PROCESSING_FAILED", false);
          }
          if (attempt + 1 < INSTAGRAM_VIDEO_PROCESSING_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, INSTAGRAM_VIDEO_PROCESSING_DELAY_MS));
          }
        }
        if (!mediaReady) {
          throw new SocialProviderError("INSTAGRAM_MEDIA_NOT_READY", true);
        }
      }
      const publishResponse = await fetchWithTimeout(fetcher, `${base}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: container.id,
          access_token: accessToken,
        }),
      });
      const published = await readJson(publishResponse, "instagram");
      if (typeof published?.id !== "string" || !published.id) {
        throw new SocialProviderError("INSTAGRAM_PUBLISH_FAILED", true);
      }
      return { providerPostId: published.id };
    },
  };
}

function makeFacebookAdapter(env: AdapterEnvironment, fetcher: Fetcher): SocialPlatformAdapter {
  const pageId = required(env.FACEBOOK_PAGE_ID);
  const accessToken = required(env.FACEBOOK_PAGE_ACCESS_TOKEN);
  const version = required(env.META_GRAPH_API_VERSION) || "v23.0";
  const validVersion = /^v\d+\.\d+$/.test(version);
  return {
    isConfigured: () => Boolean(pageId && accessToken && validVersion),
    async publish(publication): Promise<SocialPublishResult> {
      if (!pageId || !accessToken || !validVersion) {
        throw new SocialProviderError("PLATFORM_NOT_CONFIGURED", false);
      }
      const media = publication.media;
      const endpoint = media?.type === "image"
        ? "photos"
        : media?.type === "video"
          ? "videos"
          : "feed";
      const fields: Record<string, string> = { access_token: accessToken };
      if (endpoint === "photos") {
        fields.url = validatePublicMediaUrl(media);
        fields.caption = publication.caption;
      } else if (endpoint === "videos") {
        fields.file_url = validatePublicMediaUrl(media);
        fields.description = publication.caption;
        if (publication.title) fields.title = publication.title;
      } else {
        fields.message = publication.caption;
        if (media?.url) fields.link = validatePublicMediaUrl(media);
      }
      const response = await fetchWithTimeout(
        fetcher,
        `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(fields),
        },
      );
      const payload = await readJson(response, "facebook");
      if (typeof payload?.id !== "string" || !payload.id) {
        throw new SocialProviderError("FACEBOOK_PUBLISH_FAILED", true);
      }
      return { providerPostId: payload.id };
    },
  };
}

function makeYouTubeAdapter(
  env: AdapterEnvironment,
  fetcher: Fetcher,
  mediaRoot: string,
): SocialPlatformAdapter {
  const clientId = required(env.YOUTUBE_CLIENT_ID);
  const clientSecret = required(env.YOUTUBE_CLIENT_SECRET);
  const refreshToken = required(env.YOUTUBE_REFRESH_TOKEN);
  return {
    isConfigured: () => Boolean(clientId && clientSecret && refreshToken),
    async publish(publication): Promise<SocialPublishResult> {
      if (!clientId || !clientSecret || !refreshToken) {
        throw new SocialProviderError("PLATFORM_NOT_CONFIGURED", false);
      }
      const filePath = await resolveYoutubeMediaFile(publication.media, mediaRoot);
      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        throw new SocialProviderError("YOUTUBE_MEDIA_FILE_NOT_FOUND", false);
      }
      if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_YOUTUBE_UPLOAD_BYTES) {
        throw new SocialProviderError("YOUTUBE_MEDIA_FILE_SIZE_INVALID", false);
      }
      const mimeType = publication.media?.mimeType || "video/mp4";
      if (!SAFE_MEDIA_TYPES.has(mimeType)) {
        throw new SocialProviderError("YOUTUBE_MEDIA_TYPE_UNSUPPORTED", false);
      }
      const accessToken = await youtubeAccessToken(env, fetcher);
      const initiate = await fetchWithTimeout(
        fetcher,
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": String(fileStat.size),
            "X-Upload-Content-Type": mimeType,
          },
          body: JSON.stringify({
            snippet: {
              title: (publication.title || publication.caption).slice(0, 100),
              description: (publication.description || publication.caption).slice(0, 5000),
            },
            status: { privacyStatus: "private" },
          }),
        },
      );
      if (!initiate.ok) throw providerError("youtube", initiate.status);
      const uploadUrl = initiate.headers.get("location");
      if (!uploadUrl || new URL(uploadUrl).origin !== "https://www.googleapis.com") {
        throw new SocialProviderError("YOUTUBE_UPLOAD_SESSION_INVALID", false);
      }
      const file = await readFile(filePath);
      const uploadResponse = await fetchWithTimeout(fetcher, uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType, "Content-Length": String(fileStat.size) },
        body: file,
      });
      const payload = await readJson(uploadResponse, "youtube");
      if (typeof payload?.id !== "string" || !payload.id) {
        throw new SocialProviderError("YOUTUBE_PUBLISH_FAILED", true);
      }
      return { providerPostId: payload.id };
    },
  };
}

function makeTelegramAdapter(env: AdapterEnvironment, fetcher: Fetcher): SocialPlatformAdapter {
  const token = required(env.TELEGRAM_BOT_TOKEN);
  const chatId = required(env.TELEGRAM_CHANNEL_ID);
  return {
    isConfigured: () => Boolean(token && chatId),
    async publish(publication): Promise<SocialPublishResult> {
      if (!token || !chatId) throw new SocialProviderError("PLATFORM_NOT_CONFIGURED", false);
      const mediaType = publication.media?.type;
      const method = mediaType === "image" ? "sendPhoto" : mediaType === "video" ? "sendVideo" : "sendMessage";
      const params: Record<string, string> = { chat_id: chatId };
      if (method === "sendPhoto") {
        if (publication.caption.length > 1024) {
          throw new SocialProviderError("TELEGRAM_CAPTION_TOO_LONG", false);
        }
        params.photo = validatePublicMediaUrl(publication.media);
        params.caption = publication.caption;
      } else if (method === "sendVideo") {
        if (publication.caption.length > 1024) {
          throw new SocialProviderError("TELEGRAM_CAPTION_TOO_LONG", false);
        }
        params.video = validatePublicMediaUrl(publication.media);
        params.caption = publication.caption;
      } else {
        if (publication.caption.length > 4096) {
          throw new SocialProviderError("TELEGRAM_MESSAGE_TOO_LONG", false);
        }
        params.text = publication.caption;
      }
      const response = await fetchWithTimeout(
        fetcher,
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        },
      );
      const payload = await readJson(response, "telegram");
      if (payload?.ok !== true) {
        const apiStatus = Number(payload?.error_code);
        throw providerError(
          "telegram",
          Number.isInteger(apiStatus) && apiStatus > 0 ? apiStatus : response.ok ? 502 : response.status,
        );
      }
      const messageId = payload?.result?.message_id;
      return { providerPostId: messageId === undefined ? undefined : String(messageId) };
    },
  };
}

export function createSocialAdapters(
  env: AdapterEnvironment = process.env,
  options: { fetch?: Fetcher; mediaRoot?: string } = {},
): SocialAdapters {
  const fetcher = options.fetch || fetch;
  const mediaRoot = path.resolve(
    options.mediaRoot || env.SOCIAL_PUBLISHING_MEDIA_DIR || path.join(process.cwd(), "uploads", "social-publishing"),
  );
  return {
    instagram: makeInstagramAdapter(env, fetcher),
    facebook: makeFacebookAdapter(env, fetcher),
    youtube: makeYouTubeAdapter(env, fetcher, mediaRoot),
    telegram: makeTelegramAdapter(env, fetcher),
  };
}
