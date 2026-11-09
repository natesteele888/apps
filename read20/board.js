/* Read 20: the Sounds board. Pick a letter and hear its sound, drop letters into the boxes, then play them left to right
   to hear how they blend. Tap a letter once to hear it, tap it again (or tap a box) to add it, or drag it to a box. */
(function (root) {
  "use strict";
  const A = root.R20Audio;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SLOTS = 6;

  const VOWELS = ["a", "e", "i", "o", "u"], LONG = { a: "a_long", e: "e_long", i: "i_long", o: "o_long", u: "u_long" };
  const CONS = [["b"], ["c", "k"], ["d"], ["f"], ["g"], ["h"], ["j"], ["k"], ["l"], ["m"], ["n"], ["p"], ["qu"], ["r"], ["s"], ["t"], ["v"], ["w"], ["x"], ["y"], ["z"]];
  // [letters, sound clip, example word]
  const TEAMS = [["sh", "sh", "ship"], ["ch", "ch", "chip"], ["th", "th", "thin"], ["ck", "k", "back"], ["ng", "ng", "ring"], ["wh", "w", "when"],
    ["ai", "a_long", "rain"], ["ay", "a_long", "day"], ["ee", "e_long", "tree"], ["ea", "e_long", "eat"], ["oa", "o_long", "boat"], ["igh", "i_long", "high"],
    ["oo", "oo", "moon"], ["oo", "oo_short", "book"], ["ou", "ou", "out"], ["ow", "ou", "cow"], ["oi", "oi", "coin"], ["aw", "aw", "saw"],
    ["ar", "ar", "car"], ["or", "or", "for"], ["er", "er", "her"], ["ew", "oo", "new"]];
  const ALL_SOUNDS = ["b", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "qu", "r", "s", "t", "v", "w", "x", "y", "z", "sh", "ch", "th", "ng", "a", "e", "i", "o", "u", "a_long", "e_long", "i_long", "o_long", "u_long", "oo", "oo_short", "ou", "oi", "ar", "or", "er", "aw"];
  root.R20SoundIds = ALL_SOUNDS;
  // the y tile says "yuh"; the sound clip for it is named y
  const soundOfCons = c => c[1] || c[0];

  /* Words she can make. All the words in the stories, plus a list of common short ones. */
  const EXTRA = ("bat bag ban cab cap cat dad fan fat gap gas had ham hat jam jar lab lap mad man map mat nap pad pan pat rag ram ran rat sad sat tab tag tan tap van wag yak zap " +
    "bed beg bet get hen jet led leg let men met net pen pet red set ten vet web wet yes zen bib big bit bin dig dim din dip fig fin fit gig hid hip hit jig kid kit lid lip mix pig pin pit rib rid rip sip sit six tin tip wig win zip " +
    "bog box cob cod cog cop cot dog dot fog fox God got hog hop hot job jog log lot mob mop nod not pod pop pot rob rot top tot bud bug bun bus but cub cup cut dud fun gum gun hub hug hum jug mud mug nut pub pup rub rug run sub sun tub tug " +
    "chin chop chat much rich such shed shin ship shop shot shut fish dish wish thin this that them then thick math bath path with ring sing song king long hang bang rang sang wing thing " +
    "back deck duck kick lock luck neck pack pick rock sack sock tack tick black block clap clip club crab drum flag flat flip frog grab grin plan plug skip slam slip snap spin spot step stop swim trap trip twin " +
    "cake bake lake make take rake game name same came tape cape gate late rate bike like hike kite time lime five nine dive hide ride side wide bone cone home hope nose rope rose note joke cube cute tube mule " +
    "rain train tail mail sail wait play day say way tray stay tree bee see feed need seed seat eat read team beat boat coat goat road soap toad high light night right fight moon food cool zoo boot spoon book good look cook foot " +
    "out house mouse loud cloud cow now how down town brown coin boil soil toy boy car star farm barn for corn fork horn her fern bird girl turn burn saw paw draw claw new few chew grew").split(/\s+/);
  let known = null;
  function knownWords() {
    if (known) return known; known = new Set(EXTRA);
    try { root.R20Books.books.forEach(b => b.pages.forEach(p => p.text.split(/\s+/).forEach(w => { w = root.R20Words ? root.R20Words.clean(w) : w.toLowerCase().replace(/[^a-z]/g, ""); if (w && /^[a-z]+$/.test(w)) known.add(w); }))); } catch (e) {}
    return known;
  }

  const S = { slots: new Array(SLOTS).fill(null), sel: null, long: false, tab: "cons", playing: -1, msg: "", mounted: null };

  /* One tile in the rack as data: { t: letters, s: sound clip, kind, hint, key }. */
  function rackTiles(kind) {
    if (kind === "vowels") return VOWELS.map(v => ({ t: v, s: S.long ? LONG[v] : v, kind: "v", long: S.long, key: "v" + v }));
    if (kind === "cons") return CONS.map(c => ({ t: c[0], s: soundOfCons(c), kind: "c", key: "c" + c[0] }));
    return TEAMS.map(t => ({ t: t[0], s: t[1], kind: "t", hint: t[2], key: "t" + t[0] + t[1] }));
  }
  const tileHtml = (x, extra) => `<button class="tile k${x.kind}${extra || ""}" data-key="${esc(x.key)}" aria-label="${esc(x.t)}${x.hint ? ", as in " + esc(x.hint) : ""}"><span class="tl">${esc(x.t)}${x.long ? '<b class="mk" aria-hidden="true"></b>' : ""}</span>${x.hint ? `<small>${esc(x.hint)}</small>` : ""}</button>`;
  const find = key => { for (const k of ["vowels", "cons", "teams"]) { const t = rackTiles(k).find(x => x.key === key); if (t) return t; } return null; };
  const word = () => S.slots.filter(Boolean).map(x => x.t).join("");
  const filled = () => S.slots.map((x, i) => (x ? i : -1)).filter(i => i >= 0);

  function html() {
    const can = A.canSpeak();
    return `<header class="top"><h1>🔤 Sounds</h1></header>
    <p class="bhelp">Tap a letter to hear it. Tap it again to add it.</p>
    <div class="bslots" id="bslots" role="group" aria-label="Letter boxes"></div>
    <div class="bwordrow"><button class="btn alt sm" id="bback" aria-label="Take the last letter off">⌫</button><p class="bword" id="bword" aria-live="polite"></p><button class="btn alt sm" id="bclear" aria-label="Clear all the boxes">✕</button></div>
    <div class="bbtns">
      <button class="btn" id="bplay">▶ Sound it out</button>
      <button class="btn alt" id="bblend">⚡ Blend</button>
      ${can ? '<button class="btn alt" id="bsay">🗣 Say it</button>' : ""}
    </div>
    <p class="bmsg" id="bmsg" role="status"></p>
    <div class="rackhead"><b>Vowels</b>
      <div class="seg" role="group" aria-label="Vowel sounds"><button id="bshort" class="${S.long ? "" : "on"}" aria-pressed="${!S.long}">Short</button><button id="blong" class="${S.long ? "on" : ""}" aria-pressed="${S.long}">Long</button></div></div>
    <div class="rack v" id="rackv"></div>
    <div class="tabs2" role="tablist"><button role="tab" id="tcons" class="${S.tab === "cons" ? "on" : ""}" aria-selected="${S.tab === "cons"}">Consonants</button><button role="tab" id="tteams" class="${S.tab === "teams" ? "on" : ""}" aria-selected="${S.tab === "teams"}">Letter teams</button></div>
    <div class="rack ${S.tab}" id="rackc"></div>`;
  }

  function paint() {
    const el = S.mounted; if (!el) return;
    const sl = el.querySelector("#bslots"); const next = S.slots.indexOf(null);
    sl.innerHTML = S.slots.map((x, i) => `<button class="slot ${x ? "full k" + x.kind : ""} ${S.playing === i ? "now" : ""} ${S.sel && !x && i === next ? "next" : ""}" data-i="${i}" aria-label="Box ${i + 1}${x ? ", " + esc(x.t) : ", empty"}">${x ? `<span class="tl">${esc(x.t)}${x.long ? '<b class="mk"></b>' : ""}</span>` : ""}</button>`).join("");
    const w = word(); el.querySelector("#bword").textContent = w ? w.split("").join(" ") : "";
    const hasAny = !!w, one = S.slots.filter(Boolean).length;
    el.querySelector("#bplay").disabled = !hasAny; el.querySelector("#bblend").disabled = one < 2;
    const say = el.querySelector("#bsay"); if (say) say.disabled = !hasAny;
    el.querySelector("#bback").disabled = !hasAny; el.querySelector("#bclear").disabled = !hasAny;
    el.querySelector("#bmsg").textContent = S.msg;
    el.querySelectorAll(".tile").forEach(t => t.classList.toggle("sel", !!S.sel && t.dataset.key === S.sel.key));
    sl.querySelectorAll(".slot").forEach(b => (b.onclick = () => slotTap(+b.dataset.i)));
  }
  function paintRacks() {
    const el = S.mounted; if (!el) return;
    el.querySelector("#rackv").innerHTML = rackTiles("vowels").map(x => tileHtml(x)).join("");
    el.querySelector("#rackc").innerHTML = rackTiles(S.tab).map(x => tileHtml(x)).join("");
    paint();
  }

  /* ----- actions ----- */
  function select(x) { S.sel = x; S.msg = ""; A.stop(); A.play(x.s); paint(); }
  function put(x, i) {
    if (i < 0 || i >= SLOTS) return false;
    S.slots[i] = { t: x.t, s: x.s, kind: x.kind, long: !!x.long }; S.sel = null; S.msg = ""; paint(); return true;
  }
  function addNext(x) { const i = S.slots.indexOf(null); if (i < 0) { S.msg = "The boxes are full. Tap ⌫ Back to take a letter off."; paint(); return false; } return put(x, i); }
  function tileTap(x) { if (S.sel && S.sel.key === x.key) { A.play(x.s); addNext(x); } else select(x); }
  function slotTap(i) {
    if (S.sel) { put(S.sel, i); return; }
    const x = S.slots[i]; if (x) { A.stop(); A.play(x.s); S.msg = ""; paint(); }
  }
  function back() { const f = filled(); if (!f.length) return; S.slots[f[f.length - 1]] = null; S.msg = ""; paint(); }
  function clear() { A.stop(); S.slots.fill(null); S.sel = null; S.msg = ""; S.playing = -1; paint(); }
  function result(speakIt) {
    const w = word(); if (!w) return;
    if (filled().length < 2) { S.msg = ""; paint(); return; }
    if (knownWords().has(w)) { S.msg = "🎉 You made “" + w + "”!"; if (speakIt) setTimeout(() => A.speak(w), 150); }
    else S.msg = "“" + w + "” is not a word I know, but it is fun to say! Try changing a letter.";
    paint();
  }
  async function play(blend) {
    const ids = filled().map(i => S.slots[i].s), idx = filled(); if (!ids.length) return;
    S.sel = null; S.msg = ""; A.stop();
    const ok = await A.sequence(ids, { gap: blend ? 0 : 170, early: blend ? 0.55 : 0, rate: blend ? 1.15 : 1, step: k => { S.playing = k < 0 ? -1 : idx[k]; paint(); } });
    if (ok) result(true); else { S.playing = -1; paint(); }
  }
  function sayIt() { const w = word(); if (!w) return; A.stop(); A.speak(w); result(false); }

  /* ----- drag a letter to a box ----- */
  function wireDrag(el) {
    let st = null, ghost = null;
    const slotAt = (x, y) => { const e = document.elementFromPoint(x, y); const b = e && e.closest && e.closest(".slot"); return b && el.contains(b) ? b : null; };
    const done = () => { if (ghost) ghost.remove(); ghost = null; el.querySelectorAll(".slot.over").forEach(b => b.classList.remove("over")); st = null; };
    el.addEventListener("pointerdown", e => {
      const b = e.target.closest && e.target.closest(".tile"); if (!b || e.button) return;
      st = { key: b.dataset.key, x: e.clientX, y: e.clientY, moved: false, b };
      try { b.setPointerCapture(e.pointerId); } catch (x) {}
    });
    el.addEventListener("pointermove", e => {
      if (!st) return;
      if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) {
        st.moved = true; const x = find(st.key); if (!x) { done(); return; }
        select(x); ghost = st.b.cloneNode(true); ghost.classList.add("ghost"); document.body.appendChild(ghost);
      }
      if (st && st.moved && ghost) {
        ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px";
        el.querySelectorAll(".slot.over").forEach(b => b.classList.remove("over")); const s = slotAt(e.clientX, e.clientY); if (s) s.classList.add("over");
      }
    });
    const up = e => {
      if (!st) return; const s = st, moved = s.moved, key = s.key; const target = moved ? slotAt(e.clientX, e.clientY) : null; done();
      if (!moved) { if (e.type === "pointerup") { const x = find(key); if (x) tileTap(x); } return; }
      const x = find(key); if (x && target) { A.play(x.s); put(x, +target.dataset.i); }
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", e => { if (st) done(); });
    el.addEventListener("contextmenu", e => e.preventDefault());
  }

  function mount(el) {
    S.mounted = el; el.innerHTML = html(); paintRacks();
    el.querySelector("#bplay").onclick = () => play(false); el.querySelector("#bblend").onclick = () => play(true);
    if (el.querySelector("#bsay")) el.querySelector("#bsay").onclick = sayIt;
    el.querySelector("#bback").onclick = back; el.querySelector("#bclear").onclick = clear;
    el.querySelector("#bshort").onclick = () => { S.long = false; S.sel = null; paintRacks(); };
    el.querySelector("#blong").onclick = () => { S.long = true; S.sel = null; paintRacks(); };
    el.querySelector("#tcons").onclick = () => { S.tab = "cons"; S.sel = null; el.querySelector("#tcons").classList.add("on"); el.querySelector("#tteams").classList.remove("on"); el.querySelector("#tcons").setAttribute("aria-selected", "true"); el.querySelector("#tteams").setAttribute("aria-selected", "false"); el.querySelector("#rackc").className = "rack cons"; paintRacks(); };
    el.querySelector("#tteams").onclick = () => { S.tab = "teams"; S.sel = null; el.querySelector("#tteams").classList.add("on"); el.querySelector("#tcons").classList.remove("on"); el.querySelector("#tteams").setAttribute("aria-selected", "true"); el.querySelector("#tcons").setAttribute("aria-selected", "false"); el.querySelector("#rackc").className = "rack teams"; paintRacks(); };
    wireDrag(el);
    A.preload(ALL_SOUNDS);
  }
  function unmount() { A.stop(); S.mounted = null; S.playing = -1; S.sel = null; }

  root.R20Board = { mount, unmount, known: w => knownWords().has(String(w).toLowerCase()), state: () => ({ word: word(), slots: S.slots.map(x => x && x.t), sel: S.sel && S.sel.key, long: S.long, msg: S.msg }) };
  if (typeof module !== "undefined" && module.exports) module.exports = root.R20Board;
})(typeof window !== "undefined" ? window : globalThis);
