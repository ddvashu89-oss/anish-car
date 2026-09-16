import type { Metadata } from "next";
import { BadgeIndianRupee } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRegistration } from "@/lib/fleet";
import { formatDate, formatMoney } from "@/lib/utils";
import { deleteRateRuleAction, toggleRateRuleAction } from "@/lib/actions/pricing-actions";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { carOptions } from "../documents/owners";
import { RuleForm } from "./rule-form";

export const metadata: Metadata = { title: "Pricing rules · Anish Car Rent" };

const KIND_LABEL = {
  DURATION_SLAB: "Length of rental",
  WEEKEND: "Weekend",
  SEASONAL: "Season",
  HOLIDAY: "Holiday",
} as const;

export default async function PricingPage() {
  const actor = await requirePermission("settings.view");
  const canEdit = can(actor, "settings.edit");

  const [rules, cars] = await Promise.all([
    prisma.rateRule.findMany({
      orderBy: [{ isActive: "desc" }, { kind: "asc" }, { minDays: "asc" }, { startDate: "asc" }],
      include: { car: { select: { model: true, registrationNumber: true } } },
    }),
    carOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Pricing rules"
        description="Each rental day is priced by the most specific rule: holiday or season, then weekend, then the length-of-rental slab, then the car's own daily rate."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TableWrap>
            {rules.length === 0 ? (
              <EmptyState
                icon={BadgeIndianRupee}
                title="No pricing rules"
                description="Every booking uses each car's standard daily rate until you add rules."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Rule</Th>
                    <Th>When</Th>
                    <Th>Cars</Th>
                    <Th className="text-right">Rate</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                      <Td>
                        <span className="block font-medium">{r.label}</span>
                        <span className="text-[11px] text-muted">
                          {KIND_LABEL[r.kind]}
                          {r.priority ? ` · priority ${r.priority}` : ""}
                        </span>
                      </Td>
                      <Td className="text-xs">
                        {r.kind === "DURATION_SLAB"
                          ? `${r.minDays ?? 1}${r.maxDays ? `–${r.maxDays}` : "+"} days`
                          : r.kind === "WEEKEND"
                            ? "Sat & Sun"
                            : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`}
                      </Td>
                      <Td className="text-xs">
                        {r.car ? `${r.car.model} ${formatRegistration(r.car.registrationNumber)}` : <Badge>All cars</Badge>}
                      </Td>
                      <Td className="text-right font-medium tabular-nums">{formatMoney(r.dailyRate)}/day</Td>
                      <Td>
                        {canEdit ? (
                          <div className="flex justify-end gap-1">
                            <ActionButton action={toggleRateRuleAction} fields={{ ruleId: r.id }} className="h-7">
                              {r.isActive ? "Pause" : "Enable"}
                            </ActionButton>
                            <ActionButton
                              action={deleteRateRuleAction}
                              fields={{ ruleId: r.id }}
                              confirm={`Delete "${r.label}"?`}
                              className="h-7 text-danger"
                            >
                              Delete
                            </ActionButton>
                          </div>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </TableWrap>
        </div>

        {canEdit ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>New rule</CardTitle>
            </CardHeader>
            <CardContent>
              <RuleForm cars={cars} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
