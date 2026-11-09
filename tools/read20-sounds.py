#!/usr/bin/env python3
"""Makes the letter-sound clips for Read 20's Sounds board (read20/sounds/*.mp3) with the espeak-ng speech synthesizer.
Run on a computer that has espeak-ng, ffmpeg and numpy:  python3 tools/read20-sounds.py [outdir]
Each clip is one phonics sound ("sss", "buh", short "a"), trimmed, leveled and saved as a small mono mp3.
Stop sounds (b, d, g, k, p, t, j, ch) keep a short "uh" because a stop can't be said alone; the rest are held sounds."""
import subprocess, sys, os, wave, tempfile
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "read20", "sounds")
# id: (espeak phonemes, max seconds to keep)
S = {
 # held consonants
 "f": ("f:", .6), "v": ("v@", .55), "s": ("s:", .6), "z": ("z@", .55), "sh": ("S:", .6), "th": ("T:", .6), "h": ("h@", .35),
 "m": ("m@", .6), "n": ("n@", .6), "ng": ("@N", .6), "l": ("l@", .5), "r": ("r@", .5), "w": ("w@", .4), "y": ("j@", .4),
 # stops: a quick consonant plus a short "uh"
 "b": ("b@", .3), "d": ("d@", .3), "g": ("g@", .3), "k": ("k@", .3), "p": ("p@", .3), "t": ("t@", .3), "j": ("dZ@", .35), "ch": ("tS@", .35),
 "x": ("ks", .5), "qu": ("kw@", .4),
 # short vowels (cat, bed, sit, hot, cup)
 "a": ("a", .5), "e": ("E", .5), "i": ("I", .5), "o": ("A:", .5), "u": ("V", .5),
 # long vowels and vowel teams
 "a_long": ("eI", .7), "e_long": ("i:", .7), "i_long": ("aI", .7), "o_long": ("oU", .7), "u_long": ("ju:", .7),
 "oo": ("u:", .6), "oo_short": ("U", .5), "ou": ("aU", .7), "oi": ("OI", .7), "ar": ("A@", .7), "or": ("O@", .7), "er": ("3:", .7), "aw": ("O:", .6),
}

def render(ph, path):
    subprocess.run(["espeak-ng", "-v", "en-us", "-s", "105", "-p", "50", "-a", "150", "-w", path, "[[%s]]" % ph], check=True, stderr=subprocess.DEVNULL)

def load(path):
    w = wave.open(path); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0; w.close(); return x, sr

def trim(x, sr, keep):
    e = np.abs(x); thr = max(e.max() * 0.03, 0.002); idx = np.where(e > thr)[0]
    if len(idx) == 0: return x[:int(sr * .1)]
    a = max(0, idx[0] - int(sr * .005)); b = min(len(x), idx[-1] + int(sr * .02))
    y = x[a:b][: int(sr * keep)]
    n = min(len(y) // 4, int(sr * .06)); y = y.copy()
    if n: y[-n:] *= np.linspace(1, 0, n)          # fade out
    m = min(len(y) // 8, int(sr * .004)); 
    if m: y[:m] *= np.linspace(0, 1, m)           # no click at the start
    return y

HELD = {"f", "v", "s", "z", "sh", "th", "m", "n", "ng"}   # sounds that are stretched by looping their steady middle

def centroid(x, sr):
    f = np.abs(np.fft.rfft(x * np.hanning(len(x)))); fr = np.fft.rfftfreq(len(x), 1 / sr); return (f * fr).sum() / max(f.sum(), 1e-9)

def murmur(x, sr, sid):
    """m and n: keep the humming part before the vowel starts. ng: keep the humming tail after the vowel."""
    fr = int(sr * .01); n = len(x) // fr
    cs = [centroid(x[i * fr:(i + 1) * fr + fr], sr) for i in range(n)]
    if sid == "ng":                      # vowel first, hum last
        k = n - 1
        while k > 0 and cs[k] < 1000: k -= 1
        return x[(k + 2) * fr:]
    if sid in ("v", "z"):                # hiss and buzz first, vowel last: keep the part before the vowel
        k = 3
        while k < n and cs[k] > 1000: k += 1
        return x[: max(k - 1, 2) * fr]
    k = 0
    while k < n and cs[k] < 1000: k += 1
    return x[: max(k - 2, 1) * fr]

def stretch(x, sr, target, lo=.25, hi=.75):
    """Make a steady sound longer by repeating its middle, joined where the waves line up (no clicks)."""
    if len(x) >= target * sr: return x
    L = len(x); mid0, mid1 = int(L * lo), int(L * hi); core = x[mid0:mid1]
    xf = int(sr * .012); out = x[:mid1].copy(); need = int(target * sr)
    while len(out) < need:
        tail = out[-xf:]; best, bo = None, 0
        for off in range(0, max(1, len(core) - 2 * xf), 2):
            d = float(np.sum((core[off:off + xf] - tail) ** 2))
            if best is None or d < best: best, bo = d, off
        seg = core[bo + xf: bo + xf + max(len(core) // 2, xf)]
        fade = np.linspace(1, 0, xf); out[-xf:] = tail * fade + core[bo:bo + xf] * (1 - fade)
        out = np.concatenate([out, seg])
    return out[:need]

def main():
    os.makedirs(OUT, exist_ok=True); report = []
    for sid, (ph, keep) in S.items():
        with tempfile.TemporaryDirectory() as d:
            raw = os.path.join(d, "r.wav"); render(ph, raw); x, sr = load(raw)
            y = trim(x, sr, 9)
            if sid in ("m", "n", "ng", "v", "z"): y = murmur(y, sr, sid)
            if sid in HELD:
                y = stretch(y, sr, keep, *((.02, .98) if sid in ("v", "z") else (.25, .75)))   # v and z: loop the whole buzz-plus-hiss, not just the hum
                n = min(len(y) // 4, int(sr * .06)); y = y.copy(); y[-n:] *= np.linspace(1, 0, n); y[: int(sr * .01)] *= np.linspace(0, 1, int(sr * .01))
            else: y = trim(y, sr, keep)
            pk = np.abs(y).max() or 1; y = y / pk * 0.89
            out = os.path.join(d, "o.wav"); w = wave.open(out, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((y * 32767).astype(np.int16).tobytes()); w.close()
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", out, "-ac", "1", "-ar", "22050", "-codec:a", "libmp3lame", "-b:a", "48k", os.path.join(OUT, sid + ".mp3")], check=True)
        f = np.abs(np.fft.rfft(y)); fr = np.fft.rfftfreq(len(y), 1 / sr)
        report.append((sid, ph, round(len(y) / sr, 2), round(float(np.sqrt((y ** 2).mean())), 3), int((f * fr).sum() / max(f.sum(), 1e-9))))
    for r in report: print("%-9s %-6s dur %.2fs rms %.3f centroid %5d Hz" % r)

if __name__ == "__main__": main()
