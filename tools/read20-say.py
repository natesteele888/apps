#!/usr/bin/env python3
"""Builds read20/say-data.js: what the phone's voice should be handed for each syllable of each word in the stories, so a part sounds like it
does INSIDE the word (gym-nast says "gym" "nist", not "nast"; plen-ty says "plen" "tee"). It lines the syllable split up with the
pronunciation dictionary (cmudict) and respells unstressed vowels (schwa and short i) and long vowels at the end of open syllables.
Words it cannot line up are left to the rules in read20/words.js (spoken()).   Run from the repo root with pyphen and cmudict installed:
  PYTHONPATH=/tmp/claude-0/pk/lib python3 tools/read20-say.py"""
import json, re, subprocess, sys
import cmudict

NODE = r"""
global.window=global;const W=require('./read20/words.js');require('./read20/syllables-older.js');
const B=require('./read20/books.js');require('./read20/books-older.js');const s={};
B.books.forEach(b=>b.pages.forEach(p=>p.text.split(/\s+/).forEach(x=>{x=W.clean(x);if(x)s[x]=1})));
const o={};Object.keys(s).forEach(w=>{const a=W.analyze(w);if(a&&a.syllables.length>1)o[w]=a.syllables.map(x=>[x.text,x.say])});
console.log(JSON.stringify(o));"""

FIX = {"compass": ["com", "pus"], "focus": ["foe", "kus"], "focused": ["foe", "kist"], "focuses": ["foe", "kus", "iz"], "focusing": ["foe", "kus", "ing"], "gymnast": ["gym", "nist"], "gymnasts": ["gym", "nists"], "gymnastics": ["gym", "nas", "tics"], "basket": ["bas", "kit"], "baskets": ["bas", "kits"], "budget": ["bud", "jit"]}   # hand fixes
SPLIT = re.compile(r"^([^aeiouy]*)([aeiouy]+)(.*)$")
LONG = {"EY": "ay", "IY": "ee", "OW": "oh", "UW": "oo", "AY": "y"}

def respell(text, say, ph, stress, first=False, nxt=""):
    if say != text: return say                       # words.js already respelled it (tion, ty, ble ...)
    m = SPLIT.match(text)
    if not m: return say
    on, v, co = m.groups()
    if ph == "ER": return say
    if stress == "0" and ph in ("AH", "IH"):
        if first and not on and len(co) == 1 and nxt[:1] == co: return "uh"   # ap-ply, al-low: the "p" belongs to the next part
        if co == "st" and stress == "0": ph = "IH"   # gym-nast, pian-ist, art-ist say "nist" "ist"
        co2 = co[:-1] if len(co) > 1 and co.endswith("e") else co   # pri-vate -> "vit"
        if ph == "IH": return on + "i" + co2
        return on + ("uh" if not co2 else "u" + co2)
    if stress in "12" and not co and len(v) == 1 and ph in LONG:   # open stressed syllable: na-tion, mo-tion
        on2 = re.sub(r"c$", "k", on) if ph in ("EY", "OW", "UW") else on
        return on2 + LONG[ph] + ("e" if ph == "AY" else "")
    return say

def main():
    cmu = cmudict.dict()
    data = json.loads(subprocess.run(["node", "-e", NODE], capture_output=True, text=True, check=True).stdout)
    out, miss = {}, 0
    for w, syl in data.items():
        prons = cmu.get(w) or cmu.get(w[:-1] if w.endswith("s") else "") or []
        pick = None
        for pr in prons:
            vs = [p for p in pr if p[-1].isdigit()]
            if len(vs) == len(syl): pick = vs; break
        if not pick: miss += 1; continue
        res = [respell(t, s, re.sub(r"\d", "", v), v[-1], i == 0, syl[i + 1][0] if i + 1 < len(syl) else "") for i, ((t, s), v) in enumerate(zip(syl, pick))]
        res = FIX.get(w, res)
        if res != [s for _, s in syl]: out[w] = "|".join(res)
    body = ",\n".join('"%s": "%s"' % kv for kv in sorted(out.items()))
    open("read20/say-data.js", "w").write("/* Made by tools/read20-say.py: how to say each part of a word so it sounds like it does inside the word. */\n(function (root) {\n  root.R20Words.addSay({\n" + body + "\n  });\n})(typeof window !== \"undefined\" ? window : globalThis);\n")
    print(len(out), "words respelled;", miss, "words left to the rules")

main()
