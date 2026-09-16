import { type NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";
import { can, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { carPerformance, monthlySeries, resolvePeriod } from "@/lib/analytics";
import { BOOKING_STATUS_META } from "@/lib/bookings";
import { dateKeyIST, endOfDayIST, parseDateInput, startOfDayIST, toDateInput } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatRegistration, normalizeRegistration } from "@/lib/fleet";
import { labelOf, PAYMENT_MODE_OPTIONS, PAYMENT_TYPE_OPTIONS } from "@/lib/status";
import { round2, toNum } from "@/lib/utils";

type Cell = string | number | null | undefined;

/** RFC 4180 CSV. Leading =,+,-,@ are neutralised so a spreadsheet never runs a cell as a formula. */
function csv(header: string[], rows: Cell[][]) {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

const iso = (d: Date | null | undefined) => (d ? `${dateKeyIST(d)} ${new Date(d.getTime() + 330 * 60_000).toISOString().slice(11, 16)}` : "");

const PERMISSION: Record<string, string> = {
  customers: "customers.export",
  cars: "cars.export",
  bookings: "bookings.view",
  payments: "payments.export",
  expenses: "expenses.export",
  "car-profit": "reports.export",
  monthly: "reports.export",
};

export async function GET(request: NextRequest, ctx: RouteContext<"/export/[type]">) {
  const { type } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const permission = PERMISSION[type];
  if (!permission) return new NextResponse("Unknown export", { status: 404 });
  if (!can(user, permission)) return new NextResponse("Not allowed", { status: 403 });

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const from = sp.get("from") && sp.get("from") !== "all" ? parseDateInput(sp.get("from")!) : null;
  const to = sp.get("to") ? parseDateInput(sp.get("to")!) : null;

  let body: string;

  switch (type) {
    case "customers": {
      const customers = await prisma.customer.findMany({
        where: q ? { OR: [{ fullName: { contains: q } }, { mobile: { contains: q } }, { customerCode: { contains: q } }] } : {},
        orderBy: { fullName: "asc" },
        include: { bookings: { where: { status: { in: ["CONFIRMED", "HANDED_OVER", "RUNNING", "RETURNED", "CLOSED", "CANCELLED"] } }, select: { totalAmount: true, paidAmount: true } } },
      });
      body = csv(
        ["Code", "Name", "Mobile", "Alt mobile", "Email", "City", "Licence no.", "Licence expiry", "Type", "Status", "Bookings", "Billed", "Paid", "Pending", "Added"],
        customers.map((c) => {
          const billed = round2(c.bookings.reduce((s, b) => s + toNum(b.totalAmount), 0));
          const paid = round2(c.bookings.reduce((s, b) => s + toNum(b.paidAmount), 0));
          return [c.customerCode, c.fullName, c.mobile, c.altMobile, c.email, c.city, c.drivingLicenseNo, toDateInput(c.licenseExpiry), c.customerType, c.status, c.bookings.length, billed, paid, round2(billed - paid), iso(c.createdAt)];
        }),
      );
      break;
    }
    case "cars": {
      const cars = await prisma.car.findMany({ orderBy: [{ company: "asc" }, { model: "asc" }] });
      body = csv(
        ["Registration", "Make", "Model", "Variant", "Year", "Fuel", "Transmission", "Status", "Odometer", "Daily rate", "Included km/day", "Extra km rate", "Deposit", "Next service km", "Next service date"],
        cars.map((c) => [formatRegistration(c.registrationNumber), c.company, c.model, c.variant, c.year, c.fuelType, c.transmission, c.status, c.currentKm, toNum(c.dailyRate), c.includedKmPerDay, toNum(c.extraKmRate), toNum(c.securityDeposit), c.serviceDueKm, toDateInput(c.nextServiceDate)]),
      );
      break;
    }
    case "bookings": {
      const where: Prisma.BookingWhereInput = {
        ...(from ? { returnAt: { gte: startOfDayIST(from) } } : {}),
        ...(to ? { pickupAt: { lte: endOfDayIST(to) } } : {}),
        ...(q
          ? {
              OR: [
                { bookingNumber: { contains: q } },
                { customer: { fullName: { contains: q } } },
                { customer: { mobile: { contains: q } } },
                { car: { registrationNumber: { contains: normalizeRegistration(q) || q } } },
              ],
            }
          : {}),
      };
      const bookings = await prisma.booking.findMany({
        where,
        orderBy: { pickupAt: "desc" },
        include: { customer: { select: { fullName: true, mobile: true } }, car: { select: { registrationNumber: true, model: true } } },
      });
      body = csv(
        ["Booking", "Status", "Customer", "Mobile", "Car", "Registration", "Pickup", "Return", "Actual pickup", "Actual return", "Days", "Start km", "End km", "Rental", "Extra km", "Late fee", "Fuel", "Damage", "Cleaning", "Other", "Discount", "Total", "Paid", "Balance", "Deposit"],
        bookings.map((b) => [
          b.bookingNumber, BOOKING_STATUS_META[b.status].label, b.customer.fullName, b.customer.mobile, b.car.model, formatRegistration(b.car.registrationNumber),
          iso(b.pickupAt), iso(b.returnAt), iso(b.actualPickupAt), iso(b.actualReturnAt), b.rentalDays, b.startingKm, b.endingKm,
          toNum(b.rentalAmount), toNum(b.extraKmAmount), toNum(b.lateFeeAmount), toNum(b.fuelAmount), toNum(b.damageAmount), toNum(b.cleaningAmount), toNum(b.otherAmount), toNum(b.discountAmount),
          toNum(b.totalAmount), toNum(b.paidAmount), round2(toNum(b.totalAmount) - toNum(b.paidAmount)), toNum(b.securityDeposit),
        ]),
      );
      break;
    }
    case "payments": {
      const payments = await prisma.payment.findMany({
        where: {
          ...(from || to ? { paidAt: { ...(from ? { gte: startOfDayIST(from) } : {}), ...(to ? { lte: endOfDayIST(to) } : {}) } } : {}),
          ...(sp.get("mode") ? { paymentMode: sp.get("mode") as never } : {}),
          ...(sp.get("type") ? { paymentType: sp.get("type") as never } : {}),
          ...(q ? { OR: [{ paymentNumber: { contains: q } }, { referenceNo: { contains: q } }, { customer: { fullName: { contains: q } } }] } : {}),
        },
        orderBy: { paidAt: "desc" },
        include: { customer: { select: { fullName: true, mobile: true } }, booking: { select: { bookingNumber: true } }, receivedBy: { select: { name: true } } },
      });
      body = csv(
        ["Receipt", "Date", "Customer", "Mobile", "Booking", "Type", "Mode", "Reference", "Amount", "Status", "Received by", "Note"],
        payments.map((p) => [p.paymentNumber, iso(p.paidAt), p.customer.fullName, p.customer.mobile, p.booking?.bookingNumber, labelOf(PAYMENT_TYPE_OPTIONS, p.paymentType), labelOf(PAYMENT_MODE_OPTIONS, p.paymentMode), p.referenceNo, toNum(p.amount), p.status, p.receivedBy?.name, p.notes]),
      );
      break;
    }
    case "expenses": {
      const expenses = await prisma.expense.findMany({
        where: {
          ...(from || to ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
          ...(Number(sp.get("category")) ? { categoryId: Number(sp.get("category")) } : {}),
          ...(sp.get("car") === "none" ? { carId: null } : Number(sp.get("car")) ? { carId: Number(sp.get("car")) } : {}),
          ...(q ? { OR: [{ description: { contains: q } }, { expenseNo: { contains: q } }, { vendor: { name: { contains: q } } }] } : {}),
        },
        orderBy: { expenseDate: "desc" },
        include: { category: true, vendor: true, car: { select: { registrationNumber: true, model: true } } },
      });
      body = csv(
        ["Expense", "Date", "Category", "Car", "Registration", "Vendor", "Mode", "Reference", "Amount", "Description"],
        expenses.map((e) => [e.expenseNo, toDateInput(e.expenseDate), e.category.name, e.car?.model, e.car ? formatRegistration(e.car.registrationNumber) : "", e.vendor?.name, labelOf(PAYMENT_MODE_OPTIONS, e.paymentMode), e.referenceNo, toNum(e.amount), e.description]),
      );
      break;
    }
    case "car-profit": {
      const period = resolvePeriod(undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined);
      const rows = await carPerformance(period);
      body = csv(
        ["Car", "Registration", "Status", "Rentals", "Revenue", "Expenses", "Contribution", "Utilisation %", "Km", "Revenue per km", "Period"],
        rows.map((r) => [r.name, formatRegistration(r.registrationNumber), r.status, r.rentals, r.revenue, r.expenses, r.profit, r.utilization, r.km, r.revenuePerKm, `${period.fromKey} to ${period.toKey}`]),
      );
      break;
    }
    default: {
      const series = await monthlySeries(12);
      body = csv(
        ["Month", "Collections", "Expenses", "Profit", "Billed (returned)", "Bookings"],
        series.map((m) => [m.month, m.collections, m.expenses, m.profit, m.billed, m.bookings]),
      );
    }
  }

  await recordAudit({ userId: user.id, action: "report.export", entity: "Export", entityId: type, summary: `Exported ${type}` });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anish-${type}-${dateKeyIST(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
