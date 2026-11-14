/* Walk-Up's link to the Dugout phone app (watch/ in this repo). Does nothing in a normal browser.
   Inside the Dugout app, window.WalkupNative exists, and this file:
   - sends the batting order, who is up and what is playing to the app (and from there to the watch) whenever they change,
   - sends the pitch log the same way, and merges the watch's pitch log back in (every pitch is counted once),
   - runs the watch's commands (pick a batter, play, stop),
   - fills in two things Android's web view lacks: the computer voice (Android's own text-to-speech) and saving backup files.
   Nothing here goes to the internet. */
(function () {
  "use strict";
  var N = window.WalkupNative;
  if (!N || typeof N.postState !== "function") return;
  var WU = window.WU = window.WU || {};

  /* ---------- the computer voice, through Android's own text-to-speech ---------- */
  if (!("speechSynthesis" in window) && typeof N.ttsSpeak === "function") {
    var utts = {}, seq = 0;
    window.SpeechSynthesisUtterance = function (text) { this.text = String(text || ""); this.rate = 1; this.volume = 1; this.pitch = 1; this.voice = null; this.lang = ""; this.onend = null; this.onerror = null; this.onstart = null; };
    window.speechSynthesis = {
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      speak: function (u) { var id = "t" + (++seq); utts[id] = u; this.speaking = true; try { N.ttsSpeak(id, u.text, Number(u.rate) || 1, u.volume == null ? 1 : Number(u.volume)); } catch (e) { window.__wuTts(id, "error"); } },
      cancel: function () { this.speaking = false; try { N.ttsStop(); } catch (e) { /* ignore */ } var ids = Object.keys(utts); utts = {}; ids.forEach(function () { /* cancelled utterances end quietly */ }); },
      getVoices: function () { return []; }, pause: function () {}, resume: function () {},
      addEventListener: function () {}, removeEventListener: function () {}
    };
    window.__wuTts = function (id, ev) {
      var u = utts[id]; if (!u) return;
      if (ev === "start") { if (u.onstart) try { u.onstart({}); } catch (e) { /* ignore */ } return; }
      delete utts[id];
      if (!Object.keys(utts).length) window.speechSynthesis.speaking = false;
      var f = ev === "end" ? u.onend : u.onerror;
      if (f) try { f({}); } catch (e) { console.error(e); }
    };
  }

  function ready() { return !!(WU.act && WU.act.play && WU.S && WU.on && WU.eng && WU.U && WU.pitch); }
  var lastErr = null;

  /* ---------- what the watch needs to know ---------- */
  function snapshot() {
    var S = WU.S, st = S.st, E = WU.eng, pl = E.playing();
    var lineup = st.lineup.map(function (id) {
      var p = WU.player(id); if (!p) return null;
      var code = WU.status(p).code;
      return { id: p.id, name: p.name || "", num: p.num || "", pos: p.pos || "", ready: !(code === "empty" || code === "needs-song" || code === "needs-voice"), code: code };
    }).filter(Boolean);
    var playing = null;
    if (pl) {
      var gid = pl.key && pl.key.indexOf("g:") === 0 ? pl.key.slice(2) : null, gp = gid ? WU.player(gid) : null;
      playing = { id: gid, label: gp ? (gp.num ? "#" + gp.num + " " : "") + (gp.name || "") : "Preview", elapsed: Math.round(pl.elapsed * 100) / 100, total: Math.round(pl.total * 100) / 100 };
    }
    return { v: 1, ready: true, batter: st.batter, lineup: lineup, playing: playing, loading: S.play && S.play.state === "loading" ? S.play.id : null, error: lastErr, team: st.settings.team || "" };
  }
  var tState = 0, tPitch = 0;
  function sendState() { clearTimeout(tState); tState = setTimeout(function () { try { N.postState(JSON.stringify(snapshot())); } catch (e) { console.error(e); } }, 60); }
  /* the pitch log, plus who is resting (worked out here from Ballclub and earlier days, which the watch doesn't have) */
  function pitchPayload() {
    var o = JSON.parse(JSON.stringify(WU.pitch.log())), el = {};
    WU.pitch.rows().forEach(function (r) { if (!r.eligible && r.eligibleOn) el[r.id] = r.eligibleOn; });
    o.elig = el;
    return JSON.stringify(o);
  }
  function sendPitch() { clearTimeout(tPitch); tPitch = setTimeout(function () { try { if (N.postPitch) N.postPitch(pitchPayload()); } catch (e) { console.error(e); } }, 120); }

  /* ---------- commands from the watch ---------- */
  function idle() { return !WU.eng.playing() && !(WU.S.play && WU.S.play.state === "loading"); }
  function selectIndex(i) {
    var n = WU.S.st.lineup.length; if (!n || !(i >= 0 && i < n)) return;
    if (i === WU.S.st.batter) return;
    if (!idle()) return; // never stop a song just because the watch moved
    WU.act.pick({ dataset: { i: String(i) } });
  }
  window.__wuCmd = function (json) {
    if (!ready()) return false;
    var c; try { c = typeof json === "string" ? JSON.parse(json) : json; } catch (e) { return false; }
    if (!c || typeof c.cmd !== "string") return false;
    if (c.cmd === "hello") { sendState(); sendPitch(); }
    else if (c.cmd === "select") selectIndex(Number(c.index));
    else if (c.cmd === "play") {
      if (!idle()) { sendState(); return true; }
      var i = WU.S.st.lineup.indexOf(c.id);
      if (i < 0) { lastErr = { msg: "That batter isn't in the batting order any more.", at: Date.now() }; sendState(); return true; }
      selectIndex(i);
      WU.act.play();
    }
    else if (c.cmd === "stop") WU.act.stop();
    else if (c.cmd === "pitchlog" && c.log) WU.pitch.merge(c.log);
    sendState();
    return true;
  };

  /* ---------- saving backup files: the web view can't download, so the app saves them to Downloads ---------- */
  function saveBlob(blob, name) {
    var id = N.saveStart(String(name || "walkup-file"), blob.type || "application/octet-stream"), CH = 3 * 131072, off = 0;
    if (!id) { WU.U.toast("Couldn't save that file on this phone.", "error"); return; }
    function next() {
      if (off >= blob.size) { var ok = N.saveEnd(id); WU.U.toast(ok ? "Saved to Downloads: " + name : "Couldn't save that file on this phone.", ok ? "ok" : "error", 6000); return; }
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ""), b64 = s.slice(s.indexOf(",") + 1); if (!N.saveChunk(id, b64)) { WU.U.toast("Couldn't save that file on this phone.", "error"); return; } off += CH; next(); };
      r.onerror = function () { WU.U.toast("Couldn't save that file on this phone.", "error"); };
      r.readAsDataURL(blob.slice(off, off + CH));
    }
    next();
  }

  function hook() {
    if (!ready()) { setTimeout(hook, 150); return; }
    if (typeof N.saveStart === "function") WU.U.downloadBlob = saveBlob;
    var toast = WU.U.toast;
    WU.U.toast = function (msg, kind) { if (kind === "error") { lastErr = { msg: String(msg), at: Date.now() }; sendState(); } return toast.apply(this, arguments); };
    WU.on(function (what) { if (what === "pitch") sendPitch(); else sendState(); });
    document.documentElement.classList.add("wu-native");
    sendState(); sendPitch();
  }
  hook();
})();
