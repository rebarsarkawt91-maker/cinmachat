import test from "node:test";
import assert from "node:assert/strict";
import { runResilientStudioBatches } from "./studioTranslationRetry";

test("retries a temporary failure after 2 seconds without dropping cues", async () => {
  let calls = 0;
  const waits: number[] = [];
  const accepted: number[] = [];
  const outcome = await runResilientStudioBatches([1, 2], {
    signal: new AbortController().signal,
    shouldPause: () => false,
    translate: async (batch) => { if (++calls < 3) throw new Error("timeout"); return batch; },
    onSuccess: (batch) => accepted.push(...batch),
    wait: async (ms) => { waits.push(ms); },
  });
  assert.deepEqual(waits, [2000, 2000]);
  assert.deepEqual(accepted, [1, 2]);
  assert.deepEqual(outcome, { completed: 2, failed: [], paused: false });
});

test("reduces 20 failed cues to 10, then isolates a persistently bad cue", async () => {
  const attempts: number[] = [];
  const accepted: number[] = [];
  const outcome = await runResilientStudioBatches(Array.from({ length: 21 }, (_, index) => index), {
    signal: new AbortController().signal,
    shouldPause: () => false,
    translate: async (batch) => {
      attempts.push(batch.length);
      if (batch.length > 1 && batch.includes(3)) throw new Error("batch failed");
      if (batch.length === 1 && batch[0] === 3) throw new Error("cue failed");
      return batch;
    },
    onSuccess: (batch) => accepted.push(...batch),
    wait: async () => {},
  });
  assert.ok(attempts.includes(20));
  assert.ok(attempts.includes(10));
  assert.ok(attempts.includes(1));
  assert.deepEqual(outcome.failed, [3]);
  assert.equal(outcome.completed, 20);
  assert.deepEqual(accepted, Array.from({ length: 21 }, (_, index) => index).filter((value) => value !== 3));
});

test("does not retry a permanent authorization failure", async () => {
  let calls = 0;
  await assert.rejects(runResilientStudioBatches([1], {
    signal: new AbortController().signal,
    shouldPause: () => false,
    translate: async () => { calls += 1; throw new Error("forbidden"); },
    onSuccess: () => {},
    shouldRetry: (error) => (error as Error).message !== "forbidden",
    wait: async () => {},
  }), /forbidden/);
  assert.equal(calls, 1);
});

test("honors pause before the next batch without reporting it as failed", async () => {
  let paused = false;
  const outcome = await runResilientStudioBatches(Array.from({ length: 21 }, (_, index) => index), {
    signal: new AbortController().signal,
    shouldPause: () => paused,
    translate: async (batch) => batch,
    onSuccess: () => { paused = true; },
    wait: async () => {},
  });
  assert.deepEqual(outcome, { completed: 20, failed: [], paused: true });
});
