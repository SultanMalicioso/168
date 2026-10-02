import { useState, type ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FEATURES, type Feature } from "@/lib/plan";
import { usePlan } from "@/lib/use-plan";

/** Renders `children` only when the current plan includes `feature`. */
export function ProGate({
  feature,
  children,
  compact = false,
}: {
  feature: Feature;
  children: ReactNode;
  compact?: boolean;
}) {
  const { can, loading } = usePlan();
  if (loading) return null;
  if (can(feature)) return <>{children}</>;
  return <ProLocked feature={feature} compact={compact} />;
}

/** "Disponible en Pro" state for a feature the current plan doesn't include. */
export function ProLocked({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const info = FEATURES[feature];

  return (
    <>
      {compact ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-2 text-xs">
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-muted-foreground">
            <span className="font-medium text-foreground">{info.title}</span> · Disponible en Pro
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 text-xs"
            onClick={() => setOpen(true)}
          >
            Conocer Pro
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-5 text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
            <Sparkles className="h-3 w-3" /> Disponible en Pro
          </span>
          <h3 className="mt-2 font-display text-lg leading-tight">{info.title}</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{info.description}</p>
          <Button size="sm" className="mt-3" onClick={() => setOpen(true)}>
            Conocer Pro
          </Button>
        </div>
      )}
      <UpgradeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * What Pro includes. There is no checkout yet: when billing exists, this is
 * the single place to send people to it.
 */
function UpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const proFeatures = Object.values(FEATURES).filter((f) => f.plan === "pro");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl">
            <Sparkles className="h-5 w-5" /> 168 Pro
          </DialogTitle>
          <DialogDescription>
            Muy pronto vas a poder pasarte a Pro. Todo lo esencial de 168 sigue siendo gratis.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {proFeatures.map((f) => (
            <li key={f.title} className="rounded-xl border p-3">
              <p className="text-sm font-medium">{f.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
            </li>
          ))}
        </ul>
        <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          Entendido
        </Button>
      </DialogContent>
    </Dialog>
  );
}
