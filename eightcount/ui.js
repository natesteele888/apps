/* Eight Count: the screens. */
(function () {
  "use strict";
  var App = window.App, EC = window.EC, E = App.engine;
  var $ = App.$, $$ = App.$$, esc = App.esc, S = App.state;
  var VERSION = "Eight Count v1";
  var main, cur = null /* open routine id */, stack = [], afterPop = null, sheetOpen = false;

  /* ================= navigation: the phone's Back button closes the top thing ================= */
  function push(close) { stack.push({ close: close }); try { history.pushState({ d: stack.length }, ""); } catch (e) {} }
  function back() { if (stack.length) history.back(); }
  window.addEventListener("popstate", function () {
    var e = stack.pop(); if (e) e.close();
    if (afterPop) { var f = afterPop; afterPop = null; f(); }
  });
  function backThen(fn) { if (!stack.length) return fn(); afterPop = fn; history.back(); }

  /* ================= sheets ================= */
  function openSheet(html, onClose) {
    var wrap = $("#sheetWrap"), sh = $("#sheet");
    sh.innerHTML = html;
    wrap.hidden = false;
    requestAnimationFrame(function () { wrap.classList.add("on"); });
    if (!sheetOpen) {
      sheetOpen = true;
      push(function () { sheetOpen = false; wrap.classList.remove("on"); wrap.hidden = true; sh.innerHTML = ""; if (onClose) onClose(); });
    }
    var f = $("[autofocus]", sh) || $("input,textarea", sh); if (f && !f.dataset.nofocus) { try { f.focus({ preventScroll: true }); } catch (e) {} }
    return sh;
  }
  function closeSheet() { if (sheetOpen) back(); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && stack.length) back(); });
  $("#sheetWrap").addEventListener("click", function (e) { if (e.target.classList.contains("backdrop")) closeSheet(); });

  function download(name, blob) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function safeName(s) { return (s || "routine").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "routine"; }

  /* ================= HOME ================= */
  function counts(n) { return n + " eight-count" + (n === 1 ? "" : "s"); }
  function takesFor(rid) { return S.takes.filter(function (t) { return t.rid === rid; }); }
  function viewHome() {
    var list = S.routines.map(function (r) {
      var tk = takesFor(r.id).length;
      return '<button class="card rt" data-act="open" data-id="' + esc(r.id) + '"><div><div class="rt-name">' + esc(r.name) + '</div><div class="rt-meta">' +
        counts(EC.totalCounts(r)) + " · " + r.bpm + " BPM" + (r.music ? " · song" : "") + (tk ? " · " + tk + " take" + (tk > 1 ? "s" : "") : "") +
        '</div></div><span class="chev" aria-hidden="true">›</span></button>';
    }).join("") || '<p class="empty">No routines yet. Tap <b>New routine</b> to write your first 8-count.</p>';
    main.innerHTML =
      '<header class="top"><div class="logo" aria-hidden="true">8</div><div class="tt"><h1>Eight Count</h1><p>Get the whole team on the same count</p></div>' +
      '<button class="icon" data-act="settings" aria-label="Settings">⚙</button></header>' +
      '<section class="card quick"><h2>Quick count</h2><p class="hint">Just a steady 8-count to practice with. No routine needed.</p>' +
      '<div class="bpmrow"><button class="round" data-act="qminus" aria-label="Slower">−</button><div class="bpmval"><b id="qv">' + S.qbpm + '</b><span>BPM</span></div>' +
      '<button class="round" data-act="qplus" aria-label="Faster">+</button><button class="pill" data-act="qtap">Tap tempo</button></div>' +
      '<button class="cta" data-act="qstart">▶ Start counting</button></section>' +
      '<div class="rowh"><h2>My routines</h2></div>' + list +
      '<div class="actions"><button class="btn" data-act="new">+ New routine</button><button class="btn ghost" data-act="import">Import</button></div>' +
      '<p class="foot">Everything stays on this phone. <button class="link" data-act="help">How it works</button></p>';
  }

  /* ================= ROUTINE ================= */
  function gIndex(r, si, ci) { var g = 0; for (var i = 0; i < si; i++) g += r.sections[i].counts.length; return g + ci; }
  function countHtml(r, si, ci) {
    var s = r.sections[si], c = s.counts[ci], g = gIndex(r, si, ci), cells = "";
    for (var b = 0; b < 8; b++) {
      var m = c.m[b];
      cells += '<button class="cell' + (m ? "" : " empty") + '" data-act="cell" data-si="' + si + '" data-ci="' + ci + '" data-b="' + b + '"><i>' + (b + 1) + "</i><span>" + (esc(m) || "·") + "</span></button>";
    }
    return '<div class="cnt"><div class="cnt-h"><b>8-count ' + (g + 1) + "</b>" + (c.n ? "<em>" + esc(c.n) + "</em>" : "") +
      '<button class="icon sm" data-act="cnt-menu" data-si="' + si + '" data-ci="' + ci + '" aria-label="Options for 8-count ' + (g + 1) + '">⋯</button></div><div class="cells">' + cells + "</div></div>";
  }
  function viewRoutine(r) {
    var secs = r.sections.map(function (s, si) {
      return '<section class="card sec"><header class="sec-h"><button class="sec-name" data-act="sec-menu" data-si="' + si + '">' + esc(s.name) +
        ' <span aria-hidden="true">⋯</span></button><span class="sec-meta">' + s.counts.length + " × 8</span></header>" +
        s.counts.map(function (_, ci) { return countHtml(r, si, ci); }).join("") +
        '<button class="btn ghost small" data-act="add-count" data-si="' + si + '">+ Add an 8-count</button></section>';
    }).join("");
    var tk = takesFor(r.id);
    main.innerHTML =
      '<header class="top"><button class="icon" data-act="back" aria-label="Back">‹</button><div class="tt"><h1 class="rname">' + esc(r.name) + '</h1><p>' + counts(EC.totalCounts(r)) + "</p></div>" +
      '<button class="icon" data-act="rmenu" aria-label="Routine options">⋯</button></header>' +
      '<div class="go3"><button class="go practice" data-act="practice"><b>▶</b>Practice</button><button class="go lock" data-act="lock"><b>👥</b>Lock in</button><button class="go rec" data-act="record"><b>●</b>Record</button></div>' +
      '<section class="card tempo"><div class="bpmrow"><button class="round" data-act="bpm-" aria-label="Slower">−</button><div class="bpmval"><b id="rbpm">' + r.bpm + '</b><span>BPM</span></div>' +
      '<button class="round" data-act="bpm+" aria-label="Faster">+</button><button class="pill" data-act="tap">Tap tempo</button></div>' +
      '<button class="song" data-act="song">' + (r.music ? "🎵 " + esc(r.music.name) + (r.music.hasFile ? "" : " (add the song file)") + " · set up" : "🎵 Add a song") + "</button></section>" +
      secs + '<button class="btn ghost wide" data-act="add-section">+ Add a section</button>' +
      '<h2 class="rowh">Recorded takes</h2>' +
      (tk.length ? tk.slice().reverse().map(function (t) {
        return '<div class="card take"><div><b>' + new Date(t.created).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + "</b><span>" + (t.dur ? Math.round(t.dur) + " s · " : "") + Math.round(t.rate * 100) + "% speed</span></div>" +
          '<button class="btn small" data-act="watch" data-id="' + esc(t.id) + '">Watch</button></div>';
      }).join("") : '<p class="empty">No takes yet. Tap <b>Record</b> to film your team with the count on screen.</p>');
  }

  function render() {
    var y = window.scrollY, r = cur && App.routine(cur);
    if (r) viewRoutine(r); else { cur = null; viewHome(); }
    window.scrollTo(0, y);
  }

  /* ================= tap tempo ================= */
  var taps = [];
  function tapTempo(cb) {
    var t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
    taps.push(t); taps = taps.slice(-8);
    if (taps.length >= 3) {
      var iv = []; for (var i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
      iv.sort(function (a, b) { return a - b; });
      var med = iv[Math.floor(iv.length / 2)];
      cb(EC.clampBpm(60000 / med));
    } else App.toast("Keep tapping along to the beat", 1200);
  }

  /* ================= clicks on the main view ================= */
  function setBpm(r, v) { r.bpm = EC.clampBpm(v); App.touch(r); var el = $("#rbpm"); if (el) el.textContent = r.bpm; }
  function setQ(v) { S.qbpm = EC.clampBpm(v); App.LS.set("qbpm", S.qbpm); $("#qv").textContent = S.qbpm; }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]"); if (!t || t.closest("#player,#sheet,#review")) return;
    var a = t.dataset.act, r = cur && App.routine(cur), si = +t.dataset.si, ci = +t.dataset.ci;
    switch (a) {
      case "open": cur = t.dataset.id; push(function () { cur = null; render(); }); render(); window.scrollTo(0, 0); break;
      case "back": back(); break;
      case "new": openRename("New routine", "", "Routine name, e.g. Game-day cheer", function (name) {
        var n = EC.newRoutine(name || "New routine"); S.routines.push(n); App.save(); cur = n.id; push(function () { cur = null; render(); }); render(); window.scrollTo(0, 0);
      }); break;
      case "import": openImport(); break;
      case "settings": openSettings(); break;
      case "help": openHelp(); break;
      case "qminus": setQ(S.qbpm - 1); break;
      case "qplus": setQ(S.qbpm + 1); break;
      case "qtap": tapTempo(setQ); break;
      case "qstart": openPlayer("free"); break;
      case "bpm-": if (r) setBpm(r, r.bpm - 1); break;
      case "bpm+": if (r) setBpm(r, r.bpm + 1); break;
      case "tap": if (r) tapTempo(function (v) { setBpm(r, v); }); break;
      case "practice": openPlayer("practice", cur); break;
      case "lock": openPlayer("lock", cur); break;
      case "record": openPlayer("record", cur); break;
      case "rmenu": openRoutineMenu(r); break;
      case "song": openSong(r); break;
      case "cell": openCell(r, si, ci, +t.dataset.b); break;
      case "cnt-menu": openCountMenu(r, si, ci); break;
      case "sec-menu": openSectionMenu(r, si); break;
      case "add-count": r.sections[si].counts.push(EC.blankCount()); App.touch(r); render(); break;
      case "add-section": r.sections.push(EC.newSection("Section " + (r.sections.length + 1), 2)); App.touch(r); render(); break;
      case "watch": openReview(t.dataset.id); break;
    }
  });

  /* ================= sheets: rename / cell / count / section / routine ================= */
  function openRename(title, value, ph, cb) {
    var sh = openSheet('<h3>' + esc(title) + '</h3><form id="rf"><input id="rv" maxlength="60" autocomplete="off" placeholder="' + esc(ph) + '" value="' + esc(value) + '" autofocus>' +
      '<div class="sheet-actions"><button type="button" class="btn ghost" data-s="cancel">Cancel</button><button class="btn" type="submit">Save</button></div></form>');
    $("#rf", sh).onsubmit = function (e) { e.preventDefault(); var v = $("#rv", sh).value.trim(); backThen(function () { cb(v); }); };
    $("[data-s=cancel]", sh).onclick = closeSheet;
  }
  function confirmSheet(title, body, yes, cb) {
    var sh = openSheet('<h3>' + esc(title) + "</h3><p>" + esc(body) + '</p><div class="sheet-actions"><button class="btn ghost" data-s="no">Keep it</button><button class="btn danger" data-s="yes">' + esc(yes) + "</button></div>");
    $("[data-s=no]", sh).onclick = closeSheet;
    $("[data-s=yes]", sh).onclick = function () { backThen(cb); };
  }

  var cat = "Arms";
  function openCell(r, si, ci, b, keepCat) {
    var s = r.sections[si], c = s.counts[ci], g = gIndex(r, si, ci);
    if (!keepCat) { var cur = (c.m[b] || "").toLowerCase(); Object.keys(EC.MOVES).forEach(function (k) { if (EC.MOVES[k].some(function (m) { return m.toLowerCase() === cur; })) cat = k; }); }
    var chips = EC.MOVES[cat].map(function (m) { return '<button type="button" class="chip" data-m="' + esc(m) + '">' + esc(m) + "</button>"; }).join("");
    var tabs = Object.keys(EC.MOVES).map(function (k) { return '<button type="button" class="pill" data-cat="' + k + '" aria-pressed="' + (k === cat) + '">' + k + "</button>"; }).join("");
    var dots = c.m.map(function (_, i) { return '<button type="button" class="dot' + (i === b ? " on" : "") + '" data-b="' + i + '" aria-label="Beat ' + (i + 1) + '">' + (i + 1) + "</button>"; }).join("");
    var sh = openSheet('<h3>' + esc(s.name) + " · 8-count " + (g + 1) + '</h3><div class="dots">' + dots + '</div>' +
      '<form id="cf"><label class="lab" for="cv">What happens on count ' + (b + 1) + "?</label><input id=\"cv\" maxlength=\"40\" autocomplete=\"off\" placeholder=\"Leave empty to hold the last move\" value=\"" + esc(c.m[b]) + '" autofocus>' +
      '<div class="tabs">' + tabs + '</div><div class="chips">' + chips + '</div>' +
      '<div class="sheet-actions"><button type="button" class="btn ghost" data-s="prev">‹ Beat ' + ((b + 7) % 8 + 1) + '</button><button type="submit" class="btn">' + (b < 7 ? "Next: beat " + (b + 2) + " ›" : "Done") + "</button></div></form>");
    function put(v) { c.m[b] = v.trim().slice(0, 40); App.touch(r); render(); }
    $("#cf", sh).onsubmit = function (e) { e.preventDefault(); put($("#cv", sh).value); if (b < 7) openCell(r, si, ci, b + 1); else closeSheet(); };
    $("[data-s=prev]", sh).onclick = function () { put($("#cv", sh).value); openCell(r, si, ci, (b + 7) % 8); };
    $$(".dot", sh).forEach(function (d) { d.onclick = function () { put($("#cv", sh).value); openCell(r, si, ci, +d.dataset.b); }; });
    $$("[data-cat]", sh).forEach(function (p) { p.onclick = function () { put($("#cv", sh).value); cat = p.dataset.cat; openCell(r, si, ci, b, true); }; });
    $$(".chip", sh).forEach(function (ch) { ch.onclick = function () { put(ch.dataset.m); if (b < 7) openCell(r, si, ci, b + 1); else closeSheet(); }; });
  }

  function openCountMenu(r, si, ci) {
    var s = r.sections[si], c = s.counts[ci], g = gIndex(r, si, ci);
    var sh = openSheet('<h3>8-count ' + (g + 1) + " · " + esc(s.name) + '</h3>' +
      '<label class="lab" for="tw">Type the whole 8-count (separate moves with commas)</label><textarea id="tw" rows="2" placeholder="Clasp, High V, Clasp, Low V, Touchdown, , Daggers, ">' + esc(c.m.join(", ")) + '</textarea>' +
      '<label class="lab" for="tn">Note for this 8-count</label><input id="tn" maxlength="120" placeholder="Formation, who does what…" value="' + esc(c.n) + '">' +
      '<div class="sheet-actions"><button class="btn" data-s="apply">Save</button></div>' +
      '<div class="list"><button data-s="dup">Copy this 8-count below</button><button data-s="up"' + (g === 0 ? " disabled" : "") + '>Move up</button><button data-s="down">Move down</button><button data-s="clear">Clear all 8 moves</button><button class="danger" data-s="del">Delete this 8-count</button></div>');
    function swap(d) {
      var i = ci + d;
      if (i >= 0 && i < s.counts.length) { var t = s.counts[ci]; s.counts[ci] = s.counts[i]; s.counts[i] = t; }
      else {
        var os = si + d; if (os < 0 || os >= r.sections.length) return;
        var item = s.counts.splice(ci, 1)[0]; if (!s.counts.length) s.counts.push(EC.blankCount());
        var to = r.sections[os]; if (d > 0) to.counts.unshift(item); else to.counts.push(item);
      }
      App.touch(r); closeSheet(); render();
    }
    $("[data-s=apply]", sh).onclick = function () {
      var parts = $("#tw", sh).value.split(/\s*[,\n|\/]\s*/);
      if (parts.join("").trim() || parts.length > 1) { for (var i = 0; i < 8; i++) c.m[i] = (parts[i] || "").trim().slice(0, 40); }
      c.n = $("#tn", sh).value.trim().slice(0, 120); App.touch(r); closeSheet(); render();
    };
    $("[data-s=dup]", sh).onclick = function () { s.counts.splice(ci + 1, 0, { m: c.m.slice(), n: c.n }); App.touch(r); closeSheet(); render(); };
    $("[data-s=up]", sh).onclick = function () { swap(-1); };
    $("[data-s=down]", sh).onclick = function () { swap(1); };
    $("[data-s=clear]", sh).onclick = function () { c.m = ["", "", "", "", "", "", "", ""]; App.touch(r); closeSheet(); render(); };
    $("[data-s=del]", sh).onclick = function () {
      if (s.counts.length === 1 && r.sections.length === 1) { c.m = ["", "", "", "", "", "", "", ""]; c.n = ""; } else { s.counts.splice(ci, 1); if (!s.counts.length) r.sections.splice(si, 1); }
      App.touch(r); closeSheet(); render();
    };
  }

  function openSectionMenu(r, si) {
    var s = r.sections[si];
    var sh = openSheet('<h3>Section</h3><form id="sf"><label class="lab" for="sn">Name</label><input id="sn" maxlength="60" value="' + esc(s.name) + '" autofocus><div class="sheet-actions"><button class="btn" type="submit">Save name</button></div></form>' +
      '<div class="list"><button data-s="add4">Add 4 more 8-counts</button><button data-s="up"' + (si === 0 ? " disabled" : "") + '>Move section up</button><button data-s="down"' + (si === r.sections.length - 1 ? " disabled" : "") + '>Move section down</button><button class="danger" data-s="del"' + (r.sections.length === 1 ? " disabled" : "") + '>Delete this section</button></div>');
    $("#sf", sh).onsubmit = function (e) { e.preventDefault(); s.name = $("#sn", sh).value.trim().slice(0, 60) || s.name; App.touch(r); closeSheet(); render(); };
    $("[data-s=add4]", sh).onclick = function () { for (var i = 0; i < 4; i++) s.counts.push(EC.blankCount()); App.touch(r); closeSheet(); render(); };
    $("[data-s=up]", sh).onclick = function () { r.sections.splice(si - 1, 0, r.sections.splice(si, 1)[0]); App.touch(r); closeSheet(); render(); };
    $("[data-s=down]", sh).onclick = function () { r.sections.splice(si + 1, 0, r.sections.splice(si, 1)[0]); App.touch(r); closeSheet(); render(); };
    $("[data-s=del]", sh).onclick = function () {
      confirmSheet("Delete \"" + s.name + "\"?", "Its " + s.counts.length + " eight-count" + (s.counts.length === 1 ? "" : "s") + " will be removed from this routine.", "Delete section", function () { r.sections.splice(si, 1); App.touch(r); render(); });
    };
  }

  function exportRoutine(r) {
    var o = EC.compact(r); o.eightcount = 1;
    download(safeName(r.name) + ".eightcount.json", new Blob([JSON.stringify(o, null, 1)], { type: "application/json" }));
  }
  function openRoutineMenu(r) {
    var sh = openSheet('<h3>' + esc(r.name) + '</h3><div class="list"><button data-s="share">Share a link to this routine</button><button data-s="print">Print the count sheet</button><button data-s="export">Save as a file</button><button data-s="rename">Rename</button><button data-s="dup">Duplicate</button><button class="danger" data-s="del">Delete routine</button></div>' +
      '<p class="hint">A shared link carries the moves and tempo only. Songs and videos stay on your phone.</p>');
    $("[data-s=share]", sh).onclick = function () { shareLink(r); };
    $("[data-s=print]", sh).onclick = function () { backThen(function () { printSheet(r); }); };
    $("[data-s=export]", sh).onclick = function () { exportRoutine(r); closeSheet(); };
    $("[data-s=rename]", sh).onclick = function () { backThen(function () { openRename("Rename routine", r.name, "Routine name", function (v) { if (v) { r.name = v; App.touch(r); render(); } }); }); };
    $("[data-s=dup]", sh).onclick = function () {
      var n = EC.sanitizeRoutine(EC.compact(r)); n.name = (r.name + " copy").slice(0, 60); n.bpm = r.bpm; if (r.music) n.music = { name: r.music.name, offset: r.music.offset, hasFile: false };
      S.routines.push(n); App.save(); backThen(function () { App.toast("Copied. Find the copy on the home screen. It has no song file yet."); });
    };
    $("[data-s=del]", sh).onclick = function () {
      confirmSheet("Delete \"" + r.name + "\"?", "The routine, its song and its recorded takes will be removed from this phone. This can't be undone.", "Delete routine", function () {
        takesFor(r.id).forEach(function (t) { App.DB.del("take:" + t.id).catch(function () {}); });
        S.takes = S.takes.filter(function (t) { return t.rid !== r.id; }); App.saveTakes();
        App.DB.del("music:" + r.id).catch(function () {});
        S.routines = S.routines.filter(function (x) { return x.id !== r.id; }); App.save();
        backThen(function () { cur = null; render(); });
      });
    };
  }

  /* ================= sharing and importing ================= */
  function shareLink(r) {
    EC.encodeRoutine(r).then(function (code) {
      var url = location.origin + location.pathname + "#r=" + code;
      if (navigator.share) {
        navigator.share({ title: r.name, text: "Our routine on Eight Count", url: url }).then(closeSheet, function (err) { if (err && err.name !== "AbortError") copyLink(url); });
      } else copyLink(url);
    }, function () { App.toast("Couldn't make a link"); });
  }
  function copyLink(url) {
    var done = function () { App.toast("Link copied. Paste it in your team chat."); closeSheet(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { App.toast("Couldn't copy. Use Save as a file instead."); });
    else App.toast("Couldn't copy. Use Save as a file instead.");
  }
  function addImported(r) {
    S.routines.push(r); App.save(); cur = null; render(); App.toast("Saved to your routines");
  }
  function previewImport(r) {
    var sh = openSheet('<h3>Add this routine?</h3><div class="card"><div class="rt-name">' + esc(r.name) + '</div><div class="rt-meta">' + counts(EC.totalCounts(r)) + " · " + r.bpm + " BPM" + (r.music ? " · uses a song: " + esc(r.music.name) : "") + '</div></div>' +
      '<p class="hint">It will be saved on this phone only. You can change anything after.</p><div class="sheet-actions"><button class="btn ghost" data-s="no">Not now</button><button class="btn" data-s="yes">Save to my routines</button></div>');
    $("[data-s=no]", sh).onclick = closeSheet;
    $("[data-s=yes]", sh).onclick = function () { backThen(function () { addImported(r); }); };
  }
  function openImport() {
    var sh = openSheet('<h3>Import</h3><p class="hint">Open a routine link from your team chat, or pick a saved routine file.</p>' +
      '<label class="lab" for="il">Paste a link</label><input id="il" placeholder="https://…#r=…" autocomplete="off">' +
      '<div class="sheet-actions"><button class="btn" data-s="link">Open link</button></div>' +
      '<label class="lab">Or choose a file</label><input type="file" id="if" accept=".json,application/json">');
    $("[data-s=link]", sh).onclick = function () {
      var v = $("#il", sh).value, m = v.match(/#r=([\w-]+)/) || v.trim().match(/^([01][\w-]+)$/);
      if (!m) return App.toast("That doesn't look like an Eight Count link");
      EC.decodeRoutine(m[1]).then(function (r) { backThen(function () { previewImport(r); }); }, function () { App.toast("Couldn't open that link"); });
    };
    $("#if", sh).onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (f.size > 2e6) return App.toast("That file is too big to be a routine");
      f.text().then(function (txt) {
        var o = JSON.parse(txt);
        if (o && Array.isArray(o.routines)) { var list = o.routines.map(function (x) { return EC.sanitizeRoutine(x); }).filter(Boolean); if (!list.length) throw 0; backThen(function () { list.forEach(function (r) { S.routines.push(r); }); App.save(); cur = null; render(); App.toast(list.length + " routines restored"); }); }
        else { var r = EC.sanitizeRoutine(o); if (!r) throw 0; backThen(function () { previewImport(r); }); }
      }).catch(function () { App.toast("That file isn't an Eight Count routine"); });
    };
  }

  function printSheet(r) {
    var g = 0, html = "<h1>" + esc(r.name) + "</h1><p>" + r.bpm + " BPM · " + counts(EC.totalCounts(r)) + "</p>";
    r.sections.forEach(function (s) {
      html += "<h2>" + esc(s.name) + "</h2><table><thead><tr><th>Count</th>" + [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return "<th>" + n + "</th>"; }).join("") + "</tr></thead><tbody>";
      s.counts.forEach(function (c) {
        html += "<tr><th>" + (++g) + "</th>" + c.m.map(function (m) { return "<td>" + esc(m) + "</td>"; }).join("") + "</tr>";
        if (c.n) html += '<tr class="note"><td colspan="9">' + esc(c.n) + "</td></tr>";
      });
      html += "</tbody></table>";
    });
    $("#printSheet").innerHTML = html;
    setTimeout(function () { window.print(); }, 50);
  }

  /* ================= settings and help ================= */
  function openSettings() {
    var st = S.settings;
    var sh = openSheet('<h3>Settings</h3>' +
      '<label class="lab" for="trim">Sound delay: <b id="trimv">' + st.trim + ' ms</b></label><input type="range" id="trim" min="-300" max="300" step="10" value="' + st.trim + '">' +
      '<p class="hint">If the number on screen looks early or late next to the sound (Bluetooth speakers do this), slide it until they match.</p>' +
      '<label class="lab" for="vol">Click volume</label><input type="range" id="vol" min="0.1" max="1" step="0.1" value="' + st.volume + '">' +
      '<div class="list tog"><button data-t="flash" aria-pressed="' + st.flash + '">Flash the screen on the beat <i></i></button><button data-t="vibrate" aria-pressed="' + st.vibrate + '">Buzz on every count of 1 <i></i></button><button data-t="subdivide" aria-pressed="' + st.subdivide + '">Soft tick on the “&amp;” between beats <i></i></button></div>' +
      '<label class="lab">Lock in: start on the next mark every</label><div class="seg">' + [10, 20, 30].map(function (n) { return '<button class="pill" data-cy="' + n + '" aria-pressed="' + (st.cycle === n * 1000) + '">' + n + " s</button>"; }).join("") + '</div>' +
      '<div class="list"><button data-s="backup">Back up my routines (file)</button><button data-s="restore">Restore from a backup</button><button data-s="help">How it works</button><button onclick="window.nateHealth&&nateHealth.report()">Something wrong? Send a report</button></div>' +
      '<p class="hint">' + VERSION + ". Everything is saved on this phone only.</p>");
    $("#trim", sh).oninput = function (e) { st.trim = +e.target.value; $("#trimv", sh).textContent = st.trim + " ms"; App.saveSettings(); };
    $("#vol", sh).oninput = function (e) { st.volume = +e.target.value; App.saveSettings(); };
    $$("[data-t]", sh).forEach(function (b) { b.onclick = function () { st[b.dataset.t] = !st[b.dataset.t]; b.setAttribute("aria-pressed", st[b.dataset.t]); App.saveSettings(); }; });
    $$("[data-cy]", sh).forEach(function (b) { b.onclick = function () { st.cycle = +b.dataset.cy * 1000; $$("[data-cy]", sh).forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); App.saveSettings(); }; });
    $("[data-s=backup]", sh).onclick = function () {
      var o = { eightcount: 1, exported: new Date().toISOString(), routines: S.routines.map(EC.compact) };
      download("eight-count-backup.json", new Blob([JSON.stringify(o)], { type: "application/json" })); App.toast("Backup saved. Songs and videos are not in it.");
    };
    $("[data-s=restore]", sh).onclick = function () { backThen(openImport); };
    $("[data-s=help]", sh).onclick = function () { backThen(openHelp); };
  }
  function openHelp() {
    openSheet('<h3>How Eight Count works</h3><ol class="steps">' +
      '<li><b>Write your routine</b> in 8-counts. Tap a box to say what happens on that count. Quick buttons fill in common moves.</li>' +
      '<li><b>Practice</b> shows a big count with the next move coming. Slow it down to 50% to learn it, then bring it up.</li>' +
      '<li><b>Lock in</b> puts every phone on the same clock. Everyone taps Lock in, and the whole team counts off together.</li>' +
      '<li><b>Record</b> films your team with the count on screen. Watch it back and see exactly which count each moment landed on.</li>' +
      '<li><b>Add a song</b>: tap along to find its tempo and where the first 1 lands, and the count follows the music.</li></ol>' +
      '<p class="hint">Routines, songs and videos are saved only on this phone. Use Back up in Settings to keep a copy. ' + VERSION + ".</p>" +
      '<div class="sheet-actions"><button class="btn" data-s="ok">Got it</button></div>').querySelector("[data-s=ok]").onclick = closeSheet;
  }

  /* ================= song setup ================= */
  var songEl = null;
  function openSong(r) {
    var m = r.music;
    function body() {
      return '<h3>Song</h3>' + (m && m.hasFile
        ? '<p><b>' + esc(m.name) + '</b></p><div class="songhud"><div class="sd-big" id="sdBig">–</div><div class="sd-row" id="sdDots">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return "<i>" + n + "</i>"; }).join("") + '</div></div>' +
          '<div class="sheet-actions three"><button class="btn" data-s="play">▶ Play</button><button class="btn ghost" data-s="mark">Mark the 1</button><button class="btn ghost" data-s="tap">Tap tempo</button></div>' +
          '<p class="hint">Play the song. When you hear the first beat of the dance, tap <b>Mark the 1</b>. Tap along to a few beats for the tempo. The numbers above should land on the beats.</p>' +
          '<div class="two"><div><label class="lab" for="sb">Tempo (BPM)</label><input id="sb" type="number" inputmode="numeric" min="40" max="240" value="' + r.bpm + '"></div><div><label class="lab" for="so">First 1 at (seconds)</label><input id="so" type="number" inputmode="decimal" step="0.01" min="0" value="' + (+m.offset).toFixed(2) + '"></div></div>' +
          '<div class="sheet-actions"><button class="btn ghost" data-s="rm">Remove song</button><button class="btn" data-s="done">Done</button></div>'
        : '<p class="hint">' + (m ? 'This routine uses “' + esc(m.name) + '”. Pick that song file from your phone to use it here.' : "Pick a song from your phone. It stays on this phone and is never uploaded.") + '</p><label class="lab">Song file</label><input type="file" id="sf" accept="audio/*"><div class="sheet-actions"><button class="btn ghost" data-s="done">Cancel</button></div>');
    }
    var sh = openSheet(body(), function () { if (songEl) { songEl.pause(); URL.revokeObjectURL(songEl.src); songEl = null; } cancelAnimationFrame(songRaf); render(); });
    wire(sh);
    var songRaf = 0;
    function loop() {
      var el = songEl; if (!el || !m) return;
      var info = EC.beatAt(el.currentTime - m.offset, r.bpm, Infinity), big = $("#sdBig", sh), dots = $$("#sdDots i", sh);
      if (big) big.textContent = info.state === "run" ? info.b + 1 : (info.state === "countoff" ? info.label : "–");
      dots.forEach(function (d, i) { d.classList.toggle("on", info.state === "run" && info.b === i); });
      songRaf = requestAnimationFrame(loop);
    }
    function wire(sh) {
      var f = $("#sf", sh);
      if (f) f.onchange = function (e) {
        var file = e.target.files[0]; if (!file) return;
        if (file.size > 60e6) return App.toast("That file is very large. Try a shorter song.");
        App.DB.put("music:" + r.id, file).then(function () {
          m = r.music = { name: (file.name || "Song").replace(/\.[^.]+$/, "").slice(0, 60), offset: r.music ? r.music.offset : 0, hasFile: true };
          App.touch(r); sh = openSheet(body(), null); wire(sh); App.toast("Song added to this phone");
        }, function () { App.toast("Couldn't save the song on this phone. Storage may be full."); });
      };
      if (!m || !m.hasFile) { var d0 = $("[data-s=done]", sh); if (d0) d0.onclick = closeSheet; return; }
      if (!songEl) {
        songEl = new Audio(); songEl.preload = "auto";
        App.DB.get("music:" + r.id).then(function (blob) { if (blob && songEl) songEl.src = URL.createObjectURL(blob); }, function () {});
      }
      var play = $("[data-s=play]", sh);
      play.onclick = function () {
        if (songEl.paused) { songEl.play().then(function () { play.textContent = "❚❚ Pause"; loop(); }, function () { App.toast("Couldn't play that file"); }); }
        else { songEl.pause(); play.textContent = "▶ Play"; cancelAnimationFrame(songRaf); }
      };
      $("[data-s=mark]", sh).onclick = function () { m.offset = Math.max(0, songEl.currentTime); $("#so", sh).value = m.offset.toFixed(2); App.touch(r); };
      $("[data-s=tap]", sh).onclick = function () { tapTempo(function (v) { r.bpm = v; $("#sb", sh).value = v; App.touch(r); }); };
      $("#sb", sh).onchange = function (e) { r.bpm = EC.clampBpm(e.target.value); e.target.value = r.bpm; App.touch(r); };
      $("#so", sh).onchange = function (e) { m.offset = Math.max(0, +e.target.value || 0); App.touch(r); };
      $("[data-s=done]", sh).onclick = closeSheet;
      $("[data-s=rm]", sh).onclick = function () {
        App.DB.del("music:" + r.id).catch(function () {}); r.music = null; App.touch(r); closeSheet();
      };
    }
  }

  /* ================= PLAYER: practice, lock in, record ================= */
  var P = null;
  function pickRange(R, key) {
    if (!R || key === "all") return { g0: 0, g1: R ? EC.totalCounts(R) - 1 : 0 };
    var si = +key, g0 = 0; for (var i = 0; i < si; i++) g0 += R.sections[i].counts.length;
    return { g0: g0, g1: g0 + R.sections[si].counts.length - 1 };
  }
  function openPlayer(mode, rid) {
    var R = rid ? App.routine(rid) : null;
    if (mode !== "free" && !R) return;
    P = { mode: mode, R: R, rate: 1, rangeKey: "all", loop: false, hide: false, countoff: true, bpm: R ? R.bpm : S.qbpm, flat: R ? EC.flatten(R) : [], running: false, armed: null, lastG: 0, audio: null, stream: null, facing: "environment", rec: null, clockT: 0, lastGrid: -1 };
    var title = mode === "free" ? "Quick count" : mode === "lock" ? "Lock in together" : mode === "record" ? "Record" : "Practice";
    var el = document.createElement("div"); el.className = "player ready " + mode; el.id = "player";
    el.innerHTML =
      '<video class="cam" id="cam" playsinline muted></video>' +
      '<div class="pl-top"><button class="icon" data-p="close" aria-label="Close">✕</button><div class="pl-title">' + esc(title) + (R ? " · " + esc(R.name) : "") + '</div><button class="icon" data-p="hide" aria-label="Hide or show the moves" title="Hide the moves">👁</button></div>' +
      '<div class="pl-main"><div class="pl-pos" id="plPos"></div><div class="pl-big" id="plBig">8</div><div class="pl-small" id="plSmall"></div>' +
      '<div class="pl-move" id="plMove"></div><div class="pl-next" id="plNext"></div><div class="pl-grid" id="plGrid"></div><div class="pl-prog"><i id="plProg"></i></div></div>' +
      '<div class="pl-ready" id="plReady"></div>' +
      '<div class="pl-bar"><button class="icon big" data-p="restart" aria-label="Back to the start">⏮</button><button class="playbtn" data-p="play" aria-label="Start">▶</button><button class="icon big" data-p="loop" aria-pressed="false" aria-label="Loop">🔁</button></div>';
    $("#layer").appendChild(el);
    push(function () { closePlayer(); });
    el.addEventListener("click", onPlayerClick);
    drawReady();
    paintIdle();
    if (mode === "record") startCamera();
    if (mode === "lock") P.clockT = setInterval(updateLockInfo, 100);
    if (R && R.music && R.music.hasFile) {
      P.audio = { el: new Audio(), offset: R.music.offset };
      App.DB.get("music:" + R.id).then(function (b) { if (b && P && P.audio) P.audio.el.src = URL.createObjectURL(b); }, function () {});
    }
  }
  function closePlayer() {
    if (!P) return;
    E.stop("close", true);
    clearInterval(P.clockT);
    if (P.rec && P.rec.state !== "inactive") { P.rec.onstop = null; try { P.rec.stop(); } catch (e) {} }
    if (P.stream) P.stream.getTracks().forEach(function (t) { t.stop(); });
    if (P.audio) { try { P.audio.el.pause(); URL.revokeObjectURL(P.audio.el.src); } catch (e) {} }
    var el = $("#player"); if (el) el.remove();
    P = null;
  }

  function rangeOptions() {
    if (!P.R) return "";
    return '<option value="all">Whole routine</option>' + P.R.sections.map(function (s, i) { return '<option value="' + i + '"' + (P.rangeKey == i ? " selected" : "") + ">" + esc(s.name) + " only</option>"; }).join("");
  }
  function drawReady() {
    var m = P.mode, h = "";
    if (m === "free") {
      h += '<div class="bpmrow"><button class="round" data-p="bpm-" aria-label="Slower">−</button><div class="bpmval"><b id="pbpm">' + P.bpm + '</b><span>BPM</span></div><button class="round" data-p="bpm+" aria-label="Faster">+</button><button class="pill" data-p="tap">Tap tempo</button></div>';
    } else {
      h += '<div class="rrow"><label for="prange">Play</label><select id="prange">' + rangeOptions() + '</select></div>';
      h += '<div class="rrow"><label>Speed</label><div class="seg">' + [50, 75, 90, 100].map(function (n) { return '<button class="pill" data-rate="' + n + '" aria-pressed="' + (Math.round(P.rate * 100) === n) + '">' + n + "%</button>"; }).join("") + "</div></div>";
      h += '<p class="hint" id="pinfo"></p>';
    }
    if (m === "lock") {
      h += '<div class="lock"><div class="clock" id="lkClock">–</div><p class="hint">Every phone shows the same time. Tap <b>Lock in</b> on every phone. They all count off together at the next mark.</p>' +
        '<button class="cta" data-p="arm">Lock in at the next mark</button><div class="lkinfo" id="lkInfo"></div>' +
        '<details><summary>Pick an exact time instead</summary><div class="rrow"><input type="time" step="1" id="lkAt" aria-label="Start time"><button class="btn small" data-p="armat">Lock in at this time</button></div></details></div>';
    } else if (m === "record") {
      h += '<div class="rrow"><button class="pill" data-p="flip">Flip camera</button><span class="hint" id="camst">Starting camera…</span></div><button class="cta rec" data-p="startrec" id="recbtn" disabled>● Record</button>';
    } else {
      h += '<button class="cta" data-p="start">▶ Start' + (m === "free" ? " counting" : "") + "</button>";
    }
    if (P.audio || (P.R && P.R.music && P.R.music.hasFile)) h += '<p class="hint">🎵 The song plays with the count.</p>';
    else if (P.R && P.R.music) h += '<p class="hint">This routine uses a song you haven’t added on this phone yet. The click will play instead.</p>';
    $("#plReady").innerHTML = h;
    var info = $("#pinfo");
    if (info && P.R) { var rg = pickRange(P.R, P.rangeKey); info.textContent = counts(rg.g1 - rg.g0 + 1) + " · about " + Math.round((rg.g1 - rg.g0 + 1) * 8 * 60 / (P.bpm * P.rate)) + " seconds at " + Math.round(P.bpm * P.rate) + " BPM"; }
    var sel = $("#prange"); if (sel) sel.onchange = function () { P.rangeKey = sel.value; drawReady(); };
  }

  function paintIdle() {
    $("#plBig").textContent = P.mode === "free" ? "8" : "1"; $("#plBig").className = "pl-big idle";
    $("#plSmall").textContent = ""; $("#plMove").textContent = ""; $("#plNext").textContent = "";
    $("#plPos").textContent = P.R ? counts(EC.totalCounts(P.R)) : "Counting 1 to 8";
    $("#plGrid").innerHTML = ""; $("#plProg").style.width = "0";
  }

  function onPlayerClick(e) {
    var t = e.target.closest("[data-p],[data-rate]"); if (!t) return;
    if (t.dataset.rate) { P.rate = t.dataset.rate / 100; drawReady(); return; }
    switch (t.dataset.p) {
      case "close": back(); break;
      case "hide": P.hide = !P.hide; $("#player").classList.toggle("hide-moves", P.hide); break;
      case "bpm-": P.bpm = EC.clampBpm(P.bpm - 1); S.qbpm = P.bpm; App.LS.set("qbpm", P.bpm); $("#pbpm").textContent = P.bpm; break;
      case "bpm+": P.bpm = EC.clampBpm(P.bpm + 1); S.qbpm = P.bpm; App.LS.set("qbpm", P.bpm); $("#pbpm").textContent = P.bpm; break;
      case "tap": tapTempo(function (v) { P.bpm = v; S.qbpm = v; App.LS.set("qbpm", v); $("#pbpm").textContent = v; }); break;
      case "loop": P.loop = !P.loop; t.setAttribute("aria-pressed", P.loop); App.toast(P.loop ? "Looping: it will start over by itself" : "Loop off", 1400); break;
      case "restart": P.lastG = 0; if (E.running()) stopRun("pause"); P.resume = null; $("#player").classList.add("ready"); paintIdle(); App.toast("Back at the start", 1200); break;
      case "start": case "play": togglePlay(); break;
      case "arm": arm(false); break;
      case "armat": arm(true); break;
      case "flip": P.facing = P.facing === "user" ? "environment" : "user"; startCamera(); break;
      case "startrec": startRecording(); break;
    }
  }

  function startCfg(extra) {
    var rg = pickRange(P.R, P.rangeKey), base = rg.g0, n = P.R ? rg.g1 - rg.g0 + 1 : Infinity;
    if (P.resume != null && P.R && P.resume >= rg.g0 && P.resume <= rg.g1) { base = P.resume; n = rg.g1 - base + 1; }
    P.lastRange = rg; P.base = base; P.lastGrid = -1;
    var cfg = {
      bpm: P.bpm, rate: P.rate, n: n, base: base, countoff: P.countoff, click: !(P.audio && P.audio.el.src), sub: S.settings.subdivide,
      audio: P.audio && P.audio.el.src ? P.audio : null, domain: "perf",
      onFrame: paint, onEnd: onEnd
    };
    return Object.assign(cfg, extra || {});
  }
  function primeSong() {
    if (P.audio && P.audio.el.src) { var a = P.audio.el; a.muted = true; var pr = a.play(); if (pr && pr.then) pr.then(function () { a.pause(); a.muted = false; }, function () { a.muted = false; }); }
  }
  function togglePlay() {
    if (E.running()) { stopRun("pause"); return; }
    if (P.starting) return;
    P.starting = true;
    var u = App.unlock();
    primeSong();
    P.running = true; $("#player").classList.remove("ready"); $("#player").classList.add("run"); setPlayIcon(true);
    u.then(function () { P.starting = false; if (P && P.running && !E.running()) E.start(startCfg()); });
  }
  function setPlayIcon(on) { var b = $("[data-p=play]"); if (b) { b.textContent = on ? "❚❚" : "▶"; b.setAttribute("aria-label", on ? "Pause" : "Play"); } }
  function stopRun(reason) {
    E.stop(reason);
  }
  function onEnd(reason) {
    if (!P) return;
    P.running = false; setPlayIcon(false);
    if (reason === "end") {
      if (P.mode === "record") return finishRecording();
      if (P.loop && P.mode !== "lock") { P.resume = null; setTimeout(function () { if (P && !E.running()) togglePlay(); }, 60); return; }
      P.resume = null; App.toast("Done. Nice work!", 1800);
      $("#player").classList.remove("run"); $("#player").classList.add("ready"); paintIdle(); return;
    }
    if (reason === "pause") {
      P.resume = P.lastG; P.armed = null; $("#player").classList.remove("run"); $("#player").classList.add("ready");
      var s = $("#plReady .cta"); if (s) s.textContent = P.mode === "free" ? "▶ Start counting" : "▶ Start again from this 8-count";
      if (P.mode === "record" && P.rec && P.rec.state === "recording") { try { P.rec.stop(); } catch (e) {} }
    }
  }

  /* what the count looks like on screen, one frame */
  function paint(info) {
    if (!P) return;
    var big = $("#plBig"), small = $("#plSmall"), pl = $("#player"), s = S.settings;
    if (info.state === "pre") {
      big.className = "pl-big pre";
      if (P.armed) { big.textContent = info.until > 0.05 ? Math.ceil(info.until) : "…"; small.textContent = "Locked in. Counting off at " + EC.fmtClock(P.armed.markMs, true); }
      else { big.textContent = "…"; small.textContent = "Get ready"; }
      $("#plMove").textContent = ""; $("#plNext").textContent = ""; return;
    }
    if (info.state === "countoff") {
      big.className = "pl-big co"; big.textContent = info.label; small.textContent = "Get ready"; $("#plMove").textContent = ""; $("#plNext").textContent = "";
      var f = P.R ? P.flat[P.base || 0] : null;
      if (f) $("#plPos").textContent = f.secName + " · 8-count " + (f.g + 1) + " of " + P.flat.length;
      pulse(info.label === 8 || info.label === 5 ? "a" : "b"); return;
    }
    if (info.state !== "run") return;
    var f = P.flat[info.g]; P.lastG = info.g;
    big.className = "pl-big run b" + (info.b % 4) + (info.b === 0 ? " one" : ""); big.textContent = info.b + 1;
    small.textContent = info.sub ? "&" : "";
    if (f) {
      if (P.lastGrid !== info.g) {
        P.lastGrid = info.g;
        $("#plGrid").innerHTML = f.m.map(function (m, i) { return '<div class="pc" data-b="' + i + '"><i>' + (i + 1) + "</i><span>" + (esc(m) || "·") + "</span></div>"; }).join("");
        $("#plPos").textContent = f.secName + " · 8-count " + (f.g + 1) + " of " + P.flat.length + (f.n ? "  ·  " + f.n : "");
      }
      $$("#plGrid .pc").forEach(function (c, i) { c.classList.toggle("on", i === info.b); c.classList.toggle("past", i < info.b); });
      var now = f.m[info.b], shown = now, i;
      if (!now) { for (i = info.b - 1; i >= 0 && !f.m[i]; i--); shown = i >= 0 ? f.m[i] : ""; }
      $("#plMove").textContent = shown || ""; $("#plMove").classList.toggle("holding", !now && !!shown);
      var nx = "", dist = 0, gg = info.g, bb = info.b;
      for (var k = 1; k <= 8; k++) {
        bb++; if (bb > 7) { bb = 0; gg++; }
        var ff = P.flat[gg]; if (!ff) break;
        if (ff.m[bb]) { nx = ff.m[bb]; dist = k; break; }
      }
      $("#plNext").textContent = nx ? "Next: " + nx + (dist > 1 ? "  ·  in " + dist : "") : "";
    }
    $("#plProg").style.width = Math.min(100, (info.rel / info.total) * 100) + "%";
    if (info.sub === 0) pulse(info.b === 0 ? "a" : "b");
    if (info.sub === 0 && info.b === 0 && s.vibrate && navigator.vibrate) { try { navigator.vibrate(25); } catch (e) {} }
    if (P.mode === "free") { $("#plPos").textContent = "Quick count · " + P.bpm + " BPM"; }
  }
  var lastPulse = 0;
  function pulse(kind) {
    if (!S.settings.flash) return;
    var el = $("#player"); if (!el) return;
    el.classList.remove("fa", "fb"); void el.offsetWidth; el.classList.add(kind === "a" ? "fa" : "fb");
  }

  /* ---- Lock in together ---- */
  function updateLockInfo() {
    var c = $("#lkClock"); if (!c) return;
    var now = Date.now(); c.textContent = EC.fmtClock(now, true);
    var inf = $("#lkInfo"); if (!inf || P.armed) return;
    var mk = EC.nextMark(now, S.settings.cycle, 2500);
    inf.textContent = "Next mark: " + EC.fmtClock(mk, false) + " · in " + ((mk - now) / 1000).toFixed(1) + " s";
  }
  function arm(exact) {
    if (E.running() || P.starting) return;
    var u = App.unlock();
    primeSong();
    var now = Date.now(), mk;
    if (exact) {
      var v = ($("#lkAt") || {}).value; if (!v) return App.toast("Pick a start time first");
      var p = v.split(":").map(Number); mk = EC.nextClock(now, p[0], p[1] || 0, p[2] || 0);
      if (mk - now < 2500) return App.toast("Pick a time at least 3 seconds from now");
      if (mk - now > 3600e3) return App.toast("That's more than an hour away. Check the time.");
    } else mk = EC.nextMark(now, S.settings.cycle, 2500);
    P.armed = { markMs: mk }; P.resume = null; P.starting = true;
    var rate = P.rate, startMs = mk + EC.countoffMs(P.bpm, rate);
    P.running = true; P.countoff = true; $("#player").classList.remove("ready"); $("#player").classList.add("run"); setPlayIcon(true);
    u.then(function () { P.starting = false; if (P && P.running && !E.running()) E.start(startCfg({ domain: "wall", startMs: startMs, countoff: true })); });
  }

  /* ---- Record ---- */
  function startCamera() {
    if (!P) return;
    var st = $("#camst"), vid = $("#cam");
    if (P.stream) P.stream.getTracks().forEach(function (t) { t.stop(); });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { if (st) st.textContent = "This phone's browser can't record video."; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: P.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }).then(function (stream) {
      if (!P) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      P.stream = stream; vid.srcObject = stream; vid.muted = true; vid.play().catch(function () {});
      $("#player").classList.add("camon"); if (st) st.textContent = "Camera ready"; var b = $("#recbtn"); if (b) b.disabled = false;
    }, function () { if (st) st.textContent = "Camera or microphone blocked. Allow them in your browser settings."; App.toast("Couldn't start the camera"); });
  }
  function pickMime() {
    var c = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
    return "";
  }
  function startRecording() {
    if (!P || !P.stream || E.running() || P.starting) return;
    P.starting = true;
    App.unlock().then(function () { P.starting = false; beginRecording(); });
  }
  function beginRecording() {
    if (!P || !P.stream) return;
    var mime = pickMime(), rec;
    try { rec = new MediaRecorder(P.stream, mime ? { mimeType: mime } : undefined); } catch (e) { return App.toast("This phone can't record in this browser"); }
    var chunks = [], recStart = null;
    P.rec = rec; P.chunks = chunks;
    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstart = function () { recStart = performance.now(); };
    rec.onstop = function () { finishTake(chunks, rec.mimeType || mime || "video/webm", P ? P.t0 : 0); };
    rec.start(1000);
    P.running = true; $("#player").classList.remove("ready"); $("#player").classList.add("run"); setPlayIcon(true);
    var waited = 0;
    (function go() {
      if (!P || !P.rec) return;
      if (recStart == null && waited < 600) { waited += 20; return setTimeout(go, 20); }
      var sm = E.start(startCfg({ countoff: true }));
      P.t0 = sm - (recStart == null ? performance.now() : recStart);
    })();
  }
  function finishRecording() {
    var rec = P && P.rec; if (!rec) return;
    setTimeout(function () { if (rec.state !== "inactive") rec.stop(); }, 900);
  }
  function finishTake(chunks, mime, t0) {
    if (!P || !chunks.length) return;
    var blob = new Blob(chunks, { type: mime }), id = EC.uid(), R = P.R, dur = null;
    var take = { id: id, rid: R.id, created: Date.now(), mime: mime, t0: t0, nudge: 0, bpm: P.bpm, rate: P.rate, base: P.lastRange ? P.lastRange.g0 : 0, n: P.lastRange ? P.lastRange.g1 - P.lastRange.g0 + 1 : 1, size: blob.size, dur: dur, snap: EC.compact(R) };
    App.DB.put("take:" + id, blob).then(function () {
      S.takes.push(take); App.saveTakes();
      var swap = function () { backThen(function () { render(); openReview(id); }); };
      swap();
    }, function () { App.toast("Couldn't save the video on this phone. Storage may be full."); });
  }

  /* ================= REVIEW: watch a take with the count on top ================= */
  function openReview(id) {
    var take = S.takes.filter(function (t) { return t.id === id; })[0]; if (!take) return;
    App.DB.get("take:" + id).then(function (blob) {
      if (!blob) return App.toast("That video is no longer on this phone");
      var url = URL.createObjectURL(blob), raf = 0;
      var r = EC.sanitizeRoutine(take.snap) || { sections: [] }, flat = EC.flatten(r);
      var el = document.createElement("div"); el.className = "player review"; el.id = "review";
      el.innerHTML = '<div class="pl-top"><button class="icon" data-r="close" aria-label="Close">✕</button><div class="pl-title">' + new Date(take.created).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + '</div><button class="icon" data-r="menu" aria-label="Options">⋯</button></div>' +
        '<video id="rv" src="' + url + '" playsinline controls></video>' +
        '<div class="rv-hud"><div class="rv-big" id="rvBig">–</div><div class="rv-move" id="rvMove"></div><div class="rv-pos" id="rvPos"></div></div>' +
        '<div class="rv-nudge"><span>Count looks early or late?</span><button class="btn small ghost" data-r="early">◀ 50 ms</button><b id="rvN">' + take.nudge + ' ms</b><button class="btn small ghost" data-r="late">50 ms ▶</button></div>';
      $("#layer").appendChild(el);
      push(function () { cancelAnimationFrame(raf); URL.revokeObjectURL(url); el.remove(); });
      var v = $("#rv", el);
      function tick() {
        raf = requestAnimationFrame(tick);
        var p = (v.currentTime - take.t0 / 1000 + take.nudge / 1000) * take.rate, rel = EC.beatAt(p, take.bpm, take.n), big = $("#rvBig", el);
        if (rel.state === "countoff") { big.textContent = rel.label; $("#rvMove", el).textContent = "get ready"; $("#rvPos", el).textContent = ""; }
        else if (rel.state === "run") {
          var gb = rel.bi + take.base * 8, g = Math.floor(gb / 8), b = gb % 8, f = flat[g];
          big.textContent = b + 1; $("#rvMove", el).textContent = f && f.m[b] ? f.m[b] : "";
          $("#rvPos", el).textContent = f ? f.secName + " · 8-count " + (g + 1) : "";
        } else { big.textContent = "–"; $("#rvMove", el).textContent = ""; $("#rvPos", el).textContent = ""; }
      }
      tick();
      el.addEventListener("click", function (e) {
        var t = e.target.closest("[data-r]"); if (!t) return;
        if (t.dataset.r === "close") back();
        else if (t.dataset.r === "early" || t.dataset.r === "late") { take.nudge += t.dataset.r === "early" ? -50 : 50; $("#rvN", el).textContent = take.nudge + " ms"; App.saveTakes(); }
        else if (t.dataset.r === "menu") {
          openSheet('<h3>This take</h3><div class="list"><button data-s="share">Share the video</button><button data-s="save">Save to my phone</button><button class="danger" data-s="del">Delete this take</button></div>' +
            '<p class="hint">The count is shown on top while you watch here. The shared video file is the plain video.</p>');
          var ext = /mp4/.test(take.mime) ? "mp4" : "webm", file = function () { return new File([blob], "eight-count-take." + ext, { type: take.mime }); };
          $("[data-s=share]").onclick = function () {
            var f = file();
            if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: "Eight Count take" }).then(closeSheet, function () {});
            else { download(f.name, blob); App.toast("Saved. Share it from your files."); }
          };
          $("[data-s=save]").onclick = function () { download("eight-count-take." + ext, blob); closeSheet(); };
          $("[data-s=del]").onclick = function () {
            confirmSheet("Delete this take?", "The video will be removed from this phone. This can't be undone.", "Delete take", function () {
              App.DB.del("take:" + id).catch(function () {}); S.takes = S.takes.filter(function (x) { return x.id !== id; }); App.saveTakes();
              back(); setTimeout(render, 60);
            });
          };
        }
      });
    }, function () { App.toast("Couldn't open that video"); });
  }

  /* ================= start ================= */
  function init() {
    main = $("#main");
    App.load();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    render();
    var m = location.hash.match(/^#r=([\w-]+)/);
    if (m) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      EC.decodeRoutine(m[1]).then(function (r) { previewImport(r); }, function () { App.toast("That link couldn't be opened"); });
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
    window.__ec = { S: S, App: App, render: render };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
