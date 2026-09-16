import type { AppSettings } from "@/lib/settings";

/**
 * A white A4-style sheet. Stays white in dark mode because it represents paper,
 * and prints edge to edge.
 */
export function Paper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl rounded-card border border-line bg-white p-8 text-[13px] leading-relaxed text-zinc-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
      {children}
    </div>
  );
}

export function Letterhead({
  company,
  title,
  meta,
}: {
  company: AppSettings["company"];
  title: string;
  meta: Array<[string, string]>;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-zinc-900 pb-5">
      <div>
        <p className="text-xl font-bold tracking-tight">{company.name}</p>
        {company.address ? <p className="mt-1 max-w-xs whitespace-pre-line text-zinc-600">{company.address}</p> : null}
        <p className="text-zinc-600">{[company.phone, company.email].filter(Boolean).join(" · ")}</p>
        {company.gstin ? <p className="text-zinc-600">GSTIN {company.gstin}</p> : null}
      </div>
      <div className="text-right">
        <p className="text-lg font-semibold tracking-wide uppercase">{title}</p>
        <table className="mt-1 ml-auto text-right">
          <tbody>
            {meta.map(([k, v]) => (
              <tr key={k}>
                <td className="pr-3 text-zinc-500">{k}</td>
                <td className="font-medium">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  );
}

export function PaperSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function PaperRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "border-t border-zinc-300 pt-2 text-[15px] font-semibold" : ""}`}>
      <span className={strong ? "" : "text-zinc-600"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-16 grid grid-cols-2 gap-12">
      {[left, right].map((label) => (
        <div key={label} className="border-t border-zinc-400 pt-2 text-center text-zinc-600">
          {label}
        </div>
      ))}
    </div>
  );
}
