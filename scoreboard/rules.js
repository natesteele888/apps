/* Scoreboard rules forms: the per-sport settings (period length, bonus, innings, mercy rule...), used both for the
   defaults on the home screen and for the game in progress. Also the team name and color fields. */
(function () {
  "use strict";
  const SB = window.SB, C = SB.C, $ = SB.$, $$ = SB.$$, esc = SB.esc;

  const PRESET_MIN = { basketball: [6, 8, 10, 12, 15, 20], football: [8, 10, 12, 15] };

  function lengthHTML(label, sec, sport) {
    const mm = Math.floor(sec / 60), ss = sec % 60;
    return '<div class="field"><span class="label" id="r-len-l">' + esc(label) + "</span>" +
      SB.pills("preset", PRESET_MIN[sport].map(m => [m, m + " min"]), ss === 0 ? mm : "", "Preset lengths") +
      '<div class="len-row"><label><span class="hint">Minutes</span><input type="number" inputmode="numeric" id="r-min" min="0" max="99" value="' + mm + '" aria-label="Period minutes"></label>' +
      '<span class="colon" aria-hidden="true">:</span><label><span class="hint">Seconds</span><input type="number" inputmode="numeric" id="r-sec" min="0" max="59" value="' + pad(ss) + '" aria-label="Period seconds"></label></div></div>';
  }
  const pad = n => (n < 10 ? "0" : "") + n;

  /* the form for one sport's rules. cfg is a sanitized cfg. */
  SB.rulesHTML = function (sport, cfg) {
    const ot = Math.max(1, Math.round(cfg.otSec / 60));
    if (sport === "basketball") {
      return lengthHTML("Period length", cfg.periodSec, sport) +
        '<div class="field"><span class="label">Game is played in</span>' + SB.pills("periods", [[4, "Quarters"], [2, "Halves"]], cfg.periods, "Quarters or halves") + "</div>" +
        '<label class="field"><span class="label">Overtime length (minutes)</span><input type="number" inputmode="numeric" id="r-ot" min="1" max="20" value="' + ot + '" data-orig="' + ot + '"></label>' +
        '<div class="field"><span class="label">Team foul bonus</span>' + SB.pills("bonusAt", [[0, "Off"], [5, "At 5"], [7, "At 7"], [10, "At 10"]], cfg.bonusAt, "Bonus at") +
        '<span class="hint">The team shooting free throws gets a BONUS light when the other team reaches this many fouls in the period.</span></div>' +
        '<div class="field"><span class="label">Team fouls reset</span>' + SB.pills("foulReset", [["period", "Each period"], ["half", "Each half"]], cfg.foulReset, "Foul reset") + "</div>" +
        SB.numField("r-to", "Timeouts per team", cfg.timeouts, 0, 9) +
        '<div class="field"><span class="label">Timeouts refill</span>' + SB.pills("toReset", [["half", "Each half"], ["game", "Never (whole game)"]], cfg.toReset, "Timeout refill") + "</div>";
    }
    if (sport === "football") {
      return lengthHTML("Quarter length", cfg.periodSec, sport) +
        '<label class="field"><span class="label">Overtime length (minutes)</span><input type="number" inputmode="numeric" id="r-ot" min="1" max="20" value="' + ot + '" data-orig="' + ot + '"></label>' +
        SB.numField("r-to", "Timeouts per team, each half", cfg.timeouts, 0, 9) +
        SB.numField("r-fd", "Yards for a first down", cfg.firstDown, 1, 99);
    }
    if (sport === "baseball") {
      const inn = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [n, String(n)]);
      return '<div class="field"><span class="label">Innings</span>' + SB.pills("innings", inn, cfg.innings, "Innings") + "</div>" +
        SB.toggle("extra", "Extra innings if tied", cfg.extra, "Off means a tie after the last inning is a final tie.") +
        '<div class="field"><span class="label">Mercy rule: runs ahead</span>' + SB.pills("mercyRuns", [[0, "Off"], [8, "8"], [10, "10"], [12, "12"], [15, "15"]], cfg.mercyRuns, "Mercy rule runs") +
        '<span class="hint">Only shows a "Mercy rule reached" banner. It never ends the game for you.</span></div>' +
        SB.numField("r-mi", "Mercy rule counts after inning", cfg.mercyInning, 1, 9) +
        SB.toggle("pitch", "Pitch counter", cfg.pitch, "Counts every ball, strike, foul, hit, error and out for the team in the field. Fix a count from the menu.");
    }
    return '<p class="msg mute">Nothing to set for this one. It is two scores, a few buttons and a label you can type.</p>';
  };

  /* wires the preset pills and the minutes/seconds fields together */
  SB.wireRules = function (root) {
    const mn = $("#r-min", root), sc = $("#r-sec", root);
    if (!mn) return;
    const sync = () => {
      const m = Number(mn.value), s = Number(sc.value);
      $$('[data-pills="preset"] button', root).forEach(b => b.setAttribute("aria-pressed", String(s === 0 && Number(b.dataset.v) === m)));
    };
    root.addEventListener("click", e => {
      const b = e.target.closest('[data-pills="preset"] button');
      if (b) { mn.value = b.dataset.v; sc.value = "00"; }
    });
    mn.addEventListener("input", sync); sc.addEventListener("input", sync);
  };

  /* reads the form back into a cfg (the engine clamps anything silly) */
  SB.readRules = function (root, sport, cur) {
    const num = (id, d) => { const el = $("#" + id, root); if (!el || el.value === "") return d; const n = Number(el.value); return isFinite(n) ? n : d; };
    const o = {};
    if (sport === "basketball" || sport === "football") {
      o.periodSec = num("r-min", Math.floor(cur.periodSec / 60)) * 60 + num("r-sec", cur.periodSec % 60);
      const ot = $("#r-ot", root);
      o.otSec = ot && Number(ot.value) !== Number(ot.dataset.orig) ? num("r-ot", 3) * 60 : cur.otSec;
      o.timeouts = num("r-to", cur.timeouts);
    }
    if (sport === "basketball") {
      o.periods = Number(SB.pillVal(root, "periods")) || cur.periods;
      o.bonusAt = Number(SB.pillVal(root, "bonusAt"));
      o.foulReset = SB.pillVal(root, "foulReset") || cur.foulReset;
      o.toReset = SB.pillVal(root, "toReset") || cur.toReset;
    }
    if (sport === "football") o.firstDown = num("r-fd", cur.firstDown);
    if (sport === "baseball") {
      o.innings = Number(SB.pillVal(root, "innings")) || cur.innings;
      o.extra = SB.switchVal(root, "extra");
      o.mercyRuns = Number(SB.pillVal(root, "mercyRuns"));
      o.mercyInning = num("r-mi", cur.mercyInning);
      o.pitch = SB.switchVal(root, "pitch");
    }
    return o;
  };

  /* team name + color for both sides */
  SB.teamsHTML = function (teams) { return SB.teamRow(0, teams[0], "Home team") + SB.teamRow(1, teams[1], "Away team"); };
  SB.readTeams = function (root) {
    return [0, 1].map(i => ({ n: ($$(".t-in", root)[i].value || "").trim(), c: SB.pillVal(root, "color" + i) }));
  };
})();
