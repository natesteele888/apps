// node live-smoke.cjs <app> <expectedTitleText>   against https://natesteele888.github.io/apps/<app>/
const { chromium } = require("playwright");
const app = process.argv[2], want = process.argv[3];
(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = [], failed = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("pageerror " + e.message));
  page.on("requestfailed", r => failed.push(r.url()));
  const url = `https://natesteele888.github.io/apps/${app}/`;
  await page.goto(url, { waitUntil: "networkidle" });
  const text = await page.evaluate(() => document.body.innerText);
  console.log("title:", await page.title(), "| shows expected text:", text.includes(want));
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  console.log("service worker active:", sw);
  const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const j = await (await fetch(l.href)).json(); const ics = await Promise.all(j.icons.map(async i => (await fetch(new URL(i.src, l.href))).status)); return { name: j.short_name, icons: ics }; });
  console.log("manifest:", JSON.stringify(man));
  const hasInstall = await page.evaluate(() => !!window.__nateInstall);
  console.log("shared install pop-up script loaded:", hasInstall);
  await new Promise(r => setTimeout(r, 1500));
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" });
  console.log("offline reload shows app:", (await page.evaluate(() => document.body.innerText)).includes(want));
  console.log("console errors:", JSON.stringify(errs.filter(e => !/Failed to load resource/.test(e))), "| failed requests:", JSON.stringify(failed.filter(u => !/fonts/.test(u))));
  await browser.close();
})();
