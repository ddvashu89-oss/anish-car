import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRegistration } from "@/lib/fleet";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatKm, formatMoney, titleCase, toNum } from "@/lib/utils";
import { Paper, PaperRow, PaperSection, Letterhead, Signatures } from "@/components/print/paper";
import { PrintToolbar } from "@/components/print/print-toolbar";

export const metadata: Metadata = { title: "Rental agreement · Anish Car Rent" };

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("bookings.view");
  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) notFound();

  const [booking, settings] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId }, include: { customer: true, car: true } }),
    getSettings(),
  ]);
  if (!booking) notFound();

  const isQuote = booking.status === "QUOTATION" || booking.status === "DRAFT";
  const c = booking.customer;
  const car = booking.car;
  const title = isQuote ? "Quotation" : "Rental agreement";

  const summary = [
    `${title} ${booking.bookingNumber}`,
    `${car.company} ${car.model} (${formatRegistration(car.registrationNumber)})`,
    `${formatDateTime(booking.pickupAt)} to ${formatDateTime(booking.returnAt)}`,
    `Total ${formatMoney(booking.totalAmount)} · Deposit ${formatMoney(booking.securityDeposit)}`,
    settings.company.name,
  ].join("\n");

  return (
    <>
      <PrintToolbar
        backHref={`/bookings/${bookingId}`}
        backLabel={`Back to ${booking.bookingNumber}`}
        whatsapp={{ phone: c.mobile, text: `Hello ${c.fullName},\n\n${summary}` }}
        email={c.email ? { to: c.email, subject: `${title} ${booking.bookingNumber}`, body: summary } : undefined}
      />

      <Paper>
        <Letterhead
          company={settings.company}
          title={title}
          meta={[
            ["No.", booking.bookingNumber],
            ["Date", formatDate(isQuote ? booking.createdAt : booking.actualPickupAt ?? booking.createdAt)],
          ]}
        />

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <PaperSection title="Hirer">
            <p className="font-semibold">{c.fullName}</p>
            <p>{c.mobile}{c.altMobile ? ` / ${c.altMobile}` : ""}</p>
            {c.email ? <p>{c.email}</p> : null}
            {c.address ? <p className="text-zinc-600">{[c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ")}</p> : null}
            <p className="mt-1 text-zinc-600">
              DL {c.drivingLicenseNo ?? "________________"}
              {c.licenseExpiry ? ` (valid till ${formatDate(c.licenseExpiry)})` : ""}
            </p>
            {c.idProofType ? <p className="text-zinc-600">{c.idProofType} {c.idProofNumber}</p> : null}
          </PaperSection>
          <PaperSection title="Vehicle">
            <p className="font-semibold">
              {car.company} {car.model} {car.variant ?? ""}
            </p>
            <p className="font-mono">{formatRegistration(car.registrationNumber)}</p>
            <p className="text-zinc-600">
              {[car.year, car.colour, titleCase(car.fuelType), titleCase(car.transmission)].filter(Boolean).join(" · ")}
            </p>
            {booking.startingKm != null ? <p className="text-zinc-600">Odometer out: {formatKm(booking.startingKm)}</p> : null}
          </PaperSection>
        </div>

        <PaperSection title="Rental period">
          <div className="grid gap-x-6 sm:grid-cols-2">
            <PaperRow label="Pickup" value={formatDateTime(booking.pickupAt)} />
            <PaperRow label="Return" value={formatDateTime(booking.returnAt)} />
            <PaperRow label="Pickup at" value={booking.pickupLocation ?? "Office"} />
            <PaperRow label="Drop at" value={booking.dropLocation ?? "Office"} />
            <PaperRow label="Duration" value={`${booking.rentalDays} day${booking.rentalDays === 1 ? "" : "s"}`} />
            <PaperRow
              label="Km allowance"
              value={booking.includedKmPerDay > 0 ? `${formatKm(booking.includedKmPerDay * booking.rentalDays)} total` : "Unlimited"}
            />
          </div>
        </PaperSection>

        <PaperSection title="Charges">
          <PaperRow label={`Rent (${booking.rentalDays} × ${formatMoney(booking.dailyRate)})`} value={formatMoney(booking.rentalAmount)} />
          {toNum(booking.discountAmount) > 0 ? <PaperRow label="Discount" value={`− ${formatMoney(booking.discountAmount)}`} /> : null}
          <PaperRow label={isQuote ? "Estimated total" : "Rental total"} value={formatMoney(booking.totalAmount)} strong />
          <div className="mt-2 grid gap-x-6 text-zinc-600 sm:grid-cols-2">
            <PaperRow label="Extra km" value={`${formatMoney(booking.extraKmRate)} / km`} />
            <PaperRow
              label="Late return"
              value={`${formatMoney(car.extraHourRate != null ? car.extraHourRate : settings.billing.lateFeePerHour)} / hour`}
            />
            <PaperRow label="Security deposit" value={formatMoney(booking.securityDeposit)} />
            {!isQuote ? <PaperRow label="Paid so far" value={formatMoney(booking.paidAmount)} /> : null}
          </div>
          {settings.billing.taxPercent > 0 ? (
            <p className="mt-1 text-[11px] text-zinc-500">Prices include GST at {settings.billing.taxPercent}%.</p>
          ) : null}
        </PaperSection>

        <PaperSection title="Terms and conditions">
          <p className="whitespace-pre-line text-[12px] text-zinc-700">{settings.billing.agreementTerms}</p>
          {isQuote ? (
            <p className="mt-2 text-[12px] text-zinc-500">
              This quotation is subject to vehicle availability at the time of confirmation.
            </p>
          ) : null}
        </PaperSection>

        {!isQuote ? (
          <>
            <p className="mt-6 text-[12px] text-zinc-700">
              I have read and agree to the terms above, and have received the vehicle in the condition recorded at handover.
            </p>
            <Signatures left={`Hirer — ${c.fullName}`} right={`For ${settings.company.name}`} />
          </>
        ) : null}
      </Paper>
    </>
  );
}
