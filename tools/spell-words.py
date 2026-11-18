#!/usr/bin/env python3
"""Builds watch/family/src/main/assets/spell/words.txt: the word list Spelling Genie on the watch checks words against and picks
"did you mean" choices from. The words come from SCOWL (Kevin Atkinson's Spell Checker Oriented Word Lists, the lists behind
aspell/hunspell), through the wordlist-english npm package: everyday English plus American spellings, sizes 10 to 60.
Each "#NN" line starts a size: the smaller the number, the more common the word (SCOWL's own grouping).
Run from the repo root:  python3 tools/spell-words.py   (needs npm, which fetches the package)"""
import json, os, subprocess, tarfile, tempfile

SIZES = [10, 20, 35, 40, 50, 55, 60]
# SCOWL's lists here leave out names and contractions, which kids ask for too. These go in as size 20.
EXTRA = """Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September
October November December Halloween Thanksgiving Christmas Hanukkah Easter Valentine's
Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa
Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada
Hampshire Jersey Mexico York Carolina Dakota Ohio Oklahoma Oregon Pennsylvania Rhode Island Tennessee Texas Utah Vermont
Virginia Washington Wisconsin Wyoming Boston America American Canada Africa Asia Europe Australia Antarctica Atlantic
Pacific England Spain France Germany Italy Japan China India Ireland Scotland Brazil Egypt Mercury Venus Earth Mars Jupiter
Saturn Uranus Neptune Pluto English Spanish French
I'm I've I'll I'd you're you've you'll you'd he's he'll he'd she's she'll she'd it's it'll we're we've we'll we'd they're
they've they'll they'd that's there's here's what's who's where's when's how's let's isn't aren't wasn't weren't don't doesn't
didn't can't couldn't won't wouldn't shouldn't haven't hasn't hadn't mustn't o'clock"""
OUT = "watch/family/src/main/assets/spell"

with tempfile.TemporaryDirectory() as d:
    subprocess.run(["npm", "pack", "wordlist-english@1.2.1", "--silent"], cwd=d, check=True, stdout=subprocess.DEVNULL)
    with tarfile.open(os.path.join(d, "wordlist-english-1.2.1.tgz")) as t:
        t.extractall(d, filter="data")
    pkg = os.path.join(d, "package")
    seen, lines = set(), []
    for n in SIZES:
        words = json.load(open(os.path.join(pkg, f"english-words-{n}.json"))) + json.load(open(os.path.join(pkg, f"american-words-{n}.json")))
        lines.append(f"#{n}")
        for w in sorted(set(words), key=lambda x: (x.lower(), x)):
            if w in seen or not w.strip(): continue
            seen.add(w)
            lines.append(w)
    lines.append("#20")
    for w in EXTRA.split():
        if w not in seen: seen.add(w); lines.append(w)
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "words.txt"), "w").write("\n".join(lines) + "\n")
    open(os.path.join(OUT, "COPYRIGHT.txt"), "w").write(open(os.path.join(pkg, "Copyright")).read())
    print(len(seen), "words")
