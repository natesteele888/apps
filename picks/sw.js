// Lets Gameday Picks open with a weak or no signal. Pages always load fresh when online.
// Caches the app shell plus the Firebase code and fonts it needs to start; picks data stays
// in Firestore's own private cache on the phone, behind sign-in. The NFL schedule is never cached here.
const CACHE = "picks-v18";
const SHELL = ["./", "core.js", "stats.js", "league.js", "remind.js", "../watchlink.js", "manifest.json", "../icons/picks-192.png", "../install.js", "../health.js"];
// Same version as the <script> tags in index.html: change them together.
const FIREBASE = ["app", "auth", "firestore"].map(n => `https://www.gstatic.com/firebasejs/11.6.0/firebase-${n}-compat.js`);
// Save the app at install: the first visit happens before this worker exists, so nothing else would be saved.
self.addEventListener("install", e => { self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})),
    // no-cors, like the page's own <script> tags; add() refuses that kind of answer, so fetch and put
    ...FIREBASE.map(u => fetch(u, {mode: "no-cors"}).then(r => c.put(u, r)).catch(() => {}))
  ])));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("picks-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || r.cache === "no-store") return; // no-store = must reach the network; never answer it from here
  const u = new URL(r.url);
  if (!(u.origin === location.origin || u.host === "www.gstatic.com" || u.host.startsWith("fonts."))) return;
  const savedOr = () => caches.open(CACHE).then(x => x.match(r, {ignoreSearch: true}).then(m => m || x.match("./")));
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
// Pick reminders (picks/reminders/ sends them through Firebase Cloud Messaging): show the notification, and open the app when
// it's tapped. The message carries a title and body both as a web notification and as data, so either shape works here.
self.addEventListener("push", e => {
  let j = {}; try { j = e.data ? e.data.json() : {}; } catch (_) {}
  const n = j.notification || {}, d = j.data || {};
  const title = n.title || d.title || "🏈 Make your picks";
  e.waitUntil(self.registration.showNotification(title, { body: n.body || d.body || "You have games to pick in Gameday Picks.",
    icon: n.icon || "../icons/picks-192.png", badge: "../icons/picks-192.png", tag: "gp-remind", renotify: true, data: { link: d.link || "./" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.link) || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => x.url.startsWith(self.registration.scope));
    return w ? w.focus() : clients.openWindow(url);
  }));
});
