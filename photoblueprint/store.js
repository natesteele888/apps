/* Photo Blueprint store: where sheets live.
   - On this phone (IndexedDB): every sheet you make, picture included. Works offline, needs no account.
   - In the cloud (Firebase project nates-toolbox, Firestore): sign in with Google to keep your sheets across phones
     (sp_sheets, owner only), share them with everyone (sp_public) and let others see the picture (sp_images).
   The Firebase scripts load only when needed, so the app starts instantly with no signal. */
(function () {
  "use strict";
  const C = window.SPCore;
  const DB = "photoblueprint", VER = 1;

  /* ---------- settings (localStorage) ---------- */
  const settings = {
    get(k, d) { try { const v = localStorage.getItem("sp." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sp." + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- this phone ---------- */
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("no indexeddb"));
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("sheets")) d.createObjectStore("sheets", { keyPath: "id" }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(d => new Promise((res, rej) => {
      const t = d.transaction("sheets", mode), st = t.objectStore("sheets");
      let out; try { out = fn(st); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  const local = {
    all() { return tx("readonly", st => st.getAll()).then(a => (a || []).sort((x, y) => (y.created || 0) - (x.created || 0))).catch(() => []); },
    get(id) { return tx("readonly", st => st.get(id)).catch(() => null); },
    // Saves the whole record: the sheet's fields plus `image` (full picture) and `pending` (a cloud write still owed).
    put(rec) { return tx("readwrite", st => st.put(rec)); },
    del(id) { return tx("readwrite", st => st.delete(id)); },
    async persist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {} return false; }
  };

  /* ---------- the cloud ---------- */
  const CONFIG = { apiKey: "AIzaSyDT_wGN93U4oM70orIU8flSAnvXHApqW2A", authDomain: "nates-toolbox.firebaseapp.com", projectId: "nates-toolbox", storageBucket: "nates-toolbox.firebasestorage.app", messagingSenderId: "567737923830", appId: "1:567737923830:web:b597b5d71e7c7a73c4d4d7" };
  const V = "11.6.0", SCRIPTS = ["app", "auth", "firestore"].map(n => "https://www.gstatic.com/firebasejs/" + V + "/firebase-" + n + "-compat.js");
  const cloud = { status: "off", user: null, onchange: () => {} };
  let loading = null;
  function set(status) { cloud.status = status; cloud.onchange(status); }
  function loadScripts() {
    if (window.firebase && window.firebase.auth && window.firebase.firestore) return Promise.resolve();
    return SCRIPTS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
      if (document.querySelector('script[src="' + src + '"]') && window.firebase) return res();
      const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { s.remove(); rej(new Error("offline")); }; document.head.appendChild(s);
    })), Promise.resolve());
  }
  /* Starts Firebase (loads its scripts on the first call). Resolves true once the sign-in state is known, false with no signal. */
  cloud.start = function () {
    if (loading) return loading;
    set("loading");
    loading = loadScripts().then(() => new Promise(res => {
      const fb = window.firebase; if (!fb.apps.length) fb.initializeApp(CONFIG);
      let first = true;
      fb.auth().onAuthStateChanged(u => {
        cloud.user = u ? { uid: u.uid, name: u.displayName || "", photo: u.photoURL || "", email: u.email || "" } : null;
        settings.set("cloud", !!u);
        set(u ? "signedin" : "signedout");
        if (first) { first = false; res(true); }
      });
    })).catch(() => { loading = null; set("offline"); return false; });
    return loading;
  };
  cloud.ready = () => !!(window.firebase && window.firebase.apps && window.firebase.apps.length);
  cloud.signIn = async function () {
    const ok = await cloud.start(); if (!ok) return false;
    const fb = window.firebase, p = new fb.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
    try { await fb.auth().signInWithPopup(p); return true; }
    catch (e) { if (e && /popup/.test(e.code || "")) { fb.auth().signInWithRedirect(p); return true; } return false; }
  };
  cloud.signOut = async function () { try { await window.firebase.auth().signOut(); } catch (e) {} settings.set("cloud", false); set(cloud.ready() ? "signedout" : "off"); };
  const db = () => window.firebase.firestore();
  const fromDoc = d => { const o = d.data() || {}; o.id = d.id; for (const k of ["created", "updated"]) if (o[k] && typeof o[k].toMillis === "function") o[k] = o[k].toMillis(); return C.clean(o); };
  // A read that came back empty from the phone's cache with no signal is not an answer (see lessons.md, 2026-11-08).
  const noSignal = snap => snap.metadata && snap.metadata.fromCache && (snap.empty || (snap.exists === false));
  function sheetDoc(s) { const o = C.clean(s); o.uid = cloud.user.uid; o.author = cloud.user.name || o.author || ""; o.updated = Date.now(); o.created = o.created || o.updated; return o; }

  /* Everyone's public sheets, newest first. `after` is the last sheet of the previous page. Throws "signal" with no signal. */
  cloud.publicSheets = async function (limit, after) {
    if (!cloud.ready()) { if (!(await cloud.start())) throw new Error("signal"); }
    let q = db().collection("sp_public").orderBy("created", "desc").limit(limit || 60);
    if (after && after.created) q = q.startAfter(after.created);
    const snap = await q.get();
    if (noSignal(snap)) throw new Error("signal");
    return snap.docs.map(fromDoc);
  };
  /* My own cloud copies (needs sign-in). */
  cloud.mySheets = async function () {
    if (!cloud.user) return [];
    const snap = await db().collection("sp_sheets").where("uid", "==", cloud.user.uid).get();
    if (noSignal(snap)) throw new Error("signal");
    return snap.docs.map(fromDoc);
  };
  /* One sheet by id: the public copy first, then my own. Null when it is gone; throws "signal" offline. */
  cloud.getSheet = async function (id) {
    if (!cloud.ready()) { if (!(await cloud.start())) throw new Error("signal"); }
    try {
      const pub = await db().collection("sp_public").doc(id).get();
      if (pub.exists) return fromDoc(pub);
      if (cloud.user) { const mine = await db().collection("sp_sheets").doc(id).get(); if (mine.exists) return fromDoc(mine); }
      return null;
    } catch (e) { if (e && e.code === "permission-denied") return null; throw new Error("signal"); }
  };
  /* The full picture for a sheet (a data URL), or "" when it can't be read. */
  cloud.getImage = async function (id) {
    try { const d = await db().collection("sp_images").doc(id).get(); return d.exists ? (d.data().data || "") : ""; }
    catch (e) { return ""; }
  };
  /* Writes a sheet to the cloud: always to my sheets, to everyone's when it is public (and removes it there when it isn't). */
  cloud.publish = async function (sheet, image) {
    if (!cloud.user) throw new Error("signin");
    const o = sheetDoc(sheet), d = db(), b = d.batch();
    b.set(d.collection("sp_sheets").doc(o.id), o);
    if (o.public) b.set(d.collection("sp_public").doc(o.id), o); else b.delete(d.collection("sp_public").doc(o.id));
    if (image) b.set(d.collection("sp_images").doc(o.id), { uid: o.uid, public: !!o.public, data: image, updated: o.updated });
    else b.set(d.collection("sp_images").doc(o.id), { public: !!o.public, updated: o.updated, uid: o.uid }, { merge: true });
    await b.commit();
    return o;
  };
  cloud.remove = async function (id) {
    if (!cloud.user) return;
    const d = db(), b = d.batch();
    for (const c of ["sp_sheets", "sp_public", "sp_images"]) b.delete(d.collection(c).doc(id));
    await b.commit();
  };

  window.SPStore = { settings, local, cloud };
})();
