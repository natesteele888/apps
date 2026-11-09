/* Play Board: the app. Everything stays on this phone. No accounts, no analytics.
   Saved data lives in localStorage under the "playboard." prefix. */
(function () {
"use strict";

var E = window.PBE;
var VERSION = "Play Board v1";
var KEY = "playboard.";
var SPORTS = E.SPORTS, VARIANTS = E.VARIANTS, PAL = E.PALS.dark;
var clamp = E.clamp, rnd = E.rnd, esc = E.esc, dims = E.dims, tokR = E.tokR;

/* ============================================================ helpers */
function $(s, r) { return (r || document).querySelector(s); }
function h(tag, attrs) {
  var el = document.createElement(tag), k, v;
  attrs = attrs || {};
  for (k in attrs) {
    v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (var i = 2; i < arguments.length; i++) {
    var c = arguments[i];
    if (c == null || c === false) continue;
    if (Array.isArray(c)) c.forEach(function (x) { if (x != null && x !== false) el.append(x.nodeType ? x : document.createTextNode(x)); });
    else el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}
function add(parent) {
  for (var i = 1; i < arguments.length; i++) { var c = arguments[i]; if (c != null && c !== false) parent.append(c); }
  return parent;
}
var ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  share: '<circle cx="6" cy="12" r="2.6"/><circle cx="17.5" cy="6" r="2.6"/><circle cx="17.5" cy="18" r="2.6"/><path d="M8.3 10.8l7-3.6M8.3 13.2l7 3.6"/>',
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  restart: '<path d="M4 5v5h5"/><path d="M4.6 10A8 8 0 1 1 6 17.2"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l.9 12.5h9.2L17.5 7M10 11v5.5M14 11v5.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  edit: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="M4 17l5-4.5 3 2.5 3-3.5 5 5"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.4"/>',
  library: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  t_move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  t_run: '<path d="M4 19C10 19 11 8 19 6"/><path d="M19 6l-5 0M19 6l-2 4.5" />',
  t_pass: '<path d="M4 19L19 6" stroke-dasharray="3 3.5"/><path d="M19 6h-5.5M19 6l-1.5 5.5"/>',
  t_drib: '<path d="M3 15l3-5 3 5 3-5 3 5 3-5 3 5"/>',
  t_scr: '<path d="M4 12h12"/><path d="M17 5v14"/>'
};
function icoS(name, cls) { return '<svg class="i ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + "</svg>"; }

function lsGet(k, d) { try { var v = localStorage.getItem(KEY + k); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(KEY + k, v); return true; } catch (e) { return false; } }

function toast(msg, o) {
  o = o || {};
  var box = $("#toasts");
  var el = h("div", { class: "toast" + (o.err ? " err" : ""), role: o.err ? "alert" : "status" }, h("span", {}, msg));
  if (o.action) el.append(h("button", { onclick: function () { o.action.fn(); el.remove(); } }, o.action.label));
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(function () { el.remove(); }, o.ms || (o.action ? 6500 : o.err ? 5000 : 3000));
}
var lastSaveWarn = 0;
function warnSave() {
  var now = Date.now();
  if (now - lastSaveWarn < 4000) return;
  lastSaveWarn = now;
  toast("Couldn't save on this phone", { err: true });
}

function fmtAgo(ts) {
  var s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch (e) { return ""; }
}
function variantLabel(p) {
  var v = VARIANTS[p.sport];
  if (v.length < 2) return "";
  for (var i = 0; i < v.length; i++) if (v[i][0] === p.variant) return v[i][1];
  return "";
}
function subtitle(p) { var v = variantLabel(p); return SPORTS[p.sport].name + (v ? " · " + v : ""); }

/* ============================================================ state */
var S = {
  plays: [], cur: null, view: "lib", filter: "all",
  readOnly: false, shared: false,
  step: 0, mode: "edit", u: 0, playing: false, speed: 1,
  tool: "move", sel: null, plot: null,
  hist: [], fut: [], histKey: null, histT: 0,
  ver: 0, tl: null, tlV: -1, tlP: null,
  drawnStep: -1, courtKey: "", tokEls: {}, ballEl: null, raf: 0, last: 0
};
var svg, wrap, lyr = {};
var G = null; // the gesture in progress on the board

function getTL() {
  if (S.tlV !== S.ver || S.tlP !== S.cur) { S.tl = E.buildTL(S.cur); S.tlV = S.ver; S.tlP = S.cur; }
  return S.tl;
}
function tokOf(id) { for (var i = 0; i < S.cur.tokens.length; i++) if (S.cur.tokens[i].id === id) return S.cur.tokens[i]; return null; }
function nSteps() { return S.cur.steps.length; }

/* ============================================================ saving */
var saveTimer = 0;
function savePlays() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!lsSet("plays", JSON.stringify(S.plays))) warnSave();
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(savePlays, 300); }
function touch() { S.cur.updated = Date.now(); S.ver++; saveSoon(); }
function loadPlays() {
  var out = [];
  try {
    var raw = JSON.parse(lsGet("plays", "[]"));
    if (Array.isArray(raw)) raw.forEach(function (r) { var p = E.cleanPlay(r); if (p) out.push(p); });
  } catch (e) {}
  return out;
}

/* ============================================================ undo / redo */
function pushHist(key) {
  if (S.readOnly) return;
  var now = Date.now();
  if (key && key === S.histKey && now - S.histT < 1500) { S.histT = now; return; }
  S.hist.push(JSON.stringify(S.cur));
  if (S.hist.length > 80) S.hist.shift();
  S.fut = []; S.histKey = key || null; S.histT = now;
  if (S.view === "board") renderActions();
}
function applySnap(json) {
  var o = E.cleanPlay(JSON.parse(json));
  if (!o) return;
  o.id = S.cur.id; o.updated = Date.now();
  var i = S.plays.indexOf(S.cur);
  if (i >= 0) S.plays[i] = o;
  S.cur = o; S.ver++; S.histKey = null;
  S.step = clamp(S.step, 0, o.steps.length - 1);
  if (S.sel && !tokOf(S.sel)) S.sel = null;
  S.plot = null;
  S.mode = "edit";
  saveSoon(); renderBoardAll();
}
function undo() {
  if (S.readOnly || !S.hist.length) return;
  stopPlay();
  S.fut.push(JSON.stringify(S.cur));
  applySnap(S.hist.pop());
}
function redo() {
  if (S.readOnly || !S.fut.length) return;
  stopPlay();
  S.hist.push(JSON.stringify(S.cur));
  applySnap(S.fut.pop());
}

/* ============================================================ board drawing */
function ensureBoard() {
  var p = S.cur, key = p.sport + ":" + p.variant;
  if (S.courtKey === key) return;
  var d = dims(p);
  svg.setAttribute("viewBox", "0 0 " + d.w + " " + d.h);
  svg.setAttribute("aria-label", SPORTS[p.sport].name + " diagram");
  wrap.style.setProperty("--ar", (d.w / d.h).toFixed(4));
  svg.innerHTML = '<g id="lyrCourt">' + E.courtSVG(p, PAL, "bd") + '</g><g id="lyrPaths"></g><g id="lyrTokens"></g><g id="lyrBall"></g><g id="lyrDraft" pointer-events="none"></g>';
  lyr = { paths: $("#lyrPaths"), tokens: $("#lyrTokens"), ball: $("#lyrBall"), draft: $("#lyrDraft") };
  S.courtKey = key; S.tokEls = {}; S.ballEl = null;
}
function renderLayers() {
  var p = S.cur, tl = getTL(), r = tokR(p), watch = S.mode === "watch", pos, ball, si;
  if (S.sel && !tokOf(S.sel)) S.sel = null;
  if (watch) {
    var f = E.frameAt(p, tl, S.u); si = f.step; pos = f.pos; ball = f.ball; S.drawnStep = si; S.step = si;
  } else {
    si = clamp(S.step, 0, p.steps.length - 1); pos = tl.steps[si].start; ball = E.ballAt(p, tl.steps[si].holder0, pos); S.drawnStep = -1;
  }
  lyr.paths.innerHTML = E.pathsMarkup(p, tl, [si], PAL, r, { faint: watch });
  lyr.tokens.innerHTML = p.tokens.map(function (t) {
    var q = pos[t.id];
    return E.tokenG(t, q[0], q[1], { r: r, pal: PAL, sel: !watch && !S.readOnly && S.sel === t.id });
  }).join("");
  S.tokEls = {};
  lyr.tokens.querySelectorAll(".tok").forEach(function (g) { S.tokEls[g.getAttribute("data-id")] = g; });
  lyr.ball.innerHTML = ball ? E.ballG(ball[0], ball[1], r, PAL) : "";
  S.ballEl = lyr.ball.firstChild;
  lyr.draft.innerHTML = "";
}
function setT(el, x, y) { if (el) el.setAttribute("transform", "translate(" + E.f1(x) + " " + E.f1(y) + ")"); }
// While dragging or playing: move things without rebuilding them.
function renderFrame() {
  var p = S.cur, tl = getTL(), f = E.frameAt(p, tl, S.u);
  if (f.step !== S.drawnStep || !S.ballEl && f.ball) {
    S.step = f.step; renderLayers(); renderChips(); renderNote();
  } else {
    p.tokens.forEach(function (t) { var q = f.pos[t.id]; if (q) setT(S.tokEls[t.id], q[0], q[1]); });
    if (f.ball && S.ballEl) setT(S.ballEl, f.ball[0], f.ball[1]);
  }
  renderPlayerBits();
}
function refreshEdit() {
  var p = S.cur, tl = getTL(), r = tokR(p), si = S.step, st = tl.steps[si];
  lyr.paths.innerHTML = E.pathsMarkup(p, tl, [si], PAL, r, {});
  p.tokens.forEach(function (t) { var q = st.start[t.id]; setT(S.tokEls[t.id], q[0], q[1]); });
  var b = E.ballAt(p, st.holder0, st.start);
  if (b && S.ballEl) setT(S.ballEl, b[0], b[1]);
}

/* ============================================================ pointer handling on the board */
function toUnits(e) {
  var m = svg.getScreenCTM();
  if (!m) return [0, 0];
  var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  var q = pt.matrixTransform(m.inverse());
  return [q.x, q.y];
}
function ppu() { return svg.getBoundingClientRect().width / dims(S.cur).w; }
function curPos() { return getTL().steps[S.step].start; }
function tokenAt(p, any) {
  var r = tokR(S.cur), k = ppu() || 1, hitR = Math.max(r + 6 / k, 22 / k), best = null, bd = 1e9, pos = curPos(), st = getTL().steps[S.step];
  S.cur.tokens.forEach(function (t) {
    var q = pos[t.id], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= hitR && d < bd) { best = { id: t.id, at: q }; bd = d; }
    if (any && st.routes[t.id]) { // a moving player can also be picked at the end of its move
      var e2 = st.end[t.id], d2 = Math.hypot(e2[0] - p[0], e2[1] - p[1]);
      if (d2 <= hitR && d2 < bd) { best = { id: t.id, at: e2 }; bd = d2; }
    }
  });
  return best;
}
function select(id) {
  S.sel = id;
  renderLayers(); renderCtx();
  var t = id && tokOf(id);
  $("#liveSel").textContent = t ? "Selected " + (t.label || "player") + ", " + (t.team === "d" ? "defense" : "offense") : "";
}

function onDown(e) {
  if (S.mode !== "edit" || S.readOnly || G) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  var p = toUnits(e), hit = tokenAt(p, !!(S.plot && S.plot.kind === "pass") || S.tool === "pass");
  G = { pid: e.pointerId, cx: e.clientX, cy: e.clientY, p0: p, moved: false, id: hit ? hit.id : null, type: "tap", pts: [p], cur: p };
  var tl = getTL();
  if (!S.plot && hit) {
    if (S.tool === "move") {
      G.type = "drag"; G.off = [hit.at[0] - p[0], hit.at[1] - p[1]];
      if (S.sel !== hit.id) select(hit.id);
    } else if (S.tool === "pass") {
      if (tl.steps[S.step].holder0 !== hit.id) {
        G.type = "none";
        toast(tl.steps[S.step].holder0 ? "Only the player with the ball can pass. Pick that player." : "No one has the ball yet. Select a player, then tap Ball at start.");
      } else { G.type = "draw"; G.kind = "pass"; if (S.sel !== hit.id) select(hit.id); }
    } else {
      G.type = "draw"; G.kind = S.tool; if (S.sel !== hit.id) select(hit.id);
    }
  }
  try { svg.setPointerCapture(e.pointerId); } catch (err) {}
  try { wrap.focus({ preventScroll: true }); } catch (err) {}
  e.preventDefault();
}
function onMove(e) {
  if (!G || e.pointerId !== G.pid) return;
  if (!G.moved) {
    if (Math.hypot(e.clientX - G.cx, e.clientY - G.cy) < 6) return;
    G.moved = true;
    if (G.type === "drag") { pushHist(null); }
  }
  var p = toUnits(e);
  G.cur = p;
  if (G.type === "drag") {
    var x = p[0] + G.off[0], y = p[1] + G.off[1];
    if (placeAt(G.id, x, y)) {
      refreshEdit();
      if (S.step > 0) { var q = pendingEnd(G.id); lyr.draft.innerHTML = '<g opacity=".55">' + E.tokenG(tokOf(G.id), q[0], q[1], { r: tokR(S.cur), pal: PAL, sel: false }) + "</g>"; }
    }
  } else if (G.type === "draw") {
    var last = G.pts[G.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 2.5) G.pts.push(p);
    renderDraft();
  }
  e.preventDefault();
}
function pendingEnd(id) { var e = getTL().steps[S.step].end[id]; return e; }
function onUp(e) {
  if (!G || e.pointerId !== G.pid) return;
  var g = G; G = null;
  try { svg.releasePointerCapture(e.pointerId); } catch (err) {}
  lyr.draft.innerHTML = "";
  var p = toUnits(e);
  if (g.type === "drag") {
    if (g.moved) {
      if (S.step > 0) { // a tiny drag shouldn't leave a stub arrow behind
        var mv = S.cur.steps[S.step].m[g.id], st0 = getTL().steps[S.step].start[g.id];
        if (mv && mv.k !== "pass" && mv.p && mv.p.length === 1 && Math.hypot(mv.p[0][0] - st0[0], mv.p[0][1] - st0[1]) < tokR(S.cur) * 0.5) delete S.cur.steps[S.step].m[g.id];
      }
      touch(); renderLayers(); renderCtx(); renderActions();
    }
  } else if (g.type === "draw") {
    if (g.moved) finishDraw(g, p);
    else startPlot(g.id, g.kind);
  } else if (g.type === "tap" && !g.moved) {
    if (S.plot) plotTap(p, g.id);
    else if (S.sel) { S.sel = null; renderLayers(); renderCtx(); }
  }
}
function onCancel(e) {
  if (!G || e.pointerId !== G.pid) return;
  var g = G; G = null;
  lyr.draft.innerHTML = "";
  if (g.type === "drag" && g.moved) { touch(); renderLayers(); }
}

// Move a player (first step) or the end of their move (later steps). Returns true if anything changed.
function placeAt(id, x, y) {
  var p = S.cur, r = tokR(p), d = dims(p), tok = tokOf(id), st = p.steps[S.step];
  x = rnd(clamp(x, r * 0.8, d.w - r * 0.8)); y = rnd(clamp(y, r * 0.8, d.h - r * 0.8));
  if (S.step === 0) {
    var dx = x - tok.x, dy = y - tok.y;
    if (!dx && !dy) return false;
    tok.x = x; tok.y = y;
    var mv = st.m[id];
    if (mv && mv.p) mv.p = mv.p.map(function (q) { return [rnd(clamp(q[0] + dx, 4, d.w - 4)), rnd(clamp(q[1] + dy, 4, d.h - 4))]; });
  } else {
    var m2 = st.m[id];
    if (m2 && m2.k !== "pass" && m2.p && m2.p.length) {
      var last = m2.p[m2.p.length - 1];
      if (last[0] === x && last[1] === y) return false;
      m2.p[m2.p.length - 1] = [x, y];
    } else st.m[id] = { k: "run", p: [[x, y]], s: 0 };
  }
  S.ver++;
  return true;
}
function renderDraft() {
  var g = G, r = tokR(S.cur), sw = Math.max(3.4, r * 0.17), start = curPos()[g.id], html = "";
  if (g.kind === "pass") {
    var hit = tokenAt(g.cur, true), tgt = hit && hit.id !== g.id ? hit : null, to = tgt ? tgt.at : g.cur;
    html = '<path d="M' + start[0] + " " + start[1] + "L" + E.f1(to[0]) + " " + E.f1(to[1]) + '" stroke="' + PAL.pass + '" stroke-width="' + sw + '" stroke-dasharray="' + E.f1(sw * 2.2) + " " + E.f1(sw * 1.7) + '" fill="none" opacity=".9"/>';
    if (tgt) html += '<circle cx="' + tgt.at[0] + '" cy="' + tgt.at[1] + '" r="' + (r + 6) + '" fill="none" stroke="' + PAL.pass + '" stroke-width="3"/>';
  } else {
    var pts = [start].concat(g.pts.slice(1));
    html = '<path d="' + E.dpath(pts) + '" stroke="' + (tokOf(g.id).team === "d" ? PAL.def : PAL.off) + '" stroke-width="' + sw + '" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>';
  }
  lyr.draft.innerHTML = html;
}
function finishDraw(g, p) {
  var r = tokR(S.cur), d = dims(S.cur), k = ppu() || 1;
  if (g.kind === "pass") {
    var hit = tokenAt(p, true);
    if (hit && hit.id !== g.id) setPass(g.id, hit.id);
    else toast("Drop the pass on a teammate.");
    return;
  }
  var start = curPos()[g.id], pts = [start].concat(g.pts.slice(1)), eps = 6 / k, simp = E.rdp(pts, eps), tries = 0;
  while (simp.length > 15 && tries++ < 8) { eps *= 1.5; simp = E.rdp(pts, eps); }
  var path = simp.slice(1).map(function (q) { return [rnd(clamp(q[0], 4, d.w - 4)), rnd(clamp(q[1], 4, d.h - 4))]; });
  // end exactly where the finger lifted
  if (path.length) path[path.length - 1] = [rnd(clamp(p[0], 4, d.w - 4)), rnd(clamp(p[1], 4, d.h - 4))];
  path = path.filter(function (q, i) { return i === path.length - 1 || Math.hypot(q[0] - start[0], q[1] - start[1]) > r * 0.5; });
  if (!path.length || Math.hypot(path[path.length - 1][0] - start[0], path[path.length - 1][1] - start[1]) < r * 0.6) { toast("Drag a little farther to draw a move."); return; }
  setMove(g.id, { k: g.kind, p: path, s: path.length >= 2 ? 1 : 0 });
}
function setMove(id, mv) {
  pushHist(null);
  S.cur.steps[S.step].m[id] = mv;
  touch(); renderLayers(); renderCtx(); renderActions();
}
function setPass(id, to) {
  setMove(id, { k: "pass", to: to });
  var a = tokOf(id), b = tokOf(to);
  $("#liveSel").textContent = "Pass from " + a.label + " to " + b.label;
}

/* ----- tap-the-points mode ----- */
function startPlot(id, kind) {
  S.plot = { id: id, kind: kind, pts: [] };
  if (S.sel !== id) S.sel = id;
  renderLayers(); renderCtx();
}
function endPlot() { S.plot = null; renderCtx(); }
function plotTap(p, hitId) {
  var pl = S.plot, d = dims(S.cur);
  if (pl.kind === "pass") {
    var t = tokenAt(p, true);
    if (t && t.id !== pl.id) { endPlot(); setPass(pl.id, t.id); }
    else toast("Tap the player to pass to.");
    return;
  }
  if (hitId === pl.id && pl.pts.length) { endPlot(); return; }
  pl.pts.push([rnd(clamp(p[0], 4, d.w - 4)), rnd(clamp(p[1], 4, d.h - 4))]);
  setMove(pl.id, { k: pl.kind, p: pl.pts.map(function (q) { return q.slice(); }), s: 0 });
}
function plotUndoPoint() {
  var pl = S.plot;
  if (!pl || !pl.pts.length) return;
  pl.pts.pop();
  pushHist(null);
  if (pl.pts.length) S.cur.steps[S.step].m[pl.id] = { k: pl.kind, p: pl.pts.map(function (q) { return q.slice(); }), s: 0 };
  else delete S.cur.steps[S.step].m[pl.id];
  touch(); renderLayers(); renderCtx(); renderActions();
}

/* ----- keyboard: arrows nudge the selected player ----- */
function onKey(e) {
  if (S.mode !== "edit" || S.readOnly) return;
  var id = S.sel, k = e.key, step = e.shiftKey ? 12 : 4;
  if (k === "Escape") { if (S.plot) endPlot(); else if (S.sel) { S.sel = null; renderLayers(); renderCtx(); } return; }
  if (k === "[" || k === "]") {
    var ts = S.cur.tokens; if (!ts.length) return;
    var i = ts.findIndex(function (t) { return t.id === S.sel; });
    i = k === "]" ? (i + 1) % ts.length : (i - 1 + ts.length) % ts.length;
    select(ts[i].id); e.preventDefault(); return;
  }
  if (!id) return;
  if (k === "Delete" || k === "Backspace") { removeToken(id); e.preventDefault(); return; }
  var dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
  if (!dx && !dy) return;
  e.preventDefault();
  var pos = curPos(), q = S.step === 0 ? pos[id] : getTL().steps[S.step].end[id];
  pushHist("key" + id);
  if (placeAt(id, q[0] + dx, q[1] + dy)) { touch(); renderLayers(); renderActions(); }
}

/* ============================================================ editing actions */
function removeToken(id) {
  var t = tokOf(id);
  if (!t || S.readOnly) return;
  pushHist(null);
  var p = S.cur;
  p.tokens = p.tokens.filter(function (x) { return x.id !== id; });
  p.steps.forEach(function (st) {
    delete st.m[id];
    Object.keys(st.m).forEach(function (k) { if (st.m[k].k === "pass" && st.m[k].to === id) delete st.m[k]; });
  });
  if (p.ball === id) p.ball = null;
  S.sel = null; S.plot = null;
  touch(); renderLayers(); renderCtx(); renderActions();
  toast("Removed " + (t.label || "player"), { action: { label: "Undo", fn: undo } });
}
function clearMove(id) {
  var st = S.cur.steps[S.step];
  if (!st.m[id]) return;
  pushHist(null); delete st.m[id];
  touch(); renderLayers(); renderCtx(); renderActions();
}
function giveBall(id) {
  pushHist(null);
  S.cur.ball = S.cur.ball === id ? null : id;
  touch(); renderLayers(); renderCtx(); renderActions();
}
function setTeam(id, team) {
  var t = tokOf(id); if (!t || t.team === team) return;
  pushHist(null); t.team = team; touch(); renderLayers(); renderCtx(); renderActions();
}
function addStep() {
  if (S.readOnly) return;
  if (nSteps() >= E.MAXSTEPS) { toast("That's the most steps a play can have."); return; }
  stopPlay(); S.mode = "edit"; S.plot = null;
  pushHist(null);
  S.cur.steps.push({ note: "", m: {} });
  S.step = nSteps() - 1; touch(); renderBoardAll();
}
function deleteStep() {
  if (S.readOnly || nSteps() < 2) return;
  stopPlay(); S.mode = "edit"; S.plot = null;
  pushHist(null);
  S.cur.steps.splice(S.step, 1);
  S.step = Math.min(S.step, nSteps() - 1);
  touch(); renderBoardAll();
  toast("Step deleted", { action: { label: "Undo", fn: undo } });
}
function gotoStep(i) {
  stopPlay(); S.mode = "edit"; S.plot = null; S.step = clamp(i, 0, nSteps() - 1); S.u = S.step;
  renderBoardAll();
}
function backToEdit() {
  if (S.readOnly) { gotoStep(S.step); return; }
  stopPlay();
  var n = nSteps();
  S.mode = "edit"; S.step = clamp(Math.floor(S.u + 1e-6), 0, n - 1); S.u = S.step;
  renderBoardAll();
}
function setTool(k) {
  if (S.mode === "watch") backToEdit();
  S.plot = null; S.tool = k;
  renderTools(); renderCtx();
}
function toggleCourt() {
  if (S.readOnly) return;
  pushHist(null);
  S.cur.variant = S.cur.variant === "full" ? "half" : "full";
  touch(); S.courtKey = ""; renderBoardAll();
}
function rotateLineup() {
  var p = S.cur;
  if (p.sport !== "vb" || S.readOnly) return;
  var slots = { 1: [420, 400], 2: [420, 165], 3: [270, 165], 4: [120, 165], 5: [120, 400], 6: [270, 420] }, order = [2, 1, 6, 5, 4, 3];
  pushHist(null);
  var moved = 0;
  p.tokens.forEach(function (t) {
    if (t.team === "d") return;
    var best = null, bd = 1e9;
    order.forEach(function (z) { var d = Math.hypot(slots[z][0] - t.x, slots[z][1] - t.y); if (d < bd) { bd = d; best = z; } });
    if (bd > 70) return;
    var nxt = order[(order.indexOf(best) + 1) % 6];
    t.x = slots[nxt][0]; t.y = slots[nxt][1]; moved++;
  });
  touch(); stopPlay(); S.mode = "edit"; S.step = 0; renderBoardAll();
  toast(moved ? "Lineup rotated one spot" : "Put players near the six spots first");
}

/* ============================================================ playback */
function stopPlay() {
  S.playing = false;
  if (S.raf) cancelAnimationFrame(S.raf);
  S.raf = 0;
}
function enterWatch(u) {
  S.plot = null; S.sel = null; S.mode = "watch"; S.u = u; S.drawnStep = -1;
  renderBoardAll();
}
function startPlay() {
  var n = nSteps();
  if (S.mode !== "watch") enterWatch(S.step);
  if (S.u >= n - 0.001) { S.u = 0; renderLayers(); }
  S.playing = true; S.last = performance.now();
  S.raf = requestAnimationFrame(tick);
  renderPlayerBits();
}
function tick(ts) {
  if (!S.playing) return;
  var n = nSteps(), dt = Math.min(64, ts - S.last);
  S.last = ts;
  S.u = Math.min(n, S.u + dt / E.STEP_MS * S.speed);
  renderFrame();
  if (S.u >= n) { S.playing = false; S.raf = 0; renderPlayerBits(); return; }
  S.raf = requestAnimationFrame(tick);
}
function togglePlay() { if (S.playing) { stopPlay(); renderPlayerBits(); } else startPlay(); }
function restartPlay() {
  stopPlay();
  S.u = 0;
  if (S.mode !== "watch") enterWatch(0); else { renderLayers(); renderChips(); renderNote(); }
  startPlay();
}
function onScrub() {
  var v = +$("#scrub").value / 1000;
  stopPlay();
  if (S.mode !== "watch") { S.plot = null; S.sel = null; S.mode = "watch"; S.u = v; S.drawnStep = -1; renderBoardAll(); return; }
  S.u = v; renderFrame();
}

/* ============================================================ UI: board screen */
function renderAppbar() {
  var bar = $("#appbarIn");
  bar.replaceChildren();
  if (S.view === "lib") {
    bar.append(
      h("div", { class: "brand" },
        h("span", { html: '<svg viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="#13203a" stroke="#2b4268"/><circle cx="10" cy="23" r="5" fill="#ff7a1a"/><path d="M15 19C20 10 24 15 28 10" fill="none" stroke="#eaf0f9" stroke-width="2.4" stroke-dasharray="4 3" stroke-linecap="round"/><path d="M30 8l-6.5 .6 3.8 4.7z" fill="#eaf0f9"/></svg>' }),
        h("h1", { class: "ttl" }, "Play Board")),
      h("button", { class: "icon-btn", "aria-label": "About and help", onclick: aboutSheet, html: icoS("info") }));
  } else {
    var p = S.cur;
    var tb = h(S.readOnly ? "div" : "button", { class: "titlebox", "aria-label": S.readOnly ? null : "Rename or add notes. Play name: " + p.name, onclick: S.readOnly ? null : function () { detailsSheet(p); } },
      h("span", { class: "ttl" }, p.name), h("span", { class: "sub" }, subtitle(p)));
    add(bar,
      h("button", { class: "back", "aria-label": "Back to my plays", onclick: goLibrary, html: icoS("back") + "<span>Plays</span>" }),
      tb,
      h("button", { class: "icon-btn", "aria-label": "Share, picture or print", onclick: shareSheet, html: icoS("share") }),
      S.readOnly ? null : h("button", { class: "icon-btn", "aria-label": "More options", onclick: moreSheet, html: icoS("more") }));
  }
}
function renderBanner() {
  var b = $("#banner");
  if (!S.readOnly) { b.hidden = true; return; }
  b.hidden = false;
  b.replaceChildren(
    h("div", {}, h("strong", {}, "Shared play"), h("span", {}, "Read only. Save it to make your own copy you can change.")),
    h("button", { class: "btn primary small", onclick: saveShared }, "Save to my plays"));
}
function activeStep() { return S.mode === "watch" ? clamp(Math.floor(S.u), 0, nSteps() - 1) : S.step; }
function renderChips() {
  var box = $("#chips"), act = activeStep();
  var kids = S.cur.steps.map(function (st, i) {
    return h("button", { class: "chip", "aria-pressed": String(i === act), "aria-label": "Step " + (i + 1), onclick: function () { gotoStep(i); } }, String(i + 1));
  });
  if (!S.readOnly && nSteps() < E.MAXSTEPS) kids.push(h("button", { class: "chip add", "aria-label": "Add a step at the end", onclick: addStep, html: icoS("plus", "sm") }));
  box.replaceChildren.apply(box, kids);
  var a = box.querySelector('[aria-pressed="true"]');
  if (a && a.scrollIntoView) { try { a.scrollIntoView({ inline: "nearest", block: "nearest" }); } catch (e) {} }
  var ct = $("#courtToggle");
  ct.replaceChildren();
  if (S.cur.sport === "bb" && !S.readOnly) {
    var full = S.cur.variant === "full";
    ct.append(h("button", { class: "pill", "aria-pressed": String(full), onclick: toggleCourt }, "Full court"));
  }
}
function renderCtx() {
  var box = $("#ctx");
  box.replaceChildren();
  $("#boardWrap").classList.toggle("readonly", S.readOnly);
  if (S.readOnly) { box.append(h("div", { class: "hintline" }, h("p", {}, "Press Play to watch. Tap a step number to see it on its own."))); return; }
  if (S.mode === "watch") {
    box.append(h("div", { class: "hintline" }, h("p", {}, S.playing ? "Playing…" : "Paused."), h("button", { class: "btn small", onclick: backToEdit, html: icoS("edit", "sm") + "<span>Edit this step</span>" })));
    return;
  }
  var pl = S.plot;
  if (pl) {
    var t = tokOf(pl.id);
    var msg = pl.kind === "pass" ? "Tap the player " + (t ? t.label : "") + " passes to." : pl.pts.length ? "Tap more points. Tap the player or Done when finished." : "Tap the court to add points for " + (t ? t.label : "this player") + ".";
    box.append(h("div", { class: "hintline" }, h("p", {}, msg),
      pl.kind !== "pass" ? h("button", { class: "btn small", disabled: pl.pts.length ? null : true, onclick: plotUndoPoint }, "Undo point") : null,
      h("button", { class: "btn small primary", onclick: endPlot }, pl.kind === "pass" ? "Cancel" : "Done")));
    return;
  }
  var sel = S.sel && tokOf(S.sel);
  if (sel) { box.append(tokenPanel(sel)); return; }
  var text;
  if (S.tool === "move") text = S.step === 0 ? "Drag a player to place them. Tap one to change its label or give it the ball." : "Drag a player to where they should end up in this step.";
  else if (S.tool === "pass") text = "Drag from the player with the ball to a teammate. Or tap the passer, then tap the receiver.";
  else text = "Drag from a player to draw the move. Or tap a player, then tap points on the court.";
  if (!S.cur.tokens.length) text = "The board is empty. Tap Player below to add your first one.";
  box.append(h("div", { class: "hintline" }, h("p", {}, text)));
}
function tokenPanel(t) {
  var st = S.cur.steps[S.step], hasMove = !!st.m[t.id];
  var label = h("input", { type: "text", class: "tp-label", maxlength: "3", value: t.label, autocapitalize: "characters", autocomplete: "off", spellcheck: "false", "aria-label": "Player label, up to 3 characters",
    oninput: function (e) {
      pushHist("label" + t.id);
      t.label = e.target.value.slice(0, 3);
      touch(); renderLayers();
    } });
  return h("div", { class: "tokpanel", role: "group", "aria-label": "Selected player" },
    h("div", { class: "tp-row" }, label,
      h("button", { class: "pill", "aria-pressed": String(t.team !== "d"), onclick: function () { setTeam(t.id, "o"); } }, "Offense"),
      h("button", { class: "pill", "aria-pressed": String(t.team === "d"), onclick: function () { setTeam(t.id, "d"); } }, "Defense")),
    h("div", { class: "tp-row grow" },
      h("button", { class: "pill", "aria-pressed": String(S.cur.ball === t.id), onclick: function () { giveBall(t.id); } }, "Ball at start"),
      h("button", { class: "pill", disabled: hasMove ? null : true, onclick: function () { clearMove(t.id); } }, "Clear move"),
      h("button", { class: "pill", style: "color:var(--danger);border-color:#6a3040", onclick: function () { removeToken(t.id); }, "aria-label": "Remove player " + t.label }, "Remove")));
}
function renderTools() {
  var box = $("#tools");
  box.hidden = S.readOnly;
  box.replaceChildren();
  if (S.readOnly) return;
  var tools = SPORTS[S.cur.sport].tools, order = ["run", "pass", "drib", "scr"];
  function pill(k, name, ico) {
    return h("button", { class: "pill", "aria-pressed": String(S.tool === k && S.mode === "edit"), onclick: function () { setTool(k); }, html: icoS(ico, "sm") + "<span>" + esc(name) + "</span>" });
  }
  box.append(pill("move", "Move", "t_move"));
  order.forEach(function (k) { if (tools[k]) box.append(pill(k, tools[k], "t_" + k)); });
}
function renderActions() {
  var box = $("#actions");
  box.hidden = S.readOnly;
  box.replaceChildren();
  if (S.readOnly) return;
  function act(ico, label, fn, dis) { return h("button", { class: "act", disabled: dis ? true : null, onclick: fn, html: icoS(ico) + "<span>" + label + "</span>" }); }
  box.append(
    act("undo", "Undo", undo, !S.hist.length),
    act("redo", "Redo", redo, !S.fut.length),
    act("plus", "Player", addTokenSheet, false),
    act("trash", "Del step", deleteStep, nSteps() < 2));
  box.children[0].setAttribute("aria-label", "Undo");
  box.children[1].setAttribute("aria-label", "Redo");
  box.children[2].setAttribute("aria-label", "Add a player");
  box.children[3].setAttribute("aria-label", "Delete this step");
}
function renderNote() {
  var n = $("#note"), i = activeStep(), st = S.cur.steps[i];
  $("#noteLabel").textContent = "Step " + (i + 1) + " of " + nSteps() + " note";
  var ro = S.readOnly || S.mode === "watch";
  n.readOnly = ro;
  if (n.value !== st.note) n.value = st.note;
  n.placeholder = ro ? (st.note ? "" : "No note for this step.") : "What happens in this step? (example: 5 sets the screen, 1 uses it)";
}
function renderPlayerBits() {
  var n = nSteps(), u = S.mode === "watch" ? S.u : S.step, sc = $("#scrub");
  sc.max = n * 1000;
  if (+sc.value !== Math.round(u * 1000)) sc.value = Math.round(u * 1000);
  sc.style.setProperty("--p", (u / n * 100) + "%");
  $("#stepInfo").textContent = "Step " + (activeStep() + 1) + " of " + n;
  var pb = $("#btnPlay");
  pb.innerHTML = icoS(S.playing ? "pause" : "play");
  pb.setAttribute("aria-label", S.playing ? "Pause" : "Play");
  var act = activeStep(), chips = $("#chips").querySelectorAll(".chip:not(.add)");
  chips.forEach(function (c, i) { c.setAttribute("aria-pressed", String(i === act)); });
  $("#speeds").querySelectorAll(".pill").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-s") === S.speed)); });
}
function renderBoardAll() {
  ensureBoard();
  renderBanner(); renderChips(); renderLayers(); renderCtx(); renderTools(); renderActions(); renderNote(); renderPlayerBits();
  $("#firstHint").hidden = S.readOnly || lsGet("hint", "") === "1";
}

/* ============================================================ library */
function thumbHTML(p) {
  return E.diagramSVG(p, { mode: "overview", theme: "dark", uid: "t" + p.id });
}
var thumbCache = {};
function renderLibrary() {
  var all = S.plays.slice().sort(function (a, b) { return b.updated - a.updated; });
  var present = E.SPORT_KEYS.filter(function (k) { return all.some(function (p) { return p.sport === k; }); });
  if (S.filter !== "all" && present.indexOf(S.filter) < 0) S.filter = "all";
  var lf = $("#libFilter");
  lf.replaceChildren();
  if (present.length > 1) {
    ["all"].concat(present).forEach(function (k) {
      lf.append(h("button", { class: "pill", "aria-pressed": String(S.filter === k), onclick: function () { S.filter = k; renderLibrary(); } }, k === "all" ? "All" : SPORTS[k].name.replace(" / Softball", "")));
    });
  }
  var list = all.filter(function (p) { return S.filter === "all" || p.sport === S.filter; });
  var g = $("#libGrid");
  g.replaceChildren();
  $("#libEmpty").hidden = all.length > 0;
  list.forEach(function (p) {
    var ck = p.id + ":" + p.updated;
    if (!thumbCache[ck]) thumbCache[ck] = thumbHTML(p);
    var n = p.steps.length;
    g.append(h("div", { class: "card" },
      h("button", { class: "card-open", "aria-label": "Open " + p.name + ", " + SPORTS[p.sport].name + ", " + n + (n === 1 ? " step" : " steps"), onclick: function () { openPlay(p.id); } },
        h("div", { class: "thumb", html: thumbCache[ck] }),
        h("div", { class: "card-b" }, h("div", { class: "card-t" }, p.name), h("div", { class: "card-m" }, SPORTS[p.sport].name.replace(" / Softball", "") + " · " + n + (n === 1 ? " step" : " steps")), h("div", { class: "card-m" }, "Updated " + fmtAgo(p.updated)))),
      h("button", { class: "icon-btn card-more", "aria-label": "Options for " + p.name, onclick: function () { playMenu(p); }, html: icoS("more") })));
  });
}
function renderAll() {
  document.body.classList.toggle("v-lib", S.view === "lib");
  document.body.classList.toggle("v-board", S.view === "board");
  $("#boardView").hidden = S.view !== "board";
  $("#libView").hidden = S.view !== "lib";
  $("#playerbar").hidden = S.view !== "board";
  document.title = S.view === "board" ? S.cur.name + " · Play Board" : "Play Board";
  renderAppbar();
  if (S.view === "lib") renderLibrary(); else renderBoardAll();
}
function resetEditorState() {
  stopPlay();
  S.step = 0; S.mode = "edit"; S.u = 0; S.sel = null; S.plot = null; S.hist = []; S.fut = []; S.histKey = null; S.tool = "move"; S.ver++; S.courtKey = "";
}
function pushBoardState() {
  try { if (!(history.state && history.state.v === "board")) history.pushState({ v: "board" }, ""); } catch (e) {}
}
function openPlay(id) {
  var p = S.plays.filter(function (x) { return x.id === id; })[0];
  if (!p) return;
  closeSheet(true);
  S.cur = p; S.readOnly = false; S.shared = false; S.view = "board";
  resetEditorState();
  lsSet("cur", id);
  pushBoardState();
  renderAll();
  window.scrollTo(0, 0);
}
function openShared(p) {
  closeSheet(true);
  S.cur = p; S.readOnly = true; S.shared = true; S.view = "board";
  resetEditorState();
  pushBoardState();
  renderAll();
  window.scrollTo(0, 0);
}
function showLibrary() {
  stopPlay();
  lsSet("cur", ""); // relaunching from the library should land in the library
  if (S.shared) { try { history.replaceState(history.state, "", location.pathname + location.search); } catch (e) {} }
  S.view = "lib"; S.readOnly = false; S.shared = false;
  renderAll();
}
function goLibrary() {
  if (history.state && history.state.v === "board") { history.back(); return; }
  showLibrary();
}
function saveShared() {
  if (!S.shared) return;
  var p = E.clone(S.cur);
  p.id = E.newId(); p.updated = Date.now();
  S.plays.unshift(p);
  savePlays();
  try { history.replaceState(history.state, "", location.pathname + location.search); } catch (e) {}
  S.cur = p; S.readOnly = false; S.shared = false;
  lsSet("cur", p.id);
  resetEditorState();
  renderAll();
  toast("Saved to your plays");
}
function duplicatePlay(p) {
  var c = E.clone(p);
  c.id = E.newId(); c.name = E.str(p.name + " copy", 60); c.updated = Date.now();
  S.plays.unshift(c);
  savePlays();
  if (S.view === "lib") renderLibrary();
  toast("Duplicated", { action: { label: "Open", fn: function () { openPlay(c.id); } } });
}
function deletePlay(p) {
  S.plays = S.plays.filter(function (x) { return x !== p; });
  savePlays();
  if (S.cur === p) { S.cur = null; }
  if (lsGet("cur", "") === p.id) lsSet("cur", "");
  if (S.view === "board") { goLibrary(); } else renderLibrary();
  toast("Deleted " + p.name);
}

/* ============================================================ sheets */
var sheetEl = null, sheetPrev = null, sheetTimer = 0;
function openSheet(title, build, opts) {
  closeSheet(true);
  opts = opts || {};
  var root = $("#sheets");
  var scrim = h("div", { class: "scrim", onclick: function () { closeSheet(); } });
  var body = h("div", { class: "sheet-b" });
  var sh = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title, tabindex: "-1" },
    h("div", { class: "grab", "aria-hidden": "true" }),
    h("div", { class: "sheet-h" }, h("h2", {}, title), h("button", { class: "icon-btn", "aria-label": "Close", onclick: function () { closeSheet(); }, html: icoS("close") })),
    body);
  sheetPrev = document.activeElement;
  root.append(scrim, sh);
  sheetEl = { scrim: scrim, sh: sh };
  try { $("#app").inert = true; $("#playerbar").inert = true; $("#fab").inert = true; } catch (e) {}
  build(body, closeSheet);
  var f = opts.focus ? sh.querySelector(opts.focus) : null;
  (f || sh).focus({ preventScroll: true }); // right away, so a fast typist is never interrupted
  requestAnimationFrame(function () { scrim.classList.add("open"); sh.classList.add("open"); });
}
function closeSheet(immediate) {
  if (!sheetEl) return;
  var el = sheetEl; sheetEl = null;
  try { $("#app").inert = false; $("#playerbar").inert = false; $("#fab").inert = false; } catch (e) {}
  var done = function () { el.scrim.remove(); el.sh.remove(); };
  if (immediate === true || matchMedia("(prefers-reduced-motion: reduce)").matches) done();
  else { el.scrim.classList.remove("open"); el.sh.classList.remove("open"); setTimeout(done, 260); }
  if (sheetPrev && document.contains(sheetPrev) && immediate !== true) { try { sheetPrev.focus({ preventScroll: true }); } catch (e) {} }
  sheetPrev = null;
}
function pillBtn(label, pressed, fn) { return h("button", { class: "pill", "aria-pressed": String(!!pressed), onclick: fn }, label); }
function rowBtn(ico, label, sub, fn, cls) {
  return h("button", { class: "row-btn" + (cls ? " " + cls : ""), onclick: fn, html: icoS(ico) + "<span>" + esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span>" });
}

function newPlaySheet() {
  var st = { name: "New play", sport: "bb", variant: "half", start: "all" };
  function defStart(k) { return k === "soc" || k === "vb" ? "off" : "all"; }
  openSheet("New play", function (body, close) {
    var name = h("input", { type: "text", maxlength: "60", value: st.name, "aria-label": "Play name", oninput: function (e) { st.name = e.target.value; } });
    var sportRow = h("div", { class: "pillrow" }), varRow = h("div", { class: "pillrow" }), startRow = h("div", { class: "pillrow" });
    var varField = h("div", { class: "field" }, h("span", { class: "lbl" }, "Size"), varRow);
    function draw(focusRow) {
      sportRow.replaceChildren.apply(sportRow, E.SPORT_KEYS.map(function (k) {
        return pillBtn(SPORTS[k].name, st.sport === k, function () { st.sport = k; st.variant = VARIANTS[k][0][0]; st.start = defStart(k); draw(sportRow); });
      }));
      varField.hidden = VARIANTS[st.sport].length < 2;
      varRow.replaceChildren.apply(varRow, VARIANTS[st.sport].map(function (v) { return pillBtn(v[1], st.variant === v[0], function () { st.variant = v[0]; draw(varRow); }); }));
      startRow.replaceChildren.apply(startRow, E.startOptions(st.sport).map(function (o) { return pillBtn(o[1], st.start === o[0], function () { st.start = o[0]; draw(startRow); }); }));
      if (focusRow) { var b = focusRow.querySelector('[aria-pressed="true"]'); if (b) b.focus(); }
    }
    draw();
    body.append(
      h("div", { class: "field" }, h("label", { for: "npName" }, "Name"), name),
      h("div", { class: "field" }, h("span", { class: "lbl" }, "Sport"), sportRow),
      varField,
      h("div", { class: "field" }, h("span", { class: "lbl" }, "Start with"), startRow),
      h("div", { class: "btnrow" }, h("button", { class: "btn primary", onclick: function () {
        var p = E.newPlay({ name: E.str(st.name, 60) || "New play", sport: st.sport, variant: st.variant, start: st.start });
        S.plays.unshift(p); savePlays(); close(true); openPlay(p.id);
      } }, "Create play")));
    name.id = "npName";
  });
}
function detailsSheet(p) {
  openSheet("Name and notes", function (body, close) {
    var name = h("input", { type: "text", id: "dtName", maxlength: "60", value: p.name, autocomplete: "off" });
    var notes = h("textarea", { id: "dtNotes", rows: "4", maxlength: "600", placeholder: "Notes for the whole play (when to use it, what to watch for)" });
    notes.value = p.notes || "";
    body.append(
      h("div", { class: "field" }, h("label", { for: "dtName" }, "Play name"), name),
      h("div", { class: "field" }, h("label", { for: "dtNotes" }, "Play notes"), notes),
      h("p", { class: "muted small" }, subtitle(p) + " · " + p.steps.length + (p.steps.length === 1 ? " step" : " steps")),
      h("div", { class: "btnrow" }, h("button", { class: "btn", onclick: function () { close(); } }, "Cancel"), h("button", { class: "btn primary", onclick: function () {
        var nm = E.str(name.value, 60) || "Untitled play", nt = E.str(notes.value, 600);
        if (p === S.cur && !S.readOnly) { pushHist(null); p.name = nm; p.notes = nt; touch(); }
        else { p.name = nm; p.notes = nt; p.updated = Date.now(); S.ver++; savePlays(); }
        close(); renderAll();
      } }, "Save")));
  }, { focus: "#dtName" });
}
function playMenu(p) {
  openSheet(p.name, function (body, close) {
    body.append(
      rowBtn("play", "Open", "", function () { close(true); openPlay(p.id); }),
      rowBtn("edit", "Rename and notes", "", function () { close(true); detailsSheet(p); }),
      rowBtn("copy", "Duplicate", "", function () { close(true); duplicatePlay(p); }),
      rowBtn("print", "Print", "One page with every step", function () { close(true); printPlay(p); }),
      rowBtn("trash", "Delete", "", function () { close(true); confirmDelete(p); }, "danger"));
  });
}
function confirmDelete(p) {
  openSheet("Delete this play?", function (body, close) {
    body.append(
      h("p", {}, "“" + p.name + "” will be removed from this phone. This can't be undone."),
      h("div", { class: "btnrow" }, h("button", { class: "btn", onclick: function () { close(); } }, "Keep it"), h("button", { class: "btn danger", onclick: function () { close(true); deletePlay(p); } }, "Delete")));
  });
}
function addTokenSheet() {
  if (S.readOnly) return;
  if (S.mode === "watch") backToEdit();
  var p = S.cur;
  if (p.tokens.length >= E.MAXTOK) { toast("That's the most players a play can have."); return; }
  var st = { team: "o", label: E.nextLabel(p, "o"), touched: false };
  openSheet("Add a player", function (body, close) {
    var label = h("input", { type: "text", id: "apLabel", maxlength: "3", value: st.label, autocapitalize: "characters", autocomplete: "off", "aria-label": "Label, up to 3 characters", oninput: function (e) { st.label = e.target.value.slice(0, 3); st.touched = true; } });
    var teamRow = h("div", { class: "pillrow" });
    function draw() {
      teamRow.replaceChildren(
        pillBtn("Offense (filled)", st.team === "o", function () { st.team = "o"; if (!st.touched) { st.label = E.nextLabel(p, "o"); label.value = st.label; } draw(); teamRow.firstChild.focus(); }),
        pillBtn("Defense (outlined)", st.team === "d", function () { st.team = "d"; if (!st.touched) { st.label = E.nextLabel(p, "d"); label.value = st.label; } draw(); teamRow.lastChild.focus(); }));
    }
    draw();
    body.append(
      h("div", { class: "field" }, h("span", { class: "lbl" }, "Team"), teamRow),
      h("div", { class: "field" }, h("label", { for: "apLabel" }, "Label (up to 3 characters)"), label),
      h("div", { class: "btnrow" }, h("button", { class: "btn primary", onclick: function () {
        pushHist(null);
        var spot = E.freeSpot(p, curPos()), id = E.nextTokId(p);
        p.tokens.push({ id: id, team: st.team, label: E.str(st.label, 3), x: spot[0], y: spot[1] });
        S.sel = id; S.tool = "move"; S.step = S.step; touch();
        close(true); renderBoardAll();
      } }, "Add to the board")));
  });
}
function moreSheet() {
  var p = S.cur;
  openSheet("More", function (body, close) {
    add(body,
      rowBtn("edit", "Rename and notes", "", function () { close(true); detailsSheet(p); }),
      rowBtn("copy", "Duplicate this play", "", function () { close(true); duplicatePlay(p); }),
      rowBtn("print", "Print", "One page with every step", function () { close(true); printPlay(p); }),
      p.sport === "vb" ? rowBtn("rotate", "Rotate the lineup", "Moves each player one spot clockwise", function () { close(true); rotateLineup(); }) : null,
      rowBtn("plus", "New play", "", function () { close(true); newPlaySheet(); }),
      rowBtn("library", "My plays", "", function () { close(true); goLibrary(); }),
      rowBtn("info", "About and help", "", function () { close(true); aboutSheet(); }),
      rowBtn("trash", "Delete this play", "", function () { close(true); confirmDelete(p); }, "danger"));
  });
}
function aboutSheet() {
  openSheet("About and help", function (body, close) {
    body.append(
      h("p", {}, "Draw a play, step through it and watch it move. For coaches and players. Everything stays on this phone: no account, no ads, nothing is sent anywhere unless you tap Share."),
      h("h3", {}, "How it works"),
      h("ul", {},
        h("li", {}, h("b", {}, "Place players. "), "With Move selected, drag a player. Tap a player to change its label (up to 3 characters), switch offense or defense, or give it the ball."),
        h("li", {}, h("b", {}, "Draw a move. "), "Pick Cut, Dribble, Screen (or Run, Route and so on). Drag from a player along the path you want, or tap the player and then tap points. A screen ends in a bar."),
        h("li", {}, h("b", {}, "Pass. "), "Pick Pass, then drag from the player with the ball to a teammate. The ball moves when the step plays."),
        h("li", {}, h("b", {}, "Steps. "), "Tap + to add the next step. Each step starts where the last one ended, so you only draw what changes. In step 2 and later, Move lets you drag a player to where they end up. Add a note to any step."),
        h("li", {}, h("b", {}, "Play it. "), "Press Play. Drag the slider to scrub. Use 0.5x, 1x or 2x for speed. Tap “Edit this step” to go back to drawing."),
        h("li", {}, h("b", {}, "Undo. "), "Undo and Redo are under the tools. Deleted players and steps can be undone too."),
        h("li", {}, h("b", {}, "Share. "), "Tap the share button for a link (the play is packed into the link itself), a picture, or a printout with every step."),
        h("li", {}, h("b", {}, "Keyboard. "), "Select a player, then use the arrow keys to nudge it. Tap the court first so it has focus.")),
      h("h3", {}, "Keep your plays safe"),
      h("p", {}, "Plays are saved on this device only. Phones can clear a web app's storage, so make a backup now and then."),
      h("div", { class: "btnrow" }, h("button", { class: "btn", onclick: function () { close(true); backupSheet(); } }, "Back up or restore")),
      h("h3", {}, "Something wrong?"),
      h("div", { class: "btnrow" }, h("button", { class: "btn", onclick: function () { close(true); if (window.nateHealth) window.nateHealth.report(); } }, "Send a problem report")),
      h("p", { class: "muted small", style: "margin-top:18px" }, VERSION));
  });
}
function backupSheet() {
  openSheet("Back up or restore", function (body, close) {
    var out = h("textarea", { class: "linkbox", readonly: true, rows: "4", "aria-label": "Backup code for all your plays" });
    out.value = JSON.stringify({ pb: 1, plays: S.plays });
    var inp = h("textarea", { class: "linkbox", rows: "4", id: "bkIn", placeholder: "Paste a backup code here", "aria-label": "Paste a backup code" });
    body.append(
      h("p", {}, "Copy this code and keep it somewhere safe (a note to yourself works)."),
      out,
      h("div", { class: "btnrow" }, h("button", { class: "btn", onclick: function () { copyText(out, "Backup copied"); }, html: icoS("copy", "sm") + "<span>Copy backup</span>" })),
      h("h3", {}, "Restore"),
      h("p", { class: "muted" }, "Pasting a backup adds those plays to your library. It never deletes anything."),
      inp,
      h("div", { class: "btnrow" }, h("button", { class: "btn primary", onclick: function () {
        var added = 0;
        try {
          var o = JSON.parse(inp.value.trim()), arr = o && Array.isArray(o.plays) ? o.plays : Array.isArray(o) ? o : [o];
          arr.slice(0, 200).forEach(function (r) { var p = E.cleanPlay(r); if (p) { p.id = E.newId(); S.plays.push(p); added++; } });
        } catch (e) {}
        if (added) { savePlays(); toast("Added " + added + (added === 1 ? " play" : " plays")); close(true); if (S.view === "lib") renderLibrary(); }
        else toast("That doesn't look like a Play Board backup.", { err: true });
      } }, "Add these plays")));
  });
}
function copyText(box, msg) {
  function done() { toast(msg || "Copied"); }
  box.focus(); box.select();
  var ok = false;
  try { ok = document.execCommand && document.execCommand("copy"); } catch (e) {}
  if (ok) { done(); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, function () { toast("Press and hold the text to copy it."); });
  else toast("Press and hold the text to copy it.");
}

/* ============================================================ share, picture, print */
function baseUrl() { return location.origin + location.pathname.replace(/index\.html$/, ""); }
function currentView() { return S.mode === "watch" ? { mode: "frame", u: S.u } : { mode: "step", step: S.step }; }
function shareSheet() {
  var p = S.cur, view = currentView(), url = "", imgP = null;
  openSheet("Share this play", function (body, close) {
    var box = h("textarea", { class: "linkbox", readonly: true, rows: "3", "aria-label": "Share link" });
    box.value = "Making the link…";
    var info = h("p", { class: "muted small" }, "The play is packed into the link. Nothing is uploaded.");
    var bLink = h("button", { class: "btn primary", disabled: true, onclick: function () { shareLink(); }, html: icoS("share", "sm") + "<span>Share link</span>" });
    var bCopy = h("button", { class: "btn", disabled: true, onclick: function () { copyText(box, "Link copied"); }, html: icoS("copy", "sm") + "<span>Copy link</span>" });
    function shareLink() {
      if (navigator.share) {
        navigator.share({ title: p.name, text: "Play Board: " + p.name, url: url }).catch(function (e) { if (!e || e.name !== "AbortError") copyText(box, "Link copied"); });
      } else copyText(box, "Link copied");
    }
    E.encodeLink(p, baseUrl()).then(function (u) {
      url = u; box.value = u; bLink.disabled = false; bCopy.disabled = false;
      info.textContent = u.length + " characters. Anyone with the link can open this play. Nothing is uploaded.";
    }).catch(function () { box.value = ""; toast("Couldn't make a link for this play.", { err: true }); });
    imgP = renderPNG(p, view);
    imgP.catch(function () {});
    body.append(
      box, info,
      h("div", { class: "btnrow" }, bLink, bCopy),
      h("div", { class: "btnrow" },
        h("button", { class: "btn", onclick: function () { savePicture(imgP, p); }, html: icoS("image", "sm") + "<span>Save picture</span>" }),
        h("button", { class: "btn", onclick: function () { close(true); printPlay(p); }, html: icoS("print", "sm") + "<span>Print</span>" })),
      h("p", { class: "muted small", style: "margin-top:12px" }, "The picture shows what is on the board now" + (view.mode === "step" ? " (step " + (view.step + 1) + ")." : ".")));
  });
}
function wrapText(ctx, text, maxW) {
  var words = text.split(/\s+/), lines = [], line = "";
  words.forEach(function (w) {
    var t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  });
  if (line) lines.push(line);
  return lines;
}
// Board -> SVG -> canvas -> PNG blob.
function renderPNG(p, view) {
  var tl = E.buildTL(p), d = dims(p), W = 1080, pad = 40, bw = W - pad * 2, bh = rnd(bw * d.h / d.w);
  var si = view.mode === "frame" ? E.frameAt(p, tl, view.u).step : view.step;
  var note = (p.steps[si] && p.steps[si].note) || "";
  var opts = { mode: view.mode, step: view.step, u: view.u, theme: "dark", tl: tl, uid: "png", w: bw };
  var svgStr = E.diagramSVG(p, opts);
  var cv = document.createElement("canvas"), ctx = cv.getContext("2d");
  ctx.font = "500 30px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif";
  var lines = note ? wrapText(ctx, note, bw) : [];
  var headH = 112, noteH = lines.length ? lines.length * 40 + 28 : 0, footH = 64;
  cv.width = W; cv.height = pad + headH + bh + noteH + footH;
  return new Promise(function (res, rej) {
    var img = new Image();
    img.onload = function () {
      try {
        ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = PAL.ink; ctx.textBaseline = "alphabetic";
        ctx.font = "800 48px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif";
        var title = p.name; while (ctx.measureText(title).width > bw && title.length > 3) title = title.slice(0, -2);
        ctx.fillText(title === p.name ? title : title + "…", pad, pad + 48);
        ctx.fillStyle = "#9bb0cc"; ctx.font = "500 28px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif";
        ctx.fillText(SPORTS[p.sport].name + " · Step " + (si + 1) + " of " + p.steps.length, pad, pad + 92);
        ctx.drawImage(img, pad, pad + headH, bw, bh);
        var y = pad + headH + bh;
        if (lines.length) {
          ctx.fillStyle = PAL.ink; ctx.font = "500 30px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif";
          lines.forEach(function (ln, i) { ctx.fillText(ln, pad, y + 44 + i * 40); });
        }
        ctx.fillStyle = PAL.off; ctx.font = "800 26px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif";
        ctx.fillText("PLAY BOARD", pad, cv.height - 26);
        cv.toBlob(function (b) { b && b.size ? res(b) : rej(new Error("empty")); }, "image/png");
      } catch (e) { rej(e); }
    };
    img.onerror = function () { rej(new Error("image")); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  });
}
function safeName(s) { return (s || "play").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "play"; }
function savePicture(imgP, p) {
  imgP.then(function (blob) {
    var name = safeName(p.name) + ".png";
    var file = null;
    try { file = new File([blob], name, { type: "image/png" }); } catch (e) {}
    if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: p.name }).catch(function (e) { if (e && e.name === "AbortError") return; download(blob, name); });
    }
    download(blob, name);
  }).catch(function () { toast("Couldn't make the picture.", { err: true }); });
}
function download(blob, name) {
  var a = document.createElement("a"), u = URL.createObjectURL(blob);
  a.href = u; a.download = name; document.body.append(a); a.click();
  setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 3000);
  toast("Picture saved");
}
function printHTML(p) {
  var tl = E.buildTL(p), n = p.steps.length, figs = "";
  if (n > 1) figs += '<figure class="pfig wide"><div class="pcap">The whole play</div>' + E.diagramSVG(p, { mode: "overview", theme: "print", tl: tl, uid: "pro" }) + "</figure>";
  p.steps.forEach(function (st, i) {
    figs += '<figure class="pfig"><div class="pcap">Step ' + (i + 1) + " of " + n + "</div>" + E.diagramSVG(p, { mode: "step", step: i, theme: "print", tl: tl, uid: "pr" + i }) + (st.note ? "<figcaption>" + esc(st.note) + "</figcaption>" : "") + "</figure>";
  });
  return '<article class="pplay"><h1>' + esc(p.name) + '</h1><p class="pmeta">' + esc(subtitle(p)) + " · " + n + (n === 1 ? " step" : " steps") + "</p>" +
    (p.notes ? '<p class="pnotes">' + esc(p.notes) + "</p>" : "") + '<div class="pgrid' + (n === 1 ? " one" : "") + '">' + figs + '</div><p class="pfoot">Made with Play Board</p></article>';
}
function printPlay(p) {
  $("#printRoot").innerHTML = printHTML(p);
  setTimeout(function () { window.print(); }, 80);
}

/* ============================================================ start-up */
function seedIfNeeded() {
  if (lsGet("seeded", "") === "1") return false;
  if (S.plays.length) { lsSet("seeded", "1"); return false; }
  S.plays = E.starterPlays();
  savePlays();
  lsSet("seeded", "1");
  return true;
}
function bindStatic() {
  svg = $("#board"); wrap = $("#boardWrap");
  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onCancel);
  svg.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  wrap.addEventListener("keydown", onKey);
  $("#fab").addEventListener("click", newPlaySheet);
  $("#hintOk").addEventListener("click", function () { lsSet("hint", "1"); $("#firstHint").hidden = true; });
  $("#btnPlay").addEventListener("click", togglePlay);
  $("#btnRestart").innerHTML = icoS("restart");
  $("#btnRestart").addEventListener("click", restartPlay);
  $("#scrub").addEventListener("input", onScrub);
  var sp = lsGet("speed", "1"); S.speed = sp === "0.5" || sp === "2" ? +sp : 1;
  [["0.5", "0.5x"], ["1", "1x"], ["2", "2x"]].forEach(function (s) {
    $("#speeds").append(h("button", { class: "pill", "data-s": s[0], "aria-pressed": String(+s[0] === S.speed), "aria-label": "Speed " + s[1], onclick: function () { S.speed = +s[0]; lsSet("speed", s[0]); renderPlayerBits(); } }, s[1]));
  });
  $("#note").addEventListener("input", function (e) {
    if (S.readOnly || S.mode === "watch") return;
    var i = S.step;
    pushHist("note" + i);
    S.cur.steps[i].note = e.target.value.slice(0, 200);
    touch();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheetEl) closeSheet(); });
  window.addEventListener("popstate", function () { if (S.view === "board") showLibrary(); });
  window.addEventListener("pagehide", function () { if (saveTimer) savePlays(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && saveTimer) savePlays(); });
  window.addEventListener("beforeprint", function () { if (S.view === "board" && S.cur && !$("#printRoot").firstChild) $("#printRoot").innerHTML = printHTML(S.cur); });
  window.addEventListener("afterprint", function () { $("#printRoot").innerHTML = ""; });
  window.addEventListener("hashchange", function () { if (/^#p=/.test(location.hash)) loadFromHash(); });
}
function loadFromHash() {
  if (!/^#p=/.test(location.hash)) return Promise.resolve(false);
  return E.decodeHash(location.hash).then(function (p) {
    if (!p) return false;
    openShared(p);
    return true;
  }).catch(function (e) {
    toast(e && e.message === "no decompression" ? "This link needs a newer browser to open." : "That play link couldn't be opened.", { err: true });
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    return false;
  });
}
function init() {
  bindStatic();
  S.plays = loadPlays();
  var first = seedIfNeeded();
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist().catch(function () {}); } catch (e) {} }
  if ("serviceWorker" in navigator) { window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); }); }
  loadFromHash().then(function (shared) {
    if (shared) return;
    var last = lsGet("cur", "");
    if (!first && last && S.plays.some(function (p) { return p.id === last; })) openPlay(last);
    else { S.view = "lib"; renderAll(); }
  });
}
init();
})();
