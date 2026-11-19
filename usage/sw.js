// Steele Usage: network first, so updates show up right away; falls back to the last saved copy of the app when offline.
// Only the app's own files are cached. GitHub API traffic (and the token in it) is never cached.
const CACHE = "usage-v6";
const SHELL = ["./", "manifest.json", "/apps/icons/usage-192.png", "/apps/icons/usage-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
// All the apps on this site share one Cache Storage, so only ever delete our own caches.
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("usage-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  const r = e.request;
  const savedOr = () => caches.match(r, {ignoreSearch: true});
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
    const t = setTimeout(() => savedOr().then(give), 3000);
    net.then(res => { clearTimeout(t); give(res); },
      () => { clearTimeout(t); savedOr().then(m => { give(m); if (!done) { done = true; resolve(Response.error()); } }); });
  }));
});
