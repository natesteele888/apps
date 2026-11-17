package com.steele.family.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FamilyCoreTest {
    private val MON = "2026-11-09"
    private val phone = """{"v":2,"mod":5,"lists":[
        {"id":"school","name":"School days","days":[1,2,3,4,5],"items":[{"id":"teeth","name":"Brush teeth","timer":120},{"id":"bag","name":"School bag","timer":0}]},
        {"id":"weekend","name":"Weekend","days":[0,6],"items":[{"id":"w1","name":"Water bottle","timer":0}]}],
        "days":{"2026-11-06":{"c":{"teeth":1,"bag":1},"done":1,"m":100},"2026-11-05":{"c":{"teeth":1,"bag":1},"done":1,"m":90},
                "2026-11-07":{"c":{"w1":1},"done":1,"m":110},"2026-11-08":{"c":{"w1":1},"done":1,"m":120},
                "2026-11-09":{"c":{"teeth":1},"done":0,"m":500}}}"""

    @Test fun getReadyListsAndDays() {
        val s = GrCore.parse(phone)
        assertEquals(2, s.lists.size)
        assertEquals("School days", GrCore.listFor(s, MON)!!.name)
        assertEquals("Weekend", GrCore.listFor(s, "2026-11-08")!!.name)
        assertEquals(1, GrCore.count(s, MON))
        assertFalse(GrCore.complete(s, MON))
        assertEquals(4, GrCore.streak(s, MON), "an unfinished Monday doesn't break Thu, Fri and the weekend (which has its own list)")
        assertEquals(0, GrCore.streak(GrCore.parse(phone.replace("\"2026-11-08\"", "\"2026-11-01\"")), MON), "a missed Sunday (it has a list) breaks it")
        assertEquals("2 min", GrCore.timerLabel(120)); assertEquals("30 sec", GrCore.timerLabel(30))
        assertTrue(GrCore.parse("not json").empty)
    }

    @Test fun getReadyWatchTapsLayOverThePhoneCopyUntilTaken() {
        val s = GrCore.parse(phone)
        val after = GrCore.withTaps(s, listOf(GrCore.Tap(MON, "bag", true, 600)))
        assertTrue(GrCore.complete(after, MON)); assertTrue(after.days[MON]!!.done)
        assertEquals(5, GrCore.streak(after, MON))
        val old = GrCore.withTaps(s, listOf(GrCore.Tap(MON, "teeth", false, 400)))
        assertTrue(GrCore.checked(old, MON, "teeth"), "a tap older than the phone's last change to the day is already taken or overruled")
        val undo = GrCore.withTaps(s, listOf(GrCore.Tap(MON, "bag", true, 600), GrCore.Tap(MON, "bag", false, 700)))
        assertFalse(GrCore.checked(undo, MON, "bag"))
    }

    @Test fun cubeScramblesAndAverages() {
        val r = Random(7)
        val s3 = CubeCore.scramble(CubeCore.puzzle("333"), r).split(" ")
        assertEquals(20, s3.size)
        for (i in 1 until s3.size) assertTrue(s3[i][0] != s3[i - 1][0], "no face twice in a row")
        assertEquals(11, CubeCore.scramble(CubeCore.puzzle("222"), r).split(" ").size)
        assertEquals(7, CubeCore.scramble(CubeCore.puzzle("mega"), r).lines().size)
        assertEquals("3x3", CubeCore.puzzle("nope").name)
        val five = listOf(10000L, 12000L, 11000L, 30000L, 9000L).map { CubeCore.Solve(it, 0, 0) }
        assertEquals(11000L, CubeCore.avgOf(five))
        assertEquals(11000L, CubeCore.lastAvg(five, 5))
        assertNull(CubeCore.lastAvg(five, 12))
        val dnf = five.toMutableList().apply { this[3] = CubeCore.Solve(30000, -1, 0) }
        assertEquals(11000L, CubeCore.avgOf(dnf), "one DNF is the dropped worst")
        dnf[0] = CubeCore.Solve(10000, -1, 0)
        assertNull(CubeCore.avgOf(dnf), "two DNFs make a DNF average")
        assertEquals(9000L, CubeCore.best(five))
        assertEquals(14000L, CubeCore.Solve(12000, 2000, 0).eff)
        assertEquals("12.34", CubeCore.fmt(12345)); assertEquals("1:02.50", CubeCore.fmt(62500)); assertEquals("DNF", CubeCore.fmt(null))
        val ph = CubeCore.parsePhone("""{"v":1,"puz":"222","p":{"333":{"n":40,"best":15230,"ao5":19870,"ao12":null}}}""")!!
        assertEquals("222", ph.puz); assertEquals(15230L, ph.stats["333"]!!.best); assertNull(ph.stats["333"]!!.ao12)
    }

    @Test fun picksFromEspnAndTheDocument() {
        val espn = """{"season":{"year":2026,"type":2},"week":{"number":12},"events":[
          {"id":"401","date":"2026-11-22T18:00Z","competitions":[{"status":{"type":{"state":"pre","completed":false,"shortDetail":"Sun 1:00 PM"}},
           "competitors":[{"homeAway":"home","score":"0","team":{"abbreviation":"CIN","shortDisplayName":"Bengals","color":"fb4f14"}},
                          {"homeAway":"away","score":"0","team":{"abbreviation":"PIT","shortDisplayName":"Steelers","color":"000000"}}]}]},
          {"id":"400","date":"2026-11-20T01:15Z","competitions":[{"status":{"type":{"state":"post","completed":true,"shortDetail":"Final"}},
           "competitors":[{"homeAway":"home","score":"24","winner":true,"team":{"abbreviation":"BUF","shortDisplayName":"Bills","color":"00338d"}},
                          {"homeAway":"away","score":"17","winner":false,"team":{"abbreviation":"NYJ","shortDisplayName":"Jets","color":"125740"}}]}]}]}"""
        val wk = PicksCore.parseWeek(espn)!!
        assertEquals("2026-2-12", wk.key); assertEquals("Week 12", wk.label)
        assertEquals(listOf("400", "401"), wk.games.map { it.id }, "earliest first")
        val now = Instant.parse("2026-11-21T12:00:00Z")
        assertTrue(wk.games[0].locked(now)); assertFalse(wk.games[1].locked(now))
        assertEquals("BUF", wk.games[0].winner); assertEquals("PIT", wk.games[1].away.abbr)
        var picks = PicksCore.toggle(emptyMap(), "401", "CIN")
        picks = PicksCore.toggle(picks, "401", "PIT"); assertEquals("PIT", picks["401"])
        assertTrue(PicksCore.toggle(picks, "401", "PIT").isEmpty())
        assertEquals(1 to 0, PicksCore.record(wk, mapOf("400" to "BUF")))
        val body = JSONObject(PicksCore.picksDocBody("u123", wk.key, mapOf("401" to "CIN"), now))
        assertEquals("2026-2-12", body.getJSONObject("fields").getJSONObject("week").getString("stringValue"))
        assertEquals(mapOf("401" to "CIN"), PicksCore.parsePicksDoc(body.toString()))
        assertTrue(PicksCore.parsePicksDoc(null).isEmpty())
    }

    @Test fun powerDayAndTimedExercises() {
        val pp = """{"v":1,"day":12,"total":63,"week":2,"title":"Lower Body Plyo & Power","type":"Plyo & Power","time":"~10 min","rest":false,
          "sections":[{"s":"warmup","label":"Warm-up","rounds":1,"ex":[{"k":"12_warmup_0","name":"Jog in place","reps":"30 sec"}]},
                      {"s":"main","label":"Main","rounds":3,"ex":[{"k":"12_main_0","name":"Squat jumps","reps":"x6","cue":"Land soft"},{"k":"12_main_1","name":"Side plank","reps":"15 sec/side"}]}],
          "checks":{"12_warmup_0":true},"done":false,"streak":4}"""
        val d = PowerCore.parse(pp)!!
        assertEquals(3, d.steps.size); assertEquals(3, d.sections[1].rounds); assertTrue("12_warmup_0" in d.checks)
        assertEquals(30, d.steps[0].seconds); assertEquals(0, d.steps[1].seconds); assertEquals(15, d.steps[2].seconds); assertTrue(d.steps[2].perSide)
        assertEquals(60, PowerCore.secondsOf("1 min")); assertEquals("1:05", PowerCore.clock(65))
        assertNull(PowerCore.parse("{}"))
    }

    @Test fun theWatchLogKeepsNewestAndDropsOld() {
        val now = 100L * 24 * 3600 * 1000
        val old = WatchLog.entry("gr", now - 50L * 24 * 3600 * 1000, "a", mapOf("d" to MON, "i" to "bag", "on" to 1))
        val fresh = WatchLog.entry("gr", now, "b", mapOf("d" to MON, "i" to "bag", "on" to 1))
        val log = WatchLog.append(JSONArray().put(old).toString(), listOf(fresh), now)
        assertEquals(1, log.length())
        assertEquals(1, WatchLog.grTaps(log).size)
        val many = WatchLog.append(null, (1..450).map { WatchLog.entry("cc", now, "x$it", emptyMap()) }, now)
        assertEquals(WatchLog.MAX, many.length()); assertEquals("x450", many.getJSONObject(WatchLog.MAX - 1).getString("id"))
        val f = JSONObject(WatchLog.field(log, "anon1")); assertEquals("anon1", f.getString("uid")); assertEquals(1, f.getJSONArray("e").length())
        assertEquals(8, WatchLog.newCode().length); assertTrue(Regex("[a-z2-7]{8}").matches(WatchLog.newCode()))
        assertEquals("ABCD 2345", WatchLog.showCode("abcd2345"))
        assertTrue(WatchLog.validKey("abcdefghijklmnopqrstuvwxyz")); assertFalse(WatchLog.validKey("abc"))
    }
}
