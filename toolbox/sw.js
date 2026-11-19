// App shell only: the page, icons, fonts and the Firebase code it needs to open with no
// signal. Never caches your data: that stays in Firestore's own private cache on this
// phone, behind your sign-in (Firestore calls go to googleapis.com, which this skips).
const CACHE = "toolbox-v17";
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
  const r = e.request;
  const saved = () => caches.match(r, {ignoreSearch: true});
  const savedOr = () => saved().then(m => m || undefined);
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
