import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { returnAction } from "@/lib/actions/booking-actions";
import { depositHeld } from "@/lib/bookings";
import { toDateTimeInput } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import { formatDateTime, toNum } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ReturnForm } from "./return-form";

export const metadata: Metadata = { title: "Receive car · Anish Car Rent" };

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("returns.create");
  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) notFound();

  const [booking, settings, deposit] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId }, include: { car: true, customer: true } }),
    getSettings(),
    depositHeld(bookingId),
  ]);
  if (!booking) notFound();
  if (booking.status !== "RUNNING" && booking.status !== "HANDED_OVER") redirect(`/bookings/${bookingId}`);

  return (
    <>
      <PageHeader
        title={`Receive ${booking.car.company} ${booking.car.model}`}
        description={`${booking.bookingNumber} · ${booking.customer.fullName} · was due ${formatDateTime(booking.returnAt)}`}
      />
      <ReturnForm
        action={returnAction.bind(null, bookingId)}
        ctx={{
          bookingId,
          scheduledReturn: booking.returnAt.toISOString(),
          startingKm: booking.startingKm ?? booking.car.currentKm,
          rentalDays: booking.rentalDays,
          includedKmPerDay: booking.includedKmPerDay,
          extraKmRate: toNum(booking.extraKmRate),
          rentalAmount: toNum(booking.rentalAmount),
          existingDiscount: toNum(booking.discountAmount),
          paidAmount: toNum(booking.paidAmount),
          hourRate: booking.car.extraHourRate != null ? toNum(booking.car.extraHourRate) : settings.billing.lateFeePerHour,
          graceMinutes: settings.billing.lateGraceMinutes,
          depositHeld: deposit.held,
          nowInput: toDateTimeInput(new Date()),
          uploadAccept: UPLOAD_ACCEPT,
        }}
      />
    </>
  );
}
