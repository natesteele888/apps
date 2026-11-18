// The list of app pages the crew tests: the game day apps and Bengals pages by hand, then every other app found on its own.
// serveRoot holds each repo checked out side by side (apps/, asl-bengals/, lybs-ballclub/, ...).
const fs = require('fs'), path = require('path');
const LISTED = [
  ['Fairway', 'apps/fairway/index.html'], ['Dugout / Walk-Up', 'apps/walkup/index.html'], ['Walk-Up field', 'apps/walkup/field.html'],
  ['Walk-Up parent page', 'apps/walkup/send.html'], ['Tournament Pack', 'apps/tournamentpack/index.html'], ['Scoreboard', 'apps/scoreboard/index.html'],
  ['Practice Clock', 'apps/practiceclock/index.html'], ['Play Board', 'apps/playboard/index.html'], ['Film Lite', 'apps/filmlite/index.html'],
  ['Locker', 'apps/locker/index.html'], ['Eight Count', 'apps/eightcount/index.html'], ['Where Do I Go?', 'apps/situations/index.html'],
  ['Bengals coaching app', 'asl-bengals/dev2/index.html'], ['Bengals Play Builder', 'asl-bengals/dev2/playbuilder.html'],
  ['Bengals Stat Keeper', 'asl-bengals/dev2/stat-keeper.html'], ['Bengals Game Wizard', 'asl-bengals/dev2/game-wizard.html'],
];
const NOT_APPS = /^(tests?|archive|old|node_modules|icons?|assets|audio|img|images|css|js|fonts|vendor|tools|docs|_.*|\..*|gradle|watch|dev|dev2-preview|shots)$/i;
function pages(root, { skipRepos = [] } = {}) {
  root = path.resolve(root);
  const seen = new Set(LISTED.map(x => x[1])); const out = LISTED.filter(([, p]) => fs.existsSync(path.join(root, p)));
  const names = {}; try { for (const a of JSON.parse(fs.readFileSync(path.join(root, 'apps/registry.json'), 'utf8')).apps) if (a.path) names['apps/' + a.path.replace(/\/$/, '')] = a.name; } catch (e) {}
  for (const repo of fs.readdirSync(root).sort()) {
    if (skipRepos.includes(repo)) continue;
    const rd = path.join(root, repo); if (!fs.statSync(rd).isDirectory()) continue;
    const cands = [path.join(repo, 'index.html')];
    for (const sub of fs.readdirSync(rd).sort()) { const sd = path.join(rd, sub); if (!NOT_APPS.test(sub) && fs.statSync(sd).isDirectory()) cands.push(path.join(repo, sub, 'index.html')); }
    for (const c of cands) if (!seen.has(c) && fs.existsSync(path.join(root, c))) { seen.add(c); const dir = path.dirname(c); out.push([names[dir] || dir, c]); }
  }
  return out;
}
module.exports = { pages, LISTED };
if (require.main === module) for (const p of pages(process.argv[2] || '.')) console.log(p.join('  |  '));
