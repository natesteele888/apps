// Photo Blueprint service worker: the app opens with no signal (your own sheets live on the phone).
// Network first, so a fix shows up right away; the saved copy is only used offline. Map tiles and Firebase
// data are never cached here: tiles are the map provider's, and sheets live in the phone's own store.
const CACHE = "photoblueprint-v5";
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
  const savedOr = () => caches.open(CACHE).then(x => x.match(r, { ignoreSearch: true }).then(m => m || (r.mode === "navigate" ? x.match("./") : undefined)));
  const net = fetch(r);
  // Refresh the saved copy from the network's answer. waitUntil is called now, while the event runs: a call made
  // later, after the saved copy has already gone out, can be refused and the copy would never refresh.
  e.waitUntil(net.then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); return caches.open(CACHE).then(c => c.put(r, copy)); }
  }, () => {}));
  // One weak bar of signal: a fetch can hang a long time without failing. After 3 seconds the saved copy
  // shows instead (if there is one); with nothing saved, keep waiting for the network.
  e.respondWith(new Promise(resolve => {
    let done = false;
    const give = res => { if (!done && res) { done = true; resolve(res); } };
    const t = setTimeout(() => savedOr().then(give), 3000);
    net.then(res => { clearTimeout(t); give(res); },
      () => { clearTimeout(t); savedOr().then(m => { give(m); if (!done) { done = true; resolve(Response.error()); } }); });
  }));
});
