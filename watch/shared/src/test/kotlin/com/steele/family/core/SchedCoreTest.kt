package com.steele.family.core

import com.steele.dugout.shared.Gc
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertFalse

class SchedCoreTest {
    private val zone = ZoneId.of("America/New_York")
    private fun ms(d: String, h: Int, m: Int = 0) = ZonedDateTime.of(LocalDate.parse(d).atTime(h, m), zone).toInstant().toEpochMilli()

    private val phone = """{"v":1,"at":5,"gc":"AbCdEf123456","ev":[
        {"d":"2026-11-20","t":"18:00","k":"g","tm":"Select","o":"Hawks","h":0,"l":"Town field"},
        {"d":"2026-11-18","t":"17:30","k":"p","tm":"Select","l":"Cage","x":"Batting cage"},
        {"d":"2026-11-19","t":"","k":"p","tm":"Majors","x":"Practice"},
        {"d":"not a date","k":"g"}]}"""

    @Test fun times() {
        assertEquals(18 * 60, SchedCore.minutes("18:00"))
        assertEquals(18 * 60 + 15, SchedCore.minutes("6:15 PM"))
        assertEquals(12 * 60, SchedCore.minutes("12:00 pm"))
        assertEquals(30, SchedCore.minutes("12:30 AM"))
        assertEquals(18 * 60, SchedCore.minutes("6pm"))
        assertEquals(9 * 60, SchedCore.minutes("9 a.m."))
        assertNull(SchedCore.minutes(""))
        assertNull(SchedCore.minutes("25:00"))
        assertNull(SchedCore.minutes("soon"))
        assertEquals("6:15 PM", SchedCore.timeLabel(18 * 60 + 15))
        assertEquals("18:15", SchedCore.timeLabel(18 * 60 + 15, h24 = true))
    }

    @Test fun parsesAndSorts() {
        val s = SchedCore.parse(phone)!!
        assertEquals("AbCdEf123456", s.gc)
        assertEquals(3, s.ev.size)
        val ev = SchedCore.merge(s, emptyList(), zone)
        assertEquals(listOf("2026-11-18", "2026-11-19", "2026-11-20"), ev.map { it.date.toString() })
        assertEquals("Batting cage", ev[0].title)
        assertEquals("@ Hawks", ev[2].title)
        assertNull(SchedCore.parse("nope"))
        assertNull(SchedCore.parse("""{"gc":"../x","ev":[]}""")!!.gc)
    }

    @Test fun gameChangerScoresAndExtraGames() {
        val s = SchedCore.parse(phone)!!
        val final = Gc.Game("game-0001-aaaa", "Hawks", ms("2026-11-20", 18, 5), ms("2026-11-20", 20), false, "completed", 7, 3)
        val extra = Gc.Game("game-0002-bbbb", "Owls", ms("2026-11-22", 10), ms("2026-11-22", 12), true, "scheduled", null, null)
        val ev = SchedCore.merge(s, listOf(final, extra), zone)
        assertEquals(4, ev.size)
        val hawks = ev.first { it.opp == "Hawks" }
        assertNotNull(hawks.gc)
        assertEquals("W 7-3", SchedCore.score(hawks, ms("2026-11-21", 9)))
        val owls = ev.last()
        assertEquals("vs Owls", owls.title)
        assertEquals("Select", owls.team)
        assertEquals(10 * 60, owls.min)
    }

    @Test fun whatsAheadAndLive() {
        val ev = SchedCore.merge(SchedCore.parse(phone)!!, emptyList(), zone)
        // Wednesday 6 PM: the 5:30 cage is still on, Thursday and Friday ahead
        assertEquals(3, SchedCore.ahead(ev, ms("2026-11-18", 18), zone).size)
        // Wednesday 9 PM: the cage is over
        assertEquals(2, SchedCore.ahead(ev, ms("2026-11-18", 21), zone).size)
        // two weeks out at most
        assertEquals(0, SchedCore.ahead(ev, ms("2026-12-10", 9), zone).size)
        val game = ev.last()
        assertTrue(SchedCore.live(game, ms("2026-11-20", 19), zone))
        assertFalse(SchedCore.live(game, ms("2026-11-20", 17), zone))
        val today = LocalDate.parse("2026-11-18")
        assertEquals("Today", SchedCore.dayLabel(today, today))
        assertEquals("Tomorrow", SchedCore.dayLabel(today.plusDays(1), today))
        assertEquals("Friday", SchedCore.dayLabel(today.plusDays(2), today))
        assertEquals("Thu Nov 26", SchedCore.dayLabel(today.plusDays(8), today))
    }

    @Test fun face() {
        val s = SchedCore.parse(phone)!!
        val now = ms("2026-11-18", 9)
        fun f(at: Long) = SchedCore.face(true, SchedCore.ahead(s.ev.sortedWith(compareBy({ it.date }, { it.min ?: 720 })), at, zone), at, zone, false)
        // today's batting cage at 5:30 PM
        assertEquals(SchedCore.Face("PRAC", "5:30", "Batting cage 5:30 PM"), f(now))
        // after it: tomorrow's practice with no time
        assertEquals(SchedCore.Face("TMRW", "PRAC", "Tomorrow practice"), f(ms("2026-11-18", 21)))
        // a practice with no time stays up all its day
        assertEquals(SchedCore.Face("PRAC", "TODAY", "Practice"), f(ms("2026-11-19", 23)))
        // two days out: the game
        val games = s.ev.filter { it.game }
        assertEquals(SchedCore.Face("FRI", "GAME", "Fri Nov 20 6:00 PM @ Hawks"), SchedCore.face(true, SchedCore.ahead(games, now, zone), now, zone, false))
        // the game day, then during the game
        assertEquals(SchedCore.Face("GAME", "6:00", "Game 6:00 PM @ Hawks"), f(ms("2026-11-20", 8)))
        assertEquals(SchedCore.Face("LIVE", "GAME", "Game on now @ Hawks"), f(ms("2026-11-20", 18, 30)))
        assertEquals("—", f(ms("2026-12-20", 8)).shortText)
        assertEquals(SchedCore.Face(null, "SCHED", "Open Schedule on the watch once"), SchedCore.face(false, emptyList(), now, zone, false))
        assertEquals("17:30", SchedCore.face(true, SchedCore.ahead(s.ev.sortedBy { it.date }, now, zone), now, zone, true).shortText)
    }
}
