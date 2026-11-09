/* Read 20: optional Google sign-in and cloud backup.
   Reading never needs this. A parent signs in once in Settings; after that the log is merged with a copy in
   Firebase (nates-toolbox project, one document per signed-in account: r20_users/<uid>) so a lost, reset or new phone
   gets it all back. The merge only ever adds time, so two phones can't erase each other.
   The Firebase scripts load only when a parent has turned this on, so the app starts instantly and works offline. */
(function () {
  "use strict";
  const CONFIG = { apiKey: "AIzaSyDT_wGN93U4oM70orIU8flSAnvXHApqW2A", authDomain: "nates-toolbox.firebaseapp.com", projectId: "nates-toolbox", storageBucket: "nates-toolbox.firebasestorage.app", messagingSenderId: "567737923830", appId: "1:567737923830:web:b597b5d71e7c7a73c4d4d7" };
  const V = "11.6.0", FLAG = "read20.cloud", COL = "r20_users";
  const SCRIPTS = ["app", "auth", "firestore"].map(n => "https://www.gstatic.com/firebasejs/" + V + "/firebase-" + n + "-compat.js");
  const C = window.R20Core;
  const cloud = { status: "off", email: "", at: 0, msg: "", onchange: () => {} };
  let getS = null, apply = null, loading = null, ready = false, timer = 0, busy = false, again = false;

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
        if (u) { set("signedin"); sync(); } else set("signedout");
        if (first) { first = false; ready = true; res(); }
      });
    })).catch(e => { loading = null; set("offline"); });
    return loading;
  }
  const ref = () => { const fb = window.firebase, u = fb.auth().currentUser; return fb.firestore().collection(COL).doc(u.uid); };

  /* One round trip: read the saved copy, merge it with this phone's log, and write the result back if it grew. */
  async function sync(force) {
    if (!ready || !window.firebase || !window.firebase.auth().currentUser) return;
    if (busy) { again = true; return; }
    busy = true; clearTimeout(timer); timer = 0;
    try {
      const fb = window.firebase, db = fb.firestore(), r = ref();
      await db.runTransaction(async tx => {
        const snap = await tx.get(r);
        let remote = null; try { remote = snap.exists ? JSON.parse(snap.data().log) : null; } catch (e) {}
        const mine = getS(), merged = force ? mine : C.merge(mine, remote || C.empty());
        const text = JSON.stringify(merged);
        if (!snap.exists || snap.data().log !== text) tx.set(r, { log: text, updated: fb.firestore.FieldValue.serverTimestamp() });
        cloud.merged = merged;
      });
      if (!force) apply(cloud.merged);
      cloud.at = Date.now(); set("ok");
    } catch (e) { set(e && e.code === "permission-denied" ? "denied" : "offline"); }
    busy = false; if (again) { again = false; schedule(2000); }
  }
  /* Called after every local save: send the change within about 20 seconds. */
  function schedule(ms) { if (!flag() || cloud.status === "off") return; if (ms == null && timer) return; clearTimeout(timer); timer = setTimeout(() => { timer = 0; sync(); }, ms == null ? 20000 : ms); } // at most one send per 20 seconds while she reads

  cloud.init = (opts) => { getS = opts.get; apply = opts.apply; cloud.onchange = opts.onchange || cloud.onchange; if (flag()) start(); };
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
  /* Overwrite the saved copy (used by "erase the log" so the cloud copy doesn't bring it back). */
  cloud.overwrite = () => sync(true);
  window.R20Cloud = cloud;
})();
