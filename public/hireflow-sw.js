/* HireFlow's service worker: phone notifications and nothing else.
 *
 * It exists so a phone (or browser) with HireFlow on its Home Screen can show
 * a notification when the app is closed. It has NO fetch handler and caches
 * nothing: the app is always loaded straight from the network, exactly as if
 * this file were not here. (src/main.tsx removes every other service worker.)
 *
 * The server (supabase/functions/_shared/webPush.ts) sends JSON:
 *   { title, body, url?, tag? }
 * `url` is a full hireflownow.com address. The staff app lives on its own
 * host (staff.hireflownow.com), so a tap opens the same PATH on whichever
 * host this worker belongs to; the tap never leaves the origin it was
 * installed from.
 *
 * Docs: docs/PUSH-NOTIFICATIONS.md
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** The path (and query) of a pushed link, on this worker's own origin. Anything odd opens the app's front door. */
function ownPath(link) {
  try {
    const url = new URL(link, self.location.origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "/";
    return url.pathname + url.search + url.hash;
  } catch (e) {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch (e) {
    // A message that isn't JSON still has to show something: the browser
    // requires every push to produce a visible notification.
    message = { body: event.data ? event.data.text() : "" };
  }
  const title = (message && message.title) || "HireFlow";
  const options = {
    body: (message && message.body) || "",
    icon: "/icon-192.png?v=8",
    badge: "/favicon-32.png?v=8",
    data: { url: ownPath(message && message.url) },
  };
  if (message && message.tag) options.tag = String(message.tag);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // Show the open window first, then take it to the page. navigate() is
        // refused for a window this worker doesn't control yet; then open one.
        return open
          .focus()
          .then((focused) => (focused || open).navigate(target))
          .then((moved) => (moved ? moved.focus() : undefined))
          .catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    }),
  );
});
