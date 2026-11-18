#!/usr/bin/env python3
"""Builds watch/family/src/main/assets/spell/parts.txt: the patterns Sal on the watch uses to split a word into the parts you
say it in (sor-cer-er). They are the American English hyphenation patterns that TeX uses (Liang's method, with Gerard Kuiken's
larger set), from the hyph-utf8 project. Their licence asks that the copyright notice and the licence stay with them, so the
file starts with both.
Format: lines starting with % are notes; a line starting with = is a whole word already split (=as-so-ciate, or =present for no split); every other line
is one pattern, letters with the digits between them (a1b, .ach4).
Run from the repo root:  python3 tools/spell-parts.py"""
import os, re, urllib.request

URL = "https://raw.githubusercontent.com/hyphenation/tex-hyphen/master/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-en-us.tex"
OUT = "watch/family/src/main/assets/spell/parts.txt"

tex = urllib.request.urlopen(URL).read().decode("utf-8")
header = []
for line in tex.splitlines():
    if not line.startswith("%"): break
    if line.startswith("% ====="): break
    header.append(line)
body = re.sub(r"%[^\n]*", "", tex.split("\\patterns{", 1)[1])
patterns, words = body.split("}", 1)
words = words.split("\\hyphenation{", 1)[1].split("}", 1)[0] if "\\hyphenation{" in words else ""
lines = header + ["% Source: " + URL, "% Built by tools/spell-parts.py for Sal on the watch."]
lines += sorted(set(patterns.split()))
lines += ["=" + w for w in sorted(set(words.split()))]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"{OUT}: {len(set(patterns.split()))} patterns, {len(set(words.split()))} words")
