import type { BillingCycle } from "../plans";

/** Always derive from the original UTC anchor, never the previous clamped month. */
export function billingBoundaryUTC(anchor: Date, cycle: BillingCycle, index: number): Date {
  if (!Number.isFinite(anchor.getTime()) || !Number.isSafeInteger(index) || index < 0 || index > 1200 ||
      (cycle !== "monthly" && cycle !== "yearly")) throw new Error("Invalid billing period");
  const monthOffset = index * (cycle === "yearly" ? 12 : 1);
  const month = anchor.getUTCMonth() + monthOffset;
  const year = anchor.getUTCFullYear() + Math.floor(month / 12);
  if (year < 1970 || year > 9999) throw new Error("Invalid billing period");
  const day = Math.min(anchor.getUTCDate(), new Date(Date.UTC(year, month % 12 + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month % 12, day, anchor.getUTCHours(), anchor.getUTCMinutes(),
    anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
}

export function billingPeriodUTC(anchor: Date, cycle: BillingCycle, index: number) {
  return { start: billingBoundaryUTC(anchor, cycle, index), end: billingBoundaryUTC(anchor, cycle, index + 1) };
}

export function withinBillingPeriod(now: Date, start: Date, end: Date): boolean {
  return [now, start, end].every((date) => Number.isFinite(date.getTime())) &&
    start.getTime() <= now.getTime() && now.getTime() < end.getTime();
}
