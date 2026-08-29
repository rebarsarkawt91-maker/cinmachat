/**
 * Browser WebSocket client for the private 1-to-1 ephemeral chat.
 *
 * Connects to the same-origin /ws/private-chat endpoint, authenticates with the
 * current Firebase ID token (the server derives the UID from the token only)
 * and maintains a heartbeat so the server can reap silently-dead sessions.
 *
 * Messages are never stored client-side either: the component keeps a purely
 * in-memory message list that is cleared whenever the session ends or the app
 * reopens a chat, so a reconnect always starts empty.
 */
import { auth } from "../lib/firebase";
import { resolveWsUrl } from "./backendConfig";

export interface PrivateChatMessage {
  clientId: string;
  senderId: string;
  text: string;
  ts: number;
}

/** Full watch-together playback state exchanged between the two participants
 *  (movie selection, play/pause and the current playhead position). */
export interface MovieSyncPayload {
  movie: { id: string; title: string; image?: string; url: string } | null;
  playing: boolean;
  time: number;
  seq: number;
  updatedAt: number;
}

export type PrivateChatEvent =
  | { type: "joined"; sessionId: string; participants: string[]; peerUid: string }
  | { type: "message"; clientId: string; senderId: string; text: string; ts: number; ack?: boolean }
  | { type: "presence"; uid: string; online: boolean }
  | { type: "typing"; uid: string; typing: boolean }
  | { type: "movie"; uid: string; payload: MovieSyncPayload }
  | { type: "heartbeat_ack"; t: number }
  | { type: "session_closed"; reason: string }
  | { type: "error"; message: string };

const PRIVATE_HEARTBEAT_MS = 15000; // keep server's 45s stale window alive
const PRIVATE_RECONNECT_DELAY_MS = 2500;
const PRIVATE_MAX_RECONNECTS = 5;

/**
 * Create-or-return the private session id for an ACCEPTED connection.
 * Same-origin path so Firebase Hosting redirects (/api/* → backend) behave
 * exactly like every other API call in the app. Returns 401/403/404/409/503 on
 * failure via the thrown error's `status`.
 */
export const fetchPrivateSessionId = async (connectionId: string): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("auth_missing"), { status: 401 });
  const token = await user.getIdToken();
  const res = await fetch("/api/private-chat/session", {
    method: "POST",
    headers: {
      // text/plain mirrors the app convention (avoids a CORS preflight after
      // the Firebase Hosting 307 redirect); the server parses JSON from it.
      "Content-Type": "text/plain",
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: JSON.stringify({ connectionId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.sessionId) {
    throw Object.assign(new Error(`session_request_failed_${res.status}`), { status: res.status });
  }
  return String(data.sessionId);
};

export class PrivateChatClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private lastCloseReason = "closed";

  /** Fired for every server event (message/presence/typing/joined/...). */
  onEvent: (event: PrivateChatEvent) => void = () => {};
  /** Fired when the socket ends for good (user leave, session closed, or the
   *  bounded reconnect was exhausted). */
  onClosed: (reason: string) => void = () => {};

  private socketUrl(): string {
    return resolveWsUrl("/ws/private-chat");
  }

  /** Open (or re-open) the socket for the given session id. */
  connect(sessionId: string): void {
    this.sessionId = sessionId;
    this.closedByUser = false;
    this.reconnectAttempts = 0;
    this.openSocket();
  }

  private openSocket(): void {
    if (this.ws) {
      try { this.ws.close(); } catch { /* already closed */ }
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const ws = new WebSocket(this.socketUrl());
    this.ws = ws;

    ws.onopen = () => {
      void (async () => {
        const user = auth.currentUser;
        if (!user) {
          this.close("auth_missing");
          return;
        }
        try {
          const token = await user.getIdToken();
          ws.send(JSON.stringify({ type: "auth", token, sessionId: this.sessionId }));
        } catch {
          this.close("auth_missing");
        }
      })();
    };

    ws.onmessage = (event) => {
      let data: any;
      try { data = JSON.parse(String(event.data)); } catch { return; }
      if (data?.type === "joined") {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      }
      if (data?.type === "error") {
        // Fatal server-side rejection (bad auth, unknown/closed session, ...)
        this.close(String(data?.message || "error"));
        return;
      }
      this.onEvent(data as PrivateChatEvent);
    };

    ws.onclose = () => {
      this.stopHeartbeat();
      if (this.closedByUser) {
        this.onClosed(this.lastCloseReason);
        return;
      }
      this.reconnectAttempts += 1;
      if (this.reconnectAttempts > PRIVATE_MAX_RECONNECTS) {
        this.onClosed("disconnected");
        return;
      }
      this.reconnectTimer = window.setTimeout(
        () => this.openSocket(),
        PRIVATE_RECONNECT_DELAY_MS,
      );
    };

    ws.onerror = () => {
      try { ws.close(); } catch { /* socket is gone */ }
    };
  }

  private sendJson(payload: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.sendJson({ type: "heartbeat" });
    this.heartbeatTimer = window.setInterval(
      () => this.sendJson({ type: "heartbeat" }),
      PRIVATE_HEARTBEAT_MS,
    );
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(text: string, clientId: string): void {
    this.sendJson({ type: "send", text, clientId });
  }

  sendTyping(typing: boolean): void {
    this.sendJson({ type: "typing", typing });
  }

  /** Broadcast a watch-together playback state change to the peer participant. */
  sendMovie(payload: MovieSyncPayload): void {
    this.sendJson({ type: "movie", payload });
  }

  /** Graceful leave — the server destroys the session and drops the other side. */
  leave(): void {
    this.sendJson({ type: "leave" });
    this.close("closed");
  }

  /** Local shutdown (no server round-trip). */
  close(reason: string): void {
    if (this.closedByUser) return;
    this.closedByUser = true;
    this.lastCloseReason = reason;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.close(1000, reason); } catch { /* socket is gone */ }
    }
    this.ws = null;
  }
}
