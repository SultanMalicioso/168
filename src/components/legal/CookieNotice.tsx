import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const KEY = "week168.storage-notice";

/** One-time notice: 168 only uses essential browser storage, no tracking cookies. */
export function CookieNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1");
    } catch {
      setShow(false);
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* Storage blocked: just hide it for this visit */
    }
    setShow(false);
  };

  return (
    <div
      role="region"
      aria-label="Aviso sobre almacenamiento"
      className="fixed inset-x-0 bottom-0 z-[55] p-3"
    >
      <div className="mx-auto max-w-xl rounded-2xl border bg-background p-4 shadow-lg flex flex-col sm:flex-row gap-3 sm:items-center">
        <p className="text-xs text-muted-foreground flex-1">
          168 usa solo almacenamiento esencial de tu navegador para guardar tus datos y tu sesión.
          No usamos cookies de publicidad ni de seguimiento.{" "}
          <Link
            to="/privacidad"
            hash="cookies"
            className="underline underline-offset-4 text-foreground"
          >
            Más información
          </Link>
        </p>
        <Button size="sm" onClick={dismiss} className="shrink-0">
          Entendido
        </Button>
      </div>
    </div>
  );
}
