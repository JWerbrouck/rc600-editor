// Offline support for the installed app. Network first, so a new version is used as soon as
// it's online; every response is cached, so the app still opens without a connection.
const CACHE = "rc600-editor";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith("http")) return;
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok || response.type === "opaque") {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? (e.request.mode === "navigate" ? caches.match("./index.html") : undefined))),
  );
});
