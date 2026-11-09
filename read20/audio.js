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
  function pickVoice() {
    try {
      const vs = root.speechSynthesis.getVoices() || []; if (!vs.length) return null;
      const en = vs.filter(v => /^en[-_]/i.test(v.lang) || /^en$/i.test(v.lang));
      return en.find(v => /en[-_]US/i.test(v.lang) && v.localService) || en.find(v => /en[-_]US/i.test(v.lang)) || en[0] || null;
    } catch (e) { return null; }
  }
  try { if (root.speechSynthesis) root.speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); }; } catch (e) {}
  A.canSpeak = () => !!(root.speechSynthesis && root.SpeechSynthesisUtterance);
  A.speak = (text, rate) => {
    if (!A.canSpeak()) return false;
    try {
      const ss = root.speechSynthesis, busy = ss.speaking || ss.pending;
      if (busy) ss.cancel();
      const u = new root.SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = rate || 0.8; u.volume = 1;
      voice = voice || pickVoice(); if (voice) u.voice = voice;
      utt = u; A.log.push("say:" + text);
      setTimeout(() => { try { ss.resume(); ss.speak(u); } catch (e) {} }, busy ? 80 : 0);
      return true;
    } catch (e) { return false; }
  };
  A.info = () => { const c = ctx || A.ctx(); let v = 0; try { v = root.speechSynthesis ? root.speechSynthesis.getVoices().length : 0; } catch (e) {} return { engine: c ? c.state : "none", voices: v, speech: A.canSpeak() }; };

  root.R20Audio = A;
  if (typeof module !== "undefined" && module.exports) module.exports = A;
})(typeof window !== "undefined" ? window : globalThis);
