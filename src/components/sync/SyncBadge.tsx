import { Link } from "@tanstack/react-router";
import { Cloud, CloudOff, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { STATUS_LABEL, useCloudSync } from "@/lib/cloud-sync";

/** Header pill: shows the sync state and links to the account page. */
export function SyncBadge() {
  const { user, status } = useCloudSync();

  const icon = !user ? (
    <CloudOff className="h-4 w-4" />
  ) : status === "syncing" ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : status === "error" ? (
    <TriangleAlert className="h-4 w-4 text-destructive" />
  ) : status === "synced" ? (
    <Cloud className="h-4 w-4 text-primary" />
  ) : (
    <RefreshCw className="h-4 w-4" />
  );

  return (
    <Link
      to="/auth"
      aria-label={user ? STATUS_LABEL[status] : "Iniciar sesión para sincronizar"}
      title={user ? `${user.email} — ${STATUS_LABEL[status]}` : "Sincronizar entre dispositivos"}
      className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm border hover:bg-accent transition"
    >
      {icon}
      <span className="hidden sm:inline">{user ? "Sincronizado" : "Sincronizar"}</span>
    </Link>
  );
}
