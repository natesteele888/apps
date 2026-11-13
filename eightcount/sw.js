// Network first, so updates show up right away; falls back to the last saved copy when offline.
const CACHE = "eightcount-v2";
// Save the page and every script at install. Without this, the first visit caches nothing
// (the page loaded before the worker existed), so opening it offline right after installing fails.
// Each file is added on its own so one miss can't block install.
const SHELL = ["./", "style.css", "core.js", "store.js", "engine.js", "ui.js", "manifest.json", "/apps/icons/eightcount-192.png", "/apps/icons/eightcount-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("eightcount-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
