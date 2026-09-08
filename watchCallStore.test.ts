/**
 * Unit tests for the WatchCallStore state machine (run: npm run test:watchcall).
 * Covers the mandatory transitions, authorization guards and idempotency.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  WatchCallStore,
  StoreError,
  canonicalPairKey,
} from "./watchCallStore.js";

const CALLER = { uid: "uid_caller", name: "Caller", code: "CC-1111", avatar: null };
const RECEIVER = { uid: "uid_receiver", name: "Receiver", code: "CC-2222", avatar: null };

const newStore = (overrides: any = {}) =>
  new WatchCallStore({
    ringTtlMs: 90_000,
    terminalRetentionMs: 300_000,
    callIdFactory: (() => {
      let n = 0;
      return () => `call_${++n}`;
    })(),
    ...overrides,
  });

const create = (store: WatchCallStore) =>
  store.createCall({ caller: CALLER, receiver: RECEIVER }).call;

describe("WatchCallStore", () => {
  let store: WatchCallStore;
  beforeEach(() => {
    store = newStore();
  });

  test("createCall → calling with deterministic connectionId/roomId and version 1", () => {
    const call = create(store);
    assert.equal(call.status, "calling");
    assert.equal(call.connectionId, canonicalPairKey(CALLER.uid, RECEIVER.uid));
    assert.equal(call.roomId, call.connectionId);
    assert.equal(call.version, 1);
    assert.equal(call.expiresAt - call.createdAt, 90_000);
  });

  test("duplicate active call per pair returns the SAME call (no second ring)", () => {
    const first = create(store);
    const second = store.createCall({ caller: CALLER, receiver: RECEIVER });
    assert.equal(second.duplicate, true);
    assert.equal(second.call.callId, first.callId);
  });

  test("a new call is allowed after the previous one reached a terminal state", () => {
    const first = create(store);
    store.cancelCall({ callId: first.callId, callerUid: CALLER.uid });
    const second = store.createCall({ caller: CALLER, receiver: RECEIVER });
    assert.equal(second.duplicate, false);
    assert.notEqual(second.call.callId, first.callId);
  });

  test("only the receiver may accept; caller accept is forbidden", () => {
    const call = create(store);
    assert.throws(
      () => store.respondToCall({ callId: call.callId, receiverUid: CALLER.uid, decision: "accepted" }),
      (err: any) => err instanceof StoreError && err.code === "forbidden",
    );
  });

  test("accept: calling → accepted, creates the canonical connection, emits accepted", () => {
    const events: any[] = [];
    store.onEvent((e) => events.push(e));
    const call = create(store);
    const { connection } = store.respondToCall({
      callId: call.callId,
      receiverUid: RECEIVER.uid,
      decision: "accepted",
    });
    assert.equal(store.getCall(call.callId)?.status, "accepted");
    assert.ok(connection);
    assert.deepEqual(connection!.participants, [CALLER.uid, RECEIVER.uid].sort());
    assert.equal(connection!.roomId, call.roomId);
    assert.equal(connection!.callId, call.callId);
    assert.ok(events.some((e) => e.type === "watch_call:accepted" && e.call.callId === call.callId));
  });

  test("accept is idempotent — a repeated accept returns the settled state without error", () => {
    const call = create(store);
    store.respondToCall({ callId: call.callId, receiverUid: RECEIVER.uid, decision: "accepted" });
    const again = store.respondToCall({
      callId: call.callId,
      receiverUid: RECEIVER.uid,
      decision: "accepted",
    });
    assert.equal(again.call.status, "accepted");
    assert.equal(again.connection?.connectionId, call.connectionId);
  });

  test("declined: terminal, no connection, pair unlocked for a new call", () => {
    const events: any[] = [];
    store.onEvent((e) => events.push(e));
    const call = create(store);
    const { connection } = store.respondToCall({
      callId: call.callId,
      receiverUid: RECEIVER.uid,
      decision: "declined",
    });
    assert.equal(connection, null);
    assert.equal(store.getCall(call.callId)?.status, "declined");
    assert.ok(events.some((e) => e.type === "watch_call:declined"));
    const next = store.createCall({ caller: CALLER, receiver: RECEIVER });
    assert.equal(next.duplicate, false);
  });

  test("answering an expired/terminal call is rejected (invalid_status)", () => {
    const call = create(store);
    store.cancelCall({ callId: call.callId, callerUid: CALLER.uid });
    assert.throws(
      () => store.respondToCall({ callId: call.callId, receiverUid: RECEIVER.uid, decision: "accepted" }),
      (err: any) => err instanceof StoreError && err.code === "invalid_status",
    );
  });

  test("cancel: only the caller, only while calling/ringing, idempotent", () => {
    const call = create(store);
    assert.throws(
      () => store.cancelCall({ callId: call.callId, callerUid: RECEIVER.uid }),
      (err: any) => err instanceof StoreError && err.code === "forbidden",
    );
    const cancelled = store.cancelCall({ callId: call.callId, callerUid: CALLER.uid });
    assert.equal(cancelled.status, "cancelled");
    // second cancel must NOT throw
    assert.equal(store.cancelCall({ callId: call.callId, callerUid: CALLER.uid }).status, "cancelled");
  });

  test("endSession: only a participant can end; emits ended and frees the pair", () => {
    const events: any[] = [];
    store.onEvent((e) => events.push(e));
    const call = create(store);
    store.respondToCall({ callId: call.callId, receiverUid: RECEIVER.uid, decision: "accepted" });
    assert.throws(
      () => store.endSession({ connectionId: call.connectionId, uid: "uid_stranger" }),
      (err: any) => err instanceof StoreError && err.code === "forbidden",
    );
    const { call: ended } = store.endSession({ connectionId: call.connectionId, uid: CALLER.uid });
    assert.equal(ended?.status, "ended");
    assert.ok(events.some((e) => e.type === "watch_call:ended"));
    const next = store.createCall({ caller: CALLER, receiver: RECEIVER });
    assert.equal(next.duplicate, false);
  });

  test("expiry sweep: unanswered ring past TTL → expired + emitted + pair freed", () => {
    let clock = 1_000_000;
    const timed = newStore({ now: () => clock });
    const events: any[] = [];
    timed.onEvent((e) => events.push(e));
    const call = timed.createCall({ caller: CALLER, receiver: RECEIVER }).call;
    clock += 91_000;
    const expired = timed.cleanupExpiredCalls();
    assert.equal(expired.length, 1);
    assert.equal(expired[0].callId, call.callId);
    assert.equal(timed.getCall(call.callId)?.status, "expired");
    assert.ok(events.some((e) => e.type === "watch_call:expired"));
    const next = timed.createCall({ caller: CALLER, receiver: RECEIVER });
    assert.equal(next.duplicate, false);
  });

  test("active-session recovery returns the accepted call for either participant only", () => {
    const call = create(store);
    store.respondToCall({ callId: call.callId, receiverUid: RECEIVER.uid, decision: "accepted" });
    assert.ok(store.getActiveSessionFor(CALLER.uid));
    assert.ok(store.getActiveSessionFor(RECEIVER.uid));
    assert.equal(store.getActiveSessionFor("uid_stranger"), null);
  });

  test("participant-only read: strangers cannot resolve a call by guessing callId", () => {
    const call = create(store);
    assert.equal(store.getCallForParticipant(call.callId, "uid_stranger"), null);
    assert.ok(store.getCallForParticipant(call.callId, RECEIVER.uid));
  });

  test("markRinging transitions calling → ringing once and stays answerable", () => {
    const call = create(store);
    const ringing = store.markRinging(call.callId);
    assert.equal(ringing?.status, "ringing");
    const again = store.markRinging(call.callId);
    assert.equal(again?.status, "ringing");
    assert.ok(["calling", "ringing"].includes(store.getCall(call.callId)!.status));
    store.respondToCall({ callId: call.callId, receiverUid: RECEIVER.uid, decision: "accepted" });
    assert.equal(store.markRinging(call.callId)?.status, "accepted");
  });

  test("terminal records are purged after retention (bounded memory)", () => {
    let clock = 1_000_000;
    const timed = newStore({ now: () => clock, terminalRetentionMs: 300_000 });
    const call = timed.createCall({ caller: CALLER, receiver: RECEIVER }).call;
    timed.cancelCall({ callId: call.callId, callerUid: CALLER.uid });
    clock += 301_000;
    timed.cleanupExpiredCalls();
    assert.equal(timed.getCall(call.callId), null);
  });
});
