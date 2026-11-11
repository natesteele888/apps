/* Read 20: optional Google sign-in and cloud backup.
   Reading never needs this. A parent signs in once in Settings; after that the log is merged with a copy in
   Firebase (nates-toolbox project, one document per signed-in account: r20_users/<uid>) so a lost, reset or new phone
   gets it all back. A family link lets two homes use one log: both phones sync with one shared document (r20_shared/<key>, the key is
   a long random code in the link) and each phone signs in with its own Google account. The merge only ever adds time, so two phones can't erase each other.
   The Firebase scripts load only when a parent has turned this on, so the app starts instantly and works offline. */
(function () {
  "use strict";
  const CONFIG = { apiKey: "AIzaSyDT_wGN93U4oM70orIU8flSAnvXHApqW2A", authDomain: "nates-toolbox.firebaseapp.com", projectId: "nates-toolbox", storageBucket: "nates-toolbox.firebasestorage.app", messagingSenderId: "567737923830", appId: "1:567737923830:web:b597b5d71e7c7a73c4d4d7" };
  const V = "11.6.0", FLAG = "read20.cloud", COL = "r20_users", SHARED = "r20_shared", SHARE = "read20.share", PEND = "read20.joinPending", READERS = "read20.readers", KID = "read20.kid", PENDK = "read20.kidPending";
  const KEYRE = /^[a-z2-7]{20}$/, PEND_MS = 15 * 60 * 1000;
  const SCRIPTS = ["app", "auth", "firestore"].map(n => "https://www.gstatic.com/firebasejs/" + V + "/firebase-" + n + "-compat.js");
  const C = window.R20Core;
  const get = k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const put = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
  /* A join waiting on Google sign-in holds the code and when it was tapped. An abandoned one must not join this phone later, so it lapses. */
  const pendingKey = () => { const m = /^([a-z2-7]{20})\.(\d+)$/.exec(get(PEND)); return m && Date.now() - Number(m[2]) < PEND_MS ? m[1] : ""; };
  const pendingKid = () => { const m = /^([a-z2-7]{20})\.(\d+)$/.exec(get(PENDK)); return m && Date.now() - Number(m[2]) < PEND_MS ? m[1] : ""; };
  /* One reader per link: a parent's phone can hand a single reader to a child's own phone. The parent keeps {reader id: code}; the
     child's phone keeps {id, code} and then syncs ONLY that one reader's log (it never touches the family backup or other readers). */
  const readerMap = () => { try { const m = JSON.parse(get(READERS) || "{}"); return m && typeof m === "object" ? m : {}; } catch (e) { return {}; } };
  const kidInfo = () => { try { const k = JSON.parse(get(KID) || "null"); return k && KEYRE.test(k.key) && /^[a-z0-9]{1,12}$/.test(k.id) ? k : null; } catch (e) { return null; } };
  const cloud = { status: "off", email: "", at: 0, msg: "", onchange: () => {} };
  let getS = null, apply = null, applyReader = null, kidJoin = null, loading = null, ready = false, timer = 0, busy = false, again = false;

  const flag = v => { try { if (v === undefined) return localStorage.getItem(FLAG) === "1"; v ? localStorage.setItem(FLAG, "1") : localStorage.removeItem(FLAG); } catch (e) {} return false; };
  function set(status, msg) { cloud.status = status; cloud.msg = msg || ""; cloud.onchange(); }

  function loadScripts() {
    if (window.firebase && window.firebase.auth && window.firebase.firestore) return Promise.resolve();
    return SCRIPTS.reduce((p, src) => p.then(() => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("offline")); document.head.appendChild(s); })), Promise.resolve());
  }
  /* Starts Firebase and watches the sign-in. Resolves once the first sign-in state is known. */
  function start() {
    if (loading) return loading;
    set("loading");
    loading = loadScripts().then(() => new Promise(res => {
      const fb = window.firebase; if (!fb.apps.length) fb.initializeApp(CONFIG);
      let first = true;
      fb.auth().onAuthStateChanged(u => {
        cloud.email = u && u.email || "";
        if (u) { const pk = pendingKey(), kk = pendingKid(); put(PEND, ""); put(PENDK, ""); if (pk) put(SHARE, pk); set("signedin"); if (kk) finishKid(kk); else sync(); } else set("signedout");
        if (first) { first = false; ready = true; res(); }
      });
    })).catch(e => { loading = null; set("offline"); });
    return loading;
  }
  const ref = () => { const fb = window.firebase, u = fb.auth().currentUser, k = get(SHARE); return KEYRE.test(k) ? fb.firestore().collection(SHARED).doc(k) : fb.firestore().collection(COL).doc(u.uid); };

  /* One round trip: read the saved copy, merge it with this phone's log, and write the result back if it grew. */
  async function sync(force) {
    if (!ready || !window.firebase || !window.firebase.auth().currentUser) return;
    if (busy) { again = true; return; }
    busy = true; clearTimeout(timer); timer = 0;
    try {
      const fb = window.firebase, db = fb.firestore();
      if (kidInfo()) { await syncReaders(); cloud.at = Date.now(); set("ok"); busy = false; if (again) { again = false; schedule(2000); } return; }
      const r = ref();
      await db.runTransaction(async tx => {
        const snap = await tx.get(r);
        let remote = null; try { remote = snap.exists ? JSON.parse(snap.data().log) : null; } catch (e) {}
        const mine = getS(), merged = force ? mine : C.mergeRoot(mine, remote || C.emptyRoot());
        const text = JSON.stringify(C.serializeRoot(merged));
        if (!snap.exists || snap.data().log !== text) tx.set(r, { log: text, updated: fb.firestore.FieldValue.serverTimestamp() });
        cloud.merged = merged;
      });
      if (!force) apply(cloud.merged);
      await syncReaders();
      cloud.at = Date.now(); set("ok");
    } catch (e) { set(e && e.code === "permission-denied" ? "denied" : "offline"); }
    busy = false; if (again) { again = false; schedule(2000); }
  }
  /* Each linked reader has its own small shared record (r20_shared/<code>) that holds that reader's log and nothing else. */
  async function syncReaders() {
    const fb = window.firebase, db = fb.firestore(), kid = kidInfo(), targets = kid ? [[kid.id, kid.key]] : Object.entries(readerMap());
    for (const [id, key] of targets) {
      if (!KEYRE.test(key) || !getS().profiles[id]) continue;
      let merged = null;
      await db.runTransaction(async tx => {
        const r = db.collection(SHARED).doc(key), snap = await tx.get(r);
        let remote = null; try { const j = snap.exists ? JSON.parse(snap.data().log) : null; if (j && j.kind === "reader" && j.id === id) remote = j.profile; } catch (e) {}
        const mine = getS().profiles[id]; merged = remote ? C.merge(mine, remote) : mine;
        const text = JSON.stringify({ kind: "reader", id, profile: C.serialize(merged) });
        if (!snap.exists || snap.data().log !== text) tx.set(r, { log: text, updated: fb.firestore.FieldValue.serverTimestamp() });
      });
      if (merged && applyReader) applyReader(id, merged);
    }
  }
  /* A child's phone joining a reader link: read that one reader's record, then let the app make this phone a single-reader phone. */
  async function finishKid(key) {
    try {
      const fb = window.firebase, snap = await fb.firestore().collection(SHARED).doc(key).get();
      let j = null; try { j = snap.exists ? JSON.parse(snap.data().log) : null; } catch (e) {}
      if (!j || j.kind !== "reader" || !/^[a-z0-9]{1,12}$/.test(j.id || "") || !j.profile) { set("badlink"); return false; }
      kidJoin(j.id, j.profile); put(KID, JSON.stringify({ id: j.id, key })); put(SHARE, ""); put(READERS, "");
      await sync(); return cloud.status === "ok";
    } catch (e) { set(e && e.code === "permission-denied" ? "denied" : "offline"); return false; }
  }
  /* Called after every local save: send the change within about 20 seconds. */
  function schedule(ms) { if (!flag() || cloud.status === "off") return; if (ms == null && timer) return; clearTimeout(timer); timer = setTimeout(() => { timer = 0; sync(); }, ms == null ? 20000 : ms); } // at most one send per 20 seconds while she reads

  cloud.init = (opts) => { getS = opts.get; apply = opts.apply; applyReader = opts.applyReader; kidJoin = opts.kidJoin; cloud.onchange = opts.onchange || cloud.onchange; if (flag()) start(); };
  cloud.enabled = () => flag();
  cloud.signIn = async () => {
    flag(true); await start();
    if (!ready) return;
    const fb = window.firebase, p = new fb.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
    try { await fb.auth().signInWithPopup(p); }
    catch (e) { if (e && /popup/.test(e.code || "")) fb.auth().signInWithRedirect(p); else set("signedout", "Sign-in did not finish. Try again."); }
  };
  cloud.signOut = async () => { flag(false); try { await window.firebase.auth().signOut(); } catch (e) {} set("off"); };
  cloud.syncNow = () => sync();
  /* Family link: one shared log for two homes. */
  cloud.shareKey = () => { const k = get(SHARE); return KEYRE.test(k) ? k : ""; };
  cloud.parseKey = text => { const m = String(text || "").toLowerCase().replace(/[^a-z2-7]/g, ""); const t = /join=([a-z2-7]{20})/.exec(String(text || "").toLowerCase()); return t ? t[1] : KEYRE.test(m) ? m : m.length > 20 && KEYRE.test(m.slice(-20)) ? m.slice(-20) : ""; };
  cloud.link = k => location.origin + location.pathname.replace(/[^/]*$/, "") + "#join=" + (k || cloud.shareKey());
  cloud.pretty = k => (k || cloud.shareKey()).replace(/(.{5})(?=.)/g, "$1-");
  cloud.makeShare = async () => {
    const bytes = new Uint8Array(20); (window.crypto || window.msCrypto).getRandomValues(bytes);
    const A = "abcdefghijklmnopqrstuvwxyz234567"; let k = ""; for (const b of bytes) k += A[b % 32];
    put(SHARE, k); await sync(); return cloud.status === "ok" ? k : (put(SHARE, ""), "");
  };
  /* Joins the log a family link points to. Signs in first if this phone has not. */
  cloud.join = async key => {
    if (!KEYRE.test(key)) return false;
    put(PEND, key + "." + Date.now()); flag(true); await start(); if (!ready) return false;
    if (window.firebase.auth().currentUser) { put(SHARE, key); put(PEND, ""); await sync(); return cloud.status === "ok"; }
    cloud.signIn(); return false;   // finishes in the sign-in listener (also after a redirect)
  };
  cloud.leave = () => { put(SHARE, ""); put(PEND, ""); cloud.onchange(); };
  cloud.forgetJoin = () => { put(PEND, ""); put(PENDK, ""); };
  /* ----- one reader on a child's own phone ----- */
  cloud.kid = kidInfo; cloud.readerKeys = readerMap;
  cloud.parseReaderKey = text => { const t = String(text || "").toLowerCase(); const m = /reader=([a-z2-7]{20})/.exec(t); if (m) return m[1]; const c = t.replace(/[^a-z2-7]/g, ""); return KEYRE.test(c) ? c : c.length > 20 && KEYRE.test(c.slice(-20)) ? c.slice(-20) : ""; };
  cloud.readerLink = k => location.origin + location.pathname.replace(/[^/]*$/, "") + "#reader=" + k;
  cloud.makeReaderLink = async id => {
    const bytes = new Uint8Array(20); (window.crypto || window.msCrypto).getRandomValues(bytes);
    const A = "abcdefghijklmnopqrstuvwxyz234567"; let k = ""; for (const b of bytes) k += A[b % 32];
    const m = readerMap(); m[id] = k; put(READERS, JSON.stringify(m)); await sync(); if (cloud.status === "ok") return k;
    delete m[id]; put(READERS, Object.keys(m).length ? JSON.stringify(m) : ""); return "";
  };
  cloud.unlinkReader = id => { const m = readerMap(); delete m[id]; put(READERS, Object.keys(m).length ? JSON.stringify(m) : ""); cloud.onchange(); };
  cloud.joinReader = async key => {
    if (!KEYRE.test(key)) return false;
    put(PENDK, key + "." + Date.now()); flag(true); await start(); if (!ready) return false;
    if (window.firebase.auth().currentUser) { put(PENDK, ""); return finishKid(key); }
    cloud.signIn(); return false;
  };
  cloud.unlinkKid = () => { put(KID, ""); cloud.onchange(); };
  cloud.schedule = schedule;
  cloud.flush = () => { if (cloud.status === "ok" || cloud.status === "signedin") sync(); };
  /* Overwrite the saved copy (used by "erase the log" so the cloud copy doesn't bring it back). */
  cloud.overwrite = () => sync(true);
  window.R20Cloud = cloud;
})();
