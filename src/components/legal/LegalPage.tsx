import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LEGAL } from "@/lib/legal";
import { SiteFooter } from "./SiteFooter";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border hover:bg-accent transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a 168
          </Link>
        </div>
      </header>
      <main id="contenido" className="flex-1 px-4 py-10">
        <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-foreground [&_h2]:font-display [&_h2]:text-2xl [&_h2]:pt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:underline [&_a]:underline-offset-4">
          <div>
            <h1 className="font-display text-4xl">{title}</h1>
            <p className="mt-2 text-muted-foreground">Última actualización: {LEGAL.updated}</p>
          </div>
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
