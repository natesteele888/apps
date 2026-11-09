/* Get Ready: the full-screen "you're ready!" celebration.
   Built-in: animated dancers drawn on a canvas (five dances, random backdrop, random number of dancers), with confetti.
   Works offline. Your own GIFs (added in More) are mixed into the same random pick. */
(function (root) {
  "use strict";
  const X = {};
  X.STYLES = ["disco", "jacks", "floss", "roof", "twirl", "twerk", "griddy"];
  X.NAMES = { disco: "Disco", jacks: "Jumping jacks", floss: "The floss", roof: "Raise the roof", twirl: "Twirl", twerk: "Twerk", griddy: "The Griddy" };
  const BG = [["#020617", "#1d4ed8"], ["#000000", "#0a58ff"], ["#071733", "#38a1ff"], ["#050505", "#2563eb"], ["#0a1f4d", "#60a5fa"]];
  const CONF = ["#ffffff", "#2f8cff", "#60a5fa", "#93c5fd", "#1d4ed8", "#ffd84d"];
  const TAU = Math.PI * 2;

  /* Joint angles in degrees measured from "hanging straight down", positive towards the right of the screen. */
  X.pose = (style, t) => {
    const b = t * TAU * 2, s = Math.sin(b), c = Math.cos(b);
    const p = { ra: 20, la: -20, re: 12, le: -12, rh: 6, lh: -6, rk: 0, lk: 0, dx: 0, dy: 0, rot: 0, sx: 1 };
    if (style === "disco") { p.ra = 90 + 72 * s; p.la = -(90 - 72 * s); p.re = 8; p.le = -8; p.dx = 10 * s; p.dy = 5 * Math.abs(c); p.rh = 8 + 6 * s; p.lh = -8 + 6 * s; p.rk = 14 * Math.abs(c); p.lk = 14 * Math.abs(c); }
    else if (style === "jacks") { const a = (1 + c) / 2; p.ra = 15 + 150 * a; p.la = -p.ra; p.rh = 5 + 24 * a; p.lh = -p.rh; p.dy = -16 * a; p.re = 6; p.le = -6; }
    else if (style === "floss") { p.ra = -65 * s + 10; p.la = -65 * s - 10; p.re = 22; p.le = -22; p.dx = 30 * s; p.rot = 7 * s; p.rh = 10; p.lh = -10; p.rk = 18 * Math.abs(c); p.lk = 18 * Math.abs(c); p.dy = 6 * Math.abs(c); }
    else if (style === "roof") { p.ra = 145; p.la = -145; p.re = 55 * s; p.le = 55 * -s; p.rh = 16; p.lh = -16; p.rk = 28 * Math.abs(s); p.lk = 28 * Math.abs(s); p.dy = 12 * Math.abs(s); }
    else if (style === "twerk") { // deep squat, hands on knees, fast hip shake and bounce
      const f = Math.sin(b * 2.5); p.ra = 38; p.la = -38; p.re = 18; p.le = -18; p.rh = 30; p.lh = -30; p.rk = 52; p.lk = 52; p.dy = 10 + 7 * Math.abs(f); p.dx = 14 * f; p.rot = 12 * f;
    }
    else if (style === "griddy") { // arms out like wings, quick alternating foot shuffles
      p.ra = 98 + 22 * c; p.la = -(98 - 22 * c); p.re = 20; p.le = -20; p.rh = 10 + 30 * Math.max(0, s); p.lh = -(10 + 30 * Math.max(0, -s)); p.rk = 20 * Math.max(0, s); p.lk = 20 * Math.max(0, -s); p.dx = 8 * s; p.dy = 6 * Math.abs(c); p.rot = 5 * c;
    }
    else { p.ra = 105; p.la = -105; p.re = 10; p.le = -10; p.sx = Math.cos(t * 3.4); p.dy = -22 * Math.abs(Math.sin(b / 2)); p.rh = 12 + 10 * s; p.lh = -(12 + 10 * s); }
    return p;
  };

  function seg(ctx, x, y, deg, len) { const r = deg * Math.PI / 180; return [x + Math.sin(r) * len, y + Math.cos(r) * len]; }
  function line(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }

  function figure(ctx, t, style, cx, cy, sc, body, shoe) {
    const p = X.pose(style, t);
    ctx.save();
    ctx.translate(cx + p.dx * sc, cy + p.dy * sc);
    ctx.rotate(p.rot * Math.PI / 180);
    ctx.scale(sc * (Math.abs(p.sx) < 0.08 ? 0.08 * Math.sign(p.sx || 1) : p.sx), sc);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = body; ctx.fillStyle = body; ctx.lineWidth = 11;
    // legs: hips at the bottom of the torso, feet below. Knees bend back towards the middle.
    [[1, p.rh, p.rk], [-1, p.lh, p.lk]].forEach(([side, th, kn]) => {
      const hip = [side * 7, 0], knee = seg(ctx, hip[0], hip[1], th, 46), foot = seg(ctx, knee[0], knee[1], th - side * kn, 44);
      line(ctx, [hip, knee, foot]);
      ctx.save(); ctx.strokeStyle = shoe; ctx.lineWidth = 13; line(ctx, [foot, [foot[0] + side * 12, foot[1]]]); ctx.restore();
    });
    // torso, then arms from the shoulders
    ctx.lineWidth = 15; line(ctx, [[0, 2], [0, -58]]);
    ctx.lineWidth = 10;
    [[1, p.ra, p.re], [-1, p.la, p.le]].forEach(([side, sh, el]) => {
      const s0 = [side * 8, -54], elbow = seg(ctx, s0[0], s0[1], sh, 36), hand = seg(ctx, elbow[0], elbow[1], sh + el, 34);
      line(ctx, [s0, elbow, hand]);
      ctx.beginPath(); ctx.arc(hand[0], hand[1], 7, 0, TAU); ctx.fill();
    });
    // head with a big smile
    ctx.beginPath(); ctx.arc(0, -80, 19, 0, TAU); ctx.fill();
    if (Math.abs(p.sx) > 0.35) {
      ctx.strokeStyle = shoe; ctx.fillStyle = shoe; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.arc(0, -77, 10, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(-6.5, -84, 2.6, 0, TAU); ctx.arc(6.5, -84, 2.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* One-time sound: a short rising fanfare. Quiet failure if the phone won't play it. */
  X.fanfare = () => {
    try {
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
      const ctx = new AC(), t0 = ctx.currentTime;
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        const t = t0 + i * 0.14; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.start(t); o.stop(t + 0.32);
      });
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 2500);
    } catch (e) {}
  };

  /* Builds the full-screen element. opts: { style, gif (an image address), rnd, sound, close() }.
     Returns { el, stop() }. */
  X.build = opts => {
    const rnd = opts.rnd || Math.random;
    const el = document.createElement("div");
    el.className = "celebrate"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "You're ready for school!");
    el.innerHTML = '<div class="cel-msg"><b>You\'re ready!</b><span>Have a great day at school 🎒</span></div><button class="cel-go" type="button">Let\'s go!</button>';
    let raf = 0, stopped = false;
    const still = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mountCanvas = style => {
      const cv = document.createElement("canvas"); cv.className = "cel-cv"; el.insertBefore(cv, el.firstChild);
      const ctx = cv.getContext("2d"), bg = BG[Math.floor(rnd() * BG.length)], n = 1 + Math.floor(rnd() * 3);
      const bodies = ["#ffffff", "#bfdbfe", "#ffffff"], dancers = [];
      for (let i = 0; i < n; i++) dancers.push({ st: i === 0 ? style : X.STYLES[Math.floor(rnd() * X.STYLES.length)], ph: i * 0.17, body: bodies[i % 3] });
      const bits = []; let W = 0, H = 0, dpr = 1;
      const size = () => {
        dpr = Math.min(2, root.devicePixelRatio || 1); W = el.clientWidth || root.innerWidth; H = el.clientHeight || root.innerHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      };
      size(); root.addEventListener("resize", size);
      for (let i = 0; i < 90; i++) bits.push({ x: rnd(), y: rnd(), v: 0.05 + rnd() * 0.12, r: 4 + rnd() * 6, c: CONF[Math.floor(rnd() * CONF.length)], a: rnd() * TAU, w: 1 + rnd() * 3 });
      const start = performance.now();
      const frame = now => {
        if (stopped) return;
        const t = (now - start) / 1000;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // floor glow
        const floor = H * 0.72; ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(0, floor, W, H - floor);
        ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(0, floor, W, 2);
        bits.forEach(b => {
          const y = ((b.y + t * b.v) % 1) * H, x = b.x * W + Math.sin(t * b.w + b.a) * 18;
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * b.w + b.a); ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); ctx.restore();
        });
        const sc = Math.min(H * 0.42 / 190, W / (n * 130));
        dancers.forEach((d, i) => figure(ctx, t + d.ph, d.st, W * (i + 0.5) / n, floor - 4 * sc, sc, d.body, "#2f8cff"));
        if (!still) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      el._cleanup = () => root.removeEventListener("resize", size);
    };
    if (opts.gif) {
      const img = document.createElement("img"); img.className = "cel-gif"; img.alt = "";
      img.onerror = () => { img.remove(); mountCanvas(opts.style || X.STYLES[0]); };
      img.src = opts.gif; el.insertBefore(img, el.firstChild);
    } else mountCanvas(opts.style || X.STYLES[Math.floor(rnd() * X.STYLES.length)]);
    el.querySelector(".cel-go").onclick = () => opts.close && opts.close();
    if (opts.sound) X.fanfare();
    try { if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 120]); } catch (e) {}
    return { el, stop: () => { stopped = true; cancelAnimationFrame(raf); if (el._cleanup) el._cleanup(); } };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = X; else root.GRCelebrate = X;
})(typeof window !== "undefined" ? window : globalThis);
