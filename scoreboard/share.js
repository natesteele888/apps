/* Scoreboard sharing: copy the result as plain text, and draw the finished board as a PNG picture. */
(function () {
  "use strict";
  const SB = window.SB, C = SB.C, esc = SB.esc;

  SB.copyText = async function (text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy"); ta.remove(); return !!ok;
    } catch (e) { return false; }
  };
  /* "Share result": copies the text; if the browser won't, shows it in a box to copy by hand */
  SB.shareResult = async function (g, status) {
    const text = C.resultText(g, status);
    if (await SB.copyText(text)) return SB.toast("Copied. Paste it into a message.", "ok");
    SB.openSheet({
      title: "Copy the result", html: '<p class="msg">This browser would not copy for you. Press and hold the text, select all, then copy.</p><textarea class="copybox" readonly rows="5" aria-label="Result text">' + esc(text) + "</textarea>",
      footer: '<button type="button" class="btn" data-close>Done</button>', autofocus: ".copybox"
    });
  };

  const FONT = '"Barlow Condensed","Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif';
  function fit(x, text, weight, size, maxW) {
    for (; size > 14; size -= 2) { x.font = weight + " " + size + "px " + FONT; if (x.measureText(text).width <= maxW) break; }
    return size;
  }
  /* the board as a 1280x720 picture: names, scores, status, and the line score underneath */
  SB.drawResult = function (g, status) {
    const W = 1280, H = 720, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const x = cv.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
    x.strokeStyle = "#26313f"; x.lineWidth = 3; x.strokeRect(14, 14, W - 28, H - 28);
    const info = C.sportInfo(g.sport), ls = C.lineScore(g);
    x.textBaseline = "alphabetic";
    x.fillStyle = "#9db0c3"; x.textAlign = "left"; x.font = "700 34px " + FONT;
    x.fillText((info.label + "  ·  " + C.fmtDate(g.date)).toUpperCase(), 56, 74);
    x.fillStyle = "#f2f6fa"; x.textAlign = "right"; x.font = "700 40px " + FONT;
    x.fillText(C.statusText(g, status || "final").toUpperCase(), W - 56, 74);
    const cx = [W * 0.27, W * 0.73], nameY = ls ? 190 : 250, scoreBase = ls ? 470 : 560;
    [0, 1].forEach(i => {
      const t = g.teams[i], nm = t.n.toUpperCase();
      x.fillStyle = t.c; x.textAlign = "center";
      const ns = fit(x, nm, 700, 84, 520); x.font = "700 " + ns + "px " + FONT; x.fillText(nm, cx[i], nameY);
      const sc = String(g.score[i]), ss = fit(x, sc, 700, ls ? 330 : 420, 540);
      x.font = "700 " + ss + "px " + FONT; x.fillText(sc, cx[i], scoreBase);
    });
    x.fillStyle = "#26313f"; x.fillRect(W / 2 - 1, 130, 3, ls ? 360 : 480);
    if (ls) {
      const n = ls.cols.length, nameW = 230, extra = ls.hasHE ? 3 : 1, left = 90, avail = W - 2 * left - nameW;
      const cw = Math.min(78, avail / (n + extra + 0.5));
      const top = 520, rh = 52;
      x.font = "700 30px " + FONT; x.textAlign = "center"; x.fillStyle = "#9db0c3";
      const heads = ls.cols.concat(ls.hasHE ? ["R", "H", "E"] : ["T"]);
      heads.forEach((h, k) => x.fillText(h, left + nameW + (k + 0.5) * cw + (k >= n ? 0.5 * cw : 0), top));
      ls.rows.forEach((r, ri) => {
        const y = top + rh * (ri + 1) - 6;
        x.fillStyle = g.teams[r.team].c; x.textAlign = "left"; x.font = "700 34px " + FONT;
        const nm = r.name.toUpperCase(); fit(x, nm, 700, 34, nameW - 12); x.fillText(nm, left, y);
        x.textAlign = "center"; x.fillStyle = "#f2f6fa";
        const cells = r.cells.concat(ls.hasHE ? [String(r.r), String(r.h), String(r.e)] : [String(r.r)]);
        x.font = "700 36px " + FONT;
        cells.forEach((c, k) => x.fillText(c, left + nameW + (k + 0.5) * cw + (k >= n ? 0.5 * cw : 0), y));
      });
    }
    x.fillStyle = "#5d7288"; x.textAlign = "right"; x.font = "600 22px " + FONT;
    x.fillText(C.VERSION.toUpperCase(), W - 56, H - 36);
    return cv;
  };
  SB.sharePicture = async function (g, status) {
    let blob;
    try {
      const cv = SB.drawResult(g, status);
      blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("no blob")), "image/png"));
    } catch (e) { return SB.toast("Couldn't make the picture on this browser.", "error"); }
    const name = "scoreboard-" + g.date + ".png";
    try {
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: C.summary(g) });
        return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; /* otherwise download instead */ }
    SB.downloadBlob(blob, name);
    SB.toast("Picture saved as " + name, "ok");
  };
})();
