/* Scoreboard app: home screen, recent games, settings, backup and restore, and start-up.
   The scoreboard itself lives in board.js. */
(function () {
  "use strict";
  const SB = window.SB, C = SB.C, $ = SB.$, $$ = SB.$$, esc = SB.esc, ACT = SB.ACT, IC = SB.icons;
  SB.prefs = C.defaultPrefs();
  SB.recent = [];
  const S = { damaged: false, homeTeams: null };

  SB.savePrefs = () => SB.save("prefs", SB.prefs);
  const saveRecent = () => SB.save("recent", SB.recent);

  function loadAll() {
    SB.prefs = C.sanitizePrefs(SB.readJSON("prefs"));
    const r = SB.readJSON("recent");
    SB.recent = Array.isArray(r) ? r.map(C.sanitizeRecent).filter(Boolean).slice(0, C.RECENT_LIMIT) : [];
    const raw = SB.readJSON("game");
    SB.game = null; S.damaged = false;
    if (raw === undefined) { S.damaged = true; SB.store.del("game"); }
    else if (raw) { SB.game = C.sanitizeGame(raw); if (!SB.game) { S.damaged = true; SB.store.del("game"); } }
    S.homeTeams = SB.prefs.teams.map(t => ({ n: t.n, c: t.c }));
  }

  /* ================= home ================= */
  const gear = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>';
  const logoSvg = '<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="1.5" y="1.5" width="61" height="37" rx="7" fill="#0d1117" stroke="#34445a" stroke-width="3"/><text x="19" y="29" text-anchor="middle" font-size="26" font-weight="700" fill="#29d3e0" font-family="Arial Narrow,Arial,sans-serif">2</text><text x="45" y="29" text-anchor="middle" font-size="26" font-weight="700" fill="#ffc83d" font-family="Arial Narrow,Arial,sans-serif">1</text><circle cx="32" cy="15" r="2" fill="#9db0c3"/><circle cx="32" cy="25" r="2" fill="#9db0c3"/></svg>';

  function ruleLine(sport, cfg) {
    if (sport === "basketball") return C.fmtClock(cfg.periodSec * 1000) + (cfg.periods === 2 ? " halves" : " quarters") + (cfg.bonusAt ? ", bonus at " + cfg.bonusAt : "") + ", " + cfg.timeouts + " timeouts";
    if (sport === "football") return C.fmtClock(cfg.periodSec * 1000) + " quarters, " + cfg.timeouts + " timeouts a half";
    if (sport === "baseball") return cfg.innings + " innings" + (cfg.extra ? ", extra innings" : "") + (cfg.mercyRuns ? ", mercy at " + cfg.mercyRuns : "");
    return "Two scores and a label";
  }
  const START = { basketball: "Start a basketball game", baseball: "Start a baseball game", football: "Start a football game", generic: "Just keep score" };

  function resumeCard(g) {
    return '<section class="card resume" aria-label="Game in progress"><div class="rc-top"><span class="rc-ic" aria-hidden="true">' + C.sportInfo(g.sport).icon + '</span><div class="rc-t"><div class="rc-k">GAME IN PROGRESS</div>' +
      '<div class="rc-s"><span style="color:' + esc(g.teams[0].c) + '">' + esc(g.teams[0].n) + " " + g.score[0] + '</span> <span class="mute">-</span> <span style="color:' + esc(g.teams[1].c) + '">' + g.score[1] + " " + esc(g.teams[1].n) + "</span></div>" +
      '<div class="rc-p">' + esc(C.progressText(g)) + "</div></div></div>" +
      '<div class="row"><button type="button" class="btn grow" data-act="resume">Resume game</button><button type="button" class="btn ghost" data-act="discard-live">Throw away</button></div></section>';
  }
  function recentRow(g) {
    const w = g.score[0] === g.score[1] ? -1 : g.score[0] > g.score[1] ? 0 : 1;
    return '<button type="button" class="grow-row" data-act="open-recent" data-id="' + esc(g.id) + '"><span class="gi" aria-hidden="true">' + C.sportInfo(g.sport).icon + '</span><span class="gm"><span class="gs">' +
      '<span class="' + (w === 0 ? "win" : "") + '" style="color:' + esc(g.teams[0].c) + '">' + esc(g.teams[0].n) + " " + g.score[0] + '</span><span class="mute"> - </span><span class="' + (w === 1 ? "win" : "") + '" style="color:' + esc(g.teams[1].c) + '">' + g.score[1] + " " + esc(g.teams[1].n) + "</span></span>" +
      '<span class="gd">' + esc(C.fmtDate(g.date)) + " &middot; " + esc(C.statusText(g, g.status)) + (g.sample ? ' &middot; <b class="chip">Sample</b>' : "") + "</span></span>" + IC.next + "</button>";
  }
  SB.renderHome = function () {
    const view = $("#view"); if (!view) return;
    const T = S.homeTeams;
    let h = '<div class="home"><header class="h-head"><div class="h-logo">' + logoSvg + '</div><div class="h-t"><h1>Scoreboard</h1><p class="tagline">A scoreboard for any gym or field</p></div>' +
      '<button type="button" class="icon-btn" data-act="settings" aria-label="Settings">' + gear + "</button></header>";
    if (SB.memMode) h += '<div class="banner bad" role="alert"><p><b>This browser is not letting Scoreboard save.</b> Games and settings will be lost when you close the app. You can still keep score.</p></div>';
    if (SB.game) h += resumeCard(SB.game);
    h += '<section class="card"><div class="card-head"><h2 class="sec">Teams</h2><button type="button" class="btn ghost small" data-act="swap-teams">' + IC.swap + ' Swap</button></div><p class="hint" style="margin:-2px 0 10px">Names show on the board. Home is on the left. Tap a color circle to change its color.</p>' +
      SB.teamRow(0, T[0], "Home team") + SB.teamRow(1, T[1], "Away team") + "</section>";
    h += '<section aria-label="Start a game"><h2 class="sec pad">Start a game</h2><div class="sports">' + C.SPORTS.map(s =>
      '<div class="sport-row"><button type="button" class="sport-btn" data-act="start" data-sport="' + s.id + '" aria-labelledby="sbn-' + s.id + '" aria-describedby="sbd-' + s.id + '"><span class="si" aria-hidden="true">' + s.icon + '</span><span class="st"><b id="sbn-' + s.id + '">' + esc(START[s.id]) + '</b><small id="sbd-' + s.id + '">' + esc(ruleLine(s.id, SB.prefs.cfg[s.id])) + "</small></span></button>" +
      (s.id === "generic" ? "" : '<button type="button" class="icon-btn" data-act="rules" data-sport="' + s.id + '" aria-label="' + esc(s.label) + ' rules">' + gear + "</button>") + "</div>").join("") + "</div></section>";
    h += '<section aria-label="Recent games"><h2 class="sec pad">Recent games</h2>';
    if (SB.recent.length) h += '<div class="recent">' + SB.recent.map(recentRow).join("") + "</div>";
    else h += '<div class="empty"><p><b>No finished games yet.</b></p><p class="mute">When you finish a game it is saved here with its final board and line score.</p><button type="button" class="btn ghost small" data-act="sample">Try a sample</button></div>';
    h += '</section><p class="foot-note">' + esc(C.VERSION) + ". Everything stays on this phone. No account, nothing is sent anywhere.</p></div>";
    view.innerHTML = h;
  };
  function readHomeTeams() {
    const root = $("#view .home"); if (!root) return S.homeTeams;
    return [0, 1].map(i => { const box = $('.team-edit[data-team="' + i + '"]', root); return { n: ($(".t-in", box).value || "").trim(), c: SB.pillVal(box, "color" + i) || S.homeTeams[i].c }; });
  }
  function syncHomeTeams(persist) {
    const t = readHomeTeams(); S.homeTeams = t;
    SB.prefs.teams = C.sanitizeTeams(t);
    if (persist) SB.savePrefs();
  }
  ACT["swap-teams"] = () => { const t = readHomeTeams(); S.homeTeams = [t[1], t[0]]; syncHomeTeams(true); SB.renderHome(); };

  /* ================= starting, resuming, finishing ================= */
  function doStart(sport) {
    syncHomeTeams(true);
    const g = C.newGame(sport, { teams: SB.prefs.teams, cfg: SB.prefs.cfg[sport], date: SB.today() });
    SB.game = g; SB.save("game", g);
    SB.enterBoard();
  }
  function saveLiveAs(status) {
    const g = SB.game; if (!g) return;
    SB.recent = C.addRecent(SB.recent, C.makeRecent(g, status, Date.now())); saveRecent();
  }
  ACT.start = el => {
    const sport = el.dataset.sport;
    syncHomeTeams(true);
    if (!SB.game) return doStart(sport);
    const g = SB.game;
    SB.openSheet({
      title: "A game is already open",
      html: '<p class="msg">' + esc(C.summary(g)) + " (" + esc(C.progressText(g)) + ") is still in progress. Starting a new game ends it.</p>",
      footer: '<div class="stack-foot"><button type="button" class="btn" data-keep>Save it to Recent, then start</button><button type="button" class="btn danger solid" data-toss>Throw it away, then start</button><button type="button" class="btn ghost" data-close>Cancel</button></div>',
      onOpen(api) {
        $("[data-keep]", api.el).addEventListener("click", () => { api.close(); saveLiveAs("stopped"); doStart(sport); });
        $("[data-toss]", api.el).addEventListener("click", () => { api.close(); doStart(sport); });
      }
    });
  };
  ACT.resume = () => { if (SB.game) SB.enterBoard(); };
  ACT["discard-live"] = () => ACT["b-discard"]();
  ACT["b-discard"] = () => {
    if (!SB.game) return;
    SB.confirmSheet({
      title: "Throw this game away?", message: C.summary(SB.game) + " will not be saved anywhere.", more: ["This can't be undone."], confirmText: "Throw it away", danger: true,
      onConfirm() { SB.game = null; SB.store.del("game"); if (SB.view === "board") SB.leaveBoard(); else SB.renderHome(); SB.toast("Game thrown away.", "ok"); }
    });
  };
  ACT["b-finish"] = () => {
    const g = SB.game; if (!g) return;
    const t = g.sport === "baseball" && !g.final ? "This game isn't over by the rules yet. You can still finish it now." : "";
    SB.openSheet({
      title: "Finish this game?",
      html: '<p class="msg">It is saved to Recent games as:</p><pre class="resultbox">' + esc(C.resultText(g, "final")) + "</pre>" + (t ? '<p class="msg mute">' + esc(t) + "</p>" : "") +
        '<button type="button" class="btn ghost block small" data-stop style="margin-top:12px">Stopped early? Save it as stopped instead</button>',
      footer: '<button type="button" class="btn ghost" data-close>Keep playing</button><button type="button" class="btn" data-ok>Finish &amp; save</button>',
      onOpen(api) {
        const fin = status => { api.close(); finishGame(status); };
        $("[data-ok]", api.el).addEventListener("click", () => fin("final"));
        $("[data-stop]", api.el).addEventListener("click", () => fin("stopped"));
      }
    });
  };
  function finishGame(status) {
    const g = SB.game; if (!g) return;
    const entry = C.makeRecent(g, status, Date.now());
    SB.recent = C.addRecent(SB.recent, entry); saveRecent();
    SB.game = null; SB.store.del("game");
    SB.leaveBoard();
    SB.toast(status === "stopped" ? "Saved as stopped." : "Game saved to Recent games.", "ok");
    openRecent(entry.id);
  }

  /* ================= recent games ================= */
  function openRecent(id) {
    const g = SB.recent.filter(x => x.id === id)[0]; if (!g) return;
    const st = C.statusText(g, g.status);
    const t = i => '<div class="rv-t" style="--tc:' + esc(g.teams[i].c) + '"><span class="n">' + esc(g.teams[i].n) + '</span><b data-d="' + Math.min(4, String(g.score[i]).length) + '">' + g.score[i] + "</b></div>";
    SB.openSheet({
      title: C.sportInfo(g.sport).label, cls: "tall",
      html: '<p class="rv-st">' + esc(st) + " &middot; " + esc(C.fmtDate(g.date)) + (g.sample ? ' &middot; <b class="chip">Sample</b>' : "") + '</p><div class="rv-board">' + t(0) + t(1) + "</div>" + SB.lineScoreHTML(g) +
        '<div class="stack" style="margin-top:14px"><button type="button" class="btn block" data-act="rv-share" data-id="' + esc(g.id) + '">Share result</button><button type="button" class="btn ghost block" data-act="rv-pic" data-id="' + esc(g.id) + '">Share picture</button></div>',
      footer: '<button type="button" class="btn danger" data-act="rv-del" data-id="' + esc(g.id) + '">Delete game</button><button type="button" class="btn ghost" data-close>Close</button>'
    });
  }
  const recentById = id => SB.recent.filter(x => x.id === id)[0];
  ACT["open-recent"] = el => openRecent(el.dataset.id);
  ACT["rv-share"] = el => { const g = recentById(el.dataset.id); if (g) SB.shareResult(g, g.status); };
  ACT["rv-pic"] = el => { const g = recentById(el.dataset.id); if (g) SB.sharePicture(g, g.status); };
  ACT["rv-del"] = el => {
    const g = recentById(el.dataset.id); if (!g) return;
    SB.confirmSheet({
      title: "Delete this game?", message: C.summary(g) + " (" + C.fmtDate(g.date) + ") will be removed from Recent games.", more: ["This can't be undone."], confirmText: "Delete", danger: true,
      onConfirm() { SB.recent = SB.recent.filter(x => x.id !== g.id); saveRecent(); SB.closeAllSheets(); SB.renderHome(); SB.toast("Game deleted.", "ok"); }
    });
  };
  ACT.sample = () => {
    const list = C.sampleGames(SB.today(), Date.now());
    list.slice().reverse().forEach(g => { SB.recent = C.addRecent(SB.recent, g); });
    saveRecent(); SB.renderHome(); SB.toast("Added three sample games. Delete them any time.", "ok");
  };

  /* ================= rules for each sport ================= */
  ACT.rules = el => {
    const sport = el.dataset.sport, label = C.sportInfo(sport).label;
    SB.openSheet({
      title: label + " rules", cls: "tall",
      html: '<p class="msg mute" style="margin-bottom:10px">These are used each time you start a ' + esc(label.toLowerCase()) + " game. You can also change them during a game.</p>" + SB.rulesHTML(sport, SB.prefs.cfg[sport]),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Save</button>',
      onOpen(api) {
        SB.wireRules(api.el);
        $("[data-save]", api.el).addEventListener("click", () => {
          SB.prefs.cfg[sport] = C.sanitizeCfg(sport, SB.readRules(api.el, sport, SB.prefs.cfg[sport])); SB.savePrefs();
          api.close(); if (SB.view === "home") SB.renderHome(); SB.toast("Saved.", "ok", 1500);
        });
      }
    });
  };

  /* ================= settings, backup, restore ================= */
  function lastBackupText() {
    const b = SB.prefs.lastBackup; if (!b) return "You haven't made a backup yet.";
    const d = Math.round((new Date(SB.today() + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000);
    return "Last backup: " + (d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago") + ".";
  }
  ACT.settings = () => {
    const n = SB.recent.length;
    SB.openSheet({
      title: "Settings", cls: "tall",
      html: '<div class="menu-sec first">' + SB.toggle("sound", "Buzzer sound", SB.prefs.sound, "Plays when a game clock reaches zero.") + SB.toggle("loud", "Loud buzzer", SB.prefs.loud, "Longer and louder, for a noisy gym.") +
        '<button type="button" class="btn ghost small" data-act="test-buzz">Test the buzzer</button></div>' +
        '<h3 class="sub-h">Rules for each sport</h3><div class="pills">' + ["basketball", "baseball", "football"].map(s => '<button type="button" class="pill" data-act="rules" data-sport="' + s + '">' + C.sportInfo(s).icon + " " + esc(C.sportInfo(s).label) + "</button>").join("") + "</div>" +
        '<h3 class="sub-h">Back up &amp; restore</h3><p class="msg">Everything is saved only on this phone, in this browser. Clearing the browser\'s data erases it, so back up now and then. A backup holds your ' + (n ? n + " recent " + (n === 1 ? "game" : "games") : "recent games (none yet)") + " and these settings.</p><p class=\"msg mute\" id=\"last-bk\">" + esc(lastBackupText()) + "</p>" +
        '<div class="stack" style="margin-top:10px"><button type="button" class="btn block" data-act="dl-backup">Back up now</button><label class="btn ghost block file-btn">Restore from a backup file<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Scoreboard backup file"></label></div>' +
        (SB.memMode ? '<p class="errmsg">This browser is not letting Scoreboard save, so a backup is the only way to keep these.</p>' : "") +
        '<h3 class="sub-h">About</h3><p class="msg"><b>' + esc(C.VERSION) + '</b></p><p class="msg mute">A scoreboard for any gym or field. No account, no ads, nothing is sent anywhere. Only a backup file or a picture you choose to share ever leaves the app.</p>' +
        '<button type="button" class="btn danger block" data-act="clear-all" style="margin-top:14px">Clear everything</button>',
      footer: '<button type="button" class="btn" data-close>Done</button>',
      onOpen(api) { api.el.addEventListener("switch", () => { SB.prefs.sound = SB.switchVal(api.el, "sound"); SB.prefs.loud = SB.switchVal(api.el, "loud"); SB.savePrefs(); }); }
    });
  };
  SB.backupFile = () => ({ name: "scoreboard-backup-" + SB.today() + ".json", json: JSON.stringify(C.makeBackup(SB.prefs, SB.recent, Date.now()), null, 1) });
  ACT["dl-backup"] = () => {
    try {
      const f = SB.backupFile();
      SB.downloadBlob(new Blob([f.json], { type: "application/json" }), f.name);
      SB.prefs.lastBackup = SB.today(); SB.savePrefs();
      const lb = $("#last-bk"); if (lb) lb.textContent = lastBackupText();
      SB.toast("Backup saved as " + f.name + ". Keep it somewhere safe.", "ok", 5000);
    } catch (e) { SB.toast("Couldn't make the backup file. Try again.", "error"); }
  };
  function onRestoreFile(file) {
    if (!file) return;
    const bad = m => SB.toast(m + " Nothing was changed.", "error", 6000);
    if (file.size > 10 * 1024 * 1024) return bad("That file is too big to be a Scoreboard backup.");
    const rd = new FileReader();
    rd.onerror = () => bad("Couldn't read that file.");
    rd.onload = () => {
      let obj;
      try { obj = JSON.parse(String(rd.result)); } catch (e) { return bad("That file isn't a Scoreboard backup (it can't be read)."); }
      const v = C.validateBackup(obj);
      if (!v.ok) return bad(v.error);
      const n = SB.recent.length, m = v.recent.length;
      SB.confirmSheet({
        title: "Replace your games and settings?",
        message: "This backup has " + m + " recent " + (m === 1 ? "game" : "games") + " and the settings.",
        more: [(n ? "Restoring replaces the " + n + " recent " + (n === 1 ? "game" : "games") + " and the settings on this phone now. This can't be undone." : "Your recent games list is empty, so the games in the backup will be added and the settings replaced.") + " A game in progress is not touched."],
        confirmText: "Restore", danger: n > 0, onConfirm() { applyRestore(v); }
      });
    };
    rd.readAsText(file);
  }
  function applyRestore(v) {
    const oldRecent = SB.recent, oldPrefs = SB.prefs;
    SB.recent = v.recent; SB.prefs = v.prefs; SB.prefs.lastBackup = SB.today();
    if (!SB.store.set("recent", JSON.stringify(SB.recent)) || !SB.store.set("prefs", JSON.stringify(SB.prefs))) {
      SB.recent = oldRecent; SB.prefs = oldPrefs; SB.store.set("recent", JSON.stringify(oldRecent)); SB.store.set("prefs", JSON.stringify(oldPrefs));
      return SB.toast("Couldn't restore (storage problem). Your games on this phone were left as they were.", "error", 6500);
    }
    S.homeTeams = SB.prefs.teams.map(t => ({ n: t.n, c: t.c }));
    SB.closeAllSheets(); if (SB.view === "home") SB.renderHome();
    SB.toast("Restored " + v.recent.length + (v.recent.length === 1 ? " game" : " games") + " and the settings.", "ok");
  }
  ACT["clear-all"] = () => {
    SB.confirmSheet({
      title: "Clear everything?", message: "This erases your recent games, your settings and any game in progress from this phone.", more: ["Back up first if you want a copy. This can't be undone."], confirmText: "Erase everything", danger: true,
      onConfirm() {
        SB.store.keys().forEach(k => SB.store.del(k));
        SB.prefs = C.defaultPrefs(); SB.recent = []; SB.game = null; S.homeTeams = SB.prefs.teams.map(t => ({ n: t.n, c: t.c }));
        if (SB.view === "board") SB.leaveBoard();
        SB.closeAllSheets(); SB.renderHome(); SB.toast("Everything was cleared.", "ok");
      }
    });
  };

  /* ================= wiring ================= */
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (el && !el.disabled && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.matches && t.matches("[data-restore]")) { const f = t.files && t.files[0]; t.value = ""; onRestoreFile(f); return; }
    if (t.matches && t.matches(".home .t-in")) syncHomeTeams(true);
  });
  document.addEventListener("input", e => { if (e.target.matches && e.target.matches(".home .t-in")) syncHomeTeams(false); });
  document.addEventListener("click", e => { if (e.target.closest(".home .swatches button")) setTimeout(() => syncHomeTeams(true), 0); });

  function init() {
    SB.memMode = !SB.probeStorage();
    loadAll();
    if (SB.game && SB.store.get("view") === "board") SB.enterBoard(); else SB.renderHome();
    if (S.damaged) setTimeout(() => SB.toast("A saved game couldn't be read, so it was cleared. Your recent games are fine.", "error", 7000), 400);
    if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  window.SBApp = { SB: SB, core: C, S: S, reload() { loadAll(); if (SB.view === "board") SB.renderBoard(); else SB.renderHome(); } };
  init();
})();
