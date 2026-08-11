import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Cloud, Loader2, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { STATUS_LABEL, useCloudSync } from "@/lib/cloud-sync";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Cuenta y sincronización · 168" },
      {
        name: "description",
        content:
          "Iniciá sesión para sincronizar tus actividades, tareas, temporizadores e historial entre el celular y la computadora.",
      },
      { property: "og:title", content: "Cuenta y sincronización · 168" },
      {
        property: "og:description",
        content: "Accedé con tu cuenta y tené los mismos datos en todos tus dispositivos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, status, signOut, syncNow } = useCloudSync();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (sent) setSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          toast.success("Te enviamos un email para confirmar la cuenta.");
          return;
        }
        toast.success("Cuenta creada. Tus datos ya se sincronizan.");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Sesión iniciada.");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (result.error) {
        setBusy(false);
        toast.error("No pudimos iniciar sesión con Google. Probá de nuevo o usá email y contraseña.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/" });
    } catch {
      setBusy(false);
      toast.error("No pudimos iniciar sesión con Google. Probá de nuevo o usá email y contraseña.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster position="top-center" />
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-[1400px] px-4 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border hover:bg-accent transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Volver</span>
          </Link>
          <h1 className="font-display text-base sm:text-lg">Cuenta y sincronización</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-10">
        <div className="mx-auto w-full max-w-sm">
          {user ? (
            <div className="rounded-2xl border p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Cloud className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{STATUS_LABEL[status]}</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sesión iniciada como</p>
                <p className="font-medium break-all">{user.email}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Tus actividades, tareas, temporizadores e historial se guardan en la nube y aparecen
                en cualquier dispositivo donde entres con esta cuenta.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => void syncNow()}>
                  <RefreshCw className="h-4 w-4" />
                  Sincronizar ahora
                </Button>
                <Button variant="ghost" className="gap-1.5" onClick={() => void signOut()}>
                  <LogOut className="h-4 w-4" />
                  Salir
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border p-6 space-y-5">
              <div>
                <h2 className="font-display text-xl">
                  {mode === "signin" ? "Iniciá sesión" : "Creá tu cuenta"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Usá el mismo email en el celular y en la computadora para ver los mismos datos.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => void google()}
              >
                Continuar con Google
              </Button>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
              </div>

              <form className="space-y-3" onSubmit={submit}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "signin" ? "Entrar" : "Crear cuenta"}
                </Button>
              </form>

              {sent && (
                <p className="text-sm text-muted-foreground">
                  Revisá tu email y confirmá la cuenta para empezar a sincronizar.
                </p>
              )}

              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-4"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin"
                  ? "No tengo cuenta, quiero crear una"
                  : "Ya tengo cuenta, quiero entrar"}
              </button>

              <p className="text-xs text-muted-foreground">
                Sin cuenta la app sigue funcionando, pero los datos quedan solo en este dispositivo.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
