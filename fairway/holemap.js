/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway hole maps: a pencil sketch of each hole, the way a yardage book draws it. Tee at the bottom, green at the top,
   the fairway bending the way the hole might, bunkers, now and then water, tree clumps, and 100/150/200 yard marks.
   It's drawn from the hole's par and yardage only (no map service, no pictures), so it works offline and on old phones,
   and the same hole always gets the same sketch. It is a sketch, not the real layout: the app says so under it.
   plan() gives the shape as plain numbers (so it can be tested); svg() turns a plan into a small SVG string. */
(function (root, make) {
  const M = make();
  if (typeof module === "object" && module.exports) module.exports = M; else root.FairwayMap = M;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const W = 100, H = 200, TEE_Y = 186;

  function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r1 = n => Math.round(n * 10) / 10;

  /* ---------- walking along the hole's centre line ---------- */
  function lengths(pts) { const out = [0]; for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); return out; }
  // The point a fraction t of the way from the tee (0) to the green (1), and which way the line runs there.
  function at(pts, t) {
    const L = lengths(pts), want = clamp(t, 0, 1) * L[L.length - 1];
    for (let i = 1; i < pts.length; i++) {
      if (L[i] >= want || i === pts.length - 1) {
        const seg = L[i] - L[i - 1] || 1, f = clamp((want - L[i - 1]) / seg, 0, 1), a = pts[i - 1], b = pts[i];
        const dx = (b.x - a.x) / seg, dy = (b.y - a.y) / seg;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx, dy, nx: -dy, ny: dx };
      }
    }
    return { x: pts[0].x, y: pts[0].y, dx: 0, dy: -1, nx: 1, ny: 0 };
  }

  /* ---------- the plan: the hole as numbers ---------- */
  // o: { seed (any text: course name and hole number), par (3 to 6), yards (0 when the card has none), hcp }
  function plan(o) {
    const par = clamp(Math.round(Number(o && o.par) || 4), 3, 6), yards = Math.max(0, Math.round(Number(o && o.yards) || 0));
    const rnd = seeded(hash((o && o.seed) || "hole") ^ (par * 7919) ^ yards);
    const band = par === 3 ? [0.3, 0.52] : par === 4 ? [0.62, 0.86] : [0.84, 0.96];
    const frac = yards ? clamp(yards / 600, band[0], band[1]) : { 3: 0.42, 4: 0.76, 5: 0.92, 6: 0.96 }[par];
    const len = (TEE_Y - 18) * frac, greenY = TEE_Y - len;
    // The bend: par 3s run straight, longer holes bend left, right or not at all; par 5s can bend twice.
    const dog = par === 3 ? 0 : [-1, 0, 1][Math.floor(rnd() * 3)];
    const pts = [{ x: 50 + (rnd() - 0.5) * 6, y: TEE_Y }];
    if (par === 3) pts.push({ x: 50 + (rnd() - 0.5) * 10, y: greenY });
    else if (par >= 5 && dog !== 0 && rnd() < 0.5) {
      // a double dogleg: out one way, then back
      pts.push({ x: 50 - dog * 8, y: TEE_Y - len * 0.42 });
      pts.push({ x: 50 + dog * 10, y: TEE_Y - len * 0.74 });
      pts.push({ x: 50 - dog * (6 + rnd() * 6), y: greenY });
    } else {
      const bendAt = par === 4 ? 0.56 + rnd() * 0.1 : 0.5 + rnd() * 0.12;
      pts.push({ x: 50 - dog * (3 + rnd() * 3), y: TEE_Y - len * bendAt });
      pts.push({ x: 50 + dog * (16 + rnd() * 9) + (dog ? 0 : (rnd() - 0.5) * 8), y: greenY });
    }
    pts.forEach(p => { p.x = r1(clamp(p.x, 18, 82)); p.y = r1(p.y); });
    const end = pts[pts.length - 1];
    const green = { x: end.x, y: end.y, rx: r1(par === 3 ? 10 + rnd() * 3 : 8.5 + rnd() * 3), ry: r1(7 + rnd() * 3), rot: Math.round((rnd() - 0.5) * 50) };
    // The fairway runs from the end of the tee shot's carry to just short of the green. A par 3 has none.
    const fairway = par === 3 ? null : { from: par === 4 ? 0.3 : 0.24, to: 0.9, w: r1(15 + rnd() * 7) };
    const bunkers = [];
    const gb = par === 3 ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < gb; i++) {
      const ang = (rnd() * 1.6 - 0.8 + (i % 2 ? Math.PI : 0)) + Math.PI / 2 * (rnd() < 0.5 ? 1 : 0.2);
      const d = Math.max(green.rx, green.ry) + 3 + rnd() * 2;
      bunkers.push({ x: r1(green.x + Math.cos(ang) * d), y: r1(green.y + Math.sin(ang) * d * 0.8 + 2), rx: r1(3 + rnd() * 2.5), ry: r1(2 + rnd() * 1.6), rot: Math.round(rnd() * 90 - 45) });
    }
    if (fairway) {
      const fbN = Math.floor(rnd() * 3);
      for (let i = 0; i < fbN; i++) {
        const p = at(pts, 0.5 + rnd() * 0.2), side = rnd() < 0.5 ? -1 : 1, off = fairway.w / 2 + 2 + rnd() * 3;
        bunkers.push({ x: r1(clamp(p.x + p.nx * off * side, 8, 92)), y: r1(p.y + p.ny * off * side), rx: r1(3.5 + rnd() * 2.5), ry: r1(2 + rnd() * 1.5), rot: Math.round(rnd() * 60 - 30) });
      }
    }
    // Water on about one hole in five: across the line, or a pond beside it.
    let water = null;
    if (rnd() < 0.2) {
      if (par === 3 || rnd() < 0.45) {
        const p = at(pts, par === 3 ? 0.62 : 0.4 + rnd() * 0.12);
        water = { kind: "cross", x: r1(p.x), y: r1(p.y), w: par === 3 ? 34 : 46, h: r1(6 + rnd() * 4) };
      } else {
        const p = at(pts, 0.55 + rnd() * 0.25), side = rnd() < 0.5 ? -1 : 1, off = (fairway ? fairway.w / 2 : 8) + 9;
        water = { kind: "side", x: r1(clamp(p.x + p.nx * off * side, 12, 88)), y: r1(p.y + p.ny * off * side), w: r1(12 + rnd() * 6), h: r1(18 + rnd() * 10) };
      }
    }
    // Tree clumps along both edges of the hole.
    const trees = [];
    const tn = 4 + Math.floor(rnd() * 5);
    for (let i = 0; i < tn; i++) {
      const p = at(pts, 0.12 + rnd() * 0.82), side = i % 2 ? 1 : -1, off = (fairway ? fairway.w / 2 : 9) + 10 + rnd() * 8;
      const x = p.x + p.nx * off * side, y = p.y + p.ny * off * side;
      if (x < 6 || x > 94 || y < 10 || y > H - 8) continue;
      if (water && Math.hypot(x - water.x, y - water.y) < 14) continue;
      trees.push({ x: r1(x), y: r1(y), r: r1(3.5 + rnd() * 3) });
    }
    // Yardage marks: 100, 150, 200 and 250 to the middle of the green, when the card gives the hole's length.
    const marks = [];
    if (yards) [100, 150, 200, 250].forEach(d => { if (d < yards - 40) { const p = at(pts, 1 - d / yards); marks.push({ d, x: r1(p.x), y: r1(p.y), nx: p.nx, ny: p.ny }); } });
    return { W, H, par, yards, tee: { x: pts[0].x, y: TEE_Y }, path: pts, green, fairway, bunkers, water, trees, marks };
  }

  /* ---------- drawing: shapes with a slightly wobbly pencil line ---------- */
  // A closed smooth shape through points (Catmull-Rom turned into curves).
  function smooth(ps) {
    const n = ps.length; let d = `M${r1(ps[0].x)} ${r1(ps[0].y)}`;
    for (let i = 0; i < n; i++) {
      const p0 = ps[(i - 1 + n) % n], p1 = ps[i], p2 = ps[(i + 1) % n], p3 = ps[(i + 2) % n];
      d += `C${r1(p1.x + (p2.x - p0.x) / 6)} ${r1(p1.y + (p2.y - p0.y) / 6)} ${r1(p2.x - (p3.x - p1.x) / 6)} ${r1(p2.y - (p3.y - p1.y) / 6)} ${r1(p2.x)} ${r1(p2.y)}`;
    }
    return d + "Z";
  }
  function blob(x, y, rx, ry, rot, rnd, k) {
    const n = k || 9, a0 = (rot || 0) * Math.PI / 180, ps = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, j = 1 + (rnd() - 0.5) * 0.22, ex = Math.cos(a) * rx * j, ey = Math.sin(a) * ry * j;
      ps.push({ x: x + ex * Math.cos(a0) - ey * Math.sin(a0), y: y + ex * Math.sin(a0) + ey * Math.cos(a0) });
    }
    return smooth(ps);
  }
  function band(pts, from, to, w, rnd) {
    const left = [], right = [], N = 14;
    for (let i = 0; i <= N; i++) {
      const t = from + (to - from) * (i / N), p = at(pts, t);
      const taper = Math.sin(Math.PI * Math.min(1, 0.15 + 0.85 * (i / N))) * 0.35 + 0.65;
      const half = (w / 2) * taper;
      left.push({ x: p.x + p.nx * (half + (rnd() - 0.5) * 1.6), y: p.y + p.ny * (half + (rnd() - 0.5) * 1.6) });
      right.push({ x: p.x - p.nx * (half + (rnd() - 0.5) * 1.6), y: p.y - p.ny * (half + (rnd() - 0.5) * 1.6) });
    }
    return smooth(left.concat(right.reverse()));
  }

  // svg(plan, { id, title, big }): the sketch. `id` keeps the pattern names apart when two sketches share a page.
  function svg(p, o) {
    o = o || {};
    const id = String(o.id || "hm").replace(/[^a-z0-9]/gi, ""), rnd = seeded(hash(JSON.stringify(p.path)) ^ 77), ink = "#2b352d";
    const pencil = (d, fill, extra) => `<path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="0.8" stroke-linejoin="round" ${extra || ""}/>`;
    const parts = [];
    parts.push(`<defs><pattern id="${id}w" width="6" height="4" patternUnits="userSpaceOnUse"><path d="M0 2q1.5-1.6 3 0t3 0" fill="none" stroke="#5b87a0" stroke-width="0.5"/></pattern>` +
      `<pattern id="${id}s" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.35" fill="#a88f55"/></pattern>` +
      `<pattern id="${id}r" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v5" stroke="#b9c8a6" stroke-width="0.5"/></pattern></defs>`);
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#f7f3e6"/>`);
    // the rough: light diagonal hatching around the line of play
    const rough = band(p.path, 0.04, 1, (p.fairway ? p.fairway.w : 14) + 22, rnd);
    parts.push(`<path d="${rough}" fill="url(#${id}r)" stroke="none"/>`);
    if (p.water) {
      const w = p.water, d = blob(w.x, w.y, w.w / 2, w.h / 2, w.kind === "cross" ? 0 : 8, rnd, 10);
      parts.push(pencil(d, "#cfe3ec"), `<path d="${d}" fill="url(#${id}w)" stroke="none"/>`);
    }
    p.trees.forEach(t => {
      const d = blob(t.x, t.y, t.r, t.r, 0, rnd, 8);
      parts.push(pencil(d, "#b8cf9f", 'stroke-opacity="0.85"'), `<path d="M${t.x - t.r * 0.4} ${t.y}q${t.r * 0.4} -${t.r * 0.5} ${t.r * 0.8} 0" fill="none" stroke="${ink}" stroke-width="0.5" stroke-opacity="0.6"/>`);
    });
    if (p.fairway) {
      const d = band(p.path, p.fairway.from, p.fairway.to, p.fairway.w, rnd);
      parts.push(pencil(d, "#d6e7bf"));
      // a second, lighter pencil pass, the way a hand sketch goes over its own lines
      parts.push(`<path d="${band(p.path, p.fairway.from, p.fairway.to, p.fairway.w + 0.8, rnd)}" fill="none" stroke="${ink}" stroke-width="0.45" stroke-opacity="0.35"/>`);
      // mowing stripes across the fairway
      for (let t = p.fairway.from + 0.06; t < p.fairway.to - 0.04; t += 0.08) {
        const q = at(p.path, t), h = p.fairway.w * 0.38;
        parts.push(`<path d="M${r1(q.x + q.nx * h)} ${r1(q.y + q.ny * h)}L${r1(q.x - q.nx * h)} ${r1(q.y - q.ny * h)}" stroke="#bcd5a1" stroke-width="0.6"/>`);
      }
    }
    p.bunkers.forEach(b => { const d = blob(b.x, b.y, b.rx, b.ry, b.rot, rnd, 9); parts.push(pencil(d, "#f1e4bf"), `<path d="${d}" fill="url(#${id}s)" stroke="none"/>`); });
    const g = p.green;
    parts.push(pencil(blob(g.x, g.y, g.rx + 2.2, g.ry + 2.2, g.rot, rnd, 10), "#c6dfac", 'stroke-opacity="0.5"'));
    parts.push(pencil(blob(g.x, g.y, g.rx, g.ry, g.rot, rnd, 10), "#a8d08d"));
    // the flag
    parts.push(`<path d="M${g.x + 1} ${g.y + 1}V${g.y - 9}" stroke="${ink}" stroke-width="0.7"/><path d="M${g.x + 1} ${g.y - 9}l6 1.8-6 1.8z" fill="#c8102e"/><circle cx="${g.x + 1}" cy="${g.y + 1}" r="0.9" fill="${ink}"/>`);
    // the tee box
    parts.push(`<rect x="${p.tee.x - 5}" y="${p.tee.y - 3}" width="10" height="6" rx="1" fill="#c6dfac" stroke="${ink}" stroke-width="0.8" transform="rotate(${Math.round((rnd() - 0.5) * 8)} ${p.tee.x} ${p.tee.y})"/>`);
    // the line of play, dashed, the way the book pencils it in
    parts.push(`<path d="M${p.path.map(q => q.x + " " + q.y).join("L")}" fill="none" stroke="${ink}" stroke-width="0.5" stroke-dasharray="1.6 2.2" stroke-opacity="0.55"/>`);
    p.marks.forEach(m => {
      const h = (p.fairway ? p.fairway.w : 12) * 0.55;
      parts.push(`<path d="M${r1(m.x + m.nx * h)} ${r1(m.y + m.ny * h)}L${r1(m.x - m.nx * h)} ${r1(m.y - m.ny * h)}" stroke="${ink}" stroke-width="0.4" stroke-dasharray="1 1.2"/>`);
      const tx = r1(clamp(m.x + m.nx * (h + 2) * (m.x < 50 ? -1 : 1) + (m.x < 50 ? -1 : 1), 6, 94));
      parts.push(`<text x="${m.x < 50 ? Math.min(tx, m.x - h - 1) : Math.max(tx, m.x + h + 1)}" y="${r1(m.y + 2)}" font-size="${o.big ? 5.5 : 6.5}" font-family="Georgia, serif" font-style="italic" fill="${ink}" text-anchor="${m.x < 50 ? "end" : "start"}">${m.d}</text>`);
    });
    const label = o.title ? `<title>${String(o.title).replace(/[&<>"']/g, "")}</title>` : "";
    // Short holes are cut to their own length, so a par 3 fills the frame instead of floating in empty paper.
    const top = Math.max(0, Math.floor(Math.min(g.y - g.ry - 14, ...p.trees.map(t => t.y - t.r - 2), p.water ? p.water.y - p.water.h / 2 - 2 : H)));
    return `<svg class="holemap" viewBox="0 ${top} ${W} ${H - top}" role="img" preserveAspectRatio="xMidYMid meet">${label}${parts.join("")}</svg>`;
  }

  return { plan, svg, at, hash };
});
