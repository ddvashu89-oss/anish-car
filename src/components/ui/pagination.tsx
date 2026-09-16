import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 25;

export function pageFrom(value: string | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function Pagination({
  page,
  total,
  pageSize = PAGE_SIZE,
  hrefFor,
}: {
  page: number;
  total: number;
  pageSize?: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-xs font-medium hover:bg-surface-2";

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-xs text-muted">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={btn}>
            <ChevronLeft className="size-3.5" /> Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={btn}>
            Next <ChevronRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
