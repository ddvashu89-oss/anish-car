"use client";

import Link from "next/link";
import { ArrowLeft, Mail, MessageCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar({
  backHref,
  backLabel,
  whatsapp,
  email,
  children,
}: {
  backHref: string;
  backLabel: string;
  whatsapp?: { phone: string; text: string };
  email?: { to: string; subject: string; body: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <Link href={backHref} className="flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {backLabel}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {whatsapp ? (
          <a
            href={`https://wa.me/91${whatsapp.phone}?text=${encodeURIComponent(whatsapp.text)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        ) : null}
        {email ? (
          <a
            href={`mailto:${email.to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
          >
            <Mail className="size-4" /> Email
          </a>
        ) : null}
        <Button onClick={() => window.print()}>
          <Printer /> Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
