import test from "node:test";
import assert from "node:assert/strict";
import { getUntranslatedStudioBatches, isUntranslatedStudioCue } from "./studioUntranslatedCues";

test("detects missing and unchanged English sound captions", () => {
  assert.equal(isUntranslatedStudioCue("[cheering fades]", ""), true);
  assert.equal(isUntranslatedStudioCue("- [cheering fades]\n- [heartbeat thumping]", "- [cheering fades]\n- [دڵ لێدەدات]"), true);
  assert.equal(isUntranslatedStudioCue("<i>[cheering resumes]</i>", "[cheering resumes]"), true);
});

test("accepts translated captions and does not retry empty sources", () => {
  assert.equal(isUntranslatedStudioCue("[cheering resumes]", "[هاوار و خۆشی دەستپێدەکاتەوە]"), false);
  assert.equal(isUntranslatedStudioCue("Hello", "سڵاو"), false);
  assert.equal(isUntranslatedStudioCue("", ""), false);
  assert.equal(isUntranslatedStudioCue("♪", "♪"), false);
});

test("batch retry selects only missing or copied English cues in 20-cue chunks", () => {
  const misses = Array.from({ length: 41 }, (_, id) => ({ id, originalText: `[cheering ${id}]`, translatedText: "" }));
  const finished = { id: 100, originalText: "[cheering resumes]", translatedText: "[هاوار دەستپێدەکاتەوە]" };
  const batches = getUntranslatedStudioBatches([misses[0], finished, ...misses.slice(1)]);
  assert.deepEqual(batches.map((batch) => batch.length), [20, 20, 1]);
  assert.deepEqual(batches.flat().map((cue) => cue.id), misses.map((cue) => cue.id));
});
