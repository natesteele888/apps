// Network first, so updates show up right away; falls back to the last saved copy when offline.
const CACHE = "getready-v4";
// Save the page itself at install so it opens offline right after the first visit.
// Each file is added on its own so one miss can't block install.
const SHELL = ["./", "manifest.json", "getready.css", "core.js", "db.js", "cloud.js", "celebrate.js", "app.js", "../watchlink.js", "/apps/icons/getready-192.png", "/apps/icons/getready-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
// All the apps on this site share one Cache Storage, so only ever delete our own caches.
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("getready-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // custom GIF links, the watch link and fonts go straight to the network
  // "no-cache" makes the browser check with the server every time (a cheap yes/no when nothing changed), so a new version shows up right away instead of after the browser's 10-minute cache.
  const r = e.request;
  const saved = () => caches.match(r, {ignoreSearch: true});
  const net = fetch(r, {cache: "no-cache"});
  // Refresh the saved copy from the network's answer. waitUntil is called now, while the event runs: a call made
  // later, after the saved copy has already gone out, can be refused and the copy would never refresh.
  e.waitUntil(net.then(res => {
    if (res.ok) { const copy = res.clone(); return caches.open(CACHE).then(c => c.put(r, copy)); }
  }, () => {}));
  // One weak bar of signal: a fetch can hang a long time without failing. After 3 seconds the saved copy
  // shows instead (if there is one); with nothing saved, keep waiting for the network.
  e.respondWith(new Promise(resolve => {
    let done = false;
    const give = res => { if (!done && res) { done = true; resolve(res); } };
    const t = setTimeout(() => saved().then(give), 3000);
    net.then(res => { clearTimeout(t); give(res); },
      () => { clearTimeout(t); saved().then(m => { give(m); if (!done) { done = true; resolve(Response.error()); } }); });
  }));
});
// Tapping a reminder notification opens the app.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow("./")));
});
