import type { SocialFormat, SocialWeekday, WeeklyContentSlot } from "./settings";
import type { SocialPlatform, SocialPublicationInput } from "./types";

const WEEKDAYS: SocialWeekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function localBaghdadTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 16);
}

export function baghdadIso(local: string): string {
  return new Date(`${local}:00+03:00`).toISOString();
}

export function validWeeklyTimes(times: string[]): boolean {
  return times.every(time => CLOCK_TIME.test(time)) && new Set(times).size === times.length;
}

export function splitDayAndNight(times: string[]) {
  const valid = times.filter(time => CLOCK_TIME.test(time)).sort();
  return {
    day: valid.filter(time => time >= "06:00" && time < "18:00"),
    night: valid.filter(time => time < "06:00" || time >= "18:00"),
  };
}

/** Only formats offered by the current provider adapters. */
export function supportsWeeklyFormat(platform: SocialPlatform, format: SocialFormat, interactive: boolean): boolean {
  if (interactive) return false;
  if (platform === "instagram") return format === "reels" || format === "feed";
  if (platform === "facebook" || platform === "telegram") return format === "feed";
  return false;
}

export type PlannedSlot = {
  scheduledAt: string;
  automation: NonNullable<SocialPublicationInput["automation"]>;
};

export function plannedSlotTimes(slot: WeeklyContentSlot, weekday: SocialWeekday, from: string, until: string): PlannedSlot[] {
  const start = Date.parse(from);
  const end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !validWeeklyTimes(slot.times)) return [];
  const firstDay = localBaghdadTime(from).slice(0, 10);
  const date = new Date(`${firstDay}T00:00:00Z`);
  const results: PlannedSlot[] = [];
  for (let offset = 0; offset <= 7; offset++, date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay();
    if (WEEKDAYS[day] !== weekday) continue;
    const dateKey = date.toISOString().slice(0, 10);
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - (day + 6) % 7);
    slot.times.forEach((time, index) => {
      const at = baghdadIso(`${dateKey}T${time}`);
      const timestamp = Date.parse(at);
      if (timestamp < start || timestamp >= end) return;
      const itemId = `${slot.id}-${index + 1}`;
      results.push({
        scheduledAt: at,
        automation: { scheduleId: monday.toISOString().slice(0, 10), weekday, slotId: itemId.length <= 64 ? itemId : slot.id, category: slot.category, format: slot.format, adminOverride: true },
      });
    });
  }
  return results.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function isWeeklySlotJob(
  automation: SocialPublicationInput["automation"],
  weekday: SocialWeekday,
  slotId: string,
  daySlotIds: string[],
): boolean {
  if (!automation || automation.weekday !== weekday) return false;
  if (daySlotIds.includes(automation.slotId)) return automation.slotId === slotId;
  // Weekly automation appends the item ordinal to the configured slot ID.
  return automation.slotId.replace(/-[1-8]$/, "") === slotId;
}
