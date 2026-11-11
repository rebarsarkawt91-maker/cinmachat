import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SCENE_BLUR_RANGES, formatSceneTime, isSceneBlurActive,
  normalizeSceneBlurConfig, parseSceneTime, validateSceneBlurConfig,
} from "./sceneBlur";

test("write validation sorts fresh ranges and preserves disabled edits without mutating input", () => {
  const input = Object.freeze({ enabled: false, ranges: Object.freeze([
    Object.freeze({ start: 100, end: 105 }), Object.freeze({ start: 5.25, end: 9.5 }),
  ]) });
  const result = validateSceneBlurConfig(input);
  assert.deepEqual(result, { enabled: false, ranges: [{ start: 5.25, end: 9.5 }, { start: 100, end: 105 }] });
  result.ranges[0].start = 6;
  assert.equal(input.ranges[1].start, 5.25);
  assert.equal(input.ranges[0].start, 100);
});

test("strict writes reject malformed settings, unsafe clocks, reversed ranges and excessive entries", () => {
  for (const value of [null, [], {}, { enabled: "true", ranges: [] }, { enabled: true },
    { enabled: true, ranges: {} }, { enabled: true, ranges: Array(MAX_SCENE_BLUR_RANGES + 1).fill({ start: 1, end: 2 }) }]) {
    assert.throws(() => validateSceneBlurConfig(value));
  }
  for (const range of [{ start: -1, end: 1 }, { start: 4, end: 4 }, { start: 5, end: 4 },
    { start: NaN, end: 4 }, { start: 1, end: Infinity }, { start: 1, end: 86400.1 },
    { start: "1", end: 2 }, { start: null, end: 2 }, null, []]) {
    assert.throws(() => validateSceneBlurConfig({ enabled: false, ranges: [range] }));
  }
  assert.deepEqual(validateSceneBlurConfig({ enabled: true, ranges: [] }), { enabled: true, ranges: [] });
  assert.deepEqual(validateSceneBlurConfig({ enabled: true, ranges: [{ start: 0, end: 86400 }] }),
    { enabled: true, ranges: [{ start: 0, end: 86400 }] });
});

test("legacy reads normalize missing settings and retain only clean copied ranges", () => {
  assert.deepEqual(normalizeSceneBlurConfig(undefined), { enabled: false, ranges: [] });
  assert.deepEqual(normalizeSceneBlurConfig(null), { enabled: false, ranges: [] });
  assert.deepEqual(normalizeSceneBlurConfig({ enabled: "false", ranges: [{ start: 2, end: 4 }] }),
    { enabled: false, ranges: [{ start: 2, end: 4 }] });
  const source = { enabled: true, ranges: [{ start: 8, end: 10 }, { start: -1, end: 2 }, { start: 1, end: 3 }] };
  const result = normalizeSceneBlurConfig(source);
  assert.deepEqual(result, { enabled: true, ranges: [{ start: 1, end: 3 }, { start: 8, end: 10 }] });
  assert.equal(source.ranges[0].start, 8);
  result.ranges[0].end = 2;
  assert.equal(source.ranges[2].end, 3);
});

test("time entry supports Kurdish keyboard digits, long minutes, fractions and exact day limit", () => {
  for (const [input, expected] of [
    ["12", 12], ["12.25", 12.25], ["01:02", 62], ["1:2", 62], ["120:00", 7200],
    ["01:02:03.5", 3723.5], [" ١٢ : ٣٠ ", 750], ["۰۱:۰۲:۰۳٫۲۵", 3723.25], ["24:00:00", 86400],
  ] as const) assert.equal(parseSceneTime(input), expected, input);
});

test("invalid time entry cannot silently become zero or overflow into another minute", () => {
  for (const input of ["", " ", "-1", "+2", "NaN", "Infinity", "1e3", "0x10", ".5", "1:60", "1:60:00",
    "25:00:00", "86400.01", "1::2", "1:2:3:4", "1.5:00", "00:01.1234", "one", "12:"]) {
    assert.equal(parseSceneTime(input), null, input);
  }
});

test("clock formatting round trips millisecond values and handles carry boundaries", () => {
  for (const seconds of [0, 0.005, 5.25, 59.999, 60, 3599.5, 3600, 3723.125, 86400]) {
    assert.equal(parseSceneTime(formatSceneTime(seconds)), seconds);
  }
  assert.equal(formatSceneTime(59.9996), "01:00");
  assert.equal(formatSceneTime(NaN), "00:00");
  assert.equal(formatSceneTime(-5), "00:00");
});

test("masking uses half-open boundaries, handles seeks without history and defaults safe on unknown clocks", () => {
  const config = validateSceneBlurConfig({ enabled: true, ranges: [{ start: 10, end: 20 }, { start: 30.25, end: 31 }] });
  for (const time of [10, 19.999, 30.25, 30.999]) assert.equal(isSceneBlurActive(config, time), true);
  for (const time of [0, 9.999, 20, 30.249, 31, 99]) assert.equal(isSceneBlurActive(config, time), false);
  for (const time of [NaN, Infinity, -Infinity, -1, null, undefined]) assert.equal(isSceneBlurActive(config, time), true);
  assert.equal(isSceneBlurActive(config, 15), true, "backward seek re-enters the range");
  assert.equal(isSceneBlurActive(config, 99), false, "forward seek immediately leaves the range");
  assert.equal(isSceneBlurActive({ ...config, enabled: false }, NaN), false);
  assert.equal(isSceneBlurActive({ enabled: true, ranges: [] }, NaN), false);
  assert.equal(isSceneBlurActive(undefined, NaN), false);
});
