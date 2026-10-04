import type { NotifySettings } from "@/lib/notify-store";

/**
 * Notification settings for anyone who never changed them. Shared by the
 * app and the server push dispatcher so both always agree.
 */
export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  enabled: true,
  morning: true,
  morningTime: "08:00",
  night: true,
  nightTime: "21:30",
  activities: true,
  tasks: true,
  pendingTasks: true,
  completions: true,
  quietEnabled: true,
  quietFrom: "23:00",
  quietTo: "07:00",
  defaultLead: 10,
};
