/**
 * Backend configuration + account-mutation health gate.
 *
 * Single source of truth for how the client reaches the backend:
 *
 *   - DEFAULT (same-origin): every API/WS path is relative to the app origin
 *     (`/api/...`, `/ws/...`). This is what both the local Express+Vite dev
 *     server and the Firebase Hosting 307-redirect to Render rely on, so no
 *     hardcoded remote URLs are needed — and no production URL can leak into a
 *     local session by accident.
 *   - EXPLICIT REMOTE (dev only): enabled ONLY when BOTH
 *     `VITE_REMOTE_BACKEND=true` and a `VITE_API_BASE_URL`/`VITE_WS_BASE_URL`
 *     are set. Never derived implicitly.
 *
 * The health gate (`ensureAccountBackendReady`) is called before any account
 * mutation (register/login/profile-save) so a local server that is missing
 * Firebase Admin credentials fails fast with a readable developer warning
 * instead of pretending a fake/partial account was created.
 */

export type BackendMode = "same-origin" | "remote";

const remoteApiBase =
  typeof import.meta.env.VITE_REMOTE_BACKEND === "string" &&
  String(import.meta.env.VITE_REMOTE_BACKEND).toLowerCase() === "true"
    ? String(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || "").trim()
    : "";

export const backendMode: BackendMode =
  remoteApiBase && String(import.meta.env.VITE_API_BASE_URL || "").trim()
    ? "remote"
    : "same-origin";

/** Prefix an API path with the remote base when explicitly configured. */
export const resolveApiUrl = (url: string): string =>
  backendMode === "remote" ? `${remoteApiBase.replace(/\/+$/, "")}${url}` : url;

/** Resolve a WebSocket path for the current backend mode. */
export const resolveWsUrl = (path: string): string => {
  if (backendMode === "remote") {
    const wsBase = String(import.meta.env.VITE_WS_BASE_URL || "").trim().replace(/\/+$/, "");
    if (wsBase) return `${wsBase}${path}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${path}`;
};

export interface AuthHealth {
  status: string;
  firebaseAdmin: boolean;
  firestore: boolean;
  emulator: boolean;
  mode: string;
  ready: boolean;
  time: string;
}

const HEALTH_CHECK_TIMEOUT_MS = 8000;

/** Fetch the non-secret /api/health/auth status (never throws). */
export const fetchAuthHealth = async (): Promise<AuthHealth> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(resolveApiUrl("/api/health/auth"), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`health/auth returned ${res.status}`);
    const data = await res.json();
    return {
      status: data?.status || "error",
      firebaseAdmin: Boolean(data?.firebaseAdmin),
      firestore: Boolean(data?.firestore),
      emulator: Boolean(data?.emulator),
      mode: String(data?.mode || ""),
      ready: Boolean(data?.ready),
      time: String(data?.time || ""),
    };
  } catch (error) {
    return {
      status: "error",
      firebaseAdmin: false,
      firestore: false,
      emulator: false,
      mode: "unknown",
      ready: false,
      time: "",
    };
  } finally {
    window.clearTimeout(timer);
  }
};

/**
 * Gate before any account mutation (register/login/profile-save).
 *
 * Local development runs a same-origin server that may not have Firebase Admin
 * credentials configured. In that case the server would correctly reject every
 * account mutation with 503, but the UI must fail fast with a readable warning
 * rather than creating a fake local-only account the user cannot log back into.
 *
 * Throws a `DevBackendUnavailableError` when the local backend reports it is
 * not ready for account mutations. Remote/same-origin-prod deployments pass
 * through untouched.
 */
export class DevBackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevBackendUnavailableError";
  }
}

export const ensureAccountBackendReady = async (): Promise<void> => {
  const health = await fetchAuthHealth();
  if (health.ready) return;

  if (backendMode === "remote" && import.meta.env.PROD) {
    // Never block a production flow on a flaky health probe; the server itself
    // enforces correctness (503 + error message on every account mutation).
    return;
  }

  throw new DevBackendUnavailableError(
    "Local backend is not ready for accounts: Firebase Admin credentials are missing. " +
      "Add GOOGLE_APPLICATION_CREDENTIALS (or FIREBASE_SERVICE_ACCOUNT / FIREBASE_AUTH_EMULATOR_HOST) " +
      "to the local .env, then restart the server. No account changes were made.",
  );
};
