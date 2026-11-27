import assert from "node:assert/strict";
import test from "node:test";
import type { WeeklyContentSlot } from "./settings";
import { hasCinamaChatName, isWeeklySlotJob, plannedSlotTimes, splitDayAndNight, validWeeklyTimes } from "./weeklyCalendarPreview";

test("CinamaChat categories recognize the official name and existing saved labels", () => {
  assert.equal(hasCinamaChatName("CinamaChat movie card"), true);
  assert.equal(hasCinamaChatName("CinemaChat movie card"), true);
  assert.equal(hasCinamaChatName("Foreign cinema news"), false);
});

test("24-hour controls reject invalid or duplicate times and split day from night at Baghdad clock boundaries", () => {
  assert.deepEqual(splitDayAndNight(["23:59", "06:00", "05:59", "18:00", "17:59", "12:00"]), {
    day: ["06:00", "12:00", "17:59"],
    night: ["05:59", "18:00", "23:59"],
  });
  assert.equal(validWeeklyTimes(["00:00", "23:59"]), true);
  for (const times of [["24:00"], ["13:60"], ["6:00"], ["19:00", "19:00"]]) {
    assert.equal(validWeeklyTimes(times), false);
  }
});

test("the next seven days use Baghdad midnight and preserve the planner's original item IDs", () => {
  const slot: WeeklyContentSlot = {
    id: "monday-reels", category: "Licensed trailers", format: "reels", interactive: false,
    count: 3, platforms: ["instagram"], times: ["19:00", "00:00", "13:00"],
  };
  // Before midnight in Baghdad, even though this is still Sunday in UTC.
  const from = "2026-11-29T20:50:00.000Z";
  const until = "2026-12-06T20:50:00.000Z";
  const jobs = plannedSlotTimes(slot, "monday", from, until);
  assert.deepEqual(jobs.map(job => [job.scheduledAt, job.automation.scheduleId, job.automation.slotId]), [
    ["2026-11-29T21:00:00.000Z", "2026-11-30", "monday-reels-2"],
    ["2026-11-30T10:00:00.000Z", "2026-11-30", "monday-reels-3"],
    ["2026-11-30T16:00:00.000Z", "2026-11-30", "monday-reels-1"],
  ]);
  assert.equal(isWeeklySlotJob(jobs[0].automation, "monday", slot.id, [slot.id]), true);
  assert.equal(isWeeklySlotJob(jobs[0].automation, "tuesday", slot.id, [slot.id]), false);
  assert.equal(isWeeklySlotJob(jobs[0].automation, "monday", slot.id, [slot.id, "monday-reels-2"]), false);
  assert.deepEqual(plannedSlotTimes(slot, "monday", "2026-11-30T16:01:00.000Z", until), []);
});
