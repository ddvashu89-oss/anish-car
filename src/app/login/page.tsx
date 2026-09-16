import type { Metadata } from "next";
import { BarChart3, Car, ReceiptIndianRupee, Wrench } from "lucide-react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Anish Car Rent" };

const HIGHLIGHTS = [
  { icon: Car, text: "Every car's bookings, costs and profit in one place" },
  { icon: ReceiptIndianRupee, text: "Payments, pending balances and invoices tracked automatically" },
  { icon: Wrench, text: "Service and document expiry reminders before they bite" },
  { icon: BarChart3, text: "Revenue, expenses and fleet utilisation at a glance" },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-primary p-12 text-primary-fg lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary-fg/15 text-lg font-bold">
            A
          </span>
          <span className="text-lg font-semibold">Anish Car Rent</span>
        </div>

        <div className="space-y-8">
          <h1 className="max-w-md text-3xl leading-tight font-semibold">
            Your whole rental business, running on one set of numbers.
          </h1>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-primary-fg/85">
                <Icon className="mt-0.5 size-4 shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-primary-fg/60">Fleet · Rentals · Billing · Accounting</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-1.5">
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-fg">
                A
              </span>
              <span className="font-semibold">Anish Car Rent</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted">Sign in to continue to the command centre.</p>
          </div>

          <LoginForm />
        </div>
      </section>
    </div>
  );
}
