package com.steele.family.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertFalse

class StatsCoreTest {
    // made-up numbers, no real player
    private val phone = """{"v":1,"at":7,"s":[
        {"y":2025,"lv":"Minors","b":{"g":14,"pa":45,"ab":38,"h":12,"r":10,"rbi":8,"bb":6,"so":9,"hbp":1,"sb":9,"cs":2,"2b":3,"3b":0,"hr":0,"tb":15},
                                 "p":{"g":5,"gs":2,"ip":9.667,"so":11,"bb":9,"h":8,"er":5,"w":1,"l":1,"pc":190}},
        {"y":2026,"lv":"Majors","b":{"g":16,"pa":52,"ab":44,"h":16,"r":12,"rbi":11,"bb":7,"so":8,"hbp":1,"sb":7,"cs":1,"2b":4,"3b":1,"hr":1},
                                 "p":{"g":7,"gs":4,"ip":17.333,"so":24,"bb":6,"h":15,"er":11,"w":3,"l":2,"pc":310}},
        {"y":1890,"b":{}},
        "junk"]}"""

    @Test fun parses_newest_first() {
        val s = assertNotNull(StatsCore.parse(phone))
        assertEquals(7L, s.at)
        assertEquals(listOf(2026, 2025), s.seasons.map { it.year })
        assertEquals("2026 · Majors", s.seasons[0].label)
        assertEquals(52, s.seasons[0].pit.outs)
        assertEquals("17.1", StatsCore.ip(s.seasons[0].pit.outs))
        assertEquals("9.2", StatsCore.ip(s.seasons[1].pit.outs))
        assertNull(StatsCore.parse("not json"))
        assertNull(StatsCore.parse(null))
    }

    @Test fun rates() {
        val s = StatsCore.parse(phone)!!.seasons[0]
        assertEquals(".364", StatsCore.rate(s.bat.avg))
        // no tb sent: 16 hits + 4 doubles + 2 for the triple + 3 for the homer = 25
        assertEquals(25, s.bat.bases)
        assertEquals(".462", StatsCore.rate(s.bat.obp))      // 24 / 52
        assertEquals("1.030", StatsCore.rate(s.bat.ops))     // .4615 + .5682
        assertEquals("5.71", StatsCore.era(s.pit.era))       // 11 ER in 17⅓
        assertEquals("1.21", StatsCore.era(s.pit.whip))      // 21 / 17⅓
        assertEquals("—", StatsCore.rate(null))
    }

    @Test fun career_adds_up() {
        val c = StatsCore.parse(phone)!!.career
        assertEquals(28, c.bat.h)
        assertEquals(82, c.bat.ab)
        assertEquals(40, c.bat.bases)
        assertEquals(81, c.pit.outs)
        assertEquals(".341", StatsCore.rate(c.bat.avg))
    }

    @Test fun bests() {
        val b = StatsCore.bests(StatsCore.parse(phone)!!.seasons).associateBy { it.what }
        assertEquals(".364", b["AVG"]!!.shown); assertEquals(2026, b["AVG"]!!.year); assertTrue(b["AVG"]!!.latest)
        assertEquals("9", b["Stolen bases"]!!.shown); assertEquals(2025, b["Stolen bases"]!!.year); assertFalse(b["Stolen bases"]!!.latest)
        assertEquals("1", b["Home runs"]!!.shown)
        assertEquals("24", b["Strikeouts pitching"]!!.shown)
        // ERA: lowest wins (2025: 5 ER in 9⅔ = 4.66)
        assertEquals("4.66", b["ERA"]!!.shown); assertEquals(2025, b["ERA"]!!.year)
        assertEquals("17.1", b["Innings"]!!.shown)
        assertTrue(StatsCore.newBestsLine(b.values.toList()).endsWith("personal bests in 2026"))
    }

    @Test fun small_samples_dont_count_for_rates() {
        val s = StatsCore.parse("""{"s":[{"y":2024,"b":{"ab":3,"h":3},"p":{"ip":1,"er":0,"so":2}}]}""")!!.seasons
        val b = StatsCore.bests(s).map { it.what }
        assertFalse("AVG" in b); assertFalse("ERA" in b)
        assertTrue("Hits" in b); assertTrue("Strikeouts pitching" in b)
        assertEquals("", StatsCore.newBestsLine(emptyList()))
    }

    @Test fun ties_go_to_the_newer_season() {
        val s = StatsCore.parse("""{"s":[{"y":2024,"b":{"ab":20,"hr":2}},{"y":2026,"b":{"ab":20,"hr":2}}]}""")!!.seasons
        assertEquals(2026, StatsCore.bests(s).first { it.what == "Home runs" }.year)
    }
}
