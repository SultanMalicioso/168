/*
 * Notification-only service worker for the 168 planner.
 * It never caches the app shell — it only shows and routes notifications,
 * which lets reminders survive tab switches and background states.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = (event.notification.data && event.notification.data.link) || "/";
  const target = new URL(link, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
