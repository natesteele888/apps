/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Jack, the caddie. A few words on each hole (how far, what to hit, what to watch for) and a reaction to every score
   entered on this phone. Jack is written here, line by line: no AI service, no account, nothing leaves the phone, so he
   works with no signal and on old phones.
   How salty he talks follows Jack's settings (jack.js and core.js cleanJack): Clean, A little, A lot and Super crude,
   with the kid lock and the adult check there. The app also keeps him clean for every phone in a family event (the
   organizer's switch). He roasts shots, never people's looks, and nothing he says is sexual.
   lineFor() is plain (no page needed), so the tests can check that no clean line ever swears. */
(function (root, make) {
  const M = make();
  if (typeof module === "object" && module.exports) module.exports = M; else root.FairwayJack = M;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const LEVELS = [
    { id: 0, name: "Clean", sub: "Not one bad word. Always on for kids." },
    { id: 1, name: "A little", sub: "The odd hell and crap." },
    { id: 2, name: "A lot", sub: "Swears like a regular in the cart barn." },
    { id: 3, name: "Super crude", sub: "Nonstop. Roasts every bad swing. Grown-ups only." }
  ];
  const SWEARS = /\b(fuck\w*|shit\w*|damn\w*|hell|ass|asses|crap\w*|bitch\w*|piss\w*|bastard\w*|goddamn\w*|dick\w*|bullshit)\b/i;

  // Each kind of moment has lines for each level. {p} par, {y} the yardage, {club} a club for that distance, {n} first name,
  // {h} hole, {tp} score to par for the round, {pos} place on the board, {hcp} the hole's difficulty rank.
  const L = {
    tee3: [
      ["{y} to the middle. {club}, smooth tempo, and let the green do the rest.", "Par 3, {y}. Pick a spot on the green and swing like nobody's watching.", "{club} and a committed swing. Short is worse than long here."],
      ["{y}, par 3. {club}. Don't get cute with it.", "Hell of a little hole. {club}, center of the green, walk off with a 3.", "{club}. Aim fat side and quit worrying about the pin, for crying out loud."],
      ["{y}. {club}. Hit the damn green and shut up about it.", "Par 3, {y}. {club}, and swing like you mean it, not like you're scared of the shit in front.", "This is where people make a fucking mess. {club}, middle of the green, done."],
      ["{y}. {club}. If you chunk this I'm telling everybody in the group chat, you shank-happy fuck.", "Par 3, {y}. It's one swing, sunshine. {club}. Don't shit the bed.", "{club}. Pin's tucked like it's hiding from your swing. Smart. Aim middle, you beautiful disaster."]
    ],
    tee4: [
      ["Par 4, {y}. Fairway first; the hole opens up from the short grass.", "{y} on the card. Driver if it's open, a fairway wood if it's tight. Your call.", "Par 4. Find the fairway and you've done the hard part."],
      ["Par 4, {y}. Fairway. That's the whole plan, hotshot.", "{y}. Hit it straight and we'll talk about the green later.", "Par 4. Crap off the tee here costs you two, so find the short grass."],
      ["Par 4, {y}. Just hit the fucking fairway and we're golden.", "{y}. Driver, and keep it out of the shit on either side.", "Par 4. Swing easy. Swinging hard never once fixed a damn slice."],
      ["Par 4, {y}. Fairway's right there. Even you can't miss it. Prove me wrong, I fucking dare you.", "{y} of opportunity for you to embarrass yourself. Driver. Go.", "Par 4. Grip it, rip it, and if it goes in the trees, that's your shit to go find, not mine."]
    ],
    tee5: [
      ["Par 5, {y}. Three good shots and you're putting for birdie.", "{y}, par 5. Keep the first two in play and let the wedge do the work.", "Long one. No hero shot needed: fairway, fairway, green."],
      ["Par 5, {y}. Birdie chance, so don't screw it up off the tee.", "{y}. Big drive, then lay up like a grown-up.", "Par 5. Nobody ever won going for a green they couldn't reach. Hell, nobody."],
      ["Par 5, {y}. Birdie hole. Don't you fuck this up.", "{y}. Rip it, then lay up to your favorite wedge, not some shit 60-yard pitch.", "Par 5. If you go for it in two from 260, I'm quitting on the spot, damn it."],
      ["Par 5, {y}. Even a hack like you can birdie this. Allegedly. Swing, you magnificent shithead.", "{y}. Three shots. Count 'em. Don't make it six, you hopeless fuck.", "Par 5. Big dog off the tee. If you top it I'm walking to the clubhouse and getting drunk without you."]
    ],
    hard: [
      ["This is one of the toughest holes out here. Bogey is fine.", "Hardest hole on the card. Play for the middle and take your medicine.", "Tough hole. A smart bogey beats a hero double."],
      ["Toughest hole out here. Bogey's no crime, so don't go nuts.", "This hole eats people. Play it like a coward and you'll be fine.", "Hard hole. Middle of everything, and no hero crap."],
      ["This hole's a bitch. Bogey and get the hell out.", "Toughest one on the card. Respect it or it'll fuck you up.", "Hard as shit. Middle of the green, two putts, and run."],
      ["This hole has ruined better swings than yours, and yours is fucking awful. Bogey and flee.", "Toughest hole on the card. It's gonna kick your ass. Just don't let it kick it twice.", "This hole is a goddamn crime scene. Play safe or become the next victim."]
    ],
    easy: [
      ["One of the easier holes out here. A good chance to pick one up.", "Scoring hole. Be aggressive with the approach.", "Easy on paper. Go get a birdie."],
      ["Easy hole. If you can't par this one, hell, I don't know.", "Scoring chance. Go flag hunting.", "Easier hole. Don't overthink the crap out of it."],
      ["Easiest hole on the card. Birdie or I'm pissed.", "This hole's a gift. Don't fuck it up.", "Scoring hole. Go at the flag, damn it."],
      ["Easiest hole out here. Bogey this and you owe everybody a beer, you sorry fuck.", "This hole is so easy a toddler with a pool noodle could birdie it. Let's go.", "Gift hole. Unwrap it, don't shit all over it."]
    ],
    eagle: [
      ["Eagle! That's one to tell people about, {n}.", "Eagle, {n}! Take a picture of the scorecard.", "Two under on one hole. Brilliant."],
      ["Holy hell, an eagle! {n}, that's ridiculous.", "Eagle, {n}! Who are you and what did you do with my player?", "Eagle! I'll be damned. Beautiful."],
      ["Eagle?! {n}, holy shit. Holy fucking shit.", "Eagle! Who the hell taught you to play golf?", "That's a goddamn eagle, {n}. Drinks are on you."],
      ["EAGLE. {n}, you lucky, lucky son of a gun. Holy fucking shit, I need to sit down.", "Eagle?! Somebody check {n}'s bag, there's no fucking way.", "An eagle. From YOU. Hell has frozen over and it's fucking beautiful."]
    ],
    birdie: [
      ["Birdie, {n}! Well played.", "Birdie. That's how it's done.", "Nice birdie, {n}. One under on the hole."],
      ["Birdie! Hell of a hole, {n}.", "Birdie, {n}. Look at you go.", "Birdie! Not bad for a weekend hack."],
      ["Birdie, {n}! Fuck yes, that's what I'm talking about. Fucking stud.", "Birdie! Somebody tell the group chat {n}'s on fire.", "That's a damn birdie. Keep that shit coming."],
      ["Birdie! {n}, you beautiful fuck, where has THAT been all day?", "Birdie. Even a blind squirrel, huh, {n}? Fucking gorgeous though.", "Birdie, {n}! Don't get cocky, you're still a fucking hacker."]
    ],
    par: [
      ["Par. Solid, {n}.", "Par. Nothing wrong with that.", "Par, {n}. Steady golf."],
      ["Par. Boring as hell and exactly what we needed.", "Par, {n}. Fine. Fine is good.", "Par. Not pretty, but it counts the same."],
      ["Par. Fucking textbook, {n}.", "Par. Boring as shit and I love it.", "Par, {n}. Take it and get the hell to the next tee."],
      ["Par, {n}. Look at you, being fucking adequate.", "Par. Ugly as sin, but it counts, you lucky shit.", "Par. Don't celebrate, you were supposed to make that, dumbass."]
    ],
    bogey: [
      ["Bogey. Shake it off, {n}; next hole.", "Bogey. Everybody makes them.", "One over on that one. Plenty of golf left."],
      ["Bogey. Crap happens, {n}. Next hole.", "Bogey. Not the end of the world, hotshot.", "Bogey. Let it go, the next tee's right there."],
      ["Bogey. Shit happens, {n}. Next hole.", "Bogey. Fuck it, we move.", "Bogey. Damn shame. Let's get it back."],
      ["Bogey, {n}. Shocking. Absolutely nobody is fucking surprised.", "Bogey. That was a shit show with a happy ending, at least.", "Bogey. You swing like you're killing snakes, but sure, bogey's fine, you hack."]
    ],
    double: [
      ["Double bogey. Breathe, {n}; one hole doesn't make a round.", "Double. It happens. Fresh start on the next tee.", "Two over. Forget it and go."],
      ["Double. Well, that hole kicked your butt. Next.", "Double, {n}. Hell of a time to have a bad hole, but here we are.", "Double bogey. Let's pretend that never happened."],
      ["Double. That hole fucked you, {n}. Next.", "Double bogey. Well, shit. Shake it off.", "Double. Damn it. Get the hell to the next tee and fix it."],
      ["Double bogey. {n}, what in the actual fuck was that?", "Double. I've seen better golf from a drunk raccoon, {n}.", "Double. Throw the club, not the round. Actually, throw the fucking club too, it deserves it."]
    ],
    worse: [
      ["Tough hole, {n}. Pick it up next time and keep the pace moving.", "That one got away. Deep breath; next hole.", "Big number. It happens to everybody."],
      ["Well, that was a disaster. Next hole, {n}, quick, before anybody saw.", "Rough one. Hell, we've all been there.", "Big number. Let's never speak of it."],
      ["What a shit show, {n}. Next hole.", "That hole was a fucking massacre. Moving on.", "Big damn number. Forget it, we've got holes left."],
      ["{n}, that was the worst fucking thing I've ever seen, and I once caddied for a guy who teed off backwards.", "Holy shit, {n}. Report that hole to the authorities.", "That was a crime against golf, {n}. Pick it up next time, you're holding up the whole fucking course."]
    ],
    hot: [
      ["{n} is {tp} on the day. Keep doing what you're doing.", "{tp} through {h}. Don't change a thing."],
      ["{tp}! You're on a heater, {n}. Don't think about it.", "{tp} and rolling. Hell of a round."],
      ["{tp}, {n}. You're on fucking fire.", "{tp}. Don't think, just keep doing that shit."],
      ["{tp}?! {n}, who the fuck are you right now?", "{tp}. Somebody check this asshole for a battery pack."]
    ],
    lead: [
      ["You're leading the tournament, {n}. Play your own game.", "On top of the board. One shot at a time."],
      ["You're leading, {n}. Don't look at the board, hotshot.", "Top of the board. Look at that. Stay boring."],
      ["You're leading this fucking thing, {n}.", "First place. Don't screw it up now, damn it."],
      ["You're LEADING, {n}. The field must be fucking terrible.", "First place. Enjoy it, it's gonna last about two holes, you lucky shit."]
    ]
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function club(yards) {
    if (!yards) return "The club you trust";
    return yards <= 95 ? "A wedge" : yards <= 125 ? "A 9-iron" : yards <= 140 ? "An 8-iron" : yards <= 155 ? "A 7-iron" : yards <= 170 ? "A 6-iron" : yards <= 185 ? "A 5-iron" : yards <= 205 ? "A hybrid" : "A fairway wood";
  }
  const fmtTp = n => (n === 0 ? "even" : n < 0 ? n + "" : "+" + n);
  function fill(t, x) {
    const first = String(x.n || "").trim().split(/\s+/)[0] || "partner";
    return t.replace(/\{p\}/g, x.p || "").replace(/\{y\}/g, x.y ? x.y + " yards" : "no yardage on the card").replace(/\{club\}/g, club(x.y))
      .replace(/\{n\}/g, first).replace(/\{h\}/g, x.h || "").replace(/\{tp\}/g, fmtTp(x.tp || 0)).replace(/\{pos\}/g, x.pos || "")
      .replace(/(^|[.!?] )([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }
  // The kind of moment, then the line. x: { kind: "tee" | "score", par, y (yards), hcp, n (name), diff (strokes - par),
  // tp (round to par), thru, h (hole), lead (true when first on the board) }, lv the level, rnd a random number 0..1.
  function kindOf(x) {
    if (x.kind === "score") {
      const d = x.diff;
      if (x.lead && d <= 0 && x.thru >= 4 && x.roll < 0.35) return "lead";
      if (x.tp <= -2 && d < 0 && x.roll < 0.4) return "hot";
      return d <= -2 ? "eagle" : d === -1 ? "birdie" : d === 0 ? "par" : d === 1 ? "bogey" : d === 2 ? "double" : "worse";
    }
    if (x.hcp && x.hcp <= 2 && x.par >= 4) return "hard";
    if (x.hcp && x.hcp >= 17) return "easy";
    return x.par === 3 ? "tee3" : x.par >= 5 ? "tee5" : "tee4";
  }
  function lineFor(x, lv, rnd) {
    const k = kindOf(Object.assign({ roll: rnd == null ? Math.random() : rnd }, x)), all = L[k][clamp(lv | 0, 0, 3)];
    const set = x.y ? all : all.filter(t => t.indexOf("{y}") < 0).concat(all.every(t => t.indexOf("{y}") >= 0) ? all : []);
    const r = rnd == null ? Math.random() : rnd;
    return { kind: k, text: fill(set[Math.floor(r * set.length) % set.length], x) };
  }
  return { LEVELS, LINES: L, SWEARS, lineFor, kindOf, club, fill };
});
