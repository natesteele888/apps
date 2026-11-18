package com.steele.family.core

import com.steele.family.core.FairwayCore.Fix
import com.steele.family.core.FairwayCore.Pending
import com.steele.family.core.FairwayCore.Spot
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Random
import kotlin.math.abs
import kotlin.math.cos
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * A virtual group plays a 2-hour round with Fairway on the watch, through the watch's own code (FairwayCore): GPS that
 * wanders, a dead zone with no signal, a tournament whose rules refuse the write, shotgun and 9-hole starts, fat fingers
 * on the score keys, and a golfer who talks to Jack the way people really talk. Everyone is made up; the course is a
 * made-up straight-line layout. Prints a report (and writes it to build/fairway-crew.json) of what each golfer saw.
 *
 * What this can't prove: battery drain, Bluetooth, the real GPS chip, the speech recognizer or how loud Jack is. It
 * counts what drives those (screen time, GPS time, network calls, seconds of speech) so the real-world test knows
 * what to look at.
 */
class FairwayCrewTest {
    private val base = Spot(42.50, -71.70)
    private fun north(from: Spot, m: Double, east: Double = 0.0) =
        Spot(from.lat + m / 111320.0, from.lon + east / (111320.0 * cos(Math.toRadians(from.lat))))
    private val pars = listOf(4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4)
    private val lenYds = mapOf(3 to 165, 4 to 390, 5 to 520)
    private fun tee(n: Int) = north(base, 0.0, n * 220.0)
    private fun green(n: Int) = north(tee(n), lenYds[pars[n - 1]]!! / FairwayCore.YD)

    private fun payload(holes: Int, start: Int, shared: Boolean, marked: Boolean): String {
        val h = JSONArray()
        for (n in 1..holes) {
            val o = JSONObject().put("p", pars[n - 1]).put("y", lenYds[pars[n - 1]])
            if (marked) {
                val g = green(n)
                fun a(s: Spot) = JSONArray().put(s.lat).put(s.lon)
                o.put("f", a(north(g, -12.0))).put("c", a(g)).put("b", a(north(g, 12.0)))
            }
            h.put(o)
        }
        val bag = JSONArray()
        listOf("Driver" to 235, "3 wood" to 215, "5 iron" to 175, "6 iron" to 165, "7 iron" to 150, "8 iron" to 140,
            "9 iron" to 130, "Pitching wedge" to 120, "Gap wedge" to 105, "Sand wedge" to 90).forEach { bag.put(JSONArray().put(it.first).put(it.second)) }
        return JSONObject().put("v", 1).put("at", 1L).put("e", "abcdefghijklmnopqrst").put("sh", shared).put("r", 1)
            .put("p", "pl0001ab").put("pn", "Test Golfer").put("nm", "Crew Cup").put("ck", "n:crew course").put("cn", "Crew Course")
            .put("st", start).put("h", h).put("s", JSONObject()).put("bag", bag).toString()
    }

    data class Golfer(
        val name: String, val holes: Int = 18, val start: Int = 1, val shared: Boolean = true, val marked: Boolean = true,
        val sigma: Double = 3.0, val acc: Double = 5.0, val spikes: Double = 0.0, val dead: Set<Int> = emptySet(),
        val refused: Boolean = false, val fatFinger: Boolean = false, val talker: Boolean = false, val seed: Long = 1,
        val networkFixes: Double = 0.0, val misheard: Boolean = false,
    )

    private val crew = listOf(
        Golfer("Steady Eddie, open fairways", seed = 11),
        Golfer("Tree line, GPS under the canopy", sigma = 9.0, acc = 16.0, spikes = 0.12, seed = 12),
        Golfer("Dead zone on holes 7 to 12", dead = (7..12).toSet(), fatFinger = true, seed = 13),
        Golfer("Shotgun start on 10", start = 10, seed = 14),
        Golfer("Fat fingers on every score", fatFinger = true, seed = 15),
        Golfer("Talks to Jack all round", talker = true, seed = 16),
        Golfer("Nine and done", holes = 9, shared = false, seed = 17),
        Golfer("Rules not switched on for the tournament", refused = true, seed = 18),
        Golfer("Kept on the phone only, no signal back nine", shared = false, dead = (10..18).toSet(), seed = 19),
        Golfer("New course, no greens marked", marked = false, talker = true, seed = 20),
        // round two
        Golfer("Signal comes and goes every hole", dead = (1..18).filter { it % 2 == 1 }.toSet(), fatFinger = true, seed = 21),
        Golfer("Rough network fixes mixed into the GPS", networkFixes = 0.35, seed = 22),
        Golfer("Talks to Jack, the watch mishears", talker = true, misheard = true, seed = 23),
        Golfer("Rules refused, dead zone too", refused = true, dead = (4..8).toSet(), fatFinger = true, seed = 24),
    )

    // what golfers really say (the speech recognizer's words, not the chips)
    private val said = listOf(
        "hey jack how far", "how far to the pin", "what's the yardage", "yardage", "how many yards do I have", "what's the number",
        "give me a number", "how far to the flag", "distance to the back", "how far to the front", "what club", "what should I hit",
        "what do I hit here", "what club should I use", "how am I doing", "what's my score", "where am I at", "where do I stand",
        "any notes", "what's the trouble on this hole", "anything I should know", "remember the green breaks left",
        "make a note bunker short right", "note that it plays into the wind", "what hole is this", "what par is this",
        "Jack what's the play here", "how far to carry the bunker",
    )

    class Report(val golfer: String) {
        var screenS = 0; var gpsS = 0; var linkChecks = 0; var writes = 0; var taps = 0; var speechS = 0.0
        var rawJitter = ArrayList<Int>(); var steadyJitter = ArrayList<Int>(); var steadyErr = ArrayList<Int>(); var rawErr = ArrayList<Int>(); var calmErr = ArrayList<Int>(); var warned = 0; var fixes = 0
        var asked = 0; var missed = ArrayList<String>(); var longest = ""; var notes = 0
        var lost = 0; var toPhone = 0; var mismatch = ArrayList<String>()
        fun json() = JSONObject().put("golfer", golfer).put("screenMin", screenS / 60.0).put("gpsMin", gpsS / 60.0)
            .put("linkChecks", linkChecks).put("scoreTaps", taps).put("scoreWrites", writes).put("speechSec", speechS)
            .put("rawJitterMax", rawJitter.maxOrNull() ?: 0).put("steadyJitterMax", steadyJitter.maxOrNull() ?: 0)
            .put("rawJitterMedian", med(rawJitter)).put("steadyJitterMedian", med(steadyJitter))
            .put("rawErrMax", rawErr.maxOrNull() ?: 0).put("steadyErrMax", steadyErr.maxOrNull() ?: 0)
            .put("errMaxWhenNoWarning", calmErr.maxOrNull() ?: 0).put("fixesWithGpsWarning", if (fixes == 0) 0.0 else warned.toDouble() / fixes)
            .put("jackAsked", asked).put("jackMissed", JSONArray(missed.distinct())).put("jackLongest", longest)
            .put("lostScores", lost).put("scoresSentToPhone", toPhone).put("mismatch", JSONArray(mismatch))
        private fun med(l: List<Int>) = if (l.isEmpty()) 0 else l.sorted()[l.size / 2]
    }

    private fun play(g: Golfer): Report {
        val rep = Report(g.name); val rnd = Random(g.seed)
        val round = FairwayCore.parse(payload(g.holes, g.start, g.shared, g.marked))!!
        val mine = HashMap<Int, Int>()               // FwStore's overlay
        var queue = listOf<Pending>()                // FwStore's queue (shared only)
        val server = HashMap<Int, Int>()             // the tournament in Firestore
        val phone = HashMap<Int, Int>()              // what the phone takes from the watch log
        val notes = HashMap<Int, MutableList<String>>()
        var clock = 0L
        fun online(h: Int) = h !in g.dead
        fun flush(h: Int) {
            if (!g.shared || queue.isEmpty()) return
            val f = FairwayCore.flush(queue, clock) { path, body ->
                if (!online(h)) null else if (g.refused) 403 else {
                    rep.writes++
                    val hole = Regex("s\\.%60\\d+_(\\d+)%60").find(path)!!.groupValues[1].toInt()
                    val v = Regex("\"(\\d+_\\d+)\":\\{\"integerValue\":\"(\\d+)\"").find(body)?.groupValues?.get(2)?.toInt()
                    if (v == null) server.remove(hole) else server[hole] = v
                    200
                }
            }
            val gone = f.sent.toMutableList()
            queue = queue.filter { p -> val i = gone.indexOf(p); if (i >= 0) { gone.removeAt(i); false } else true }
            f.toPhone.forEach { p -> rep.toPhone++; if (p.s in 1..20) phone[p.h] = p.s else phone.remove(p.h) }
        }
        fun setScore(h: Int, s: Int?) {
            rep.taps++; mine[h] = s ?: 0
            if (g.shared) queue = FairwayCore.collapse(queue + Pending(round.code, round.pid, 1, h, s ?: 0))
            else if (online(h)) { if (s == null) phone.remove(h) else phone[h] = s } // the log goes up with the next sync
            else pendingLog += h to (s ?: 0)
        }
        val steady = FairwayCore.Steady()
        fun look(h: Int, at: Spot, page: Int, secs: Int) {
            rep.screenS += secs; rep.linkChecks += 1 + secs / 20; clock += secs * 1000L
            flush(h)
            if (!g.shared && online(h) && pendingLog.isNotEmpty()) { pendingLog.forEach { (hh, s) -> if (s == 0) phone.remove(hh) else phone[hh] = s }; pendingLog.clear() }
            if (page == 1) return
            rep.gpsS += secs
            steady.reset()
            val hole = round.hole(h)!!
            val truth = FairwayCore.greenYards(hole, at)?.mid
            val raw = ArrayList<Int>(); val st = ArrayList<Int>(); var best = 999.0
            for (i in 0 until secs / 2) {
                val spike = rnd.nextDouble() < g.spikes
                val net = rnd.nextDouble() < g.networkFixes // the phone-network fix: rough, and it says so
                val e = if (spike) 40.0 else 0.0
                val sd = if (net) 25.0 else g.sigma
                val fixAt = north(at, rnd.nextGaussian() * sd + e, rnd.nextGaussian() * sd)
                val acc = if (spike) 30.0 else if (net) 40.0 else g.acc
                val sm = steady.add(Fix(fixAt.lat, fixAt.lon, acc, clock + i * 2000L))
                FairwayCore.greenYards(hole, fixAt)?.mid?.let { raw += it }
                FairwayCore.greenYards(hole, sm)?.mid?.let { y ->
                    st += y
                    // the yards page shows "GPS ±n yds" while its best fix is worse than 15 m: judge what it shows without that
                    best = minOf(best, acc); rep.fixes++
                    if (best > 15) rep.warned++ else if (i > 0 && truth != null) rep.calmErr += abs(y - truth)
                }
            }
            if (truth != null && raw.size > 1) {
                // the first fix of a look has nothing to average with; judge what the golfer reads once it's up
                rep.rawJitter += raw.drop(1).max() - raw.drop(1).min(); rep.steadyJitter += st.drop(1).max() - st.drop(1).min()
                rep.rawErr += raw.drop(1).maxOf { abs(it - truth) }; rep.steadyErr += st.drop(1).maxOf { abs(it - truth) }
            }
        }
        for (h in round.order) {
            val hole = round.hole(h)!!
            val stops = mutableListOf(tee(h))
            if (hole.par >= 4) stops += north(tee(h), 230.0, rnd.nextGaussian() * 8)
            if (hole.par == 5) stops += north(tee(h), 400.0, rnd.nextGaussian() * 8)
            stops.forEachIndexed { i, at ->
                look(h, at, 0, if (i == 0) 8 else 12)
                if (g.talker) repeat(2) {
                    look(h, at, 2, 6)
                    val q0 = said[rnd.nextInt(said.size)]
                    // what a recognizer does on a windy tee: drops the "hey", hears "jack" as "jacks", swaps a word
                    val q = if (!g.misheard) q0 else q0.replace("hey jack", "a jack").replace("yards", "yard").replace("how far", "how far is")
                        .replace("what club", "what clubs").replace("score", "scores").let { if (rnd.nextBoolean()) "jacks $it" else it }
                    val r2 = round.copy(holes = round.holes.map { x -> x.copy(notes = notes[x.n] ?: x.notes) })
                    val hh = r2.hole(h)!!
                    val a = FairwayCore.jack(q, r2, hh, FairwayCore.greenYards(hh, at), FairwayCore.merged(r2, mine))
                    rep.asked++
                    if (a.text.startsWith("I do yards")) rep.missed += q
                    a.note?.let { notes.getOrPut(h) { mutableListOf() } += it; rep.notes++ }
                    if (a.text.length > rep.longest.length) rep.longest = a.text
                    rep.speechS += a.text.split(" ").size / 2.6
                }
                clock += 150_000
            }
            // on the green: the score page, no GPS
            val strokes = (hole.par + listOf(-1, 0, 0, 0, 1, 1, 2)[rnd.nextInt(7)]).coerceAtLeast(1)
            look(h, green(h), 1, 6)
            var v: Int? = null
            fun tap(to: Int) { v = to; setScore(h, to) }
            tap(hole.par)
            if (g.fatFinger) { tap(v!! + 1); tap(v!! - 1) ; if (rnd.nextBoolean()) { setScore(h, null); tap(hole.par) } }
            while (v!! < strokes) tap(v!! + 1)
            while (v!! > strokes) tap(v!! - 1)
            clock += 4_000; flush(h) // 4 seconds after the last tap
            truth[h] = strokes
            clock += 60_000
        }
        // walking off 18 (or 9): signal at the clubhouse, the watch checks once more
        val last = -1
        look(last, base, 1, 6)
        if (!g.shared && pendingLog.isNotEmpty()) { pendingLog.forEach { (hh, s) -> if (s == 0) phone.remove(hh) else phone[hh] = s }; pendingLog.clear() }
        // what everyone ends up seeing
        val board = if (g.shared && !g.refused) server else phone
        val watch = FairwayCore.merged(round, mine)
        for (h in round.order) {
            if (watch[h] != truth[h]) rep.mismatch += "watch shows ${watch[h]} on $h, played ${truth[h]}"
            if (board[h] != truth[h]) { rep.lost++; rep.mismatch += "${if (g.shared && !g.refused) "leaderboard" else "phone"} has ${board[h]} on $h, played ${truth[h]}" }
        }
        if (g.shared) assertEquals(0, queue.size, "${g.name}: nothing left waiting on the watch")
        truth.clear()
        return rep
    }
    private val truth = HashMap<Int, Int>()
    private val pendingLog = ArrayList<Pair<Int, Int>>()

    @Test fun aVirtualGroupPlaysTwoHours() {
        val reports = crew.map { pendingLog.clear(); play(it) }
        val out = JSONArray(); reports.forEach { out.put(it.json()) }
        File("build").mkdirs(); File("build/fairway-crew.json").writeText(out.toString(2))
        println("FAIRWAY-CREW-BEGIN"); println(out.toString(2)); println("FAIRWAY-CREW-END")
        reports.forEach { r ->
            assertEquals(0, r.lost, "${r.golfer}: every score reaches the leaderboard or the phone (${r.mismatch})")
            assertTrue(r.mismatch.isEmpty(), "${r.golfer}: ${r.mismatch}")
        }
        val calm = reports.first()
        assertTrue(calm.json().getInt("steadyJitterMedian") <= 2, "standing still in the open, yards hold within 2 most looks")
        assertTrue((calm.steadyJitter.maxOrNull() ?: 0) < (calm.rawJitter.maxOrNull() ?: 0), "and the worst look is steadier than raw GPS")
        val trees = reports[1]
        assertTrue(trees.json().getInt("steadyJitterMedian") * 3 <= trees.json().getInt("rawJitterMedian"), "under trees, a third of the jumping or less")
        assertTrue((trees.steadyErr.maxOrNull() ?: 0) < (trees.rawErr.maxOrNull() ?: 0), "under trees, the steadied yards are closer than raw")
        reports.forEach { assertTrue(it.writes <= it.taps && it.writes <= 2 * 18, "${it.golfer}: about one write a hole, not one a tap (${it.writes} for ${it.taps} taps)") }
        reports.filter { it.golfer.startsWith("Talks") }.forEach { t ->
            assertTrue(t.missed.isEmpty(), "${t.golfer}: Jack understood everything (missed: ${t.missed.distinct()})")
        }
        val net = reports.first { it.golfer.startsWith("Rough network") }
        assertTrue((net.calmErr.maxOrNull() ?: 0) <= 10, "rough network fixes don't drag the yards off once there's no warning (worst ${net.calmErr.maxOrNull()})")
        assertTrue((calm.calmErr.maxOrNull() ?: 0) <= 10, "in the open, the yards you read are within 10")
        reports.forEach { assertTrue(it.longest.split(" ").size <= 16, "${it.golfer}: Jack's longest answer is short enough to hear in one go: ${it.longest}") }
        val dead = reports[2]
        assertTrue(dead.writes <= dead.taps, "taps out of signal collapse into fewer writes")
    }

    @Test fun walkingUpToTheBallTheYardsCatchUp() {
        val rnd = Random(5); val st = FairwayCore.Steady(); var t = 0L
        var at = base; var worstWalking = 0.0
        repeat(30) { // 60 seconds of walking at 1.4 m/s, a fix every 2 seconds
            at = north(at, 2.8); t += 2000
            val fx = north(at, rnd.nextGaussian() * 3, rnd.nextGaussian() * 3)
            worstWalking = maxOf(worstWalking, FairwayCore.metres(st.add(Fix(fx.lat, fx.lon, 5.0, t)), at))
        }
        var settled = -1
        for (i in 1..10) { // then standing at the ball
            t += 2000
            val fx = north(at, rnd.nextGaussian() * 3, rnd.nextGaussian() * 3)
            val d = FairwayCore.metres(st.add(Fix(fx.lat, fx.lon, 5.0, t)), at)
            if (settled < 0 && d < 4.0) settled = i * 2
        }
        println("FAIRWAY-WALK worst lag walking ${"%.1f".format(worstWalking)} m, within 4 m of the ball after $settled s")
        assertTrue(worstWalking < 16.0, "walking, the yards trail you by less than about 17 yards")
        assertTrue(settled in 1..6, "stopped at the ball, the yards are right within 6 seconds (took $settled)")
    }
}
