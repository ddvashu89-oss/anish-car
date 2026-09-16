import { CalendarRange } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";

/** Step one of booking: dates. A GET form, so the server can work out which cars are free. */
export function DatePickerForm({
  action,
  pickup,
  returnAt,
  hidden,
  error,
}: {
  action: string;
  pickup: string;
  returnAt: string;
  hidden: Record<string, string | undefined>;
  error?: string;
}) {
  return (
    <Card>
      <CardContent>
        <form action={action} method="get" className="flex flex-wrap items-end gap-3">
          {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <div className="space-y-1.5">
            <Label htmlFor="pickup">Pickup</Label>
            <Input id="pickup" name="pickup" type="datetime-local" defaultValue={pickup} required className="w-auto" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="return">Return</Label>
            <Input id="return" name="return" type="datetime-local" defaultValue={returnAt} required className="w-auto" />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            <CalendarRange className="size-4" /> Check availability
          </button>
          {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
