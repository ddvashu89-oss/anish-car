import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { createBookingAction } from "@/lib/actions/booking-actions";
import { carAvailability, loadRateRules } from "@/lib/bookings";
import { addDays, parseDateTimeInput, toDateTimeInput } from "@/lib/dates";
import { qs } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { BookingForm } from "../booking-form";
import { bookingCustomers } from "../data";
import { DatePickerForm } from "../date-picker-form";

export const metadata: Metadata = { title: "New booking · Anish Car Rent" };

function defaultPickup() {
  // Next full hour, India time.
  const d = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);
  return toDateTimeInput(d);
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ pickup?: string; return?: string; carId?: string; customerId?: string; step?: string }>;
}) {
  await requirePermission("bookings.create");
  const sp = await searchParams;

  const pickupStr = sp.pickup ?? "";
  const returnStr = sp.return ?? "";
  const pickup = parseDateTimeInput(pickupStr);
  const returnAt = parseDateTimeInput(returnStr);
  const datesChosen = Boolean(pickup && returnAt);
  const datesValid = datesChosen && returnAt! > pickup!;

  const fallbackPickup = defaultPickup();
  const fallbackReturn = toDateTimeInput(addDays(parseDateTimeInput(fallbackPickup)!, 1));

  const hidden = { carId: sp.carId, customerId: sp.customerId };

  if (!datesValid || sp.step === "dates") {
    return (
      <>
        <PageHeader title="New booking" description="Start with the dates — you'll only see cars that are free." />
        <DatePickerForm
          action="/bookings/new"
          pickup={pickupStr || fallbackPickup}
          returnAt={returnStr || fallbackReturn}
          hidden={hidden}
          error={datesChosen && !datesValid ? "Return must be after pickup." : undefined}
        />
      </>
    );
  }

  const [cars, customers, rules] = await Promise.all([
    carAvailability(pickup!, returnAt!),
    bookingCustomers(),
    loadRateRules(),
  ]);

  return (
    <>
      <PageHeader title="New booking" description="Pick a car and customer — the price updates as you go." />
      <BookingForm
        mode="create"
        action={createBookingAction}
        pickup={pickupStr}
        returnAt={returnStr}
        changeDatesHref={`/bookings/new${qs({ ...hidden, pickup: pickupStr, return: returnStr, step: "dates" })}`}
        cars={cars}
        customers={customers}
        rules={rules}
        defaults={{
          customerId: Number(sp.customerId) || undefined,
          carId: Number(sp.carId) || undefined,
        }}
      />
    </>
  );
}
