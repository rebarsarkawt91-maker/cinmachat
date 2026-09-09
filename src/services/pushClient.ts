/**
 * CinemaChat Web Push — browser API client.
 *
 * All mutating calls use `Content-Type: text/plain` with a JSON string body,
 * mirroring the profile-sync convention: after the Firebase Hosting 307
 * redirect this avoids a CORS preflight for the JSON content type. The server
 * still parses the body as JSON in the end.
 */

import { resolveApiUrl } from "./backendConfig";
import type { PushPreferences } from "../lib/webPushShared";

export interface PushPreferencesInput {
  newMovies?: boolean;
  newTrailers?: boolean;
  announcements?: boolean;
}

const authHeaders = (idToken: string): Record<string, string> => ({
  "Accept": "application/json",
  "Authorization": `Bearer ${idToken}`,
});

const jsonBodyHeaders = (idToken: string): Record<string, string> => ({
  ...authHeaders(idToken),
  "Content-Type": "text/plain",
});

export const pushApi = {
  /** VAPID applicationServerKey the browser needs to subscribe. */
  async getVapidPublicKey(): Promise<string | null> {
    try {
      const res = await fetch(resolveApiUrl("/api/push/vapid-public-key"), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return typeof data?.publicKey === "string" && data.publicKey.length > 0 ? data.publicKey : null;
    } catch {
      return null;
    }
  },

  /** The current user's stored device subscriptions (visible state only). */
  async getSubscriptions(idToken: string): Promise<Array<Record<string, unknown>>> {
    try {
      const res = await fetch(resolveApiUrl("/api/push/subscriptions"), {
        headers: authHeaders(idToken),
      });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      return Array.isArray(data?.subscriptions) ? data.subscriptions : [];
    } catch {
      return [];
    }
  },

  async subscribe(
    idToken: string,
    subscription: PushSubscription,
    preferences?: Partial<PushPreferencesInput> | null,
    deviceLabel?: string,
  ) {
    const res = await fetch(resolveApiUrl("/api/push/subscribe"), {
      method: "POST",
      headers: jsonBodyHeaders(idToken),
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        preferences,
        deviceLabel,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data?.error as string) || "subscription failed");
    return data;
  },

  async updatePreferences(idToken: string, endpoint: string, preferences: PushPreferencesInput) {
    const res = await fetch(resolveApiUrl("/api/push/preferences"), {
      method: "PATCH",
      headers: jsonBodyHeaders(idToken),
      body: JSON.stringify({ endpoint, preferences }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data?.error as string) || "preferences update failed");
    return data;
  },

  async setMasterEnabled(idToken: string, endpoint: string, enabled: boolean) {
    const res = await fetch(resolveApiUrl("/api/push/preferences"), {
      method: "PATCH",
      headers: jsonBodyHeaders(idToken),
      body: JSON.stringify({ endpoint, masterEnabled: enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data?.error as string) || "enable/disable failed");
    return data;
  },

  async unsubscribe(idToken: string, endpoint: string) {
    const res = await fetch(resolveApiUrl("/api/push/unsubscribe"), {
      method: "DELETE",
      headers: jsonBodyHeaders(idToken),
      body: JSON.stringify({ endpoint }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data?.error as string) || "unsubscribe failed");
    return data;
  },
};

/** Derives a short privacy-safe device label for the subscription record. */
export function detectDeviceLabel(): string {
  try {
    const platform = (navigator.platform || navigator.userAgent.replace(/^[^(]+\((.*?)\)/, "$1") || "device").trim();
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const chrome = /chrome|crios/i.test(navigator.userAgent) && !isIos ? "Chrome" : "";
    const safari = /^((?!chrome|crios|fxios|edgios|opios|android).)*safari/i.test(navigator.userAgent) ? "Safari" : "";
    const firefox = /firefox|fxios/i.test(navigator.userAgent) ? "Firefox" : "";
    const edge = /edg/i.test(navigator.userAgent) ? "Edge" : "";
    const browser = edge || chrome || firefox || safari || "Browser";
    return `${browser}/${platform}`.slice(0, 80);
  } catch {
    return "device";
  }
}