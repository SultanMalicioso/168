import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Conectando tu cuenta · 168" },
      {
        name: "description",
        content: "Estamos terminando de conectar tu cuenta para sincronizar tus datos entre dispositivos.",
      },
      { property: "og:title", content: "Conectando tu cuenta · 168" },
      {
        property: "og:description",
        content: "Estamos terminando de conectar tu cuenta para sincronizar tus datos entre dispositivos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      navigate({ to: "/", replace: true });
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });

    const timeout = setTimeout(() => {
      if (!done) setFailed(true);
    }, 8000);

    return () => {
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        {!failed ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Conectando tu cuenta…</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No pudimos completar el inicio de sesión.</p>
            <button
              className="text-sm underline underline-offset-4"
              onClick={() => navigate({ to: "/auth", replace: true })}
            >
              Volver a intentar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
