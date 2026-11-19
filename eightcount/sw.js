// Network first, so updates show up right away; falls back to the last saved copy when offline.
const CACHE = "eightcount-v4";
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
  const r = e.request;
  const saved = () => caches.match(r, {ignoreSearch: true});
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
    const t = setTimeout(() => saved().then(give), 3000);
    net.then(res => { clearTimeout(t); give(res); },
      () => { clearTimeout(t); saved().then(m => { give(m); if (!done) { done = true; resolve(Response.error()); } }); });
  }));
});
