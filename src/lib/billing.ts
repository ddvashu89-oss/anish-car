/**
 * Pricing and billing rules. Pure functions only — the booking screens import this
 * for live previews and the server actions import it to compute what is saved,
 * so the number a customer is quoted is the number that gets billed.
 */

import { dateKeyIST, weekdayIST } from "@/lib/dates";
import { round2 } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type RateRuleInput = {
  id: number;
  carId: number | null;
  kind: "DURATION_SLAB" | "WEEKEND" | "SEASONAL" | "HOLIDAY";
  label: string;
  minDays: number | null;
  maxDays: number | null;
  /** "YYYY-MM-DD" */
  startDate: string | null;
  endDate: string | null;
  dailyRate: number;
  priority: number;
  isActive: boolean;
};

export type CarPricing = {
  id: number;
  dailyRate: number;
  includedKmPerDay: number;
  extraKmRate: number;
  securityDeposit: number;
};

export type QuoteLine = { date: string; rate: number; source: string };

export type Quote = {
  days: number;
  lines: QuoteLine[];
  rentalAmount: number;
  averageDailyRate: number;
  includedKm: number | null;
};

/** Billed in 24-hour blocks; anything under a full day still counts as one. */
export function rentalDays(pickupAt: Date, returnAt: Date) {
  const ms = returnAt.getTime() - pickupAt.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / DAY_MS));
}

function applies(rule: RateRuleInput, carId: number) {
  return rule.isActive && (rule.carId === null || rule.carId === carId);
}

/** Car-specific rules beat global ones; then higher priority; then the cheaper rate. */
function best(rules: RateRuleInput[]) {
  return [...rules].sort(
    (a, b) =>
      Number(b.carId !== null) - Number(a.carId !== null) ||
      b.priority - a.priority ||
      a.dailyRate - b.dailyRate,
  )[0];
}

export function quoteRental(
  car: CarPricing,
  rules: RateRuleInput[],
  pickupAt: Date,
  returnAt: Date,
): Quote {
  const days = rentalDays(pickupAt, returnAt);
  const relevant = rules.filter((r) => applies(r, car.id));

  const slab = best(
    relevant.filter(
      (r) =>
        r.kind === "DURATION_SLAB" &&
        (r.minDays == null || days >= r.minDays) &&
        (r.maxDays == null || days <= r.maxDays),
    ),
  );
  const baseRate = slab ? slab.dailyRate : car.dailyRate;
  const baseSource = slab ? slab.label : "Standard rate";

  const lines: QuoteLine[] = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(pickupAt.getTime() + i * DAY_MS);
    const date = dateKeyIST(dayStart);

    const dated = best(
      relevant.filter(
        (r) =>
          (r.kind === "HOLIDAY" || r.kind === "SEASONAL") &&
          r.startDate != null &&
          r.endDate != null &&
          date >= r.startDate &&
          date <= r.endDate,
      ),
    );

    const weekday = weekdayIST(dayStart);
    const weekend =
      weekday === 0 || weekday === 6 ? best(relevant.filter((r) => r.kind === "WEEKEND")) : undefined;

    const rule = dated ?? weekend;
    lines.push({
      date,
      rate: rule ? rule.dailyRate : baseRate,
      source: rule ? rule.label : baseSource,
    });
  }

  const rentalAmount = round2(lines.reduce((sum, line) => sum + line.rate, 0));

  return {
    days,
    lines,
    rentalAmount,
    averageDailyRate: days > 0 ? round2(rentalAmount / days) : 0,
    includedKm: car.includedKmPerDay > 0 ? car.includedKmPerDay * days : null,
  };
}

// ── Return / final bill ──────────────────────────────────

export type KmCharge = {
  totalKm: number;
  includedKm: number | null;
  extraKm: number;
  extraKmAmount: number;
};

/** includedKmPerDay of 0 means unlimited kilometres. */
export function kmCharge(opts: {
  startingKm: number;
  endingKm: number;
  rentalDays: number;
  includedKmPerDay: number;
  extraKmRate: number;
}): KmCharge {
  const totalKm = Math.max(0, opts.endingKm - opts.startingKm);
  if (opts.includedKmPerDay <= 0) {
    return { totalKm, includedKm: null, extraKm: 0, extraKmAmount: 0 };
  }
  const includedKm = opts.includedKmPerDay * opts.rentalDays;
  const extraKm = Math.max(0, totalKm - includedKm);
  return { totalKm, includedKm, extraKm, extraKmAmount: round2(extraKm * opts.extraKmRate) };
}

export function lateHours(scheduledReturn: Date, actualReturn: Date, graceMinutes: number) {
  const lateMs = actualReturn.getTime() - scheduledReturn.getTime() - graceMinutes * 60 * 1000;
  return lateMs > 0 ? Math.ceil(lateMs / HOUR_MS) : 0;
}

export type Charges = {
  rentalAmount: number;
  extraKmAmount: number;
  lateFeeAmount: number;
  fuelAmount: number;
  damageAmount: number;
  cleaningAmount: number;
  otherAmount: number;
  discountAmount: number;
};

export function billTotal(c: Charges) {
  return round2(
    Math.max(
      0,
      c.rentalAmount +
        c.extraKmAmount +
        c.lateFeeAmount +
        c.fuelAmount +
        c.damageAmount +
        c.cleaningAmount +
        c.otherAmount -
        c.discountAmount,
    ),
  );
}

export const CHARGE_LABELS: Array<[keyof Charges, string]> = [
  ["rentalAmount", "Rental charges"],
  ["extraKmAmount", "Extra km"],
  ["lateFeeAmount", "Late return"],
  ["fuelAmount", "Fuel"],
  ["damageAmount", "Damage"],
  ["cleaningAmount", "Cleaning"],
  ["otherAmount", "Other charges"],
];

export const FUEL_LEVELS = ["Empty", "1/4", "1/2", "3/4", "Full"] as const;

export const HANDOVER_CHECKLIST = [
  "Spare wheel",
  "Jack & tools",
  "RC & insurance copy",
  "AC working",
  "Lights & indicators",
  "Wipers",
  "Music system",
  "Interior clean",
  "Exterior clean",
  "Tyres OK",
] as const;

export const DAMAGE_PANELS = [
  "Front bumper",
  "Rear bumper",
  "Bonnet",
  "Roof",
  "Left front door",
  "Left rear door",
  "Right front door",
  "Right rear door",
  "Windshield",
  "Rear glass",
  "Left mirror",
  "Right mirror",
  "Tyres / wheels",
  "Interior",
] as const;
