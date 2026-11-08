const { chromium } = require("playwright");
const SP = require("path").resolve(__dirname, "..");
(async () => {
  const b = await chromium.launch({ executablePath: require("./lib.cjs").CHROME });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  for (const [id, words] of [["playboard", ["Play Board", "Draw it", "Watch it move", "Share a play"]], ["locker", ["Locker", "Daily reps", "Game log", "Arm care"]]]) {
    await page.goto("https://natesteele888.github.io/apps/store/#app=" + id, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const t = await page.evaluate(() => document.body.innerText);
    console.log(id, words.map(w => w + "=" + t.includes(w)).join(" "));
    await page.screenshot({ path: SP + "/shots/storelive-" + id + ".png" });
  }
  console.log("page errors:", JSON.stringify(errs)); await b.close();
})();
