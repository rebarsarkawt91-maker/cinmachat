/**
 * WatchCallStore — server-authoritative, quota-independent call state machine
 * for the Watch Together / Friend Connect flow.
 *
 * WHY: the previous implementation made every step of a call (create, deliver,
 * accept, connect, restore) require a live Firestore read/write. When the
 * project's Firestore quota is exhausted (HTTP 429 / RESOURCE_EXHAUSTED) the
 * whole flow died. This store is the SINGLE RUNTIME AUTHORITY: a plain
 * in-memory Map that works with ZERO Firestore availability. Firestore is
 * demoted to a best-effort asynchronous mirror (see server.ts mirror helper).
 *
 * State machine (per call):
 *   calling → ringing → accepted → connected → ended
 *      ↘ declined        ↘ ended
 *      ↘ cancelled
 *      ↘ expired (TTL sweep)
 *
 * Transitions are guarded:
 *   - only the RECEIVER may accept/decline
 *   - only the CALLER may cancel
 *   - only a participant may end an accepted/connected call
 *   - repeated identical operations are idempotent (no error, no double push)
 *   - only one non-terminal call may exist per user pair
 *
 * Display fields (names/codes/avatars) are carried for the UI only — every
 * authorization decision is made purely on token-derived UIDs.
 */

export type WatchCallStatus =
  | "calling"
  | "ringing"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired"
  | "connected"
  | "ended";

const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["calling", "ringing"]);
const ANSWERABLE_STATUSES: ReadonlySet<string> = new Set(["calling", "ringing"]);
const LIVE_SESSION_STATUSES: ReadonlySet<string> = new Set(["accepted", "connected"]);

export interface WatchCallParticipant {
  uid: string;
  name: string;
  code: string;
  avatar?: string | null;
}

export interface WatchCallRecord {
  callId: string;
  /** Canonical pair key (sorted uids joined by "__") — also the roomId. */
  connectionId: string;
  /** Deterministic room id (equals the connectionId: the private 1-to-1 room
   *  IS the pair). Kept as an explicit field so the wire format satisfies the
   *  call contract without the client re-deriving it. */
  roomId: string;
  callerUid: string;
  receiverUid: string;
  caller: WatchCallParticipant;
  receiver: WatchCallParticipant;
  status: WatchCallStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  /** Monotonic per-call sequence — bumped on every state transition so
   *  clients can discard out-of-order or stale events. */
  version: number;
}

export interface AcceptedConnectionRecord {
  connectionId: string;
  roomId: string;
  callId: string;
  /** Sorted [uidA, uidB]. */
  participants: [string, string];
  a: WatchCallParticipant; // participant[0] display data
  b: WatchCallParticipant; // participant[1] display data
  status: "accepted";
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface CallEvent {
  type:
    | "watch_call:ringing"
    | "watch_call:accepted"
    | "watch_call:declined"
    | "watch_call:cancelled"
    | "watch_call:expired"
    | "watch_call:connected"
    | "watch_call:ended";
  call: WatchCallRecord;
}

export type StoreErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_status"
  | "invalid_target"
  | "self_call";

export class StoreError extends Error {
  status: number;
  code: StoreErrorCode;
  constructor(code: StoreErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status ?? (code === "not_found" ? 404 : code === "forbidden" ? 403 : 409);
  }
}

export const canonicalPairKey = (uidA: string, uidB: string): string =>
  [String(uidA), String(uidB)].sort().join("__");

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "declined",
  "cancelled",
  "expired",
  "ended",
]);

interface StoreOptions {
  /** How long an unanswered call may ring before the sweep expires it. */
  ringTtlMs?: number;
  /** How long terminal records stay in memory before being purged. */
  terminalRetentionMs?: number;
  now?: () => number;
  callIdFactory?: () => string;
}

export class WatchCallStore {
  readonly ringTtlMs: number;
  private readonly terminalRetentionMs: number;
  private readonly now: () => number;
  private readonly callIdFactory: () => string;

  private calls = new Map<string, WatchCallRecord>();
  /** pairKey → active (non-terminal) callId. Enforces one live call per pair. */
  private activeCallByPair = new Map<string, string>();
  private connections = new Map<string, AcceptedConnectionRecord>();
  private eventListeners = new Set<(event: CallEvent) => void>();

  constructor(options: StoreOptions = {}) {
    this.ringTtlMs = options.ringTtlMs ?? 90_000;
    this.terminalRetentionMs = options.terminalRetentionMs ?? 5 * 60_000;
    this.now = options.now ?? (() => Date.now());
    this.callIdFactory =
      options.callIdFactory ??
      (() =>
        `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
  }

  // ── event fan-out (server pushes these over the call-signaling socket) ──
  onEvent(listener: (event: CallEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emit(type: CallEvent["type"], call: WatchCallRecord): void {
    for (const listener of this.eventListeners) {
      try {
        listener({ type, call: { ...call } });
      } catch {
        /* one bad listener must never break the store */
      }
    }
  }

  // ── create ──────────────────────────────────────────────────────────────
  createCall(params: {
    caller: WatchCallParticipant;
    receiver: WatchCallParticipant;
  }): { call: WatchCallRecord; duplicate: boolean } {
    const callerUid = String(params.caller?.uid || "");
    const receiverUid = String(params.receiver?.uid || "");
    if (!callerUid || !receiverUid) throw new StoreError("invalid_target", "invalid call participants", 400);
    if (callerUid === receiverUid) throw new StoreError("self_call", "cannot call yourself", 400);

    const connectionId = canonicalPairKey(callerUid, receiverUid);
    const existingId = this.activeCallByPair.get(connectionId);
    if (existingId) {
      const existing = this.calls.get(existingId);
      if (existing && ACTIVE_STATUSES.has(existing.status)) {
        return { call: { ...existing }, duplicate: true };
      }
    }

    const now = this.now();
    const call: WatchCallRecord = {
      callId: this.callIdFactory(),
      connectionId,
      roomId: connectionId,
      callerUid,
      receiverUid,
      caller: { ...params.caller },
      receiver: { ...params.receiver },
      status: "calling",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.ringTtlMs,
      version: 1,
    };
    this.calls.set(call.callId, call);
    this.activeCallByPair.set(connectionId, call.callId);
    return { call: { ...call }, duplicate: false };
  }

  /** The ring was delivered (socket push or receiver poll) — calling → ringing
   *  is a bookkeeping transition only; both are answerable. Idempotent. */
  markRinging(callId: string): WatchCallRecord | null {
    const call = this.calls.get(callId);
    if (!call || call.status !== "calling") return call ? { ...call } : null;
    call.status = "ringing";
    call.updatedAt = this.now();
    call.version += 1;
    return { ...call };
  }

  // ── reads ───────────────────────────────────────────────────────────────
  getCall(callId: string): WatchCallRecord | null {
    const call = this.calls.get(String(callId || ""));
    return call ? { ...call } : null;
  }

  /** Participant-only read (prevents callId guessing by third parties). */
  getCallForParticipant(callId: string, uid: string): WatchCallRecord | null {
    const call = this.getCall(callId);
    if (!call) return null;
    if (call.callerUid !== uid && call.receiverUid !== uid) return null;
    return call;
  }

  listIncomingCalls(uid: string): WatchCallRecord[] {
    const now = this.now();
    return [...this.calls.values()]
      .filter(
        (c) =>
          c.receiverUid === uid &&
          ACTIVE_STATUSES.has(c.status) &&
          c.expiresAt > now,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({ ...c }));
  }

  listOutgoingCalls(uid: string): WatchCallRecord[] {
    const now = this.now();
    return [...this.calls.values()]
      .filter(
        (c) =>
          c.callerUid === uid &&
          ACTIVE_STATUSES.has(c.status) &&
          c.expiresAt > now,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({ ...c }));
  }

  // ── receiver decision ───────────────────────────────────────────────────
  respondToCall(params: {
    callId: string;
    receiverUid: string;
    decision: "accepted" | "declined";
  }): { call: WatchCallRecord; connection: AcceptedConnectionRecord | null } {
    const call = this.calls.get(String(params.callId || ""));
    if (!call) throw new StoreError("not_found", "watch call not found");
    if (call.receiverUid !== String(params.receiverUid || "")) {
      throw new StoreError("forbidden", "only the receiver may respond");
    }
    if (call.status === params.decision) {
      // Idempotent repeat (double-tap): return the settled state untouched.
      const connection = this.connections.get(call.connectionId) ?? null;
      return { call: { ...call }, connection: connection ? { ...connection } : null };
    }
    if (!ANSWERABLE_STATUSES.has(call.status)) {
      throw new StoreError("invalid_status", `watch call already ${call.status}`);
    }

    const now = this.now();
    call.status = params.decision;
    call.updatedAt = now;
    call.expiresAt = now + this.terminalRetentionMs;
    call.version += 1;
    if (call.status === "declined") {
      this.activeCallByPair.delete(call.connectionId);
      this.emit("watch_call:declined", call);
      return { call: { ...call }, connection: null };
    }

    const connection = this.createOrGetConnection(call);
    this.emit("watch_call:accepted", call);
    return { call: { ...call }, connection: { ...connection } };
  }

  // ── caller cancel ───────────────────────────────────────────────────────
  cancelCall(params: { callId: string; callerUid: string }): WatchCallRecord {
    const call = this.calls.get(String(params.callId || ""));
    if (!call) throw new StoreError("not_found", "watch call not found");
    if (call.callerUid !== String(params.callerUid || "")) {
      throw new StoreError("forbidden", "only the caller may cancel");
    }
    if (call.status === "cancelled") return { ...call };
    if (!ANSWERABLE_STATUSES.has(call.status)) {
      throw new StoreError("invalid_status", `watch call already ${call.status}`);
    }
    call.status = "cancelled";
    call.updatedAt = this.now();
    call.version += 1;
    this.activeCallByPair.delete(call.connectionId);
    this.emit("watch_call:cancelled", call);
    return { ...call };
  }

  // ── either participant ends the live session ────────────────────────────
  endSession(params: { connectionId: string; uid: string }): {
    call: WatchCallRecord | null;
    connection: AcceptedConnectionRecord;
  } {
    const connection = this.connections.get(String(params.connectionId || ""));
    if (!connection) throw new StoreError("not_found", "no active session");
    if (!connection.participants.includes(String(params.uid || ""))) {
      throw new StoreError("forbidden", "not a participant");
    }
    connection.updatedAt = this.now();
    connection.version += 1;
    const call = this.calls.get(connection.callId) ?? null;
    if (call && call.status !== "ended") {
      call.status = "ended";
      call.updatedAt = this.now();
      call.version += 1;
      this.activeCallByPair.delete(call.connectionId);
      this.emit("watch_call:ended", call);
      return { call: { ...call }, connection: { ...connection } };
    }
    return { call: call ? { ...call } : null, connection: { ...connection } };
  }

  // ── connections ─────────────────────────────────────────────────────────
  createOrGetConnection(call: WatchCallRecord): AcceptedConnectionRecord {
    const existing = this.connections.get(call.connectionId);
    if (existing) {
      // Refresh display data + re-point at the newest call that accepted.
      existing.callId = call.callId;
      existing.updatedAt = this.now();
      existing.version += 1;
      return existing;
    }
    const a = call.callerUid <= call.receiverUid ? call.caller : call.receiver;
    const b = call.callerUid <= call.receiverUid ? call.receiver : call.caller;
    const connection: AcceptedConnectionRecord = {
      connectionId: call.connectionId,
      roomId: call.roomId,
      callId: call.callId,
      participants: [call.callerUid, call.receiverUid].sort() as [string, string],
      a,
      b,
      status: "accepted",
      createdAt: this.now(),
      updatedAt: this.now(),
      version: 1,
    };
    this.connections.set(connection.connectionId, connection);
    return connection;
  }

  getAcceptedConnection(connectionId: string): AcceptedConnectionRecord | null {
    const connection = this.connections.get(String(connectionId || ""));
    return connection ? { ...connection } : null;
  }

  /** True only when `uid` is a participant of the accepted connection. */
  isAcceptedParticipant(connectionId: string, uid: string): boolean {
    const connection = this.connections.get(String(connectionId || ""));
    return !!connection && connection.participants.includes(String(uid || ""));
  }

  getActiveSessionFor(uid: string): { call: WatchCallRecord; connection: AcceptedConnectionRecord } | null {
    for (const call of [...this.calls.values()].sort((x, y) => y.updatedAt - x.updatedAt)) {
      if (!LIVE_SESSION_STATUSES.has(call.status)) continue;
      if (call.callerUid !== uid && call.receiverUid !== uid) continue;
      const connection = this.connections.get(call.connectionId);
      if (!connection) continue;
      return { call: { ...call }, connection: { ...connection } };
    }
    return null;
  }

  /** Connections a user participates in (recovery surface for clients). */
  listConnectionsFor(uid: string): AcceptedConnectionRecord[] {
    return [...this.connections.values()]
      .filter((c) => c.participants.includes(String(uid || "")))
      .sort((x, y) => y.updatedAt - x.updatedAt)
      .map((c) => ({ ...c }));
  }

  // ── expiry sweep ────────────────────────────────────────────────────────
  /** Expires unanswered rings past their TTL. Returns the calls that
   *  transitioned so the server can push watch_call:expired. */
  cleanupExpiredCalls(): WatchCallRecord[] {
    const now = this.now();
    const expired: WatchCallRecord[] = [];
    for (const call of this.calls.values()) {
      if (!ACTIVE_STATUSES.has(call.status)) continue;
      if (call.expiresAt > now) continue;
      call.status = "expired";
      call.updatedAt = now;
      call.version += 1;
      this.activeCallByPair.delete(call.connectionId);
      expired.push({ ...call });
    }
    for (const call of expired) this.emit("watch_call:expired", call);

    // Purge long-dead terminal records so memory stays bounded.
    for (const [id, call] of this.calls) {
      if (TERMINAL_STATUSES.has(call.status) && now - call.updatedAt > this.terminalRetentionMs) {
        this.calls.delete(id);
      }
    }
    return expired;
  }

  /** Test/debug introspection — never exposed over the wire. */
  debugSize(): { calls: number; connections: number } {
    return { calls: this.calls.size, connections: this.connections.size };
  }
}
