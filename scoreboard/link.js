/* Scoreboard and Tournament Pack on the same phone: keep score for a tournament game, then hand the final back.
   Tournament Pack opens this page with ?keep=<token> after leaving the game under localStorage "apps.handoff.<token>"
   (the two apps share this site's storage). A finished game leaves its final under "apps.handoff.<token>.result",
   which Tournament Pack reads the next time it is open. Nothing is sent anywhere. */
(function () {
  "use strict";
  const SB = window.SB, C = SB.C, esc = SB.esc;
  const KEY = t => "apps.handoff." + t;
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  function dropQuery() {
    try { const u = new URL(location.href); u.searchParams.delete("keep"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
  }
  SB.takeRequest = () => {
    let token = null;
    try { token = new URL(location.href).searchParams.get("keep"); } catch (e) { /* ignore */ }
    if (!token) return;
    dropQuery();
    let req = null;
    try { req = C.linkRequest(JSON.parse(get(KEY(token)) || "null"), token, Date.now()); } catch (e) { req = null; }
    if (!req) { SB.toast("That Tournament Pack game couldn't be opened here. Tap Keep score in Tournament Pack again.", "error", 6000); return; }
    if (SB.game && SB.game.link && SB.game.link.token === req.link.token) { if (SB.view !== "board") SB.enterBoard(); return; }   // already keeping this one
    SB.startFor(req);
  };
  /* called when a linked game is finished; true when it took over what happens next */
  SB.sendFinal = (g, status) => {
    if (status !== "final") return false;   // stopped early: Tournament Pack keeps its own score for this game
    const r = C.linkResult(g, Date.now());
    if (!r || !put(KEY(r.token) + ".result", JSON.stringify(r))) { SB.toast("The final couldn't be handed to Tournament Pack. Type it in there.", "error", 6000); return false; }
    SB.openSheet({
      title: "Final sent to Tournament Pack",
      html: '<p class="msg"><b>' + esc(g.teams[0].n) + " " + r.sa + ", " + esc(g.teams[1].n) + " " + r.sb + "</b> goes into Tournament Pack as soon as you open it. It is also in Recent games here.</p>",
      footer: '<button type="button" class="btn ghost" data-close>Stay here</button><a class="btn" href="../tournamentpack/" data-fk="back-tpack">Back to Tournament Pack</a>'
    });
    return true;
  };
})();
