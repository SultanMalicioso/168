import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Cloud, Download, Loader2, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { clearDeviceData, STATUS_LABEL, SYNC_KEYS, useCloudSync } from "@/lib/cloud-sync";
import { consentMetadata, LEGAL } from "@/lib/legal";

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
  const { user, status, signOut, syncNow, deleteAccount } = useCloudSync();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const consentOk = ageOk && termsOk;

  useEffect(() => {
    if (sent) setSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !consentOk) {
      toast.error(`Para crear la cuenta confirmá que tenés ${LEGAL.minAge} años o más y aceptá los términos.`);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: consentMetadata() },
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
                  Actualizar
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
                    minLength={mode === "signup" ? 8 : 6}
                    maxLength={128}
                    aria-describedby={mode === "signup" ? "password-hint" : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === "signup" && (
                    <p id="password-hint" className="text-[11px] text-muted-foreground">
                      Mínimo 8 caracteres. Evitá contraseñas que uses en otros sitios.
                    </p>
                  )}
                </div>
                {mode === "signup" && (
                  <div className="space-y-2.5 rounded-xl border p-3 text-sm">
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        checked={ageOk}
                        onCheckedChange={(v) => setAgeOk(v === true)}
                        className="mt-0.5"
                      />
                      <span>Tengo {LEGAL.minAge} años o más.</span>
                    </label>
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        checked={termsOk}
                        onCheckedChange={(v) => setTermsOk(v === true)}
                        className="mt-0.5"
                      />
                      <span>
                        Leí y acepto los{" "}
                        <Link to="/terminos" target="_blank" className="underline underline-offset-4">
                          Términos y Condiciones
                        </Link>{" "}
                        y la{" "}
                        <Link to="/privacidad" target="_blank" className="underline underline-offset-4">
                          Política de Privacidad
                        </Link>
                        .
                      </span>
                    </label>
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={busy || (mode === "signup" && !consentOk)}
                >
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

              {mode === "signup" && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Responsable de los datos: {LEGAL.owner} ({LEGAL.email}). El titular de los datos
                  personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma
                  gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés
                  legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº
                  25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de
                  Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y
                  reclamos que interpongan quienes resulten afectados en sus derechos por
                  incumplimiento de las normas vigentes en materia de protección de datos
                  personales.
                </p>
              )}
            </div>
          )}

          <YourData signedIn={!!user} email={user?.email ?? null} onDeleteAccount={deleteAccount} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function YourData({
  signedIn,
  email,
  onDeleteAccount,
}: {
  signedIn: boolean;
  email: string | null;
  onDeleteAccount: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const download = () => {
    const data: Record<string, unknown> = {};
    for (const key of SYNC_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try {
        data[key] = JSON.parse(raw);
      } catch {
        data[key] = raw;
      }
    }
    const file = { exportedAt: new Date().toISOString(), account: email, data };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mis-datos-168-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const erase = async () => {
    setDeleting(true);
    try {
      if (signedIn) {
        await onDeleteAccount();
      } else {
        clearDeviceData();
      }
      window.location.assign("/");
    } catch (err) {
      setDeleting(false);
      toast.error(err instanceof Error ? err.message : "No pudimos completar la acción.");
    }
  };

  return (
    <section aria-labelledby="tus-datos" className="mt-6 rounded-2xl border p-6 space-y-4">
      <div>
        <h2 id="tus-datos" className="font-display text-xl">
          Tus datos
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Podés descargar una copia de tus datos o borrarlos cuando quieras. Más detalles en la{" "}
          <Link to="/privacidad" className="underline underline-offset-4">
            Política de Privacidad
          </Link>
          .
        </p>
      </div>

      <Button variant="outline" className="w-full gap-1.5" onClick={download}>
        <Download className="h-4 w-4" />
        Descargar mis datos
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="w-full gap-1.5 text-destructive" disabled={deleting}>
            <Trash2 className="h-4 w-4" />
            {signedIn ? "Eliminar mi cuenta" : "Borrar los datos de este dispositivo"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {signedIn ? "¿Eliminar tu cuenta para siempre?" : "¿Borrar los datos de este dispositivo?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {signedIn
                ? "Se borran tu cuenta y todos tus datos de la nube y de este dispositivo: actividades, tareas, objetivos, historial y avisos. No se puede deshacer."
                : "Se borran todas tus actividades, tareas, objetivos e historial guardados en este navegador. No se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void erase();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {signedIn ? "Eliminar cuenta" : "Borrar datos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
