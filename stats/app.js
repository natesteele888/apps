/* My Stats page: sign in to the LYBS Dashboard, pick the player, send their seasons to the watch.
   The stats are read after sign-in (the Dashboard's rules decide who may read them) and only ever held in memory here. */
(function () {
  "use strict";
  const C = window.StatsCore, WL = window.WatchLink;
  const PKEY = "stats.player", SIG = "stats.sent";
  // the LYBS Dashboard's public web config (an identifier, not a secret: its Firestore rules guard the data)
  const DASHBOARD = { apiKey: "AIzaSyAnFzm4QNqrEtre71SbTjG45w0SlLQ-8QA", authDomain: "lybs-dashboard.firebaseapp.com", projectId: "lybs-dashboard",
    storageBucket: "lybs-dashboard.firebasestorage.app", messagingSenderId: "951495325870", appId: "1:951495325870:web:6af89f00d25f74f4ff953f" };
  const SDK = "https://www.gstatic.com/firebasejs/11.6.0/firebase-";
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ls = { get: k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} } };

  let fb = null, rows = null, list = [], user = null;

  const loadSdk = () => ["app", "auth", "firestore"].reduce((p, n) => p.then(() => new Promise((res, rej) => {
    const el = document.createElement("script"); el.src = SDK + n + "-compat.js"; el.onload = res; el.onerror = () => rej(new Error("offline"));
    document.head.appendChild(el);
  })), Promise.resolve());

  function drawSignin(msg, cls) {
    const el = $("signin");
    if (user) {
      el.innerHTML = '<div class="row"><span>Signed in to the LYBS Dashboard as ' + esc(user.displayName || "you") + '.</span>' +
        '<button class="btn" id="out">Sign out</button></div>' + (msg ? '<p class="msg ' + (cls || "") + '">' + esc(msg) + "</p>" : "");
      $("out").onclick = () => fb.auth().signOut();
    } else {
      el.innerHTML = "<h2>Sign in</h2><p>Use the Google account you sign in to the LYBS Dashboard with.</p>" +
        '<button class="btn pri" id="in">Sign in with Google</button>' + (msg ? '<p class="msg ' + (cls || "") + '">' + esc(msg) + "</p>" : "");
      $("in").onclick = signIn;
    }
  }

  async function signIn() {
    const p = new fb.auth.GoogleAuthProvider();
    try { await fb.auth().signInWithPopup(p); }
    catch (e) {
      if (e && /popup-blocked|operation-not-supported/.test(e.code || "")) { try { await fb.auth().signInWithRedirect(p); return; } catch (e2) { e = e2; } }
      if (e && e.code === "auth/popup-closed-by-user") return;
      drawSignin("That sign-in didn't work: " + (e && e.message || e), "err");
    }
  }

  async function loadStats() {
    try {
      const snap = await fb.firestore().collection("lybs_bins").doc("lybs-gcstats").get();
      rows = snap.exists ? (snap.data().rows || []) : [];
      list = C.players(rows);
      drawSignin();
      drawPlayer();
    } catch (e) {
      rows = null;
      drawSignin(e && e.code === "permission-denied" ? "This account can't see player stats in the Dashboard. Sign in with the admin account." : "Couldn't load the stats: " + (e && e.message || e), "err");
    }
  }

  function chosen() { const k = ls.get(PKEY); return list.find(p => p.key === k) || null; }

  function drawPlayer() {
    const el = $("player"); el.hidden = !rows;
    if (!rows) return;
    const p = chosen();
    if (p) {
      el.innerHTML = '<h2>Player</h2><div class="row"><strong>' + esc(p.name) + '</strong><span class="muted">' + esc(p.years.join(", ")) +
        '</span><button class="btn" id="change">Change</button></div>';
      $("change").onclick = () => { ls.set(PKEY, ""); drawPlayer(); };
      drawSend(true);
      return;
    }
    el.innerHTML = '<h2>Player</h2><input type="search" id="q" placeholder="Type a first name" autocomplete="off" aria-label="Player\'s first name"><div class="pick" id="hits"></div>' +
      (list.length ? "" : '<p class="msg err">No stats in the Dashboard yet.</p>');
    const q = $("q"), hits = $("hits");
    q.oninput = () => {
      hits.innerHTML = C.search(list, q.value).map(x => '<button class="btn" data-k="' + esc(x.key) + '">' + esc(x.name) + ' <span class="muted">' + esc(x.years.join(", ")) + "</span></button>").join("");
    };
    hits.onclick = e => { const b = e.target.closest("[data-k]"); if (!b) return; ls.set(PKEY, b.dataset.k); drawPlayer(); };
    $("send").hidden = true;
  }

  async function drawSend(auto) {
    const el = $("send"), p = chosen();
    if (!p || !rows) { el.hidden = true; return; }
    const w = C.forWatch(rows, p.key);
    el.hidden = false;
    el.innerHTML = "<h2>What goes to the watch</h2>" +
      "<table><thead><tr><th>Season</th><th>AVG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>ERA</th><th>K</th></tr></thead><tbody>" +
      w.s.map(x => { const l = C.line(x); return "<tr><td>" + esc(x.y + (x.lv ? " " + x.lv : "")) + "</td><td>" + l.avg + "</td><td>" + l.ops + "</td><td>" + x.b.h + "</td><td>" + x.b.hr + "</td><td>" + x.b.rbi + "</td><td>" + l.era + "</td><td>" + x.p.so + "</td></tr>"; }).join("") +
      '</tbody></table><div class="row" style="margin-top:12px"><button class="btn pri" id="go"' + (WL.linked() ? "" : " disabled") + ">Send to the watch</button></div><p class=\"msg\" id=\"sent\"></p>";
    $("go").onclick = () => send(p, w);
    if (!WL.linked()) $("sent").textContent = "Link the watch above first.";
    else if (auto && ls.get(SIG) !== C.signature(p.key, w)) send(p, w);
    else if (ls.get(SIG) === C.signature(p.key, w)) $("sent").textContent = "The watch has these numbers.";
  }

  async function send(p, w) {
    const m = $("sent"); m.className = "msg"; m.textContent = "Sending…";
    try {
      await WL.write("ps", w);
      ls.set(SIG, C.signature(p.key, w));
      m.className = "msg ok"; m.textContent = "Sent! " + w.s.length + " season" + (w.s.length === 1 ? "" : "s") + " are on the watch in a minute or two.";
    } catch (e) {
      m.className = "msg err";
      m.textContent = /HTTP 403/.test(e.message) ? "The watch link doesn't take stats yet (its database rules need publishing once)." : "That didn't send. Check your signal and try again.";
    }
  }

  function drawWatch() {
    $("watch").hidden = false;
    WL.panel($("wl"), { btn: "btn", btnPri: "btn pri", intro: "On the watch, open My Stats. It shows a code: type it here.", linkedText: "Stats go to it from here.", onLinked: () => drawSend(true) });
  }

  (async () => {
    drawWatch();
    WL.onChange(() => drawSend(false));
    $("signin").innerHTML = "<p>Loading…</p>";
    try { await loadSdk(); } catch (e) { $("signin").innerHTML = '<p class="msg err">No connection. My Stats needs signal to sign in.</p>'; return; }
    fb = window.firebase; fb.initializeApp(DASHBOARD);
    fb.auth().onAuthStateChanged(u => { user = u; rows = null; if (u) loadStats(); else { drawSignin(); drawPlayer(); $("send").hidden = true; } });
  })();
})();
