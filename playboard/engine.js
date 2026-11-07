/* Play Board engine: play data, step timeline, SVG drawing, share-link encoding.
   Pure functions only (no page access), so it also runs under Node for tests.
   Generic labels only. No real names anywhere. */
(function (root) {
"use strict";

var rnd = Math.round;
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function f1(n) { return Math.round(n * 10) / 10; }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function str(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : ""; }
function num(v, a, b, d) { return typeof v === "number" && isFinite(v) ? rnd(clamp(v, a, b)) : d; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

var MAXTOK = 30, MAXSTEPS = 40;
var STEP_MS = 2200, MOVE_FRAC = 0.85;

/* ------------------------------------------------------------------ sports */
var SPORT_KEYS = ["bb", "base", "fb", "soc", "vb"];
var SPORTS = {
  bb:   { name: "Basketball",          tools: { run: "Cut", pass: "Pass", drib: "Dribble", scr: "Screen" } },
  base: { name: "Baseball / Softball", tools: { run: "Run", pass: "Throw" } },
  fb:   { name: "Football",            tools: { run: "Route", pass: "Pass", scr: "Block" } },
  soc:  { name: "Soccer",              tools: { run: "Run", pass: "Pass", drib: "Dribble" } },
  vb:   { name: "Volleyball",          tools: { run: "Slide", pass: "Set / hit" } }
};
var VARIANTS = {
  bb:   [["half", "Half court"], ["full", "Full court"]],
  base: [["std", "Diamond"]],
  fb:   [["flag", "Flag 5v5"], ["7v7", "7v7"], ["11v11", "11v11"]],
  soc:  [["7v7", "7v7"], ["11v11", "11v11"]],
  vb:   [["six", "Six on six"]]
};
var KINDS = ["run", "pass", "drib", "scr"];

function dims(p) {
  switch (p.sport) {
    case "bb": return { w: 500, h: p.variant === "full" ? 940 : 470 };
    case "base": return { w: 520, h: 510 };
    case "fb": return { w: 500, h: 560 };
    case "soc": return { w: 500, h: 720 };
    default: return { w: 540, h: 600 };
  }
}
function tokR(p) {
  switch (p.sport) {
    case "bb": return p.variant === "full" ? 27 : 22;
    case "base": return 22;
    case "fb": return p.variant === "11v11" ? 17 : p.variant === "7v7" ? 21 : 24;
    case "soc": return p.variant === "11v11" ? 19 : 23;
    default: return 24;
  }
}

var PALS = {
  dark: {
    bg: "#0d1624", floor: "#17263d", floor2: "#1f3454", line: "#7d98c0", dim: "#3d5a85",
    grass: "#123626", grass2: "#174330", dirt: "#5a4636", dirt2: "#6b5642", fence: "#8db39c", zone: "#10304a",
    off: "#ff7a1a", offEdge: "#ffd2ad", offText: "#0d1624", def: "#5cc8ff", defFill: "#0d1624",
    pass: "#f2f6fc", sel: "#ffffff", ball: "#ffffff", ballEdge: "#ff7a1a", los: "#ff7a1a", ink: "#e8eef7"
  },
  print: {
    bg: "#ffffff", floor: "#ffffff", floor2: "#eeeeee", line: "#555555", dim: "#bbbbbb",
    grass: "#ffffff", grass2: "#f6f6f6", dirt: "#e6ddd0", dirt2: "#ddd2c2", fence: "#777777", zone: "#ececec",
    off: "#e8630a", offEdge: "#7a3300", offText: "#ffffff", def: "#0b6ea8", defFill: "#ffffff",
    pass: "#222222", sel: "#000000", ball: "#ffffff", ballEdge: "#e8630a", los: "#999999", ink: "#111111"
  }
};

/* ------------------------------------------------------------ data cleanup */
// Takes anything (saved data, an import, a shared link) and returns a safe play or null.
function cleanPlay(raw) {
  if (!raw || typeof raw !== "object") return null;
  var sport = SPORT_KEYS.indexOf(raw.sport) >= 0 ? raw.sport : null;
  if (!sport) return null;
  var vs = VARIANTS[sport].map(function (v) { return v[0]; });
  var p = {
    id: typeof raw.id === "string" && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : newId(),
    name: str(raw.name, 60) || "Untitled play",
    sport: sport,
    variant: vs.indexOf(raw.variant) >= 0 ? raw.variant : vs[0],
    notes: str(raw.notes, 600),
    updated: typeof raw.updated === "number" && isFinite(raw.updated) ? raw.updated : Date.now(),
    tokens: [], ball: null, steps: []
  };
  var d = dims(p), map = Object.create(null);
  (Array.isArray(raw.tokens) ? raw.tokens : []).slice(0, MAXTOK).forEach(function (t) {
    if (!t || typeof t !== "object") return;
    var id = "t" + (p.tokens.length + 1);
    if (t.id != null) map[t.id] = id;
    p.tokens.push({ id: id, team: t.team === "d" ? "d" : "o", label: str(t.label, 3), x: num(t.x, 0, d.w, rnd(d.w / 2)), y: num(t.y, 0, d.h, rnd(d.h / 2)) });
  });
  if (raw.ball != null && map[raw.ball]) p.ball = map[raw.ball];
  (Array.isArray(raw.steps) ? raw.steps.slice(0, MAXSTEPS) : []).forEach(function (s) {
    var st = { note: str(s && s.note, 200), m: {} };
    var m = s && s.m && typeof s.m === "object" ? s.m : {};
    Object.keys(m).forEach(function (k) {
      var id = map[k], mv = m[k];
      if (!id || !mv || typeof mv !== "object") return;
      if (mv.k === "pass") {
        var to = map[mv.to];
        if (to && to !== id) st.m[id] = { k: "pass", to: to };
      } else if (mv.k === "run" || mv.k === "drib" || mv.k === "scr") {
        var pts = (Array.isArray(mv.p) ? mv.p : []).slice(0, 80).map(function (q) {
          return Array.isArray(q) ? [num(q[0], 0, d.w, 0), num(q[1], 0, d.h, 0)] : null;
        }).filter(Boolean);
        if (pts.length) st.m[id] = { k: mv.k, p: pts, s: mv.s ? 1 : 0 };
      }
    });
    p.steps.push(st);
  });
  if (!p.steps.length) p.steps.push({ note: "", m: {} });
  return p;
}

/* -------------------------------------------------------------- geometry */
function smoothRoute(P) {
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  var out = [P[0]], m0 = mid(P[0], P[1]), cur = m0;
  out.push(m0);
  for (var i = 1; i < P.length - 1; i++) {
    var c = P[i], m = mid(P[i], P[i + 1]);
    for (var k = 1; k <= 8; k++) {
      var t = k / 8, u = 1 - t;
      out.push([u * u * cur[0] + 2 * u * t * c[0] + t * t * m[0], u * u * cur[1] + 2 * u * t * c[1] + t * t * m[1]]);
    }
    cur = m;
  }
  out.push(P[P.length - 1]);
  return out;
}
function makeRoute(P, smooth) {
  var pts = smooth && P.length >= 3 ? smoothRoute(P) : P.slice();
  var o = [pts[0]];
  for (var i = 1; i < pts.length; i++) {
    var a = o[o.length - 1], b = pts[i];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.4) o.push(b);
  }
  if (o.length < 2) return null;
  var cum = [0];
  for (var j = 1; j < o.length; j++) cum.push(cum[j - 1] + Math.hypot(o[j][0] - o[j - 1][0], o[j][1] - o[j - 1][1]));
  return { pts: o, cum: cum, len: cum[cum.length - 1] };
}
function sampleRoute(rt, s) {
  var pts = rt.pts, cum = rt.cum;
  s = clamp(s, 0, rt.len);
  var i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  var a = pts[i - 1], b = pts[i], seg = (cum[i] - cum[i - 1]) || 1, t = clamp((s - cum[i - 1]) / seg, 0, 1);
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dy: (b[1] - a[1]) / seg };
}
function perpDist(p, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
  if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / l;
}
// Ramer-Douglas-Peucker: turns a wobbly finger line into a few points.
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  var dmax = 0, idx = 0, a = pts[0], b = pts[pts.length - 1];
  for (var i = 1; i < pts.length - 1; i++) { var d = perpDist(pts[i], a, b); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) {
    var l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

/* -------------------------------------------------------------- timeline
   For every step: where each token starts, its route (if it moves), who has
   the ball, and any passes. The end of one step is the start of the next, so
   positions are computed here, never stored twice. */
function buildTL(play) {
  var pos = {}, holder = null, steps = [];
  play.tokens.forEach(function (t) { pos[t.id] = [t.x, t.y]; });
  if (play.ball && pos[play.ball]) holder = play.ball;
  play.steps.forEach(function (st) {
    var e = { start: pos, routes: {}, passes: [], holder0: holder, end: null, pass: null, holder1: holder };
    var end = {};
    Object.keys(pos).forEach(function (k) { end[k] = pos[k]; });
    Object.keys(st.m).forEach(function (id) {
      var mv = st.m[id];
      if (!pos[id]) return;
      if (mv.k === "pass") {
        if (pos[mv.to] && mv.to !== id) e.passes.push({ from: id, to: mv.to, ok: id === holder });
      } else if (mv.p && mv.p.length) {
        var rt = makeRoute([pos[id]].concat(mv.p), mv.s);
        if (rt) { e.routes[id] = rt; end[id] = mv.p[mv.p.length - 1]; }
      }
    });
    e.end = end;
    for (var i = 0; i < e.passes.length; i++) if (e.passes[i].ok) { e.pass = e.passes[i]; break; }
    e.holder1 = e.pass ? e.pass.to : holder;
    steps.push(e);
    pos = end; holder = e.holder1;
  });
  return { steps: steps, final: pos, holderEnd: holder };
}

function ballOffset(r) { return r * 0.74; }
// Everything on the board at time u (0 .. number of steps).
function frameAt(play, tl, u) {
  var n = tl.steps.length, s = Math.floor(u), l = u - s;
  if (u >= n) { s = n - 1; l = 1; }
  if (s < 0) { s = 0; l = 0; }
  var st = tl.steps[s], m = l <= 0 ? 0 : ease(Math.min(1, l / MOVE_FRAC)), pos = {}, r = tokR(play), off = ballOffset(r);
  Object.keys(st.start).forEach(function (id) {
    var rt = st.routes[id];
    if (rt) { var q = sampleRoute(rt, rt.len * m); pos[id] = [q.x, q.y]; } else pos[id] = st.start[id];
  });
  var ball = null;
  if (st.pass) {
    var A = pos[st.pass.from], B = pos[st.pass.to], f = (1 - 2 * m) * (1 - 2 * m);
    ball = [A[0] + (B[0] - A[0]) * m + off * f, A[1] + (B[1] - A[1]) * m - off * f];
  } else if (st.holder0 && pos[st.holder0]) {
    ball = [pos[st.holder0][0] + off, pos[st.holder0][1] - off];
  }
  return { step: s, l: l, m: m, pos: pos, ball: ball };
}
function ballAt(play, holder, pos) {
  if (!holder || !pos[holder]) return null;
  var off = ballOffset(tokR(play));
  return [pos[holder][0] + off, pos[holder][1] - off];
}

/* ------------------------------------------------------------------ courts */
function courtSVG(p, pal, uid) {
  switch (p.sport) {
    case "bb": return courtBB(pal, p.variant === "full");
    case "base": return courtBase(pal, uid || "x");
    case "fb": return courtFB(pal);
    case "soc": return courtSoc(pal);
    default: return courtVB(pal);
  }
}
function courtBB(pal, full) {
  var H = full ? 940 : 470, L = pal.line;
  var end = '<g fill="none" stroke="' + L + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="170" y="2" width="160" height="188" fill="' + pal.floor2 + '"/>' +
    '<path d="M190 190A60 60 0 0 0 310 190"/>' +
    '<path d="M190 190A60 60 0 0 1 310 190" stroke-dasharray="9 9" opacity=".7"/>' +
    '<path d="M210 2V52A40 40 0 0 0 290 52V2"/>' +
    '<path d="M222 40H278" stroke-width="5"/><circle cx="250" cy="52" r="9"/>' +
    '<path d="M30 2V141.5A237.5 237.5 0 0 0 470 141.5V2"/></g>';
  var s = '<rect width="500" height="' + H + '" fill="' + pal.floor + '"/>';
  if (full) {
    s += end + '<g transform="translate(0 940) scale(1 -1)">' + end + "</g>" +
      '<g fill="none" stroke="' + L + '" stroke-width="3"><rect x="2" y="2" width="496" height="936"/><path d="M2 470H498"/><circle cx="250" cy="470" r="60"/></g>';
  } else {
    s += end + '<g fill="none" stroke="' + L + '" stroke-width="3"><rect x="2" y="2" width="496" height="466"/><path d="M190 468A60 60 0 0 1 310 468"/></g>';
  }
  return s;
}
function courtBase(pal, uid) {
  var wedge = "M260 450L26.7 216.7A330 330 0 0 1 493.3 216.7Z", L = pal.line, cid = "wd-" + uid;
  var s = '<defs><clipPath id="' + cid + '"><path d="' + wedge + '"/></clipPath></defs>';
  s += '<rect width="520" height="510" fill="' + pal.grass + '"/>';
  s += '<path d="' + wedge + '" fill="' + pal.grass2 + '"/>';
  s += '<path d="M35.8 225.8A317 317 0 0 1 484.2 225.8" fill="none" stroke="' + pal.dirt + '" stroke-width="26" opacity=".9"/>';
  s += '<path d="M26.7 216.7A330 330 0 0 1 493.3 216.7" fill="none" stroke="' + pal.fence + '" stroke-width="5"/>';
  s += '<circle cx="260" cy="375" r="125" fill="' + pal.dirt + '" clip-path="url(#' + cid + ')"/>';
  s += '<circle cx="260" cy="450" r="34" fill="' + pal.dirt + '"/>';
  s += '<path d="M260 420L309 371L260 322L211 371Z" fill="' + pal.grass2 + '"/>';
  s += '<circle cx="260" cy="375" r="12" fill="' + pal.dirt2 + '"/>';
  s += '<g fill="none" stroke="' + L + '" stroke-width="3" stroke-linejoin="round"><path d="M260 450L339 371L260 292L181 371Z"/>' +
    '<path d="M260 450L26.7 216.7M260 450L493.3 216.7" opacity=".85"/>' +
    '<rect x="214" y="430" width="26" height="42" opacity=".8"/><rect x="280" y="430" width="26" height="42" opacity=".8"/></g>';
  [[339, 371], [260, 292], [181, 371]].forEach(function (b) {
    s += '<rect x="-7.5" y="-7.5" width="15" height="15" fill="#fff" transform="translate(' + b[0] + " " + b[1] + ') rotate(45)"/>';
  });
  s += '<path d="M252 442H268V450L260 459L252 450Z" fill="#fff"/>';
  return s;
}
function courtFB(pal) {
  var s = '<rect width="500" height="560" fill="' + pal.grass + '"/>', k, y;
  for (k = 0; k < 10; k += 2) s += '<rect x="0" y="' + (90 + 47 * k) + '" width="500" height="47" fill="' + pal.grass2 + '"/>';
  s += '<rect width="500" height="90" fill="' + pal.zone + '"/>';
  s += '<text x="250" y="62" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="30" letter-spacing="6" fill="' + pal.line + '" opacity=".3">END ZONE</text>';
  var d = "";
  for (k = 1; k <= 10; k++) { y = 90 + 47 * k; if (y < 560) d += "M0 " + y + "H500"; }
  s += '<path d="' + d + '" stroke="' + pal.line + '" stroke-width="2" opacity=".5" fill="none"/>';
  var hm = "";
  for (y = 99.4; y < 556; y += 9.4) { var yy = f1(y); hm += "M188 " + yy + "h10M302 " + yy + "h10M0 " + yy + "h9M491 " + yy + "h9"; }
  s += '<path d="' + hm + '" stroke="' + pal.line + '" stroke-width="1.5" opacity=".4" fill="none"/>';
  [[184, "10"], [278, "20"], [372, "30"], [466, "40"]].forEach(function (n) {
    ["64", "436"].forEach(function (x) {
      s += '<text x="' + x + '" y="' + (n[0] + 9) + '" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="26" fill="' + pal.line + '" opacity=".32">' + n[1] + "</text>";
    });
  });
  s += '<path d="M0 90H500" stroke="' + pal.line + '" stroke-width="4"/>';
  s += '<path d="M0 340H500" stroke="' + pal.los + '" stroke-width="3" stroke-dasharray="12 9" opacity=".55"/>';
  s += '<rect x="2" y="2" width="496" height="556" fill="none" stroke="' + pal.line + '" stroke-width="4"/>';
  return s;
}
function courtSoc(pal) {
  var s = '<rect width="500" height="720" fill="' + pal.grass + '"/>', i;
  for (i = 0; i < 12; i += 2) s += '<rect x="0" y="' + (i * 60) + '" width="500" height="60" fill="' + pal.grass2 + '"/>';
  var box = '<rect x="120" y="14" width="260" height="120"/><rect x="195" y="14" width="110" height="42"/><path d="M210.7 134A52 52 0 0 0 289.3 134"/><circle cx="250" cy="100" r="3.5" fill="' + pal.line + '"/><rect x="214" y="1" width="72" height="13"/>';
  s += '<g fill="none" stroke="' + pal.line + '" stroke-width="3" stroke-linejoin="round"><rect x="14" y="14" width="472" height="692"/><path d="M14 360H486"/><circle cx="250" cy="360" r="56"/><circle cx="250" cy="360" r="3.5" fill="' + pal.line + '"/>' +
    box + '<g transform="translate(0 720) scale(1 -1)">' + box + "</g></g>";
  return s;
}
function courtVB(pal) {
  var L = pal.line, s = '<rect width="540" height="600" fill="' + pal.floor2 + '"/>';
  s += '<rect x="45" y="70" width="450" height="450" fill="' + pal.floor + '"/>';
  [["4", 120, 150], ["3", 270, 150], ["2", 420, 150], ["5", 120, 395], ["6", 270, 415], ["1", 420, 395]].forEach(function (z) {
    s += '<text x="' + z[1] + '" y="' + (z[2] + 22) + '" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="64" fill="' + L + '" opacity=".13">' + z[0] + "</text>";
  });
  s += '<g fill="none" stroke="' + L + '" stroke-width="3"><rect x="45" y="70" width="450" height="450"/><path d="M45 220H495"/>' +
    '<path d="M25 70H515" stroke-width="7"/></g><circle cx="25" cy="70" r="7" fill="' + L + '"/><circle cx="515" cy="70" r="7" fill="' + L + '"/>';
  s += '<text x="270" y="52" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="18" letter-spacing="5" fill="' + L + '" opacity=".5">NET</text>';
  return s;
}

/* ------------------------------------------------------- tokens and paths */
function tokenG(t, x, y, o) {
  var r = o.r, pal = o.pal, off = t.team !== "d", L = esc(t.label || "");
  var fs = L.length >= 3 ? r * 0.74 : L.length === 2 ? r * 0.92 : r * 1.08;
  return '<g class="tok" data-id="' + t.id + '" transform="translate(' + f1(x) + " " + f1(y) + ')">' +
    (o.sel ? '<circle r="' + (r + 7) + '" fill="none" stroke="' + pal.sel + '" stroke-width="3.5"/>' : "") +
    '<circle r="' + r + '" fill="' + (off ? pal.off : pal.defFill) + '" stroke="' + (off ? pal.offEdge : pal.def) + '" stroke-width="' + (off ? 2 : f1(r * 0.17)) + '"/>' +
    '<text y="' + f1(fs * 0.36) + '" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="' + f1(fs) + '" fill="' + (off ? pal.offText : pal.def) + '">' + L + "</text></g>";
}
function ballG(x, y, r, pal) {
  var br = r * 0.44;
  return '<g class="ball" transform="translate(' + f1(x) + " " + f1(y) + ')"><circle r="' + f1(br) + '" fill="' + pal.ball + '" stroke="' + pal.ballEdge + '" stroke-width="' + f1(br * 0.42) + '"/></g>';
}
function dpath(pts) { return "M" + pts.map(function (q) { return f1(q[0]) + " " + f1(q[1]); }).join("L"); }
function arrowHead(x, y, dx, dy, size, col) {
  var nx = -dy, ny = dx, bx = x - dx * size, by = y - dy * size, w = size * 0.62;
  return '<path d="M' + f1(x) + " " + f1(y) + "L" + f1(bx + nx * w) + " " + f1(by + ny * w) + "L" + f1(bx - nx * w) + " " + f1(by - ny * w) + 'Z" fill="' + col + '"/>';
}
function endDir(rt) {
  var a = sampleRoute(rt, Math.max(0, rt.len - Math.min(rt.len, 16))), b = sampleRoute(rt, rt.len);
  var dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}
function zigzag(rt, amp) {
  var out = [], step = 11, i = 0, s;
  if (rt.len < step * 2) return rt.pts;
  for (s = 0; s < rt.len - step * 0.6; s += step, i++) {
    var q = sampleRoute(rt, s), nx = -q.dy, ny = q.dx, k = s === 0 ? 0 : (i % 2 ? 1 : -1) * amp;
    out.push([q.x + nx * k, q.y + ny * k]);
  }
  var e = rt.pts[rt.pts.length - 1];
  out.push([e[0], e[1]]);
  return out;
}
// Arrows for the chosen steps. Passes are drawn last so they sit on top.
function pathsMarkup(play, tl, idxs, pal, r, o) {
  o = o || {};
  var sw = Math.max(3.4, r * 0.17), head = r * 0.78, out = "", byId = {}, passes = "";
  play.tokens.forEach(function (t) { byId[t.id] = t; });
  idxs.forEach(function (i) {
    var st = play.steps[i], e = tl.steps[i];
    if (!st || !e) return;
    Object.keys(st.m).forEach(function (id) {
      var mv = st.m[id], t = byId[id];
      if (!t || !e.start[id]) return;
      var col = t.team === "d" ? pal.def : pal.off, op = o.faint ? ' opacity=".5"' : "";
      if (mv.k === "pass") {
        if (!e.start[mv.to]) return;
        var ok = e.passes.some(function (p) { return p.from === id && p.to === mv.to && p.ok; });
        var A = e.start[id], B = e.end[mv.to];
        var dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy);
        if (l < 2) return;
        dx /= l; dy /= l;
        var moving = !!e.routes[mv.to], tip = moving ? 0 : r + 4;
        var tx = B[0] - dx * tip, ty = B[1] - dy * tip, sx = A[0] + dx * (r + 2), sy = A[1] + dy * (r + 2);
        if (Math.hypot(tx - sx, ty - sy) < head) return;
        passes += '<g' + (o.faint ? ' opacity=".6"' : ok ? "" : ' opacity=".4"') + '><path d="M' + f1(sx) + " " + f1(sy) + "L" + f1(tx - dx * head * 0.6) + " " + f1(ty - dy * head * 0.6) + '" stroke="' + pal.pass + '" stroke-width="' + sw + '" stroke-dasharray="' + f1(sw * 2.2) + " " + f1(sw * 1.7) + '" fill="none"/>' +
          arrowHead(tx, ty, dx, dy, head, pal.pass) + "</g>";
        return;
      }
      var rt = e.routes[id];
      if (!rt) return;
      var d = endDir(rt), ex = rt.pts[rt.pts.length - 1][0], ey = rt.pts[rt.pts.length - 1][1];
      if (mv.k === "scr") {
        var bl = r * 1.5, nx = -d[1], ny = d[0];
        out += '<g' + op + ' fill="none" stroke="' + col + '" stroke-linecap="butt" stroke-linejoin="round"><path d="' + dpath(rt.pts) + '" stroke-width="' + sw + '"/>' +
          '<path d="M' + f1(ex - nx * bl / 2) + " " + f1(ey - ny * bl / 2) + "L" + f1(ex + nx * bl / 2) + " " + f1(ey + ny * bl / 2) + '" stroke-width="' + f1(sw * 1.3) + '" stroke-linecap="round"/></g>';
      } else {
        var pts = mv.k === "drib" ? zigzag(rt, sw * 1.5) : rt.pts;
        out += '<g' + op + '><path d="' + dpath(pts) + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="butt"/>' + arrowHead(ex, ey, d[0], d[1], head, col) + "</g>";
      }
    });
  });
  return out + passes;
}

// One drawing of the board: used for thumbnails, print and the picture export.
// mode: "step" (tokens at the start of o.step), "overview" (every step's arrows), "frame" (at time o.u)
function diagramSVG(play, o) {
  o = o || {};
  var pal = PALS[o.theme || "dark"], tl = o.tl || buildTL(play), d = dims(play), r = tokR(play);
  var idxs, pos, ball, faint = false, mode = o.mode || "step";
  if (mode === "frame") {
    var f = frameAt(play, tl, o.u || 0); idxs = [f.step]; pos = f.pos; ball = f.ball; faint = true;
  } else if (mode === "overview") {
    idxs = tl.steps.map(function (_, i) { return i; }); pos = tl.steps[0].start; ball = ballAt(play, tl.steps[0].holder0, pos);
  } else {
    var i = clamp(o.step || 0, 0, tl.steps.length - 1); idxs = [i]; pos = tl.steps[i].start; ball = ballAt(play, tl.steps[i].holder0, pos);
  }
  var body = courtSVG(play, pal, o.uid || "x") + pathsMarkup(play, tl, idxs, pal, r, { faint: faint });
  play.tokens.forEach(function (t) { var q = pos[t.id]; if (q) body += tokenG(t, q[0], q[1], { r: r, pal: pal }); });
  if (ball) body += ballG(ball[0], ball[1], r, pal);
  var size = o.w ? ' width="' + o.w + '" height="' + rnd(o.w * d.h / d.w) + '"' : "";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + d.w + " " + d.h + '"' + size + ' preserveAspectRatio="xMidYMid meet">' + body + "</svg>";
}

/* ------------------------------------------------------------ new plays */
function layoutFor(sport, variant) {
  var L = { off: [], def: [], ball: ["o", ""] };
  if (sport === "bb") {
    L.off = [["1", 250, 335], ["2", 85, 255], ["3", 415, 255], ["4", 170, 160], ["5", 330, 160]];
    L.def = L.off.map(function (o) { return ["X" + o[0], rnd(o[1] + (250 - o[1]) * 0.34), rnd(o[2] + (52 - o[2]) * 0.34)]; });
    L.ball = ["o", "1"];
  } else if (sport === "base") {
    L.def = [["P", 260, 375], ["C", 260, 480], ["1B", 392, 382], ["2B", 320, 320], ["SS", 200, 320], ["3B", 150, 385], ["LF", 105, 215], ["CF", 260, 175], ["RF", 415, 215]];
    L.off = [["B", 218, 447], ["R", 339, 371]];
    L.ball = ["d", "P"];
  } else if (sport === "fb") {
    if (variant === "11v11") {
      L.off = [["C", 250, 352], ["LG", 214, 352], ["RG", 286, 352], ["LT", 178, 352], ["RT", 322, 352], ["TE", 358, 352], ["QB", 250, 394], ["RB", 250, 432], ["X", 40, 356], ["Z", 460, 356], ["Y", 120, 374]];
      L.def = [["DE", 172, 326], ["DT", 222, 326], ["DT", 278, 326], ["DE", 328, 326], ["LB", 200, 290], ["LB", 250, 285], ["LB", 300, 290], ["CB", 40, 322], ["CB", 460, 322], ["S", 175, 235], ["S", 325, 235]];
    } else if (variant === "7v7") {
      L.off = [["C", 250, 352], ["QB", 250, 410], ["X", 50, 358], ["Y", 135, 358], ["A", 365, 358], ["Z", 450, 358], ["RB", 250, 458]];
      L.def = [["D1", 70, 300], ["D2", 165, 285], ["D3", 250, 275], ["D4", 335, 285], ["D5", 430, 300], ["S1", 190, 215], ["S2", 310, 215]];
    } else {
      L.off = [["C", 250, 352], ["QB", 250, 408], ["X", 65, 358], ["Y", 350, 358], ["Z", 440, 358]];
      L.def = [["D1", 65, 305], ["D2", 165, 295], ["D3", 250, 285], ["D4", 335, 295], ["D5", 435, 305]];
    }
    L.ball = ["o", "QB"];
  } else if (sport === "soc") {
    if (variant === "11v11") {
      L.off = [["1", 250, 672], ["2", 70, 580], ["3", 190, 590], ["4", 310, 590], ["5", 430, 580], ["6", 80, 470], ["7", 200, 480], ["8", 300, 480], ["9", 420, 470], ["10", 190, 390], ["11", 310, 390]];
      L.def = [["X1", 250, 50], ["X2", 70, 140], ["X3", 190, 130], ["X4", 310, 130], ["X5", 430, 140], ["X6", 80, 250], ["X7", 200, 240], ["X8", 300, 240], ["X9", 420, 250], ["X10", 190, 320], ["X11", 310, 320]];
      L.ball = ["o", "8"];
    } else {
      L.off = [["1", 250, 665], ["2", 110, 560], ["3", 390, 560], ["4", 130, 450], ["5", 250, 470], ["6", 370, 450], ["7", 250, 370]];
      L.def = [["X1", 250, 70], ["X2", 120, 170], ["X3", 380, 170], ["X4", 150, 250], ["X5", 250, 230], ["X6", 350, 250], ["X7", 250, 310]];
      L.ball = ["o", "5"];
    }
  } else {
    L.off = [["4", 120, 165], ["3", 270, 165], ["2", 420, 165], ["5", 120, 400], ["6", 270, 420], ["1", 420, 400]];
    L.ball = ["o", "1"];
  }
  return L;
}
// start: "all" | "off" | "def" | "empty"
function newPlay(o) {
  var L = layoutFor(o.sport, o.variant), start = o.start || "all";
  var p = { id: newId(), name: o.name || "New play", sport: o.sport, variant: o.variant, notes: "", updated: Date.now(), tokens: [], ball: null, steps: [{ note: "", m: {} }] };
  function add(team, arr) { arr.forEach(function (a) { p.tokens.push({ id: "t" + (p.tokens.length + 1), team: team, label: a[0], x: a[1], y: a[2] }); }); }
  if (start === "all" || start === "off") add("o", L.off);
  if (start === "all" || start === "def") add("d", L.def);
  var b = p.tokens.filter(function (t) { return t.team === L.ball[0] && t.label === L.ball[1]; })[0];
  p.ball = b ? b.id : null;
  return p;
}
function startOptions(sport) {
  var L = layoutFor(sport, VARIANTS[sport][0][0]), o = [];
  if (L.off.length && L.def.length) o.push(["all", sport === "base" ? "Fielders + batter" : "Both teams"]);
  if (L.off.length) o.push(["off", sport === "base" ? "Batter + runner" : sport === "vb" ? "Six players" : "Offense only"]);
  if (L.def.length) o.push(["def", sport === "base" ? "Fielders only" : "Defense only"]);
  o.push(["empty", "Empty board"]);
  return o;
}
function nextLabel(play, team) {
  var used = {}, i;
  play.tokens.forEach(function (t) { used[t.label] = 1; });
  if (team === "d") { for (i = 1; i < 100; i++) if (!used["X" + i]) return "X" + i; return "X"; }
  for (i = 1; i < 100; i++) if (!used[String(i)]) return String(i);
  return "";
}
function nextTokId(play) {
  var m = 0;
  play.tokens.forEach(function (t) { var n = parseInt(String(t.id).slice(1), 10); if (n > m) m = n; });
  return "t" + (m + 1);
}
function freeSpot(play, positions) {
  var d = dims(play), r = tokR(play), best = null, c = [d.w / 2, d.h * 0.62], k, ang, rad;
  function ok(x, y) {
    if (x < r || y < r || x > d.w - r || y > d.h - r) return false;
    return play.tokens.every(function (t) { var q = positions[t.id] || [t.x, t.y]; return Math.hypot(q[0] - x, q[1] - y) >= r * 2.3; });
  }
  for (rad = 0; rad < Math.max(d.w, d.h); rad += r) {
    for (k = 0; k < Math.max(1, Math.round(rad / 14)); k++) {
      ang = (k / Math.max(1, Math.round(rad / 14))) * Math.PI * 2;
      var x = rnd(c[0] + Math.cos(ang) * rad), y = rnd(c[1] + Math.sin(ang) * rad);
      if (ok(x, y)) return [x, y];
    }
  }
  return best || [rnd(d.w / 2), rnd(d.h / 2)];
}

/* --------------------------------------------------- starter plays (generic) */
// toks: [team, label, x, y]; step moves are keyed by token label.
function mk(name, sport, variant, notes, toks, ballLabel, steps, ageIdx) {
  var p = { id: newId(), name: name, sport: sport, variant: variant, notes: notes, updated: Date.now() - ageIdx * 60000, tokens: [], ball: null, steps: [] }, idOf = {};
  toks.forEach(function (t, i) { var id = "t" + (i + 1); idOf[t[1]] = id; p.tokens.push({ id: id, team: t[0], label: t[1], x: t[2], y: t[3] }); });
  p.ball = idOf[ballLabel] || null;
  steps.forEach(function (s) {
    var m = {};
    Object.keys(s.m || {}).forEach(function (k) {
      var v = s.m[k];
      m[idOf[k]] = v.to !== undefined ? { k: v.k, to: idOf[v.to] } : { k: v.k, p: v.p, s: v.s ? 1 : 0 };
    });
    p.steps.push({ note: s.n || "", m: m });
  });
  return p;
}
function starterPlays() {
  var out = [];
  out.push(mk("Pick and roll", "bb", "half", "Ball handler uses a screen, the screener rolls to the basket.",
    [["o", "1", 250, 340], ["o", "5", 335, 235], ["o", "2", 85, 255], ["o", "3", 420, 255], ["o", "4", 95, 120],
     ["d", "X1", 250, 285], ["d", "X5", 345, 175], ["d", "X2", 122, 212], ["d", "X3", 385, 215], ["d", "X4", 150, 132]], "1",
    [{ n: "5 steps up and sets a screen on X1.", m: { "5": { k: "scr", p: [[278, 302]] } } },
     { n: "1 dribbles around the screen toward the basket.", m: { "1": { k: "drib", p: [[312, 336], [338, 285], [300, 215]], s: 1 }, "X1": { k: "run", p: [[268, 326]] } } },
     { n: "5 rolls to the basket. 1 passes to 5 for an easy shot.", m: { "5": { k: "run", p: [[262, 240], [248, 130]], s: 1 }, "1": { k: "pass", to: "5" } } }], 0));
  out.push(mk("Backdoor cut", "bb", "half", "When the defender denies the pass, cut behind them to the basket.",
    [["o", "1", 250, 335], ["o", "2", 85, 255], ["o", "3", 415, 255], ["o", "4", 165, 150], ["o", "5", 335, 150],
     ["d", "X1", 250, 278], ["d", "X2", 122, 205], ["d", "X3", 372, 215], ["d", "X4", 200, 112], ["d", "X5", 305, 115]], "1",
    [{ n: "3 steps toward the ball. X3 follows to deny the pass.", m: { "3": { k: "run", p: [[368, 300]] }, "X3": { k: "run", p: [[342, 262]] } } },
     { n: "3 cuts backdoor behind X3 to the basket. 1 passes to 3.", m: { "3": { k: "run", p: [[440, 245], [405, 130], [300, 72]], s: 1 }, "1": { k: "pass", to: "3" }, "X3": { k: "run", p: [[330, 225]] } } }], 1));
  out.push(mk("Give and go", "bb", "half", "Pass, then cut hard to the basket for the return pass.",
    [["o", "1", 250, 340], ["o", "2", 90, 250], ["o", "3", 410, 250], ["o", "4", 165, 150], ["o", "5", 335, 150],
     ["d", "X1", 250, 284], ["d", "X2", 122, 208], ["d", "X3", 380, 208], ["d", "X4", 200, 112], ["d", "X5", 305, 115]], "1",
    [{ n: "1 passes to 2.", m: { "1": { k: "pass", to: "2" } } },
     { n: "1 cuts hard to the basket past X1. 2 passes back to 1.", m: { "1": { k: "run", p: [[205, 292], [214, 205], [250, 122]], s: 1 }, "2": { k: "pass", to: "1" } } }], 2));
  out.push(mk("Bunt coverage", "base", "std", "Runner on first, bunt to the third-base side.",
    [["d", "P", 260, 375], ["d", "C", 260, 480], ["d", "1B", 392, 382], ["d", "2B", 320, 320], ["d", "SS", 200, 320], ["d", "3B", 150, 385],
     ["d", "LF", 105, 215], ["d", "CF", 260, 175], ["d", "RF", 415, 215], ["o", "B", 218, 447], ["o", "R", 339, 371]], "P",
    [{ n: "Runner breaks for second. Batter bunts. 1B and 3B charge, 2B covers first, SS covers second.",
       m: { "B": { k: "run", p: [[337, 378]] }, "R": { k: "run", p: [[262, 298]] }, "1B": { k: "run", p: [[405, 455]] }, "3B": { k: "run", p: [[205, 425]] },
            "P": { k: "run", p: [[256, 420]] }, "2B": { k: "run", p: [[385, 360]] }, "SS": { k: "run", p: [[222, 322]] } } },
     { n: "P fields the bunt and throws to 2B covering first. LF, CF and RF back up.",
       m: { "P": { k: "pass", to: "2B" }, "RF": { k: "run", p: [[430, 330]] }, "CF": { k: "run", p: [[260, 238]] }, "LF": { k: "run", p: [[130, 300]] } } }], 3));
  out.push(mk("Cutoff relay", "base", "std", "Runner on second, ball hit to right field: relay to the plate.",
    [["d", "P", 260, 375], ["d", "C", 260, 480], ["d", "1B", 392, 382], ["d", "2B", 320, 320], ["d", "SS", 200, 320], ["d", "3B", 150, 385],
     ["d", "LF", 105, 215], ["d", "CF", 260, 175], ["d", "RF", 415, 215], ["o", "R", 260, 292]], "RF",
    [{ n: "Runner rounds third. RF gets the ball. 1B lines up as the cutoff man.",
       m: { "R": { k: "run", p: [[195, 356], [183, 370]], s: 1 }, "1B": { k: "run", p: [[338, 338]] }, "RF": { k: "run", p: [[408, 228]] } } },
     { n: "RF throws to the cutoff man. The runner heads home.", m: { "RF": { k: "pass", to: "1B" }, "R": { k: "run", p: [[222, 420]] } } },
     { n: "Cutoff man throws home to the catcher.", m: { "1B": { k: "pass", to: "C" }, "R": { k: "run", p: [[257, 446]] } } }], 4));
  out.push(mk("Slant", "fb", "flag", "Quick pass to the receiver who cuts inside.",
    [["o", "C", 250, 352], ["o", "QB", 250, 408], ["o", "X", 65, 358], ["o", "Y", 350, 358], ["o", "Z", 440, 358],
     ["d", "D1", 65, 305], ["d", "D2", 165, 295], ["d", "D3", 250, 285], ["d", "D4", 335, 295], ["d", "D5", 435, 305]], "C",
    [{ n: "C snaps to the QB. X runs up 3 steps, then cuts inside. Z runs deep.",
       m: { "C": { k: "pass", to: "QB" }, "X": { k: "run", p: [[65, 318], [125, 262]] }, "Z": { k: "run", p: [[440, 300], [440, 200]] }, "Y": { k: "run", p: [[395, 372]] } } },
     { n: "QB throws the slant to X.", m: { "QB": { k: "pass", to: "X" }, "X": { k: "run", p: [[172, 200]] }, "Z": { k: "run", p: [[440, 130]] } } }], 5));
  return out;
}

/* ------------------------------------------------------------ share links */
var SC = SPORT_KEYS, KC = { run: 0, pass: 1, drib: 2, scr: 3 };
function pack(p) {
  var idx = {};
  p.tokens.forEach(function (t, i) { idx[t.id] = i; });
  var o = { v: 1, n: p.name, s: SC.indexOf(p.sport) };
  if (p.variant) o.g = p.variant;
  if (p.notes) o.o = p.notes;
  o.t = p.tokens.map(function (t) { return [t.team === "d" ? 1 : 0, t.label, rnd(t.x), rnd(t.y)]; });
  if (p.ball && idx[p.ball] != null) o.b = idx[p.ball];
  o.z = p.steps.map(function (st) {
    var r = {}, m = [];
    if (st.note) r.n = st.note;
    Object.keys(st.m).forEach(function (id) {
      var mv = st.m[id];
      if (idx[id] == null) return;
      if (mv.k === "pass") { if (idx[mv.to] != null) m.push([idx[id], 1, idx[mv.to]]); }
      else if (mv.p && mv.p.length) {
        var row = [idx[id], KC[mv.k], mv.s ? 1 : 0];
        mv.p.forEach(function (q) { row.push(rnd(q[0]), rnd(q[1])); });
        m.push(row);
      }
    });
    if (m.length) r.m = m;
    return r;
  });
  return o;
}
function unpack(o) {
  if (!o || typeof o !== "object" || o.v !== 1 || !Array.isArray(o.t) || !Array.isArray(o.z)) return null;
  var raw = { name: o.n, sport: SC[o.s], variant: o.g, notes: o.o, updated: Date.now(), tokens: [], ball: null, steps: [] };
  o.t.slice(0, MAXTOK).forEach(function (t, i) {
    if (!Array.isArray(t)) return;
    raw.tokens.push({ id: "s" + i, team: t[0] === 1 ? "d" : "o", label: t[1], x: t[2], y: t[3] });
  });
  if (typeof o.b === "number" && raw.tokens[o.b]) raw.ball = "s" + o.b;
  o.z.slice(0, MAXSTEPS).forEach(function (z) {
    var st = { note: z && z.n, m: {} };
    (z && Array.isArray(z.m) ? z.m : []).forEach(function (row) {
      if (!Array.isArray(row) || row.length < 3) return;
      var id = "s" + row[0], kind = KINDS[row[1]];
      if (!kind) return;
      if (kind === "pass") st.m[id] = { k: "pass", to: "s" + row[2] };
      else {
        var pts = [];
        for (var j = 3; j + 1 < row.length && pts.length < 80; j += 2) pts.push([row[j], row[j + 1]]);
        st.m[id] = { k: kind, p: pts, s: row[2] ? 1 : 0 };
      }
    });
    raw.steps.push(st);
  });
  var p = cleanPlay(raw);
  if (p) p.id = newId();
  return p;
}
function bytesToB64u(bytes) {
  var s = "", CH = 0x8000;
  for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  var bin = atob(s), u = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function streamBytes(bytes, Ctor, fmt, max) {
  var s = new Ctor(fmt), w = s.writable.getWriter();
  w.write(bytes).catch(function () {});
  w.close().catch(function () {});
  var reader = s.readable.getReader(), chunks = [], total = 0;
  function pump() {
    return reader.read().then(function (r) {
      if (r.done) return;
      total += r.value.length;
      if (max && total > max) { reader.cancel().catch(function () {}); throw new Error("too big"); }
      chunks.push(r.value);
      return pump();
    });
  }
  return pump().then(function () {
    var out = new Uint8Array(total), o = 0;
    chunks.forEach(function (c) { out.set(c, o); o += c.length; });
    return out;
  });
}
// "#p=" + z (deflate-raw) or j (plain) + base64url JSON
function encodeLink(play, base) {
  var raw = new TextEncoder().encode(JSON.stringify(pack(play))), best = "j" + bytesToB64u(raw);
  if (typeof CompressionStream === "function") {
    return streamBytes(raw, CompressionStream, "deflate-raw").then(function (z) {
      var zs = "z" + bytesToB64u(z);
      return base + "#p=" + (zs.length < best.length ? zs : best);
    }).catch(function () { return base + "#p=" + best; });
  }
  return Promise.resolve(base + "#p=" + best);
}
function decodeHash(hash) {
  var m = /^#p=([zj])([A-Za-z0-9_-]{2,40000})$/.exec(hash || "");
  if (!m) return Promise.resolve(null);
  var bytes;
  try { bytes = b64uToBytes(m[2]); } catch (e) { return Promise.reject(e); }
  var step = m[1] === "z"
    ? (typeof DecompressionStream === "function" ? streamBytes(bytes, DecompressionStream, "deflate-raw", 400000) : Promise.reject(new Error("no decompression")))
    : Promise.resolve(bytes);
  return step.then(function (b) {
    var p = unpack(JSON.parse(new TextDecoder().decode(b)));
    if (!p) throw new Error("bad play");
    return p;
  });
}

root.PBE = {
  MAXTOK: MAXTOK, MAXSTEPS: MAXSTEPS, STEP_MS: STEP_MS, MOVE_FRAC: MOVE_FRAC,
  SPORT_KEYS: SPORT_KEYS, SPORTS: SPORTS, VARIANTS: VARIANTS, PALS: PALS,
  esc: esc, clamp: clamp, rnd: rnd, f1: f1, newId: newId, clone: clone, str: str,
  dims: dims, tokR: tokR, cleanPlay: cleanPlay,
  makeRoute: makeRoute, sampleRoute: sampleRoute, rdp: rdp, ease: ease,
  buildTL: buildTL, frameAt: frameAt, ballAt: ballAt, ballOffset: ballOffset,
  courtSVG: courtSVG, tokenG: tokenG, ballG: ballG, pathsMarkup: pathsMarkup, diagramSVG: diagramSVG, arrowHead: arrowHead, dpath: dpath,
  layoutFor: layoutFor, newPlay: newPlay, startOptions: startOptions, nextLabel: nextLabel, nextTokId: nextTokId, freeSpot: freeSpot,
  starterPlays: starterPlays,
  pack: pack, unpack: unpack, encodeLink: encodeLink, decodeHash: decodeHash
};
if (typeof module !== "undefined" && module.exports) module.exports = root.PBE;
})(typeof window !== "undefined" ? window : globalThis);
