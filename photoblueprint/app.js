/* Photo Blueprint: the screens. Map of pins, the contact sheet, one photo's blueprint sheet, the editor, and Me.
   Hash routes (#map, #sheets, #s/<id>, #new, #edit/<id>, #me, #s=<shared sheet>), so the phone's Back button just works. */
(function () {
  "use strict";
  const C = window.SPCore, X = window.SPExif, F = window.SPFigures, S = window.SPStore, L = window.L;
  const VERSION = "1.1.0", APP_URL = "https://natesteele888.github.io/apps/photoblueprint/";
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const view = $("#view"), nav = $("#nav"), feedEl = $("#feed"), toastEl = $("#toast");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const state = { feed: S.settings.get("feed", "all"), theme: S.settings.get("theme", "blueprint"), units: S.settings.get("units", "m"),
    pub: null, pubAt: 0, mine: null, maps: [], draft: null, image: "", chips: [], seq: 0, mapView: S.settings.get("mapView", null), clearMap: S.settings.get("clearMap", false) };
  const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png", ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#8fd3ff";
  const ICONS = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>', share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/></svg>',
    ig: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".9" fill="currentColor"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    locate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
    photo: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l1.5-2.5h5L16 6"/></svg>'
  };

  /* ---------- small helpers ---------- */
  let toastT = 0;
  function toast(msg, ms) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, ms || 2600); }
  function applyTheme() { document.documentElement.dataset.theme = state.theme; const m = $('meta[name="theme-color"]'); if (m) m.content = state.theme === "paper" ? "#f4f0e6" : "#0d2d66"; }
  function teardown() { for (const m of state.maps) { try { m.remove(); } catch (e) {} } state.maps = []; view.className = ""; }
  function go(hash) { location.hash = hash; }
  const h = s => C.fmtHeight(s.height, state.units);
  const isMine = s => !!(s._local || (S.cloud.user && s.uid === S.cloud.user.uid));
  function pinIcon(cls) { return L.divIcon({ className: "", html: '<div class="pin ' + (cls || "") + '"><i></i></div>', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] }); }
  function makeMap(el, opts) {
    const m = L.map(el, Object.assign({ zoomControl: true, attributionControl: true, worldCopyJump: true }, opts || {}));
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR, crossOrigin: true }).addTo(m);
    L.control.scale({ metric: state.units !== "ft", imperial: state.units === "ft", position: "bottomleft" }).addTo(m);
    state.maps.push(m);
    return m;
  }
  const mpp = (lat, zoom) => 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  // The field-of-view wedge: 60 screen pixels long at any zoom, as wide as the lens sees.
  function addWedge(map, s, color) {
    if (s.heading == null) return null;
    const poly = L.polygon([], { color: color || accent(), weight: 1.2, fillOpacity: .16, interactive: false });
    const upd = () => poly.setLatLngs(C.wedge(s.lat, s.lon, s.heading, C.fov(s.focal, s.sensor) || 60, mpp(s.lat, map.getZoom()) * 60));
    upd(); poly.addTo(map); map.on("zoomend", upd);
    return { poly, upd };
  }

  /* ---------- data ---------- */
  async function loadMine(force) {
    if (state.mine && !force) return state.mine;
    const recs = await S.local.all();
    const out = recs.map(r => Object.assign(C.clean(r), { _local: true, _pending: !!r.pending, _published: !!r.published }));
    if (S.cloud.user) {
      try { for (const s of await S.cloud.mySheets()) if (!out.some(o => o.id === s.id)) out.push(Object.assign(s, { _cloud: true })); } catch (e) {}
      out.sort((a, b) => (b.created || 0) - (a.created || 0));
    }
    state.mine = out; return out;
  }
  async function loadAll(force) {
    if (state.pub && !force && Date.now() - state.pubAt < 120000) return state.pub;
    state.pub = await S.cloud.publicSheets(60); state.pubAt = Date.now(); return state.pub;
  }
  // Pushes sheets saved with no signal (or before signing in) up to the cloud.
  async function pushPending() {
    if (!S.cloud.user) return;
    const recs = await S.local.all(); let n = 0;
    for (const r of recs) if (r.pending) {
      try { await S.cloud.publish(r, r.image); r.pending = false; r.published = true; r.uid = S.cloud.user.uid; await S.local.put(r); n++; } catch (e) {}
    }
    if (n) { state.mine = null; state.pub = null; toast(n === 1 ? "1 sheet published" : n + " sheets published"); if (/^#(map|sheets)?$/.test(location.hash || "#")) route(); }
  }

  /* ---------- the picture: EXIF, resize, thumbnail ---------- */
  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file)).catch(() => loadImg(file));
    return loadImg(file);
  }
  function loadImg(file) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("bad image")); }; im.src = u; });
  }
  // JPEG data URL no longer than `maxChars`, no bigger than `max` px on its long side.
  function encode(bmp, max, maxChars) {
    const w = bmp.width || bmp.naturalWidth, hh = bmp.height || bmp.naturalHeight;
    let size = C.fitImage(w, hh, max), out = "";
    for (let pass = 0; pass < 8; pass++) {
      const cv = document.createElement("canvas"); cv.width = size.w; cv.height = size.h;
      cv.getContext("2d").drawImage(bmp, 0, 0, size.w, size.h);
      for (const q of [0.84, 0.74, 0.64, 0.54, 0.45]) { out = cv.toDataURL("image/jpeg", q); if (out.length <= maxChars) return { data: out, w: size.w, h: size.h }; }
      size = C.fitImage(size.w, size.h, Math.round(Math.max(size.w, size.h) * 0.8));
    }
    return { data: out, w: size.w, h: size.h };
  }
  async function processFile(file) {
    const seq = ++state.seq;
    const [exif, bmp] = await Promise.all([X.read(file), loadBitmap(file)]);
    const full = encode(bmp, 1600, 950000), thumb = encode(bmp, 480, 64000);
    if (bmp.close) bmp.close();
    if (seq !== state.seq) return; // a later picture won
    const before = Object.assign({}, state.draft);
    state.draft = C.applyExif(state.draft, exif);
    state.draft.thumb = thumb.data; state.draft.w = full.w; state.draft.h = full.h; state.image = full.data;
    const names = { camera: "camera", lens: "lens", aperture: "aperture", shutter: "shutter", iso: "ISO", focal: "focal length", ev: "exposure comp.", taken: "date", lat: "where it was taken", heading: "direction" };
    state.chips = Object.keys(names).filter(k => (before[k] == null || before[k] === "") && state.draft[k] != null && state.draft[k] !== "").map(k => names[k]);
    if (!exif) state.chips = ["no camera notes in this file"]; else if (!state.chips.length) state.chips = ["picture updated; your notes kept"];
  }

  /* ---------- place search (OpenStreetMap's Nominatim; free, light use, one request per search) ---------- */
  async function geocode(text) {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=" + encodeURIComponent(text);
    const r = await fetch(url, { headers: { "Accept-Language": navigator.language || "en" }, cache: "no-store" });
    if (!r.ok) throw new Error("search");
    return (await r.json()).map(x => {
      const parts = String(x.display_name || "").split(", ");
      const big = /country|state|county|region|province/.test(x.addresstype || x.type || "");
      return { lat: +x.lat, lon: +x.lon, short: parts.slice(0, 2).join(", "), rest: parts.slice(2).join(", "), zoom: big ? 9 : (/city|town|village|suburb|municipality/.test(x.addresstype || x.type || "") ? 13 : 16) };
    });
  }
  function applyMapStyle() { document.documentElement.dataset.map = state.clearMap ? "clear" : "blueprint"; }

  /* ---------- nav and feed ---------- */
  function setNav(r) {
    $$("a", nav).forEach(a => { if (a.dataset.r === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    const showFeed = r === "map" || r === "sheets";
    feedEl.hidden = !showFeed;
    if (showFeed) feedEl.innerHTML = ["all", "mine"].map(k => `<button type="button" data-feed="${k}" aria-pressed="${state.feed === k}">${k === "all" ? "Everyone" : "Mine"}</button>`).join("");
  }
  feedEl.addEventListener("click", e => { const b = e.target.closest("[data-feed]"); if (!b) return; state.feed = b.dataset.feed; S.settings.set("feed", state.feed); route(); });

  /* ---------- screens ---------- */
  function signalCard(retry) {
    return `<div class="empty"><p class="lbl">No signal</p><p>Everyone's sheets need a connection. Your own sheets are on this phone under <b>Mine</b>.</p><div class="row" style="justify-content:center"><button class="btn" id="retry">Try again</button><button class="btn" id="tomine">Show mine</button></div></div>`;
  }
  function wireSignal(fn) { const r = $("#retry"); if (r) r.onclick = fn; const m = $("#tomine"); if (m) m.onclick = () => { state.feed = "mine"; S.settings.set("feed", "mine"); route(); }; }

  async function screenMap() {
    setNav("map"); view.className = "full";
    view.innerHTML = `<div class="mapwrap"><div class="map" id="map" aria-label="Map of where photos were taken"></div>
      <div class="mapui br"><button class="btn sm" id="style" aria-pressed="${state.clearMap}" title="Plain street map or blueprint tint">${state.clearMap ? "Blueprint" : "Clear map"}</button><button class="btn round" id="locate" aria-label="Show my location" title="My location">${ICONS.locate}</button></div>
      <div class="mapmsg" id="mapmsg" hidden></div></div>`;
    const map = makeMap($("#map"));
    $("#style").onclick = () => { state.clearMap = !state.clearMap; S.settings.set("clearMap", state.clearMap); applyMapStyle(); $("#style").textContent = state.clearMap ? "Blueprint" : "Clear map"; $("#style").setAttribute("aria-pressed", String(state.clearMap)); };
    if (state.mapView) map.setView(state.mapView.c, state.mapView.z); else map.setView([30, -20], 2);
    map.on("moveend", () => { const c = map.getCenter(); state.mapView = { c: [C.round(c.lat, 5), C.round(c.lng, 5)], z: map.getZoom() }; S.settings.set("mapView", state.mapView); });
    const msg = $("#mapmsg");
    $("#locate").onclick = () => locate(map, null);
    let sheets = [];
    try { sheets = state.feed === "mine" ? await loadMine() : await loadAll(); }
    catch (e) { msg.hidden = false; msg.innerHTML = `No signal: everyone's pins need a connection. <button class="btn sm" id="retry">Try again</button> <button class="btn sm" id="tomine">Mine</button>`; wireSignal(() => route()); return; }
    if (!state.maps.includes(map)) return; // moved on while loading
    const pins = sheets.filter(s => C.isLatLon(s.lat, s.lon));
    if (!pins.length) { msg.hidden = false; msg.innerHTML = state.feed === "mine" ? `No pins yet. <a href="#new">Make your first sheet</a>: a photo, the spot you stood, and how you shot it.` : `Nobody has pinned a photo yet. <a href="#new">Be the first</a>.`; return; }
    const group = L.featureGroup();
    for (const s of pins) {
      const mk = L.marker([s.lat, s.lon], { icon: pinIcon(isMine(s) ? "me" : ""), title: s.title, alt: s.title });
      mk.bindPopup(`<a class="pop" href="#s/${esc(s.id)}">${s.thumb ? `<img src="${s.thumb}" alt="">` : ""}<b>${esc(s.title)}</b><small>${esc(C.exposureLine(s) || C.posture(s.posture).name)}</small><small>${esc(C.sheetNo(s.id))}${s.author ? " · " + esc(s.author) : ""}</small></a>`, { closeButton: true });
      mk.on("popupopen", () => { const el = mk.getElement(); if (el) el.querySelector(".pin").classList.add("sel"); });
      mk.on("popupclose", () => { const el = mk.getElement(); if (el) el.querySelector(".pin").classList.remove("sel"); });
      group.addLayer(mk); addWedge(map, s);
    }
    group.addTo(map);
    if (!state.mapView || !state.mapView.seen) { map.fitBounds(group.getBounds().pad(0.25), { maxZoom: 15 }); state.mapView = Object.assign(state.mapView || {}, { seen: true }); }
  }
  function locate(map, cb) {
    if (!navigator.geolocation) { toast("This phone can't share its location"); return; }
    toast("Finding you…", 8000);
    navigator.geolocation.getCurrentPosition(p => {
      toastEl.hidden = true; const ll = [p.coords.latitude, p.coords.longitude];
      map.setView(ll, Math.max(map.getZoom(), 16));
      if (cb) cb(ll); else L.circleMarker(ll, { radius: 7, color: accent(), weight: 1.5, fillOpacity: .3 }).addTo(map);
    }, () => toast("Couldn't get your location. Check the permission for this app."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  async function screenSheets() {
    setNav("sheets");
    view.innerHTML = `<p class="hint">Loading…</p>`;
    let sheets;
    try { sheets = state.feed === "mine" ? await loadMine() : await loadAll(); }
    catch (e) { view.innerHTML = signalCard(); wireSignal(() => route()); return; }
    if (!sheets.length) {
      view.innerHTML = `<div class="empty">${ICONS.photo.replace("<svg", '<svg fill="none" stroke="currentColor" stroke-width="1"')}<p class="lbl">${state.feed === "mine" ? "No sheets yet" : "Nothing shared yet"}</p>
        <p>${state.feed === "mine" ? "A sheet is one photo, the pin where you stood, how you shot it and the gear. Everything stays on this phone until you choose to share it." : "When a photographer shares a sheet it shows up here and on the map."}</p><a class="btn pri" href="#new">New sheet</a></div>`;
      return;
    }
    view.innerHTML = `<div class="row" style="justify-content:space-between;margin:0 0 10px"><span class="lbl">${sheets.length} sheet${sheets.length === 1 ? "" : "s"} · ${state.feed === "mine" ? "on this phone and in your account" : "shared by everyone"}</span></div>
      <div class="grid">${sheets.map(card).join("")}</div>`;
  }
  function card(s) {
    const sub = s._local && !s._published && !s.public ? '<small class="draft">On this phone only</small>' : (s._pending ? '<small class="draft">Waiting for signal</small>' : (s.author && !isMine(s) ? `<small class="by">${esc(s.author)}</small>` : `<small>${esc(C.fmtDate(s.taken) || "")}</small>`));
    return `<a class="card" href="#s/${esc(s.id)}"><div class="ph">${s.thumb ? `<img src="${s.thumb}" alt="" loading="lazy">` : ""}<span class="no">${esc(C.sheetNo(s.id))}</span><span class="pose" aria-hidden="true">${F.svg(s.posture, { size: 34 })}</span></div>
      <div class="cap"><b>${esc(s.title || "Untitled")}</b><small>${esc(C.exposureLine(s) || C.posture(s.posture).name)}</small>${sub}</div></a>`;
  }

  async function screenSheet(id, shared) {
    setNav("");
    let s = shared, image = "", rec = null;
    if (!s) {
      view.innerHTML = `<a class="back" href="#sheets">${ICONS.back} Sheets</a><p class="hint">Loading…</p>`;
      rec = await S.local.get(id);
      if (rec) { s = Object.assign(C.clean(rec), { _local: true, _pending: !!rec.pending, _published: !!rec.published }); image = rec.image || ""; }
      else {
        try { s = await S.cloud.getSheet(id); } catch (e) { view.innerHTML = `<a class="back" href="#sheets">${ICONS.back} Sheets</a>` + signalCard(); wireSignal(() => route()); return; }
        if (!s) { view.innerHTML = `<a class="back" href="#sheets">${ICONS.back} Sheets</a><div class="empty"><p class="lbl">Not here</p><p>This sheet was taken down or the link is wrong.</p></div>`; return; }
      }
    }
    const mine = !shared && isMine(s), fovDeg = C.fov(s.focal, s.sensor), eq = C.equivFocal(s.focal, s.sensor);
    const kv = [["Camera", s.camera], ["Lens", s.lens], ["Focal", s.focal ? C.fmtFocal(s.focal) + (eq && eq !== Math.round(s.focal) ? " (" + eq + "mm eq.)" : "") : ""], ["Aperture", C.fmtAperture(s.aperture)], ["Shutter", C.fmtShutter(s.shutter)], ["ISO", s.iso], ["Exp. comp.", s.ev ? C.fmtEV(s.ev) : ""],
      ["Support", s.support], ["Light", s.light], ["Filters", s.filters], ["Angle of view", fovDeg ? fovDeg + "°" : ""], ["Subject", s.distance ? C.fmtDistance(s.distance, state.units) + " away" : ""], ["Taken", C.fmtDate(s.taken)]].filter(x => x[1] != null && x[1] !== "");
    const camY = F.cameraY(s.posture), dim = `<svg viewBox="0 0 16 120" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1" opacity=".7" vector-effect="non-scaling-stroke"><line x1="8" y1="${camY}" x2="8" y2="120"/><line x1="3" y1="${camY}" x2="13" y2="${camY}"/><line x1="3" y1="120" x2="13" y2="120"/><path d="M5 ${camY + 5} L8 ${camY} L11 ${camY + 5}"/><path d="M5 115 L8 120 L11 115"/></g></svg>`;
    const where = C.isLatLon(s.lat, s.lon);
    view.innerHTML = `<a class="back" href="${shared ? "#map" : "#sheets"}">${ICONS.back} ${shared ? "Map" : "Sheets"}</a>
    <article class="sheet" aria-label="Shot sheet ${esc(C.sheetNo(s.id))}">
      <div class="photo" id="photo">${image || s.thumb ? `<img src="${image || s.thumb}" class="${image ? "" : "lo"}" alt="${esc(s.title)}">` : `<div class="noimg">${shared ? "The picture stays with its photographer.<br>This link carries the sheet." : "No picture"}</div>`}
        <i class="corner a"></i><i class="corner b"></i><i class="corner c"></i><i class="corner d"></i><div class="figbox" title="${esc(F.label(s.posture))}">${F.svg(s.posture, { size: 58 })}</div></div>
      <div class="tb">
        <div class="title"><span class="lbl">Title</span><b>${esc(s.title || "Untitled")}</b></div>
        <div><span class="lbl">Sheet</span><b>${esc(C.sheetNo(s.id))}</b></div>
        <div><span class="lbl">Photographer</span><b>${esc(s.author || (mine ? "You" : "—"))}</b></div>
        <div><span class="lbl">Date</span><b>${esc(C.fmtDate(s.taken).split(",")[0] || "—")}</b></div>
        <div><span class="lbl">Facing</span><b>${s.heading != null ? esc(C.headingName(s.heading) + " " + s.heading + "°") : "—"}</b></div>
        <div><span class="lbl">Camera height</span><b>${esc(h(s))}</b></div>
        <div><span class="lbl">Angle of view</span><b>${fovDeg ? fovDeg + "°" : "—"}</b></div>
      </div>
      ${C.exposureLine(s) ? `<div class="exp">${C.exposureLine(s).split(" · ").map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      <div class="specs">
        <div class="fig"><div class="figwrap"><div class="dim">${dim}</div>${F.svg(s.posture, { class: "figure" })}</div><span class="how">${esc(C.posture(s.posture).name)}</span><span class="ht">camera at ${esc(h(s))}</span></div>
        <div class="kv">${kv.length ? kv.map(x => `<span>${esc(x[0])}</span><span>${esc(x[1])}</span>`).join("") : `<span>Gear</span><span>Not noted</span>`}</div>
      </div>
      ${where ? `<div class="where"><div class="mini"><div class="map" id="mini" aria-label="Where the photographer stood"></div></div>
        <div class="coords"><span>${esc(C.fmtCoord(s.lat, s.lon))}</span><span>${s.place ? esc(s.place) : ""}</span></div></div>` : ""}
      ${s.story ? `<div class="story"><h3>How I got the shot</h3>${s.story.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}</div>` : ""}
      <div class="actions">
        ${s.ig ? `<a class="btn ig" href="${esc(s.ig)}" target="_blank" rel="noopener">${ICONS.ig} Instagram</a>` : ""}
        ${where ? `<a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener">${ICONS.pin} Take me there</a>` : ""}
        <button class="btn" id="share">${ICONS.share} Share</button>
        ${shared ? `<button class="btn pri" id="copy">Save a copy</button>` : ""}
        ${mine ? `<a class="btn" href="#edit/${esc(s.id)}">Edit</a><button class="btn danger" id="del">Delete</button>` : ""}
      </div>
    </article>`;
    if (where) {
      const map = makeMap($("#mini"), { scrollWheelZoom: false, zoomControl: true });
      map.setView([s.lat, s.lon], 15);
      L.marker([s.lat, s.lon], { icon: pinIcon(mine ? "me" : ""), interactive: false }).addTo(map); addWedge(map, s);
      requestAnimationFrame(() => map.invalidateSize());
    }
    $("#share").onclick = () => share(s, mine);
    if ($("#copy")) $("#copy").onclick = () => { state.draft = Object.assign(C.newSheet(), s, { id: C.newId(), uid: "", author: "", public: false, thumb: "" }); state.image = ""; state.fromShare = true; go("#new"); };
    if ($("#del")) $("#del").onclick = async function () {
      if (this.dataset.sure !== "1") { this.dataset.sure = "1"; this.textContent = "Really delete? Tap again"; setTimeout(() => { if (this.isConnected) { this.dataset.sure = ""; this.textContent = "Delete"; } }, 4000); return; }
      await S.local.del(s.id);
      if (S.cloud.user && (s._published || s._cloud || s.public)) { try { await S.cloud.remove(s.id); } catch (e) { toast("Deleted here. Couldn't reach the cloud; it'll stay in your account until you have signal."); } }
      state.mine = null; state.pub = null; toast("Sheet deleted"); go("#sheets");
    };
    // The full picture for a cloud sheet arrives after the sheet draws.
    if (!image && !shared && !rec && s.thumb) {
      const seq = ++state.seq;
      S.cloud.getImage(s.id).then(d => { const im = $("#photo img"); if (d && im && seq === state.seq) { im.src = d; im.classList.remove("lo"); } });
    }
  }
  async function share(s, mine) {
    const url = (s.public || (!mine && !s._local)) ? APP_URL + "#s/" + s.id : APP_URL + "#s=" + C.encodeShare(s);
    const text = s.title + " · " + (C.exposureLine(s) || C.posture(s.posture).name);
    try { if (navigator.share) { await navigator.share({ title: "Photo Blueprint: " + s.title, text, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); toast(s.public ? "Link copied" : "Link copied (the sheet without the picture)"); } catch (e) { prompt("Copy this link", url); }
  }

  /* ---------- editor ---------- */
  async function screenEdit(id) {
    setNav("new");
    if (id) {
      const rec = await S.local.get(id);
      if (rec) { state.draft = C.clean(rec); state.image = rec.image || ""; state.draft._published = !!rec.published; }
      else {
        let s = null; try { s = await S.cloud.getSheet(id); } catch (e) {}
        if (!s || !isMine(s)) { view.innerHTML = `<div class="empty"><p class="lbl">Not yours to edit</p><a class="btn" href="#sheets">Sheets</a></div>`; return; }
        state.draft = s; state.image = await S.cloud.getImage(id); state.draft._published = true;
      }
      state.chips = [];
    } else if (!state.draft || !state.fromShare) { state.draft = C.newSheet(); state.image = ""; state.chips = []; }
    state.fromShare = false;
    if (S.settings.get("cloud") && !S.cloud.ready()) S.cloud.start();
    renderEditor(!!id);
  }
  function renderEditor(editing) {
    const d = state.draft, u = state.units, hv = u === "ft" ? C.round((d.height || 0) * 3.28084, 1) : d.height;
    const opt = (list, v, labels) => list.map((x, i) => `<option value="${esc(x.id || x)}" ${(x.id || x) === v ? "selected" : ""}>${esc(labels ? labels[i] : (x.name || x || "—"))}</option>`).join("");
    view.innerHTML = `<a class="back" href="${editing ? "#s/" + esc(d.id) : "#sheets"}">${ICONS.back} ${editing ? "Sheet" : "Sheets"}</a>
    <form id="ed" novalidate>
      <section class="panel"><h2>1 · The photo</h2>
        <label class="drop" id="drop">${state.draft.thumb ? `<img src="${state.image || d.thumb}" alt="">` : `<div>${ICONS.photo.replace("<svg", '<svg fill="none" stroke="currentColor"')}<div class="lbl">Tap to add the photo</div><small class="hint">Camera, lens and exposure fill in from the file when it has them.</small></div>`}<input type="file" id="file" accept="image/*"></label>
        <div class="chips" id="chips">${state.chips.map(c => `<span>${esc(c)}</span>`).join("")}</div>
        <label class="field" style="margin-top:12px"><span class="lbl">Title</span><input data-k="title" value="${esc(d.title)}" maxlength="120" placeholder="What the photo is" autocomplete="off"></label>
      </section>
      <section class="panel"><h2>2 · Where you stood</h2>
        <div class="search"><input type="search" id="q" placeholder="Search a place, park or address" autocomplete="off" enterkeyhint="search" aria-label="Search for a place"><button type="button" class="btn sm" id="qgo">Search</button></div>
        <ul class="results" id="qres" hidden></ul>
        <div class="edmap" id="edmap"><div class="map" id="map"></div><div class="mapui tl"><button type="button" class="btn sm" id="locate">${ICONS.locate} My spot</button></div><div class="aimbar" id="aimbar" hidden><span>Tap the map where the camera pointed</span><button type="button" id="aimoff">Done</button></div></div>
        <p class="hint" id="coords">${C.isLatLon(d.lat, d.lon) ? esc(C.fmtCoord(d.lat, d.lon)) : "Search for the place, then tap the map to drop the pin where you were standing. Drag it to adjust."}</p>
        <label class="field"><span class="lbl">Facing</span>
          <div class="dial"><input type="range" id="heading" min="0" max="359" step="1" value="${d.heading == null ? 0 : d.heading}" aria-label="Direction the camera faced, degrees"><output id="hout">${d.heading == null ? "not set" : C.headingName(d.heading) + " " + d.heading + "°"}</output></div></label>
        <div class="row"><button type="button" class="btn sm" id="aim">Aim on the map</button><button type="button" class="btn sm" id="noheading">No direction</button></div>
        <label class="field" style="margin-top:12px"><span class="lbl">Place (optional)</span><input data-k="place" value="${esc(d.place)}" maxlength="80" placeholder="Pier 7, east rail" autocomplete="off"></label>
      </section>
      <section class="panel"><h2>3 · How you shot it</h2>
        <div class="poses" role="radiogroup" aria-label="Position">${C.POSTURES.map(p => `<label><input type="radio" name="posture" value="${p.id}" ${d.posture === p.id ? "checked" : ""}>${F.svg(p.id, { size: 86 })}<b>${esc(p.name)}</b></label>`).join("")}</div>
        <p class="hint" id="posehint">${esc(C.posture(d.posture).hint)}</p>
        <div class="cols"><label class="field"><span class="lbl">Camera height (${u})</span><input type="number" inputmode="decimal" id="height" step="0.1" min="0" value="${hv}"></label>
          <label class="field"><span class="lbl">Support</span><select data-k="support">${opt(C.SUPPORTS, d.support)}</select></label></div>
      </section>
      <section class="panel"><h2>4 · Gear and exposure</h2>
        <div class="cols"><label class="field"><span class="lbl">Camera</span><input data-k="camera" value="${esc(d.camera)}" maxlength="60" placeholder="Body" autocomplete="off"></label>
          <label class="field"><span class="lbl">Lens</span><input data-k="lens" value="${esc(d.lens)}" maxlength="80" placeholder="Lens" autocomplete="off"></label></div>
        <div class="cols3"><label class="field"><span class="lbl">Focal (mm)</span><input type="number" inputmode="decimal" data-k="focal" data-num="1" step="0.1" min="1" value="${d.focal == null ? "" : d.focal}" placeholder="35"></label>
          <label class="field"><span class="lbl">Aperture</span><input id="aperture" inputmode="decimal" value="${d.aperture == null ? "" : "f/" + d.aperture}" placeholder="f/2.8"></label>
          <label class="field"><span class="lbl">Shutter</span><input id="shutter" inputmode="decimal" value="${esc(C.fmtShutter(d.shutter))}" placeholder="1/250"></label></div>
        <div class="cols3"><label class="field"><span class="lbl">ISO</span><input type="number" inputmode="numeric" data-k="iso" data-num="1" step="1" min="1" value="${d.iso == null ? "" : d.iso}" placeholder="100"></label>
          <label class="field"><span class="lbl">Exp. comp.</span><input type="number" inputmode="decimal" data-k="ev" data-num="1" step="0.3" value="${d.ev == null ? "" : d.ev}" placeholder="0"></label>
          <label class="field"><span class="lbl">Sensor</span><select data-k="sensor">${opt(C.SENSORS, d.sensor)}</select></label></div>
        <div class="cols"><label class="field"><span class="lbl">Light</span><select data-k="light">${opt(C.LIGHTS, d.light)}</select></label>
          <label class="field"><span class="lbl">Filters</span><input data-k="filters" value="${esc(d.filters)}" maxlength="60" placeholder="CPL, 6-stop ND" autocomplete="off"></label></div>
        <label class="field"><span class="lbl">Taken</span><input type="datetime-local" data-k="taken" value="${esc(d.taken)}"></label>
      </section>
      <section class="panel"><h2>5 · The story</h2>
        <label class="field"><span class="lbl">How I got the shot</span><textarea data-k="story" maxlength="6000" placeholder="Why this spot, what you waited for, what went wrong first. Leave a blank line between paragraphs.">${esc(d.story)}</textarea></label>
        <label class="field"><span class="lbl">Instagram post (optional)</span><input type="url" inputmode="url" data-k="ig" value="${esc(d.ig)}" placeholder="https://www.instagram.com/p/…" autocomplete="off"><small>Paste the post's link and the sheet gets an Instagram button. Instagram doesn't let apps read your gallery anymore, so the link is the tie.</small></label>
      </section>
      <section class="panel"><h2>6 · Share</h2>
        <div class="toggle"><div><b>Share with everyone</b><small id="pubhint"></small></div><button type="button" class="sw" id="pub" role="switch" aria-checked="${d.public ? "true" : "false"}" aria-label="Share with everyone"></button></div>
        <div id="signinrow" hidden><p class="hint">Sharing needs a Google sign-in, so the sheet has an owner. Your name from Google appears on it.</p><button type="button" class="btn sm" id="signin">Sign in with Google</button></div>
      </section>
      <ul class="errs" id="errs" hidden></ul>
      <div class="footer"><button type="submit" class="btn pri" id="save">${editing ? "Save sheet" : "Save sheet"}</button></div>
    </form>`;
    const form = $("#ed");
    // Text and number fields write straight into the draft.
    form.addEventListener("input", e => {
      const t = e.target, k = t.dataset.k; if (!k) return;
      d[k] = t.dataset.num ? (t.value === "" ? null : +t.value) : t.value;
    });
    $("#aperture").addEventListener("change", e => { const v = C.parseAperture(e.target.value); d.aperture = v; e.target.value = v ? C.fmtAperture(v) : ""; });
    $("#shutter").addEventListener("change", e => { const v = C.parseShutter(e.target.value); d.shutter = v; e.target.value = v ? C.fmtShutter(v) : ""; });
    let heightTouched = editing || !!d._heightTouched;
    $("#height").addEventListener("input", e => { heightTouched = true; d._heightTouched = true; const v = +e.target.value; d.height = e.target.value === "" || !Number.isFinite(v) ? null : (u === "ft" ? C.round(v / 3.28084, 2) : v); });
    form.addEventListener("change", e => {
      if (e.target.name === "posture") { d.posture = e.target.value; $("#posehint").textContent = C.posture(d.posture).hint; if (!heightTouched) { d.height = C.posture(d.posture).height; $("#height").value = u === "ft" ? C.round(d.height * 3.28084, 1) : d.height; } }
    });
    $("#file").addEventListener("change", async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      $("#drop").innerHTML = `<div><div class="lbl">Reading the photo…</div></div><input type="file" id="file" accept="image/*">`;
      try { await processFile(f); } catch (err) { toast("Couldn't read that picture"); renderEditor(editing); return; }
      const hadPin = C.isLatLon(d.lat, d.lon);
      renderEditor(editing);
      if (!hadPin && C.isLatLon(d.lat, d.lon)) toast("Pin dropped where the camera said it was");
    });
    // The map: tap drops the pin, drag moves it, "aim" sets the direction.
    const map = makeMap($("#map"), { zoomControl: false }); L.control.zoom({ position: "topright" }).addTo(map);
    const hasPin = C.isLatLon(d.lat, d.lon);
    if (hasPin) map.setView([d.lat, d.lon], 16); else if (state.mapView) map.setView(state.mapView.c, Math.max(state.mapView.z, 3)); else map.setView([30, -20], 2);
    let marker = null, wedge = null, aiming = false;
    const coords = $("#coords"), hout = $("#hout"), range = $("#heading");
    function drawWedge() { if (wedge) { map.off("zoomend", wedge.upd); map.removeLayer(wedge.poly); wedge = null; } if (C.isLatLon(d.lat, d.lon) && d.heading != null) wedge = addWedge(map, d); }
    function setPin(lat, lon) {
      d.lat = C.round(lat, 6); d.lon = C.round(lon, 6); coords.textContent = C.fmtCoord(d.lat, d.lon);
      if (!marker) { marker = L.marker([d.lat, d.lon], { icon: pinIcon("me"), draggable: true, title: "Where you stood" }).addTo(map); marker.on("dragend", () => { const ll = marker.getLatLng(); setPin(ll.lat, ll.lng); }); }
      else marker.setLatLng([d.lat, d.lon]);
      drawWedge();
    }
    function setHeading(v) { d.heading = v == null ? null : Math.round(C.normDeg(v)); range.value = d.heading == null ? 0 : d.heading; hout.textContent = d.heading == null ? "not set" : C.headingName(d.heading) + " " + d.heading + "°"; drawWedge(); }
    if (hasPin) setPin(d.lat, d.lon);
    map.on("click", e => {
      if (aiming) { if (!C.isLatLon(d.lat, d.lon)) { toast("Drop the pin first"); return; } setHeading(C.bearing(d.lat, d.lon, e.latlng.lat, e.latlng.lng)); d.distance = Math.round(C.distance(d.lat, d.lon, e.latlng.lat, e.latlng.lng)); toast("Facing " + C.headingName(d.heading) + ", subject " + C.fmtDistance(d.distance, u) + " away"); return; }
      setPin(e.latlng.lat, e.latlng.lng);
    });
    range.addEventListener("input", () => setHeading(+range.value));
    $("#noheading").onclick = () => { setHeading(null); d.distance = null; };
    const aimbar = $("#aimbar"), edmap = $("#edmap");
    function aimMode(on) { aiming = on; aimbar.hidden = !on; edmap.classList.toggle("aim", on); if (on && map.getZoom() < 14 && C.isLatLon(d.lat, d.lon)) map.setView([d.lat, d.lon], 16); }
    $("#aim").onclick = () => aimMode(true); $("#aimoff").onclick = () => aimMode(false);
    $("#locate").onclick = () => locate(map, ll => setPin(ll[0], ll[1]));
    // Place search: type a place, pick a result, the map goes there and the pin drops on it (drag to fine-tune).
    const q = $("#q"), qres = $("#qres"), qgo = $("#qgo");
    let qseq = 0;
    async function search() {
      const text = q.value.trim(); if (!text) return;
      const seq = ++qseq; qgo.disabled = true; qres.hidden = false; qres.innerHTML = `<li class="msg">Searching…</li>`;
      try {
        const hits = await geocode(text);
        if (seq !== qseq) return;
        qres.innerHTML = hits.length ? hits.map((h, i) => `<li><button type="button" data-i="${i}"><b>${esc(h.short)}</b><small>${esc(h.rest)}</small></button></li>`).join("") : `<li class="msg">Nothing found. Try the town or a nearby landmark.</li>`;
        qres.querySelectorAll("button").forEach(b => b.onclick = () => {
          const h = hits[+b.dataset.i]; setPin(h.lat, h.lon); map.setView([h.lat, h.lon], h.zoom); qres.hidden = true; q.value = h.short;
          if (!d.place) { d.place = h.short; const pl = $('[data-k="place"]'); if (pl) pl.value = h.short; }
          toast("Pin dropped on " + h.short + ". Drag it to the exact spot.", 3500);
        });
      } catch (e) { if (seq === qseq) qres.innerHTML = `<li class="msg">Couldn't search right now. Check your signal, or tap the map.</li>`; }
      qgo.disabled = false;
    }
    qgo.onclick = search;
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); search(); } });
    q.addEventListener("input", () => { if (!q.value.trim()) qres.hidden = true; });
    requestAnimationFrame(() => map.invalidateSize());
    // Sharing needs an account.
    const pub = $("#pub"), pubhint = $("#pubhint"), signinrow = $("#signinrow");
    function pubUI() {
      const u = S.cloud.user;
      pubhint.textContent = d.public ? (u ? "Everyone can see this sheet and the photo on the map." : "Sign in below; it'll publish once you have.") : (editing && d._published ? "Turning this off takes it off the map for everyone." : "Off: the sheet stays on this phone" + (u ? " and in your account." : "."));
      signinrow.hidden = !(d.public && !u);
    }
    pub.onclick = () => { d.public = !d.public; pub.setAttribute("aria-checked", d.public ? "true" : "false"); pubUI(); if (d.public && !S.cloud.ready()) S.cloud.start().then(pubUI); };
    $("#signin").onclick = async () => { const ok = await S.cloud.signIn(); if (!ok) toast("Sign-in didn't finish. Check your signal and try again."); pubUI(); };
    S.cloud.onchange = () => { if (document.body.contains(pub)) pubUI(); };
    pubUI();
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const errs = C.validate(Object.assign({}, d)), ul = $("#errs");
      if (errs.length) { ul.hidden = false; ul.innerHTML = errs.map(x => `<li>${esc(x)}</li>`).join(""); ul.scrollIntoView({ block: "center" }); return; }
      ul.hidden = true; $("#save").disabled = true; $("#save").textContent = "Saving…";
      await saveDraft(editing);
    });
  }
  async function saveDraft(editing) {
    const d = state.draft, user = S.cloud.user;
    const rec = C.clean(d); rec.updated = Date.now(); rec.created = rec.created || rec.updated;
    if (user) { rec.uid = user.uid; rec.author = user.name || rec.author; }
    const wantsCloud = !!user || d.public || d._published;
    const stored = Object.assign({}, rec, { image: state.image, pending: false, published: !!d._published });
    let msg = "Saved on this phone";
    if (wantsCloud) {
      if (user) {
        try { await S.cloud.publish(rec, state.image); stored.published = true; msg = d.public ? "Published to the map" : "Saved to this phone and your account"; }
        catch (e) { stored.pending = true; msg = e && e.code === "permission-denied" ? "Saved on this phone. The cloud refused it (is the sheet too big?)" : "Saved on this phone. It'll publish when you have signal."; }
      } else { stored.pending = true; msg = "Saved on this phone. It publishes once you sign in."; }
    }
    await S.local.put(stored); S.local.persist();
    state.mine = null; state.pub = null; state.draft = null; state.image = "";
    toast(msg, 3500); go("#s/" + rec.id);
  }

  /* ---------- me ---------- */
  function screenMe() {
    setNav("me");
    const u = S.cloud.user, st = S.cloud.status;
    view.innerHTML = `
    <section class="panel"><h2>Account</h2>
      <div class="who" id="who">${u ? `${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : ""}<div><b>${esc(u.name || "Signed in")}</b><small>Sheets you share carry this name</small></div>` : `<div><b>Not signed in</b><small>${st === "loading" ? "Checking…" : "Sheets stay on this phone until you sign in"}</small></div>`}</div>
      <div class="row" style="margin-top:12px">${u ? `<button class="btn" id="signout">Sign out</button><button class="btn" id="syncnow">Sync now</button>` : `<button class="btn pri" id="signin">Sign in with Google</button>`}</div>
      <p class="hint" style="margin-top:10px">Signing in keeps your sheets in your account across phones and lets you share them with everyone. Reading never needs it.</p>
    </section>
    <section class="panel"><h2>On your phone</h2>
      <div class="toggle"><div><b>Home screen</b><small>Opens full screen, works with no signal</small></div><button class="btn sm" id="install">Add to home screen</button></div>
    </section>
    <section class="panel"><h2>Look</h2>
      <div class="toggle"><div><b>Sheet</b><small>White lines on blue, or blue ink on paper</small></div><div class="seg"><button type="button" data-theme="blueprint" aria-pressed="${state.theme === "blueprint"}">Blueprint</button><button type="button" data-theme="paper" aria-pressed="${state.theme === "paper"}">Paper</button></div></div>
      <div class="toggle"><div><b>Units</b><small>Camera height and distances</small></div><div class="seg"><button type="button" data-units="m" aria-pressed="${state.units === "m"}">Metres</button><button type="button" data-units="ft" aria-pressed="${state.units === "ft"}">Feet</button></div></div>
    </section>
    <section class="panel"><h2>Your sheets</h2>
      <div class="row"><button class="btn" id="export">Back up to a file</button><label class="btn">Restore from a file<input type="file" id="import" accept="application/json,.json" hidden></label></div>
      <p class="hint" style="margin-top:10px">The backup holds every sheet on this phone, pictures included. Restoring adds sheets; it never erases.</p>
    </section>
    <section class="panel about"><h2>About</h2>
      <p><b>Photo Blueprint</b> pins a photo to the spot it was taken from and draws the sheet of how: the stance, the gear, the exposure, the direction the camera faced, and the story behind it. A companion to your gallery, not a replacement.</p>
      <p>A photo's own notes (EXIF) fill the sheet in when the file has them; phones usually keep them, exports from social apps usually strip them. Only the resized picture is kept, never the original file.</p>
      <p>What you share is public: anyone with the app can see a shared sheet, its picture and its pin. Think before pinning a home. Everything else stays on this phone${u ? " and in your account" : ""}.</p>
      <p>Map by <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors.</p>
    </section>
    <p class="ver">Photo Blueprint ${VERSION}</p>`;
    const rerender = () => { if (location.hash === "#me") screenMe(); };
    if ($("#signin")) $("#signin").onclick = async () => { $("#signin").disabled = true; const ok = await S.cloud.signIn(); if (!ok) toast("Sign-in didn't finish. Check your signal and try again."); rerender(); };
    if ($("#signout")) $("#signout").onclick = async () => { await S.cloud.signOut(); state.mine = null; rerender(); };
    if ($("#syncnow")) $("#syncnow").onclick = async () => { toast("Syncing…"); await pushPending(); state.mine = null; toast("Up to date"); };
    S.cloud.onchange = rerender;
    view.addEventListener("click", e => {
      const t = e.target.closest("[data-theme]"); if (t) { state.theme = t.dataset.theme; S.settings.set("theme", state.theme); applyTheme(); rerender(); }
      const un = e.target.closest("[data-units]"); if (un) { state.units = un.dataset.units; S.settings.set("units", state.units); rerender(); }
    });
    $("#install").onclick = () => { if (window.nateInstall) window.nateInstall.show(); else toast(/iP(hone|ad)/.test(navigator.userAgent) ? "Tap Share, then Add to Home Screen." : "In Chrome, tap ⋮ then Add to Home screen.", 5000); };
    $("#export").onclick = async () => {
      const recs = await S.local.all();
      const blob = new Blob([JSON.stringify({ app: "photoblueprint", v: 1, exported: new Date().toISOString(), sheets: recs })], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "photoblueprint-backup-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(recs.length + " sheet" + (recs.length === 1 ? "" : "s") + " in the file");
    };
    $("#import").onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text()); if (!j || j.app !== "photoblueprint" || !Array.isArray(j.sheets)) throw new Error("not a backup");
        let n = 0;
        for (const r of j.sheets) { if (!r || !r.id) continue; const have = await S.local.get(r.id); if (have && (have.updated || 0) >= (r.updated || 0)) continue; await S.local.put(Object.assign({}, r, { pending: !!r.pending })); n++; }
        state.mine = null; toast(n ? n + " sheet" + (n === 1 ? "" : "s") + " restored" : "Nothing new in that file");
      } catch (err) { toast("That file isn't a Photo Blueprint backup"); }
      e.target.value = "";
    };
  }

  /* ---------- routing ---------- */
  function route() {
    teardown(); window.scrollTo(0, 0);
    const hs = location.hash || "#map";
    let m;
    if ((m = hs.match(/^#s=(.+)$/))) { const s = C.decodeShare(m[1]); if (s) screenSheet(null, Object.assign(s, { id: s.id || C.newId() })); else { view.innerHTML = `<div class="empty"><p class="lbl">Bad link</p><p>That shared sheet couldn't be read.</p><a class="btn" href="#map">Map</a></div>`; setNav(""); } }
    else if ((m = hs.match(/^#s\/([a-z0-9]+)$/))) screenSheet(m[1]);
    else if ((m = hs.match(/^#edit\/([a-z0-9]+)$/))) screenEdit(m[1]);
    else if (hs === "#new") screenEdit(null);
    else if (hs === "#sheets") screenSheets();
    else if (hs === "#me") screenMe();
    else screenMap();
    view.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", route);

  /* ---------- start ---------- */
  applyTheme(); applyMapStyle();
  S.cloud.onchange = () => {};
  const prevChange = () => {};
  // Keep the data callbacks: screens set their own onchange, this one always runs too.
  const _set = S.cloud.onchange; void _set; void prevChange;
  const origDesc = Object.getOwnPropertyDescriptor(S.cloud, "onchange");
  let screenCb = origDesc && origDesc.value || (() => {});
  Object.defineProperty(S.cloud, "onchange", { get: () => (st => { screenCb(st); if (st === "signedin") pushPending(); }), set: fn => { screenCb = fn; }, configurable: true });
  if (S.settings.get("cloud")) S.cloud.start();
  route();
  window.addEventListener("load", () => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {}); });
  window.SPApp = { state, route, processFile, VERSION };
})();
