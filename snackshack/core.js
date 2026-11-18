/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE.
   Snack Shack Screen: the rules, with no page and no network, so they can be tested on their own.
   What plays when is decided only by the names of the Drive folders the files sit in:
     Always, or any name with no rule word in it   plays all the time
     Morning / Afternoon / Evening (or Night)      before noon / noon to 5 PM / 5 PM on
     9am-1pm, 5pm to 8pm                           only between those times
     Monday ... Sunday, Weekdays, Weekends         only on those days
     Spring / Summer / Fall / Winter               only in that season
     2026-04-18, Apr 18, 4-18                      only on that day (a range: "2026-04-18 to 2026-04-20")
     until 2026-03-20 / from 2026-04-01            up to and including / from that day on
     Game Day                                      only on days the schedule has games (every day if there's no schedule)
     Sponsors                                      one sponsor slips in after every few slides, taking turns
     Menu                                          the menu comes back after every few slides
     Off, Hidden, Drafts, or a name starting "_"   never plays (a parking spot)
   Every folder on the way down has to match, so "Game Day / Evening" plays on game days after 5 PM.
   A file name can carry its own seconds: "Hot dogs [15s].png" stays up 15 seconds. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SnackCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  var SEASONS = { spring: [3, 4, 5, 6], summer: [6, 7, 8], fall: [9, 10, 11], autumn: [9, 10, 11], winter: [12, 1, 2] };
  var DEFAULTS = { seconds: 10, sponsorEvery: 3, menuEvery: 5 };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  /* "9am", "9:30 pm", "17:00", "noon" -> minutes after midnight, or -1 */
  function parseClock(s) {
    s = String(s || "").trim().toLowerCase().replace(/\s+/g, "");
    if (s === "noon") return 720;
    if (s === "midnight") return 0;
    var m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(s);
    if (!m) return -1;
    var h = +m[1], mi = m[2] ? +m[2] : 0, ap = m[3] ? m[3].charAt(0) : "";
    if (mi > 59) return -1;
    if (ap) { if (h < 1 || h > 12) return -1; if (h === 12) h = 0; if (ap === "p") h += 12; }
    else if (h > 23) return -1;
    return h * 60 + mi;
  }

  /* A date in a folder name: 2026-04-18, 4/18/2026, 4-18, Apr 18, April 18 2026. No year means any year. */
  var DATE_RX = "(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?)";
  function parseDate(s) {
    s = String(s || "").trim().toLowerCase();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(s);
    if (m) { var y = m[3] ? +m[3] : 0; if (y && y < 100) y += 2000; return { y: y, m: +m[1], d: +m[2] }; }
    m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(s);
    if (m) { var mo = MONTHS.indexOf(m[1].slice(0, 3)); if (mo >= 0) return { y: m[3] ? +m[3] : 0, m: mo + 1, d: +m[2] }; }
    return null;
  }
  function dateKey(p, year) { return (p.y || year) * 10000 + p.m * 100 + p.d; }

  /* Reads one folder name into its rules. Unknown words are just a label. */
  function parseFolder(name) {
    var raw = String(name || ""), s = raw.toLowerCase().replace(/[_]+/g, " ").trim(), r = { name: raw };
    if (/^_/.test(raw.trim()) || /^(off|hidden|hide|drafts?|not now|archive)$/.test(s)) { r.off = true; return r; }
    if (/\bsponsors?\b/.test(s)) r.sponsor = true;
    if (/\b(menu|snack menu|prices)\b/.test(s)) r.menu = true;
    if (/\bgame ?days?\b/.test(s)) r.gameDay = true;
    var rest = s;
    // date ranges first, then single dates
    var rng = new RegExp(DATE_RX + "\\s*(?:to|through|thru|until|-|–)\\s*" + DATE_RX).exec(rest);
    if (rng) {
      var a = parseDate(rng[1]), b = parseDate(rng[2]);
      if (a && b) { r.from = a; r.to = b; rest = rest.replace(rng[0], " "); }
    }
    var until = new RegExp("\\b(?:until|till|thru|through|ends?|before)\\s+" + DATE_RX).exec(rest);
    if (until) { var u = parseDate(until[1]); if (u) { r.to = u; if (/before/.test(until[0])) r.toExclusive = true; rest = rest.replace(until[0], " "); } }
    var from = new RegExp("\\b(?:from|starting|starts?|after)\\s+" + DATE_RX).exec(rest);
    if (from) { var f = parseDate(from[1]); if (f) { r.from = f; if (/after/.test(from[0])) r.fromExclusive = true; rest = rest.replace(from[0], " "); } }
    if (!r.from && !r.to) {
      var one = new RegExp("(?:^|\\s)" + DATE_RX + "(?=$|\\s)").exec(rest);
      if (one) { var d = parseDate(one[1]); if (d) { r.from = d; r.to = d; rest = rest.replace(one[0], " "); } }
    }
    // a time window: 9am-1pm, 5pm to 8pm, 17:00-20:00
    var tw = /(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?|noon)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?|noon|midnight)/.exec(rest);
    if (tw && /[ap]|:|noon|midnight/.test(tw[0])) {
      var t1 = tw[1], t2 = tw[2];
      // "5-8pm": the first time takes the second's am/pm
      if (!/[ap]|noon/.test(t1) && /([ap])m?\s*$/.test(t2)) t1 += /([ap])m?\s*$/.exec(t2)[1] + "m";
      var a1 = parseClock(t1), a2 = parseClock(t2);
      if (a1 >= 0 && a2 >= 0) { r.start = a1; r.end = a2 === 0 ? 1440 : a2; }
    }
    if (r.start == null) {
      if (/\bmorning\b/.test(rest)) { r.start = 0; r.end = 720; }
      else if (/\bafternoon\b/.test(rest)) { r.start = 720; r.end = 1020; }
      else if (/\b(evening|night|tonight)\b/.test(rest)) { r.start = 1020; r.end = 1440; }
    }
    var days = [];
    if (/\bweekdays?\b/.test(rest)) days.push(1, 2, 3, 4, 5);
    if (/\bweekends?\b/.test(rest)) days.push(0, 6);
    DAYS.forEach(function (d, i) { if (new RegExp("\\b" + d.slice(0, 3) + "(" + d.slice(3) + ")?s?\\b").test(rest)) days.push(i); });
    if (days.length) r.days = days;
    var months = [];
    Object.keys(SEASONS).forEach(function (k) { if (new RegExp("\\b" + k + "\\b").test(rest)) months = months.concat(SEASONS[k]); });
    if (months.length) r.months = months;
    return r;
  }

  /* Does one folder's rule allow this moment? ctx: { now: Date, gameDay: bool|null } */
  function ruleAllows(r, ctx) {
    if (r.off) return false;
    var now = ctx.now, y = now.getFullYear(), today = dateKey({ y: y, m: now.getMonth() + 1, d: now.getDate() }, y);
    var wraps = r.from && r.to && !r.from.y && !r.to.y && dateKey(r.to, y) < dateKey(r.from, y); // "Dec 20 to Jan 5"
    if (wraps) { if (!(today >= dateKey(r.from, y) || today <= dateKey(r.to, y))) return false; }
    else {
      if (r.from) { var f = dateKey(r.from, y); if (r.fromExclusive ? today <= f : today < f) return false; }
      if (r.to) { var t = dateKey(r.to, y); if (r.toExclusive ? today >= t : today > t) return false; }
    }
    if (r.days && r.days.indexOf(now.getDay()) < 0) return false;
    if (r.months && r.months.indexOf(now.getMonth() + 1) < 0) return false;
    if (r.start != null) {
      var mins = now.getHours() * 60 + now.getMinutes();
      if (r.start <= r.end) { if (mins < r.start || mins >= r.end) return false; }
      else if (mins < r.start && mins >= r.end) return false; // 8pm-2am wraps midnight
    }
    if (r.gameDay && ctx.gameDay === false) return false;
    return true;
  }

  function itemRules(item) { return (item.path || []).map(parseFolder); }
  function allows(item, ctx) { var rs = itemRules(item); for (var i = 0; i < rs.length; i++) if (!ruleAllows(rs[i], ctx)) return false; return true; }
  function kindOf(item) {
    var rs = itemRules(item), k = "main";
    rs.forEach(function (r) { if (r.sponsor) k = "sponsor"; else if (r.menu && k !== "sponsor") k = "menu"; });
    return k;
  }

  /* "Hot dogs [15s].png" -> 15; "intro (20 sec).jpg" -> 20 */
  function secondsFor(item, fallback) {
    var m = /[[(]\s*(\d{1,3})\s*(?:s|sec|secs|seconds)\s*[\])]/i.exec(item.name || "");
    var n = m ? +m[1] : 0;
    return n >= 2 && n <= 600 ? n : fallback;
  }
  /* A clean title from a file name: "02 Hot Dogs [15s].png" -> "Hot Dogs" */
  function titleOf(name) {
    return String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[[(]\s*\d{1,3}\s*(?:s|sec|secs|seconds)\s*[\])]/ig, "").replace(/^\s*\d{1,3}[\s._-]+/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function sortKey(item) { return (item.path || []).join("/").toLowerCase() + "/" + String(item.name || "").toLowerCase(); }
  function naturalCompare(a, b) {
    var ax = a.match(/\d+|\D+/g) || [], bx = b.match(/\d+|\D+/g) || [];
    for (var i = 0; i < Math.min(ax.length, bx.length); i++) {
      var x = ax[i], y = bx[i];
      if (x === y) continue;
      if (/^\d/.test(x) && /^\d/.test(y)) return (+x) - (+y) || x.length - y.length;
      return x < y ? -1 : 1;
    }
    return ax.length - bx.length;
  }

  /* Is there a game (any schedule event) today? null when there is no schedule at all. */
  function eventsOn(events, day) {
    var key = ymd(day);
    return (events || []).filter(function (e) { return String(e.start || "").slice(0, 10) <= key && String(e.end || e.start || "").slice(0, 10) >= key; });
  }
  function isGameDay(feed, now) {
    if (!feed || !feed.schedule) return null;
    return eventsOn(feed.events, now).length > 0;
  }

  /* Builds one pass of the loop for this moment.
     items: [{id, name, type, path:[folder names]}], ctx: { now, gameDay, sponsorTurn, menuTurn }
     Returns { list: [...items and {type:"today"} cards], sponsorTurn, menuTurn } so sponsors keep taking turns across passes. */
  function buildLoop(items, ctx, opts) {
    opts = opts || {};
    var sEvery = opts.sponsorEvery || DEFAULTS.sponsorEvery, mEvery = opts.menuEvery || DEFAULTS.menuEvery;
    var ok = (items || []).filter(function (it) { return it && !it.tooBig && allows(it, ctx); });
    ok.sort(function (a, b) { return naturalCompare(sortKey(a), sortKey(b)); });
    var main = [], sponsors = [], menu = [];
    ok.forEach(function (it) { var k = kindOf(it); (k === "sponsor" ? sponsors : k === "menu" ? menu : main).push(it); });
    var sTurn = ctx.sponsorTurn || 0, mTurn = ctx.menuTurn || 0, out = [];
    if (ctx.todayCard) out.push({ type: "today", id: "today" });
    if (!main.length) {
      // nothing but sponsors and menu: show the menu (all of it) then every sponsor
      out = out.concat(menu, sponsors);
      return { list: out, sponsorTurn: sTurn, menuTurn: mTurn, counts: { main: 0, sponsors: sponsors.length, menu: menu.length } };
    }
    main.forEach(function (it, i) {
      out.push(it);
      var n = i + 1;
      if (sponsors.length && n % sEvery === 0) { out.push(sponsors[sTurn % sponsors.length]); sTurn++; }
      if (menu.length && n % mEvery === 0) { out.push(menu[mTurn % menu.length]); mTurn++; }
    });
    // short loops still get one sponsor and the menu every pass
    if (sponsors.length && main.length < sEvery) { out.push(sponsors[sTurn % sponsors.length]); sTurn++; }
    if (menu.length && main.length < mEvery) { out.push(menu[mTurn % menu.length]); mTurn++; }
    return { list: out, sponsorTurn: sTurn, menuTurn: mTurn, counts: { main: main.length, sponsors: sponsors.length, menu: menu.length } };
  }

  /* The feed address: the full Apps Script /exec link, or just its long id. */
  function feedUrl(s) {
    s = String(s || "").trim();
    if (!s) return "";
    if (/^[A-Za-z0-9_-]{30,}$/.test(s)) return "https://script.google.com/macros/s/" + s + "/exec";
    var m = /^https:\/\/script\.google(?:usercontent)?\.com\/(?:a\/[^/]+\/)?macros\/s\/([A-Za-z0-9_-]{20,})\/(?:exec|dev)/.exec(s);
    return m ? "https://script.google.com/macros/s/" + m[1] + "/exec" : "";
  }
  function feedId(s) { var u = feedUrl(s); return u ? /\/s\/([^/]+)\//.exec(u)[1] : ""; }

  function fmtTime(iso) {
    var m = /T(\d{2}):(\d{2})/.exec(String(iso || ""));
    if (!m) return "";
    var h = +m[1], ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return h + ":" + m[2] + " " + ap;
  }
  /* Today's games for the "Today at the field" card, earliest first. */
  function todayLines(feed, now) {
    return eventsOn(feed && feed.events, now).slice().sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); })
      .map(function (e) { return { time: e.allDay ? "All day" : fmtTime(e.start), title: e.title || "", where: e.where || "", ended: !e.allDay && e.end && new Date(e.end) < now }; });
  }
  /* The next few days with something on, for the "Coming up" card (today left out). */
  function comingUp(feed, now, days) {
    var out = [], d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (var i = 1; i <= (days || 7); i++) {
      d.setDate(d.getDate() + 1);
      var ev = eventsOn(feed && feed.events, d);
      if (ev.length) out.push({ day: ymd(d), dow: DAYS[d.getDay()], items: ev.map(function (e) { return { time: e.allDay ? "" : fmtTime(e.start), title: e.title || "" }; }) });
    }
    return out;
  }

  /* Built-in slides for when no Drive folder is hooked up yet: generic copy only. */
  var DEMO = [
    { id: "demo-1", type: "card", path: ["Always"], name: "01 Welcome", card: { big: "Welcome to the field", small: "Grab a snack, cheer loud, have fun." } },
    { id: "demo-2", type: "card", path: ["Menu"], name: "Menu", card: { big: "Snack Shack", list: ["Hot dogs", "Popcorn", "Candy", "Freeze pops", "Water and sports drinks"], small: "Prices are posted at the window." } },
    { id: "demo-3", type: "card", path: ["Sponsors"], name: "Sponsor", card: { big: "Thank you to our sponsors", small: "Their support keeps the lights on and the fields ready." } },
    { id: "demo-4", type: "card", path: ["Always"], name: "02 Respect", card: { big: "Cheer for everyone", small: "Players, coaches, umpires and volunteers. Good sports only." } },
    { id: "demo-5", type: "card", path: ["Evening"], name: "03 Lights", card: { big: "Night games", small: "Please park in marked spots and watch for kids walking." } }
  ];

  return { parseClock: parseClock, parseDate: parseDate, parseFolder: parseFolder, ruleAllows: ruleAllows, allows: allows, kindOf: kindOf,
    secondsFor: secondsFor, titleOf: titleOf, buildLoop: buildLoop, feedUrl: feedUrl, feedId: feedId, isGameDay: isGameDay, eventsOn: eventsOn,
    todayLines: todayLines, comingUp: comingUp, fmtTime: fmtTime, ymd: ymd, naturalCompare: naturalCompare, DEFAULTS: DEFAULTS, DEMO: DEMO };
});
