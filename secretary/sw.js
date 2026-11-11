// Meeting Secretary: network first, so updates show up right away; falls back to the last saved copy when offline.
// Only the app's own files, the Firebase scripts and fonts are cached. Database and sign-in traffic is never cached.
const CACHE = "secretary-v15";
const SHELL = ["./", "manifest.json", "/apps/icons/secretary-192.png", "/apps/icons/secretary-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
// All the apps on this site share one Cache Storage, so only ever delete our own caches.
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("secretary-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
const cacheable = u => u.origin === self.location.origin || u.hostname === "www.gstatic.com" || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (!cacheable(u)) return;
  e.respondWith(fetch(e.request, {cache: "no-cache"}).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
