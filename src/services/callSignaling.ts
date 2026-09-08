/**
 * Call signaling — ONE authenticated global WebSocket per browser.
 *
 * The server pushes every Watch Together transition here instantly:
 *   watch_call:ringing | accepted | declined | cancelled | expired | ended
 * plus a `watch_call:state_sync` snapshot right after authentication (and on
 * every reconnect) so a returning tab recovers its live calls/room with ZERO
 * Firestore dependency and ZERO page refresh.
 *
 * Design constraints honored:
 * - Same-origin infrastructure: /ws/call-signaling on the SAME HTTP server as
 *   the app (no new ports, no external service).
 * - Identity: the server derives the uid from the verified Firebase ID token;
 *   this client never posts its own uid as an authority.
 * - StrictMode-safe: a module-level singleton — StrictMode double-mounting
 *   adds/removes listeners but never opens duplicate sockets.
 * - Bounded reconnect backoff (1s→15s) — no reconnect storm.
 * - Heartbeat every 25s keeps proxies alive and detects dead sockets.
 */
import { auth } from "../lib/firebase";
import { resolveWsUrl } from "./backendConfig";

export interface WatchCallWire {
  id: string;
  callId: string;
  status: string;
  connectionId: string;
  roomId: string;
  fromId: string;
  fromName: string;
  fromCode: string;
  fromAvatar?: string | null;
  toId: string;
  toName: string;
  toCode: string;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  version?: number;
}

export interface WatchConnectionWire {
  id: string;
  connectionId: string;
  roomId: string;
  callId: string;
  requesterUid: string;
  requesterName: string;
  requesterCode: string;
  targetUid: string;
  targetName: string;
  targetCode: string;
  status: string;
}

export type CallSignalingEvent =
  | { type: "watch_call:ringing"; call: WatchCallWire }
  | { type: "watch_call:accepted"; call: WatchCallWire }
  | { type: "watch_call:declined"; call: WatchCallWire }
  | { type: "watch_call:cancelled"; call: WatchCallWire }
  | { type: "watch_call:expired"; call: WatchCallWire }
  | { type: "watch_call:connected"; call: WatchCallWire }
  | { type: "watch_call:ended"; call: WatchCallWire }
  | {
      type: "watch_call:state_sync";
      incoming: WatchCallWire[];
      outgoing: WatchCallWire[];
      activeSession: { call: WatchCallWire; connection: WatchConnectionWire } | null;
    };

type Listener = (event: CallSignalingEvent) => void;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;
const HEARTBEAT_MS = 25_000;

let ws: WebSocket | null = null;
let currentUid = "";
let currentToken = "";
let reconnectTimer: number | null = null;
let heartbeatTimer: number | null = null;
let reconnectAttempts = 0;
let intentionallyClosed = false;
const listeners = new Set<Listener>();

const emit = (event: CallSignalingEvent) => {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* a bad listener must never break the socket */
    }
  }
};

const stopTimers = () => {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const scheduleReconnect = () => {
  if (intentionallyClosed || reconnectTimer !== null) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts = Math.min(reconnectAttempts + 1, 10);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    void openSocket();
  }, delay);
};

const startHeartbeat = () => {
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  heartbeatTimer = window.setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: "heartbeat" })); } catch { /* gone */ }
    }
  }, HEARTBEAT_MS);
};

const openSocket = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user || intentionallyClosed) return;
  try {
    currentToken = await user.getIdToken();
  } catch {
    scheduleReconnect();
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const socket = new WebSocket(resolveWsUrl("/ws/call-signaling"));
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) {
      try { socket.close(1000, "stale"); } catch { /* gone */ }
      return;
    }
    try {
      socket.send(
        JSON.stringify({
          type: "auth",
          token: currentToken,
          // Display-only metadata (the server derives identity from the token).
          name: String((user as any)?.displayName || ""),
        }),
      );
    } catch {
      scheduleReconnect();
    }
  };

  socket.onmessage = (raw) => {
    if (ws !== socket) return;
    let data: any;
    try { data = JSON.parse(String(raw.data)); } catch { return; }
    if (!data?.type) return;
    if (data.type === "ready") {
      reconnectAttempts = 0;
      startHeartbeat();
      return;
    }
    if (data.type === "error") {
      // Server-side rejection (bad auth) — close and let the backoff retry.
      try { socket.close(1000, "server error"); } catch { /* gone */ }
      return;
    }
    if (String(data.type).startsWith("watch_call:")) {
      emit(data as CallSignalingEvent);
    }
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    stopTimers();
    ws = null;
    if (!intentionallyClosed) scheduleReconnect();
  };

  socket.onerror = () => {
    try { socket.close(); } catch { /* gone */ }
  };
};

/** Connect (or re-point) the global call socket for the given account.
 *  Safe to call on every render/effect — it opens at most ONE socket. */
export const ensureCallSignaling = async (uid: string): Promise<void> => {
  if (!uid || uid === "admin_local_bypass") return;
  if (uid !== currentUid) {
    // Account switch: drop the old socket first.
    intentionallyClosed = true;
    stopTimers();
    try { ws?.close(1000, "account switched"); } catch { /* gone */ }
    ws = null;
    intentionallyClosed = false;
    reconnectAttempts = 0;
    currentUid = uid;
  }
  await openSocket();
};

export const disconnectCallSignaling = (): void => {
  intentionallyClosed = true;
  stopTimers();
  try { ws?.close(1000, "logout"); } catch { /* gone */ }
  ws = null;
  currentUid = "";
  listeners.clear();
};

/** Subscribe to call events. Returns the unsubscribe function. */
export const onCallEvent = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Test/debug: current socket state (never exposed in the UI). */
export const callSignalingStatus = (): string =>
  ws?.readyState === WebSocket.OPEN
    ? "open"
    : ws?.readyState === WebSocket.CONNECTING
      ? "connecting"
      : "closed";
