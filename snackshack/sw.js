// Snack Shack Screen. Network first, so updates show up right away; falls back to the last saved copy when offline.
// Only this site's own files go through here: the Drive feed and its pictures are saved by player.js itself.
const CACHE = "snackshack-v1";
const SHELL = ["./", "index.html", "screen.html", "manifest.json", "core.js", "player.js", "screen.css", "setup.js", "setup.css", "feed.gs", "/apps/icons/snackshack-192.png", "/apps/icons/snackshack-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
// All the apps on this site share one Cache Storage, so only ever delete our own caches (and never the saved media).
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("snackshack-v") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || u.pathname.indexOf("/__media/") >= 0) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
