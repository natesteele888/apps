#!/usr/bin/env python3
"""Builds read20/syllables-older.js: how to split the longer words in the older-reader stories into syllables, for the press-and-hold pop-up.
The simple rules in read20/words.js are fine for short early-reader words but wrong on words like "photograph". This uses a hyphenation
dictionary (pyphen) and checks the number of parts against a pronunciation dictionary (cmudict); words the two cannot agree on are listed in
OVERRIDES below by hand.   Needs: pip install pyphen cmudict   Run from the repo root:  python3 tools/read20-syllables.py"""
import json, re, subprocess, sys, os
import pyphen, cmudict

OVERRIDES = {   # word: "syl-la-bles"   (hand fixes where the dictionaries disagree or count differently)
    "anyone": "an-y-one", "championship": "cham-pi-on-ship", "clarksville": "clarks-ville", "clemente": "cle-men-te", "debuted": "de-but-ed",
    "different": "dif-fer-ent", "especially": "es-pe-cial-ly", "evening": "eve-ning", "families": "fam-i-lies", "family": "fam-i-ly", "hired": "hired",
    "history": "his-to-ry", "idea": "i-de-a", "interested": "in-ter-est-ed", "interesting": "in-ter-est-ing", "iowa": "i-o-wa", "january": "jan-u-ar-y",
    "javelin": "jav-e-lin", "jesse": "jes-se", "lionel": "li-o-nel", "louis": "lou-is", "louisiana": "lou-i-si-an-a", "national": "na-tion-al",
    "natural": "nat-u-ral", "normally": "nor-mal-ly", "ohio": "o-hi-o", "olympia": "o-lym-pi-a", "opposite": "op-po-site", "pianist": "pi-an-ist",
    "piano": "pi-an-o", "pierre": "pierre", "polio": "po-li-o", "rosario": "ro-sa-ri-o", "several": "sev-er-al", "sierra": "si-er-ra", "tire": "tire",
    "tired": "tired", "tokyo": "to-kyo", "usual": "u-su-al", "yosemite": "yo-sem-i-te", "zaire": "za-ire", "difference": "dif-fer-ence",
    "aperture": "ap-er-ture", "photograph": "pho-to-graph", "photography": "pho-tog-ra-phy", "photographer": "pho-tog-ra-pher", "photographers": "pho-tog-ra-phers",
    "photographs": "pho-to-graphs", "biography": "bi-og-ra-phy",
    "any": "an-y", "anything": "an-y-thing", "april": "a-pril", "city": "cit-y", "copy": "cop-y", "coubertin": "cou-ber-tin", "courage": "cour-age", "daguerreotype": "da-guerre-o-type",
    "easy": "eas-y", "eliud": "e-li-ud", "fibers": "fi-bers", "heavy": "heav-y", "heavyweight": "heav-y-weight", "many": "man-y", "minute": "min-ute", "minutes": "min-utes",
    "putting": "put-ting", "remarkable": "re-mark-a-ble", "scientists": "sci-en-tists", "shootout": "shoot-out", "sophomore": "soph-o-more", "study": "stud-y", "texas": "tex-as",
    "unbelievable": "un-be-liev-a-ble", "usain": "u-sain", "valuable": "val-u-a-ble", "vary": "var-y", "very": "ver-y", "wrestling": "wres-tling", "youngest": "young-est",
    "usually": "u-su-al-ly", "whether": "wheth-er", "imagine": "i-mag-ine", "imagined": "i-mag-ined", "kenya": "ken-ya", "nobody": "no-bod-y", "olive": "ol-ive",
    "binoculars": "bi-noc-u-lars", "faraway": "far-a-way", "oceania": "o-ce-a-ni-a", "recovery": "re-cov-er-y", "already": "al-read-y", "ali": "a-li", "camera": "cam-er-a",
    "cameras": "cam-er-as", "gradually": "grad-u-al-ly", "body": "bod-y", "busy": "bus-y", "paris": "par-is",
    "able": "a-ble", "agoge": "a-go-ge", "australia": "aus-tral-ia", "camels": "cam-els", "cities": "cit-ies", "disagree": "dis-a-gree", "dictionary": "dic-tion-ar-y",
    "hemispheres": "hem-i-spheres", "hieroglyphs": "hi-er-o-glyphs", "imaginary": "i-mag-i-nar-y", "military": "mil-i-tar-y", "necessary": "nec-es-sar-y", "paragraph": "par-a-graph",
    "preposition": "prep-o-si-tion", "prepositional": "prep-o-si-tion-al", "reachable": "reach-a-ble", "sumerians": "su-me-ri-ans", "unbeatable": "un-beat-a-ble", "venice": "ven-ice",
    "madison": "mad-i-son", "balances": "bal-anc-es", "bio": "bi-o", "buddhism": "bud-dhism", "cuneiform": "cu-ne-i-form", "empire": "em-pire",
    "federal": "fed-er-al", "foreigners": "for-eign-ers", "hyperbole": "hy-per-bo-le", "idiom": "id-i-om", "idioms": "id-i-oms", "mediterranean": "med-i-ter-ra-ne-an",
    "meridian": "me-rid-i-an", "mesopotamia": "mes-o-po-ta-mi-a", "oasis": "o-a-sis", "philadelphia": "phil-a-del-phi-a", "society": "so-ci-e-ty", "socrates": "soc-ra-tes",
    "tele": "tel-e", "travelers": "trav-el-ers",
}

def words():
    js = "const B=require('./read20/books.js');require('./read20/books-older.js');const s={};B.books.filter(b=>b.shelf==='older').forEach(b=>b.pages.forEach(p=>p.text.split(/\\s+/).forEach(x=>{x=x.toLowerCase().replace(/^[^a-z]+|[^a-z'\\-]+$/g,'').replace(/'s$/,'');if(x)s[x]=1})));console.log(JSON.stringify(Object.keys(s).sort()))"
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)

VOWEL = re.compile(r"[aeiouy]")
def sane(parts):
    """Every part needs a vowel and must not be a single stray letter pair like 's' or 'le' hanging off the end."""
    return all(VOWEL.search(p) for p in parts) and not any(len(p) == 1 and p in "bcdfghjklmnpqrstvwxz" for p in parts)

def main():
    cmu = cmudict.dict(); a = pyphen.Pyphen(lang="en_US"); b = pyphen.Pyphen(lang="en_US", left=1, right=1)
    def count(w):
        return min(len([p for p in pr if p[-1].isdigit()]) for pr in cmu[w]) if w in cmu else None
    ws = [w for w in words() if re.fullmatch(r"[a-z]+", w) and w not in ("bc", "jr", "th", "nba", "nfl")]
    out, rules_needed = {}, []
    for w in ws:                                    # tier 1: hyphenation dictionary, checked against the pronunciation dictionary
        n = count(w)
        if w in OVERRIDES: out[w] = OVERRIDES[w]; continue
        if n == 1 or (n is None and len(w) <= 4): continue
        for d in (a, b):
            parts = d.inserted(w).split("-")
            if len(parts) > 1 and (n is None or len(parts) == n) and sane(parts): out[w] = "-".join(parts); break
        else: rules_needed.append(w)
    # tier 2: an ending added to a word we already know (awards = a-ward + s, jumped = jump + ed, slowly = slow + ly)
    def known(base):
        if base in OVERRIDES: return OVERRIDES[base]
        if base in out: return out[base]
        n = count(base)
        return base if n == 1 else None
    left = []
    for w in rules_needed:
        n = count(w); done = False
        for suf, join in (("ers", "-ers"), ("er", "-er"), ("ing", "-ing"), ("ed", "-ed"), ("es", "-es"), ("s", "s"), ("ly", "-ly"), ("ment", "-ment"), ("ness", "-ness"), ("ful", "-ful")):
            if w.endswith(suf) and len(w) > len(suf) + 2:
                for base in {w[:-len(suf)], w[:-len(suf)] + "e", w[:-len(suf) - 1] if len(w) > len(suf) + 3 and w[-len(suf) - 1] == w[-len(suf) - 2] else None}:
                    if not base: continue
                    k = known(base)
                    if k:
                        cand = k + join if join != "s" else k + "s"
                        if base.endswith("e") and join in ("-ing", "-ed", "-es", "-er", "-ers") and not w[:-len(suf)].endswith("e"): cand = k[:-1] + join
                        parts = cand.split("-")
                        if (n is None or len(parts) == n) and sane(parts) and "".join(parts) == w: out[w] = cand; done = True; break
                if done: break
        if not done: left.append(w)
    # tier 3: the simple rules from read20/words.js, accepted only when they agree with the pronunciation dictionary
    unresolved = []
    if left:
        rules = json.loads(subprocess.run(["node", "-e", "const W=require('./read20/words.js');console.log(JSON.stringify(" + json.dumps(left) + ".map(w=>W.analyze(w).text.replace(/\\u00b7/g,'-'))))"], capture_output=True, text=True, check=True).stdout)
        for w, r in zip(left, rules):
            parts = r.split("-"); n = count(w)
            if (n is None or len(parts) == n) and sane(parts) and "".join(parts) == w: out[w] = r
            else: unresolved.append((w, n, a.inserted(w)))
    js = "/* Made by tools/read20-syllables.py. Do not edit by hand; add fixes to OVERRIDES in the script. */\nwindow.R20Words && window.R20Words.add(" + json.dumps(out, indent=0, sort_keys=True) + ");\n"
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "read20", "syllables-older.js"); open(path, "w").write(js)
    print(len(out), "words written;", len(unresolved), "unresolved")
    for u in unresolved: print("  UNRESOLVED", u)

if __name__ == "__main__": main()
