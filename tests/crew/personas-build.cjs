// Builds personas.json: about 100 made-up people who use Nathan's apps, by skill, style and usage.
// Edit the lists below and run `node tests/crew/personas-build.cjs` to rebuild. Every persona is made up:
// labels describe a kind of person, never a real one, and no names, emails or phones are used.
const fs = require('fs'), path = require('path');

// Which apps each kind of person would open (matched against the page names in pages.cjs).
const AUDIENCE = {
  parent: ['Walk-Up parent page', 'LYBS Ballclub', 'Scoreboard', 'Where Do I Go?', 'Read 20', 'Get Ready', 'Steele Cards pack'],
  grand: ['Scoreboard', 'Walk-Up parent page', 'LYBS Ballclub', 'Steele Cards pack'],
  coachBase: ['Dugout / Walk-Up', 'Walk-Up field', 'Scoreboard', 'Practice Clock', 'Play Board', 'Film Lite', 'Where Do I Go?', 'Tournament Pack', 'Locker', "Who's Where", 'Coaching Tools'],
  coachFoot: ['Bengals coaching app', 'Bengals Play Builder', 'Bengals Stat Keeper', 'Bengals Game Wizard', 'Gridiron Hub', 'Play Board', 'Film Lite', 'Practice Clock', 'Scoreboard'],
  kid: ['Where Do I Go?', 'Cube Clock', 'Read 20', 'Gameday Picks', 'Steele Cards pack', 'Get Ready'],
  teen: ['Offseason Power Program', 'Cube Clock', 'Gameday Picks', 'Where Do I Go?'],
  volunteer: ['Scoreboard', 'Snack Shack Screen', 'Walk-Up field', 'LYBS Ballclub'],
  board: ['LYBS Ballclub', 'Meeting Secretary', 'Sponsor Banners', 'Steele App Store'],
  admin: ['LYBS Ballclub', 'Sponsor Banners', 'Meeting Secretary', 'Tournament Pack', 'Steele Events', 'Steele App Store'],
  golfer: ['Fairway'], golfAdmin: ['Fairway', 'Steele Events'],
  counts: ['Eight Count', 'Practice Clock', 'Scoreboard'],
  party: ['Tournament Pack', 'Steele Events', 'Scoreboard'], guest: ['Steele Events'],
  fisher: ['Catch Log', 'Fishing log'], sponsor: ['Sponsor Banners', 'LYBS Ballclub', 'Steele Events'],
  owner: ["Nate's Toolbox", 'Steele App Store', 'Steele Usage', 'Bills', 'Photo Blueprint', 'Christmas Planner', 'Portfolio', 'Steele apps home', 'Meeting Secretary', 'Offseason Power Program'],
  visitor: ['Scoreboard', 'Where Do I Go?', 'Tournament Pack', 'Walk-Up field'],
  cards: ['Steele Cards pack', 'Steele Cards kit', 'Where Do I Go?'],
};

// How each kind of person uses a phone. The runner turns each style into a different way of tapping.
const STYLES = {
  reader: 'reads every word before tapping', tapper: 'taps everything to see what happens', speedrun: 'goes straight for the main thing, fast, often double-taps',
  fatfinger: 'misses and hits the button next to the one meant', onehand: 'one hand, phone in the other, at the field', bigtext: 'phone set to big text, zooms in',
  screenreader: 'uses the phone read-aloud (screen reader)', offline: 'no signal at the field', slow3g: 'one bar of signal', impatient: 'reloads or leaves halfway, comes back later',
  typer: 'fills in every box', returner: 'comes back the next day expecting their stuff to still be there',
};
const DEVICES = {
  android: { label: 'newer Android', width: 360, ua: 'Mozilla/5.0 (Linux; Android 14; SM-S911U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' },
  oldandroid: { label: 'old Android, Chrome 80', width: 320, ua: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-J737V) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0 Mobile Safari/537.36', oldTier: 'B' },
  oldiphone: { label: 'iPhone 7 on iOS 15', width: 375, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1', oldTier: 'A' },
  iphone: { label: 'newer iPhone', width: 390, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' },
  tablet: { label: 'tablet', width: 800, ua: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
  laptop: { label: 'laptop', width: 1280, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' },
};
// [kind of person, skill, usage, audience, the variants: [style, device]...]
// skill: first (first time with it), casual, seasoned, kid, grand, tech
// usage: oneoff, gameday (heavy use on game day), weekly, admin (sets things up for others), spectator
const ARCH = [
  ['First-time T-ball parent', 'first', 'oneoff', 'parent', [['reader', 'android'], ['tapper', 'iphone'], ['slow3g', 'oldandroid'], ['impatient', 'android']]],
  ['Travel-ball parent at every game', 'casual', 'gameday', 'parent', [['onehand', 'iphone'], ['offline', 'android'], ['speedrun', 'iphone'], ['returner', 'oldiphone']]],
  ['Grandparent who follows every game', 'grand', 'spectator', 'grand', [['bigtext', 'oldandroid'], ['fatfinger', 'oldiphone'], ['reader', 'tablet'], ['screenreader', 'iphone']]],
  ['Brand-new volunteer coach (8U)', 'first', 'gameday', 'coachBase', [['reader', 'android'], ['tapper', 'android'], ['impatient', 'oldandroid'], ['typer', 'iphone']]],
  ['Seasoned head coach (12U select)', 'seasoned', 'gameday', 'coachBase', [['speedrun', 'android'], ['onehand', 'android'], ['offline', 'iphone'], ['returner', 'android']]],
  ['Assistant coach running practice stations', 'casual', 'weekly', 'coachBase', [['onehand', 'oldandroid'], ['fatfinger', 'android'], ['slow3g', 'iphone'], ['tapper', 'tablet']]],
  ['Football head coach (11U)', 'seasoned', 'gameday', 'coachFoot', [['speedrun', 'android'], ['typer', 'laptop'], ['offline', 'android'], ['returner', 'tablet']]],
  ['Football assistant keeping stats', 'casual', 'gameday', 'coachFoot', [['onehand', 'iphone'], ['fatfinger', 'oldiphone'], ['tapper', 'android'], ['impatient', 'android']]],
  ['Kid player, age 9', 'kid', 'weekly', 'kid', [['tapper', 'tablet'], ['speedrun', 'oldandroid'], ['fatfinger', 'android'], ['impatient', 'iphone']]],
  ['Kid player, age 12', 'kid', 'weekly', 'kid', [['speedrun', 'android'], ['tapper', 'iphone'], ['returner', 'oldiphone'], ['typer', 'android']]],
  ['Teen athlete doing offseason training', 'tech', 'weekly', 'teen', [['speedrun', 'iphone'], ['returner', 'android'], ['offline', 'android'], ['tapper', 'iphone']]],
  ['Dugout parent keeping score', 'casual', 'gameday', 'volunteer', [['onehand', 'android'], ['fatfinger', 'oldandroid'], ['offline', 'iphone'], ['reader', 'android']]],
  ['Snack shack volunteer', 'first', 'gameday', 'volunteer', [['reader', 'tablet'], ['tapper', 'android'], ['slow3g', 'oldandroid'], ['bigtext', 'iphone']]],
  ['League board member', 'casual', 'weekly', 'board', [['reader', 'laptop'], ['typer', 'iphone'], ['bigtext', 'oldiphone'], ['returner', 'android']]],
  ['League director setting things up', 'tech', 'admin', 'admin', [['typer', 'laptop'], ['tapper', 'laptop'], ['returner', 'iphone'], ['impatient', 'android']]],
  ['Weekend golfer in a tournament', 'casual', 'gameday', 'golfer', [['onehand', 'iphone'], ['offline', 'android'], ['fatfinger', 'oldandroid'], ['speedrun', 'iphone']]],
  ['Golf outing organizer', 'tech', 'admin', 'golfAdmin', [['typer', 'laptop'], ['reader', 'iphone'], ['tapper', 'tablet'], ['slow3g', 'android']]],
  ['Cheer or dance coach counting eights', 'casual', 'weekly', 'counts', [['onehand', 'android'], ['tapper', 'iphone'], ['bigtext', 'tablet'], ['offline', 'oldandroid']]],
  ['Birthday party host running 2-on-2s', 'first', 'oneoff', 'party', [['reader', 'iphone'], ['tapper', 'android'], ['typer', 'laptop'], ['impatient', 'iphone']]],
  ['Party guest RSVPing', 'first', 'oneoff', 'guest', [['speedrun', 'iphone'], ['slow3g', 'oldandroid'], ['bigtext', 'oldiphone'], ['screenreader', 'android']]],
  ['Fishing buddy logging catches', 'casual', 'weekly', 'fisher', [['onehand', 'android'], ['offline', 'android'], ['typer', 'iphone'], ['returner', 'oldandroid']]],
  ['Local sponsor business owner', 'first', 'oneoff', 'sponsor', [['reader', 'laptop'], ['bigtext', 'iphone'], ['slow3g', 'android'], ['tapper', 'tablet']]],
  ['Power user who built it all (owner)', 'tech', 'admin', 'owner', [['tapper', 'android'], ['typer', 'laptop'], ['returner', 'android'], ['speedrun', 'iphone']]],
  ['Visiting team coach, one game', 'seasoned', 'oneoff', 'visitor', [['speedrun', 'iphone'], ['slow3g', 'android'], ['offline', 'oldandroid'], ['reader', 'android']]],
  ['Card-collecting family', 'casual', 'spectator', 'cards', [['tapper', 'tablet'], ['impatient', 'iphone'], ['bigtext', 'oldandroid'], ['screenreader', 'iphone']]],
];

const personas = [];
for (const [kind, skill, usage, aud, variants] of ARCH) for (const [style, dev] of variants) {
  const n = personas.length + 1; const d = DEVICES[dev];
  personas.push({ id: 'p' + String(n).padStart(3, '0'), label: `${kind}, ${STYLES[style].split(",")[0]}, on ${/^[aeiou]/i.test(d.label) ? "an" : "a"} ${d.label}`, kind, skill, usage, style, styleNote: STYLES[style],
    device: dev, width: d.width, userAgent: d.ua, oldTier: d.oldTier || null, offline: style === 'offline', slow: style === 'slow3g', apps: AUDIENCE[aud] });
}
const out = { note: 'Made-up personas for the Nate crew virtual testers. Built by personas-build.cjs; edit that file, not this one.', count: personas.length, styles: STYLES, devices: Object.fromEntries(Object.entries(DEVICES).map(([k, v]) => [k, v.label])), personas };
fs.writeFileSync(path.join(__dirname, 'personas.json'), JSON.stringify(out, null, 1) + '\n');
console.log('personas:', personas.length);
