/* Read 20: breaks a word into syllables and the letter-sound chunks inside each one, for the press-and-hold pop-up.
   Rules first, then a small list of corrections for words the rules get wrong (compound words, odd spellings).
   "Tricky" words don't sound out the way they look (said, was, the...), so the pop-up says to learn them by sight. */
(function (root) {
  "use strict";
  const W = {};
  /* Syllables by hand where the rules would be wrong. */
  const SYL = {
    animal: "an-i-mal", away: "a-way", ahead: "a-head", believe: "be-lieve", behind: "be-hind", beside: "be-side", boy: "boy", cocoa: "co-coa",
    couldn: "could-n't", "couldn't": "could-n't", crying: "cry-ing", diamond: "di-a-mond", dickory: "dick-o-ry", diddle: "did-dle", dumpty: "dump-ty", humpty: "hump-ty",
    even: "e-ven", every: "ev-ery", everyone: "eve-ry-one", everywhere: "eve-ry-where", flashlight: "flash-light", gardener: "gar-den-er", gentle: "gen-tle", gently: "gent-ly",
    grandpa: "grand-pa", grasshopper: "grass-hop-per", hickory: "hick-o-ry", merrily: "mer-ri-ly", muffet: "muf-fet", tuffet: "tuf-fet", outside: "out-side", people: "peo-ple",
    puppy: "pup-py", rib: "rib", "rib-bit": "rib-bit", snowman: "snow-man", spider: "spi-der", together: "to-geth-er", tomatoes: "to-ma-toes", tortoise: "tor-toise", windows: "win-dows",
    fastest: "fast-est", frightened: "fright-ened", hunters: "hunt-ers", mary: "ma-ry", mia: "mi-a", across: "a-cross", later: "lat-er", jake: "jake", kate: "kate", mike: "mike", pete: "pete", okay: "o-kay",
    morning: "morn-ing", wonder: "won-der", sleeping: "sleep-ing", tumbling: "tum-bling", twinkle: "twin-kle", little: "lit-tle", fiddle: "fid-dle", water: "wa-ter", over: "o-ver", into: "in-to",
    garden: "gar-den", summer: "sum-mer", winter: "win-ter", story: "sto-ry", ready: "read-y", blanket: "blan-ket", collar: "col-lar", chimp: "chimp", someone: "some-one", lion: "li-on",
    oven: "ov-en", master: "mas-ter", proud: "proud", steady: "stead-y", ropes: "ropes", lives: "lives", hives: "hives", please: "please", thought: "thought",
    sure: "sure", walking: "walk-ing", watched: "watched", worked: "worked", worry: "wor-ry", laughed: "laughed", caught: "caught", heard: "heard", great: "great", door: "door", food: "food",
    friend: "friend", friends: "friends", find: "find", fleece: "fleece", whey: "whey", knew: "knew", knocked: "knocked", pail: "pail", true: "true", truth: "truth", queen: "queen"
  };
  /* Words that don't follow the sounds, so she learns them by sight. */
  const TRICKY = new Set(("a the of to do was said you your are have they what who one put full come some done gone there give lives says couldn't thought caught laughed heard wolf " +
    "world people again any every everyone everywhere great sure door friend friends believe whey was were where here love ahead animal diamond cocoa tortoise people's once could would should walk walking " +
    "i he she me we be my by so no go too two who why how now")
    .split(/\s+/).filter(Boolean));
  ["he", "she", "me", "we", "be", "my", "by", "so", "no", "go", "too", "now", "how", "why", "i"].forEach(w => TRICKY.delete(w)); // these sound out fine

  const vowelCh = (w, i) => {
    const c = w[i];
    if ("aeiou".indexOf(c) >= 0) return !(c === "u" && i > 0 && w[i - 1] === "q");
    if (c === "y") return i > 0;
    if (c === "w") return i > 0 && "aeo".indexOf(w[i - 1]) >= 0 && (i === w.length - 1 || !isVowelLetter(w[i + 1]));
    return false;
  };
  const isVowelLetter = c => "aeiouy".indexOf(c) >= 0;
  const BLENDS = new Set("bl cl fl gl pl sl br cr dr fr gr pr tr sc sk sl sm sn sp st sw tw th sh ch ph wh scr spl spr str thr shr".split(" "));
  const DIGRAPH = new Set("sh ch th ph wh".split(" "));

  /* Is the last e silent, or an -ed / -es ending that doesn't make its own syllable? */
  function silentKind(w) {
    const n = w.length;
    if (n > 3 && w.endsWith("ed") && "td".indexOf(w[n - 3]) < 0 && "aeiou".indexOf(w[n - 3]) < 0 && hasVowel(w.slice(0, -2))) return "ed";
    if (n > 3 && w.endsWith("es") && "sxzcg".indexOf(w[n - 3]) < 0 && "aeiou".indexOf(w[n - 3]) < 0 && !/(ch|sh)es$/.test(w) && hasVowel(w.slice(0, -2))) return "es";
    if (n > 2 && w.endsWith("e") && "aeiou".indexOf(w[n - 2]) < 0 && hasVowel(w.slice(0, -1))) { if (!(w[n - 2] === "l" && n > 3 && "aeiouy".indexOf(w[n - 3]) < 0)) return "e"; }
    return null;
  }
  const hasVowel = s => { for (let i = 0; i < s.length; i++) if (vowelCh(s, i)) return true; return false; };

  function ruleSyllables(w) {
    const kind = silentKind(w), n = w.length;
    const end = kind === "ed" || kind === "es" ? n - 2 : kind === "e" ? n - 1 : n; // letters that can hold a vowel sound
    const nuc = []; // [start, end) runs of vowel letters
    for (let i = 0; i < n; i++) {
      const isV = i < end ? vowelCh(w, i) : false;
      const lastE = i === n - 1 && w[i] === "e" && !kind && n > 2 && w[n - 2] === "l"; // consonant+le is a syllable
      if (isV || lastE) { if (nuc.length && nuc[nuc.length - 1][1] === i) nuc[nuc.length - 1][1] = i + 1; else nuc.push([i, i + 1]); }
    }
    if (nuc.length <= 1) return [w];
    const cuts = [];
    for (let k = 0; k < nuc.length - 1; k++) {
      const a = nuc[k][1], b = nuc[k + 1][0], mid = w.slice(a, b), m = mid.length;
      let cut;
      if (m === 0) cut = a;
      else if (m === 1) cut = a; // V|CV
      else if (m === 2) cut = DIGRAPH.has(mid) ? a : mid === "ck" || mid === "ng" ? b : a + 1;
      else cut = BLENDS.has(mid.slice(1)) ? a + 1 : a + 2;
      cuts.push(cut);
    }
    const last = cuts.length - 1, lastNuc = nuc[nuc.length - 1];
    const tail = w.slice(lastNuc[0]);
    if (/^ing$/.test(tail) && nuc.length >= 2) { const stem = w.slice(0, lastNuc[0]); cuts[last] = /([^aeiou])\1$/.test(stem) ? lastNuc[0] - 1 : lastNuc[0]; }
    if (/^(ed|es|er|est)$/.test(tail) && nuc.length >= 2 && !kind && !/^(er)$/.test(tail)) cuts[last] = lastNuc[0];
    const out = []; let from = 0;
    cuts.forEach(c => { out.push(w.slice(from, c)); from = c; }); out.push(w.slice(from));
    return out.filter(Boolean);
  }

  /* Letter-sound chunks inside one syllable, longest match first. */
  const G4 = ["eigh"], G3 = ["tch", "dge", "igh", "air", "ear"], G2 = "sh ch th wh ck ng nk ph kn wr qu ai ay ee ea oa ow oo ou oi oy au aw ew ie ue ui ey oe ar er ir or ur ll ss ff zz".split(" ");
  function chunks(s) {
    s = s.replace(/'/g, ""); const out = []; let i = 0;
    while (i < s.length) {
      let g = null;
      for (const L of [G4, G3, G2]) { for (const x of L) if (s.startsWith(x, i)) { g = x; break; } if (g) break; }
      if (!g && i + 1 < s.length && s[i] === s[i + 1] && "aeiou".indexOf(s[i]) < 0) g = s[i] + s[i + 1];
      if ((g === "ar" || g === "er" || g === "ir" || g === "or" || g === "ur") && false) g = null;
      if (!g) g = s[i];
      out.push({ t: g }); i += g.length;
    }
    return out;
  }

  /* More hand-checked syllable splits (the older-reader words, made by tools/read20-syllables.py). Hand splits above win. */
  W.add = map => { for (const k of Object.keys(map)) if (!SYL[k]) SYL[k] = map[k]; };
  W.clean = word => String(word || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’]/g, "'").replace(/^[^a-z]+|[^a-z']+$/g, "").replace(/\.(?=[a-z])/g, "").replace(/'s$/, "");
  W.analyze = raw => {
    const w = W.clean(raw); if (!w || !/^[a-z'-]+$/.test(w)) return null;
    const parts = (SYL[w] || (/-/.test(w) ? w : null) || ruleSyllables(w.replace(/'/g, "")).join("-")).split("-").filter(Boolean);
    const tricky = TRICKY.has(w) || TRICKY.has(raw.toLowerCase());
    const kind = silentKind(w.replace(/'/g, ""));
    const syl = parts.map((p, idx) => {
      const base = p.toLowerCase(); let ch;
      const lastPart = idx === parts.length - 1;
      if (lastPart && kind === "ed" && base.endsWith("ed")) ch = chunks(base.slice(0, -2)).concat([{ t: "ed" }]);
      else if (lastPart && kind === "es" && base.endsWith("es")) ch = chunks(base.slice(0, -2)).concat([{ t: "e", silent: true }, { t: "s" }]);
      else if (lastPart && !kind && /[^aeiouy]le$/.test(base)) ch = chunks(base.slice(0, -2)).concat([{ t: "le" }]); // little: lit·tle
      else if (lastPart && kind === "e" && base.endsWith("e") && base.length > 1) ch = chunks(base.slice(0, -1)).concat([{ t: "e", silent: true }]);
      else ch = chunks(base);
      return { text: p.replace(/'/g, "'"), sounds: ch };
    });
    return { word: w, syllables: syl, tricky, text: syl.map(s => s.text).join("·") };
  };
  root.R20Words = W;
  if (typeof module !== "undefined" && module.exports) module.exports = W;
})(typeof window !== "undefined" ? window : globalThis);
