// Lets the store install and open with a weak signal. Pages always load fresh when online.
// Cache names are shared by every app on this address, so only touch the "store-" ones.
const CACHE="store-v8";
const SHELL=["./","qr.js","manifest.json","../icons/store-192.png"];
// Save the page at install: the first visit happens before this worker exists, so nothing else would be saved.
self.addEventListener("install",e=>{self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,{cache:"reload"})).catch(()=>{})))))});
self.addEventListener("activate",e=>e.waitUntil(
  caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("store-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const r=e.request;
  // no-store requests (the app list) bypass this worker; the page keeps its own saved copy of them.
  // Do not skip cache:"reload" too: Chromium marks a page reload that way, and with no signal it would get an error page.
  if(r.method!=="GET"||new URL(r.url).origin!==location.origin||r.cache==="no-store")return;
  const saved = () => caches.match(r, {ignoreSearch: true});
  const savedOr = () => saved().then(m => m || caches.match("./"));
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
