// Old-phone check: which app code would not run on older phones.
// Tier B = iPhone 6 (iOS 12) / Chrome 70: ES2019 syntax. Tier A = iPhone 7 (iOS 15.0) / Chrome 90: ES2021 syntax.
const acorn = require(process.env.ACORN || 'acorn');
const fs = require('fs'), path = require('path');
const apps = process.argv.slice(3); const root = process.argv[2];
const API = [
  [/\.at\((-?\d|[a-z])/, '.at()', 'A'], [/structuredClone\(/, 'structuredClone', 'A'], [/\.replaceAll\(/, 'replaceAll', 'B'],
  [/Object\.hasOwn\(/, 'Object.hasOwn', 'A'], [/\.findLast(Index)?\(/, 'findLast', 'A'], [/Promise\.any\(/, 'Promise.any', 'B'],
  [/AbortSignal\.timeout/, 'AbortSignal.timeout', 'A'], [/\.toSorted\(|\.toReversed\(|\.toSpliced\(/, 'toSorted/toReversed', 'A'],
  [/crypto\.randomUUID/, 'crypto.randomUUID', 'A'], [/\bArray\.prototype\.group|Object\.groupBy|Map\.groupBy/, 'groupBy', 'A'],
];
const CSS = [[/:has\(/, ':has()', 'A'], [/\d+cq(w|h|i|b|min|max)\b/, 'container units cqw/cqh (need an @supports guard)', 'A'], [/\b\d+(\.\d+)?[sld]vh\b/, 'svh/dvh/lvh units', 'A'], [/@container/, '@container', 'A'],
  [/\binset\s*:/, 'inset:', 'B'], [/aspect-ratio\s*:/, 'aspect-ratio', 'B'], [/color-mix\(/, 'color-mix()', 'A'], [/:is\(|:where\(/, ':is()/:where()', 'B'],
  [/\b(oklch|oklab)\(/, 'oklch()', 'A'], [/text-wrap\s*:\s*balance/, 'text-wrap:balance (harmless)', '-']];
function scripts(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.js')) return [{ code: src, mod: /^\s*(import|export)\s/m.test(src), off: 0 }];
  const out = []; const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(src))) { if (/src=/.test(m[1]) || /type=["'](application\/ld\+json|text\/template|importmap)/.test(m[1])) continue; out.push({ code: m[2], mod: /type=["']module/.test(m[1]), off: src.slice(0, m.index).split('\n').length - 1 }); }
  return out;
}
function firstBad(code, ver, mod) { try { acorn.parse(code, { ecmaVersion: ver, sourceType: mod ? 'module' : 'script', allowHashBang: true, allowAwaitOutsideFunction: false }); return null; } catch (e) { return e; } }
const res = {};
for (const app of apps) {
  const dir = path.join(root, app); const r = res[app] = { B: [], A: [], css: [] };
  const files = []; (function walk(d, depth) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) { if (depth < 2 && !/node_modules|icons|audio|orgs|gradle|vendor/.test(f)) walk(p, depth + 1); } else if (/\.(js|html|css)$/.test(f) && !/\.min\./.test(f)) files.push(p); } })(dir, 0);
  for (const f of files) {
    const rel = path.relative(root, f); const src = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.css') || f.endsWith('.html')) { const css = f.endsWith('.css') ? src : (src.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n'); for (const [re, name, t] of CSS) if (re.test(css)) r.css.push(`${rel}: ${name} (tier ${t})`); }
    if (f.endsWith('.css')) continue;
    for (const s of scripts(f)) {
      for (const [ver, tier] of [[2019, 'B'], [2021, 'A']]) { const e = firstBad(s.code, ver, s.mod); if (e) { const line = (e.loc ? e.loc.line : 0) + s.off; const txt = (fs.readFileSync(f, 'utf8').split('\n')[line - 1] || '').trim().slice(0, 90); r[tier].push(`${rel}:${line} syntax: ${txt}`); } }
      for (const [re, name, t] of API) { const m = s.code.match(re); if (m && t !== '-') r[t === 'A' ? 'A' : 'B'].push(`${rel}: uses ${name}`); }
    }
  }
}
console.log(JSON.stringify(res, null, 1));
