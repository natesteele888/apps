/* Film Lite tags: the "Tag this moment" editor, and drawing on the paused frame. */
(function () {
  "use strict";
  const FL = window.FL, C = FL.C, $ = FL.$, esc = FL.esc, I = FL.I, D = FL.data, ACT = FL.ACT, R = FL.Player;
  const P = () => R.state();
  const round3 = n => Math.round(n * 1000) / 1000;
  const fmt = t => C.fmtTime(t, 1);
  const WIDE = "(min-width: 900px), (orientation: landscape) and (max-height: 600px)";
  const isWide = () => { try { return window.matchMedia(WIDE).matches; } catch (e) { return false; } };

  /* ---------- the tag editor (a docked sheet: the video and its controls stay usable above it) ---------- */
  function edHTML(d, parts) {
    const kinds = C.CATS.map(c => '<button type="button" class="chip c-' + c.id + '" data-kind="' + c.id + '" aria-pressed="' + (d.cat === c.id) + '"><span class="dot"></span>' + esc(c.label) + "</button>").join("");
    const plist = parts.slice(); if (d.part && plist.indexOf(d.part) < 0) plist.push(d.part);
    const partsHtml = plist.length ? '<div class="ed-sec"><span class="label" id="edPartL">Which part (optional)</span><div class="chips scroll" role="group" aria-labelledby="edPartL">' +
      plist.map(x => '<button type="button" class="chip" data-part="' + esc(x) + '" aria-pressed="' + (d.part === x) + '">' + esc(x) + "</button>").join("") + "</div></div>" : "";
    const times = '<div class="tg-times"><div class="tm-box"><span class="label">Start</span><b id="edS"></b><div class="acts"><button type="button" data-act="ed-set-start">Set start here</button></div></div>' +
      '<div class="tm-box"><span class="label">End (optional)</span><b id="edE"></b><div class="acts"><button type="button" data-act="ed-set-end">Set end here</button><button type="button" class="sm" id="edClr" data-act="ed-clr-end" aria-label="Remove the end time">' + I.x.replace("<svg", '<svg width="16" height="16"') + "</button></div></div></div>";
    return '<div class="ed-sec"><span class="label" id="edKindL">What kind</span><div class="chips cat" role="group" aria-labelledby="edKindL">' + kinds + "</div></div>" + partsHtml +
      '<div class="ed-sec"><label class="label" for="edNote">Note</label><textarea id="edNote" maxlength="500" rows="2" placeholder="What do you see? What should change?">' + esc(d.note) + '</textarea><div class="counter" id="edCount"></div></div>' + times +
      '<div class="ed-sec"><span class="label">Drawing</span><div class="drawrow"><span class="txt" id="edDrawTxt"></span><button type="button" class="btn small ghost" id="edDrawBtn" data-act="ed-draw"></button><button type="button" class="btn small danger" id="edDrawRm" data-act="ed-draw-rm">Remove</button></div></div>';
  }
  function refreshEd() {
    const p = P(), d = p && p.draft; if (!d || !$("#edS")) return;
    $("#edS").textContent = fmt(d.t); $("#edE").textContent = d.e != null ? fmt(d.e) : "none"; $("#edClr").hidden = d.e == null;
    $("#edCount").textContent = ($("#edNote").value.length) + "/500";
    $("#edDrawTxt").textContent = d.d ? "Drawing with " + d.d.s.length + (d.d.s.length === 1 ? " shape" : " shapes") + (d.dt != null && !C.sameFrame(d.dt, d.t, p.fps) ? " (on another frame)" : "") : "None yet";
    $("#edDrawBtn").textContent = d.d ? "Edit drawing" : "Draw on this frame"; $("#edDrawRm").hidden = !d.d;
  }
  function layoutDock() {
    const p = P(), ed = p && p.editor; if (!ed || ed.closed) return;
    if (isWide()) { ed.el.style.removeProperty("--dock-h"); return; }
    const top = p.el.plRest.getBoundingClientRect().top, h = Math.max(250, Math.min(window.innerHeight * 0.85, window.innerHeight - top));
    ed.el.style.setProperty("--dock-h", Math.round(h) + "px");
  }
  R.openEditor = openEditor;
  function openEditor(existing, draftIn) {
    const p = P(); if (!p || p.still || p.drawMode) return;
    if (p.editor && !p.editor.closed) { p.keepDraft = false; p.editor.close(); }
    p.v.pause();
    const parts = C.partsFor(D.settings);
    const draft = draftIn || (existing ? JSON.parse(JSON.stringify(existing)) : { id: null, t: round3(p.v.currentTime), e: null, cat: p.lastCat || "fix", part: "", note: "", d: null });
    if (!draftIn) { draft.dt = draft.d ? draft.t : null; if (existing) draft.eid = existing.id; }
    p.draft = draft; p.keepDraft = false;
    const wasKept = !!draftIn;
    p.editor = FL.openSheet({
      title: draft.eid ? "Edit tag" : "Tag this moment", dock: true, cls: "tag-editor", html: edHTML(draft, parts),
      footer: (draft.eid ? '<button type="button" class="btn danger" data-act="ed-delete">Delete</button>' : "") + '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-act="ed-save">Save tag</button>',
      onOpen(api) {
        p.el.player.classList.add("docked");
        refreshEd();
        api.body.addEventListener("click", e => {
          const k = e.target.closest("[data-kind]"), pt = e.target.closest("[data-part]");
          if (k) { draft.cat = k.dataset.kind; FL.$$("[data-kind]", api.body).forEach(b => b.setAttribute("aria-pressed", String(b === k))); }
          if (pt) { draft.part = draft.part === pt.dataset.part ? "" : pt.dataset.part; FL.$$("[data-part]", api.body).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.part === draft.part))); }
        });
        $("#edNote", api.el).addEventListener("input", e => { draft.note = e.target.value; refreshEd(); });
        requestAnimationFrame(() => { layoutDock(); });
        window.addEventListener("resize", layoutDock);
        if (wasKept) setTimeout(() => { try { api.sheet.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
      },
      onClose() {
        window.removeEventListener("resize", layoutDock);
        const q = P(); if (!q) return;
        q.el.player.classList.remove("docked");
        if (!q.keepDraft) { q.draft = null; }
        q.editor = null;
      }
    });
  }
  ACT["tag-now"] = () => { const p = P(); if (!p || p.still || p.drawMode) return; openEditor(null); };
  ACT["tag-edit"] = el => {
    const p = P(); if (!p || p.drawMode) return;
    const g = p.clip.tags.filter(x => x.id === el.dataset.id)[0]; if (!g) return;
    p.v.pause(); R.seek(g.t, { user: true });
    openEditor(g);
  };
  ACT["ed-set-start"] = () => {
    const p = P(), d = p && p.draft; if (!d) return;
    d.t = round3(p.v.currentTime); if (d.e != null && d.e <= d.t + 0.0009) { d.e = null; FL.toast("The end was before the new start, so it was cleared."); }
    if (d.d && d.dt != null && !C.sameFrame(d.dt, d.t, p.fps)) FL.toast("Heads up: the drawing was made on a different frame.");
    refreshEd();
  };
  ACT["ed-set-end"] = () => {
    const p = P(), d = p && p.draft; if (!d) return;
    const t = round3(p.v.currentTime);
    if (t <= d.t + 0.0009) return FL.toast("The end has to come after the start. Move the video forward first.", "error");
    d.e = t; refreshEd();
  };
  ACT["ed-clr-end"] = () => { const p = P(), d = p && p.draft; if (!d) return; d.e = null; refreshEd(); };
  ACT["ed-draw-rm"] = () => { const p = P(), d = p && p.draft; if (!d) return; d.d = null; d.dt = null; refreshEd(); };
  ACT["ed-save"] = () => {
    const p = P(), d = p && p.draft; if (!d) return;
    if (d.e != null && d.e <= d.t + 0.0009) return FL.toast("The end has to come after the start.", "error");
    const tags = p.clip.tags;
    const tag = C.sanitizeTag({ id: d.eid || undefined, t: d.t, e: d.e, cat: d.cat, part: d.part, note: $("#edNote").value, d: d.d });
    if (!tag) return FL.toast("Couldn't save that tag.", "error");
    const i = tags.map(x => x.id).indexOf(tag.id);
    if (i >= 0) tags[i] = tag;
    else { if (tags.length >= C.MAX_TAGS) return FL.toast("That's the most tags one clip can hold (" + C.MAX_TAGS + ").", "error"); tags.push(tag); }
    p.lastCat = tag.cat;
    D.saveClip(p.clip);
    const ed = p.editor; p.keepDraft = false; if (ed) ed.close();
    R.renderMarks(); R.renderTags(); R.resetOverlayKey(); R.refreshOverlay(true);
    FL.toast(i >= 0 ? "Tag updated." : "Tag saved at " + fmt(tag.t) + ".", "ok");
  };
  ACT["ed-delete"] = () => {
    const p = P(), d = p && p.draft; if (!d || !d.eid) return;
    FL.confirmSheet({
      title: "Delete this tag?", message: "The tag at " + fmt(d.t) + (d.note ? ' ("' + d.note.slice(0, 60) + (d.note.length > 60 ? "..." : "") + '")' : "") + " will be removed. This can't be undone.", confirmText: "Delete tag", danger: true,
      onConfirm() {
        const q = P(); if (!q) return;
        q.clip.tags = q.clip.tags.filter(x => x.id !== d.eid);
        if (q.loop && q.loop.tagId === d.eid) R.clearLoop();
        if (q.clip.tags.length || q.clip.id === "example") D.saveClip(q.clip); else D.deleteClip(q.clip.id);
        q.keepDraft = false; if (q.editor) q.editor.close();
        R.renderMarks(); R.renderTags(); R.resetOverlayKey(); R.refreshOverlay(true);
        FL.toast("Tag deleted.", "ok");
      }
    });
  };
  ACT["ed-draw"] = () => {
    const p = P(), d = p && p.draft; if (!d) return;
    d.note = $("#edNote").value;
    if (d.dt == null) d.dt = p.v.currentTime;
    p.keepDraft = true; if (p.editor) p.editor.close();
    if (!C.sameFrame(p.v.currentTime, d.t, p.fps)) R.seek(d.t);
    enterDraw({ strokes: d.d ? d.d.s : [], target: "draft" }); // same tick as the sheet closing, so the browser history needs no change
  };

  /* ---------- drawing mode ---------- */
  function enterDraw(o) {
    const p = P(); if (!p || p.still || p.drawMode) return;
    p.v.pause();
    p.drawMode = true; p.drawTarget = o.target; p.drawT = p.v.currentTime; p.drawOrig = JSON.stringify(o.strokes || []);
    p.el.stage.classList.add("drawing"); p.el.stage.classList.remove("idle"); p.el.player.classList.add("drawmode"); p.el.plDraw.hidden = false; p.el.stageBadge.hidden = true;
    p.ed = FL.Draw.Editor(p.el.ov, { ar: p.ar, strokes: o.strokes, onChange: updateDrawUI, onFull: () => FL.toast("That's the most shapes one drawing can hold.", "error") });
    FL.pushLayer("draw", () => exitDraw({ fromHistory: true }));
    p.el.drSave.textContent = o.target === "draft" ? "Use this drawing" : "Save with tag";
    updateDrawUI();
    try { p.el.plDraw.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function exitDraw(o) {
    const p = P(); if (!p || !p.drawMode) return;
    const target = p.drawTarget, draft = p.draft;
    p.drawMode = false; p.drawTarget = null;
    if (p.ed) { p.ed.destroy(); p.ed = null; }
    p.el.stage.classList.remove("drawing"); p.el.player.classList.remove("drawmode"); p.el.plDraw.hidden = true;
    if (!o || !o.fromHistory) FL.popLayer("draw");
    R.resetOverlayKey(); R.refreshOverlay(true);
    if (o && o.fromHistory && target === "draft" && draft) setTimeout(() => { if (P() && P().draft === draft) openEditor(null, draft); }, 0);
  }
  function updateDrawUI() {
    const p = P(); if (!p || !p.ed) return;
    const E = p.ed;
    FL.$$("[data-act=dr-tool]", p.el.plDraw).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === E.tool)));
    FL.$$("[data-act=dr-color]", p.el.plDraw).forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.i) === E.color)));
    FL.$$("[data-act=dr-width]", p.el.plDraw).forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.i) === E.width)));
    let hint = E.hint();
    if (E.tool === "angle" && E.strokes.length) { const last = E.strokes[E.strokes.length - 1]; if (last.k === "angle" && !E.pending) hint = "The angle is shown on the picture. Drag two more lines for another."; }
    p.el.drHint.textContent = hint;
    p.el.drSave.disabled = !E.strokes.length;
    FL.$$("[data-act=dr-undo], [data-act=dr-clear]", p.el.plDraw).forEach(b => { b.disabled = !E.strokes.length && !E.pending; });
  }
  ACT["draw"] = () => { const p = P(); if (!p || p.still || p.drawMode) return; p.draft = null; enterDraw({ strokes: [], target: "new" }); };
  ACT["dr-tool"] = el => { const p = P(); if (p && p.ed) p.ed.setTool(el.dataset.tool); };
  ACT["dr-color"] = el => { const p = P(); if (p && p.ed) p.ed.setColor(Number(el.dataset.i)); };
  ACT["dr-width"] = el => { const p = P(); if (p && p.ed) p.ed.setWidth(Number(el.dataset.i)); };
  ACT["dr-undo"] = () => { const p = P(); if (p && p.ed) p.ed.undo(); };
  ACT["dr-clear"] = () => { const p = P(); if (p && p.ed) p.ed.clear(); };
  ACT["dr-save"] = () => {
    const p = P(); if (!p || !p.drawMode || !p.ed) return;
    if (!p.ed.strokes.length) return FL.toast("Draw something first.");
    const drawing = { ar: Math.round(p.ar * 10000) / 10000, s: p.ed.strokes.map(s => JSON.parse(JSON.stringify(s))) }, t = p.drawT, target = p.drawTarget, draft = p.draft;
    exitDraw();
    if (target === "draft" && draft) { draft.d = drawing; draft.dt = t; openEditor(null, draft); }
    else openEditor(null, { id: null, t: round3(t), e: null, cat: p.lastCat || "fix", part: "", note: "", d: drawing, dt: t });
  };
  ACT["dr-cancel"] = () => {
    const p = P(); if (!p || !p.drawMode) return;
    const go = () => { const target = p.drawTarget, draft = p.draft; exitDraw(); if (target === "draft" && draft) openEditor(null, draft); };
    const changed = p.ed && JSON.stringify(p.ed.strokes) !== p.drawOrig;
    if (changed) FL.confirmSheet({ title: "Discard this drawing?", message: "What you drew on this frame won't be kept.", confirmText: "Discard", cancelText: "Keep drawing", danger: true, onConfirm: go });
    else go();
  };
})();
