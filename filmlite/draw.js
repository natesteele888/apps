/* Film Lite drawing: draws saved strokes (vector data, 0 to 1 coordinates) at any size, and the pen/arrow/circle/line/angle editor. */
(function () {
  "use strict";
  const FL = window.FL, C = FL.C;
  const clamp = C.clamp;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function addPath(ctx, s, pts, lw, mx) {
    ctx.beginPath();
    if (s.k === "pen") {
      if (pts.length === 1) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[0][0] + 0.01, pts[0][1]); return; }
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    } else if (s.k === "line" || s.k === "arrow") {
      ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]);
      if (s.k === "arrow") {
        const ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]), hl = Math.max(lw * 4, mx * 0.04);
        for (let sgn = -1; sgn <= 1; sgn += 2) { ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[1][0] - hl * Math.cos(ang + sgn * 0.5), pts[1][1] - hl * Math.sin(ang + sgn * 0.5)); }
      }
    } else if (s.k === "circle") {
      const r = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      ctx.arc(pts[0][0], pts[0][1], Math.max(1, r), 0, Math.PI * 2);
    } else if (s.k === "angle") {
      ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[3][0], pts[3][1]);
    }
  }
  /* Draw strokes onto ctx for a W x H frame. ar = frame width / height (so angles measure true). */
  function render(ctx, W, H, strokes, ar) {
    const mx = Math.max(W, H);
    ar = ar > 0 ? ar : W / H;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    strokes.forEach(s => {
      const lw = Math.max(2, C.WIDTHS[s.w] * mx), col = C.COLORS[s.c];
      const pts = s.p.map(p => [p[0] * W, p[1] * H]);
      addPath(ctx, s, pts, lw, mx); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = lw + Math.max(2, lw * 0.7); ctx.stroke();
      addPath(ctx, s, pts, lw, mx); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
      if (s.k === "angle") {
        const a = C.strokeAngle(s.p, ar), txt = Math.round(a.deg) + "°", fs = Math.max(13, Math.round(mx * 0.04));
        let lx, ly;
        if (a.joined) {
          const v = [a.vertex[0] * W, a.vertex[1] * H], a1 = [a.arms[0][0] * W - v[0], a.arms[0][1] * H - v[1]], a2 = [a.arms[1][0] * W - v[0], a.arms[1][1] * H - v[1]];
          const r = Math.max(mx * 0.05, lw * 3), t1 = Math.atan2(a1[1], a1[0]), t2 = Math.atan2(a2[1], a2[0]);
          let diff = t2 - t1; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
          ctx.beginPath(); ctx.arc(v[0], v[1], r, t1, t1 + diff, diff < 0); ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, lw * 0.7); ctx.stroke();
          const l1 = Math.hypot(a1[0], a1[1]) || 1, l2 = Math.hypot(a2[0], a2[1]) || 1;
          let bx = a1[0] / l1 + a2[0] / l2, by = a1[1] / l1 + a2[1] / l2, bl = Math.hypot(bx, by);
          if (bl < 0.2) { bx = -a1[1] / l1; by = a1[0] / l1; bl = 1; }
          const off = r + fs * 1.1;
          lx = v[0] + bx / bl * off; ly = v[1] + by / bl * off;
        } else { lx = (pts[2][0] + pts[3][0]) / 2; ly = (pts[2][1] + pts[3][1]) / 2 - fs; }
        ctx.font = "800 " + fs + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const tw = ctx.measureText(txt).width, bw = tw + fs * 0.8, bh = fs * 1.5;
        lx = clamp(lx, bw / 2 + 2, W - bw / 2 - 2); ly = clamp(ly, bh / 2 + 2, H - bh / 2 - 2);
        ctx.fillStyle = "rgba(13,12,26,.82)"; roundRect(ctx, lx - bw / 2, ly - bh / 2, bw, bh, bh / 3); ctx.fill();
        ctx.fillStyle = col; ctx.fillText(txt, lx, ly + 1);
      }
    });
    ctx.restore();
  }
  /* Make the canvas bitmap match how big it is on screen (sharp on a phone). Returns {W, H}. */
  function fitCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.max(1, Math.round(cv.clientWidth * dpr)), H = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    return { W: W, H: H };
  }
  function show(cv, strokes, ar) {
    const s = fitCanvas(cv), ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, s.W, s.H);
    if (strokes && strokes.length) render(ctx, s.W, s.H, strokes, ar);
  }
  function blank(cv) {
    try {
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
    } catch (e) { return false; }
    return true;
  }

  /* The drawing editor on top of the paused frame. */
  function Editor(cv, o) {
    const E = { strokes: (o.strokes || []).map(s => JSON.parse(JSON.stringify(s))), tool: "pen", color: 0, width: 1, pending: null, cur: null, ar: o.ar || 16 / 9 };
    const snapTol = () => 0.042 * Math.max(E.ar, 1);
    function pt(e) {
      const r = cv.getBoundingClientRect();
      return [Math.round(clamp((e.clientX - r.left) / (r.width || 1), 0, 1) * 10000) / 10000, Math.round(clamp((e.clientY - r.top) / (r.height || 1), 0, 1) * 10000) / 10000];
    }
    const sd = (a, b) => Math.hypot((a[0] - b[0]) * E.ar, a[1] - b[1]);
    function shown() {
      const out = E.strokes.slice();
      if (E.pending && !E.cur) out.push({ k: "line", c: E.color, w: E.width, p: E.pending });
      if (E.cur) {
        const c = E.cur;
        if (c.k === "angle") out.push(E.pending ? { k: "angle", c: c.c, w: c.w, p: E.pending.concat(c.p) } : { k: "line", c: c.c, w: c.w, p: c.p });
        else out.push(c);
      }
      return out;
    }
    function redraw() { show(cv, shown(), E.ar); }
    function changed() { redraw(); if (o.onChange) o.onChange(E); }
    function commit(s) {
      if (E.strokes.length >= C.MAX_STROKES) { if (o.onFull) o.onFull(); return false; }
      E.strokes.push(s); return true;
    }
    function down(e) {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      let p = pt(e);
      if (E.tool === "angle" && E.pending) { // the second line starts on the corner if you start near an end of the first
        let best = null;
        E.pending.forEach(q => { const d = sd(p, q); if (d <= snapTol() && (!best || d < best.d)) best = { d: d, q: q }; });
        if (best) p = best.q.slice();
      }
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      E.cur = { k: E.tool, c: E.color, w: E.width, p: [p, p.slice()], pid: e.pointerId };
      if (E.tool === "pen") E.cur.p = [p];
      changed();
    }
    function move(e) {
      const c = E.cur; if (!c || e.pointerId !== c.pid) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (evs.length ? evs : [e]).forEach(ev => {
        const p = pt(ev);
        if (c.k === "pen") { const l = c.p[c.p.length - 1]; if (sd(p, l) > 0.004 && c.p.length < 400) c.p.push(p); }
        else c.p[1] = p;
      });
      redraw();
    }
    function up(e) {
      const c = E.cur; if (!c || (e && e.pointerId !== c.pid)) return;
      E.cur = null;
      const len = c.p.length > 1 ? sd(c.p[0], c.p[c.p.length - 1]) : 0;
      if (c.k === "pen") commit({ k: "pen", c: c.c, w: c.w, p: c.p });
      else if (c.k === "angle") {
        if (len > 0.02) { if (E.pending) { if (commit({ k: "angle", c: c.c, w: c.w, p: E.pending.concat(c.p) })) E.pending = null; } else E.pending = c.p; }
      } else if (len > 0.012) commit({ k: c.k, c: c.c, w: c.w, p: c.p });
      changed();
    }
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    E.setTool = t => { E.tool = t; E.pending = null; E.cur = null; changed(); };
    E.setColor = i => { E.color = i; changed(); };
    E.setWidth = i => { E.width = i; changed(); };
    E.undo = () => { if (E.pending) E.pending = null; else E.strokes.pop(); E.cur = null; changed(); };
    E.clear = () => { E.strokes = []; E.pending = null; E.cur = null; changed(); };
    E.redraw = redraw;
    E.hint = () => {
      if (E.tool === "angle") return E.pending ? "Now drag the second line. Start at the end of the first to measure the corner." : "Drag the first line. Then drag a second one to see the angle between them.";
      return { pen: "Draw with your finger or mouse.", arrow: "Drag to draw an arrow.", circle: "Drag from the middle outward to circle something.", line: "Drag to draw a straight line." }[E.tool];
    };
    E.destroy = () => {
      cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up); cv.removeEventListener("pointercancel", up);
      const s = fitCanvas(cv); cv.getContext("2d").clearRect(0, 0, s.W, s.H);
    };
    redraw();
    return E;
  }

  /* The current video frame plus the strokes, as a PNG. The video is a local file, so the canvas is never "tainted". */
  function exportPng(video, strokes) {
    return new Promise((res, rej) => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return rej(new Error("noframe"));
      const sc = Math.min(1, 1920 / Math.max(vw, vh)), cv = document.createElement("canvas");
      cv.width = Math.round(vw * sc); cv.height = Math.round(vh * sc);
      const ctx = cv.getContext("2d");
      try { ctx.drawImage(video, 0, 0, cv.width, cv.height); } catch (e) { return rej(e); }
      if (strokes && strokes.length) render(ctx, cv.width, cv.height, strokes, vw / vh);
      cv.toBlob(b => b ? res(b) : rej(new Error("encode")), "image/png");
    });
  }

  FL.Draw = { render: render, show: show, fitCanvas: fitCanvas, blank: blank, Editor: Editor, exportPng: exportPng };
})();
