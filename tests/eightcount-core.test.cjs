// node eightcount-core.test.cjs   (runs the pure timing core: no browser needed)
const assert = require("assert");
const EC = require("../apps/eightcount/core.js");
let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n   ", e.message); process.exitCode = 1; } };
const ta = async (name, fn) => { try { await fn(); n++; console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n   ", e.message); process.exitCode = 1; } };

t("count-off is 5,6,7,8 then 1 at position 0 (120 bpm = 0.5 s a beat)", () => {
  const at = (p) => EC.beatAt(p, 120, 4);
  assert.deepStrictEqual([at(-2.0), at(-1.6), at(-1.0), at(-0.4)].map(x => x.label), [5, 5, 7, 8]);
  assert.strictEqual(at(-2.0).state, "countoff");
  assert.strictEqual(at(-2.01).state, "pre");
  const first = at(0); assert.strictEqual(first.state, "run"); assert.strictEqual(first.b, 0); assert.strictEqual(first.g, 0);
  assert.strictEqual(at(-0.0001).label, 8);
});
t("beats roll over to the next 8-count and the end is detected", () => {
  const a = EC.beatAt(3.99, 120, 4); assert.deepStrictEqual([a.g, a.b, a.sub], [0, 7, 1]);
  const b = EC.beatAt(4.0, 120, 4); assert.deepStrictEqual([b.g, b.b, b.sub], [1, 0, 0]);
  const last = EC.beatAt(4 * 8 * 0.5 - 0.01, 120, 4); assert.deepStrictEqual([last.g, last.b], [3, 7]);
  assert.strictEqual(EC.beatAt(16.0, 120, 4).state, "done");
  assert.strictEqual(EC.beatAt(5000, 120, Infinity).state, "run"); // free counter never ends
});
t("the half beat (&) shows in the second half of each beat", () => {
  assert.strictEqual(EC.beatAt(0.24, 120, 1).sub, 0);
  assert.strictEqual(EC.beatAt(0.26, 120, 1).sub, 1);
});
t("slower practice speed stretches real time (position follows the rate)", () => {
  // start at ms 10000, rate 0.5: after 2 real seconds only 1 timeline second has passed
  assert.strictEqual(EC.posSec(12000, 10000, 0.5), 1);
  assert.strictEqual(EC.beatMs(8, 10000, 120, 0.5), 10000 + 8 * 60000 / 60);
  assert.strictEqual(EC.countoffMs(120, 1), 2000);
  assert.strictEqual(EC.countoffMs(120, 0.5), 4000);
});
t("two phones that tap in the same window agree on the same start mark", () => {
  const cycle = 10000, lead = 2000;
  const base = Date.UTC(2026, 10, 7, 19, 5, 0); // :00.000
  const a = EC.nextMark(base + 3100, cycle, lead), b = EC.nextMark(base + 6400, cycle, lead);
  assert.strictEqual(a, base + 10000); assert.strictEqual(b, base + 10000);
  assert.ok(a - (base + 3100) >= lead && b - (base + 6400) >= lead);
  // tapped less than the lead before a mark -> next mark (never a start in the past)
  assert.strictEqual(EC.nextMark(base + 9000, cycle, lead), base + 20000);
});
t("typing a clock time picks the next time the wall clock reads that", () => {
  const now = new Date(2026, 10, 7, 19, 5, 10, 0).getTime();
  assert.strictEqual(EC.nextClock(now, 19, 5, 30), new Date(2026, 10, 7, 19, 5, 30).getTime());
  assert.strictEqual(EC.nextClock(now, 19, 5, 0), new Date(2026, 10, 8, 19, 5, 0).getTime()); // already passed -> tomorrow
  assert.ok(/^7:05:30\.0 PM$/.test(EC.fmtClock(new Date(2026, 10, 7, 19, 5, 30, 40).getTime(), true)));
});
t("song starts at the right place for different intros", () => {
  // song's first "1" is 10 s in: count-off (2 s at 120) plays over the song, song starts 2 s before the "1"
  assert.deepStrictEqual(EC.audioPlan(10, 120, 1), { startPos: -2, songStart: 8 });
  // song's first "1" is 0.5 s in: song starts at the top, 0.5 s before the "1"
  assert.deepStrictEqual(EC.audioPlan(0.5, 120, 1), { startPos: -0.5, songStart: 0 });
  assert.deepStrictEqual(EC.audioPlan(0, 120, 1), { startPos: -0, songStart: 0 });
});
t("drift correction is gentle and capped at 3%", () => {
  assert.strictEqual(EC.driftRate(0.005, 1), 1);
  assert.ok(Math.abs(EC.driftRate(0.1, 1) - 1.03) < 1e-9);
  assert.ok(Math.abs(EC.driftRate(-0.1, 0.75) - 0.75 * 0.97) < 1e-9);
  assert.ok(EC.driftRate(0.02, 1) > 1 && EC.driftRate(0.02, 1) < 1.03);
});
t("sanitize cleans junk, caps sizes and always makes a usable routine", () => {
  assert.strictEqual(EC.sanitizeRoutine(null), null);
  const r = EC.sanitizeRoutine({ name: "<b>x</b>".repeat(30), bpm: 9999, sections: [{ name: 5, counts: [{ m: ["a", 2, null, "x".repeat(500)], n: "n".repeat(500) }] }, 7], music: { name: "Song", offset: -5 } });
  assert.strictEqual(r.bpm, 240); assert.ok(r.name.length <= 60);
  assert.strictEqual(r.sections.length, 1); assert.strictEqual(r.sections[0].counts[0].m.length, 8);
  assert.ok(r.sections[0].counts[0].m[3].length <= 40); assert.ok(r.sections[0].counts[0].n.length <= 120);
  assert.strictEqual(r.music.offset, 0);
  const empty = EC.sanitizeRoutine({}); assert.strictEqual(empty.sections.length, 1);
  const big = EC.sanitizeRoutine({ sections: new Array(500).fill({ counts: new Array(500).fill({ m: [] }) }) });
  assert.ok(big.sections.length <= 40 && big.sections[0].counts.length <= 64);
});
t("flatten numbers every 8-count across sections", () => {
  const r = EC.newRoutine("x"); r.sections.push(EC.newSection("B", 2));
  const f = EC.flatten(r); assert.strictEqual(f.length, 6); assert.strictEqual(f[5].g, 5); assert.strictEqual(f[4].secName, "B");
  assert.strictEqual(EC.totalCounts(r), 6);
});
(async () => {
  await ta("a routine survives the share link round trip, with and without compression", async () => {
    const r = EC.newRoutine("Game day"); r.bpm = 132;
    r.sections[0].counts[0].m[0] = "High V"; r.sections[0].counts[0].m[4] = "Touchdown & clap"; r.sections[0].counts[1].n = "Lines";
    r.music = { name: "Mix", offset: 3.25 };
    const link = await EC.encodeRoutine(r);
    assert.ok(link[0] === "1"); assert.ok(/^[A-Za-z0-9_-]+$/.test(link));
    const back = await EC.decodeRoutine(link);
    assert.strictEqual(back.name, "Game day"); assert.strictEqual(back.bpm, 132);
    assert.strictEqual(back.sections[0].counts[0].m[4], "Touchdown & clap"); assert.strictEqual(back.sections[0].counts[1].n, "Lines");
    assert.deepStrictEqual(back.music, { name: "Mix", offset: 3.25, hasFile: false });
    assert.notStrictEqual(back.id, r.id);
    const plain = "0" + link.slice(1) ; // wrong marker on compressed bytes must not crash the page
    await assert.rejects(() => EC.decodeRoutine(plain));
    await assert.rejects(() => EC.decodeRoutine("1!!!"));
    await assert.rejects(() => EC.decodeRoutine("9abc"));
    await assert.rejects(() => EC.decodeRoutine(""));
    // a 32-count routine stays link-sized
    const big = EC.newRoutine("Big"); big.sections = [EC.newSection("A", 16), EC.newSection("B", 16)];
    big.sections.forEach(s => s.counts.forEach((c, i) => c.m = c.m.map((_, b) => ["Clasp", "High V", "Low V", "Touchdown"][(i + b) % 4])));
    const bl = await EC.encodeRoutine(big);
    console.log("      32 eight-counts, filled in, link length:", bl.length);
    assert.ok(bl.length < 2000);
  });
  console.log("\n" + n + " passed");
})();
