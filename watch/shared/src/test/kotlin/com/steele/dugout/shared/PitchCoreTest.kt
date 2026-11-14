package com.steele.dugout.shared

import org.json.JSONObject
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The same checks as tests/walkup-pitch.test.cjs, so the watch and the phone count alike. Placeholder names only. */
class PitchCoreTest {
    init { PitchCore.tz = ZoneId.of("America/Los_Angeles") }
    private val now = 1_776_268_800_000L // 2026-04-15, mid-morning in California
    private val day = PitchCore.ymd(now)

    private fun base(): PitchLog = PitchLog(pitchers = listOf(Pitcher("pAAAA1", "Pitcher A"), Pitcher("pBBBB2", "Pitcher B", limit = 30)))

    @Test fun zonesUndoAndLimits() {
        var log = PitchCore.setCurrent(base(), "pAAAA1", "Pitcher A", now)
        repeat(74) { log = PitchCore.addPitch(log, "pAAAA1", now + it + 1) }
        var r = PitchCore.bullpen(log, day, emptyMap())[0]
        assertEquals(11, r.left); assertEquals(Zone.GREEN, r.zone)
        log = PitchCore.addPitch(log, "pAAAA1", now + 100)
        assertEquals(Zone.YELLOW, PitchCore.bullpen(log, day, emptyMap())[0].zone)
        repeat(5) { log = PitchCore.addPitch(log, "pAAAA1", now + 200 + it) }
        r = PitchCore.bullpen(log, day, emptyMap())[0]
        assertEquals(5, r.left); assertEquals(Zone.RED, r.zone)
        repeat(5) { log = PitchCore.addPitch(log, "pAAAA1", now + 300 + it) }
        assertEquals(Zone.LIMIT, PitchCore.bullpen(log, day, emptyMap())[0].zone)
        log = PitchCore.undo(log, "pAAAA1", day, now + 400)!!
        assertEquals(84, PitchCore.counts(log, day)["pAAAA1"])
        assertEquals(30, PitchCore.limitFor(log, "pBBBB2"))
        assertEquals(25, PitchCore.limitFor(log.copy(max = 25), "pBBBB2"))
        assertEquals(0, PitchCore.limitFor(log.copy(division = "None"), "pAAAA1"))
        assertEquals("pAAAA1", PitchCore.current(log, day)?.first)
    }

    @Test fun mergeCountsEveryPitchOnce() {
        var phone = PitchCore.addPitch(base(), "pAAAA1", now)
        var watch = phone
        watch = PitchCore.addPitch(watch, "pAAAA1", now + 1)
        watch = PitchCore.addPitch(watch, "pAAAA1", now + 2)
        phone = PitchCore.addPitch(phone, "pAAAA1", now + 3)
        val a = PitchCore.merge(phone, watch, null)
        assertEquals(4, PitchCore.counts(a.log, day)["pAAAA1"]); assertEquals(2, a.added)
        val b = PitchCore.merge(a.log, watch, null)
        assertEquals(0, b.added); assertEquals(false, b.changed)
        var c = PitchCore.merge(watch, a.log, null).log
        c = PitchCore.undo(c, "pAAAA1", day, now + 10)!!
        assertEquals(3, PitchCore.counts(PitchCore.merge(a.log, c, null).log, day)["pAAAA1"])
    }

    @Test fun readsTheWebPagesLogAndRoundTrips() {
        val js = """{"v":1,"division":"Minors","max":0,"setupAt":5,"pitchers":[{"id":"pAAAA1","name":"Pitcher A","limit":0,"club":false},{"id":"bad id","name":""}],
            "events":[{"i":"eaaaa1","k":"s","p":"pAAAA1","n":"Pitcher A","t":$now},{"i":"eaaaa2","k":"p","p":"pAAAA1","t":${now + 1}},
            {"i":"eaaaa2","k":"p","p":"pAAAA1","t":${now + 1}},{"i":"x","k":"p","p":"pAAAA1","t":1},{"i":"eaaaa3","k":"zz","t":5}],"elig":{"pBBBB2":"2026-04-17"}}"""
        val log = PitchCore.parse(js)
        assertEquals("Minors", log.division); assertEquals(1, log.pitchers.size); assertEquals(2, log.events.size)
        assertEquals(75, PitchCore.limitFor(log, "pAAAA1"))
        assertEquals(log, PitchCore.parse(PitchCore.toJson(log).toString()))
        assertEquals(PitchLog(), PitchCore.parse("not json"))
        assertTrue(JSONObject(PitchCore.toJson(log).toString()).has("events"))
    }

    @Test fun restDaysAndSetupFromTheNewerSide() {
        assertEquals(RestStep(21, 1), PitchCore.nextRestStep(18, "Majors"))
        assertNull(PitchCore.nextRestStep(70, "Majors"))
        assertEquals(2, PitchCore.restDaysFor(50, "Majors"))
        val rows = PitchCore.bullpen(base(), day, mapOf("pBBBB2" to PitchCore.addDays(day, 2), "pAAAA1" to day))
        assertEquals(true, rows[0].eligible); assertEquals(false, rows[1].eligible); assertNotNull(rows[1].eligibleOn)
        val newer = base().copy(division = "Seniors", setupAt = 10)
        val m = PitchCore.merge(base(), newer, null)
        assertEquals("Seniors", m.log.division); assertTrue(m.changed)
        assertEquals("Seniors", PitchCore.merge(newer, base(), null).log.division) // the older side does not win
        val old = PitchCore.addPitch(base(), "pAAAA1", now - 5L * 86_400_000)
        assertEquals(0, PitchCore.trimOld(old, day).events.size)
        assertEquals(0, PitchCore.merge(base(), old, PitchCore.cutoff(day)).added)
    }

    @Test fun readsThePhonesState() {
        val s = Proto.parseState("""{"ready":true,"batter":1,"lineup":[{"id":"r1","name":"Player One","num":"7","ready":true,"code":"ready"},{"id":"r2","name":"Player Two","num":"","ready":false,"code":"needs-song"}],
            "playing":null,"loading":null,"error":null,"speaker":{"on":true,"name":"Speaker"}}""", 9)!!
        assertEquals(1, s.batter); assertEquals(2, s.lineup.size); assertNull(s.playing); assertNull(s.loading); assertEquals(false, s.busy)
        assertTrue(s.speakerOn)
        assertEquals(0, Proto.parseState("""{"batter":5,"lineup":[]}""", 0)!!.batter)
        assertNull(Proto.parseState("nope", 0))
    }
}
