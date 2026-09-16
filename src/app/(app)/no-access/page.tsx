import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { requireUser } from "@/lib/auth";

export default async function NoAccessPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <ShieldAlert className="size-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">You do not have access to that</h1>
      <p className="mt-2 text-sm text-muted">
        Your role ({user.roleLabel}) does not include this permission. Ask an administrator if you need it.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
