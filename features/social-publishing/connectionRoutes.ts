import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { SOCIAL_OAUTH_CALLBACK_ROOT, SocialConnectionError } from "./connectionProviders";
import type { OAuthPlatform } from "./connectionTypes";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "./types";
import type { SocialConnections } from "./connections";

const ADMIN_ROOT = "/api/admin/social-connections";

function knownPlatform(value: unknown): SocialPlatform | null {
  return SOCIAL_PLATFORMS.find(platform => platform === value) || null;
}

function oauthPlatform(value: unknown): OAuthPlatform {
  const platform = knownPlatform(value);
  if (!platform || platform === "telegram") throw new SocialConnectionError("invalid_input", 400);
  return platform;
}

function cookieName(platform: OAuthPlatform, secure: boolean) {
  return `${secure ? "__Secure-" : ""}cc_social_${platform}`;
}

function cookieOptions(platform: OAuthPlatform, secure: boolean) {
  return { path: `${SOCIAL_OAUTH_CALLBACK_ROOT}/${platform}`, httpOnly: true, sameSite: "lax" as const, secure };
}

function uniqueCookie(request: Request, name: string): string {
  const prefix = `${name}=`;
  const matches = (request.get("Cookie") || "").split(";").map(value => value.trim()).filter(value => value.startsWith(prefix));
  return matches.length === 1 ? matches[0].slice(prefix.length) : "";
}

function noStore(response: Response) {
  response.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
}

// These fields are opaque. The existing text sanitizer rewrites strings such as
// "--". Keep bounded originals only for these authenticated, validated actions.
export function preserveSocialConnectionInput(request: Request, response: Response, next: NextFunction): void {
  if (request.method === "POST" && request.path === `${ADMIN_ROOT}/telegram`) {
    const token = request.body?.botToken;
    if (typeof token === "string" && token.length <= 160) response.locals.socialBotToken = token;
  }
  if (request.method === "POST" && /^\/api\/admin\/social-connections\/oauth\/(facebook|instagram|youtube)\/select$/.test(request.path)) {
    const id = request.body?.accountId;
    if (typeof id === "string" && id.length <= 64) response.locals.socialAccountId = id;
  }
  next();
}

export function registerSocialOAuthCallback(app: Express, service: SocialConnections, limit: RequestHandler): void {
  app.get(`${SOCIAL_OAUTH_CALLBACK_ROOT}/result`, (request, response) => {
    noStore(response);
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    const ready = request.query.status === "ready";
    const heading = ready ? "هەڵبژاردنی ئەکاونت ئامادەیە" : "پەیوەستکردن تەواو نەبوو";
    response.type("html").send(`<!doctype html><html lang="ckb" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title><style>body{margin:0;background:#101014;color:#f4f0e8;font:1rem system-ui}main{max-width:34rem;margin:12vh auto;padding:1.5rem;line-height:1.8}h1{color:#f1c56f}</style><main><h1>${heading}</h1><p>بگەڕێوە بۆ تابی بەشی ٢٣ و «نوێکردنەوەی ئەکاونتەکان» بکە. ئەم تابە دەتوانیت دایبخەیت.</p></main></html>`);
  });

  // Register before the application's request logger. Strip the query from the
  // rate limiter's URL as well, so it cannot log the authorization code.
  app.get(`${SOCIAL_OAUTH_CALLBACK_ROOT}/:platform`, (request, response) => {
    const incomingUrl = request.url;
    request.url = request.path;
    noStore(response);
    limit(request, response, () => {
      void (async () => {
        let status: "ready" | "failed" | "invalid" = "invalid";
        try {
          const platform = oauthPlatform(request.params.platform);
          const query = new URL(incomingUrl, service.origin).searchParams;
          const states = query.getAll("state");
          const codes = query.getAll("code");
          const errors = query.getAll("error");
          if (states.length === 1 && ((codes.length === 1 && !errors.length) || (!codes.length && errors.length === 1))) {
            const secure = service.origin.startsWith("https:");
            const name = cookieName(platform, secure);
            status = await service.callback(platform, states[0], uniqueCookie(request, name), codes[0] ?? null);
            if (status !== "invalid") response.clearCookie(name, cookieOptions(platform, secure));
          }
        } catch {
          // Neither provider errors nor authorization parameters belong in logs.
        }
        response.redirect(303, `${SOCIAL_OAUTH_CALLBACK_ROOT}/result?status=${status === "ready" ? "ready" : "failed"}`);
      })();
    });
  });
}

export function registerSocialConnectionRoutes(app: Express, options: {
  service: SocialConnections;
  resolveAdmin: (request: Request) => string | null;
  isOwner: (username: string) => boolean;
}): void {
  const { service } = options;
  const protectedRoute = (ownerOnly: boolean, handle: (request: Request, response: Response, username: string) => Promise<void>): RequestHandler => (
    async (request, response) => {
      noStore(response);
      const username = options.resolveAdmin(request);
      if (!username) {
        response.status(401).json({ success: false, errorCode: "owner_required" });
        return;
      }
      try {
        if (ownerOnly && !options.isOwner(username)) throw new SocialConnectionError("owner_required", 403);
        if (ownerOnly && (!service.origin || request.get("Origin") !== service.origin ||
          (request.get("Sec-Fetch-Site") && request.get("Sec-Fetch-Site") !== "same-origin"))) {
          throw new SocialConnectionError("same_origin_required", 403);
        }
        await handle(request, response, username);
      } catch (error) {
        const status = error instanceof SocialConnectionError ? error.status : 503;
        const errorCode = error instanceof SocialConnectionError ? error.code : "connection_unavailable";
        response.status(status).json({ success: false, errorCode });
      }
    }
  );

  app.get(ADMIN_ROOT, protectedRoute(false, async (_request, response, username) => {
    const connections = await service.overview(options.isOwner(username) ? username : null);
    response.json({ success: true, connections });
  }));

  app.post(`${ADMIN_ROOT}/oauth/:platform/start`, protectedRoute(true, async (request, response, username) => {
    const platform = oauthPlatform(request.params.platform);
    const { authorizationUrl, browserProof } = await service.start(platform, username);
    const secure = service.origin.startsWith("https:");
    response.cookie(cookieName(platform, secure), browserProof, { ...cookieOptions(platform, secure), maxAge: service.browserProofMaxAge });
    response.json({ success: true, authorizationUrl });
  }));

  app.post(`${ADMIN_ROOT}/oauth/:platform/select`, protectedRoute(true, async (request, response, username) => {
    const platform = oauthPlatform(request.params.platform);
    const account = await service.select(platform, username, request.body?.flowId, response.locals.socialAccountId);
    response.json({ success: true, account });
  }));

  app.post(`${ADMIN_ROOT}/telegram`, protectedRoute(true, async (request, response) => {
    const account = await service.linkTelegram(response.locals.socialBotToken, request.body?.channel);
    response.json({ success: true, account });
  }));

  app.post(`${ADMIN_ROOT}/:platform/verify`, protectedRoute(true, async (request, response) => {
    const platform = knownPlatform(request.params.platform);
    if (!platform) throw new SocialConnectionError("invalid_input", 400);
    const account = await service.verify(platform);
    response.json({ success: true, account });
  }));

  app.delete(`${ADMIN_ROOT}/:platform`, protectedRoute(true, async (request, response) => {
    const platform = knownPlatform(request.params.platform);
    if (!platform) throw new SocialConnectionError("invalid_input", 400);
    await service.disconnect(platform);
    response.json({ success: true });
  }));
}
