// Network first, so updates show up right away; falls back to the last saved copy when offline.
const CACHE = "walkup-v3";
// Songs shared to Walk-Up from another Android app wait here until the app opens and picks them up. Never deleted by an update.
const INBOX = "walkup-inbox-v1";
// Save the page itself at install. Without this, the first visit caches nothing
// (the page loaded before the worker existed), so opening it offline right after
// installing fails. Each file is added on its own so one miss can't block install.
const SHELL = ["./", "manifest.json", "walkup.css", "sounds.js", "core.js", "db.js", "engine.js", "ui.js", "state.js", "songs.js", "voice.js", "mix.js", "team.js", "requests.js", "data.js", "pitch-core.js", "pitch.js", "bridge.js", "app.js", "send.html", "send.js", "send.css", "/apps/icons/walkup-192.png", "/apps/icons/walkup-512.png"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: "reload"})).catch(() => {})))));
});
// All the apps on this site share one Cache Storage, so only ever delete our own caches (and keep the share inbox).
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("walkup-") && k !== CACHE && k !== INBOX).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
// Android's share menu posts shared song files to ./share-target. Keep them in the inbox cache and send the browser on to the app,
// which imports them and clears the inbox. Nothing leaves the phone.
async function takeShared(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("songs").filter(f => f && typeof f === "object" && typeof f.name === "string").slice(0, 20);
    if (files.length) {
      const inbox = await caches.open(INBOX), stamp = String(Date.now());
      await Promise.all(files.map((f, i) => inbox.put(
        new URL("inbox/" + stamp + "-" + String(i).padStart(3, "0"), self.registration.scope).href,
        new Response(f, {headers: {"content-type": f.type || "application/octet-stream", "x-wu-name": encodeURIComponent(f.name)}}))));
    }
  } catch (err) { /* open the app anyway */ }
  return Response.redirect(new URL("./?inbox=1", self.registration.scope).href, 303);
}
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.origin === self.location.origin && url.pathname === new URL("share-target", self.registration.scope).pathname) {
    e.respondWith(takeShared(e.request));
    return;
  }
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || (e.request.mode === "navigate" ? caches.match("./") : undefined))));
});
