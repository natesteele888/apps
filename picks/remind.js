/* Gameday Picks pick reminders: the pure part (who gets a reminder, when, and what it says). No DOM, no Firebase.
   Used by the reminder sender (picks/reminders/, an Apps Script on the owner's Google account that runs every hour) and by
   the page, which shows the same timing in words. Loaded in Node (tests) with require().

   The rule, NFL only: a player who turned reminders on and hasn't locked in this week gets one reminder per game day, about
   two hours before the first game that day they still haven't picked. So with nothing picked: Thursday evening before the
   Thursday night game, Sunday morning before the early games, Monday evening before Monday night. Pick everything (or
   lock in) and the reminders stop. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GPRemind = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const LEAD_MIN = 150;           // remind when the first open game of the day is at most this many minutes away
  const SOON_MIN = 5;             // too late to bother: the game starts in under 5 minutes
  const TZ = "America/New_York";  // game days and kickoff times in the reminder are Eastern, like the NFL schedule

  // "2026-11-19" for the Eastern calendar day of a moment
  function etDay(t) {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t));
    const g = k => (p.find(x => x.type === k) || {}).value;
    return g("year") + "-" + g("month") + "-" + g("day");
  }
  // "8:15 PM" Eastern
  function etTime(t) {
    return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(t));
  }
  const isOpen = (g, now) => !!g && (g.state || "pre") === "pre" && new Date(g.date).getTime() > now;

  // This player's open games that aren't picked yet, soonest first: [[gameId, game], ...]
  function unpicked(games, picks, now) {
    const mine = picks || {};
    return Object.entries(games || {}).filter(([id, g]) => isOpen(g, now) && !mine[id])
      .sort((a, b) => new Date(a[1].date) - new Date(b[1].date));
  }

  /* One player's reminder right now, or null.
     p: { uid, on, picks: {gameId: abbr}, locked }   games: { id: { date, state } } (core.js parseGames shape)
     sent: { "<uid>|<day>": true } for reminders already sent.  now: ms. */
  function due(p, games, sent, now) {
    if (!p || !p.on || p.locked) return null;
    const left = unpicked(games, p.picks, now); if (!left.length) return null;
    const today = etDay(now);
    const first = left.find(([, g]) => etDay(g.date) === today); if (!first) return null;
    const mins = (new Date(first[1].date).getTime() - now) / 60000;
    if (mins > LEAD_MIN || mins < SOON_MIN) return null;
    const key = p.uid + "|" + today; if (sent && sent[key]) return null;
    const todayLeft = left.filter(([, g]) => etDay(g.date) === today).length;
    return { uid: p.uid, key, day: today, count: left.length, todayCount: todayLeft, kickoff: first[1].date, ...message(p, left.length, todayLeft, first[1]) };
  }

  function message(p, count, todayCount, g) {
    const who = p.name ? String(p.name).split(" ")[0] + ", you" : "You";
    const games = n => n + " game" + (n === 1 ? "" : "s");
    const vs = g.away && g.home ? ` (${g.away.abbr} at ${g.home.abbr})` : "";
    const title = "🏈 Make your picks";
    const body = `${who} have ${games(count)} not picked yet. ` +
      (todayCount === count ? "" : `${games(todayCount)} today. `) +
      `First kickoff ${etTime(g.date)} ET${vs}.`;
    return { title, body };
  }

  // Everyone's reminders right now. players: [{ uid, name, on, picks, locked }]
  function dueAll(players, games, sent, now) {
    return (players || []).map(p => due(p, games, sent, now)).filter(Boolean);
  }

  // Drop "sent" marks older than 10 days so the store stays small.
  function pruneSent(sent, now) {
    const keep = {}, cut = etDay(now - 10 * 864e5);
    Object.keys(sent || {}).forEach(k => { const d = k.split("|")[1]; if (d && d >= cut) keep[k] = sent[k]; });
    return keep;
  }

  return { LEAD_MIN, SOON_MIN, TZ, etDay, etTime, unpicked, due, dueAll, pruneSent, message };
});
