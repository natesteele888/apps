// App shell only. Never caches Firebase or Google traffic: your data stays in
// Firestore's own private cache on this phone, behind your sign-in.
const CACHE = "toolbox-v7";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("toolbox-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  const shell = e.request.method === "GET" && (u.origin === location.origin || u.host === "www.gstatic.com" || u.host.startsWith("fonts."));
  if (!shell) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
