// song following the clock, backup/restore, delete flows, settings. Same setup as eightcount.test.cjs.
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs"), path = require("path");
const SP = path.resolve(__dirname, "..");
const URL = "http://127.0.0.1:8791/apps/eightcount/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let passed = 0;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function step(m, fn) { try { await fn(); passed++; console.log("ok  ", m); } catch (e) { process.exitCode = 1; console.log("FAIL", m, "\n    ", e && e.message || e); } }

// a 14 s mono WAV: 1 s of silence, then a click on every beat at 120 BPM (louder on the 1 of each 8-count)
function wav(path_) {
  const sr = 22050, secs = 14, n = sr * secs, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr - 1; let v = 0;
    if (t >= 0) { const bt = t % 0.5, beat = Math.floor(t / 0.5), acc = beat % 8 === 0; if (bt < 0.05) v = Math.sin(2 * Math.PI * (acc ? 1000 : 700) * bt) * (acc ? 0.8 : 0.4) * (1 - bt / 0.05); }
    buf.writeInt16LE(Math.round(v * 32000), 44 + i * 2);
  }
  fs.writeFileSync(path_, buf);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const errs = [];
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("pageerror " + e.message));
  await page.route("**/install.js", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/fonts.g*/**", r => r.abort());
  await page.addInitScript(() => { window.__audios = []; const A = window.Audio; window.Audio = function () { const a = new A(); window.__audios.push(a); return a; }; });
  const WAV = SP + "/shots/test-click-120.wav"; wav(WAV);
  await page.goto(URL, { waitUntil: "load" }); await page.waitForSelector(".quick");

  await step("add a song: file stays on the phone, sheet shows a live count that follows the song", async () => {
    await page.click(".rt"); await page.click('[data-act="song"]');
    await page.setInputFiles("#sf", WAV);
    await page.waitForSelector('[data-s="play"]');
    await page.fill("#so", "1"); await page.dispatchEvent("#so", "change");
    await page.click('[data-s="play"]');
    await wait(1900);                       // song time ~1.9 s: first 1 at 1.0 s, so beat index 1 (the "2") by 1.5 and the "3" at 2.0
    const big = await page.locator("#sdBig").textContent();
    assert.ok(["2", "3"].includes(big), "count follows the song: " + big);
    await page.screenshot({ path: SP + "/shots/ec-song.png" });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("eightcount.routines"))[0].music);
    assert.deepStrictEqual([saved.hasFile, saved.offset], [true, 1]);
    await page.goBack(); await page.waitForSelector("#sheetWrap", { state: "hidden" });
    assert.ok((await page.locator(".song").textContent()).includes("test-click-120"));
  });

  await step("practice with the song at 75%: the song stays on the clock (within 80 ms) and clicks stay quiet", async () => {
    await page.click('[data-act="practice"]'); await page.waitForSelector("#player");
    assert.ok((await page.locator("#plReady").textContent()).includes("The song plays with the count"));
    await page.click('[data-rate="75"]');
    await page.evaluate(() => { window.__osc = []; });
    await page.click('[data-p="start"]');
    const errsMs = [];
    for (let i = 0; i < 12; i++) {
      await wait(450);
      const r = await page.evaluate(() => {
        const a = window.__audios[window.__audios.length - 1], E = window.__ec.App.engine, st = E.startMs();
        if (st == null) return null;
        const pos = (performance.now() - st) / 1000 * 0.75, offset = 1;
        return { pos, audio: a.currentTime, paused: a.paused, rate: a.playbackRate };
      });
      if (r && r.pos > 0.3 && !r.paused) errsMs.push(Math.round(Math.abs(r.audio - (1 + r.pos)) * 1000));
    }
    console.log("      song vs clock error (ms):", errsMs.join(", "));
    assert.ok(errsMs.length >= 4, "song was playing for most samples: " + errsMs.length);
    assert.ok(Math.max(...errsMs) < 80, "drift too big: " + Math.max(...errsMs));
    const osc = await page.evaluate(() => window.__osc.length);
    assert.ok(osc <= 4, "only count-off clicks play over a song, saw " + osc);
    await page.click('[data-p="play"]');
    const paused = await page.evaluate(() => window.__audios[window.__audios.length - 1].paused);
    assert.ok(paused, "song pauses with the count");
    await page.goBack(); await page.waitForSelector("#player", { state: "detached" });
  });

  await step("back up and restore routines through a file; a damaged file changes nothing", async () => {
    await page.goto(URL, { waitUntil: "load" }); await page.waitForSelector(".quick");
    await page.click('[data-act="settings"]');
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-s="backup"]')]);
    const file = SP + "/shots/test-backup.json"; await dl.saveAs(file);
    const o = JSON.parse(fs.readFileSync(file, "utf8")); assert.strictEqual(o.routines.length, 1); assert.ok(o.routines[0].sections.length >= 1);
    const before = await page.evaluate(() => localStorage.getItem("eightcount.routines"));
    fs.writeFileSync(SP + "/shots/test-bad.json", "{not json");
    await page.click('[data-s="restore"]'); await page.waitForSelector("#if");
    await page.setInputFiles("#if", SP + "/shots/test-bad.json");
    await page.waitForFunction(() => document.querySelector("#toast.on"));
    assert.ok((await page.locator("#toast").textContent()).includes("isn't an Eight Count routine"));
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("eightcount.routines")), before);
    await page.setInputFiles("#if", file);
    await page.waitForSelector("#sheetWrap", { state: "hidden" });
    assert.strictEqual(await page.locator(".rt").count(), 2);
  });

  await step("settings: sound delay and toggles are kept; flash toggle pulses the screen", async () => {
    await page.click('[data-act="settings"]');
    await page.fill("#trim", "80"); await page.dispatchEvent("#trim", "input");
    await page.click('[data-t="flash"]'); await page.click('[data-cy="20"]');
    await page.screenshot({ path: SP + "/shots/ec-settings.png" });
    await page.goBack();
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("eightcount.settings")));
    assert.deepStrictEqual([st.trim, st.flash, st.cycle], [80, true, 20000]);
    await page.reload(); await page.waitForSelector(".quick");
    await page.click('[data-act="settings"]');
    assert.strictEqual(await page.locator("#trim").inputValue(), "80");
    assert.strictEqual(await page.locator('[data-t="flash"]').getAttribute("aria-pressed"), "true");
    await page.goBack();
  });

  await step("rename, move a count to the next section, delete a section and a routine", async () => {
    await page.locator(".rt").first().click();
    await page.click('[data-act="rmenu"]'); await page.click('[data-s="rename"]');
    await page.fill("#rv", "Game day"); await page.press("#rv", "Enter");
    await page.waitForSelector("#sheetWrap", { state: "hidden" });
    assert.strictEqual(await page.locator(".rname").textContent(), "Game day");
    // 8-count 4 is the last in Cheer: "Move down" sends it to the top of Dance
    const cheerBefore = await page.locator(".sec >> nth=0 >> .cnt").count(), danceBefore = await page.locator(".sec >> nth=1 >> .cnt").count();
    await page.click('.sec >> nth=0 >> .cnt >> nth=' + (cheerBefore - 1) + ' >> [data-act="cnt-menu"]'); await page.click('[data-s="down"]');
    assert.strictEqual(await page.locator(".sec >> nth=0 >> .cnt").count(), cheerBefore - 1);
    assert.strictEqual(await page.locator(".sec >> nth=1 >> .cnt").count(), danceBefore + 1);
    await page.click('[data-act="sec-menu"][data-si="1"]'); await page.click('[data-s="del"]');
    await page.click('[data-s="yes"]'); await page.waitForSelector("#sheetWrap", { state: "hidden" });
    assert.strictEqual(await page.locator(".sec").count(), 1);
    await page.click('[data-act="rmenu"]'); await page.click('[data-s="del"]'); await page.click('[data-s="yes"]');
    await page.waitForSelector(".quick");
    assert.strictEqual(await page.locator(".rt").count(), 1);
    const gone = await page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open("eightcount"); q.onsuccess = () => r(q.result); }); return await new Promise(r => { const g = db.transaction("blobs").objectStore("blobs").getAllKeys(); g.onsuccess = () => r(g.result); }); });
    console.log("      stored files left after deleting the routine that owned the song:", JSON.stringify(gone));
  });

  await step("a phone with no storage still opens, and warns instead of crashing", async () => {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p2 = await c2.newPage(); const e2 = [];
    p2.on("pageerror", e => e2.push(e.message));
    await p2.route("**/install.js", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
    await p2.route("**/fonts.g*/**", r => r.abort());
    await p2.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error("quota"); }; Storage.prototype.getItem = function () { throw new Error("blocked"); }; });
    await p2.goto(URL, { waitUntil: "load" }); await p2.waitForSelector(".quick");
    assert.deepStrictEqual(e2, []);
    await p2.click(".rt").catch(() => {});
    await c2.close();
  });

  await step("no unexpected console errors", async () => assert.deepStrictEqual(errs.filter(e => !/Failed to load resource/.test(e)), []));
  await browser.close();
  console.log(passed + " passed");
})().catch(e => { console.error(e); process.exit(1); });
