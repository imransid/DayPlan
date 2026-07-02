import { DateTime } from "luxon";

/**
 * "Today" used to be UTC's calendar day everywhere, which broke for users not
 * on UTC: at certain hours the Today screen kept showing yesterday's tasks
 * (because UTC hadn't rolled over yet), and tasks created for "today" landed
 * on a different calendar day than the user expected.
 *
 * We now use the device's LOCAL calendar day, but still represent it as that
 * day's UTC midnight so the value matches the backend's `@db.Date` storage
 * and the same string can be used as a cache key on both sides.
 *
 * Example, user in Asia/Dhaka (UTC+6) on 15 Jan at 01:00 local:
 *   DateTime.local() → 2025-01-15T01:00+06:00
 *   .toISODate()     → "2025-01-15"
 *   as UTC midnight  → "2025-01-15T00:00:00Z"
 *
 * The function name is kept as `utcTaskDayStartIso` so existing imports keep
 * working — the SEMANTICS changed, not the signature.
 */

/** Local calendar day, returned as that day's UTC-midnight ISO. */
export function utcTaskDayStartIso(): string {
  const ymd = DateTime.local().toISODate(); // local YYYY-MM-DD
  if (!ymd) {
    return DateTime.utc().startOf("day").toISO({ suppressMilliseconds: true })!;
  }
  return DateTime.fromISO(ymd, { zone: "utc" }).toISO({
    suppressMilliseconds: true,
  })!;
}

/** YYYY-MM-DD of the device's local calendar day — used for rollover detection. */
export function localCalendarDateKey(): string {
  return DateTime.local().toISODate() ?? DateTime.utc().toISODate()!;
}

/** Inclusive range for history (`from` ≤ date ≤ `to`), in the local calendar. */
export function utcHistoryRangeIso(daysBack: number): {
  from: string;
  to: string;
} {
  const todayYmd = DateTime.local().toISODate() ?? DateTime.utc().toISODate()!;
  const to = DateTime.fromISO(todayYmd, { zone: "utc" });
  const from = to.minus({ days: daysBack });
  return {
    from: from.toISO({ suppressMilliseconds: true })!,
    to: to.toISO({ suppressMilliseconds: true })!,
  };
}
