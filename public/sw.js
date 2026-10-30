const ROOT = new URL(self.registration.scope);
const PREFIX = "wordbook-fresh:" + encodeURIComponent(ROOT.pathname) + ":";
const CACHE = PREFIX + "__WB_RELEASE__";
const SHELL = /*__WB_SHELL__*/ ["./", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(SHELL.map((path) => new URL(path, ROOT).href)),
  )),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim())),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(event.request);
    if (saved) return saved;
    if (event.request.mode === "navigate") {
      const index = await cache.match(new URL("index.html", ROOT).href);
      if (index) return index;
    }
    throw Error("offline");
  }));
});
