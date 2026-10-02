import { lazy, Suspense, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNotifyStore } from "@/lib/notify-store";

const NotificationPanel = lazy(() =>
  import("./NotificationPanel").then((m) => ({ default: m.NotificationPanel })),
);

export function NotificationCenter() {
  const { settings, unread } = useNotifyStore();
  const [open, setOpen] = useState(false);

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

        <Suspense fallback={null}>
          {open && <NotificationPanel onClose={() => setOpen(false)} />}
        </Suspense>
      </SheetContent>
    </Sheet>
  );
}
