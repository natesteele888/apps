/* Walk-Up saved audio: every song and voice file is a Blob in this phone's IndexedDB (database "walkup", store "blobs",
   key = "s:<song id>" or "v:<voice id>"). Nothing is ever uploaded. If IndexedDB is blocked, files are kept in memory
   for this visit only (db.memOnly becomes true and the app says so). */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var NAME = "walkup", STORE = "blobs";
  var D = WU.db = { mem: new Map(), memOnly: false };
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      try {
        var req = indexedDB.open(NAME, 1);
        req.onupgradeneeded = function () { var db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
        req.onsuccess = function () { var db = req.result; db.onversionchange = function () { try { db.close(); } catch (e) { /* ignore */ } dbp = null; }; res(db); };
        req.onerror = function () { rej(req.error || new Error("idb")); };
        req.onblocked = function () { rej(new Error("blocked")); };
      } catch (e) { rej(e); }
    });
    dbp.catch(function () { D.memOnly = true; });
    return dbp;
  }
  // run fn(store) in one transaction; fn returns a request (or nothing); resolves with request.result after the transaction completes
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t, out;
        try { t = db.transaction(STORE, mode); } catch (e) { return rej(e); }
        t.oncomplete = function () { res(out && "result" in out ? out.result : undefined); };
        t.onabort = function () { rej(t.error || new Error("abort")); };
        t.onerror = function () { /* the abort handler reports it */ };
        try { out = fn(t.objectStore(STORE)); } catch (e) { try { t.abort(); } catch (x) { /* ignore */ } rej(e); }
      });
    });
  }
  function isQuota(e) {
    return !!e && (e.name === "QuotaExceededError" || e.code === 22 || /quota/i.test(String(e.message || "")));
  }
  D.isQuota = isQuota;

  D.ready = function () { return open().then(function () { return true; }, function () { return false; }); };

  /* save a blob; rejects with an error that has .quota = true when the phone is out of room */
  D.put = function (key, blob) {
    var rec = { blob: blob, type: blob.type || "", size: blob.size, at: Date.now() };
    return open().then(function () { return tx("readwrite", function (s) { return s.put(rec, key); }); }, function () { D.mem.set(key, rec); }).catch(function (e) {
      if (isQuota(e)) { var q = new Error("quota"); q.quota = true; throw q; }
      if (D.memOnly) { D.mem.set(key, rec); return; }
      throw e;
    });
  };
  D.get = function (key) {
    if (D.memOnly) return Promise.resolve(D.mem.get(key) || null);
    return tx("readonly", function (s) { return s.get(key); }).then(function (r) { return r || D.mem.get(key) || null; }, function () { return D.mem.get(key) || null; });
  };
  D.del = function (key) {
    D.mem.delete(key);
    if (D.memOnly) return Promise.resolve();
    return tx("readwrite", function (s) { return s.delete(key); }).catch(function () { /* ignore */ });
  };
  D.keys = function () {
    var memKeys = Array.from(D.mem.keys());
    if (D.memOnly) return Promise.resolve(memKeys);
    return tx("readonly", function (s) { return s.getAllKeys(); }).then(function (k) { return (k || []).concat(memKeys); }, function () { return memKeys; });
  };
  D.clear = function () {
    D.mem.clear();
    if (D.memOnly) return Promise.resolve();
    return tx("readwrite", function (s) { return s.clear(); }).catch(function () { /* ignore */ });
  };
  /* bytes of audio kept: { count, bytes } */
  D.usage = function () {
    var count = 0, bytes = 0;
    D.mem.forEach(function (r) { count++; bytes += r.size || 0; });
    if (D.memOnly) return Promise.resolve({ count: count, bytes: bytes });
    return open().then(function (db) {
      return new Promise(function (res) {
        try {
          var t = db.transaction(STORE, "readonly"), req = t.objectStore(STORE).openCursor();
          req.onsuccess = function () { var c = req.result; if (c) { count++; bytes += (c.value && c.value.size) || 0; c.continue(); } };
          t.oncomplete = function () { res({ count: count, bytes: bytes }); };
          t.onabort = t.onerror = function () { res({ count: count, bytes: bytes }); };
        } catch (e) { res({ count: count, bytes: bytes }); }
      });
    }, function () { return { count: count, bytes: bytes }; });
  };
})();
