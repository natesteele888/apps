/* Film Lite example clip: a short bouncing-ball video made on the phone itself (nothing downloaded),
   so there is something to try before choosing a real video. */
(function () {
  "use strict";
  const FL = window.FL, C = FL.C;
  const W = 640, H = 360, FPS = 30, SECS = 3.6;
  const R = 0.065; // ball radius as a fraction of the frame height

  /* where the ball is at time t, as fractions of the frame (0 to 1) */
  function ballAt(t) {
    return { x: 0.5 + 0.36 * Math.sin(2 * Math.PI * t / SECS), y: 0.8 - 0.5 * Math.abs(Math.sin(Math.PI * t / 0.9)) };
  }
  function drawFrame(ctx, t) {
    const n = Math.floor(t * FPS + 1e-6);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2b2870"); g.addColorStop(1, "#0f0e22");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(176,168,255,.16)"; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const floorY = (0.8 + R) * H;
    ctx.fillStyle = "#1c1a45"; ctx.fillRect(0, floorY, W, H - floorY);
    ctx.fillStyle = "#7a6cff"; ctx.fillRect(0, floorY, W, 3);
    const b = ballAt(t), bx = b.x * W, by = b.y * H, r = R * H;
    const lift = (0.8 - b.y) / 0.5; // 0 on the floor, 1 at the top of the bounce
    ctx.fillStyle = "rgba(0,0,0," + (0.45 - 0.25 * lift).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(bx, floorY + 10, r * (1.25 - 0.5 * lift), r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    const rg = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r);
    rg.addColorStop(0, "#ffd9a0"); rg.addColorStop(0.45, "#ff8a3d"); rg.addColorStop(1, "#c4410f");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(14, 14, 190, 64);
    ctx.fillStyle = "#fff"; ctx.font = "700 30px ui-monospace, Menlo, Consolas, monospace"; ctx.textBaseline = "top";
    ctx.fillText("FRAME " + (n < 10 ? "00" : n < 100 ? "0" : "") + n, 24, 20);
    ctx.fillStyle = "#b0a8ff"; ctx.font = "600 20px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(t.toFixed(2) + " s  (30 fps)", 24, 52);
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(0, H - 6, W, 6);
    ctx.fillStyle = "#7a6cff"; ctx.fillRect(0, H - 6, W * Math.min(1, t / SECS), 6);
  }
  function pickMime() {
    const list = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    for (let i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { /* next */ } }
    return "";
  }
  /* Record about 3.6 seconds of the animation. Rejects with Error("unsupported") when this browser can't record a canvas. */
  function make(onProgress) {
    return new Promise((resolve, reject) => {
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return reject(new Error("unsupported"));
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      let stream, rec, timer = 0, killer = 0, done = false;
      const fail = e => { if (done) return; done = true; clearInterval(timer); clearTimeout(killer); try { stream && stream.getTracks().forEach(t => t.stop()); } catch (x) { /* ignore */ } reject(e instanceof Error ? e : new Error("record")); };
      try {
        drawFrame(ctx, 0);
        stream = cv.captureStream(FPS);
        const mime = pickMime();
        rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : { videoBitsPerSecond: 2500000 });
        const chunks = [];
        rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.onerror = () => fail(new Error("record"));
        rec.onstop = () => {
          if (done) return; done = true; clearInterval(timer); clearTimeout(killer);
          try { stream.getTracks().forEach(t => t.stop()); } catch (x) { /* ignore */ }
          const blob = new Blob(chunks, { type: rec.mimeType || mime || "video/webm" });
          blob.size ? resolve(blob) : reject(new Error("empty"));
        };
        rec.start();
        const t0 = performance.now();
        timer = setInterval(() => {
          const t = (performance.now() - t0) / 1000;
          if (t >= SECS) { clearInterval(timer); drawFrame(ctx, SECS - 0.001); setTimeout(() => { try { rec.stop(); } catch (e) { fail(e); } }, 120); return; }
          drawFrame(ctx, t);
          if (onProgress) onProgress(Math.min(1, t / SECS));
        }, 1000 / FPS);
        killer = setTimeout(() => fail(new Error("timeout")), 15000);
      } catch (e) { fail(e); }
    });
  }
  /* A single frame for browsers that can't record. */
  function still() {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    drawFrame(cv.getContext("2d"), 1.2);
    return cv;
  }
  /* Three sample tags: a good moment, a segment with an angle drawn on it, and a question circled on the frame. */
  function tags() {
    const ar = W / H, a = ballAt(1.5), c = ballAt(2.9);
    return [
      { t: 0.7, cat: "good", note: "Nice and steady. The ball starts high and moves smoothly." },
      { t: 1.5, e: 2.4, cat: "fix", note: "Watch the drop. It speeds up here. The angle shows how steep the path is.",
        d: { ar: ar, s: [{ k: "angle", c: 0, w: 1, p: [[a.x + 0.2, a.y], [a.x, a.y], [a.x, a.y], [a.x + 0.17, a.y + 0.18]] }] } },
      { t: 2.9, cat: "question", note: "Why does the ball slow down near the top? Circled so it's easy to find again.",
        d: { ar: ar, s: [{ k: "circle", c: 1, w: 1, p: [[c.x, c.y], [c.x + 0.1, c.y]] }, { k: "arrow", c: 0, w: 1, p: [[Math.min(0.9, c.x + 0.28), Math.max(0.1, c.y - 0.12)], [c.x + 0.11, c.y - 0.03]] }] } }
    ].map((x, i) => Object.assign({ id: "ex" + (i + 1) + "tag" }, x));
  }
  FL.Example = { make: make, still: still, tags: tags, ballAt: ballAt, drawFrame: drawFrame, SECS: SECS, W: W, H: H, FPS: FPS };
})();
