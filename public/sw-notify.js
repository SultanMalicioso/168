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
  let url;
  try {
    url = new URL(link, self.location.origin);
  } catch {
    url = new URL("/", self.location.origin);
  }
  /* Notifications only ever open pages of this site. */
  const target = url.origin === self.location.origin ? url.href : self.location.origin + "/";

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

/* Server push: shows the notification even with the app fully closed. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "168", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "168";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      tag: payload.tag || title,
      renotify: false,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      timestamp: payload.at || Date.now(),
      data: {
        link: payload.link || "/",
        kind: payload.kind,
        activityId: payload.activityId,
        taskId: payload.taskId,
      },
    }),
  );
});

/*
 * The browser replaced or dropped this device's push subscription (expired,
 * revoked…). Tell the open pages so they re-check it: until then they'd keep
 * relying on server push and stay silent.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients)
        client.postMessage({ type: "week168:push-subscription-change" });
    }),
  );
});
