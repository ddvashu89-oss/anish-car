import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/db";
import { DEFAULT_AGREEMENT_TERMS } from "@/lib/defaults";

export type AppSettings = {
  company: { name: string; phone: string; email: string; address: string; gstin: string };
  billing: {
    taxPercent: number;
    lateFeePerHour: number;
    lateGraceMinutes: number;
    invoiceTerms: string;
    agreementTerms: string;
  };
  reminders: {
    insuranceDays: number;
    pucDays: number;
    fitnessDays: number;
    licenceDays: number;
    serviceKm: number;
    serviceDays: number;
    bookingDays: number;
  };
};

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};

export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const str = (key: string, fallback = "") => map.get(key) ?? fallback;

  return {
    company: {
      name: str("company.name", "Anish Car Rent"),
      phone: str("company.phone"),
      email: str("company.email"),
      address: str("company.address"),
      gstin: str("company.gstin"),
    },
    billing: {
      taxPercent: num(map.get("billing.taxPercent"), 0),
      lateFeePerHour: num(map.get("billing.lateFeePerHour"), 200),
      lateGraceMinutes: num(map.get("billing.lateGraceMinutes"), 60),
      invoiceTerms: str("billing.invoiceTerms"),
      agreementTerms: str("billing.agreementTerms") || DEFAULT_AGREEMENT_TERMS,
    },
    reminders: {
      insuranceDays: num(map.get("reminders.insuranceDays"), 30),
      pucDays: num(map.get("reminders.pucDays"), 15),
      fitnessDays: num(map.get("reminders.fitnessDays"), 30),
      licenceDays: num(map.get("reminders.licenceDays"), 30),
      serviceKm: num(map.get("reminders.serviceKm"), 500),
      serviceDays: num(map.get("reminders.serviceDays"), 7),
      bookingDays: num(map.get("reminders.bookingDays"), 1),
    },
  };
});

/** Reminder window for a document type, in days. */
export function reminderDaysFor(documentType: string, settings: AppSettings) {
  const type = documentType.toLowerCase();
  if (type.includes("insurance")) return settings.reminders.insuranceDays;
  if (type.includes("puc") || type.includes("pollution")) return settings.reminders.pucDays;
  if (type.includes("fitness")) return settings.reminders.fitnessDays;
  if (type.includes("licen")) return settings.reminders.licenceDays;
  return 30;
}
