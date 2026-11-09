// Photo Blueprint service worker: the app opens with no signal (your own sheets live on the phone).
// Network first, so a fix shows up right away; the saved copy is only used offline. Map tiles and Firebase
// data are never cached here: tiles are the map provider's, and sheets live in the phone's own store.
const CACHE = "photoblueprint-v1";
const SHELL = ["./", "photoblueprint.css", "core.js", "exif.js", "figures.js", "store.js", "app.js", "vendor/leaflet.js", "vendor/leaflet.css", "manifest.json", "/apps/icons/photoblueprint-192.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("photoblueprint-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request;
  // no-store = must reach the network; never answer it from here. (A page reload marks its files "reload"; those still get the offline copy.)
  if (r.method !== "GET" || r.cache === "no-store") return;
  const u = new URL(r.url);
  // Only this site's own files plus the Firebase scripts and fonts the app needs to start.
  if (!(u.origin === location.origin || u.host === "www.gstatic.com" || u.host.startsWith("fonts."))) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok || res.type === "opaque") { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); }
    return res;
  }).catch(() => caches.open(CACHE).then(x => x.match(r, { ignoreSearch: true }).then(m => m || (r.mode === "navigate" ? x.match("./") : Response.error())))));
});
