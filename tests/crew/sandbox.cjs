// The crew's sandbox: opens an app page in a fake browser (jsdom) with no real browser needed.
// Safe by design:
// - Nothing leaves this machine. Every request that isn't to the local test server is dropped.
// - Firebase is swapped for an in-memory stand-in. Reads come from mock data the caller hands in,
//   and writes are only counted, never sent anywhere.
// - Every page gets fresh storage.
// jsdom has no layout engine, so sizes and positions aren't real. Only checks that read the page's
// code, markup and CSS rules (not measured pixels) belong here. Measured layout is testers.cjs's job,
// in a real browser.
// Usage: const { startServer, openPage } = require('./sandbox.cjs')  (needs the jsdom package)
const fs = require('fs'), path = require('path'), http = require('http');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

function startServer(root) {
  root = path.resolve(root);
  const server = http.createServer((q, s) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  return new Promise(res => server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port, root })));
}

// ---- Firebase stand-in (compat API, the one the apps use) ----
// store: { 'collection/doc': {...data}, 'collection/doc/sub/doc': {...} }   user: null or { uid, email, displayName }
function mockFirebase(store, user, log, deny) {
  const denied = p => !!(deny && deny(p));
  const refuse = p => { log.denied.push(p); return Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })); };
  const snapDoc = (p) => { const d = store[p]; return { id: p.split('/').pop(), ref: docRef(p), exists: d !== undefined, data: () => (d === undefined ? undefined : JSON.parse(JSON.stringify(d))), get: k => (d || {})[k] }; };
  const snapCol = (p, filters) => {
    const depth = p.split('/').length + 1;
    let docs = Object.keys(store).filter(k => k.startsWith(p + '/') && k.split('/').length === depth).map(snapDoc);
    for (const [f, op, v] of filters) docs = docs.filter(d => { const x = (d.data() || {})[f]; return op === '==' ? x === v : op === 'in' ? (v || []).includes(x) : op === 'array-contains' ? (x || []).includes(v) : true; });
    return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn), docChanges: () => docs.map(d => ({ type: 'added', doc: d })) };
  };
  const write = (kind, p) => { log.writes.push(kind + ' ' + p); return Promise.resolve(); };
  function docRef(p) {
    return { id: p.split('/').pop(), path: p, collection: c => colRef(p + '/' + c),
      get: () => (denied(p) ? refuse(p) : Promise.resolve(snapDoc(p))), onSnapshot: (a, b) => { const cb = typeof a === 'function' ? a : (a && a.next), eb = typeof a === 'function' ? b : (a && a.error); setTimeout(() => { if (denied(p)) { log.denied.push(p); eb && eb(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })); } else cb && cb(snapDoc(p)); }, 0); return () => {}; },
      set: () => write('set', p), update: () => write('update', p), delete: () => write('delete', p) };
  }
  function colRef(p, filters = []) {
    const q = { id: p.split('/').pop(), path: p, doc: id => docRef(p + '/' + (id || 'new' + Math.random().toString(36).slice(2, 8))),
      add: () => { write('add', p); return Promise.resolve(docRef(p + '/new')); },
      where: (f, op, v) => colRef(p, [...filters, [f, op, v]]), orderBy: () => q, limit: () => q, limitToLast: () => q, startAfter: () => q, endBefore: () => q,
      get: () => (denied(p + '/*') ? refuse(p + '/*') : Promise.resolve(snapCol(p, filters))), onSnapshot: (a, b) => { const cb = typeof a === 'function' ? a : (a && a.next), eb = typeof a === 'function' ? b : (a && a.error); setTimeout(() => { if (denied(p + '/*')) { log.denied.push(p + '/*'); eb && eb(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })); } else cb && cb(snapCol(p, filters)); }, 0); return () => {}; } };
    return q;
  }
  const listeners = [];
  const auth = { currentUser: user, languageCode: 'en', useDeviceLanguage() {}, setPersistence: () => Promise.resolve(),
    onAuthStateChanged(cb) { listeners.push(cb); setTimeout(() => cb(auth.currentUser), 0); return () => {}; },
    onIdTokenChanged(cb) { setTimeout(() => cb(auth.currentUser), 0); return () => {}; },
    signInWithPopup: () => { log.signins++; return Promise.reject(Object.assign(new Error('sandbox: no sign-in'), { code: 'auth/popup-blocked' })); },
    signInWithRedirect: () => { log.signins++; return Promise.reject(new Error('sandbox: no sign-in')); },
    getRedirectResult: () => Promise.resolve({ user: null }),
    signInWithEmailAndPassword: () => { log.signins++; return Promise.reject(Object.assign(new Error('sandbox: no sign-in'), { code: 'auth/network-request-failed' })); },
    createUserWithEmailAndPassword: () => { log.signins++; return Promise.reject(new Error('sandbox: no new accounts')); },
    sendPasswordResetEmail: () => { log.writes.push('auth reset email'); return Promise.resolve(); },
    sendSignInLinkToEmail: () => { log.writes.push('auth email link'); return Promise.resolve(); },
    isSignInWithEmailLink: () => false, signInAnonymously: () => Promise.resolve({ user: auth.currentUser }),
    signOut: () => { auth.currentUser = null; listeners.forEach(cb => cb(null)); return Promise.resolve(); } };
  if (user) user.getIdToken = user.getIdToken || (() => Promise.resolve('sandbox')), user.getIdTokenResult = () => Promise.resolve({ claims: user.claims || {} });
  const db = { collection: c => colRef(c), doc: p => docRef(p), settings() {}, enablePersistence: () => Promise.resolve(), enableNetwork: () => Promise.resolve(), disableNetwork: () => Promise.resolve(),
    batch: () => ({ set() {}, update() {}, delete() {}, commit: () => write('batch', '') }), runTransaction: fn => fn({ get: r => r.get(), set: () => write('tx', ''), update: () => write('tx', '') }) };
  const fsFn = () => db; Object.assign(fsFn, { FieldValue: { serverTimestamp: () => ({ _ts: 1 }), increment: n => n, arrayUnion: (...a) => a, arrayRemove: () => [], delete: () => null },
    Timestamp: { now: () => ({ toDate: () => new Date(), toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) }), fromDate: d => ({ toDate: () => d, toMillis: () => +d }) } });
  const authFn = () => auth; authFn.GoogleAuthProvider = class { addScope() {} setCustomParameters() {} }; authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
  const app = { name: '[DEFAULT]', options: {}, auth: authFn, firestore: fsFn };
  return { apps: [], initializeApp(o) { this.apps.push(app); return app; }, app: () => app, auth: authFn, firestore: fsFn,
    storage: () => ({ ref: () => ({ child() { return this; }, put: () => write('storage', ''), getDownloadURL: () => Promise.reject(new Error('sandbox')) }) }),
    analytics: () => ({ logEvent() {} }), messaging: () => ({ getToken: () => Promise.reject(new Error('sandbox')) }), _auth: auth };
}

// What a real browser has and jsdom doesn't. Each stand-in does nothing, so the page keeps running.
function polyfill(window, opts, log) {
  const noop = () => {};
  const u = require('util');
  if (!window.TextEncoder) window.TextEncoder = u.TextEncoder; if (!window.TextDecoder) window.TextDecoder = u.TextDecoder;
  if (!window.structuredClone) window.structuredClone = v => JSON.parse(JSON.stringify(v));
  // IndexedDB: a fresh in-memory one per page when the fake-indexeddb package is there.
  if (!window.indexedDB) { try { const f = require('fake-indexeddb'); window.indexedDB = new f.IDBFactory(); for (const k of ['IDBKeyRange', 'IDBRequest', 'IDBOpenDBRequest', 'IDBTransaction', 'IDBDatabase', 'IDBObjectStore', 'IDBIndex', 'IDBCursor', 'IDBCursorWithValue', 'IDBVersionChangeEvent', 'IDBFactory']) if (f[k]) window[k] = f[k]; } catch (e) {} }
  window.BroadcastChannel = window.BroadcastChannel || class { postMessage() {} close() {} addEventListener() {} };
  window.requestIdleCallback = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 10, didTimeout: false }), 1));
  window.matchMedia = window.matchMedia || (q => ({ matches: /prefers-reduced-motion|max-width:\s*(4|5|6|7)\d\dpx/.test(q) && opts.width < 700 ? !/min-width/.test(q) : false, media: q, onchange: null, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop }));
  for (const k of ['ResizeObserver', 'IntersectionObserver', 'PerformanceObserver']) window[k] = window[k] || class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  window.scrollTo = noop; window.scrollBy = noop; window.Element.prototype.scrollIntoView = noop; window.Element.prototype.scrollTo = noop;
  window.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel: noop, play: noop, pause: noop, onfinish: null, addEventListener: noop }; };
  window.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({ canvas: this, measureText: t => ({ width: String(t).length * 7 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }), createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), createPattern: () => ({}) }, { get: (t, k) => (k in t ? t[k] : noop), set: () => true }); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'; window.HTMLCanvasElement.prototype.toBlob = cb => cb && cb(null);
  window.HTMLMediaElement.prototype.play = () => Promise.resolve(); window.HTMLMediaElement.prototype.pause = noop; window.HTMLMediaElement.prototype.load = noop;
  const audioNode = () => new Proxy({ connect() { return audioNode(); }, disconnect: noop, start: noop, stop: noop, buffer: null }, { get: (t, k) => (k in t ? t[k] : (k === 'value' ? 0 : (/^(gain|frequency|detune|playbackRate|pan|Q|delayTime|threshold|knee|ratio|attack|release)$/.test(k) ? audioNode() : noop))), set: () => true });
  const AC = class { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; this.sampleRate = 44100; } createOscillator() { return audioNode(); } createGain() { return audioNode(); } createBufferSource() { return audioNode(); } createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len || 1), copyToChannel: noop, copyFromChannel: noop, duration: 1, length: len || 1, numberOfChannels: ch || 1 }; } createDelay() { return audioNode(); } createBiquadFilter() { return audioNode(); } createDynamicsCompressor() { return audioNode(); } createStereoPanner() { return audioNode(); } createConvolver() { return audioNode(); } createAnalyser() { return audioNode(); } createMediaElementSource() { return audioNode(); } createWaveShaper() { return audioNode(); } decodeAudioData() { return Promise.resolve({ duration: 1, getChannelData: () => new Float32Array(1), numberOfChannels: 1, length: 1 }); } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); } };
  window.AudioContext = window.webkitAudioContext = AC;
  window.speechSynthesis = { speak: noop, cancel: noop, getVoices: () => [], addEventListener: noop, speaking: false }; window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  window.Notification = class { static requestPermission() { return Promise.resolve('denied'); } }; window.Notification.permission = 'denied';
  const nav = window.navigator;
  const def = (k, v) => { try { Object.defineProperty(nav, k, { value: v, configurable: true }); } catch (e) {} };
  def('vibrate', () => true); def('share', undefined); def('onLine', !opts.offline);
  def('serviceWorker', { register: () => Promise.resolve({ update: noop, unregister: () => Promise.resolve(true) }), ready: new Promise(noop), getRegistrations: () => Promise.resolve([]), addEventListener: noop, controller: null });
  def('wakeLock', { request: () => Promise.resolve({ release: () => Promise.resolve(), addEventListener: noop }) });
  def('clipboard', { writeText: () => { log.clipboard++; return Promise.resolve(); }, readText: () => Promise.resolve('') });
  def('geolocation', { getCurrentPosition: (ok, bad) => bad && bad({ code: 1, message: 'sandbox: no location' }), watchPosition: () => 0, clearWatch: noop });
  def('mediaDevices', { getUserMedia: () => Promise.reject(new Error('sandbox: no camera')), enumerateDevices: () => Promise.resolve([]) });
  def('bluetooth', undefined); def('userAgent', opts.userAgent || nav.userAgent);
  if (!window.crypto || !window.crypto.subtle) { try { Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true }); } catch (e) {} }
  window.open = (u) => { log.opened.push(String(u || '')); return null; };
  window.print = () => { log.acted = true; };
  // Tapping a photo/file button opens the phone's picker: count it as something happening.
  const click0 = window.HTMLInputElement.prototype.click;
  window.HTMLInputElement.prototype.click = function () { if (this.type === 'file') { log.acted = true; return; } return click0.call(this); };
  window.HTMLInputElement.prototype.showPicker = function () { log.acted = true; };
  window.URL.createObjectURL = () => { log.acted = true; return 'blob:sandbox'; }; window.URL.revokeObjectURL = noop;
  // Dialogs: a question box gets a made-up answer, an "are you sure?" gets No, an alert is noted.
  window.alert = m => { log.acted = true; log.alerts.push(String(m).slice(0, 120)); };
  window.confirm = m => { log.acted = true; log.confirms.push(String(m).slice(0, 120)); return false; };
  window.prompt = () => { log.acted = true; return 'Crew test'; };
  // Network: only the local test server answers. Offline personas get nothing at all.
  window.fetch = async (u, o) => {
    const url = new URL(String(u && u.url || u), window.location.href);
    if (opts.offline || url.hostname !== '127.0.0.1') { if (url.hostname !== '127.0.0.1') log.blocked.add(url.hostname); throw new window.TypeError('Failed to fetch'); }
    log.requests++;
    const r = await fetch(url.href, { method: (o && o.method) || 'GET' });
    const buf = Buffer.from(await r.arrayBuffer()); log.bytes += buf.length;
    return { ok: r.ok, status: r.status, url: url.href, headers: { get: k => r.headers.get(k) }, text: async () => buf.toString(), json: async () => JSON.parse(buf.toString()), arrayBuffer: async () => buf, blob: async () => new window.Blob([buf]), clone() { return this; } };
  };
  window.firebase = mockFirebase(opts.store || {}, opts.user || null, log, opts.deny);
  window.__fbmod = modularFirebase(window.firebase);
}

// The same stand-in, shaped like Firebase's import-style API (initializeApp, getDoc, onSnapshot ...).
function modularFirebase(fb) {
  const modSnap = s => { const ex = s.exists; return Object.assign({}, s, { exists: () => ex }); };
  const db = fb.firestore(), auth = fb.auth();
  const path = (base, segs) => [base && base.path, ...segs].filter(Boolean).join('/');
  const ref = (base, ...segs) => { const p = path(base && base.path ? base : null, segs); return p.split('/').length % 2 ? db.collection(p) : db.doc(p); };
  const api = {
    initializeApp: o => fb.initializeApp(o), getApp: () => fb.app(), getApps: () => fb.apps,
    getFirestore: () => db, initializeFirestore: () => db, enableIndexedDbPersistence: () => Promise.resolve(), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    getAuth: () => auth, initializeAuth: () => auth, browserLocalPersistence: {}, setPersistence: () => Promise.resolve(),
    doc: (b, ...s) => ref(b, ...s), collection: (b, ...s) => ref(b, ...s), collectionGroup: c => db.collection(c),
    getDoc: r => r.get().then(modSnap), getDocs: q => q.get().then(c => ({ ...c, docs: c.docs.map(modSnap), forEach: fn => c.docs.map(modSnap).forEach(fn) })), getDocFromServer: r => r.get().then(modSnap), getDocsFromServer: q => q.get(),
    setDoc: r => r.set(), updateDoc: r => r.update(), deleteDoc: r => r.delete(), addDoc: c => c.add(),
    onSnapshot: (r, a, b) => { const wrap = fn => fn && (x => fn(x && typeof x.exists === 'boolean' ? modSnap(x) : x)); return typeof a === 'function' ? r.onSnapshot(wrap(a), b) : r.onSnapshot({ next: wrap(a && a.next), error: a && a.error }); }, query: (c, ...cs) => cs.reduce((q, f) => (typeof f === 'function' ? f(q) : q), c),
    where: (f, op, v) => q => q.where(f, op, v), orderBy: () => q => q, limit: () => q => q, startAfter: () => q => q,
    serverTimestamp: () => ({ _ts: 1 }), increment: n => n, arrayUnion: (...a) => a, arrayRemove: () => [], deleteField: () => null,
    Timestamp: fb.firestore.Timestamp, writeBatch: () => db.batch(), runTransaction: (d, fn) => db.runTransaction(fn),
    onAuthStateChanged: (a, cb) => auth.onAuthStateChanged(cb), signInWithPopup: () => auth.signInWithPopup(), signInWithRedirect: () => auth.signInWithRedirect(),
    getRedirectResult: () => auth.getRedirectResult(), signOut: () => auth.signOut(), signInAnonymously: () => auth.signInAnonymously(),
    signInWithEmailAndPassword: () => auth.signInWithEmailAndPassword(), GoogleAuthProvider: fb.auth.GoogleAuthProvider,
    getStorage: () => ({}), ref: () => ({}), uploadBytes: () => Promise.resolve({}), getDownloadURL: () => Promise.reject(new Error('sandbox')),
  };
  return new Proxy(api, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve()) });
}

class FencedLoader extends ResourceLoader {
  constructor(root, log, opts) { super({ userAgent: opts.userAgent }); this.root = root; this.log = log; this.opts = opts; }
  fetch(url, o) {
    const u = new URL(url);
    if (u.hostname === '127.0.0.1') {
      if (this.opts.offline && this.log.loaded) return null;
      this.log.requests++; const p = super.fetch(url, o); if (p) p.then(b => { this.log.bytes += b.length; }, () => {}); return p;
    }
    // The apps' shared install bar and health check load from the live site: hand them this repo's copy.
    const shared = u.hostname === 'natesteele888.github.io' && u.pathname.match(/^\/apps\/(install|health|watchlink)\.js$/);
    const f = shared && path.join(this.root, 'apps', shared[1] + '.js');
    if (f && fs.existsSync(f)) { const b = fs.readFileSync(f); this.log.bytes += b.length; const p = Promise.resolve(b); p.abort = () => {}; return p; }
    this.log.blocked.add(u.hostname); return null;
  }
}

// Module scripts don't run in jsdom. Firebase-by-import pages get their imports pointed at the stand-in,
// and anything else is left out and reported as not checked.
function prepHtml(html, log) {
  return html.replace(/<script([^>]*)type=["']?module["']?([^>]*)>([\s\S]*?)<\/script>/gi, (m, a, b, body) => {
    if (/src=/.test(a + b)) { log.skipped.push('module script ' + ((a + b).match(/src=["']?([^"' >]+)/) || [])[1]); return ''; }
    if (/^\s*import\s/m.test(body) && !/firebase/i.test(body)) { log.skipped.push('module script with imports'); return ''; }
    const fixed = body.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*["'][^"']*firebase[^"']*["'];?/gm, (x, names) => `const {${names.replace(/\bas\b/g, ':')}} = window.__fbmod || {};`)
      .replace(/^\s*import\s.*$/gm, '');
    log.skipped.push('module script (firebase imports pointed at the stand-in)');
    return `<script${a}${b}>(async()=>{${fixed}\n})().catch(e=>{window.__moduleErr=e;throw e});</script>`;
  });
}

// jsdom reports a thrown error twice ("X" and "Uncaught [TypeError: X]"): keep one, in plain form.
function pushErr(log, kind, m) {
  m = String(m).split('\n')[0].replace(/^Uncaught \[(?:[A-Za-z]*Error: )?([\s\S]*)\]$/, '$1').slice(0, 200);
  const line = kind + ': ' + m; if (log.errors.length && log.errors[log.errors.length - 1].replace(/^\w+: /, '') === m) return; log.errors.push(line);
}
// opts: { width, userAgent, offline, store, user, storage: {key: value}, waitMs }
async function openPage(server, rel, opts = {}) {
  const log = { denied: [], errors: [], alerts: [], confirms: [], opened: [], writes: [], signins: 0, clipboard: 0, requests: 0, bytes: 0, blocked: new Set(), skipped: [], acted: false, loaded: false };
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { const m = String(e && e.message || e); if (/Not implemented|Could not load (img|link|script)|Could not parse CSS|navigation/i.test(m)) return; pushErr(log, 'crash', m); });
  vc.on('error', (...a) => { const m = a.map(x => (x && x.message) || String(x)).join(' '); if (/firebase|firestore|sandbox|Failed to fetch|install\.js|health\.js|Service ?worker|NetworkError|net::/i.test(m)) return; log.errors.push('console: ' + m.split('\n')[0].slice(0, 180)); });
  const url = `http://127.0.0.1:${server.port}/${rel}`;
  const t0 = Date.now();
  let html = fs.readFileSync(path.join(server.root, rel), 'utf8'); log.bytes += Buffer.byteLength(html); log.requests++;
  html = prepHtml(html, log);
  const width = opts.width || 360, height = opts.height || 780;
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', resources: new FencedLoader(server.root, log, opts), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      try { Object.defineProperty(w, 'innerWidth', { value: width, configurable: true }); Object.defineProperty(w, 'innerHeight', { value: height, configurable: true }); } catch (e) {}
      for (const [k, v] of Object.entries(opts.storage || {})) w.localStorage.setItem(k, v);
      polyfill(w, { ...opts, width }, log);
      w.addEventListener('error', ev => { const m = ev.error ? (ev.error.message || String(ev.error)) : ev.message; if (m && !/sandbox|Failed to fetch/.test(m)) pushErr(log, 'crash', m); });
      w.addEventListener('unhandledrejection', ev => { const m = ev.reason && (ev.reason.message || String(ev.reason)); if (m && !/sandbox|Failed to fetch|no sign-in|popup|network-request/i.test(m)) log.errors.push('promise: ' + String(m).split('\n')[0].slice(0, 200)); });
    } });
  await new Promise(res => { const done = () => res(); dom.window.addEventListener('load', done); setTimeout(done, 8000); });
  log.loaded = true; CURRENT = log;
  await sleep(opts.waitMs || 400);
  log.loadMs = Date.now() - t0;
  return { dom, window: dom.window, document: dom.window.document, log, url, close: () => { if (CURRENT === log) CURRENT = null; try { dom.window.close(); } catch (e) {} } };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Page code that throws inside a promise or a timer surfaces at the process level, not on the window.
// Pin it on the page that is open. (Pages run one at a time per process, so this is that page's.)
let CURRENT = null;
const GAP = /sandbox|Failed to fetch|no sign-in|popup|network-request|Not implemented|insufficient permissions/i;
const toPage = kind => e => { const m = String((e && e.message) || e); if (CURRENT && !GAP.test(m)) pushErr(CURRENT, kind, m); };
process.on('unhandledRejection', toPage('promise')); process.on('uncaughtException', toPage('crash'));

// Is this element shown? jsdom gives no layout, so go by the hidden attribute and display/visibility up the tree.
// jsdom ignores !important, so rules like .hide { display: none !important } are checked by hand.
const IMPORTANT_NONE = new WeakMap();
function importantNone(d) {
  if (IMPORTANT_NONE.has(d)) return IMPORTANT_NONE.get(d);
  const sels = []; const walk = rules => { for (const r of rules || []) { if (r.cssRules && !r.selectorText) { if (!r.media || !/max-width|print/.test(r.media.mediaText)) walk(r.cssRules); continue; } if (r.style && r.style.getPropertyValue('display') === 'none' && r.style.getPropertyPriority('display') === 'important') sels.push(r.selectorText); } };
  try { for (const sh of d.styleSheets) walk(sh.cssRules); } catch (e) {}
  const sel = sels.join(', '); IMPORTANT_NONE.set(d, sel); return sel;
}
function shown(w, e) {
  const imp = importantNone(e.ownerDocument);
  for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
    if (n.hidden || n.getAttribute('aria-hidden') === 'true' && n !== e) return false;
    if (imp) { try { if (n.matches(imp)) return false; } catch (x) {} }
    const st = w.getComputedStyle(n); if (st.display === 'none' || st.visibility === 'hidden') return false;
    if (n.tagName === 'DIALOG' && !n.open) return false;
  }
  return true;
}
const label = e => (e.getAttribute('aria-label') || e.textContent || e.value || e.title || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 50);

module.exports = { startServer, openPage, shown, label, sleep, mockFirebase };
