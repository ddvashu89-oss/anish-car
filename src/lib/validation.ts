import { z } from "zod";
import { parseDateInput, parseDateTimeInput } from "@/lib/dates";

/** Form fields arrive as strings; these turn "" into undefined and coerce the rest. */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = (max = 255) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const requiredText = (label: string, max = 255) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

export const money = (label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? 0 : v),
    z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(99_999_999),
  );

export const requiredMoney = (label: string) =>
  z.coerce.number({ error: `${label} must be a number` }).positive(`${label} must be more than zero`).max(99_999_999);

export const optionalMoney = z.preprocess(blankToUndefined, z.coerce.number().min(0).max(99_999_999).optional());

export const int = (label: string, min = 0) =>
  z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min);

export const optionalInt = z.preprocess(blankToUndefined, z.coerce.number().int().min(0).optional());

export const id = (label: string) =>
  z.coerce.number({ error: `Choose a ${label}` }).int().positive(`Choose a ${label}`);

export const optionalId = z.preprocess(
  (v) => (v === "" || v === "0" || v == null ? undefined : v),
  z.coerce.number().int().positive().optional(),
);

export const dateOnly = (label: string) =>
  z.string({ error: `${label} is required` }).transform((v, ctx) => {
    const d = parseDateInput(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: `${label} is required` });
      return z.NEVER;
    }
    return d;
  });

export const optionalDateOnly = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const d = parseDateInput(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date" });
        return z.NEVER;
      }
      return d;
    }),
);

export const dateTime = (label: string) =>
  z.string({ error: `${label} is required` }).transform((v, ctx) => {
    const d = parseDateTimeInput(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: `${label} is required` });
      return z.NEVER;
    }
    return d;
  });

export const mobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^\d{10}$/, "Enter a 10-digit mobile number"));

export const optionalMobile = z.preprocess(blankToUndefined, mobile.optional());

export const optionalEmail = z.preprocess(
  blankToUndefined,
  z.string().trim().toLowerCase().email("Enter a valid email").optional(),
);

export function pick(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? undefined]));
}
