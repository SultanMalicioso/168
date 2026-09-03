import { useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Moon,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LEAD_OPTIONS,
  leadLabel,
  useNotifyStore,
  type NotifyItem,
} from "@/lib/notify-store";

type Filter = "all" | "activity" | "task" | "summary";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "activity", label: "Actividades" },
  { id: "task", label: "Tareas" },
  { id: "summary", label: "Resúmenes" },
];

function relative(at: number): string {
  const diff = Date.now() - at;
  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(at).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function Row({
  item,
  onRead,
  onRemove,
  onNavigate,
}: {
  item: NotifyItem;
  onRead: () => void;
  onRemove: () => void;
  onNavigate: () => void;
}) {
  return (
    <div
      className={`group rounded-xl border p-3 transition ${
        item.read ? "opacity-70" : "bg-accent/40"
      }`}
      style={item.color ? { borderLeft: `3px solid ${item.color}` } : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{item.title}</p>
          <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{item.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{relative(item.at)}</span>
            {item.silent && (
              <span className="text-[11px] text-muted-foreground">· solo en la app</span>
            )}
            <Link
              to={item.link ?? "/"}
              onClick={onNavigate}
              className="text-[11px] underline underline-offset-2 hover:text-foreground"
            >
              Abrir
            </Link>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {!item.read && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRead} aria-label="Marcar leída">
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} aria-label="Eliminar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const {
    items,
    settings,
    unread,
    permission,
    setSettings,
    markRead,
    markAllRead,
    remove,
    clearAll,
    requestPermission,
  } = useNotifyStore();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          {settings.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="pb-2">
          <SheetTitle>Notificaciones</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="inbox" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 grid grid-cols-2">
            <TabsTrigger value="inbox">Centro</TabsTrigger>
            <TabsTrigger value="settings">⚙️ Ajustes</TabsTrigger>
          </TabsList>

          {/* ---------------- inbox ---------------- */}
          <TabsContent value="inbox" className="min-h-0 flex-1 px-4 pb-4 data-[state=inactive]:hidden">
            {permission !== "granted" && (
              <div className="mt-3 rounded-xl border border-dashed p-3">
                <p className="text-sm font-medium">Activá los avisos del sistema</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Los usamos solo para recordarte tus actividades y tareas del día. Sin permiso,
                  las notificaciones quedan únicamente en este centro.
                </p>
                {permission === "denied" ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Están bloqueadas en el navegador: habilitalas desde los permisos del sitio.
                  </p>
                ) : permission === "unsupported" ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Este navegador no admite notificaciones del sistema.
                  </p>
                ) : (
                  <Button size="sm" className="mt-2" onClick={() => void requestPermission()}>
                    Permitir notificaciones
                  </Button>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    filter === f.id ? "border-foreground bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={markAllRead} aria-label="Marcar todas como leídas">
                  <CheckCheck className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearAll} aria-label="Borrar todas">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <ScrollArea className="mt-3 h-[calc(100vh-230px)] pr-2">
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No hay notificaciones todavía.
                  </p>
                ) : (
                  filtered.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      onRead={() => markRead(item.id)}
                      onRemove={() => remove(item.id)}
                      onNavigate={() => {
                        markRead(item.id);
                        setOpen(false);
                      }}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ---------------- settings ---------------- */}
          <TabsContent value="settings" className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <ScrollArea className="h-[calc(100vh-170px)] px-4">
              <div className="space-y-5 py-4">
                <section className="space-y-3">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    General
                  </h3>
                  {(
                    [
                      ["enabled", "Notificaciones activadas"],
                      ["morning", "Resumen de la mañana"],
                      ["night", "Resumen de la noche"],
                      ["activities", "Notificaciones de actividades"],
                      ["tasks", "Notificaciones de tareas"],
                      ["pendingTasks", "Aviso de tareas pendientes"],
                      ["completions", "Confirmación al completar"],
                    ] as const
                  ).map(([id, label]) => (
                    <div key={id} className="flex items-center justify-between gap-3">
                      <Label htmlFor={`n-${id}`} className="text-sm font-normal">
                        {label}
                      </Label>
                      <Switch
                        id={`n-${id}`}
                        checked={settings[id]}
                        onCheckedChange={(v) => setSettings({ [id]: v })}
                      />
                    </div>
                  ))}
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Horarios
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Resumen mañana</Label>
                      <Input
                        type="time"
                        value={settings.morningTime}
                        onChange={(e) => setSettings({ morningTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Resumen noche</Label>
                      <Input
                        type="time"
                        value={settings.nightTime}
                        onChange={(e) => setSettings({ nightTime: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="n-quiet" className="flex items-center gap-1.5 text-sm font-normal">
                      <Moon className="h-3.5 w-3.5" /> No molestar
                    </Label>
                    <Switch
                      id="n-quiet"
                      checked={settings.quietEnabled}
                      onCheckedChange={(v) => setSettings({ quietEnabled: v })}
                    />
                  </div>

                  {settings.quietEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Desde</Label>
                        <Input
                          type="time"
                          value={settings.quietFrom}
                          onChange={(e) => setSettings({ quietFrom: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Hasta</Label>
                        <Input
                          type="time"
                          value={settings.quietTo}
                          onChange={(e) => setSettings({ quietTo: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Anticipación
                  </h3>
                  <Select
                    value={String(settings.defaultLead)}
                    onValueChange={(v) => setSettings({ defaultLead: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {leadLabel(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Valor por defecto. Cada actividad puede tener su propia anticipación.
                  </p>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
