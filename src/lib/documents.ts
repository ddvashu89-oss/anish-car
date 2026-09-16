import { daysBetweenDateOnly } from "@/lib/dates";

export const CAR_DOCUMENT_TYPES = ["RC", "Insurance", "PUC", "Permit", "Fitness", "Road Tax", "Other"];
export const CUSTOMER_DOCUMENT_TYPES = ["Driving Licence", "Aadhaar", "PAN", "Passport", "Voter ID", "Rental Agreement", "Other"];
export const ID_PROOF_TYPES = ["Aadhaar", "PAN", "Passport", "Voter ID", "Other"];

export type DocState = "VALID" | "EXPIRING_SOON" | "URGENT" | "EXPIRED" | "NA";

export const DOC_STATE_META: Record<DocState, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  VALID: { label: "Valid", tone: "success" },
  EXPIRING_SOON: { label: "Expiring soon", tone: "warning" },
  URGENT: { label: "Urgent", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "danger" },
  NA: { label: "No expiry", tone: "neutral" },
};

/**
 * >window days: valid · within window: expiring · within 7 days: urgent · past: expired.
 * `today` and `expiry` are date-only values (UTC midnight).
 */
export function documentState(expiry: Date | null | undefined, today: Date, windowDays = 30) {
  if (!expiry) return { state: "NA" as DocState, daysLeft: null };
  const daysLeft = daysBetweenDateOnly(today, expiry);
  let state: DocState = "VALID";
  if (daysLeft < 0) state = "EXPIRED";
  else if (daysLeft <= 7) state = "URGENT";
  else if (daysLeft <= windowDays) state = "EXPIRING_SOON";
  return { state, daysLeft };
}

export function daysLeftLabel(daysLeft: number | null) {
  if (daysLeft === null) return "";
  if (daysLeft < 0) return `${Math.abs(daysLeft)} day${daysLeft === -1 ? "" : "s"} ago`;
  if (daysLeft === 0) return "today";
  return `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}
