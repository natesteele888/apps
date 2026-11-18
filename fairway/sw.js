// Fairway: network first, so updates show up right away; the last saved copy when there's no signal on the course.
// Caches the app and the Firebase code it needs to start. Scores stay in Firestore's own copy on the phone, never here.
const CACHE = "fairway-v16";
const SHELL = ["./", "manifest.json", "fairway.css", "core.js", "qr.js", "store.js", "sound.js", "teams.js", "games.js", "review.js", "jack.js", "recap.js", "bag.js", "map.js", "where.js", "holemap.js", "caddie.js", "app.js", "watch.js", "../watchlink.js", "/apps/icons/fairway-192.png", "/apps/icons/fairway-512.png", "../install.js", "../health.js"];
// Same version as store.js loads: change them together.
const FIREBASE = ["app", "firestore"].map(n => `https://www.gstatic.com/firebasejs/11.6.0/firebase-${n}-compat.js`);
// Save the page at install: the first visit happens before this worker exists. Each file on its own so one miss can't block it.
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})),
    ...FIREBASE.map(u => fetch(u, {mode: "no-cors"}).then(r => c.put(u, r)).catch(() => {}))
  ])));
});
// All the apps on this site share one Cache Storage, so only ever delete our own caches.
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("fairway-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || r.cache === "no-store") return;
  const u = new URL(r.url);
  // Firestore's own traffic goes straight through; only the page, its files, Firebase's code and fonts are kept.
  if (!(u.origin === location.origin || u.host === "www.gstatic.com" || u.host.startsWith("fonts."))) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok || res.type === "opaque") { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); }
    return res;
  }).catch(() => caches.open(CACHE).then(x => x.match(r, {ignoreSearch: true}).then(m => m || (r.mode === "navigate" ? x.match("./") : Response.error())))));
});
