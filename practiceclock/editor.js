/* Practice Clock plan editor: name, timing, the ordered blocks (add / edit / duplicate / delete / reorder), trim to fit. */
(function () {
  "use strict";
  const PC = window.PCApp, Core = PC.Core, S = PC.S, I = PC.I, $ = PC.$, $$ = PC.$$, esc = PC.esc;
  const L = Core.LIMITS;
  const colorOf = id => Core.colorHex(id);

  const plan = () => PC.getPlan(S.planId);
  function startMinOf(p) { return p.start ? Core.parseHM(p.start) : Core.roundUp5(Date.now()); }

  function blockRow(p, r, n) {
    const b = p.blocks[r.bi], c = colorOf(b.color);
    const when = Core.fmtRange(r.startMin, r.endMin);
    let ln, extra = "";
    if (b.type === "stations") {
      ln = "<b>" + esc(when) + "</b> · " + b.stations + " × " + b.min + " min = " + r.min + " min";
      extra = '<div class="ln">' + b.labels.map((x, i) => esc(x || "Station " + (i + 1))).join(" · ") + "</div>";
    } else ln = "<b>" + esc(when) + "</b> · " + r.min + " min";
    return '<div class="blk" data-i="' + r.bi + '" data-bid="' + b.id + '"' + (c ? ' style="--c:' + c + '"' : "") + '><i class="bar"></i>' +
      '<button type="button" class="body" data-act="blk-edit" data-i="' + r.bi + '" aria-label="Edit block ' + (r.bi + 1) + ", " + esc(b.name) + '"><div class="nm">' + esc(b.name) + '</div><div class="ln">' + ln + "</div>" + extra + (b.note ? '<div class="note">' + esc(b.note) + "</div>" : "") + "</button>" +
      '<button type="button" class="grip" data-grip="' + r.bi + '" tabindex="-1" aria-hidden="true" title="Drag to reorder">' + I.grip + "</button>" +
      '<div class="mv"><button type="button" id="up-' + b.id + '" data-act="blk-up" data-i="' + r.bi + '" aria-label="Move ' + esc(b.name) + ' up"' + (r.bi === 0 ? " disabled" : "") + ">" + I.up + '</button><button type="button" id="dn-' + b.id + '" data-act="blk-down" data-i="' + r.bi + '" aria-label="Move ' + esc(b.name) + ' down"' + (r.bi === n - 1 ? " disabled" : "") + ">" + I.down + "</button></div></div>";
  }

  PC.V.editor = {
    cls: "no-nav has-bar",
    render(el) {
      const p = plan();
      if (!p) { el.innerHTML = ""; setTimeout(() => { if (S.view === "editor") PC.go("plans"); }, 0); return; }
      const startMin = startMinOf(p), cs = Core.clockSchedule(p, startMin), total = cs.totalMin;
      const endBy = p.endBy ? Core.parseHM(p.endBy) : NaN, ob = Core.overBy(p, startMin, endBy);
      let h = (S.memMode ? '<div class="banner bad" role="alert"><p><b>This browser is not letting Practice Clock save.</b> Changes will be lost when you close the app.</p></div>' : "");
      h += '<header class="top"><button type="button" class="icon-btn" data-act="ed-back" aria-label="Back to plans">' + I.back + "Plans</button><h1>Edit plan</h1></header>";
      h += '<section class="card ed-card"><label class="field"><span class="label">Plan name</span><input type="text" id="ed-name" maxlength="40" autocomplete="off" value="' + esc(p.name) + '"></label>' +
        '<label class="field" style="margin-bottom:0"><span class="label">Sport</span><select id="ed-sport">' + Core.SPORTS.map(s => '<option value="' + s.id + '"' + (p.sport === s.id ? " selected" : "") + ">" + esc(s.label) + "</option>").join("") + "</select></label></section>";
      h += '<section class="card ed-card"><div class="cols2"><label class="field" style="margin:0"><span class="label">Start time</span><input type="time" id="ed-start" value="' + esc(p.start) + '"></label>' +
        '<label class="field" style="margin:0"><span class="label">Must end by</span><input type="time" id="ed-end" value="' + esc(p.endBy) + '"></label></div>' +
        '<p class="mute" style="font-size:14px;margin-top:6px">' + (p.start ? "Starts at " + esc(Core.fmtHM(startMin)) + "." : "Starts at " + esc(Core.fmtHM(startMin)) + " (now, rounded up to 5 minutes).") + " “Must end by” is optional.</p>" +
        '<div class="row wrap" style="margin-top:6px">' + (p.start ? '<button type="button" class="btn ghost small" data-act="ed-now">Use now</button>' : "") + (p.endBy ? '<button type="button" class="btn ghost small" data-act="ed-clear-end">Clear cutoff</button>' : "") + "</div>";
      h += '<div class="totals"><span class="big num">' + total + "<small>min</small></span><span class=\"sub\">" + p.blocks.length + (p.blocks.length === 1 ? " block" : " blocks") + (p.blocks.length ? " · finishes " + esc(Core.fmtHM(cs.finishMin)) : "") + "</span></div>";
      if (p.endBy && !ob.valid) h += '<p class="errmsg" role="alert">“Must end by” has to be later than the start time.</p>';
      else if (ob.valid && ob.over > 0) h += '<div class="over" role="alert"><p>' + ob.over + " min over. This plan finishes at " + esc(Core.fmtHM(cs.finishMin)) + ", and you need to be done by " + esc(Core.fmtHM(endBy)) + '.</p><button type="button" class="btn small" data-act="trim" data-over="' + ob.over + '">Trim to fit</button></div>';
      else if (ob.valid && p.blocks.length) h += '<div class="fine">Fits' + (ob.over < 0 ? " with " + (-ob.over) + " min to spare." : ", with no time to spare.") + "</div>";
      h += '<button type="button" class="switch-row" role="switch" aria-checked="' + p.wait + '" data-act="ed-wait"><span class="t">Wait for me at the end of each block<small>Off: the next block starts on its own. On: the clock stops at 0:00 until you tap.</small></span><span class="sw"></span></button></section>';
      h += '<div class="sec-title"><h2>Blocks</h2><span class="sub">' + (p.blocks.length ? "Tap one to change it" : "") + "</span></div>";
      if (!p.blocks.length) h += '<div class="empty"><h3>No blocks yet</h3><p>A block is one part of practice with a time, like “Warm-up, 15 minutes”. Add your first one.</p></div>';
      h += '<div id="blk-list">' + cs.rows.map(r => blockRow(p, r, p.blocks.length)).join("") + "</div>";
      h += '<div class="addrow"><button type="button" class="btn ghost" data-act="blk-add" data-type="normal">' + I.plus + 'Add block</button><button type="button" class="btn ghost" data-act="blk-add" data-type="stations">' + I.plus + "Add stations</button></div>";
      h += '<div class="editbar"><div class="editbar-in"><button type="button" class="btn ghost" data-act="plan-share" data-id="' + p.id + '">' + I.share + 'Share</button><button type="button" class="btn go" data-act="plan-start" data-id="' + p.id + '">' + I.play + "Start practice</button></div></div>";
      el.innerHTML = h;
    },
    after() { bindDrag(); }
  };

  /* ---------- plan-level controls ---------- */
  PC.ACT["ed-back"] = () => PC.go("plans");
  PC.ACT["ed-wait"] = () => { const p = plan(); if (!p) return; p.wait = !p.wait; PC.savePlan(p); PC.render(); };
  PC.ACT["ed-now"] = () => { const p = plan(); if (!p) return; p.start = ""; PC.savePlan(p); PC.render(); };
  PC.ACT["ed-clear-end"] = () => { const p = plan(); if (!p) return; p.endBy = ""; PC.savePlan(p); PC.render(); };
  document.addEventListener("input", e => {
    const t = e.target; if (!t || t.id !== "ed-name") return;
    const p = plan(); if (!p) return;
    const n = Core.str(t.value, L.nameMax); if (n) { p.name = n; PC.savePlan(p); }
  });
  document.addEventListener("change", e => {
    const t = e.target; if (!t) return;
    const p = plan(); if (!p || S.view !== "editor") return;
    if (t.id === "ed-name") { if (!Core.str(t.value, L.nameMax)) t.value = p.name; }
    else if (t.id === "ed-sport") { if (Core.sportInfo(t.value).id === t.value) { p.sport = t.value; PC.savePlan(p); PC.render(); } }
    else if (t.id === "ed-start") { p.start = Core.parseHM(t.value) >= 0 ? t.value : ""; PC.savePlan(p); PC.render(); }
    else if (t.id === "ed-end") { p.endBy = Core.parseHM(t.value) >= 0 ? t.value : ""; PC.savePlan(p); PC.render(); }
  });

  /* ---------- reorder ---------- */
  function move(i, j) {
    const p = plan(); if (!p || j < 0 || j >= p.blocks.length || i === j) return;
    const b = p.blocks.splice(i, 1)[0]; p.blocks.splice(j, 0, b);
    PC.savePlan(p); PC.render();
    const id = (j > i ? "dn-" : "up-") + b.id, n = document.getElementById(id);
    const f = n && !n.disabled ? n : document.getElementById((j > i ? "up-" : "dn-") + b.id);
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  PC.ACT["blk-up"] = el => move(+el.dataset.i, +el.dataset.i - 1);
  PC.ACT["blk-down"] = el => move(+el.dataset.i, +el.dataset.i + 1);

  /* Drag by the handle: one set of pointer events covers finger and mouse. The up/down buttons are the
     fallback and the keyboard way. */
  function bindDrag() {
    $$("[data-grip]").forEach(g => g.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const item = g.closest(".blk"), items = $$(".blk", item.parentElement), from = items.indexOf(item);
      const rects = items.map(x => x.getBoundingClientRect()), startY = e.clientY, gap = 8, hh = rects[from].height + gap;
      let to = from;
      item.classList.add("dragging");
      items.forEach((x, i) => { if (i !== from) x.classList.add("shift"); });
      try { g.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      const onMove = ev => {
        const dy = ev.clientY - startY;
        item.style.transform = "translateY(" + dy + "px)";
        const mid = rects[from].top + rects[from].height / 2 + dy;
        to = from;
        for (let i = 0; i < rects.length; i++) { if (mid >= rects[i].top && mid <= rects[i].bottom) { to = i; break; } }
        if (mid < rects[0].top) to = 0;
        if (mid > rects[rects.length - 1].bottom) to = rects.length - 1;
        items.forEach((x, i) => {
          if (i === from) return;
          let s = 0;
          if (from < to && i > from && i <= to) s = -hh;
          if (from > to && i < from && i >= to) s = hh;
          x.style.transform = s ? "translateY(" + s + "px)" : "";
        });
      };
      const done = ev => {
        g.removeEventListener("pointermove", onMove); g.removeEventListener("pointerup", done); g.removeEventListener("pointercancel", done);
        items.forEach(x => { x.style.transform = ""; x.classList.remove("shift", "dragging"); });
        if (ev.type === "pointerup" && to !== from) move(from, to);
      };
      g.addEventListener("pointermove", onMove); g.addEventListener("pointerup", done); g.addEventListener("pointercancel", done);
    }));
  }

  /* ---------- block sheet ---------- */
  function openBlockSheet(index, type) {
    const p = plan(); if (!p) return;
    const editing = index != null && p.blocks[index];
    const b = editing ? Core.clone(p.blocks[index]) : { id: Core.uid(), name: "", min: type === "stations" ? 5 : 10, note: "", color: "", type: type === "stations" ? "stations" : "normal", stations: 4, labels: ["", "", "", ""] };
    if (b.type === "stations") { while (b.labels.length < L.stationsMax) b.labels.push(""); } else { b.stations = 4; b.labels = ["", "", "", "", "", "", "", ""]; }
    if (!editing && p.blocks.length >= L.maxBlocks) { PC.toast("A plan can have up to " + L.maxBlocks + " blocks.", "error"); return; }
    const minTxt = () => (b.type === "stations" ? "Minutes per station" : "Minutes");
    const totalOf = () => (b.type === "stations" ? b.stations * b.min : b.min);
    function stationsHtml() {
      if (b.type !== "stations") return "";
      let h = '<div class="field"><span class="label">How many stations</span><div class="stepper"><button type="button" class="st" data-stn="-1" aria-label="One fewer station">−</button><input type="number" id="bk-stn" inputmode="numeric" min="2" max="8" value="' + b.stations + '" aria-label="Number of stations"><button type="button" class="st" data-stn="1" aria-label="One more station">+</button></div></div>';
      h += '<div class="field"><span class="label">Station names (optional)</span><div class="stack">';
      for (let i = 0; i < b.stations; i++) h += '<input type="text" data-lab="' + i + '" maxlength="24" autocomplete="off" placeholder="Station ' + (i + 1) + '" aria-label="Name for station ' + (i + 1) + '" value="' + esc(b.labels[i]) + '">';
      return h + "</div></div>";
    }
    function totalHtml() {
      if (!isFinite(b.min)) return "Enter the minutes.";
      const t = totalOf();
      return b.type === "stations" ? "Total for this block: " + b.stations + " × " + b.min + " = " + t + " min. Players rotate every " + b.min + " min." : "This block runs " + t + " min.";
    }
    const body = () =>
      '<div class="field"><span class="label">What kind of block</span><div class="pills" role="group" aria-label="Block type"><button type="button" class="pill" data-type="normal" aria-pressed="' + (b.type === "normal") + '">One block</button><button type="button" class="pill" data-type="stations" aria-pressed="' + (b.type === "stations") + '">Stations (rotate)</button></div></div>' +
      '<label class="field"><span class="label">Name</span><input type="text" id="bk-name" maxlength="40" autocomplete="off" placeholder="' + (b.type === "stations" ? "Hitting stations" : "Warm-up") + '" value="' + esc(b.name) + '"></label>' +
      '<div class="field"><span class="label" id="bk-min-l">' + minTxt() + '</span><div class="stepper"><button type="button" class="st sm" data-min="-5" aria-label="Five minutes less">−5</button><button type="button" class="st" data-min="-1" aria-label="One minute less">−</button>' +
      '<input type="number" id="bk-min" inputmode="numeric" min="1" max="180" value="' + b.min + '" aria-labelledby="bk-min-l"><button type="button" class="st" data-min="1" aria-label="One minute more">+</button><button type="button" class="st sm" data-min="5" aria-label="Five minutes more">+5</button></div><p class="hint" id="bk-total">' + esc(totalHtml()) + "</p></div>" +
      '<div id="bk-st">' + stationsHtml() + "</div>" +
      '<label class="field"><span class="label">Note (optional)</span><input type="text" id="bk-note" maxlength="120" autocomplete="off" placeholder="Bring cones" value="' + esc(b.note) + '"></label>' +
      '<div class="field"><span class="label">Color tag (optional)</span><div class="swatches" role="group" aria-label="Color tag"><button type="button" class="swatch none" data-color="" aria-label="No color" aria-pressed="' + (b.color === "") + '">∅</button>' +
      Core.COLORS.map(c => '<button type="button" class="swatch" data-color="' + c.id + '" style="--c:' + c.hex + '" aria-label="' + c.name + '" aria-pressed="' + (b.color === c.id) + '"></button>').join("") + "</div></div>" +
      '<p class="errmsg" id="bk-err" role="alert" hidden></p>' +
      (editing ? '<div class="row wrap" style="margin-top:6px"><button type="button" class="btn ghost small" data-dup>Duplicate this block</button><button type="button" class="btn danger small" data-del>Delete this block</button></div>' : "");
    openSheet2();
    function openSheet2() {
      const sh = PC.openSheet({
        title: editing ? "Edit block" : (type === "stations" ? "Add stations" : "Add block"), autofocus: "#bk-name", cls: "blocksheet",
        html: body(),
        footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Save block</button>',
        onOpen(api) { wire(api); }
      });
      return sh;
    }
    function wire(api) {
      const root = api.el, err = $("#bk-err", root);
      const showErr = (m, focus) => { err.textContent = m; err.hidden = false; if (focus) { const f = $(focus, root); if (f) f.focus(); } };
      const refreshTotal = () => { $("#bk-total", root).textContent = totalHtml(); };
      const setMin = v => { b.min = v; $("#bk-min", root).value = v; refreshTotal(); };
      const redrawStations = () => { $("#bk-st", root).innerHTML = stationsHtml(); $("#bk-min-l", root).textContent = minTxt(); refreshTotal(); $$("[data-type]", root).forEach(x => x.setAttribute("aria-pressed", String(x.dataset.type === b.type))); };
      root.addEventListener("input", e => {
        const t = e.target;
        if (t.id === "bk-name") b.name = t.value; else if (t.id === "bk-note") b.note = t.value;
        else if (t.id === "bk-min") { b.min = t.value === "" ? NaN : Number(t.value); refreshTotal(); }
        else if (t.id === "bk-stn") { const n = Math.round(Number(t.value)); if (n >= L.stationsMin && n <= L.stationsMax) { b.stations = n; $("#bk-st", root).innerHTML = stationsHtml(); const f = $("#bk-stn", root); if (f) { f.focus(); } refreshTotal(); } }
        else if (t.dataset && t.dataset.lab != null) b.labels[+t.dataset.lab] = t.value;
      });
      root.addEventListener("click", e => {
        const t = e.target.closest("button"); if (!t) return;
        err.hidden = true;
        if (t.dataset.min) setMin(Math.max(1, Math.min(L.blockMax, (isFinite(Number(b.min)) ? Math.round(Number(b.min)) : 0) + Number(t.dataset.min))));
        else if (t.dataset.stn) { b.stations = Math.max(L.stationsMin, Math.min(L.stationsMax, b.stations + Number(t.dataset.stn))); redrawStations(); }
        else if (t.dataset.type) { b.type = t.dataset.type; if (b.type === "stations" && b.min > 60) b.min = 5; $("#bk-min", root).value = b.min; redrawStations(); }
        else if (t.dataset.color != null && t.classList.contains("swatch")) { b.color = t.dataset.color; $$(".swatch", root).forEach(x => x.setAttribute("aria-pressed", String(x === t))); }
        else if (t.hasAttribute("data-save")) save();
        else if (t.hasAttribute("data-dup")) duplicate();
        else if (t.hasAttribute("data-del")) remove();
      });
      root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } });
      function save() {
        const name = Core.str(b.name, L.blockNameMax);
        if (!name) return showErr("Give this block a name.", "#bk-name");
        const mins = Number(b.min);
        if (!isFinite(mins) || Math.round(mins) !== mins || mins < L.blockMin || mins > L.blockMax) return showErr("Minutes must be a whole number from " + L.blockMin + " to " + L.blockMax + ".", "#bk-min");
        const clean = Core.sanitizeBlock({ id: b.id, name: name, min: mins, note: b.note, color: b.color, type: b.type, stations: b.stations, labels: b.labels.slice(0, b.stations) });
        const next = Core.clone(p); if (editing) next.blocks[index] = clean; else next.blocks.push(clean);
        if (Core.planMinutes(next) > L.maxPlanMin) return showErr("That would make the plan longer than 24 hours (" + L.maxPlanMin + " minutes).", "#bk-min");
        p.blocks = next.blocks; PC.savePlan(p); api.close(); PC.render();
        PC.toast(editing ? "Block saved." : "Block added.", "ok");
      }
      function duplicate() {
        if (p.blocks.length >= L.maxBlocks) return showErr("A plan can have up to " + L.maxBlocks + " blocks.");
        const copy = Core.clone(p.blocks[index]); copy.id = Core.uid();
        const next = Core.clone(p); next.blocks.splice(index + 1, 0, copy);
        if (Core.planMinutes(next) > L.maxPlanMin) return showErr("That would make the plan longer than 24 hours.");
        p.blocks = next.blocks; PC.savePlan(p); api.close(); PC.render(); PC.toast("Duplicated.", "ok");
      }
      function remove() {
        PC.confirmSheet({
          title: "Delete this block?", message: "“" + p.blocks[index].name + "” will be taken out of the plan.", confirmText: "Delete block", danger: true,
          onConfirm() { p.blocks.splice(index, 1); PC.savePlan(p); api.close(); PC.render(); PC.toast("Block deleted.", "ok"); }
        });
      }
    }
  }
  const openSheet = PC.openSheet;
  PC.ACT["blk-add"] = el => openBlockSheet(null, el.dataset.type);
  PC.ACT["blk-edit"] = el => openBlockSheet(+el.dataset.i);

  /* ---------- trim to fit ---------- */
  PC.ACT["trim"] = el => {
    const p = plan(); if (!p) return;
    const over = Number(el.dataset.over) || 0, t = Core.trimToFit(p, over);
    if (!t.changes.length) {
      PC.openSheet({ title: "Can't trim", html: '<p class="msg">Every block you can shorten is already at 1 minute, or this plan is all stations (their times are kept as they are). You are ' + over + " min over. Shorten a block or a station by hand, or move the cutoff.</p>" });
      return;
    }
    const startMin = startMinOf(p), newPlan = Core.applyTrim(p, t.changes), fin = Core.clockSchedule(newPlan, startMin).finishMin;
    PC.openSheet({
      title: "Trim to fit",
      html: '<p class="msg">Takes <b>' + t.reduced + " min</b> out of " + t.changes.length + (t.changes.length === 1 ? " block" : " blocks") + ", the longer ones the most. No block goes below 1 minute, and stations keep their times.</p>" +
        '<table class="preview"><tbody>' + t.changes.map(c => "<tr><td>" + esc(p.blocks[c.bi].name) + '</td><td class="n"><s><span class="sr">was </span>' + c.from + "</s> " + c.to + " min</td></tr>").join("") + "</tbody></table>" +
        '<p class="msg" style="margin-top:12px">' + (t.fits ? "The plan then finishes at <b>" + esc(Core.fmtHM(fin)) + "</b>." : "<b>Still " + t.stillOver + " min over</b> after this. That is as far as trimming can go; shorten a station block or move the cutoff for the rest.") + "</p>",
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-apply>Apply trim</button>',
      onOpen(api) {
        $("[data-apply]", api.el).addEventListener("click", () => {
          const q = plan(); if (!q) return;
          q.blocks = Core.applyTrim(q, t.changes).blocks; PC.savePlan(q); api.close(); PC.render(); PC.toast("Trimmed " + t.reduced + " min.", "ok");
        });
      }
    });
  };
})();
