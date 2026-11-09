/* Who's Where, part 3: sheets and actions (event form, event and day details, people, settings, backup, sharing, printing). */
(function () {
  "use strict";
  const WW = window.WW;
  const { C, S, ACT, $, $$, esc, I, chip, toast, openSheet, closeAllSheets, confirmSheet } = WW;
  const today = () => C.todayStr();
  const sheetOf = el => { const w = el.closest(".sheet-wrap"); return WW.sheetStack.filter(s => s.el === w)[0] || null; };
  const evOf = id => S.evm[id] || null;
  function commit(msg, kind) { WW.derive(); WW.save(); WW.render(); if (msg) toast(msg, kind || "ok"); }
  function openersDate() {
    const t = today();
    if (S.view === "month") { const c = S.monthCursor || t.slice(0, 7) + "-01"; return c.slice(0, 7) === t.slice(0, 7) ? t : c; }
    const [ws, we] = WW.weekRange();
    return t >= ws && t <= we ? t : ws;
  }

  /* ================= event form ================= */
  const pills = (grp, opts, sel, multi) => '<div class="pills" role="group" aria-label="' + esc(grp) + '">' + opts.map(o =>
    '<button type="button" class="pill" data-grp="' + grp + '" data-multi="' + (multi ? 1 : 0) + '" data-v="' + esc(o[0]) + '" aria-pressed="' + (multi ? sel.indexOf(o[0]) >= 0 : sel === o[0]) + '"' + (o[2] ? ' style="--c:' + esc(o[2]) + '"' : "") + ">" + (o[2] ? '<i class="dot" aria-hidden="true"></i>' : "") + esc(o[1]) + "</button>").join("") + "</div>";
  const kidOpts = () => WW.kids().map(p => [p.id, p.name, p.color]);
  const driverOpts = () => [["", "Not decided"], ["ride", "Needs a ride"], ["none", "No driving needed"]].concat(WW.adults().map(p => [p.id, p.name, p.color]));
  const snackOpts = () => [["", "None needed"], ["open", "Needs someone"]].concat(WW.adults().map(p => [p.id, p.name, p.color]));
  function groupHTML(g, d) {
    if (g === "kids") return kidOpts().length ? pills("kids", kidOpts(), d.kids, true) : '<p class="hint">No players yet. <button type="button" class="linkbtn" data-act="add-person" data-role="player">Add a player</button></p>';
    if (g === "driver") return pills("driver", driverOpts(), d.driver) + (WW.adults().length ? "" : '<p class="hint">No grown-ups yet. <button type="button" class="linkbtn" data-act="add-person" data-role="adult">Add a grown-up</button></p>');
    return pills("snack", snackOpts(), d.snack);
  }
  function formHTML(d, ev, ser) {
    const ti = C.TYPES.map(t => [t.id, t.icon + " " + t.label]);
    const rep = ev && ev.series
      ? '<div class="field"><span class="label">Weekly series</span><p class="msg">This event repeats every week. When you save you can change just this one or this and all later ones.</p><label class="field" style="margin:8px 0 0"><span class="label">Repeats until (for all later ones)</span><input type="date" id="f-until" value="' + esc(ser.last || "") + '"></label></div>'
      : '<div class="field"><span class="label">Repeat</span>' + pills("repeat", [["", "Doesn’t repeat"], ["weekly", "Every week"]], d.repeatOn ? "weekly" : "") +
        '<div id="rep-opts" hidden style="margin-top:10px">' + pills("repend", [["count", "For a number of weeks"], ["until", "Until a date"]], "count") +
        '<label class="field" id="rep-count" style="margin:10px 0 0"><span class="label">How many events in total</span><input type="number" id="f-count" inputmode="numeric" min="2" max="52" value="8"></label>' +
        '<label class="field" id="rep-until" hidden style="margin:10px 0 0"><span class="label">Last day it can happen on</span><input type="date" id="f-until"></label></div></div>';
    return '<div class="field"><span class="label" id="l-type">Type</span>' + pills("type", ti, d.type) + "</div>" +
      '<label class="field"><span class="label">Title</span><input type="text" id="f-title" maxlength="80" autocomplete="off" placeholder="' + esc(C.typeInfo(d.type).label) + '" value="' + esc(d.title) + '"></label>' +
      '<label class="field"><span class="label">Date</span><input type="date" id="f-date" value="' + esc(d.date) + '"></label>' +
      '<div class="cols2"><label class="field"><span class="label">Starts</span><input type="time" id="f-start" value="' + C.timeInput(d.start) + '"></label><label class="field"><span class="label">Ends</span><input type="time" id="f-end" value="' + C.timeInput(d.end) + '"></label></div>' +
      '<div class="field" style="margin-top:-6px"><span class="label">Quick length</span><div class="pills">' + [30, 60, 90, 120].map(n => '<button type="button" class="pill" data-act="len" data-n="' + n + '">' + C.fmtDur(n).replace("1 hr 30 min", "1.5 hr") + "</button>").join("") + '</div><p class="hint" id="f-cross" hidden>This one ends after midnight, on the next day.</p></div>' +
      '<label class="field"><span class="label">Place (optional)</span><input type="text" id="f-place" maxlength="80" autocomplete="off" placeholder="Field 2" value="' + esc(d.place) + '"></label>' +
      '<label class="field"><span class="label">Address (optional)</span><input type="text" id="f-addr" maxlength="120" autocomplete="off" placeholder="Street and town, for the map link" value="' + esc(d.address) + '"></label>' +
      '<div class="field"><span class="label">Players going</span><div id="g-kids">' + groupHTML("kids", d) + "</div></div>" +
      '<div class="field"><span class="label">Who drives</span><div id="g-driver">' + groupHTML("driver", d) + "</div></div>" +
      '<div class="field"><span class="label">Snack or food</span><div id="g-snack">' + groupHTML("snack", d) + "</div></div>" +
      '<div class="cols2"><label class="field"><span class="label">Arrive early (min)</span><input type="number" id="f-early" inputmode="numeric" min="0" max="180" value="' + d.early + '"></label>' +
      '<label class="field"><span class="label">Drive time (min)</span><input type="number" id="f-drive" inputmode="numeric" min="0" max="240" value="' + d.drive + '"></label></div>' +
      '<label class="field"><span class="label">Notes (optional)</span><textarea id="f-notes" maxlength="600" placeholder="Bring water, wear white jerseys…">' + esc(d.notes) + "</textarea></label>" + rep +
      '<div id="f-preview" class="preview" aria-live="polite"></div><p class="errmsg" id="f-err" role="alert" hidden></p>';
  }
  function readForm(root) {
    const g = id => { const e = $("#" + id, root); return e ? e.value : ""; };
    const sel = grp => $$('[data-grp="' + grp + '"][aria-pressed="true"]', root).map(b => b.dataset.v);
    return {
      title: g("f-title"), type: sel("type")[0] || "other", date: g("f-date"), start: C.parseTime(g("f-start")), end: C.parseTime(g("f-end")),
      place: g("f-place"), address: g("f-addr"), kids: sel("kids"), driver: sel("driver")[0] || "", snack: sel("snack")[0] || "", notes: g("f-notes"),
      early: C.int(g("f-early"), 0, C.LIM.early, 0), drive: C.int(g("f-drive"), 0, C.LIM.drive, 0),
      repeatOn: sel("repeat")[0] === "weekly", repMode: sel("repend")[0] || "count", count: g("f-count"), until: g("f-until")
    };
  }
  function ctxNow() { const c = { kids: {}, adults: {} }; S.people.forEach(p => { (p.role === "adult" ? c.adults : c.kids)[p.id] = 1; }); return c; }
  function draftEvent(d, id) { return C.sanitizeEvent(Object.assign({}, d, { id: id }), ctxNow(), {}); }
  function validateForm(d, editingSeries) {
    if (!C.isYMD(d.date)) return "Pick a date for the event.";
    if (d.start === null || d.end === null) return "Set a start time and an end time.";
    if (d.start === d.end) return "The end time can’t be the same as the start time.";
    if (d.repeatOn && !editingSeries) {
      if (d.repMode === "count") { const n = Number(d.count); if (!(n >= 2 && n <= 52) || Math.floor(n) !== n) return "Repeat for a whole number of weeks between 2 and 52."; }
      else if (!C.isYMD(d.until) || d.until < d.date) return "Pick a last day for the repeat that is on or after the first date.";
    }
    if (editingSeries && d.until !== "" && (!C.isYMD(d.until) || d.until < d.date)) return "The repeat end date has to be on or after this event’s date.";
    return "";
  }
  function previewConflicts(root, editId) {
    const box = $("#f-preview", root); if (!box) return;
    const d = readForm(root), cross = $("#f-cross", root);
    if (cross) cross.hidden = !(d.start !== null && d.end !== null && d.end < d.start);
    if (!C.isYMD(d.date) || d.start === null || d.end === null || d.start === d.end) { box.innerHTML = ""; return; }
    const dr = draftEvent(d, "draftone");
    if (!dr) { box.innerHTML = ""; return; }
    const events = S.events.filter(e => e.id !== editId).concat([dr]);
    const mine = C.findConflicts(events).filter(c => c.a === "draftone" || c.b === "draftone");
    const evm = C.byId(events), notes = mine.map(c => "<li>" + esc(C.conflictText(c, evm, S.pm, WW.h24())) + "</li>").join("");
    box.innerHTML = mine.length ? '<div class="warnbox"><b>Heads up, this would clash:</b><ul>' + notes + "</ul></div>" : "";
  }
  function openEventForm(o) {
    o = o || {};
    const ev = o.id ? evOf(o.id) : null;
    const ser = ev && ev.series ? { last: C.seriesLast(S.events, ev.series) } : null;
    const t = o.date || openersDate();
    const dflt = { title: "", type: "practice", date: t, start: 17 * 60, end: 18 * 60, place: "", address: "", kids: [], driver: "", snack: "", notes: "", early: S.settings.earlyMin, drive: S.settings.driveMin, repeatOn: false };
    const d = ev ? Object.assign({}, ev, { repeatOn: false }) : Object.assign(dflt, o.prefill || {});
    const sh = openSheet({
      title: ev ? "Edit event" : "Add an event", cls: "form", kind: "form",
      html: formHTML(d, ev, ser),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-act="save-ev">Save</button>' ,
      onOpen(api) {
        const root = api.el;
        if (ev) api.body.insertAdjacentHTML("beforeend", '<div class="game-sec"><button type="button" class="btn danger block" data-act="del-ev" data-id="' + esc(ev.id) + '">Delete this event</button></div>');
        api.editId = ev ? ev.id : null; api.series = ser;
        const upd = () => previewConflicts(root, api.editId);
        root.addEventListener("input", upd);
        root.addEventListener("click", e => {
          const b = e.target.closest("[data-grp]");
          if (b) {
            const grp = b.dataset.grp;
            if (b.dataset.multi === "1") b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true");
            else { $$('[data-grp="' + grp + '"]', root).forEach(x => x.setAttribute("aria-pressed", x === b)); }
            if (grp === "type") { const ti = $("#f-title", root); ti.placeholder = C.typeInfo(b.dataset.v).label; }
            if (grp === "repeat") $("#rep-opts", root).hidden = b.dataset.v !== "weekly";
            if (grp === "repend") { $("#rep-count", root).hidden = b.dataset.v !== "count"; $("#rep-until", root).hidden = b.dataset.v !== "until"; if (b.dataset.v === "until" && !$("#f-until", root).value) $("#f-until", root).value = C.addDays($("#f-date", root).value || t, 7 * 7); }
          }
          const l = e.target.closest('[data-act="len"]');
          if (l) { const s = C.parseTime($("#f-start", root).value); if (s !== null) { $("#f-end", root).value = C.timeInput(s + (+l.dataset.n)); } }
          upd();
        });
        api.refreshPeople = () => {
          const cur = readForm(root);
          ["kids", "driver", "snack"].forEach(g => { $("#g-" + g, root).innerHTML = groupHTML(g, cur); });
          upd();
        };
        upd();
      }
    });
    return sh;
  }
  ACT["add-ev"] = () => openEventForm({});
  ACT["add-on"] = el => openEventForm({ date: el.dataset.date });
  ACT["edit-ev"] = el => { const s = sheetOf(el); const id = el.dataset.id; if (s) s.close(); openEventForm({ id: id }); };
  ACT["save-ev"] = el => {
    const sh = sheetOf(el), root = sh.el, d = readForm(root), err = $("#f-err", root), ev = sh.editId ? evOf(sh.editId) : null;
    const m = validateForm(d, !!(ev && ev.series));
    if (m) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: "nearest" }); return; }
    err.hidden = true;
    if (ev && ev.series) {
      openSheet({
        title: "Which events?", cls: "confirm",
        html: '<p class="msg">This is part of a weekly series. Which events should these changes apply to?</p>',
        footer: '<div class="stack full"><button type="button" class="btn block" data-act="save-scope" data-scope="one">Just this event</button><button type="button" class="btn ghost block" data-act="save-scope" data-scope="future">This and all later events</button><button type="button" class="btn ghost block" data-close>Cancel</button></div>',
        onOpen(api) { api.form = sh; }
      });
      return;
    }
    doSave(sh, d, "one");
  };
  ACT["save-scope"] = el => { const sc = sheetOf(el), form = sc.form, d = readForm(form.el); sc.close(); doSave(form, d, el.dataset.scope); };
  function doSave(formSheet, d, scope) {
    const ev = formSheet.editId ? evOf(formSheet.editId) : null, id = ev ? ev.id : C.uid();
    const fields = draftEvent(d, id);
    if (!fields) return toast("Couldn't read the event. Check the date and times.", "error");
    delete fields.series;
    let newIds = [id], note = "";
    if (ev && ev.series) {
      if (scope === "future") {
        const until = C.isYMD(d.until) && d.until >= d.date ? d.until : C.seriesLast(S.events, ev.series);
        const r = C.rewriteFuture({ events: S.events, series: S.series }, ev.id, fields, until);
        S.events = r.events; S.series = r.series; newIds = C.seriesOf(S.events, ev.series).filter(e => e.date >= fields.date).map(e => e.id);
      } else {
        S.events = S.events.map(e => e.id === ev.id ? Object.assign({}, fields, { id: ev.id, series: ev.series }) : e);
      }
    } else if (d.repeatOn) {
      const o = d.repMode === "count" ? { count: Number(d.count) } : { until: d.until };
      const base = Object.assign({}, fields, { id: id, series: "" });
      const r = C.makeSeries({ events: S.events.filter(e => e.id !== id), series: S.series }, base, o);
      S.events = r.events; S.series = r.series;
      const first = S.events.filter(e => e.id === id)[0], made = first && first.series ? C.seriesOf(S.events, first.series) : [first];
      newIds = made.map(e => e.id); note = " " + made.length + (made.length === 1 ? " event added." : " events added.");
      if (o.until && C.weeklyDates(base.date, { until: o.until }).length >= C.LIM.occ) note += " Repeats stop after " + C.LIM.occ + " weeks.";
    } else if (ev) {
      S.events = S.events.map(e => e.id === ev.id ? Object.assign({}, fields, { id: ev.id, series: "" }) : e);
    } else {
      S.events = S.events.concat([Object.assign({}, fields, { id: id, series: "" })]);
    }
    if (S.events.length > C.LIM.events) { S.events = S.events.slice(0, C.LIM.events); note += " Only the first " + C.LIM.events + " events are kept."; }
    // show what was just added
    S.cursor = fields.date; if (S.view === "month") S.monthCursor = fields.date.slice(0, 7) + "-01"; if (S.view === "people") S.view = "week";
    WW.derive();
    const clash = S.cf.some(c => newIds.indexOf(c.a) >= 0 || newIds.indexOf(c.b) >= 0);
    formSheet.close();
    WW.save(); WW.render();
    toast((ev ? "Saved." : "Event added.") + note + (clash ? " Heads up: it clashes with something. See Attention." : ""), clash ? "warn" : "ok", clash ? 5200 : 3200);
  }
  ACT["del-ev"] = el => {
    const ev = evOf(el.dataset.id); if (!ev) return;
    if (ev.series) {
      openSheet({
        title: "Delete which events?", cls: "confirm",
        html: '<p class="msg">“' + esc(ev.title) + "” on " + esc(C.fmtDate(ev.date, "short")) + " is part of a weekly series.</p>",
        footer: '<div class="stack full"><button type="button" class="btn danger block" data-act="do-del" data-id="' + esc(ev.id) + '" data-scope="one">Delete just this event</button><button type="button" class="btn danger block" data-act="do-del" data-id="' + esc(ev.id) + '" data-scope="future">Delete this and all later events</button><button type="button" class="btn ghost block" data-close>Cancel</button></div>'
      });
    } else {
      confirmSheet({ title: "Delete this event?", message: "“" + ev.title + "” on " + C.fmtDate(ev.date, "short") + " will be removed.", confirmText: "Delete", danger: true, onConfirm() { doDelete(ev.id, "one"); } });
    }
  };
  ACT["do-del"] = el => { const s = sheetOf(el); if (s) s.close(); doDelete(el.dataset.id, el.dataset.scope); };
  function doDelete(id, scope) {
    WW.withUndo("Deleted", () => {
      const r = C.deleteFromSeries({ events: S.events, series: S.series }, id, scope);
      S.events = r.events; S.series = r.series;
    }, scope === "future" ? "Deleted this and all later events." : "Event deleted.");
    // forms or detail sheets for gone events close themselves through refreshSheets; close an open form for this event too
    WW.sheetStack.slice().forEach(s => { if (s.kind === "form" && s.editId === id) s.close(); });
  }

  /* ================= fixes (one-tap actions from conflict and attention cards) ================= */
  ACT["fix"] = el => {
    const fix = WW.fixOf(+el.dataset.fix);
    if (!fix) return;
    if (fix.type === "edit") { openEventForm({ id: fix.event }); return; }
    if (!evOf(fix.event)) return;
    const ev = evOf(fix.event), pn = fix.person && S.pm[fix.person] ? S.pm[fix.person].name : "";
    const msg = fix.type === "assign" ? pn + (fix.role === "snack" ? " will bring the snack to " : " will drive to ") + C.evLabel(ev) + "." : fix.type === "removeKids" ? fix.label + "." : fix.type === "open" ? "Marked: " + fix.label.replace(/^Ask someone else to /, "needs someone to ") + "." : "Done.";
    WW.withUndo(fix.label, () => { S.events = C.applyFix(S.events, fix); }, msg);
  };

  /* ================= event detail ================= */
  function row(k, v) { return '<div class="d-row"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>"; }
  function detailHTML(ev) {
    const t = C.typeInfo(ev.type), h24 = WW.h24(), cfs = S.cfBy[ev.id] || [];
    let h = '<p class="d-type">' + t.icon + " " + esc(t.label) + (cfs.length ? ' <span class="badge bad">Conflict</span>' : "") + "</p>";
    h += row("When", esc(C.fmtDate(ev.date, "full")) + "<br>" + esc(C.fmtRange(ev.start, ev.end, h24)) + (C.crossesMidnight(ev) ? " (ends the next day)" : "") + " <small class=\"mute\">" + esc(C.fmtDur(C.durOf(ev))) + "</small>");
    const lines = [];
    if (ev.early > 0) lines.push("Arrive by <b>" + esc(C.fmtAbs(C.absArrive(ev), h24, ev.date)) + "</b> (" + ev.early + " min early)");
    if (ev.drive > 0 && ev.driver !== "none") lines.push("Leave home by <b>" + esc(C.fmtAbs(C.absLeave(ev), h24, ev.date)) + "</b> (about " + ev.drive + " min drive)");
    if (lines.length) h += row("Timing", lines.join("<br>"));
    if (ev.place || ev.address) {
      const url = C.mapsUrl(ev);
      h += row("Where", (ev.place ? "<b>" + esc(ev.place) + "</b>" : "") + (ev.place && ev.address ? "<br>" : "") + esc(ev.address) + (url ? '<br><a class="btn small ghost dirbtn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + I.pin + " Directions</a>" : ""));
    }
    h += row("Players", ev.kids.length ? '<span class="chips">' + ev.kids.map(k => chip(S.pm[k])).join("") + "</span>" : '<span class="mute">No players picked</span>');
    h += row("Driver", ev.driver === "none" ? '<span class="mute">No driving needed</span>' : C.isAdultId(ev.driver) && S.pm[ev.driver] ? '<span class="chips">' + chip(S.pm[ev.driver]) + "</span>" : '<span class="chip need">' + (ev.driver === "ride" ? "Needs a ride" : "No driver yet") + "</span>");
    if (ev.snack) h += row("Snack", ev.snack === "open" ? '<span class="chip need">Needs someone</span>' : S.pm[ev.snack] ? '<span class="chips">' + chip(S.pm[ev.snack]) + "</span>" : "");
    if (ev.notes) h += row("Notes", '<span class="notes">' + esc(ev.notes) + "</span>");
    if (ev.series) { const last = C.seriesLast(S.events, ev.series), n = C.seriesOf(S.events, ev.series).filter(e => e.date > ev.date).length; h += row("Repeats", "Every week until " + esc(C.fmtDate(last, "short")) + " (" + n + " more after this one)"); }
    if (C.driverMissing(ev)) h += '<div class="d-fix"><p class="label">Who can drive?</p><div class="fixes inline">' + WW.assignButtons(ev, "driver") + "</div></div>";
    if (ev.snack === "open") h += '<div class="d-fix"><p class="label">Who can bring the snack?</p><div class="fixes inline">' + WW.assignButtons(ev, "snack") + "</div></div>";
    if (cfs.length) h += '<div class="d-fix"><p class="label">Conflicts</p>' + cfs.map(c => WW.conflictCard(c, { noEvents: true })).join("") + "</div>";
    h += '<div class="d-acts"><button type="button" class="list-btn" data-act="ev-ics" data-id="' + esc(ev.id) + '"><span class="t">Add to calendar (.ics)<small>One event, with a reminder 1 hour before</small></span>' + I.go + "</button>" +
      '<button type="button" class="list-btn" data-act="dup-ev" data-id="' + esc(ev.id) + '"><span class="t">Copy to another day<small>Opens a new event with the same details</small></span>' + I.go + "</button></div>";
    return h;
  }
  function openDetail(id) {
    const ev = evOf(id); if (!ev) return;
    openSheet({
      title: ev.title, cls: "detail", kind: "detail",
      render() { const e = evOf(id); return e ? { title: e.title, html: detailHTML(e) } : null; },
      html: detailHTML(ev),
      footer: '<button type="button" class="btn danger" data-act="del-ev" data-id="' + esc(id) + '">Delete</button><button type="button" class="btn grow2" data-act="edit-ev" data-id="' + esc(id) + '">Edit</button>'
    });
  }
  ACT["open-ev"] = el => openDetail(el.dataset.id);
  ACT["dup-ev"] = el => {
    const ev = evOf(el.dataset.id); if (!ev) return;
    const s = sheetOf(el); if (s) s.close();
    openEventForm({ date: C.addDays(ev.date, 1), prefill: { title: ev.title, type: ev.type, start: ev.start, end: ev.end, place: ev.place, address: ev.address, kids: ev.kids.slice(), driver: ev.driver, snack: ev.snack, notes: ev.notes, early: ev.early, drive: ev.drive } });
  };

  /* ================= day sheet (from the month) ================= */
  function openDay(d) {
    const html = () => {
      const list = C.eventsOn(S.events, d);
      return (list.length ? '<div class="evs">' + list.map(e => WW.eventCard(e)).join("") + "</div>" : '<p class="none">Nothing planned this day.</p>') +
        '<button type="button" class="btn block" data-act="add-on" data-date="' + d + '" style="margin-top:12px">' + I.plus + " Add an event on this day</button>";
    };
    openSheet({ title: C.fmtDate(d, "day"), cls: "day", kind: "day", render: () => ({ html: html(), title: C.fmtDate(d, "day") }), html: html() });
  }
  ACT["open-day"] = el => openDay(el.dataset.date);

  /* ================= people ================= */
  function openPersonSheet(o) {
    o = o || {};
    const p = o.id ? S.pm[o.id] : null;
    const used = S.people.map(x => x.color);
    const color = p ? p.color : (C.COLORS.filter(c => used.indexOf(c.hex) < 0)[0] || C.COLORS[S.people.length % C.COLORS.length]).hex;
    const role = p ? p.role : (o.role === "adult" ? "adult" : "player");
    openSheet({
      title: p ? "Edit person" : (role === "adult" ? "Add a grown-up" : "Add a player"), cls: "person", kind: "person", autofocus: "#p-name",
      html: '<label class="field"><span class="label">Name or nickname</span><input type="text" id="p-name" maxlength="24" autocomplete="off" autocapitalize="words" placeholder="' + (role === "adult" ? "Parent A" : "Kid 1") + '" value="' + esc(p ? p.name : "") + '"></label>' +
        '<div class="field"><span class="label">Role</span>' + pills("prole", [["player", "Player"], ["adult", "Grown-up"]], role) + '<p class="hint">Players go to events. Grown-ups can drive and bring snacks.</p></div>' +
        '<div class="field"><span class="label">Color</span><div class="swatches" role="group" aria-label="Color">' + C.COLORS.map(c => '<button type="button" class="sw" data-grp="pcolor" data-multi="0" data-v="' + c.hex + '" style="--c:' + c.hex + '" aria-pressed="' + (c.hex === color) + '" aria-label="' + c.name + '"></button>').join("") + "</div></div>" +
        '<p class="errmsg" id="p-err" role="alert" hidden></p>' + (p ? '<div class="game-sec"><button type="button" class="btn danger block" data-act="del-person" data-id="' + esc(p.id) + '">Remove this person</button></div>' : ""),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-act="save-person" data-id="' + esc(p ? p.id : "") + '">Save</button>',
      onOpen(api) {
        api.el.addEventListener("click", e => {
          const b = e.target.closest("[data-grp]");
          if (b) $$('[data-grp="' + b.dataset.grp + '"]', api.el).forEach(x => x.setAttribute("aria-pressed", x === b));
        });
        api.el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "p-name") { e.preventDefault(); $('[data-act="save-person"]', api.el).click(); } });
      }
    });
  }
  ACT["add-person"] = el => { openPersonSheet({ role: el.dataset.role }); };
  ACT["edit-person"] = el => openPersonSheet({ id: el.dataset.id });
  ACT["save-person"] = el => {
    const sh = sheetOf(el), root = sh.el, id = el.dataset.id, name = C.str($("#p-name", root).value, C.LIM.name), err = $("#p-err", root);
    const roleBtn = $('[data-grp="prole"][aria-pressed="true"]', root), role = roleBtn ? roleBtn.dataset.v : "player";
    const color = $('[data-grp="pcolor"][aria-pressed="true"]', root).dataset.v;
    if (!name) { err.textContent = "Type a name or nickname first."; err.hidden = false; return; }
    if (S.people.length >= C.LIM.people && !id) { err.textContent = "That's the most people Who's Where can keep (" + C.LIM.people + ")."; err.hidden = false; return; }
    const wasFirst = !WW.hasData();
    if (id) {
      const old = S.pm[id];
      S.people = S.people.map(p => p.id === id ? { id: id, name: name, role: role, color: color } : p);
      if (old && old.role !== role) {   // a role change takes the person out of jobs they can no longer do
        S.events = S.events.map(e => { const n = Object.assign({}, e); if (role === "adult") n.kids = n.kids.filter(k => k !== id); else { if (n.driver === id) n.driver = ""; if (n.snack === id) n.snack = ""; } return n; });
      }
    } else {
      let nid; do { nid = C.uid(); } while (S.pm[nid]);
      S.people = S.people.concat([{ id: nid, name: name, role: role, color: color }]);
      S.newPerson = nid;
    }
    WW.derive(); WW.save();
    const evForm = WW.sheetStack.filter(s => s.kind === "form" && !s.closed)[0];
    sh.close();
    if (evForm && evForm.refreshPeople) {   // adding someone from inside the event form: show them there
      evForm.refreshPeople();
      if (!id && S.newPerson && role === "player") { const b = $('[data-grp="kids"][data-v="' + S.newPerson + '"]', evForm.el); if (b) b.setAttribute("aria-pressed", "true"); }
      if (!id && S.newPerson && role === "adult") { const b = $('[data-grp="driver"][data-v="' + S.newPerson + '"]', evForm.el); if (b && !$('[data-grp="driver"][aria-pressed="true"]', evForm.el).dataset.v) b.setAttribute("aria-pressed", "true"), $('[data-grp="driver"][data-v=""]', evForm.el).setAttribute("aria-pressed", "false"); }
      evForm.el.dispatchEvent(new Event("input"));
    }
    S.newPerson = null;
    WW.render();
    toast(id ? "Saved." : name + " added." + (wasFirst ? " Add more people, then your first event." : ""), "ok");
  };
  ACT["del-person"] = el => {
    const p = S.pm[el.dataset.id]; if (!p) return;
    const drives = S.events.filter(e => e.driver === p.id).length, snacks = S.events.filter(e => e.snack === p.id).length, goes = S.events.filter(e => e.kids.indexOf(p.id) >= 0).length;
    const more = [];
    if (goes) more.push(p.name + " will be taken off " + goes + (goes === 1 ? " event." : " events."));
    if (drives) more.push(drives + (drives === 1 ? " event" : " events") + " will go back to needing a driver.");
    if (snacks) more.push(snacks + (snacks === 1 ? " snack job" : " snack jobs") + " will go back to being unclaimed.");
    confirmSheet({
      title: "Remove " + p.name + "?", message: "This takes " + p.name + " out of Who’s Where.", more: more, confirmText: "Remove", danger: true,
      onConfirm() {
        S.people = S.people.filter(x => x.id !== p.id);
        S.events = S.events.map(e => Object.assign({}, e, { kids: e.kids.filter(k => k !== p.id), driver: e.driver === p.id ? "" : e.driver, snack: e.snack === p.id ? "open" : e.snack }));
        if (S.filter === p.id) S.filter = null;
        closeAllSheets(); commit(p.name + " removed.");
      }
    });
  };

  /* ================= settings, backup, about ================= */
  function lastBackupText() {
    if (!S.meta.lastBackup) return "You haven’t made a backup yet";
    const d = C.diffDays(today(), S.meta.lastBackup);
    return "Last backup " + (d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago");
  }
  WW.backupDueDays = function () {
    if (!S.events.length) return 0;
    const t = today();
    if (S.meta.snooze && S.meta.snooze > t) return 0;
    const base = S.meta.lastBackup || S.meta.since;
    if (!base) return 0;
    const d = C.diffDays(t, base);
    return d >= 14 ? d : 0;
  };
  function markBackup() { S.meta.lastBackup = today(); S.meta.snooze = null; WW.saveMeta(); }
  function backupFile() {
    return { name: "whoswhere-backup-" + today() + ".json", json: JSON.stringify(C.makeBackup({ people: S.people, events: S.events, series: S.series, settings: S.settings }, today()), null, 1) };
  }
  ACT["dl-backup"] = () => {
    if (!WW.hasData()) return toast("Nothing to back up yet.", "error");
    try {
      const f = backupFile();
      WW.downloadBlob(new Blob([f.json], { type: "application/json" }), f.name);
      markBackup(); WW.render();
      toast("Backup file created: " + f.name + ". Keep it somewhere safe, like Files or Google Drive.", "ok", 5500);
    } catch (e) { toast("Couldn't make the backup file. Try again.", "error"); }
  };
  ACT["backup-later"] = () => { S.meta.snooze = C.addDays(today(), 3); WW.saveMeta(); WW.render(); };
  ACT["tip-off"] = el => { S.meta.tips[el.dataset.id] = true; WW.saveMeta(); WW.render(); };
  ACT["dismiss-damaged"] = () => { S.damaged = false; WW.render(); };
  function canShareFiles() { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] })); } catch (e) { return false; } }
  ACT["share-backup"] = async () => {
    try {
      const f = backupFile(), file = new File([f.json], f.name, { type: "application/json" });
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return toast("This phone can't share files from here. Use Download instead.", "error");
      await navigator.share({ files: [file], title: "Who's Where backup" });
      markBackup(); WW.render(); toast("Backup shared. Make sure you saved it somewhere safe.", "ok", 5000);
    } catch (e) { if (e && e.name === "AbortError") return; toast("Couldn't share the backup. Try Download instead.", "error"); }
  };
  WW.onRestoreFile = function (file) {
    if (!file) return;
    const bad = m => toast(m + " Nothing was changed.", "error", 6000);
    WW.readJSONFile(file, obj => {
      const v = C.validateBackup(obj);
      if (!v.ok) return bad(v.error);
      const st = v.state, np = st.people.length, ne = st.events.length;
      const cur = (S.people.length || S.events.length) ? S.people.length + (S.people.length === 1 ? " person" : " people") + " and " + S.events.length + (S.events.length === 1 ? " event" : " events") : "";
      confirmSheet({
        title: "Replace everything?",
        message: "This backup has " + np + (np === 1 ? " person" : " people") + " and " + ne + (ne === 1 ? " event" : " events") + ".",
        more: [(v.dropped.events || v.dropped.people) ? (v.dropped.events + v.dropped.people) + " item" + (v.dropped.events + v.dropped.people === 1 ? "" : "s") + " in the file couldn't be read and will be left out." : "",
          cur ? "Restoring replaces everything in Who’s Where on this phone now (" + cur + "). This cannot be undone." : "Nothing is saved on this phone yet, so nothing will be lost."].filter(Boolean),
        confirmText: "Restore", danger: !!cur, onConfirm() { applyRestore(st); }
      });
    }, bad);
  };
  function applyRestore(st) {
    const old = { people: S.people, events: S.events, series: S.series, settings: S.settings };
    WW.setState(st);
    if (!WW.save()) { WW.setState(old); WW.derive(); return toast("Couldn't restore (storage problem). Your data on this phone was left as it was.", "error", 6500); }
    S.damaged = false; S.view = "week";
    markBackup(); WW.derive(); closeAllSheets(); WW.render();
    toast("Restored " + st.people.length + (st.people.length === 1 ? " person" : " people") + " and " + st.events.length + (st.events.length === 1 ? " event." : " events."), "ok");
  }
  ACT["clear-all"] = () => {
    confirmSheet({
      title: "Clear everything?", message: "This permanently removes every person, event and setting from Who’s Where on this phone.",
      more: ["Want a copy first? Download a backup, then clear."], confirmText: "Clear everything", danger: true,
      extra: '<button type="button" class="btn ghost block" data-act="dl-backup" style="margin-top:12px">Download a backup first</button>',
      onConfirm() {
        ["data", "meta", "damaged"].forEach(k => WW.store.del(k));
        WW.setState(C.sanitizeState({})); S.meta = { lastBackup: null, tips: {} }; S.damaged = false; S.droppedNote = ""; S.view = "week"; S.monthCursor = null;
        closeAllSheets(); WW.derive(); WW.render(); toast("Everything was cleared.", "ok");
      }
    });
  };
  ACT["sample"] = () => {
    if (WW.hasData()) return;
    const st = C.sampleState(today(), S.settings.weekStart);
    st.settings = S.settings;
    WW.setState(st); S.view = "week";
    WW.derive();
    // open on the first week that has something to fix, so the best feature shows straight away
    const na = C.needsAttention(S.events, S.cf, today(), Infinity);
    if (na.items.length) S.cursor = na.items[0].date;
    WW.save(); WW.render({ top: true });
    toast("Sample week added with placeholder names. Change them in People, or clear it in Settings.", "ok", 6000);
  };
  ACT["settings"] = () => {
    const st = S.settings;
    openSheet({
      title: "Settings", cls: "help", kind: "settings",
      html: '<h3>Week and time</h3><div class="field"><span class="label">Week starts on</span>' + pills("weekStart", [["0", "Sunday"], ["1", "Monday"]], String(st.weekStart)) + "</div>" +
        '<div class="field"><span class="label">Clock</span>' + pills("h24", [["0", "12-hour"], ["1", "24-hour"]], st.h24 ? "1" : "0") + "</div>" +
        '<div class="cols2"><label class="field"><span class="label">Default drive time (min)</span><input type="number" id="s-drive" inputmode="numeric" min="0" max="240" value="' + st.driveMin + '"></label>' +
        '<label class="field"><span class="label">Default arrive early (min)</span><input type="number" id="s-early" inputmode="numeric" min="0" max="180" value="' + st.earlyMin + '"></label></div>' +
        '<p class="hint">These two fill in new events. Each event can have its own numbers.</p>' +
        "<h3>Calendar</h3><p>Add everything to your phone’s calendar as one file. Times are “floating”: they show at the same clock time wherever you are, and each event has a reminder 1 hour before.</p>" +
        '<button type="button" class="btn ghost block" data-act="all-ics" style="margin-top:10px">Calendar file for everything (.ics)</button>' +
        '<h3>Back up and restore</h3><p>' + esc(lastBackupText()) + ". Who’s Where keeps everything on this phone only. If the phone is reset, or the browser clears its saved data, it can disappear. A backup file is your safety copy.</p>" +
        '<div class="stack" style="margin-top:10px"><button type="button" class="btn block" data-act="dl-backup">Back up (download file)</button>' + (canShareFiles() ? '<button type="button" class="btn ghost block" data-act="share-backup">Share backup file…</button>' : "") +
        '<label class="btn ghost block file-btn" style="cursor:pointer">Restore from a backup file<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Who’s Where backup file"></label></div>' +
        '<p class="hint">Restoring replaces everything now in Who’s Where. Save the file somewhere you can find it (Files, Google Drive, or email it to yourself).</p>' +
        (S.memMode ? '<p class="errmsg">Can’t save on this browser. Anything you add will be lost when you close the app. Back up before you leave.</p>' : "") +
        '<h3>More</h3><button type="button" class="list-btn" data-act="about"><span class="t">Help &amp; about<small>' + esc(C.VERSION) + "</small></span>" + I.go + "</button>" +
        '<button type="button" class="list-btn" onclick="window.nateHealth&&nateHealth.report()"><span class="t">Something wrong?<small>Send a problem report</small></span>' + I.go + "</button>" +
        '<div class="game-sec"><button type="button" class="btn danger block" data-act="clear-all">Clear everything</button></div>',
      onOpen(api) {
        const root = api.el;
        root.addEventListener("click", e => {
          const b = e.target.closest("[data-grp]"); if (!b) return;
          $$('[data-grp="' + b.dataset.grp + '"]', root).forEach(x => x.setAttribute("aria-pressed", x === b));
          if (b.dataset.grp === "weekStart") S.settings = Object.assign({}, S.settings, { weekStart: +b.dataset.v });
          if (b.dataset.grp === "h24") S.settings = Object.assign({}, S.settings, { h24: b.dataset.v === "1" });
          WW.save(); WW.render();
        });
        const num = (id, key, max) => $("#" + id, root).addEventListener("change", e => {
          const v = C.int(e.target.value, 0, max, S.settings[key]); e.target.value = v;
          S.settings = Object.assign({}, S.settings, { [key]: v }); WW.save();
        });
        num("s-drive", "driveMin", C.LIM.drive); num("s-early", "earlyMin", C.LIM.early);
      }
    });
  };
  ACT["about"] = () => {
    closeAllSheets();
    openSheet({
      title: "Help & about", cls: "help",
      html: "<h3>What is Who’s Where?</h3><p>A week planner for a sports family. Add your kids and grown-ups, then add practices, games and tournaments with who plays, who drives and who brings the snack.</p>" +
        "<h3>How the warnings work</h3><p><b>A kid</b> is flagged when two of their events overlap. Time you arrive early counts before the start; nothing counts after the end.</p>" +
        "<p><b>A grown-up</b> is flagged when they are tied up on two things at once. They are tied up from the time they have to leave home (arrive-early time minus drive time) until the event ends. Two events at the same place never clash for a grown-up. Leave the place empty and Who’s Where assumes the places are different.</p>" +
        "<p>Tap a warning for fixes. One tap can hand a job to a grown-up who is free.</p>" +
        "<h3>Sharing</h3><p>Copy the week as text and paste it into your group chat. Or save a calendar file (.ics) and open it to add events to your calendar. Nothing about your family goes into a web link.</p>" +
        "<h3>Your privacy</h3><ul><li>Everything is saved on this phone only. There are no accounts and no servers.</li><li>Clearing the browser’s saved data erases it, so back up now and then.</li><li>Only files you choose to save or share leave the app.</li></ul>" +
        '<p class="ver">' + esc(C.VERSION) + " · Made for sports families</p>"
    });
  };

  /* ================= calendar files, text, print ================= */
  function icsDownload(events, name) {
    const text = C.icsCalendar(events, S.people, Date.now(), WW.h24());
    WW.downloadBlob(new Blob([text], { type: "text/calendar;charset=utf-8" }), name);
  }
  ACT["ev-ics"] = el => { const ev = evOf(el.dataset.id); if (!ev) return; icsDownload([ev], "whoswhere-" + C.fileSlug(ev.title) + "-" + ev.date + ".ics"); toast("Calendar file saved. Open it to add the event.", "ok"); };
  ACT["week-ics"] = () => {
    const [ws, we] = WW.weekRange(), list = C.eventsInRange(S.events, ws, we);
    if (!list.length) return toast("Nothing is planned this week, so there is nothing to add.", "error");
    icsDownload(list, "whoswhere-week-" + ws + ".ics"); toast("Calendar file saved with " + list.length + (list.length === 1 ? " event." : " events."), "ok");
  };
  ACT["all-ics"] = () => {
    if (!S.events.length) return toast("There are no events yet.", "error");
    icsDownload(S.events, "whoswhere-everything.ics"); toast("Calendar file saved with " + S.events.length + (S.events.length === 1 ? " event." : " events."), "ok");
  };
  function weekTextNow() { const [ws] = WW.weekRange(); return C.weekText(S.events, S.people, ws, WW.h24()); }
  ACT["copy-week"] = async () => {
    const text = weekTextNow();
    try {
      if (!(navigator.clipboard && navigator.clipboard.writeText)) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      toast("Copied. Paste it into your group chat.", "ok");
    } catch (e) {
      openSheet({
        title: "Copy this week", cls: "copy",
        html: '<p class="msg">Your browser wouldn’t copy for you. Press and hold in the box, choose Select all, then Copy.</p><textarea id="copybox" readonly rows="12" style="margin-top:10px;font-size:15px">' + esc(text) + "</textarea>",
        footer: '<button type="button" class="btn ghost" data-close>Done</button><button type="button" class="btn grow2" data-act="select-copy">Select all</button>',
        autofocus: "#copybox"
      });
    }
  };
  ACT["select-copy"] = el => { const t = $("#copybox", sheetOf(el).el); t.focus(); t.select(); try { document.execCommand("copy"); } catch (e) { /* ignore */ } };
  ACT["share-week"] = async () => {
    try { await navigator.share({ title: "Who's Where: " + C.weekTitle(WW.weekRange()[0]), text: weekTextNow() }); } catch (e) { if (!(e && e.name === "AbortError")) toast("Couldn't open the share menu. Use Copy week as text instead.", "error"); }
  };
  function printHTML() {
    const [ws] = WW.weekRange(), h24 = WW.h24();
    let h = "<h1>Who’s Where: week of " + esc(C.weekTitle(ws)) + "</h1>";
    for (let i = 0; i < 7; i++) {
      const d = C.addDays(ws, i), list = C.eventsOn(S.events, d);
      h += "<h2>" + esc(C.fmtDate(d, "day")) + "</h2>";
      if (!list.length) { h += '<p class="pnone">Nothing planned</p>'; continue; }
      h += "<table><tbody>" + list.map(ev => "<tr><td class=\"pt\">" + esc(C.fmtRange(ev.start, ev.end, h24)) + (C.crossesMidnight(ev) ? "<br>(next day)" : "") + "</td><td><b>" + esc(ev.title) + "</b>" + (ev.place ? "<br>" + esc(ev.place) : "") + (ev.address ? "<br>" + esc(ev.address) : "") +
        (ev.early ? "<br>Arrive by " + esc(C.fmtAbs(C.absArrive(ev), h24, ev.date)) : "") + "</td><td>" + esc(ev.kids.map(k => S.pm[k] ? S.pm[k].name : "").filter(Boolean).join(", ")) +
        "</td><td>" + (ev.driver === "none" ? "" : "Drive: " + esc(C.isAdultId(ev.driver) && S.pm[ev.driver] ? S.pm[ev.driver].name : "needed")) + (ev.snack ? "<br>Snack: " + esc(ev.snack === "open" ? "needed" : (S.pm[ev.snack] || { name: "" }).name) : "") + "</td></tr>" +
        (ev.notes ? '<tr><td></td><td colspan="3" class="pnote">' + esc(ev.notes) + "</td></tr>" : "")).join("") + "</tbody></table>";
    }
    return h;
  }
  ACT["print-week"] = () => {
    $("#printbox").innerHTML = printHTML();
    document.body.classList.add("print-week");
    const done = () => { document.body.classList.remove("print-week"); $("#printbox").innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    try { window.print(); } catch (e) { done(); toast("Couldn't open the print dialog.", "error"); return; }
    setTimeout(() => { if (document.body.classList.contains("print-week") && !window.__keepPrint) done(); }, 1500);
  };
  WW.printHTML = printHTML;
})();
