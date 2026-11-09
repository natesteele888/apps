// Lets Gameday Picks open with a weak or no signal. Pages always load fresh when online.
// Caches the app shell plus the Firebase code and fonts it needs to start; picks data stays
// in Firestore's own private cache on the phone, behind sign-in. The NFL schedule is never cached here.
const CACHE = "picks-v3";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("picks-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || r.cache === "no-store") return; // no-store = must reach the network; never answer it from here
  const u = new URL(r.url);
  if (!(u.origin === location.origin || u.host === "www.gstatic.com" || u.host.startsWith("fonts."))) return;
  e.respondWith(fetch(r).then(res => {
    // <script> tags fetch Firebase without CORS, so its response is "opaque" (ok is false); keep those too
    if (res.ok || res.type === "opaque") { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); }
    return res;
  }).catch(() => caches.open(CACHE).then(x => x.match(r, {ignoreSearch: true}).then(m => m || x.match("./")))));
});
