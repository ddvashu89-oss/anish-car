import type { Metadata } from "next";
import Link from "next/link";
import { Fuel, Plus } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { monthStartDateOnly } from "@/lib/dates";
import { formatRegistration } from "@/lib/fleet";
import { fuelEfficiency } from "@/lib/fuel";
import { formatDate, formatKm, formatMoney, formatNumber, qs, round2, toNum } from "@/lib/utils";
import { deleteFuelAction } from "@/lib/actions/fuel-actions";
import { ActionButton } from "@/components/form/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, MiniStat } from "@/components/ui/display";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, PAGE_SIZE, pageFrom } from "@/components/ui/pagination";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { carOptions } from "../documents/owners";

export const metadata: Metadata = { title: "Fuel · Anish Car Rent" };

export default async function FuelPage({ searchParams }: { searchParams: Promise<{ car?: string; page?: string }> }) {
  const actor = await requirePermission("fuel.view");
  const sp = await searchParams;
  const page = pageFrom(sp.page);
  const carFilter = Number(sp.car) || undefined;
  const firstOfMonth = monthStartDateOnly();

  const [records, total, allFills, monthSpend, cars] = await Promise.all([
    prisma.fuelRecord.findMany({
      where: carFilter ? { carId: carFilter } : {},
      orderBy: [{ filledAt: "desc" }, { km: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { car: { select: { id: true, model: true, registrationNumber: true } }, recordedBy: { select: { name: true } } },
    }),
    prisma.fuelRecord.count({ where: carFilter ? { carId: carFilter } : {} }),
    prisma.fuelRecord.findMany({
      select: { id: true, carId: true, km: true, litres: true, amount: true, isFullTank: true, car: { select: { model: true, registrationNumber: true, company: true } } },
    }),
    prisma.fuelRecord.aggregate({ where: { filledAt: { gte: firstOfMonth } }, _sum: { amount: true, litres: true } }),
    carOptions(),
  ]);

  const byCar = new Map<number, typeof allFills>();
  for (const f of allFills) byCar.set(f.carId, [...(byCar.get(f.carId) ?? []), f]);

  const perCar = [...byCar.entries()]
    .map(([carId, fills]) => {
      const eff = fuelEfficiency(fills.map((f) => ({ id: f.id, km: f.km, litres: toNum(f.litres), amount: toNum(f.amount), isFullTank: f.isFullTank })));
      return {
        carId,
        car: fills[0].car,
        litres: round2(fills.reduce((s, f) => s + toNum(f.litres), 0)),
        spend: round2(fills.reduce((s, f) => s + toNum(f.amount), 0)),
        kmPerLitre: eff.kmPerLitre,
        costPerKm: eff.costPerKm,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const allLitres = perCar.reduce((s, c) => s + c.litres, 0);
  const allSpend = perCar.reduce((s, c) => s + c.spend, 0);
  const fleetAvg = perCar.filter((c) => c.kmPerLitre).map((c) => c.kmPerLitre!);

  // Map each visible fill to its computed mileage.
  const effByFill = new Map<number, number>();
  for (const fills of byCar.values()) {
    const eff = fuelEfficiency(fills.map((f) => ({ id: f.id, km: f.km, litres: toNum(f.litres), amount: toNum(f.amount), isFullTank: f.isFullTank })));
    for (const [id, v] of eff.perFill) effByFill.set(id, v.kmPerLitre);
  }

  return (
    <>
      <PageHeader
        title="Fuel"
        description="Every fill, and what each car really costs to run."
        actions={
          can(actor, "fuel.create") ? (
            <LinkButton href="/fuel/new">
              <Plus /> Add fuel
            </LinkButton>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label="This month" value={formatMoney(monthSpend._sum.amount)} tone="warning" />
        <MiniStat label="Litres this month" value={`${formatNumber(monthSpend._sum.litres)} L`} />
        <MiniStat label="All-time fuel spend" value={formatMoney(allSpend)} />
        <MiniStat
          label="Fleet average mileage"
          value={fleetAvg.length ? `${round2(fleetAvg.reduce((a, b) => a + b, 0) / fleetAvg.length)} km/l` : "—"}
          tone="primary"
        />
      </div>

      {perCar.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>By car</CardTitle>
            <span className="text-xs text-muted">{formatNumber(allLitres)} L in total</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Car</Th>
                  <Th className="text-right">Litres</Th>
                  <Th className="text-right">Spend</Th>
                  <Th className="text-right">Mileage</Th>
                  <Th className="text-right">Fuel cost / km</Th>
                </tr>
              </thead>
              <tbody>
                {perCar.map((c) => (
                  <tr key={c.carId}>
                    <Td>
                      <Link href={`/cars/${c.carId}?tab=fuel`} className="hover:text-primary">
                        {c.car.company} {c.car.model}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted">{formatRegistration(c.car.registrationNumber)}</span>
                    </Td>
                    <Td className="text-right tabular-nums">{formatNumber(c.litres)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(c.spend)}</Td>
                    <Td className="text-right tabular-nums">{c.kmPerLitre ? `${c.kmPerLitre} km/l` : "—"}</Td>
                    <Td className="text-right tabular-nums">{c.costPerKm ? formatMoney(c.costPerKm) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <FilterBar action="/fuel" resetHref="/fuel">
        <FilterSelect name="car" label="Car" defaultValue={sp.car} placeholder="All cars" options={cars} />
      </FilterBar>

      <TableWrap>
        {records.length === 0 ? (
          <EmptyState icon={Fuel} title="No fuel entries yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Car</Th>
                <Th className="text-right">Odometer</Th>
                <Th className="text-right">Litres</Th>
                <Th className="text-right">₹/L</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Mileage</Th>
                <Th>Station</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {records.map((f) => (
                <tr key={f.id} className="hover:bg-surface-2/60">
                  <Td className="text-xs whitespace-nowrap">
                    {formatDate(f.filledAt)}
                    {f.recordedBy ? <span className="block text-[11px] text-muted">{f.recordedBy.name}</span> : null}
                  </Td>
                  <Td>
                    <Link href={`/cars/${f.car.id}?tab=fuel`} className="hover:text-primary">
                      {f.car.model}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted">{formatRegistration(f.car.registrationNumber)}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatKm(f.km)}</Td>
                  <Td className="text-right tabular-nums">
                    {formatNumber(f.litres)}
                    {!f.isFullTank ? <span className="block text-[10px] text-muted">partial</span> : null}
                  </Td>
                  <Td className="text-right tabular-nums">{formatMoney(f.pricePerLitre)}</Td>
                  <Td className="text-right font-medium tabular-nums">{formatMoney(f.amount)}</Td>
                  <Td className="text-right text-xs tabular-nums">{effByFill.has(f.id) ? `${effByFill.get(f.id)} km/l` : "—"}</Td>
                  <Td className="text-xs">{f.station ?? "—"}</Td>
                  <Td className="text-right">
                    {can(actor, "fuel.delete") ? (
                      <ActionButton action={deleteFuelAction} fields={{ fuelId: f.id }} confirm="Delete this fuel entry and its expense?" className="h-7 text-danger">
                        Delete
                      </ActionButton>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <Pagination page={page} total={total} hrefFor={(p) => `/fuel${qs({ car: sp.car, page: p })}`} />
    </>
  );
}
