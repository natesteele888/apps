/* Eight Count: small helpers and everything saved on this phone.
   Routines and settings live in localStorage; songs and recorded takes (big files) live in IndexedDB.
   Nothing is ever sent anywhere. */
(function () {
  "use strict";
  var App = window.App = {};
  var EC = window.EC;

  App.$ = function (s, r) { return (r || document).querySelector(s); };
  App.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  App.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };

  /* ---- toast: say it out loud when something fails ---- */
  var toastTimer = 0;
  App.toast = function (msg, ms) {
    var t = App.$("#toast"); if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("on"); t.hidden = true; }, ms || 3200);
  };

  /* ---- localStorage, never allowed to break the app ---- */
  var PRE = "eightcount.";
  App.LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(PRE + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(PRE + k, JSON.stringify(v)); return true; }
      catch (e) { App.toast("Couldn't save on this phone. Storage may be full or blocked."); return false; }
    }
  };

  /* ---- IndexedDB for songs and videos ---- */
  var dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("no indexedDB"));
      var r = indexedDB.open("eightcount", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("blobs"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("blobs", mode), out;
        out = fn(tx.objectStore("blobs"));
        tx.oncomplete = function () { res(out && "result" in out ? out.result : undefined); };
        tx.onerror = tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  App.DB = {
    put: function (k, v) { return run("readwrite", function (s) { return s.put(v, k); }); },
    get: function (k) { return run("readonly", function (s) { return s.get(k); }); },
    del: function (k) { return run("readwrite", function (s) { return s["delete"](k); }); }
  };

  /* ---- the state ---- */
  var DEFAULTS = { trim: 0, flash: false, vibrate: true, volume: 0.8, cycle: 10000, subdivide: false, seenTips: false };
  App.state = { routines: [], takes: [], settings: Object.assign({}, DEFAULTS), qbpm: 120 };

  function sample() {
    var r = EC.newRoutine("Sample: game-day cheer");
    r.bpm = 120;
    var cheer = EC.newSection("Cheer", 4), dance = EC.newSection("Dance", 4);
    var C = [
      ["Clasp", "High V", "Clasp", "Low V", "Touchdown", "Touchdown", "Daggers", "Daggers"],
      ["Clasp", "T", "Clasp", "Broken T", "Punch", "Punch", "Punch", "Clasp"],
      ["Candle", "Candle", "K", "K", "Low V", "Low V", "Clap", "Clap"],
      ["Bow & arrow", "", "Bow & arrow", "", "High V", "", "Clasp", "Hold"]
    ];
    var D = [
      ["Step touch", "", "Step touch", "", "Kick", "", "Kick", ""],
      ["Turn", "", "", "Pose", "Pop", "Pop", "Pop", "Freeze"],
      ["Step touch", "", "Step touch", "", "Body roll", "", "", ""],
      ["Kick", "Kick", "Turn", "", "Jump", "", "Land", "Freeze"]
    ];
    C.forEach(function (m, i) { cheer.counts[i].m = m; });
    D.forEach(function (m, i) { dance.counts[i].m = m; });
    cheer.counts[0].n = "Feet together, hands on hips to start";
    r.sections = [cheer, dance];
    return r;
  }

  App.load = function () {
    var saved = App.LS.get("routines", null);
    var list = Array.isArray(saved) ? saved.map(function (o) {
      var r = EC.sanitizeRoutine(o); if (!r) return null;
      r.id = typeof o.id === "string" ? o.id.slice(0, 40) : r.id;
      r.created = Number(o.created) || r.created; r.updated = Number(o.updated) || r.updated;
      r.sections.forEach(function (s, i) { if (o.sections && o.sections[i] && typeof o.sections[i].id === "string") s.id = o.sections[i].id.slice(0, 40); });
      if (r.music && o.music) r.music.hasFile = !!o.music.hasFile;
      return r;
    }).filter(Boolean) : null;
    App.state.routines = list && list.length ? list : (saved == null ? [sample()] : []);
    var tk = App.LS.get("takes", []);
    App.state.takes = Array.isArray(tk) ? tk.filter(function (t) { return t && typeof t.id === "string"; }) : [];
    var st = App.LS.get("settings", {});
    App.state.settings = Object.assign({}, DEFAULTS, st && typeof st === "object" ? st : {});
    App.state.qbpm = EC.clampBpm(App.LS.get("qbpm", 120));
    if (saved == null) App.save();
  };
  App.save = function () { return App.LS.set("routines", App.state.routines); };
  App.saveSettings = function () { App.LS.set("settings", App.state.settings); };
  App.saveTakes = function () { App.LS.set("takes", App.state.takes); };
  App.routine = function (id) { return App.state.routines.filter(function (r) { return r.id === id; })[0] || null; };
  App.touch = function (r) { r.updated = Date.now(); App.save(); };
})();
