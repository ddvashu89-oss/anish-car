import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateBookingAction } from "@/lib/actions/booking-actions";
import { carAvailability, loadRateRules } from "@/lib/bookings";
import { parseDateTimeInput, toDateTimeInput } from "@/lib/dates";
import { qs, toNum } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { BookingForm } from "../../booking-form";
import { bookingCustomers } from "../../data";
import { DatePickerForm } from "../../date-picker-form";

export const metadata: Metadata = { title: "Edit booking · Anish Car Rent" };

export default async function EditBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pickup?: string; return?: string; step?: string }>;
}) {
  await requirePermission("bookings.edit");
  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) notFound();
  const sp = await searchParams;

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) notFound();
  if (!["DRAFT", "QUOTATION", "CONFIRMED"].includes(booking.status)) redirect(`/bookings/${bookingId}`);

  const pickupStr = sp.pickup ?? toDateTimeInput(booking.pickupAt);
  const returnStr = sp.return ?? toDateTimeInput(booking.returnAt);
  const pickup = parseDateTimeInput(pickupStr);
  const returnAt = parseDateTimeInput(returnStr);
  const valid = Boolean(pickup && returnAt && returnAt > pickup);

  if (!valid || sp.step === "dates") {
    return (
      <>
        <PageHeader title={`Edit ${booking.bookingNumber}`} description="Change the dates, then pick the car again." />
        <DatePickerForm
          action={`/bookings/${bookingId}/edit`}
          pickup={pickupStr}
          returnAt={returnStr}
          hidden={{}}
          error={!valid ? "Return must be after pickup." : undefined}
        />
      </>
    );
  }

  const [cars, customers, rules] = await Promise.all([
    carAvailability(pickup!, returnAt!, bookingId),
    bookingCustomers(),
    loadRateRules(),
  ]);

  // Keep the current customer selectable even if they've since been set inactive.
  if (!customers.some((c) => c.id === booking.customerId)) {
    const current = await prisma.customer.findUnique({
      where: { id: booking.customerId },
      select: { id: true, fullName: true, mobile: true, customerCode: true, status: true, licenseExpiry: true },
    });
    if (current) customers.unshift({ ...current, licenseExpiry: current.licenseExpiry?.toISOString() ?? null });
  }

  const rateWasOverridden = toNum(booking.rentalAmount) === Math.round(toNum(booking.dailyRate) * booking.rentalDays * 100) / 100;

  return (
    <>
      <PageHeader
        title={`Edit ${booking.bookingNumber}`}
        description="The booked daily rate is kept as an override — clear it to re-price with the current pricing rules."
      />
      <BookingForm
        mode="edit"
        action={updateBookingAction.bind(null, bookingId)}
        pickup={pickupStr}
        returnAt={returnStr}
        changeDatesHref={`/bookings/${bookingId}/edit${qs({ pickup: pickupStr, return: returnStr, step: "dates" })}`}
        cars={cars}
        customers={customers}
        rules={rules}
        paidSoFar={toNum(booking.paidAmount)}
        defaults={{
          customerId: booking.customerId,
          carId: booking.carId,
          pickupLocation: booking.pickupLocation,
          dropLocation: booking.dropLocation,
          rateOverride: rateWasOverridden ? toNum(booking.dailyRate) : null,
          discountAmount: toNum(booking.discountAmount),
          securityDeposit: toNum(booking.securityDeposit),
          includedKmPerDay: booking.includedKmPerDay,
          extraKmRate: toNum(booking.extraKmRate),
          notes: booking.notes,
        }}
      />
    </>
  );
}
