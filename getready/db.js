/* Get Ready: photos and your own GIFs live in this phone's IndexedDB (never uploaded anywhere).
   Keys look like "photo:<item id>", "gif:<id>" and "state" (a second copy of the checklist). */
(function (root) {
  "use strict";
  function open() {
    return new Promise((res, rej) => {
      try {
        const rq = indexedDB.open("getready", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("files");
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    });
  }
  function run(mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const tx = db.transaction("files", mode), r = fn(tx.objectStore("files"));
      tx.oncomplete = () => { db.close(); res(r && r.result); };
      tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
    }));
  }
  root.GRDB = {
    get: k => run("readonly", s => s.get(k)),
    put: (k, v) => run("readwrite", s => s.put(v, k)),
    del: k => run("readwrite", s => s.delete(k)),
    keys: () => run("readonly", s => s.getAllKeys())
  };
})(window);
