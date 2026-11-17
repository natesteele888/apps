/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway storage. Two places a tournament can live, with the same four calls (open, create, patch, get):
   - cloud: one Firestore document per tournament in the nates-toolbox project, golf_events/<code>. The code is a long
     random id that only people with the link or QR know; nobody can list tournaments. No sign-in: knowing the code is
     the key. Each score is its own field ("p.<player>.s.<round>_<hole>"), so two phones scoring at once never undo
     each other. Firestore keeps its own copy on the phone, so scoring keeps working with no signal and catches up later.
   - local: the same document in this phone's storage, for the demo and for when the shared database isn't open to us
     (before its rules are published, or offline on first use). Other tabs on this phone see changes live.
   This phone's own list (its tournaments, which player is "me", saved courses, past rounds) is in localStorage only. */
(function () {
  "use strict";
  const C = window.FairwayCore;
  const FW = window.FW = window.FW || {};
  const FB_CONFIG = { apiKey: "AIzaSyDT_wGN93U4oM70orIU8flSAnvXHApqW2A", authDomain: "nates-toolbox.firebaseapp.com", projectId: "nates-toolbox", storageBucket: "nates-toolbox.firebasestorage.app", messagingSenderId: "567737923830", appId: "1:567737923830:web:b597b5d71e7c7a73c4d4d7" };
  const FB_VERSION = "11.6.0", COLL = "golf_events";

  /* ---------- small localStorage helpers that never throw ---------- */
  const LS = FW.LS = {
    get(k, d) { try { const s = localStorage.getItem(k); return s == null ? d : JSON.parse(s); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { window.nateHealth && nateHealth.note("save", "couldn't save on this phone"); return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing to do */ } }
  };

  /* ---------- this phone's own lists ---------- */
  const MINE = "fw:mine", COURSES = "fw:courses", HIST = "fw:history";
  FW.mine = () => (LS.get(MINE, []) || []).filter(m => m && C.isCode(m.code));
  FW.mineGet = code => FW.mine().find(m => m.code === code) || null;
  FW.mineSet = (code, o) => {
    const list = FW.mine(), i = list.findIndex(m => m.code === code);
    const m = Object.assign(i >= 0 ? list[i] : { code, at: Date.now() }, o, { seen: Date.now() });
    if (i >= 0) list.splice(i, 1);
    list.unshift(m); LS.set(MINE, list.slice(0, 40)); return m;
  };
  FW.mineDrop = code => {
    LS.set(MINE, FW.mine().filter(m => m.code !== code)); LS.del("fw:cache:" + code); LS.del("fw:ev:" + code);
    try { Object.keys(localStorage).filter(k => k.indexOf("fw:ph:" + code + ":") === 0).forEach(LS.del); } catch (e) { /* nothing to clear */ }
  };
  FW.cacheGet = code => C.cleanEvent(LS.get("fw:cache:" + code, null));
  FW.cacheSet = (code, ev) => LS.set("fw:cache:" + code, ev);
  FW.courses = () => (LS.get(COURSES, []) || []).map(C.cleanCourse);
  FW.courseSave = c => { const list = FW.courses().filter(x => x.id !== c.id); list.unshift(c); LS.set(COURSES, list.slice(0, 30)); };
  FW.courseDrop = id => LS.set(COURSES, FW.courses().filter(x => x.id !== id));
  // past finished rounds on this phone, by player name, for "previous rounds" on a player card
  FW.history = () => (LS.get(HIST, []) || []).filter(h => h && typeof h.name === "string");
  FW.historyKeep = (code, ev) => {
    if (!ev || ev.demo) return;
    const rows = C.historyRows(ev, code);
    const rest = FW.history().filter(h => h.code !== code);
    LS.set(HIST, rows.concat(rest).slice(0, 400));
  };

  /* ---------- the local place ---------- */
  const listeners = {};
  function localFire(code) { const ev = C.cleanEvent(LS.get("fw:ev:" + code, null)); (listeners[code] || []).forEach(f => f(ev)); }
  window.addEventListener("storage", e => { if (e.key && e.key.indexOf("fw:ev:") === 0) localFire(e.key.slice(6)); });
  const Local = FW.local = {
    kind: "local",
    async get(code) { return C.cleanEvent(LS.get("fw:ev:" + code, null)); },
    async create(code, ev) { if (!LS.set("fw:ev:" + code, ev)) throw Object.assign(new Error("full"), { code: "storage" }); localFire(code); },
    async patch(code, patch) {
      const cur = LS.get("fw:ev:" + code, null); if (!cur) throw Object.assign(new Error("gone"), { code: "not-found" });
      const next = C.applyPatch(cur, Object.assign({}, patch, { updated: Date.now() }));
      if (!LS.set("fw:ev:" + code, next)) throw Object.assign(new Error("full"), { code: "storage" });
      localFire(code);
    },
    open(code, cb) {
      (listeners[code] = listeners[code] || []).push(cb);
      setTimeout(() => cb(C.cleanEvent(LS.get("fw:ev:" + code, null))), 0);
      return () => { listeners[code] = (listeners[code] || []).filter(f => f !== cb); };
    }
  };

  /* ---------- the shared place (Firestore) ---------- */
  let fbPromise = null, db = null;
  function load(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(Object.assign(new Error("offline"), { code: "unavailable" })); document.head.appendChild(s); });
  }
  function ready() {
    if (db) return Promise.resolve(db);
    if (!fbPromise) {
      fbPromise = (window.firebase && window.firebase.firestore ? Promise.resolve() :
        ["app", "firestore"].reduce((p, n) => p.then(() => load("https://www.gstatic.com/firebasejs/" + FB_VERSION + "/firebase-" + n + "-compat.js")), Promise.resolve()))
        .then(() => {
          const fb = window.firebase;
          if (!fb.apps.length) fb.initializeApp(FB_CONFIG);
          db = fb.firestore();
          try { db.enablePersistence && db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) { /* one tab only, fine */ }
          return db;
        })
        .catch(e => { fbPromise = null; throw e; });
    }
    return fbPromise;
  }
  const ref = code => db.collection(COLL).doc(code);
  function toFs(patch) {
    const out = {}, del = window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.delete;
    Object.keys(patch).forEach(k => { out[k] = patch[k] && patch[k].__delete ? (del ? del() : null) : patch[k]; });
    return out;
  }
  // Waits for a write, but no longer than `ms`: offline, Firestore keeps the write on the phone and sends it later,
  // so a slow answer is not a failure. Only a real refusal (rules, bad data) rejects.
  function settle(p, ms) { return Promise.race([p.then(() => "ok"), new Promise(r => setTimeout(() => r("pending"), ms))]); }
  const Cloud = FW.cloud = {
    kind: "cloud",
    ready,
    async get(code) { await ready(); const s = await ref(code).get(); return s.exists ? C.cleanEvent(s.data()) : null; },
    async create(code, ev) { await ready(); return settle(ref(code).set(ev), 6000); },
    async patch(code, patch) { await ready(); return settle(ref(code).update(toFs(Object.assign({}, patch, { updated: Date.now() }))), 6000); },
    open(code, cb, err) {
      let off = null, stopped = false;
      ready().then(() => {
        if (stopped) return;
        off = ref(code).onSnapshot({ includeMetadataChanges: true }, s => cb(s.exists ? C.cleanEvent(s.data()) : null, { pending: !!(s.metadata && s.metadata.hasPendingWrites), cache: !!(s.metadata && s.metadata.fromCache) }), e => err && err(e));
      }).catch(e => err && err(e));
      return () => { stopped = true; if (off) off(); };
    }
  };
  /* ---------- closest-to-the-pin photos: each its own small document, never inside the tournament ---------- */
  // cloud: golf_events/<code>/ctp/<id> holding one resized JPEG as text; local: this phone's storage.
  FW.photoPut = async (code, id, img) => {
    if (FW.placeOf(code) === Local) { if (!LS.set("fw:ph:" + code + ":" + id, img)) throw Object.assign(new Error("full"), { code: "storage" }); return "ok"; }
    await ready(); return settle(ref(code).collection("ctp").doc(id).set({ img, updated: Date.now() }), 8000);
  };
  FW.photoGet = async (code, id) => {
    if (FW.placeOf(code) === Local) return LS.get("fw:ph:" + code + ":" + id, null);
    await ready(); const s = await ref(code).collection("ctp").doc(id).get(); return s.exists ? (s.data() || {}).img || null : null;
  };
  // Which place holds this tournament on this phone.
  FW.placeOf = code => { const m = FW.mineGet(code); return m && m.local ? Local : Cloud; };
  FW.denied = e => !!e && /permission|denied/i.test(String(e.code || e.message || ""));
})();
