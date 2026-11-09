// Network first, so updates show up right away; falls back to the last saved copy when offline.
const CACHE = "read20-v3";
// Save the page itself at install. Without this, the first visit caches nothing
// (the page loaded before the worker existed), so opening it offline right after
// installing fails. Each file is added on its own so one miss can't block install.
const SHELL = ["./", "manifest.json", "read20.css", "core.js", "books.js", "cloud.js", "words.js", "audio.js", "board.js", "app.js", "boot.js", "/apps/icons/read20-192.png", "/apps/icons/read20-512.png", ...["a", "a_long", "ar", "aw", "b", "ch", "d", "e", "e_long", "er", "f", "g", "h", "i", "i_long", "j", "k", "l", "m", "n", "ng", "o", "o_long", "oi", "oo", "oo_short", "or", "ou", "p", "qu", "r", "s", "sh", "t", "th", "u", "u_long", "v", "w", "x", "y", "z"].map(n => "sounds/" + n + ".mp3")];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
// All the apps on this site share one Cache Storage, so only ever delete our own caches.
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("read20-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
