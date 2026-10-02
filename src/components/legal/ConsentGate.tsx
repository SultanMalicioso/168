import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useCloudSync } from "@/lib/cloud-sync";
import { consentMetadata, hasAcceptedTerms, LEGAL } from "@/lib/legal";

/**
 * Signed-in users who haven't accepted the current Terms (accounts created with
 * Google, or before the Terms existed) must accept them before using the account.
 */
export function ConsentGate() {
  const { user, signOut } = useCloudSync();
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  if (!user || accepted || hasAcceptedTerms(user.user_metadata)) return null;

  const accept = async () => {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: consentMetadata() });
    setBusy(false);
    if (error) {
      toast.error("No pudimos guardar tu aceptación. Probá de nuevo.");
      return;
    }
    setAccepted(true);
  };

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Antes de seguir</AlertDialogTitle>
          <AlertDialogDescription>
            Para usar tu cuenta de 168 necesitamos que confirmes lo siguiente.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2.5">
            <Checkbox
              checked={age}
              onCheckedChange={(v) => setAge(v === true)}
              className="mt-0.5"
            />
            <span>Tengo {LEGAL.minAge} años o más.</span>
          </label>
          <label className="flex items-start gap-2.5">
            <Checkbox
              checked={terms}
              onCheckedChange={(v) => setTerms(v === true)}
              className="mt-0.5"
            />
            <span>
              Leí y acepto los{" "}
              <a
                href="/terminos"
                target="_blank"
                rel="noopener"
                className="underline underline-offset-4"
              >
                Términos y Condiciones
              </a>{" "}
              y la{" "}
              <a
                href="/privacidad"
                target="_blank"
                rel="noopener"
                className="underline underline-offset-4"
              >
                Política de Privacidad
              </a>
              .
            </span>
          </label>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void signOut()}>
            Salir de la cuenta
          </Button>
          <Button disabled={!age || !terms || busy} onClick={() => void accept()}>
            Aceptar y continuar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
