/* Photo Blueprint core: the pure math and formats behind a shot sheet. No DOM, no network.
   Loaded in the page as window.SPCore and in Node (tests) with require(). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SPCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- Sensors: horizontal width in mm, used for the angle of view ---------- */
  const SENSORS = [
    { id: "ff", name: "Full frame (36×24)", w: 36, h: 24, crop: 1 },
    { id: "apsc", name: "APS-C (23.6×15.6)", w: 23.6, h: 15.6, crop: 1.5 },
    { id: "apscc", name: "APS-C Canon (22.3×14.9)", w: 22.3, h: 14.9, crop: 1.6 },
    { id: "mft", name: "Micro Four Thirds (17.3×13)", w: 17.3, h: 13, crop: 2 },
    { id: "one", name: "1-inch (13.2×8.8)", w: 13.2, h: 8.8, crop: 2.7 },
    { id: "mf", name: "Medium format (43.8×32.9)", w: 43.8, h: 32.9, crop: 0.79 },
    { id: "phone", name: "Phone (35 mm equivalent)", w: 36, h: 24, crop: 1 },
    { id: "film135", name: "35 mm film", w: 36, h: 24, crop: 1 },
    { id: "film120", name: "120 film 6×6 (56×56)", w: 56, h: 56, crop: 0.64 }
  ];
  const sensor = id => SENSORS.find(s => s.id === id) || SENSORS[0];

  /* ---------- How the shot was taken ---------- */
  const POSTURES = [
    { id: "standing", name: "Standing", height: 1.6, hint: "Camera at eye level, handheld." },
    { id: "kneeling", name: "Kneeling", height: 0.9, hint: "One knee down, elbow on the other." },
    { id: "prone", name: "Laying down", height: 0.3, hint: "Flat on the ground, elbows planted." },
    { id: "crouching", name: "Crouching", height: 0.7, hint: "Low and quick, no knee on the ground." },
    { id: "sitting", name: "Sitting", height: 0.6, hint: "Sat down, elbows on knees." },
    { id: "tripod", name: "Tripod (static)", height: 1.4, hint: "Locked off: long exposures, stacks, stitches." },
    { id: "monopod", name: "Monopod", height: 1.6, hint: "One leg of support, still free to move." }
  ];
  const posture = id => POSTURES.find(p => p.id === id) || POSTURES[0];

  const LIGHTS = ["", "Golden hour", "Blue hour", "Midday sun", "Overcast", "Night", "Indoors", "Studio", "Mixed"];
  const SUPPORTS = ["", "Handheld", "Tripod", "Monopod", "Gimbal", "Braced", "Beanbag", "Drone"];

  /* ---------- Angle of view ---------- */
  // Horizontal angle of view in degrees for a focal length (mm) on a sensor.
  function fov(focal, sensorId) {
    const f = +focal; if (!(f > 0)) return null;
    const s = sensor(sensorId);
    return round(2 * Math.atan(s.w / (2 * f)) * 180 / Math.PI, 1);
  }
  // 35 mm-equivalent focal length.
  function equivFocal(focal, sensorId) {
    const f = +focal; if (!(f > 0)) return null;
    return Math.round(f * sensor(sensorId).crop);
  }
  function round(n, d) { const m = Math.pow(10, d || 0); return Math.round(n * m) / m; }

  /* ---------- Exposure formats ---------- */
  // 1/250 s → "1/250", 0.5 → "1/2", 2 → "2s", 30 → "30s", 0.3 → "0.3s"
  function fmtShutter(sec) {
    const t = +sec; if (!(t > 0)) return "";
    if (t >= 1) return (Number.isInteger(t) ? t : round(t, 1)) + "s";
    const inv = 1 / t;
    if (Math.abs(inv - Math.round(inv)) < 0.02 * inv) return "1/" + Math.round(inv);
    return round(t, t < 0.1 ? 3 : 2) + "s";
  }
  // Accepts "1/250", "1/250s", "250" (means 1/250), "2", "2s", "0.5", "30\"".
  function parseShutter(str) {
    const s = String(str == null ? "" : str).trim().toLowerCase().replace(/\s|sec|s$/g, "").replace(/"$/, "");
    if (!s) return null;
    let m = s.match(/^1\/(\d+(?:\.\d+)?)$/); if (m) return +m[1] > 0 ? 1 / +m[1] : null;
    m = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/); if (m) return +m[2] > 0 ? +m[1] / +m[2] : null;
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = +s;
    if (n === 0) return null;
    // A bare whole number above 1 that isn't followed by s is read as a denominator: "250" means 1/250.
    if (Number.isInteger(n) && n > 1 && !/s|"/.test(String(str))) return 1 / n;
    return n;
  }
  function fmtAperture(n) { const f = +n; return f > 0 ? "f/" + (Number.isInteger(f) ? f : round(f, 1)) : ""; }
  function parseAperture(str) {
    const m = String(str == null ? "" : str).trim().toLowerCase().replace(/^f\/?|^ƒ\/?/, "").match(/^(\d+(?:\.\d+)?)$/);
    return m && +m[1] > 0 ? +m[1] : null;
  }
  function fmtFocal(mm) { const f = +mm; return f > 0 ? (Number.isInteger(f) ? f : round(f, 1)) + "mm" : ""; }
  function fmtEV(ev) { const e = +ev; if (!Number.isFinite(e) || e === 0) return e === 0 ? "0 EV" : ""; return (e > 0 ? "+" : "") + round(e, 1) + " EV"; }
  // APEX values from EXIF: ShutterSpeedValue → seconds, ApertureValue → f-number.
  const apexToShutter = tv => Math.pow(2, -tv);
  const apexToAperture = av => round(Math.pow(2, av / 2), 1);

  /* ---------- Compass and position ---------- */
  const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  function headingName(deg) { if (deg == null || !Number.isFinite(+deg)) return ""; return POINTS[Math.round(((+deg % 360) + 360) % 360 / 22.5) % 16]; }
  const normDeg = d => ((d % 360) + 360) % 360;
  function fmtCoord(lat, lon) {
    if (!isLatLon(lat, lon)) return "";
    return Math.abs(lat).toFixed(5) + "° " + (lat >= 0 ? "N" : "S") + ", " + Math.abs(lon).toFixed(5) + "° " + (lon >= 0 ? "E" : "W");
  }
  function isLatLon(lat, lon) { return lat != null && lon != null && lat !== "" && lon !== "" && Number.isFinite(+lat) && Number.isFinite(+lon) && Math.abs(+lat) <= 90 && Math.abs(+lon) <= 180 && !(+lat === 0 && +lon === 0); }
  const R = 6371008.8;
  // Point reached from (lat, lon) going `meters` on `bearing` degrees.
  function destination(lat, lon, bearing, meters) {
    const φ1 = lat * Math.PI / 180, λ1 = lon * Math.PI / 180, θ = bearing * Math.PI / 180, δ = meters / R;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    return [φ2 * 180 / Math.PI, ((λ2 * 180 / Math.PI + 540) % 360) - 180];
  }
  // The field-of-view wedge on the map: the pin, then an arc `fovDeg` wide centred on `bearing`, `meters` out.
  function wedge(lat, lon, bearing, fovDeg, meters, steps) {
    const n = steps || 12, half = Math.min(179, Math.max(2, fovDeg || 60)) / 2, pts = [[lat, lon]];
    for (let i = 0; i <= n; i++) pts.push(destination(lat, lon, bearing - half + (2 * half * i) / n, meters));
    return pts;
  }
  // Bearing from one point to another, degrees from north.
  function bearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return round(normDeg(Math.atan2(y, x) * 180 / Math.PI), 0);
  }
  function distance(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180, Δφ = φ2 - φ1, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* ---------- Units ---------- */
  function fmtHeight(m, units) {
    if (m == null || m === "") return ""; const v = +m; if (!Number.isFinite(v)) return "";
    if (units === "ft") { const ft = v * 3.28084; return (ft >= 10 ? Math.round(ft) : round(ft, 1)) + " ft"; }
    return (v >= 10 ? Math.round(v) : round(v, v < 1 ? 2 : 1)) + " m";
  }
  function fmtDistance(m, units) {
    if (m == null || m === "") return ""; const v = +m; if (!Number.isFinite(v)) return "";
    if (units === "ft") { const ft = v * 3.28084; return ft >= 1000 ? round(ft / 5280, 1) + " mi" : Math.round(ft) + " ft"; }
    return v >= 1000 ? round(v / 1000, 1) + " km" : Math.round(v) + " m";
  }

  /* ---------- Sheets ---------- */
  const KEYS = ["id", "uid", "author", "public", "created", "updated", "title", "story", "lat", "lon", "heading", "posture", "height",
    "camera", "lens", "focal", "sensor", "aperture", "shutter", "iso", "ev", "filters", "support", "light", "taken", "ig", "thumb", "w", "h", "place", "distance"];
  function newId() {
    const a = "abcdefghijklmnopqrstuvwxyz0123456789"; let s = "";
    const r = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(12)) : Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
    for (let i = 0; i < 12; i++) s += a[r[i] % a.length];
    return s;
  }
  function newSheet(now) {
    return { id: newId(), uid: "", author: "", public: false, created: now || Date.now(), updated: now || Date.now(), title: "", story: "",
      lat: null, lon: null, heading: null, posture: "standing", height: 1.6, camera: "", lens: "", focal: null, sensor: "ff", aperture: null, shutter: null,
      iso: null, ev: null, filters: "", support: "", light: "", taken: "", ig: "", thumb: "", w: 0, h: 0, place: "", distance: null };
  }
  // Short sheet number from an id, like a drawing number: "SP-7K2Q".
  function sheetNo(id) { return "SP-" + String(id || "").slice(-4).toUpperCase(); }
  // Checks a sheet before it is saved or published. Returns a list of problems (empty = fine).
  function validate(s) {
    const e = [];
    if (!s || typeof s !== "object") return ["No sheet"];
    if (!s.title || !String(s.title).trim()) e.push("Give the sheet a title.");
    if (String(s.title || "").length > 120) e.push("The title is too long (120 letters).");
    if (String(s.story || "").length > 6000) e.push("The story is too long (6000 letters).");
    if (!isLatLon(s.lat, s.lon)) e.push("Drop the pin where you stood.");
    if (s.heading != null && !(Number.isFinite(+s.heading))) e.push("Heading must be a number of degrees.");
    if (!posture(s.posture) || posture(s.posture).id !== s.posture) e.push("Pick how you shot it.");
    if (s.ig && !/^https?:\/\/(www\.)?instagram\.com\//i.test(s.ig)) e.push("The Instagram link should start with instagram.com.");
    if (!s.thumb) e.push("Add the photo.");
    return e;
  }
  // Keeps only known keys, trims text, coerces numbers. Used before save and after load.
  function clean(s) {
    const o = {};
    for (const k of KEYS) if (s[k] !== undefined) o[k] = s[k];
    for (const k of ["title", "story", "camera", "lens", "filters", "support", "light", "taken", "ig", "author", "place", "posture", "sensor"]) o[k] = String(o[k] == null ? "" : o[k]).trim();
    for (const k of ["lat", "lon", "heading", "focal", "aperture", "shutter", "iso", "ev", "height", "distance"]) { const v = o[k]; o[k] = v === "" || v == null || !Number.isFinite(+v) ? null : +v; }
    if (o.heading != null) o.heading = Math.round(normDeg(o.heading));
    o.public = !!o.public; o.w = +o.w || 0; o.h = +o.h || 0;
    if (!o.posture) o.posture = "standing"; if (!o.sensor) o.sensor = "ff";
    return o;
  }

  /* ---------- EXIF → sheet fields ---------- */
  // Takes the tag table from SPExif.parse and fills a sheet's blanks. Never overwrites a field the photographer already typed.
  function applyExif(sheet, x) {
    if (!x) return sheet;
    const s = Object.assign({}, sheet), set = (k, v) => { if ((s[k] == null || s[k] === "") && v != null && v !== "") s[k] = v; };
    const make = (x.Make || "").trim(), model = (x.Model || "").trim();
    set("camera", model && make && !model.toLowerCase().startsWith(make.toLowerCase().split(" ")[0]) ? make.split(" ")[0] + " " + model : model || make);
    set("lens", (x.LensModel || "").trim());
    if (x.FNumber > 0) set("aperture", round(x.FNumber, 1)); else if (x.ApertureValue != null) set("aperture", apexToAperture(x.ApertureValue));
    if (x.ExposureTime > 0) set("shutter", x.ExposureTime); else if (x.ShutterSpeedValue != null) set("shutter", apexToShutter(x.ShutterSpeedValue));
    if (x.ISOSpeedRatings > 0) set("iso", Math.round(x.ISOSpeedRatings));
    if (x.FocalLength > 0) set("focal", round(x.FocalLength, 1));
    if (x.ExposureBiasValue != null && Number.isFinite(x.ExposureBiasValue)) set("ev", round(x.ExposureBiasValue, 2));
    if (x.FocalLength > 0 && x.FocalLengthIn35mmFilm > 0 && s.sensor === "ff") {
      const crop = x.FocalLengthIn35mmFilm / x.FocalLength;
      let best = SENSORS[0]; for (const sn of SENSORS) if (Math.abs(sn.crop - crop) < Math.abs(best.crop - crop)) best = sn;
      if (Math.abs(best.crop - crop) < 0.15) s.sensor = best.id === "film135" ? "ff" : best.id;
    }
    if (x.DateTimeOriginal) { const m = String(x.DateTimeOriginal).match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/); if (m) set("taken", m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5]); }
    const g = gpsToLatLon(x);
    if (g) { set("lat", g[0]); set("lon", g[1]); }
    if (x.GPSImgDirection != null && Number.isFinite(x.GPSImgDirection)) set("heading", Math.round(normDeg(x.GPSImgDirection)));
    return s;
  }
  function gpsToLatLon(x) {
    const dms = v => Array.isArray(v) && v.length >= 2 ? (+v[0] || 0) + (+v[1] || 0) / 60 + (+v[2] || 0) / 3600 : (Number.isFinite(+v) ? +v : null);
    let lat = dms(x.GPSLatitude), lon = dms(x.GPSLongitude);
    if (lat == null || lon == null) return null;
    if (/^S/i.test(x.GPSLatitudeRef || "")) lat = -lat;
    if (/^W/i.test(x.GPSLongitudeRef || "")) lon = -lon;
    return isLatLon(lat, lon) ? [round(lat, 6), round(lon, 6)] : null;
  }

  /* ---------- Share links (no photo: the link carries the sheet, the picture stays with its owner) ---------- */
  function b64url(str) {
    const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(str) : Buffer.from(str, "utf8");
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64url(s) {
    const b = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = typeof atob === "function" ? atob(b) : Buffer.from(b, "base64").toString("binary");
    const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return typeof TextDecoder !== "undefined" ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString("utf8");
  }
  const SHARE_KEYS = ["title", "story", "lat", "lon", "heading", "posture", "height", "camera", "lens", "focal", "sensor", "aperture", "shutter", "iso", "ev", "filters", "support", "light", "taken", "ig", "author", "place", "distance"];
  function encodeShare(s) {
    const o = { v: 1 };
    for (const k of SHARE_KEYS) if (s[k] != null && s[k] !== "") o[k] = s[k];
    return b64url(JSON.stringify(o));
  }
  function decodeShare(str) {
    try { const o = JSON.parse(unb64url(String(str || ""))); if (!o || o.v !== 1) return null; delete o.v; return clean(Object.assign(newSheet(), o)); }
    catch (e) { return null; }
  }

  /* ---------- Pictures ---------- */
  // Size that fits inside a square of `max`, keeping the shape. Never scales up.
  function fitImage(w, h, max) { const k = Math.min(1, max / Math.max(w, h, 1)); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }; }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso); if (isNaN(d)) return String(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) + (/T\d\d:\d\d/.test(String(iso)) ? ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");
  }
  // One-line exposure summary: "24mm · f/8 · 1/250 · ISO 100"
  function exposureLine(s) {
    return [fmtFocal(s.focal), fmtAperture(s.aperture), fmtShutter(s.shutter), s.iso ? "ISO " + s.iso : "", s.ev ? fmtEV(s.ev) : ""].filter(Boolean).join(" · ");
  }

  return { SENSORS, POSTURES, LIGHTS, SUPPORTS, KEYS, sensor, posture, fov, equivFocal, round, fmtShutter, parseShutter, fmtAperture, parseAperture, fmtFocal, fmtEV,
    apexToShutter, apexToAperture, headingName, normDeg, fmtCoord, isLatLon, destination, wedge, bearing, distance, fmtHeight, fmtDistance,
    newId, newSheet, sheetNo, validate, clean, applyExif, gpsToLatLon, encodeShare, decodeShare, fitImage, fmtDate, exposureLine };
});
