import * as React from "react";
import { cn } from "@/lib/utils";

export function TableWrap({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("card-shadow overflow-x-auto rounded-card border border-line bg-surface", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b border-line bg-surface-2 px-4 py-3 text-left text-xs font-semibold text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...props} />;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}
