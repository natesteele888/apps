// Network first, so updates show up right away; falls back to the last saved copy when offline.
// The trainer itself lives in LYBS Ballclub (/lybs-ballclub/ on this same site), so its
// engine, look and rule files are saved here too, under this app's own cache.
const CACHE = "situations-v19";
const SHELL = ["./", "manifest.json", "/apps/icons/situations-192.png", "/apps/icons/situations-512.png",
  "/lybs-ballclub/js/situations.js", "/lybs-ballclub/css/situations.css",
  "/lybs-ballclub/data/situations.csv", "/lybs-ballclub/data/responsibilities.csv"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("situations-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
