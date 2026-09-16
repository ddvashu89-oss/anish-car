/**
 * The business runs on India time no matter where the server is hosted.
 * "Wall clock" values are shifted into UTC fields so plain UTC getters read IST.
 */

export const APP_TIME_ZONE = "Asia/Kolkata";
const OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const toWall = (d: Date) => new Date(d.getTime() + OFFSET_MS);
const fromWall = (d: Date) => new Date(d.getTime() - OFFSET_MS);

export function startOfDayIST(date = new Date()) {
  const wall = toWall(date);
  wall.setUTCHours(0, 0, 0, 0);
  return fromWall(wall);
}

export function endOfDayIST(date = new Date()) {
  const wall = toWall(date);
  wall.setUTCHours(23, 59, 59, 999);
  return fromWall(wall);
}

export function startOfMonthIST(date = new Date(), monthOffset = 0) {
  const wall = toWall(date);
  wall.setUTCMonth(wall.getUTCMonth() + monthOffset, 1);
  wall.setUTCHours(0, 0, 0, 0);
  return fromWall(wall);
}

export function endOfMonthIST(date = new Date(), monthOffset = 0) {
  const wall = toWall(date);
  wall.setUTCMonth(wall.getUTCMonth() + monthOffset + 1, 0);
  wall.setUTCHours(23, 59, 59, 999);
  return fromWall(wall);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** "2026-09" for grouping by month in IST. */
export function monthKeyIST(date: Date) {
  return toWall(date).toISOString().slice(0, 7);
}

/** "2026-09-16" — the IST calendar date of an instant. */
export function dateKeyIST(date: Date) {
  return toWall(date).toISOString().slice(0, 10);
}

/** Day of week in IST, 0 = Sunday. */
export function weekdayIST(date: Date) {
  return toWall(date).getUTCDay();
}

export function todayKeyIST() {
  return dateKeyIST(new Date());
}

// ── <input type="datetime-local"> ────────────────────────

export function toDateTimeInput(date: Date | null | undefined) {
  if (!date) return "";
  return toWall(date).toISOString().slice(0, 16);
}

export function parseDateTimeInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ── <input type="date"> for @db.Date columns ─────────────
// Date-only columns are stored as UTC midnight of the calendar day.

export function toDateInput(date: Date | null | undefined) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Today as a date-only value, comparable with @db.Date columns. */
export function todayDateOnly() {
  return parseDateInput(todayKeyIST())!;
}

/** First day of an IST month as a date-only value (monthOffset −1 = last month). */
export function monthStartDateOnly(monthOffset = 0) {
  return parseDateInput(dateKeyIST(startOfMonthIST(new Date(), monthOffset)))!;
}

/** Last day of an IST month as a date-only value. */
export function monthEndDateOnly(monthOffset = 0) {
  return parseDateInput(dateKeyIST(endOfMonthIST(new Date(), monthOffset)))!;
}

export function daysBetweenDateOnly(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}
