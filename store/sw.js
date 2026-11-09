// Lets the store install and open with a weak signal. Pages always load fresh when online.
// Cache names are shared by every app on this address, so only touch the "store-" ones.
const CACHE="store-v3";
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
  e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c))}return res})
    .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match("./"))))});
