/* Walk-Up song requests: ask a parent for a player's song by message, and take the song back in when it comes home.
   There is no server. The coach's own Messages, email or WhatsApp carries a link to send.html with a short code in it; the parent's phone
   sends the song back as an attachment named WU-<code>-<title>; Add songs (or, on Android, the share menu) matches the code to the player.
   Pure logic lives in core.js. This file is the screens, the sending buttons, the receiving queue and the Android share inbox. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, U = WU.U, S = WU.S, esc = U.esc, $ = U.$, $$ = U.$$;
  var RQ = WU.req = {};
  var INBOX = "walkup-inbox-v1";
  var VIA_TEXT = { text: "by text", email: "by email", share: "with Share", copy: "with a copied message" };
  var drafts = {}; // pid -> a token picked for the message on screen, kept until the request is really sent

  /* ---------- little pieces ---------- */
  function niceDate(ymd, year) {
    try { return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: year ? "numeric" : undefined }); } catch (e) { return ymd; }
  }
  function first(p) { return C.firstWord(p.name); }
  function who(p) { return C.whoLabel(p.name, p.num) || "this player"; }
  function songs() { return S.st.songs; }
  RQ.niceDate = niceDate;

  /* what to show for a player: code is none | asked | text | inlib | got */
  RQ.status = function (p) {
    var code = C.requestCode(p, songs()), r = p.req, d = r && r.at ? niceDate(r.at) : "";
    if (code === "got") return { code: code, text: "Got it", cls: "ok" };
    if (code === "inlib") return { code: code, text: "In your songs", cls: "warn" };
    if (code === "text") return { code: code, text: "Needs a song file", cls: "warn" };
    if (code === "asked") return { code: code, text: d ? "Asked " + d : "Asked", cls: "" };
    return { code: "none", text: "Not asked", cls: "" };
  };
  RQ.statusLine = function (p) {
    var s = RQ.status(p), r = p.req;
    if (s.code === "got") return "Got it. This player has a song.";
    if (s.code === "inlib") return "The song came back and is in your songs. Choose it for this player from the Song button.";
    if (s.code === "text") return "A parent answered with a song name. Add the song file when it comes, or pick it yourself.";
    if (s.code === "asked") return "Asked" + (r.at ? " on " + niceDate(r.at, true) : "") + (VIA_TEXT[r.via] ? " " + VIA_TEXT[r.via] : "") + ". Waiting for the song.";
    return "Not asked yet.";
  };
  RQ.chipHTML = function (p) { var s = RQ.status(p); return '<span class="chip ' + s.cls + '" data-chip>' + esc(s.text) + "</span>"; };
  /* extra bits on the player cards: "Needs a song file" and what the parent said they want */
  RQ.needsFile = function (p) { return !!(p.want && !C.hasSongFile(p, songs())); };
  RQ.cardChip = function (p) { return RQ.needsFile(p) ? '<span class="chip warn needfile">Needs a song file</span>' : ""; };
  RQ.cardWants = function (p) { return RQ.needsFile(p) ? '<span class="meta wants">Wants: ' + esc(p.want) + "</span>" : ""; };

  /* ---------- the message ---------- */
  RQ.tokenFor = function (p) {
    if (p.req && p.req.st === "asked") return p.req.t;
    /* every token in use, this player's finished one included, so a new ask never reuses it */
    var taken = S.st.roster.filter(function (x) { return x.req; }).map(function (x) { return x.req.t; });
    if (!drafts[p.id] || taken.indexOf(drafts[p.id]) >= 0) drafts[p.id] = C.newToken(taken);
    return drafts[p.id];
  };
  /* the token in the link of the message that is really being sent (the coach may have edited it), so the file that comes back matches */
  RQ.tokenIn = function (p, text) {
    var m = /send\.html#r=[A-Za-z0-9_-]+/.exec(String(text || "")), info = m ? C.parseRequestLink(m[0]) : null;
    if (info && info.ok) {
      var other = C.playerByToken(S.st.roster, info.t);
      if (!other || other === p) return info.t;
    }
    return RQ.tokenFor(p);
  };
  RQ.compose = function (p) {
    var s = S.st.settings, tok = RQ.tokenFor(p);
    var link = C.buildRequestLink(C.sendPageUrl(location.href), { t: tok, n: first(p), u: p.num, c: s.team });
    var v = { first: first(p), number: p.num, team: s.team, link: link };
    return { token: tok, link: link, message: C.requestMessage(s.reqTpl, v), subject: C.requestSubject(v) };
  };

  /* mark a player as asked; the toast lets the coach take it back */
  RQ.markAsked = function (p, via, tok, text) {
    var prev = p.req ? C.clone(p.req) : null, pid = p.id;
    p.req = C.startRequest(S.st.roster, p, via, WU.today(), tok);
    var used = p.req.t;
    delete drafts[pid];
    /* repaint a moment later, so a text or email link the coach just tapped is still on the page while the phone follows it */
    setTimeout(function () { WU.commit("data"); }, 0);
    U.toast(text || ("Marked " + (first(p) || "this player") + " as asked."), "ok", 7000, {
      text: "Undo", fn: function () { var q = WU.player(pid); if (q) { q.req = prev; if (!prev) drafts[pid] = used; WU.commit("data"); } }
    });
  };
  RQ.copyText = function (text) {
    function fallback() {
      var ta = document.createElement("textarea"), ok = false;
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta);
      try { ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    return new Promise(function (res) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { res(true); }, function () { res(fallback()); });
        else res(fallback());
      } catch (e) { res(fallback()); }
    });
  };
  RQ.canShare = function () { return typeof navigator.share === "function"; };
  /* the three ways to send, shared by the player sheet and the Song requests sheet */
  RQ.doCopy = function (p, msg, tok) {
    return RQ.copyText(msg).then(function (ok) {
      if (ok) RQ.markAsked(p, "copy", tok, "Message copied and marked as asked. Paste it into a text, chat or email.");
      else U.toast("Couldn't copy. Press and hold the message, then choose Copy.", "error", 6000);
      return ok;
    });
  };
  RQ.doShare = function (p, msg, subject, tok) {
    if (!RQ.canShare()) return Promise.resolve(false);
    return navigator.share({ title: subject, text: msg }).then(function () { RQ.markAsked(p, "share", tok, "Shared and marked as asked."); return true; }, function (e) {
      if (!e || e.name !== "AbortError") U.toast("Couldn't open the share menu. Try Copy message instead.", "error", 6000);
      return false;
    });
  };

  /* ---------- the "Ask a parent" section inside the player sheet ---------- */
  RQ.mountAsk = function (api, host, pid) {
    var edited = false;
    host.innerHTML = '<section class="card ask"><div class="row sp"><h3>Ask a parent for the song</h3><span id="rqChip"></span></div>' +
      '<p class="mute small-note" id="rqStat"></p>' +
      '<label class="field"><span class="label">Song they want</span><input type="text" id="rqWant" maxlength="' + C.REQ.want + '" autocomplete="off" placeholder="If a parent told you, type it here"></label>' +
      '<label class="field"><span class="label">Message (you can change it for this one send)</span><textarea id="rqMsg" rows="7" spellcheck="true"></textarea></label>' +
      '<p class="warn-txt" id="rqNoLink" hidden>The link is missing from this message. The parent needs it to send the song.</p>' +
      '<div class="rq-btns"><a class="btn" id="rqText" href="#" rel="noopener">Text it</a><a class="btn" id="rqMail" href="#" rel="noopener">Email it</a>' +
      (RQ.canShare() ? '<button type="button" class="btn ghost" id="rqShare">Share...</button>' : "") + '<button type="button" class="btn ghost" id="rqCopy">Copy message</button></div>' +
      '<p class="mute small-note">Walk-Up cannot send the message for you. Your own Messages, email or chat app sends it. <button type="button" class="linkbtn" data-act="rq-help">How asking works</button></p></section>';
    var q = function (s) { return $(s, host); }, msg = q("#rqMsg");
    function pl() { return WU.player(pid); }
    function paintStatus() {
      var p = pl(); if (!p) return;
      q("#rqChip").innerHTML = RQ.chipHTML(p); q("#rqStat").textContent = RQ.statusLine(p);
      var w = q("#rqWant"); if (document.activeElement !== w) w.value = p.want || "";
    }
    function paintLinks() {
      var p = pl(); if (!p) return;
      var c = RQ.compose(p);
      q("#rqText").href = C.smsHref(msg.value); q("#rqMail").href = C.mailtoHref(c.subject, msg.value);
      q("#rqNoLink").hidden = msg.value.indexOf(C.sendPageUrl(location.href) + "#r=") >= 0;
    }
    function fresh() { var p = pl(); if (!p) return; if (!edited) msg.value = RQ.compose(p).message; paintLinks(); }
    paintStatus(); fresh();
    msg.addEventListener("input", function () { edited = true; paintLinks(); });
    q("#rqWant").addEventListener("input", function (e) { var p = pl(); if (p) { RQ.setWant(p, e.target.value, true); paintStatus(); } });
    /* the name and number fields above change the message until the coach has typed in it */
    api.el.addEventListener("input", function (e) { if (e.target.id === "plName" || e.target.id === "plNum") { fresh(); } });
    q("#rqText").addEventListener("click", function () { var p = pl(); if (p) RQ.markAsked(p, "text", RQ.tokenIn(p, msg.value)); });
    q("#rqMail").addEventListener("click", function () { var p = pl(); if (p) RQ.markAsked(p, "email", RQ.tokenIn(p, msg.value)); });
    q("#rqCopy").addEventListener("click", function () { var p = pl(); if (p) RQ.doCopy(p, msg.value, RQ.tokenIn(p, msg.value)); });
    var sh = q("#rqShare");
    if (sh) sh.addEventListener("click", function () { var p = pl(); if (p) { var c = RQ.compose(p); RQ.doShare(p, msg.value, c.subject, RQ.tokenIn(p, msg.value)); } });
    var off = WU.on(function (what) {
      if (api.closed) { off(); return; }
      if (what === "data") { paintStatus(); if (!edited) fresh(); else paintLinks(); }
    });
    return { focus: function () { try { host.scrollIntoView({ block: "start" }); msg.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } };
  };

  /* "Song they want": typed by the coach. Pasting a parent's text reply (it ends in [WU-code]) is cleaned up. */
  RQ.setWant = function (p, text, live) {
    var reply = C.parseReplyText(text), w = reply ? reply.want : C.sanitizeWant(text);
    if (reply) p = C.playerByToken(S.st.roster, reply.token) || p;
    p.want = w;
    if (p.req && p.req.st === "asked" && w) p.req.st = "text";
    else if (p.req && p.req.st === "text" && !w) p.req.st = "asked";
    if (live && !reply) WU.save(); else WU.commit("data");
    return p;
  };

  /* ---------- the Song requests sheet ---------- */
  WU.act["rq-list"] = function () { RQ.openList(); };
  RQ.openList = function () {
    var filter = "all", off = null;
    var api = U.openSheet({
      title: "Song requests", cls: "rq tall",
      html: '<div class="rq-prog" id="rqProg"></div>' +
        '<div class="seg" role="group" aria-label="Show"><button type="button" class="segb" data-do="f-all" aria-pressed="true">Everyone</button><button type="button" class="segb" data-do="f-need" aria-pressed="false">Still need a song</button></div>' +
        '<div id="rqRows"></div>' +
        '<p class="mute small-note">A parent can only send a song back as an attachment. When it comes, tap Add songs and pick the file. <button type="button" class="linkbtn" data-act="rq-help">How asking works</button></p>',
      footer: U.fileBtn({ text: "Add songs", cls: "ghost", multiple: true, attr: 'data-file="songs-add"', label: "Add song files that parents sent back" }) + '<button type="button" class="btn" data-close>Done</button>',
      onClose: function () { if (off) off(); }
    });
    var el = api.el, rows = $("#rqRows", el);
    function rowHTML(p) {
      var has = C.hasSongFile(p, songs()), s = WU.song(p.songId), c = RQ.compose(p);
      var h = '<div class="rqrow" data-pid="' + esc(p.id) + '"><div class="row sp"><b class="rqname">' + WU.team.nameHTML(p) + "</b>" + RQ.chipHTML(p) + "</div>";
      if (has) return h + '<p class="mute small-note">Song: ' + esc(s ? s.title : "") + "</p></div>";
      h += '<label class="field"><span class="label">Song they want</span><input type="text" data-want maxlength="' + C.REQ.want + '" autocomplete="off" placeholder="If a parent told you" value="' + esc(p.want) + '"></label>' +
        '<div class="row wrap rqact"><a class="btn small" data-do="r-text" href="' + esc(C.smsHref(c.message)) + '" rel="noopener">Text</a>' +
        (RQ.canShare() ? '<button type="button" class="btn ghost small" data-do="r-share">Share</button>' : "") + '<button type="button" class="btn ghost small" data-do="r-copy">Copy</button></div></div>';
      return h;
    }
    var lastSig = "";
    function paint(chipsOnly) {
      var all = S.st.roster, need = all.filter(function (p) { return !C.hasSongFile(p, songs()); }), pr = C.requestProgress(all, songs());
      $("#rqProg", el).innerHTML = '<b id="rqProgTx">' + esc(pr.text) + '</b><div class="bar" role="img" aria-label="' + esc(pr.text) + '"><i style="width:' + (pr.total ? Math.round(100 * pr.have / pr.total) : 0) + '%"></i></div>';
      var fb = $$(".segb", el); fb[0].setAttribute("aria-pressed", filter === "all"); fb[1].setAttribute("aria-pressed", filter === "need"); fb[1].textContent = "Still need a song (" + need.length + ")";
      if (chipsOnly) {
        $$(".rqrow", rows).forEach(function (r) { var p = WU.player(r.dataset.pid), ch = $("[data-chip]", r); if (p && ch) ch.outerHTML = RQ.chipHTML(p); });
        return;
      }
      var list = filter === "need" ? need : all;
      lastSig = filter + "|" + list.map(function (p) { return p.id + (C.hasSongFile(p, songs()) ? "+" : ""); }).join(",");
      rows.innerHTML = !all.length ? '<p class="mute pad">No players yet. Add players on the Team screen first.</p>' : !list.length ? '<p class="mute pad">Everyone has a song.</p>' : '<div class="card slist">' + list.map(rowHTML).join("") + "</div>";
    }
    paint(false);
    /* rows are only rebuilt when who is listed (or who has a song) changes; otherwise just the chips move, so a tap or a typed note is never lost */
    function sigNow() {
      var all = S.st.roster, list = filter === "need" ? all.filter(function (p) { return !C.hasSongFile(p, songs()); }) : all;
      return filter + "|" + list.map(function (p) { return p.id + (C.hasSongFile(p, songs()) ? "+" : ""); }).join(",");
    }
    off = WU.on(function (what) { if (api.closed || what !== "data") return; paint(sigNow() === lastSig); });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-do]"); if (!b) return;
      var row = b.closest(".rqrow"), p = row ? WU.player(row.dataset.pid) : null, a = b.dataset.do;
      if (a === "f-all" || a === "f-need") { filter = a === "f-all" ? "all" : "need"; paint(false); return; }
      if (!p) return;
      var c = RQ.compose(p);
      if (a === "r-text") RQ.markAsked(p, "text", c.token); /* the link itself opens the Messages app */
      else if (a === "r-copy") RQ.doCopy(p, c.message, c.token);
      else if (a === "r-share") RQ.doShare(p, c.message, c.subject, c.token);
    });
    el.addEventListener("input", function (e) {
      var t = e.target; if (!t.matches || !t.matches("input[data-want]")) return;
      var row = t.closest(".rqrow"), p = row ? WU.player(row.dataset.pid) : null; if (!p) return;
      RQ.setWant(p, t.value, true);
      paint(true); /* the chips and the progress line follow what was typed; the box being typed in is left alone */
    });
    return api;
  };

  /* ---------- Settings: team name and the message ---------- */
  RQ.settingsHTML = function () {
    var s = S.st.settings, tpl = s.reqTpl || C.DEFAULT_TPL;
    return '<section class="card" id="rqSettings"><h3>Asking parents for songs</h3>' +
      '<p class="mute small-note">The message Walk-Up writes when you ask a parent to pick a player\'s song. The words you can use: {first} (first name), {number}, {team} and {link}. If you leave {link} out, Walk-Up adds it at the end.</p>' +
      '<label class="field"><span class="label">Team name (optional)</span><input type="text" id="rqTeam" data-rq="team" maxlength="' + C.REQ.team + '" autocomplete="off" placeholder="Team name" value="' + esc(s.team) + '"></label>' +
      '<label class="field"><span class="label">Message</span><textarea id="rqTpl" data-rq="tpl" maxlength="' + C.REQ.tpl + '" rows="8" spellcheck="true">' + esc(tpl) + '</textarea></label>' +
      '<div class="row wrap"><button type="button" class="btn ghost small" data-act="rq-tpl-reset">Use the standard message</button><button type="button" class="btn ghost small" data-act="rq-help">How asking works</button></div></section>';
  };
  document.addEventListener("input", function (e) {
    var t = e.target, k = t && t.dataset && t.dataset.rq; if (!k) return;
    var s = S.st.settings;
    if (k === "team") s.team = C.cleanLabel(t.value, C.REQ.team);
    else if (k === "tpl") { var v = C.sanitizeTemplate(t.value); s.reqTpl = v === C.DEFAULT_TPL ? "" : v; }
    WU.save();
  });
  WU.act["rq-tpl-reset"] = function () {
    S.st.settings.reqTpl = ""; WU.save();
    var t = $("#rqTpl"); if (t) t.value = C.DEFAULT_TPL;
    U.toast("Back to the standard message.", "ok");
  };

  /* ---------- the help sheet ---------- */
  WU.act["rq-help"] = function () { RQ.openHelp(); };
  RQ.openHelp = function () {
    return U.openSheet({
      title: "Asking parents for songs", cls: "help rq-help",
      html: '<p class="msg">Parents often pick the song. Here is how to get it from them to Walk-Up, step by step.</p>' +
        '<ol class="steps">' +
        '<li><b>Send the ask.</b> Open a player (Team screen) or Song requests, then tap Text it, Email it, Share or Copy message. Walk-Up writes a message with a link for that player.</li>' +
        '<li><b>The parent opens the link.</b> It is a plain web page. Nothing to install, no sign-in. They choose the song on their phone and tap Send it back.</li>' +
        '<li><b>Their phone sends the song to you.</b> Their share menu sends the file into the same chat or email. Its name starts with WU- and a short code, which is how Walk-Up knows whose it is.</li>' +
        '<li><b>Save the song file.</b> On an iPhone, touch and hold the attachment and choose Save to Files. On an Android phone you can share it straight to Walk-Up, or save it to Downloads.</li>' +
        '<li><b>Add it.</b> In Walk-Up tap Add songs and pick the file. Walk-Up asks "Use it for ...?" and sets the song for that player. Several files at once are fine.</li></ol>' +
        '<h3 class="rq-h">Good to know</h3>' +
        '<ul class="rq-list"><li><b>Nothing uploads by itself.</b> The song comes back as an attachment, and it takes one tap to add it.</li>' +
        '<li><b>Plain text messages can refuse big files.</b> iMessage, WhatsApp and email handle them best. The parent page warns about files over 10 MB and can send just the part they like.</li>' +
        '<li><b>iPhone and Android differ.</b> An iPhone cannot share a file straight into Walk-Up, so save it to Files first. On Android, once Walk-Up is installed to the home screen, it may appear in the share menu. How that menu looks depends on the phone.</li>' +
        '<li><b>Nothing is stored on a server.</b> The link holds only the first name, the number and a short code. The parent page saves nothing on their phone.</li>' +
        '<li><b>A song name instead of a file?</b> Type it in "Song they want". The player card shows it until you add the file.</li></ul>',
      footer: '<button type="button" class="btn ghost" data-act="rq-list">Song requests</button><button type="button" class="btn" data-close>Done</button>'
    });
  };

  /* ---------- taking songs in: one pipeline for Add songs and the Android share inbox ---------- */
  var chain = Promise.resolve();
  RQ.importSongs = function (files, opts) {
    var list = Array.prototype.slice.call(files || []);
    chain = chain.then(function () { return run(list, opts || {}); }).catch(function (e) { console.error(e); U.toast("Something went wrong adding those songs.", "error"); });
    return chain;
  };
  /* one confirmation per song that carries a player's code; closing it any way means Not now */
  RQ.askUse = function (f, parsed, pl, existing, idx, total) {
    return new Promise(function (resolve) {
      var done = false, nm = first(pl) || (pl.num ? "#" + pl.num : "this player");
      function fin(v) { if (!done) { done = true; resolve(v); } }
      var api = U.openSheet({
        title: "Song from a parent", cls: "confirm rq-in",
        html: '<p class="msg">Song from a parent: "' + esc(parsed.title) + '". Use it for ' + esc(who(pl)) + "?</p>" +
          '<p class="mute small-note">' + esc(f.name) + " · " + esc(C.fmtSize(f.size)) + (existing ? " · already in your songs" : "") + (total > 1 ? " · song " + idx + " of " + total : "") + "</p>",
        footer: '<button type="button" class="btn" data-pick="use">Use it for ' + esc(nm) + "</button>" + (existing ? "" : '<button type="button" class="btn ghost" data-pick="lib">Just add to library</button>') + '<button type="button" class="btn ghost" data-close>Not now</button>',
        onClose: function () { fin("skip"); }
      });
      api.el.addEventListener("click", function (e) {
        var b = e.target.closest("[data-pick]"); if (!b) return;
        fin(b.dataset.pick); api.close();
      });
    });
  };
  async function run(list, opts) {
    if (!list.length) return;
    var seen = {}, plain = [], unknown = [], matched = [], dups = [];
    list.forEach(function (f) {
      var key = C.str(f.name, C.LIM.file) + "|" + f.size;
      if (seen[key]) { dups.push(f); return; }
      seen[key] = 1;
      var parsed = C.parseSongFileName(f.name), dup = C.findDuplicateSong(songs(), f.name, f.size), pl = parsed ? C.playerByToken(S.st.roster, parsed.token) : null;
      if (pl && dup && pl.songId === dup.id) { if (pl.req) pl.req.st = "got"; dups.push(f); } /* already this player's song */
      else if (pl) matched.push({ f: f, parsed: parsed, pl: pl, dup: dup });
      else if (dup) dups.push(f);
      else if (parsed) unknown.push(f);
      else plain.push(f);
    });
    var anyToken = matched.length + unknown.length > 0, r = { added: [] };
    if (plain.length + unknown.length) r = await WU.songs.addFiles(plain.concat(unknown));
    if (!anyToken && !dups.length) {
      /* the everyday case: no codes at all, so this is the plain Add songs behaviour */
      if (r.added.length === 1) { U.toast("Added \"" + r.added[0].title + "\".", "ok"); WU.songs.openSongTrim(r.added[0]); }
      else if (r.added.length > 1) U.toast("Added " + r.added.length + " songs.", "ok");
      return;
    }
    if (unknown.length && r.added.length) U.toast("Added to your songs. Pick it for a player from the player's Song button.", "ok", 6500);
    else if (plain.length && r.added.length) U.toast(r.added.length === 1 ? "Added \"" + r.added[0].title + "\"." : "Added " + r.added.length + " songs.", "ok");
    var used = [], skipped = 0;
    for (var i = 0; i < matched.length; i++) {
      var m = matched[i], pl = WU.player(m.pl.id);
      if (!pl) continue;
      var choice = await RQ.askUse(m.f, m.parsed, pl, m.dup, i + 1, matched.length);
      if (choice === "skip") { skipped++; continue; }
      var song = m.dup;
      if (!song) { var r2 = await WU.songs.addFiles([m.f]); song = r2.added[0]; if (!song) continue; }
      if (pl.req) pl.req.st = "got";
      if (choice === "use") { WU.songs.choose(pl.id, song.id); used.push(song); }
      else { WU.commit("data"); U.toast("Added \"" + song.title + "\" to your songs. Pick it for " + (first(pl) || "the player") + " from the player's Song button.", "ok", 6500); }
    }
    if (dups.length) U.toast(dups.length === 1 ? "\"" + C.str(dups[0].name, 60) + "\" is already in your songs." : dups.length + " of those songs were already in your songs.", "warn", 5500);
    if (skipped) U.toast(opts.inbox ? "Skipped. That file was not saved, so share it again when you are ready." : "Skipped. Choose it again with Add songs when you are ready.", "warn", 6000);
    if (list.length === 1 && used.length === 1) WU.songs.openSongTrim(used[0]);
  }

  /* ---------- the Android share inbox (the service worker keeps shared files here until the app picks them up) ---------- */
  var checking = false;
  RQ.checkInbox = async function () {
    if (checking || !window.caches) return 0;
    checking = true;
    try {
      if (!(await caches.has(INBOX))) return 0;
      var cache = await caches.open(INBOX), reqs = await cache.keys(), files = [];
      reqs.sort(function (a, b) { return a.url < b.url ? -1 : 1; });
      for (var i = 0; i < reqs.length; i++) {
        var res = await cache.match(reqs[i]); if (!res) continue;
        var nm = "song"; try { nm = decodeURIComponent(res.headers.get("x-wu-name") || "song"); } catch (e) { /* keep the default */ }
        files.push(new File([await res.arrayBuffer()], C.str(nm, C.LIM.file) || "song", { type: res.headers.get("content-type") || "" }));
      }
      await Promise.all(reqs.map(function (r) { return cache.delete(r); }));
      if (files.length) { U.toast(files.length === 1 ? "A song was shared to Walk-Up." : files.length + " songs were shared to Walk-Up.", "ok", 3000); RQ.importSongs(files, { inbox: true }); }
      return files.length;
    } catch (e) { return 0; } finally { checking = false; }
  };
  RQ.start = function () {
    try { if (/[?&]inbox=1/.test(location.search)) history.replaceState(history.state, "", location.pathname + location.hash); } catch (e) { /* ignore */ }
    RQ.checkInbox();
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") RQ.checkInbox(); });
  };
})();
