/* Practice Clock runner: the big countdown, the controls, the chime / flash / vibration, wake lock.
   Time always comes from the clock (see core.js), never from counting ticks. The timer here only decides when to look again. */
(function () {
  "use strict";
  const PC = window.PCApp, Core = PC.Core, S = PC.S, I = PC.I, $ = PC.$, esc = PC.esc;
  const sr = () => S.run;

  /* ================= sound ================= */
  const audio = {
    ctx: null, unsupported: false,
    unlock() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.unsupported = true; return false; }
        if (!this.ctx) { this.ctx = new AC(); try { this.ctx.onstatechange = () => updateStat(); } catch (e) { /* ignore */ } }
        if (this.ctx.state !== "running") { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
        // iPhones only wake the audio system for a sound started inside a tap, so play a silent blip here
        const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
        return true;
      } catch (e) { return false; }
    },
    running() { return !!this.ctx && this.ctx.state === "running"; },
    vol() { return Math.pow(S.settings.volume / 100, 1.7) * 0.85; },
    tone(freq, at, dur, peak) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(c.destination); o.start(at); o.stop(at + dur + 0.05);
    },
    chime(kind) {
      if (!this.ctx || S.settings.volume <= 0) return;
      try {
        if (this.ctx.state !== "running") { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
        const t = this.ctx.currentTime + 0.03, v = this.vol();
        if (kind === "finish") [660, 880, 1175].forEach((f, i) => this.tone(f, t + i * 0.2, 0.5, v));
        else { this.tone(880, t, 0.3, v); this.tone(1175, t + 0.22, 0.55, v); }
      } catch (e) { /* ignore */ }
    },
    tick() {
      if (!this.ctx || S.settings.volume <= 0) return;
      try { this.tone(1000, this.ctx.currentTime + 0.01, 0.07, this.vol() * 0.5); } catch (e) { /* ignore */ }
    }
  };
  PC.audio = audio;

  /* ================= screen wake lock ================= */
  const wake = { lock: null, state: "idle" };
  async function acquireWake() {
    if (!S.settings.awake || !sr() || sr().finished) return;
    if (!navigator.wakeLock || !navigator.wakeLock.request) { wake.state = "unsupported"; updateStat(); return; }
    if (wake.lock && !wake.lock.released) return;
    try {
      wake.lock = await navigator.wakeLock.request("screen"); wake.state = "on";
      wake.lock.addEventListener("release", () => { wake.state = "idle"; updateStat(); });
    } catch (e) { wake.state = "failed"; }
    updateStat();
  }
  function releaseWake() { try { if (wake.lock && wake.lock.release) wake.lock.release(); } catch (e) { /* ignore */ } wake.lock = null; wake.state = "idle"; }
  PC.onSettingsChanged = function () { if (S.settings.awake) acquireWake(); else { releaseWake(); updateStat(); } updateStat(); };

  /* ================= alerts ================= */
  function flash() {
    const f = $("#rflash"); if (!f) return;
    f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
    setTimeout(() => f.classList.remove("go"), 900);
  }
  let bannerTimer = 0;
  function banner(title, sub) {
    let b = $("#rbanner");
    if (!b) { b = document.createElement("div"); b.id = "rbanner"; b.className = "rbanner"; b.setAttribute("role", "status"); document.body.appendChild(b); }
    b.innerHTML = "<b>" + esc(title) + "</b><span>" + esc(sub) + "</span>";
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { const x = $("#rbanner"); if (x) x.remove(); }, 4500);
  }
  function buzz(pattern) { try { if (S.settings.vibrate && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  const segLabel = s => (s.kind === "station" ? "Station " + s.station + " of " + s.stations + (s.label ? " · " + s.label : "") : s.name);
  const durText = ms => (ms % 60000 === 0 ? ms / 60000 + " min" : Core.fmtClock(ms));
  function announce(prev, cur) {
    const rotate = prev && prev.bi === cur.bi;
    audio.chime("block"); buzz([250, 100, 250]);
    flash();
    banner(rotate ? "Rotate now" : "Next block", rotate ? segLabel(cur) : (cur.kind === "station" ? cur.name + ": " + segLabel(cur) : cur.name));
    live(nowText(cur));
  }
  const nowText = cur => "Now: " + (cur.kind === "station" ? cur.name + ", " + segLabel(cur) : cur.name);
  // The spoken message is written after the screen is redrawn, because a redraw replaces the live region.
  let liveMsg = "";
  function live(t) { liveMsg = t; }
  function flushLive() { const t = liveMsg; liveMsg = ""; const n = t && $("#r-live"); if (n) n.textContent = t; }

  /* ================= run state ================= */
  const last = { seg: -1, hold: false, sec: -1, fin: false, paused: false };
  let timer = 0;
  function snap() {
    if (!sr()) return;
    const pos = Core.runPos(sr(), Date.now());
    last.seg = pos.segIndex; last.hold = sr().holding; last.fin = sr().finished; last.sec = -1; last.paused = sr().pausedAt != null;
  }
  function finalizeRun() {
    if (!sr() || !sr().finished || sr().logged) return;
    S.hist = Core.addLog(S.hist, Core.makeLog(sr(), Date.now()));
    S.run = Object.assign({}, sr(), { logged: true });
    PC.saveData(); PC.saveRun(); releaseWake();
  }
  function begin(plan) {
    audio.unlock();
    S.run = Core.newRun(plan, Date.now(), PC.today());
    PC.saveRun(); snap();
    acquireWake();
    PC.go("runner");
    tick();
  }
  PC.startRun = function (plan) {
    if (!plan.blocks.length) { PC.toast("Add at least one block first.", "error"); return; }
    if (sr() && !sr().finished) {
      PC.confirmSheet({
        title: "A practice is already running", message: "“" + sr().plan.name + "” is still on the clock. Start “" + plan.name + "” instead? The one running now will be ended and saved.",
        confirmText: "End it and start this one", danger: true,
        onConfirm() { S.run = Core.endRun(sr(), Date.now()); finalizeRun(); begin(plan); }
      });
      return;
    }
    begin(plan);
  };
  PC.runnerBoot = function () {
    if (!sr()) return;
    S.run = Core.settle(sr(), Date.now());
    finalizeRun(); PC.saveRun(); snap(); acquireWake(); tick();
  };
  // run something that changes the practice, save it, redraw, and don't treat the change as time passing
  function apply(fn) {
    if (!sr()) return;
    const now = Date.now(), before = { seg: last.seg, paused: last.paused };
    S.run = Core.settle(fn(sr(), now), now);
    PC.saveRun(); finalizeRun(); snap();
    if (!sr().finished) {
      if (last.seg !== before.seg) live(nowText(Core.runPos(sr(), now).seg));
      else if (last.paused !== before.paused) live(last.paused ? "Paused." : "Running.");
    }
    if (S.view === "runner") PC.render();
    tick();
  }

  /* ================= the tick ================= */
  function tick() {
    clearTimeout(timer); timer = 0;
    if (!sr()) return;
    const now = Date.now(), settled = Core.settle(sr(), now);
    if (settled !== sr()) { S.run = settled; PC.saveRun(); }
    if (sr().finished && !sr().logged) finalizeRun();
    const run = sr(), pos = Core.runPos(run, now), segs = Core.segments(run.plan, run.adj);
    let structural = false;
    if (run.finished) {
      if (!last.fin) { last.fin = true; last.hold = false; structural = true; if (run.endReason === "done") { audio.chime("finish"); buzz([300, 120, 300, 120, 300]); flash(); banner("Practice done", run.plan.name); live("Practice finished."); } }
    } else if (run.holding) {
      if (!last.hold) {
        last.hold = true; last.seg = pos.segIndex; last.paused = true; structural = true;
        const done = segs[Math.max(0, run.ack)];
        audio.chime("block"); buzz([250, 100, 250]); flash(); banner("Block done", done ? segLabel(done) : "");
        live("Block done. Tap to start the next one.");
      }
    } else {
      if (last.hold) { last.hold = false; structural = true; }
      if ((run.pausedAt != null) !== last.paused) { last.paused = run.pausedAt != null; structural = true; }
      if (pos.segIndex !== last.seg) {
        const prev = segs[last.seg] || null; last.seg = pos.segIndex; last.sec = -1; structural = true;
        announce(prev, pos.seg);
      }
      if (S.settings.ticks && run.pausedAt == null) {
        const sec = Math.ceil(pos.remainingMs / 1000);
        if (sec >= 1 && sec <= 3 && last.sec !== sec) { last.sec = sec; audio.tick(); }
      }
    }
    if (S.view === "runner") { if (structural) PC.render(); else updateDom(pos, now); }
    flushLive();
    if (!run.finished) {
      let delay = 1000;
      if (run.pausedAt == null) { const m = Math.floor((pos.remainingMs - 1) / 1000) * 1000; delay = Math.min(1000, Math.max(30, pos.remainingMs - m + 15)); }
      timer = setTimeout(tick, delay);
    }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && sr()) { acquireWake(); tick(); } });
  // the first touch after a reload turns sound back on (browsers only allow it from a tap)
  document.addEventListener("pointerdown", () => { if (sr() && !sr().finished && !audio.running()) audio.unlock(); }, true);
  document.addEventListener("keydown", () => { if (sr() && !sr().finished && !audio.running()) audio.unlock(); }, true);

  /* ================= drawing ================= */
  const elapsedText = ms => Core.fmtClock(Math.floor(ms / 1000) * 1000);
  function statText() {
    const parts = [];
    if (audio.unsupported) parts.push("This browser can't play sounds.");
    else if (S.settings.volume <= 0) parts.push("Sound is off (volume 0).");
    else if (!audio.running()) parts.push('<button type="button" data-act="r-sound">Sound is off. Tap here to turn it on.</button>');
    else parts.push("Sound on.");
    if (!S.settings.awake) parts.push("Screen may lock (turned off in Settings).");
    else if (wake.state === "unsupported") parts.push("This browser can't keep the screen on. Set the phone's auto-lock to Never during practice.");
    else if (wake.state === "failed") parts.push("Couldn't keep the screen on. Set the phone's auto-lock to Never during practice.");
    else if (wake.state === "on") parts.push("Screen stays on.");
    return parts.join(" ");
  }
  function updateStat() { const n = $("#r-stat"); if (n) n.innerHTML = statText(); const b = $("#r-soundbtn"); if (b) b.innerHTML = (audio.running() && S.settings.volume > 0 ? I.sound : I.mute); }
  function updateDom(pos, now) {
    const run = sr(), t = $("#r-time"); if (!t || !run || run.finished) return;
    const txt = Core.fmtClock(run.holding ? 0 : pos.remainingMs);
    if (t.textContent !== txt) t.textContent = txt;
    t.classList.toggle("long", pos.remainingMs >= 3600000 - 1);
    t.classList.toggle("low", !run.holding && run.pausedAt == null && pos.remainingMs <= 10000);
    const pct = run.holding ? 100 : (pos.segDurMs ? Math.min(100, pos.segElapsedMs / pos.segDurMs * 100) : 100);
    const pr = $("#r-prog"); if (pr) { pr.style.width = pct.toFixed(2) + "%"; pr.parentNode.setAttribute("aria-valuenow", String(Math.round(pct))); }
    const a = $("#r-el"), d = $("#r-dur"), l = $("#r-left"), f = $("#r-fin"), late = $("#r-late");
    const shown = run.holding ? (Core.segments(run.plan, run.adj)[run.ack] || pos.seg) : null;
    if (a) a.textContent = (shown ? Core.fmtClock(shown.durMs) : elapsedText(pos.segElapsedMs)) + " in";
    if (d) d.textContent = Core.fmtClock(shown ? shown.durMs : pos.segDurMs) + " block";
    if (l) l.textContent = Core.fmtClock(pos.totalRemainingMs);
    const finMin = Core.minutesOfDay(now + pos.totalRemainingMs);
    if (f) f.textContent = Core.fmtHM(Math.round(finMin));
    if (late) {
      const eb = run.plan.endBy ? Core.parseHM(run.plan.endBy) : NaN;
      let over = isFinite(eb) ? Math.round(finMin - eb) : 0;
      if (over < 0 || over > 720) over = 0;
      late.textContent = over > 0 ? over + " min past " + Core.fmtHM(eb) : "";
    }
  }
  PC.V.runner = {
    cls: "runner-mode",
    render(el) {
      const run = sr();
      if (!run) { el.innerHTML = ""; setTimeout(() => { if (S.view === "runner") PC.go("plans"); }, 0); return; }
      const now = Date.now(), pos = Core.runPos(run, now), segs = Core.segments(run.plan, run.adj);
      const top = '<div class="rtop"><button type="button" class="icon-btn" data-act="r-plans" aria-label="Back to plans. The clock keeps running.">' + I.back + 'Plans</button><div class="pn">' + esc(run.plan.name) + '</div><button type="button" class="icon-btn" id="r-soundbtn" data-act="r-sound" aria-label="Sound check">' + (audio.running() && S.settings.volume > 0 ? I.sound : I.mute) + "</button></div>";
      if (run.finished) {
        const planned = Core.planMinutes(run.plan), actual = Math.round(Core.actualMs(run, now) / 60000);
        el.innerHTML = '<div class="runner">' + top + '<div class="rdone"><div class="big">' + (run.endReason === "early" ? "Practice ended" : "Practice done") + '</div><p class="mute" style="margin-top:6px;font-size:19px">' + esc(run.plan.name) + "</p>" +
          '<div class="sum"><div><div class="v">' + planned + '</div><div class="k">min planned</div></div><div><div class="v">' + actual + '</div><div class="k">min actual</div></div></div>' +
          '<p class="mute" style="margin-bottom:16px">Saved to Recent practices.</p><button type="button" class="btn block" data-act="r-done" id="r-main">Done</button></div></div>';
        return;
      }
      const hold = run.holding, paused = run.pausedAt != null, vs = hold ? (segs[run.ack] || pos.seg) : pos.seg, nxt = segs[(hold ? run.ack : pos.segIndex) + 1];
      const blocks = run.plan.blocks.length, c = Core.colorHex(vs.color), isLast = !nxt;
      const nextTxt = nxt ? (nxt.kind === "station" ? nxt.name + ": " + segLabel(nxt) : nxt.name) + " (" + durText(nxt.durMs) + ")" : "Practice ends";
      let h = '<div class="runner">' + top + '<div class="rhead"><div class="kicker">Block ' + (vs.bi + 1) + " of " + blocks + '</div><div class="bname">' + (c ? '<i style="--c:' + c + '"></i>' : "") + esc(vs.name) + "</div>" +
        (vs.kind === "station" ? '<div class="stn">' + esc(segLabel(vs)) + "</div>" : "") + (vs.note ? '<div class="rnote">' + esc(vs.note) + "</div>" : "") + "</div>";
      h += '<div class="rclock' + (pos.remainingMs >= 3600000 - 1 ? " long" : "") + (paused && !hold ? " paused" : "") + '" id="r-time" role="timer" aria-label="Time left in this block">' + Core.fmtClock(hold ? 0 : pos.remainingMs) + "</div>";
      h += '<div class="rhold" id="r-hold">' + (hold ? "Block done" : (paused ? "Paused" : "&nbsp;")) + "</div>";
      h += '<div class="rprog" role="progressbar" aria-label="Progress through this block" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="r-prog"></i></div><div class="rprog-l"><span id="r-el"></span><span id="r-dur"></span></div>';
      h += '<div class="rinfo"><div class="next"><div class="k">Next</div><div class="v sm" id="r-next">' + esc(nextTxt) + '</div></div><div><div class="k">Practice left</div><div class="v" id="r-left"></div></div><div><div class="k">Finish</div><div class="v" id="r-fin"></div><div class="late" id="r-late"></div></div></div>';
      const mainLabel = hold ? I.play + "Start next" : (paused ? I.play + "Resume" : I.pause + "Pause");
      h += '<div class="rctl"><div class="r3"><button type="button" class="rbtn" data-act="r-back" id="r-back" aria-label="Back to the start of the previous ' + (vs.kind === "station" && vs.station > 1 ? "station" : "block") + '">' + I.prev + "Back</button>" +
        '<button type="button" class="rbtn main" data-act="r-main" id="r-main">' + mainLabel + '</button><button type="button" class="rbtn" data-act="r-skip" id="r-skip" aria-label="' + (isLast ? "Finish the practice" : "Skip to the next " + (nxt && nxt.kind === "station" ? "station" : "block")) + '">' + (isLast && !hold ? "Finish" : "Skip") + I.skip + "</button></div>" +
        '<div class="r3b"><button type="button" class="rbtn" data-act="r-minus"' + (hold ? " disabled" : "") + '>−1 min</button><button type="button" class="rbtn" data-act="r-plus"' + (hold ? " disabled" : "") + '>+1 min</button><button type="button" class="rbtn" data-act="r-restart"' + (hold ? " disabled" : "") + ">" + I.restart + "Restart</button></div>" +
        '<div class="rend"><div class="rstat" id="r-stat">' + statText() + '</div><button type="button" class="btn danger small" data-act="r-end">End practice</button></div></div><div class="sr" aria-live="polite" id="r-live"></div></div>';
      el.innerHTML = h;
      updateDom(pos, now);
    }
  };

  /* ================= buttons ================= */
  PC.ACT["r-plans"] = () => PC.go("plans");
  PC.ACT["r-sound"] = () => {
    audio.unlock();
    if (audio.unsupported) { PC.toast("This browser can't play sounds.", "error"); return; }
    if (S.settings.volume <= 0) { PC.toast("Volume is set to 0. Change it in Settings.", "error"); return; }
    setTimeout(() => { audio.chime("block"); updateStat(); }, 60);
    PC.toast("Sound check. You should hear two tones.", "ok", 2500);
  };
  PC.ACT["r-main"] = () => {
    if (!sr()) return;
    audio.unlock();
    apply(sr().pausedAt != null ? Core.resumeRun : Core.pauseRun);
  };
  PC.ACT["r-back"] = () => apply(Core.skipBack);
  PC.ACT["r-restart"] = () => apply(Core.restartSeg);
  PC.ACT["r-skip"] = () => {
    const run = sr(); if (!run) return;
    const pos = Core.runPos(run, Date.now()), segs = Core.segments(run.plan, run.adj);
    if (pos.segIndex >= segs.length - 1 && !run.holding) { endPrompt(true); return; }
    apply(Core.skipNext);
  };
  function adjust(delta) {
    const run = sr(); if (!run) return;
    const res = Core.adjustCurrent(run, Date.now(), delta);
    if (!res.changed) {
      PC.toast(res.reason === "short" ? "Under 30 seconds left. Use Skip to move on." : "That's the longest one block can run (3 hours).", "error", 2800);
      return;
    }
    S.run = res.run; PC.saveRun();
    live((delta > 0 ? "Added " : "Took off ") + Math.abs(Math.round(res.deltaMs / 1000)) + " seconds.");
    tick();
  }
  PC.ACT["r-plus"] = () => adjust(60000);
  PC.ACT["r-minus"] = () => adjust(-60000);
  PC.ACT["r-end"] = () => endPrompt(false);
  function endPrompt(finishing) {
    const run = sr(); if (!run || run.finished) return;
    const mins = Math.round(Core.actualMs(run, Date.now()) / 60000);
    PC.confirmSheet({
      title: finishing ? "Finish practice?" : "End practice?",
      message: finishing ? "This is the last block. Finish the practice now?" : "Stop the clock and end practice now?",
      more: ["It will be saved in Recent practices (" + mins + (mins === 1 ? " minute" : " minutes") + " so far)."], confirmText: finishing ? "Finish practice" : "End practice", danger: true,
      onConfirm() { apply(finishing ? Core.skipNext : Core.endRun); }
    });
  }
  PC.dropRun = function () { S.run = null; PC.saveRun(); releaseWake(); clearTimeout(timer); timer = 0; };
  PC.ACT["r-done"] = () => { PC.dropRun(); PC.go("plans"); };
})();
