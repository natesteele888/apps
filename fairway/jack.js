/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway Jack: the caddie's screens before his AI brain is switched on. Each golfer's own caddie notes per course and
   hole (typed or spoken into the phone), read back aloud by the phone's own voice, and Jack's settings (language
   level, kid or beginner lock, earbuds, how he listens). Everything here stays on this phone. No AI calls.
   Loaded before app.js; the Score tab calls FW.jack.holeHtml and FW.jack.wire. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW = window.FW || {};
  const U = () => FW.ui;
  const J = FW.jack = {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const NK = "fw:cnotes", SK = "fw:jack";
  J.settings = () => C.cleanJack(FW.LS.get(SK, {}));
  J.allNotes = () => C.cleanCourseNotes(FW.LS.get(NK, {}));
  J.notesFor = (course, h) => ((J.allNotes()[C.courseKey(course)] || {})[h] || []);
  function setNotes(course, h, list) {
    const all = J.allNotes(), ck = C.courseKey(course), holes = all[ck] || {};
    if (list.length) holes[h] = list.slice(0, 5); else delete holes[h];
    if (Object.keys(holes).length) all[ck] = holes; else delete all[ck];
    FW.LS.set(NK, all);
  }
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = () => !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  J.say = function (text) {
    if (!canSpeak()) return false;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1; speechSynthesis.speak(u); return true; } catch (e) { return false; }
  };

  // A bar on the Score tab under the hole card: your note for this hole, or a nudge to add one.
  J.holeHtml = function (ev, h) {
    const esc = U().esc, l = J.notesFor(ev.course, h);
    return `<button type="button" class="jackbar" id="jackopen"><span><b>Jack</b><small>${l.length ? esc(l[0]) + (l.length > 1 ? ` (+${l.length - 1} more)` : "") : `Add your own note for hole ${h}`}</small></span><span class="chev">Notes</span></button>`;
  };
  J.wire = function (el, ev, mine, h) { const b = $("#jackopen", el); if (b) b.onclick = () => J.sheet(ev, mine, h); };

  J.sheet = function (ev, mine, h) {
    const u = U(), esc = u.esc;
    const draw = box => {
      const l = J.notesFor(ev.course, h), js = J.settings();
      $(".sheet-b", box).innerHTML = `<p class="msg small">Your notes for hole ${h} at ${esc(ev.course.name)}, in your own words. They stay on this phone and come up every time you play this hole.</p>
        ${l.length ? `<ul class="list">${l.map((t, i) => `<li class="ritem"><span>${esc(t)}</span><button type="button" class="x" data-del="${i}" aria-label="Remove this note">×</button></li>`).join("")}</ul>` : ""}
        ${l.length < 5 ? `<label class="fld"><span>Add a note</span><textarea id="jn" rows="2" maxlength="200" placeholder="Hate this hole. Stay up on the right."></textarea></label>
        <div class="row2">${Rec ? `<button type="button" class="btn" id="jmic">Say it</button>` : ""}<button type="button" class="btn primary" id="jsave">Save note</button></div>
        <p class="msg small" id="jmsg" role="status"></p>` : `<p class="msg small">Five notes is the most for one hole. Remove one to add another.</p>`}
        ${canSpeak() ? `<button type="button" class="btn block" id="jread">Read hole ${h} to me</button>` : ""}
        ${FW.bag ? `<button type="button" class="btn ghost block" id="jbag">My bag</button>` : ""}
        <button type="button" class="btn ghost block" id="jset">Jack's settings · ${esc(C.JACK_LANGS.find(x => x[0] === js.lang)[1])}</button>`;
      $$("[data-del]", box).forEach(b => b.onclick = () => { const n = l.slice(); n.splice(+b.dataset.del, 1); setNotes(ev.course, h, n); draw(box); u.render(); });
      const save = $("#jsave", box);
      if (save) save.onclick = () => {
        const t = $("#jn", box).value.replace(/\s+/g, " ").trim().slice(0, 200);
        if (!t) { $("#jmsg", box).textContent = "Type or say a note first."; return; }
        setNotes(ev.course, h, l.concat(t)); draw(box); u.render(); u.toast("Saved for hole " + h);
      };
      const mic = $("#jmic", box);
      if (mic) mic.onclick = () => {
        let rec; try { rec = new Rec(); } catch (e) { $("#jmsg", box).textContent = "This phone can't listen here. Type the note instead."; return; }
        rec.lang = navigator.language || "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
        mic.disabled = true; $("#jmsg", box).textContent = "Listening…";
        rec.onresult = e => { const t = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : ""; const ta = $("#jn", box); if (ta && t) ta.value = (ta.value ? ta.value + " " : "") + t; };
        rec.onerror = () => { $("#jmsg", box).textContent = "Didn't catch that. Try again or type it."; };
        rec.onend = () => { mic.disabled = false; const m = $("#jmsg", box); if (m && m.textContent === "Listening…") m.textContent = ""; };
        try { rec.start(); } catch (e) { mic.disabled = false; $("#jmsg", box).textContent = "This phone can't listen here. Type the note instead."; }
      };
      const rd = $("#jread", box); if (rd) rd.onclick = () => J.say(C.holeTalk(ev, mine, h, J.allNotes(), C.jackLevel(J.settings()), FW.bag ? FW.bag.get() : null));
      $("#jset", box).onclick = () => J.settingsSheet(() => J.sheet(ev, mine, h));
      const jb = $("#jbag", box); if (jb) jb.onclick = () => FW.bag.sheet(() => J.sheet(ev, mine, h));
    };
    u.sheet("Jack · hole " + h, "", draw);
  };

  J.settingsSheet = function (back) {
    const u = U(), esc = u.esc, st = J.settings();
    let asking = false;
    const draw = box => {
      const opt = (name, cur, list) => `<div class="hrseg" role="group" aria-label="${name}">${list.map(([v, l]) => `<button type="button" data-js="${name}" data-v="${v}" aria-pressed="${cur === v}" ${name === "lang" && st.kid && v !== "clean" ? "disabled" : ""}>${esc(l)}</button>`).join("")}</div>`;
      $(".sheet-b", box).innerHTML = `<h2 class="sec">Language</h2>${opt("lang", st.lang, C.JACK_LANGS)}
        ${asking ? `<div class="hrjack"><small>Adults only</small><p>Super crude is for adults, and Jack only talks like that through earbuds. Are you 18 or older?</p>
          <div class="row2"><button type="button" class="btn primary small" id="jadult">Yes, I'm 18 or older</button><button type="button" class="btn small" id="jno">No</button></div></div>` : ""}
        <p class="msg small">Every level is swearing only, never anything sexual. Clean is the default.${st.lang === "crude" ? " Super crude only plays when your earbuds are in; otherwise Jack drops to A lot." : ""}</p>
        <label class="betck"><input type="checkbox" id="jkid" ${st.kid ? "checked" : ""}> Kid or beginner profile (always Clean)</label>
        <label class="betck"><input type="checkbox" id="jbuds" ${st.buds ? "checked" : ""}> My earbuds are in</label>
        <h2 class="sec">How Jack listens</h2>${opt("listen", st.listen, [["hey", "Say \"Hey Jack\""], ["always", "Always"], ["off", "Off"]])}
        <p class="msg small">Jack's voice and listening turn on with his AI brain. Until then your notes are read by the phone's own voice when you tap Read it to me.</p>
        <button type="button" class="btn primary block" id="jdone">Save</button>`;
      $$("[data-js]", box).forEach(b => b.onclick = () => {
        const k = b.dataset.js, v = b.dataset.v;
        if (k === "lang" && v === "crude" && !st.adult) { asking = true; draw(box); return; }
        st[k] = v; asking = false; draw(box);
      });
      const ad = $("#jadult", box); if (ad) ad.onclick = () => { st.adult = true; st.lang = "crude"; asking = false; draw(box); };
      const no = $("#jno", box); if (no) no.onclick = () => { asking = false; draw(box); };
      $("#jkid", box).onchange = e => { st.kid = e.target.checked; if (st.kid) st.lang = "clean"; draw(box); };
      $("#jbuds", box).onchange = e => { st.buds = e.target.checked; };
      $("#jdone", box).onclick = () => { FW.LS.set(SK, C.cleanJack(st)); u.toast("Saved"); if (back) back(); else u.closeSheet(); };
    };
    u.sheet("Jack's settings", "", draw);
  };
})();
