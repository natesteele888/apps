/* Read 20: all the sound in one place. One shared Web Audio context (phones only let a page make sound after a tap, so it is
   unlocked on the first touch), a chime, and the phone's speech voice. */
(function (root) {
  "use strict";
  const A = { log: [] };
  let ctx = null, utt = null, voice = null, unlocked = false;

  A.ctx = () => {
    if (ctx) return ctx;
    try { const AC = root.AudioContext || root.webkitAudioContext; if (AC) ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  };
  /* Call from a tap. Safe to call again and again. */
  A.unlock = () => {
    const c = A.ctx(); if (!c) return;
    try { if (c.state !== "running") c.resume(); if (!unlocked) { unlocked = true; const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } } catch (e) {}
  };
  ["pointerdown", "touchstart", "keydown"].forEach(ev => root.addEventListener && root.addEventListener(ev, A.unlock, { capture: true, passive: true }));

  A.stop = () => { try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) {} };

  /* A bright four-note chime (the 20 minutes are done) and a single beep (the sound test). */
  A.chime = () => A.tones([523, 659, 784, 1047], 0.18);
  A.beep = () => A.tones([880], 0.3);
  A.tones = (freqs, step) => {
    const c = A.ctx(); if (!c) return false; A.unlock();
    try { const t = c.currentTime + 0.02; freqs.forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.0001, t + i * step); g.gain.exponentialRampToValueAtTime(0.25, t + i * step + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * step + 0.5); o.start(t + i * step); o.stop(t + i * step + 0.55); }); return true; } catch (e) { return false; }
  };

  /* The phone's own voice. Chrome drops a voice line that comes right after cancel(), keeps no reference to the line (it can be
     garbage collected mid-word), and may have no voices loaded yet, so each of those is handled. */
  /* Phones ship several voices and the default one is often the most robotic. Rank them: natural, neural, enhanced, premium and
     Siri voices first, then the network voices Google and Microsoft offer, then plain US and UK English, and never the novelty or
     eSpeak voices. The family can pick another one in Settings (kept per phone). */
  const NOVELTY = /espeak|albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|princess/i;
  A.score = v => {
    const n = (v.name || "") + " " + (v.voiceURI || ""); let s = 0;
    if (NOVELTY.test(n)) return -100;
    if (/en[-_]US/i.test(v.lang)) s += 30; else if (/en[-_]GB/i.test(v.lang)) s += 26; else if (/en[-_](AU|CA|IE|NZ|ZA)/i.test(v.lang)) s += 18; else s += 10;
    if (/natural|neural|premium|enhanced|studio|wavenet|siri/i.test(n)) s += 60;
    if (/online/i.test(n)) s += 25;
    if (/google/i.test(n)) s += 40;
    if (/network/i.test(n) || v.localService === false) s += 12;
    if (/^(samantha|ava|allison|susan|zoe|nicky|karen|moira|serena|daniel|tessa|aria|jenny|guy|libby|sonia)\b/i.test(v.name || "")) s += 25;
    if (/compact/i.test(n)) s -= 30;
    if (v.default) s += 3;
    return s;
  };
  const englishVoices = () => { try { return (root.speechSynthesis.getVoices() || []).filter(v => /^en([-_]|$)/i.test(v.lang)); } catch (e) { return []; } };
  const prefGet = k => { try { return root.localStorage.getItem(k); } catch (e) { return null; } };
  const prefSet = (k, v) => { try { if (v) root.localStorage.setItem(k, v); else root.localStorage.removeItem(k); } catch (e) {} };
  /* English voices, best first: [{ uri, name, lang, score }] */
  A.voices = () => englishVoices().map(v => ({ uri: v.voiceURI || v.name, name: v.name, lang: v.lang, score: A.score(v) })).filter(v => v.score > -100).sort((x, y) => y.score - x.score);
  A.setVoice = uri => { prefSet("read20.voice", uri || ""); voice = null; };
  A.voiceName = () => { const v = pickVoice(); return v ? v.name : ""; };
  A.rate = () => { const r = +prefGet("read20.rate"); return r >= 0.3 && r <= 1.3 ? r : 0.6; };
  A.setRate = r => prefSet("read20.rate", r ? String(r) : "");
  function pickVoice() {
    try {
      const en = englishVoices(); if (!en.length) return null;
      const pref = prefGet("read20.voice"), mine = pref && en.find(v => (v.voiceURI || v.name) === pref);
      if (mine) return mine;
      return en.slice().sort((x, y) => A.score(y) - A.score(x))[0] || null;
    } catch (e) { return null; }
  }
  try { if (root.speechSynthesis) root.speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); }; } catch (e) {}
  A.canSpeak = () => !!(root.speechSynthesis && root.SpeechSynthesisUtterance);
  /* opts: { onend, onboundary } (used to read a whole sentence and light up each word as it is said) */
  A.speak = (text, rate, opts) => {
    if (!A.canSpeak()) return false;
    try {
      const ss = root.speechSynthesis, busy = ss.speaking || ss.pending;
      if (busy) ss.cancel();
      const u = new root.SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = rate || 0.8; u.volume = 1;
      voice = voice || pickVoice(); if (voice) { u.voice = voice; if (voice.lang) u.lang = voice.lang; }
      if (opts && opts.onend) { let done = false; const fin = () => { if (done) return; done = true; opts.onend(); }; u.onend = fin; u.onerror = fin; }
      if (opts && opts.onboundary) u.onboundary = opts.onboundary;
      if (opts && opts.onstart) u.onstart = opts.onstart;
      utt = u; A.log.push("say:" + text);
      setTimeout(() => { try { ss.resume(); ss.speak(u); } catch (e) {} }, busy ? 80 : 0);
      return true;
    } catch (e) { return false; }
  };
  A.info = () => { const c = ctx || A.ctx(); let v = 0; try { v = root.speechSynthesis ? root.speechSynthesis.getVoices().length : 0; } catch (e) {} return { engine: c ? c.state : "none", voices: v, speech: A.canSpeak() }; };

  root.R20Audio = A;
  if (typeof module !== "undefined" && module.exports) module.exports = A;
})(typeof window !== "undefined" ? window : globalThis);
