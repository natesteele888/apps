/* Get Ready: optional Google sign-in and cloud backup.
   The app works without it. Sign in once (More tab) and the lists, check marks, streak history, reminders and photos are kept
   in Firebase (nates-toolbox project, one document per signed-in account: gr_users/<uid>, photos under gr_users/<uid>/photos/<item>),
   so a lost, reset or new phone gets everything back. Nothing is readable by anyone but that account (see toolbox/firestore.rules).
   The merge keeps the newer copy of each day, so two phones can't wipe each other's streak.
   The Firebase scripts load only once it is turned on, so the app starts instantly and works offline. */
(function () {
  "use strict";
  const CONFIG = { apiKey: "AIzaSyDT_wGN93U4oM70orIU8flSAnvXHApqW2A", authDomain: "nates-toolbox.firebaseapp.com", projectId: "nates-toolbox", storageBucket: "nates-toolbox.firebasestorage.app", messagingSenderId: "567737923830", appId: "1:567737923830:web:b597b5d71e7c7a73c4d4d7" };
  const V = "11.6.0", FLAG = "getready.cloud", LINKED = "getready.linked", PDEL = "getready.pdel", PDIRTY = "getready.pdirty", COL = "gr_users";
  const SCRIPTS = ["app", "auth", "firestore"].map(n => "https://www.gstatic.com/firebasejs/" + V + "/firebase-" + n + "-compat.js");
  const C = window.GRCore;
  const cloud = { status: "off", email: "", at: 0, msg: "", onchange: () => {} };
  let getS = null, apply = null, P = null, loading = null, ready = false, timer = 0, busy = false, again = false;

  const flag = v => { try { if (v === undefined) return localStorage.getItem(FLAG) === "1"; v ? localStorage.setItem(FLAG, "1") : localStorage.removeItem(FLAG); } catch (e) {} return false; };
  const ls = k => { try { const a = JSON.parse(localStorage.getItem(k)); return Array.isArray(a) ? a.filter(x => typeof x === "string") : []; } catch (e) { return []; } };
  const setLs = (k, a) => { try { a.length ? localStorage.setItem(k, JSON.stringify(a.slice(-300))) : localStorage.removeItem(k); } catch (e) {} };
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
        if (u) { set("signedin"); sync(); } else set("signedout");
        if (first) { first = false; ready = true; res(); }
      });
    })).catch(() => { loading = null; set("offline"); });
    return loading;
  }
  const user = () => window.firebase.auth().currentUser;
  const ref = () => window.firebase.firestore().collection(COL).doc(user().uid);
  const linked = () => { try { return localStorage.getItem(LINKED) === user().uid; } catch (e) { return false; } };

  /* Photos: removals first, then new or retaken pictures go up (small copies), then pictures this phone doesn't have come down. */
  async function syncPhotos(pids) {
    const fb = window.firebase, FV = fb.firestore.FieldValue, base = ref().collection("photos");
    let del = ls(PDEL);
    for (const id of del.slice()) {
      await base.doc(id).delete(); await ref().update({ pids: FV.arrayRemove(id) });
      pids = pids.filter(x => x !== id); del = del.filter(x => x !== id); setLs(PDEL, del);
    }
    const dirty = new Set(ls(PDIRTY)), local = P.ids();
    for (const id of local) {
      if (!P.exists(id) || (pids.includes(id) && !dirty.has(id))) continue;
      const blob = await P.get(id), url = blob && await P.shrink(blob); if (!url) continue;
      await base.doc(id).set({ img: url, updated: FV.serverTimestamp() }); await ref().update({ pids: FV.arrayUnion(id) });
      if (!pids.includes(id)) pids.push(id); dirty.delete(id); setLs(PDIRTY, [...dirty]);
    }
    for (const id of pids) {
      if (local.includes(id) || !P.exists(id) || ls(PDEL).includes(id)) continue;
      const d = await base.doc(id).get();
      if (d.exists && d.data().img) await P.put(id, await (await fetch(d.data().img)).blob());
    }
  }

  /* One round trip: read the saved copy, merge it with this phone, write the result back if it changed, then do the photos. */
  async function sync(force) {
    if (!ready || !window.firebase || !user()) return;
    if (busy) { again = true; return; }
    busy = true; clearTimeout(timer); timer = 0;
    let pids = [], retry = 0;
    try {
      const fb = window.firebase, db = fb.firestore(), r = ref(), first = !linked();
      await db.runTransaction(async tx => {
        const snap = await tx.get(r);
        let remote = null; try { remote = snap.exists ? JSON.parse(snap.data().data) : null; } catch (e) {}
        pids = snap.exists && Array.isArray(snap.data().pids) ? snap.data().pids.slice() : [];
        const mine = getS(), merged = force || !remote ? mine : C.merge(mine, remote, first), text = C.forCloud(merged);
        if (!snap.exists || snap.data().data !== text) tx.set(r, { data: text, updated: fb.firestore.FieldValue.serverTimestamp() }, { merge: true });
        cloud.merged = merged;
      });
      try { localStorage.setItem(LINKED, user().uid); } catch (e) {}
      if (!force) apply(cloud.merged);
      try { await syncPhotos(pids); } catch (e) { retry = 60000; } // pictures can try again later; the lists and streak are already safe
      cloud.at = Date.now(); set("ok");
    } catch (e) { set(e && e.code === "permission-denied" ? "denied" : "offline"); }
    busy = false; if (again) { again = false; schedule(2000); } else if (retry) schedule(retry);
  }
  /* Called after every local save: send the change within about 20 seconds. */
  function schedule(ms) { if (!flag() || cloud.status === "off") return; if (ms == null && timer) return; clearTimeout(timer); timer = setTimeout(() => { timer = 0; sync(); }, ms == null ? 20000 : ms); }

  cloud.init = o => { getS = o.get; apply = o.apply; P = o.photos; cloud.onchange = o.onchange || cloud.onchange; if (flag()) start(); };
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
  cloud.schedule = schedule;
  cloud.flush = () => { if (cloud.status === "ok" || cloud.status === "signedin") sync(); };
  cloud.photoChanged = id => { setLs(PDEL, ls(PDEL).filter(x => x !== id)); const d = ls(PDIRTY); if (!d.includes(id)) setLs(PDIRTY, d.concat(id)); schedule(); };
  cloud.photoGone = id => { setLs(PDIRTY, ls(PDIRTY).filter(x => x !== id)); const d = ls(PDEL); if (!d.includes(id)) setLs(PDEL, d.concat(id)); schedule(); };
  window.GRCloud = cloud;
})();
