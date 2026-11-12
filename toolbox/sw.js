// App shell only: the page, icons, fonts and the Firebase code it needs to open with no
// signal. Never caches your data: that stays in Firestore's own private cache on this
// phone, behind your sign-in (Firestore calls go to googleapis.com, which this skips).
const CACHE = "toolbox-v12";
const SHELL = ["./", "app.webmanifest", "icons/icon-192.png", "../install.js", "../health.js"];
// Same version as the <script> tags in index.html: change them together.
const FIREBASE = ["app", "auth", "firestore"].map(n => `https://www.gstatic.com/firebasejs/11.6.0/firebase-${n}-compat.js`);
// Save the app at install: otherwise a new cache name leaves nothing saved until the second online open.
self.addEventListener("install", e => { self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})),
    // no-cors, like the page's own <script> tags; add() refuses that kind of answer, so fetch and put
    ...FIREBASE.map(u => fetch(u, {mode: "no-cors"}).then(r => c.put(u, r)).catch(() => {}))
  ])));
});
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
