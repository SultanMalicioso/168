import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCloudSync } from "@/lib/cloud-sync";
import type { Feature } from "@/lib/plan";
import type { WaitlistStatus } from "@/lib/pro-waitlist";
import {
  getProWaitlistStatus,
  joinProWaitlist,
  leaveProWaitlist,
} from "@/lib/pro-waitlist.functions";

/**
 * "Tell me when Pro launches", inside the Pro dialog. Signing up only adds
 * the user to a list: it never changes the plan (usePlan is untouched).
 */
export function ProWaitlist({ source, onNavigate }: { source?: Feature; onNavigate: () => void }) {
  const { user } = useCloudSync();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const key = ["pro-waitlist", userId];

  const status = useQuery({
    queryKey: key,
    enabled: userId !== null,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<WaitlistStatus> => (await getProWaitlistStatus()).status,
  });
  const store = (next: WaitlistStatus) => queryClient.setQueryData(key, next);
  const join = useMutation({
    mutationFn: async () => (await joinProWaitlist({ data: { source: source ?? null } })).status,
    onSuccess: store,
  });
  const leave = useMutation({
    mutationFn: async () => (await leaveProWaitlist()).status,
    onSuccess: store,
  });

  if (!userId) {
    return (
      <Button asChild className="w-full">
        <Link to="/auth" onClick={onNavigate}>
          Crear cuenta para anotarme
        </Link>
      </Button>
    );
  }

  if (status.isPending) {
    return (
      <Button className="w-full" disabled>
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </Button>
    );
  }

  if (status.isError) {
    return (
      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">
          No pudimos ver si estás en la lista. Probá de nuevo más tarde.
        </p>
        <Button variant="outline" size="sm" onClick={() => void status.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (status.data === "unavailable") {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Todavía no está disponible. Probá de nuevo más tarde.
      </p>
    );
  }

  if (status.data === "joined") {
    return (
      <div className="space-y-2 text-center">
        <p className="text-sm">Listo, te avisamos cuando salga Pro.</p>
        <Button
          variant="outline"
          size="sm"
          disabled={leave.isPending}
          onClick={() => leave.mutate()}
        >
          {leave.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salir de la lista
        </Button>
        {leave.isError && (
          <p className="text-xs text-destructive">
            No pudimos sacarte de la lista. Probá de nuevo.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-center">
      <Button className="w-full" disabled={join.isPending} onClick={() => join.mutate()}>
        {join.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Avisame cuando salga Pro
      </Button>
      {join.isError && (
        <p className="text-xs text-destructive">No pudimos anotarte. Probá de nuevo.</p>
      )}
    </div>
  );
}
