/* Walk-Up state: what the app knows (roster, lineup, songs, mixes), saved in this phone's localStorage under "walkup.*".
   The audio files themselves live in IndexedDB (db.js). If storage is blocked the app still works for this visit and says so. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, U = WU.U;
  var S = WU.S = { st: C.emptyState(), meta: { lastBackup: null, tips: {} }, mem: false, have: new Set(), tab: "game", play: { state: "idle", id: null } };
  WU.act = {};

  /* ---------- storage that never throws ---------- */
  var memStore = {};
  var store = WU.store = {
    get: function (k) { if (S.mem) return k in memStore ? memStore[k] : null; try { return localStorage.getItem("walkup." + k); } catch (e) { return null; } },
    set: function (k, v) { if (S.mem) { memStore[k] = v; return true; } try { localStorage.setItem("walkup." + k, v); return true; } catch (e) { return false; } },
    del: function (k) { if (S.mem) { delete memStore[k]; return; } try { localStorage.removeItem("walkup." + k); } catch (e) { /* ignore */ } }
  };
  function probe() { try { localStorage.setItem("walkup.probe", "1"); localStorage.removeItem("walkup.probe"); return true; } catch (e) { return false; } }
  WU.today = function () { return C.todayStr(window.__today); };

  var lastErr = 0;
  WU.save = function () {
    var ok = store.set("state", JSON.stringify(S.st));
    if (!ok && Date.now() - lastErr > 4000) { lastErr = Date.now(); U.toast("Couldn't save on this phone. Storage may be full or blocked. Make a backup from Settings.", "error", 7000); }
    return ok;
  };
  WU.saveMeta = function () { return store.set("meta", JSON.stringify(S.meta)); };
  WU.load = function () {
    S.mem = !probe();
    var st = null, raw = null;
    S.loadFailed = false;
    try { raw = store.get("state"); if (raw) st = JSON.parse(raw); } catch (e) { st = null; S.loadFailed = true; }
    if (S.loadFailed) store.set("state.bad", raw); // keep the unreadable copy rather than writing over it
    S.st = C.sanitizeState(st);
    var m = null;
    try { m = JSON.parse(store.get("meta") || "null"); } catch (e) { m = null; }
    S.meta = { lastBackup: m && C.isYMD(m.lastBackup) ? m.lastBackup : null, tips: {} };
    if (m && m.tips && typeof m.tips === "object") Object.keys(m.tips).forEach(function (k) { if (/^[a-z]{2,16}$/.test(k) && m.tips[k] === true) S.meta.tips[k] = true; });
  };
  WU.replaceState = function (st) { S.st = C.sanitizeState(st); WU.save(); };

  /* ---------- screens and open sheets listen for changes ---------- */
  var subs = [];
  WU.on = function (fn) { subs.push(fn); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; };
  WU.emit = function (what) { subs.slice().forEach(function (fn) { try { fn(what); } catch (e) { console.error(e); } }); };
  /* save, then tell everybody; what is "data" for anything that changes the roster, songs or mixes */
  WU.commit = function (what) { WU.save(); WU.emit(what || "data"); };

  /* ---------- lookups ---------- */
  WU.player = function (id) { for (var i = 0; i < S.st.roster.length; i++) if (S.st.roster[i].id === id) return S.st.roster[i]; return null; };
  WU.curId = function () { return S.st.lineup[S.st.batter] || null; };
  WU.cur = function () { return WU.player(WU.curId()); };
  WU.song = function (id) { return C.songById(S.st.songs, id); };
  WU.have = function (k) { return S.have.has(k); };
  WU.status = function (p) { return C.statusOf(p, S.st.songs, WU.have); };
  WU.songUsers = function (songId) { return S.st.roster.filter(function (p) { return p.songId === songId; }); };
  WU.speechOpts = function () { var s = S.st.settings; return { voiceURI: s.tvoice, rate: s.trate, volume: s.tvol / 100 }; };

  /* ---------- audio files on this phone ---------- */
  WU.refreshHave = function () {
    return WU.db.keys().then(function (k) { S.have = new Set(k); return S.have; }, function () { return S.have; });
  };
  WU.askPersist = function () { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ } };
  /* save a blob under a key; resolves true, or rejects with a plain message in .plain */
  WU.putAudio = function (key, blob) {
    return WU.db.put(key, blob).then(function () { S.have.add(key); WU.askPersist(); return true; }, function (e) {
      var err = new Error((e && e.quota) ? "quota" : "save");
      err.plain = e && e.quota ? "This phone is out of room. Try a shorter clip or remove one." : "Couldn't save that file on this phone.";
      throw err;
    });
  };
  WU.dropAudio = function (key) {
    S.have.delete(key);
    WU.eng.forget(key.slice(2));
    return WU.db.del(key);
  };
  /* delete saved files nothing points at */
  WU.gc = function () {
    if (S.mem) return Promise.resolve(0);
    var want = new Set(C.audioKeys(S.st));
    return WU.db.keys().then(function (keys) {
      var drop = keys.filter(function (k) { return !want.has(k); });
      return Promise.all(drop.map(function (k) { return WU.dropAudio(k); })).then(function () { return drop.length; });
    }, function () { return 0; });
  };

  /* ---------- pieces of text used on several screens ---------- */
  WU.songLabel = function (p) {
    var s = p.songId ? WU.song(p.songId) : null;
    if (!s) return p.songId ? "Song missing" : "No song";
    return s.title;
  };
  WU.voiceLabel = function (p) {
    var v = p.voice;
    if (!v) return "No voice";
    return v.kind === "tts" ? "Computer voice" : v.kind === "rec" ? "Recorded voice" : "Voice file";
  };
  WU.chipClass = function (code) { return code === "ready" ? "ok" : code === "needs-song" || code === "needs-voice" ? "bad" : "warn"; };
})();
