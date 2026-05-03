import { DateTime } from "luxon";

/** Current UTC calendar day at 00:00Z, as ISO string (matches API `Task.date`). */
export function utcTaskDayStartIso(): string {
  return DateTime.utc().startOf("day").toISO({ suppressMilliseconds: true })!;
}

/** Inclusive UTC range for history (`from` … `to` at UTC midnight). */
export function utcHistoryRangeIso(daysBack: number): { from: string; to: string } {
  const to = DateTime.utc().startOf("day");
  const from = to.minus({ days: daysBack });
  return {
    from: from.toISO({ suppressMilliseconds: true })!,
    to: to.toISO({ suppressMilliseconds: true })!,
  };
}
