/**
 * Unit tests for the private-chat heartbeat sweep decision (run:
 * npx tsx --test src/lib/privateChatSweep.test.ts).
 *
 * These pin the ephemerality guarantees the Watch Together fix relies on:
 *   • a brand-new session created BEFORE any browser socket joins is NOT
 *     swept while it is still inside the heartbeat window;
 *   • when the last member disconnects (transient socket drop / peer still
 *     joining), the grace restarts at that disconnect — the session survives
 *     until no member re-joins for a full window;
 *   • heartbeats from any member keep the session alive;
 *   • every participant silent past the window IS swept.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { privateSessionSweepable } from "./privateChatSweep.js";

const WINDOW = 45_000;

const uid = (n: number) => `uid_${n}`;
const [A, B] = [uid(1), uid(2)];

describe("privateSessionSweepable (heartbeat sweep)", () => {
  test("brand-new session with NO members survives inside the grace", () => {
    const createdAt = 100_000;
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map(),
        createdAt,
        now: createdAt + WINDOW - 1,
        heartbeatWindowMs: WINDOW,
      }),
      false,
    );
  });

  test("brand-new session with NO members is swept after the window", () => {
    const createdAt = 100_000;
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map(),
        createdAt,
        now: createdAt + WINDOW + 1,
        heartbeatWindowMs: WINDOW,
      }),
      true,
    );
  });

  test("a live member's heartbeat keeps the whole session alive", () => {
    const createdAt = 100_000;
    const now = createdAt + 86_000;
    // A joined long ago but is heartbeating RIGHT NOW; B still hasn't joined.
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map([[A, now]]),
        createdAt,
        now,
        heartbeatWindowMs: WINDOW,
      }),
      false,
    );
  });

  test("both members heartbeating keeps the session alive indefinitely", () => {
    const joinedAt = 200_000;
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map([
          [A, joinedAt],
          [B, joinedAt],
        ]),
        createdAt: 100_000,
        now: joinedAt + WINDOW - 1,
        heartbeatWindowMs: WINDOW,
      }),
      false,
    );
  });

  test("both members silent past the window is swept", () => {
    const joinedAt = 200_000;
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map([
          [A, joinedAt],
          [B, joinedAt],
        ]),
        createdAt: 100_000,
        now: joinedAt + WINDOW + 1,
        heartbeatWindowMs: WINDOW,
      }),
      true,
    );
  });

  test("last-member disconnect restarts the grace for a still-joining peer", () => {
    const createdAt = 100_000;
    const lastMemberLeftAt = 400_000;
    // The first member joined right after creation, then its socket dropped at
    // lastMemberLeftAt. createdAt is old — but the grace must still protect the
    // session for a full window AFTER the disconnect (this is exactly the
    // transient-socket-drop that used to destroy the room instantly).
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map(), // both sides disconnected now
        createdAt,
        lastMemberLeftAt,
        now: lastMemberLeftAt + WINDOW - 1,
        heartbeatWindowMs: WINDOW,
      }),
      false,
    );
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map(),
        createdAt,
        lastMemberLeftAt,
        now: lastMemberLeftAt + WINDOW + 1,
        heartbeatWindowMs: WINDOW,
      }),
      true,
    );
  });

  test("one member present + other silent-but-connected member still fresh → alive", () => {
    const now = 500_000;
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map([
          [A, now - 10_000],
          [B, now - 44_000], // silent but inside the window
        ]),
        createdAt: 100_000,
        now,
        heartbeatWindowMs: WINDOW,
      }),
      false,
    );
  });

  test("transient socket drop before the peer joins NEVER reaps the session (the recorded bug)", () => {
    // Timeline from the failing recording: A's REST request creates the session
    // (T0), A's socket joins and then drops a moment later (T0+2s, e.g. tab
    // remount / network blip), B is still ringing. On every 15s sweep from then
    // on the session MUST survive until a full window passes after A's drop.
    const createdAt = 0;
    const aJoinedAt = 2_000;
    const aDroppedAt = 2_001;
    for (let now = aDroppedAt + 15_000; now < aDroppedAt + WINDOW; now += 15_000) {
      assert.equal(
        privateSessionSweepable({
          participants: [A, B],
          members: new Map(),
          createdAt,
          lastMemberLeftAt: aDroppedAt,
          now,
          heartbeatWindowMs: WINDOW,
        }),
        false,
        `session reaped too early at t=${now}`,
      );
    }
    // Only after a full silent window past the disconnect (or the join fails to
    // happen at all) is the session finally swept.
    assert.equal(
      privateSessionSweepable({
        participants: [A, B],
        members: new Map(),
        createdAt,
        lastMemberLeftAt: aDroppedAt,
        now: aDroppedAt + WINDOW + 1,
        heartbeatWindowMs: WINDOW,
      }),
      true,
    );
  });
});