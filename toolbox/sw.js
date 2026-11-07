// App shell only: the page, icons, fonts and the Firebase code it needs to open with no
// signal. Never caches your data: that stays in Firestore's own private cache on this
// phone, behind your sign-in (Firestore calls go to googleapis.com, which this skips).
const CACHE = "toolbox-v9";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("toolbox-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  const shell = e.request.method === "GET" && (u.origin === location.origin || u.host === "www.gstatic.com" || u.host.startsWith("fonts."));
  if (!shell) return;
  e.respondWith(fetch(e.request).then(res => {
    // <script> tags fetch Firebase without CORS, so its response is "opaque" (ok is false); keep those too
    if (res.ok || res.type === "opaque") { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
