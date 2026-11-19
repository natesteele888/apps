/* Gameday Picks pick reminders: the sender. An Apps Script project on the owner's own Google account (the account that
   owns the nates-toolbox Firebase project), so it reads Gameday Picks with the owner's own access and needs no key.
   Every hour it reads this week's NFL games from ESPN, checks each player who turned reminders on (gp_remind/<uid>,
   written by the app), and sends a phone notification through Firebase Cloud Messaging when one is due (remind.gs, the same
   file as picks/remind.js). If the owner's own reminder can't reach a phone, it goes by email to the owner instead.

   Setup (once): make a new Apps Script project, add three files with these contents (Code.gs, remind.gs = picks/remind.js,
   and appsscript.json, shown under Project Settings > "Show appsscript.json manifest file in editor"), then run setup()
   and allow it. setup() turns on the Cloud Messaging API for the project if it's off and starts the hourly run.
   testReminder() sends the owner a test notification right away. Nothing personal is stored in this file. */

const PROJECT = "nates-toolbox";
const FS = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents";
const FCM = "https://fcm.googleapis.com/v1/projects/" + PROJECT + "/messages:send";
const APP_URL = "https://natesteele888.github.io/apps/picks/";
const ICON = "https://natesteele888.github.io/apps/icons/picks-192.png";

/* ---------- once ---------- */
function setup() {
  // Firebase Cloud Messaging API on the project (usually on already; turning it on again changes nothing)
  const r = UrlFetchApp.fetch("https://serviceusage.googleapis.com/v1/projects/" + PROJECT + "/services/fcm.googleapis.com:enable",
    { method: "post", headers: auth_(), muteHttpExceptions: true, contentType: "application/json", payload: "{}" });
  Logger.log("Cloud Messaging API: " + r.getResponseCode());
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "run").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("run").timeBased().everyHours(1).create();
  Logger.log("Hourly reminder check is on.");
  status();
}

/* ---------- every hour ---------- */
function run() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  try {
    const now = Date.now();
    const week = nflWeek_(); if (!week || !Object.keys(week.games).length) return;
    const players = remindPlayers_(week.key);
    if (!players.length) return;
    const props = PropertiesService.getScriptProperties();
    let sent = {}; try { sent = JSON.parse(props.getProperty("sent") || "{}"); } catch (_) {}
    const due = GPRemind.dueAll(players, week.games, sent, now);
    due.forEach(d => {
      const p = players.find(x => x.uid === d.uid);
      const ok = deliver_(p, d.title, d.body);
      if (ok) sent[d.key] = new Date(now).toISOString();
      Logger.log((ok ? "Sent" : "Couldn't send") + " a reminder to player " + d.uid + ": " + d.body);
    });
    props.setProperty("sent", JSON.stringify(GPRemind.pruneSent(sent, now)));
  } finally { lock.releaseLock(); }
}

/* ---------- a test, any time ---------- */
function testReminder() {
  const me = remindPlayers_("").filter(p => p.owner);
  if (!me.length) { Logger.log("Turn on pick reminders in Gameday Picks first (the bell at the top)."); return; }
  me.forEach(p => Logger.log(deliver_(p, "🏈 Gameday Picks reminders are on", "This is what a reminder looks like. You'll get one when games are about to start and you haven't picked them.") ? "Test sent." : "Test couldn't be sent."));
}

// Who has reminders on, and their devices, without sending anything.
function status() {
  const ps = remindPlayers_("");
  Logger.log(ps.length ? ps.map(p => (p.name || p.uid) + ": " + Object.keys(p.tok).length + " phone(s)" + (p.owner ? " (owner, email backup)" : "")).join("\n") : "Nobody has turned on reminders yet.");
}

/* ---------- reading ---------- */
function nflWeek_() {
  const r = UrlFetchApp.fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const d = JSON.parse(r.getContentText());
  if (!d.season || !d.week) return null;
  const games = {};
  (d.events || []).forEach(ev => {
    const c = ev.competitions && ev.competitions[0]; if (!c || !c.competitors) return;
    const A = c.competitors.find(x => x.homeAway === "away"), H = c.competitors.find(x => x.homeAway === "home"); if (!A || !H) return;
    games[ev.id] = { date: ev.date, state: (c.status && c.status.type && c.status.type.state) || "pre",
      away: { abbr: A.team.abbreviation }, home: { abbr: H.team.abbreviation } };
  });
  return { key: d.season.year + "-" + d.season.type + "-" + d.week.number, games };
}

// Players with reminders on: [{ uid, name, owner, tok: {device: token}, on, picks, locked }]
function remindPlayers_(weekKey) {
  const out = [];
  list_("gp_remind").forEach(doc => {
    const uid = doc.name.split("/").pop(), r = decode_(doc.fields);
    if (!r.on) return;
    const pl = get_("gp_players/" + uid) || {};
    if (!pl.name) return; // removed from the league
    const pk = weekKey ? (get_("gp_picks/" + uid + "_" + weekKey) || {}) : {};
    out.push({ uid, name: pl.name, owner: pl.code === "OWNER", on: true, tok: r.tok || {}, picks: pk.picks || {}, locked: !!pk.locked });
  });
  return out;
}

/* ---------- sending ---------- */
// To every phone the player turned reminders on from; the owner gets an email when no phone could be reached.
function deliver_(p, title, body) {
  let any = false; const dead = [];
  Object.entries(p.tok || {}).forEach(([dev, v]) => {
    const t = v && v.t; if (!t) return;
    const res = push_(t, title, body);
    if (res === "ok") any = true; else if (res === "dead") dead.push(dev);
  });
  if (dead.length) {
    const tok = Object.assign({}, p.tok); dead.forEach(d => delete tok[d]); p.tok = tok;
    patch_("gp_remind/" + p.uid, { tok });
  }
  if (!any && p.owner) {
    MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: title.replace(/^\W+/, "") + " (Gameday Picks)",
      body: body + "\n\nOpen Gameday Picks: " + APP_URL + "\n\n(Your phone didn't get this one as a notification, so it came by email. Open the app and tap the bell to turn reminders back on for your phone.)" });
    any = true;
  }
  return any;
}
function push_(token, title, body) {
  const msg = { message: { token,
    data: { title, body, link: APP_URL },
    webpush: { headers: { Urgency: "high", TTL: "7200" }, notification: { title, body, icon: ICON, tag: "gp-remind", renotify: true }, fcm_options: { link: APP_URL } } } };
  const r = UrlFetchApp.fetch(FCM, { method: "post", contentType: "application/json", headers: auth_(), payload: JSON.stringify(msg), muteHttpExceptions: true });
  const code = r.getResponseCode(); if (code === 200) return "ok";
  const txt = r.getContentText();
  Logger.log("Cloud Messaging said " + code + ": " + txt.slice(0, 300));
  if (code === 404 || /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token/i.test(txt)) return "dead";
  return "error";
}

/* ---------- Firestore over REST, with the owner's own access ---------- */
function auth_() { return { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "x-goog-user-project": PROJECT }; }
function get_(path) {
  const r = UrlFetchApp.fetch(FS + "/" + path, { headers: auth_(), muteHttpExceptions: true });
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() !== 200) throw new Error("Firestore " + r.getResponseCode() + ": " + r.getContentText().slice(0, 300));
  return decode_(JSON.parse(r.getContentText()).fields);
}
function list_(col) {
  let out = [], page = "";
  do {
    const r = UrlFetchApp.fetch(FS + "/" + col + "?pageSize=300" + (page ? "&pageToken=" + encodeURIComponent(page) : ""), { headers: auth_(), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error("Firestore " + r.getResponseCode() + ": " + r.getContentText().slice(0, 300));
    const d = JSON.parse(r.getContentText()); out = out.concat(d.documents || []); page = d.nextPageToken || "";
  } while (page);
  return out;
}
function patch_(path, obj) {
  const mask = Object.keys(obj).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  UrlFetchApp.fetch(FS + "/" + path + "?" + mask + "&currentDocument.exists=true", { method: "patch", contentType: "application/json",
    headers: auth_(), payload: JSON.stringify({ fields: encode_(obj).mapValue.fields }), muteHttpExceptions: true });
}
function decode_(fields) { const o = {}; Object.keys(fields || {}).forEach(k => o[k] = val_(fields[k])); return o; }
function val_(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return decode_(v.mapValue.fields);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val_);
  return null;
}
function encode_(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "string") return { stringValue: x };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(encode_) } };
  const f = {}; Object.keys(x).forEach(k => f[k] = encode_(x[k])); return { mapValue: { fields: f } };
}
