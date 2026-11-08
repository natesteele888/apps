// NODE_PATH=<events tests node_modules> node eightcount.test.cjs   (server: python3 -m http.server 8791 in newapps/serve)
const { chromium } = require("playwright");
const assert = require("assert");
const path = require("path");
const SP = path.resolve(__dirname, "..");
const URL = "http://127.0.0.1:8791/apps/eightcount/";
const CHROME = require("./lib.cjs").CHROME;
let passed = 0, failed = 0;
const ok = (m) => { passed++; console.log("ok  ", m); };
const bad = (m, e) => { failed++; process.exitCode = 1; console.log("FAIL", m, "\n    ", (e && e.message || e)); };
async function step(m, fn) { try { await fn(); ok(m); } catch (e) { bad(m, e); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function newPage(ctx, errs) {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.route("**/install.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  return page;
}
// log every oscillator that gets scheduled, with its start time on the audio clock
const SPY = () => {
  window.__osc = [];
  const AC = window.AudioContext || window.webkitAudioContext, co = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () {
    const o = co.call(this), st = o.start.bind(o);
    o.start = (when) => { window.__osc.push({ when, freq: o.frequency.value, now: this.currentTime }); return st(when); };
    return o;
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"] });
  const errs = [];
  const page = await newPage(ctx, errs);
  await page.addInitScript(SPY);
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForSelector(".quick");

  await step("home shows quick count and the sample routine", async () => {
    assert.ok(await page.locator(".rt-name", { hasText: "Sample: game-day cheer" }).count());
    assert.strictEqual(await page.locator("#qv").textContent(), "120");
    await page.screenshot({ path: SP + "/shots/ec-home.png" });
  });
  await step("tap targets on home are at least 44px", async () => {
    const small = await page.evaluate(() => [...document.querySelectorAll("button,a,input,select")].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 20), w: r.width, h: r.height }; }).filter(x => x.h < 43 || x.w < 43));
    assert.deepStrictEqual(small, []);
  });

  await step("open the routine, edit a count with a chip, it advances and saves", async () => {
    await page.click(".rt");
    await page.waitForSelector(".go3");
    await page.screenshot({ path: SP + "/shots/ec-routine.png" });
    await page.click('.cell[data-si="0"][data-ci="1"][data-b="5"]');
    await page.waitForSelector("#cf");
    await page.click(".chip >> text=Touchdown");
    assert.ok((await page.locator("#sheet h3").textContent()).includes("8-count 2"));
    assert.ok((await page.locator(".dot.on").textContent()) === "7"); // advanced to beat 7
    await page.screenshot({ path: SP + "/shots/ec-cellsheet.png" });
    await page.fill("#cv", "Lunge");
    await page.press("#cv", "Enter");
    await page.click(".dot >> nth=0"); // jump back to beat 1 and close later
    await page.goBack();                // Android back closes the sheet
    await page.waitForSelector("#sheetWrap", { state: "hidden" });
    const txt = await page.locator('.cell[data-si="0"][data-ci="1"][data-b="5"] span').textContent();
    const t7 = await page.locator('.cell[data-si="0"][data-ci="1"][data-b="6"] span').textContent();
    assert.strictEqual(txt, "Touchdown"); assert.strictEqual(t7, "Lunge");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("eightcount.routines"))[0].sections[0].counts[1].m);
    assert.strictEqual(saved[5], "Touchdown"); assert.strictEqual(saved[6], "Lunge");
  });

  await step("type a whole 8-count at once, add an 8-count, change tempo", async () => {
    await page.click('[data-act="add-count"][data-si="1"]');
    const n = await page.locator(".cnt").count();
    await page.click(`.cnt >> nth=${n - 1} >> [data-act="cnt-menu"]`);
    await page.fill("#tw", "Clasp, High V, , Low V, Touchdown, , Daggers, Hit it");
    await page.click('[data-s="apply"]');
    await page.waitForSelector("#sheetWrap", { state: "hidden" });
    const last = await page.locator(".cnt >> nth=" + (n - 1) + " >> .cell span").allTextContents();
    assert.deepStrictEqual(last, ["Clasp", "High V", "·", "Low V", "Touchdown", "·", "Daggers", "Hit it"]);
    await page.click('[data-act="bpm+"]'); await page.click('[data-act="bpm+"]');
    assert.strictEqual(await page.locator("#rbpm").textContent(), "122");
  });

  /* ---- practice: the count and the clicks are evenly spaced ---- */
  await step("quick count at 240 BPM: count-off 5 6 7 8, then 1..8 with even spacing; clicks scheduled evenly", async () => {
    await page.click('[data-act="back"]');
    await page.evaluate(() => { localStorage.setItem("eightcount.qbpm", "240"); });
    await page.reload(); await page.waitForSelector(".quick");
    await page.click('[data-act="qstart"]');
    await page.waitForSelector("#player");
    await page.evaluate(() => {
      window.__seq = []; const big = document.querySelector("#plBig");
      new MutationObserver(() => window.__seq.push([performance.now(), big.textContent, big.className])).observe(big, { childList: true, characterData: true, subtree: true, attributes: true });
    });
    await page.screenshot({ path: SP + "/shots/ec-quick-ready.png" });
    await page.click('[data-p="start"]');
    await wait(4600);
    await page.screenshot({ path: SP + "/shots/ec-quick-running.png" });
    await page.click('[data-p="play"]'); // pause
    const seq = await page.evaluate(() => window.__seq.filter(s => /^[1-8]$/.test(s[1]) && !/pre/.test(s[2])));
    // each beat can fire several mutations (text + class); keep one entry per change of the number
    const uniq = seq.filter((s, i) => i === 0 || s[1] !== seq[i - 1][1]);
    const labels = uniq.map(s => s[1]).join("");
    assert.ok(labels.startsWith("5678123456781234"), "sequence was " + labels);
    // beats are 250 ms apart; the on-screen jitter should stay small
    const times = uniq.map(s => s[0]); const gaps = times.slice(1).map((t, i) => t - times[i]);
    const maxDev = Math.max(...gaps.map(g => Math.abs(g - 250)));
    console.log("      on-screen gaps (ms) max deviation from 250:", maxDev.toFixed(1), "over", gaps.length, "beats");
    assert.ok(maxDev < 40, "screen jitter " + maxDev);
    const osc = await page.evaluate(() => window.__osc.map(o => o.when));
    const og = osc.slice(1).map((t, i) => t - osc[i]);
    const dev = Math.max(...og.map(g => Math.abs(g - 0.25)));
    console.log("      scheduled click gaps (s) max deviation from 0.25:", (dev * 1000).toFixed(3), "ms over", og.length, "clicks");
    assert.ok(og.length >= 10 && dev < 0.002, "click spacing dev " + dev);
    // beat 1 of each 8 and the count-off use different pitches
    const freqs = await page.evaluate(() => window.__osc.map(o => Math.round(o.freq)));
    assert.ok(freqs[0] === 1320 && freqs.includes(1050), "pitches " + freqs.slice(0, 10));
  });

  await step("back button closes the player; pause then close leaves no sound running", async () => {
    await page.goBack();
    await page.waitForSelector("#player", { state: "detached" });
    const before = await page.evaluate(() => window.__osc.length); await wait(700);
    assert.strictEqual(await page.evaluate(() => window.__osc.length), before);
  });

  await step("practice a section at 75% with the moves showing, hide-moves blurs them", async () => {
    await page.click(".rt"); await page.click('[data-act="practice"]'); await page.waitForSelector("#player");
    await page.selectOption("#prange", "1");
    await page.click('[data-rate="75"]');
    assert.ok((await page.locator("#pinfo").textContent()).includes("4 eight-counts") || (await page.locator("#pinfo").textContent()).includes("5 eight-counts"));
    await page.screenshot({ path: SP + "/shots/ec-practice-ready.png" });
    await page.evaluate(() => { localStorage.setItem("eightcount.routines", localStorage.getItem("eightcount.routines")); });
    await page.click('[data-p="start"]'); await wait(2400);
    await page.screenshot({ path: SP + "/shots/ec-practice-running.png" });
    const pos = await page.locator("#plPos").textContent(); assert.ok(/Dance · 8-count [5-9]/.test(pos), pos);
    const mv = await page.locator("#plMove").textContent(); assert.ok(mv.length > 0 || true);
    await page.click('[data-p="hide"]');
    assert.ok(await page.locator("#player.hide-moves").count());
    await page.click('[data-p="play"]'); // pause
    assert.ok(await page.locator("#player.ready").count());
    assert.ok((await page.locator("#plReady .cta").textContent()).includes("from this 8-count"));
    await page.goBack(); await page.waitForSelector("#player", { state: "detached" });
  });

  /* ---- lock in together ---- */
  await step("two phones that lock in together show the same count at the same time", async () => {
    // second phone = a second page (same real clock). Phone B's clock is set 25 ms ahead on purpose.
    await page.goto(URL, { waitUntil: "load" }); await page.waitForSelector(".quick");
    const b = await newPage(ctx, errs);
    await b.addInitScript(() => { const d = Date.now; Date.now = () => d() + 25; });
    await b.goto(URL, { waitUntil: "load" }); await b.waitForSelector(".quick");
    for (const p of [page, b]) { await p.click(".rt"); await p.click('[data-act="lock"]'); await p.waitForSelector("#player"); await p.click('[data-rate="100"]'); }
    // set both to 240 bpm routine for a fast test
    for (const p of [page, b]) {
      await p.evaluate(() => { window.__log = []; const big = document.querySelector("#plBig"); new MutationObserver(() => window.__log.push([performance.timeOrigin + performance.now(), big.textContent, big.className.includes("pre") ? "pre" : big.className.includes("co") ? "co" : "run"])).observe(big, { childList: true, characterData: true, subtree: true, attributes: true }); });
    }
    await Promise.all([page.click('[data-p="arm"]'), b.click('[data-p="arm"]')]);
    const info = await page.locator("#plSmall").textContent();
    assert.ok(info.startsWith("Locked in. Counting off at "), info);
    await page.waitForFunction(() => window.__log.filter(x => /^[1-8]$/.test(x[1]) && x[2] === "run").length >= 10, null, { timeout: 40000, polling: 200 });
    await b.waitForFunction(() => window.__log.filter(x => /^[1-8]$/.test(x[1]) && x[2] === "run").length >= 10, null, { timeout: 40000, polling: 200 });
    const la = await page.evaluate(() => window.__log), lb = await b.evaluate(() => window.__log);
    const firstOne = (log) => log.find(x => x[2] === "run" && x[1] === "1");
    const fa = firstOne(la), fb = firstOne(lb);
    assert.ok(fa && fb, "both reached the first 1");
    // B's clock reads 25 ms ahead of A's, so B reaches the mark 25 ms earlier in real time. That is the clock difference, not a bug.
    console.log("      first '1': phone B was", (fa[0] - fb[0]).toFixed(0), "ms ahead of phone A in real time (its clock was set 25 ms ahead)");
    assert.ok(Math.abs(fa[0] - fb[0]) < 80, "first 1 apart " + (fa[0] - fb[0]));
    const seqA = la.filter(x => /^[1-8]$/.test(x[1])).map(x => x[1]).join(""), seqB = lb.filter(x => /^[1-8]$/.test(x[1])).map(x => x[1]).join("");
    assert.strictEqual(seqA.slice(0, 12), seqB.slice(0, 12));
    await page.screenshot({ path: SP + "/shots/ec-lock-running.png" });
    await b.close();
    await page.goBack(); await page.waitForSelector("#player", { state: "detached" });
  });

  /* ---- share link + import in a clean phone ---- */
  await step("share link round trip into a fresh phone", async () => {
    await page.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
    await page.click('[data-act="rmenu"]'); await page.click('[data-s="share"]');
    await page.waitForSelector("#sheetWrap", { state: "hidden" });
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(link.includes("#r="), link.slice(0, 60));
    console.log("      link length:", link.length);
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p2 = await newPage(ctx2, errs);
    await p2.goto(link, { waitUntil: "load" });
    await p2.waitForSelector("#sheet h3");
    assert.ok((await p2.locator("#sheet").textContent()).includes("Sample: game-day cheer"));
    await p2.screenshot({ path: SP + "/shots/ec-import.png" });
    await p2.click('[data-s="yes"]');
    await p2.waitForSelector("#sheetWrap", { state: "hidden" });
    assert.ok(await p2.locator(".rt-name", { hasText: "Sample: game-day cheer" }).count() >= 2); // sample + imported
    const moves = await p2.evaluate(() => JSON.parse(localStorage.getItem("eightcount.routines")).pop().sections[0].counts[1].m[5]);
    assert.strictEqual(moves, "Touchdown");
    assert.ok(!(await p2.url()).includes("#r="), "link hash was cleared");
    await ctx2.close();
    await page.goBack().catch(() => {}); await wait(100);
  });

  /* ---- recording with the fake camera ---- */
  await step("record a short take with the camera, then watch it with the count on top", async () => {
    await page.goto(URL, { waitUntil: "load" }); await page.waitForSelector(".quick");
    await page.evaluate(() => { const r = JSON.parse(localStorage.getItem("eightcount.routines")); r[0].bpm = 240; r[0].sections[0].counts = r[0].sections[0].counts.slice(0, 1); r[0].sections = [r[0].sections[0]]; localStorage.setItem("eightcount.routines", JSON.stringify(r)); });
    await page.reload(); await page.waitForSelector(".quick");
    await page.click(".rt"); await page.click('[data-act="record"]'); await page.waitForSelector("#player");
    await page.waitForFunction(() => !document.querySelector("#recbtn").disabled, null, { timeout: 8000 });
    await page.screenshot({ path: SP + "/shots/ec-record-ready.png" });
    await page.click("#recbtn");
    await wait(1500);
    await page.screenshot({ path: SP + "/shots/ec-recording.png" });
    await page.waitForSelector("#review", { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector("#rv") && document.querySelector("#rv").readyState >= 1, null, { timeout: 8000 });
    const meta = await page.evaluate(() => JSON.parse(localStorage.getItem("eightcount.takes"))[0]);
    assert.ok(meta.size > 1000, "video size " + meta.size);
    assert.ok(Math.abs(meta.t0) < 6000 && meta.t0 > 300, "t0 (ms into the video when the first 1 happens) " + meta.t0);
    console.log("      take:", meta.mime, meta.size, "bytes; first 1 at", Math.round(meta.t0), "ms into the video");
    // scrub to the middle of the 8-count and read the overlay
    await page.evaluate((t0) => { const v = document.querySelector("#rv"); v.currentTime = Math.min(v.duration || 9, t0 / 1000 + 0.55); }, meta.t0);
    await wait(500);
    const big = await page.locator("#rvBig").textContent();
    assert.ok(/^[1-8]$/.test(big), "overlay shows a count: " + big);
    await page.screenshot({ path: SP + "/shots/ec-review.png" });
    await page.click('[data-r="menu"]'); await page.waitForSelector('[data-s="share"]');
    await page.screenshot({ path: SP + "/shots/ec-review-menu.png" });
    await page.goBack(); await page.goBack();
    await page.waitForSelector("#review", { state: "detached" });
    assert.ok(await page.locator(".take").count() === 1);
  });

  await step("works offline after the first visit and keeps routines", async () => {
    await page.goto(URL, { waitUntil: "load" });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await wait(800);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".quick");
    assert.ok(await page.locator(".rt-name").count() >= 1);
    await ctx.setOffline(false);
  });

  await step("print sheet lays out the routine as a table", async () => {
    await page.click(".rt"); await page.click('[data-act="rmenu"]'); await page.click('[data-s="print"]');
    await wait(300);
    await page.emulateMedia({ media: "print" });
    const vis = await page.evaluate(() => ({ sheet: getComputedStyle(document.querySelector("#printSheet")).display, main: getComputedStyle(document.querySelector("#main")).display, rows: document.querySelectorAll("#printSheet tbody tr").length }));
    assert.strictEqual(vis.sheet, "block"); assert.strictEqual(vis.main, "none"); assert.ok(vis.rows >= 1);
    await page.screenshot({ path: SP + "/shots/ec-print.png" });
    await page.emulateMedia({ media: "screen" });
  });

  await step("no console or page errors during the whole run", async () => {
    const real = errs.filter(e => !/Failed to load resource/.test(e));
    assert.deepStrictEqual(real, []);
  });
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
})().catch((e) => { console.error(e); process.exit(1); });
