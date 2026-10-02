import { Link } from "@tanstack/react-router";
import { LEGAL } from "@/lib/legal";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 mt-10">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 pb-28 lg:pb-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-xs text-muted-foreground">
        <p>
          © 2026 {LEGAL.owner} · {LEGAL.country}
        </p>
        <nav aria-label="Información legal" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link
            to="/privacidad"
            className="underline-offset-4 hover:underline hover:text-foreground"
          >
            Privacidad
          </Link>
          <Link to="/terminos" className="underline-offset-4 hover:underline hover:text-foreground">
            Términos
          </Link>
          <Link to="/auth" className="underline-offset-4 hover:underline hover:text-foreground">
            Tus datos y cuenta
          </Link>
          <a
            href={`mailto:${LEGAL.email}`}
            className="underline-offset-4 hover:underline hover:text-foreground"
          >
            Contacto
          </a>
        </nav>
      </div>
    </footer>
  );
}
