package com.steele.dugout.shared

import java.time.Instant
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The watch face's "Live score" words, with made-up games. Times are US Eastern (November, so UTC-5). */
class GcFaceTest {
    private fun ms(s: String) = Instant.parse(s).toEpochMilli()
    private val zone = ZoneId.of("America/New_York")

    // a home win last Saturday, and an away game this Saturday at 6:30 PM
    private val hawks = Gc.Game("11111111-aaaa-bbbb-cccc-000000000001", "Hawks", ms("2026-11-14T19:00:00Z"), ms("2026-11-14T21:00:00Z"), true, "completed", 7, 3)
    private val tigers = Gc.Game("11111111-aaaa-bbbb-cccc-000000000002", "Tigers", ms("2026-11-21T23:30:00Z"), ms("2026-11-22T01:30:00Z"), false, "scheduled", null, null)
    private val owls = Gc.Game("11111111-aaaa-bbbb-cccc-000000000003", "Owls", ms("2026-11-25T23:30:00Z"), ms("2026-11-26T01:30:00Z"), true, "scheduled", null, null)

    private fun face(games: List<Gc.Game>, now: String, h24: Boolean = false, line: Gc.Line? = null, teamSet: Boolean = true, everRead: Boolean = true) =
        GcFace.texts(teamSet, Gc.board(games, ms(now)), line, ms(now), zone, h24, everRead)

    @Test fun noTeamSet() {
        assertEquals(GcFace.Texts(null, "GC", "Set a team in Dugout on the phone"), face(emptyList(), "2026-11-18T15:00:00Z", teamSet = false))
    }

    @Test fun nextGameDayAndTime() {
        val g = listOf(hawks, tigers)
        // Wednesday morning: Saturday's game, but last Saturday's final is long over so it gives way
        assertEquals(GcFace.Texts("SAT", "6:30", "Sat 6:30 PM @ Tigers"), face(g, "2026-11-18T15:00:00Z"))
        assertEquals(GcFace.Texts("SAT", "18:30", "Sat 18:30 @ Tigers"), face(g, "2026-11-18T15:00:00Z", h24 = true))
        // Saturday morning
        assertEquals(GcFace.Texts("TODAY", "6:30", "Today 6:30 PM @ Tigers"), face(g, "2026-11-21T15:00:00Z"))
        // more than six days out: the date instead of the day
        assertEquals(GcFace.Texts("NOV 21", "6:30", "Nov 21 6:30 PM @ Tigers"), face(listOf(tigers), "2026-11-10T15:00:00Z"))
        // GameChanger calls it live 15 minutes early; the face still shows the start time until then
        assertEquals(GcFace.Texts("TODAY", "6:30", "Today 6:30 PM @ Tigers"), face(g, "2026-11-21T23:20:00Z"))
    }

    @Test fun liveScore() {
        val playing = tigers.copy(status = "in_progress", us = 4, them = 3)
        val g = listOf(hawks, playing, owls)
        assertEquals(GcFace.Texts("LIVE", "4-3", "LIVE @ Tigers 4-3"), face(g, "2026-11-22T00:30:00Z"))
        // with the line score: the inning, the same number the GC Scores screen shows
        val line = Gc.Line(Gc.Side(listOf(1, 0, 2, 1, 0), 4, 6, 1), Gc.Side(listOf(0, 3, 0, 0), 3, 5, 2), 6)
        assertEquals(GcFace.Texts("INN 5", "4-3", "LIVE @ Tigers 4-3"), face(g, "2026-11-22T00:30:00Z", line = line))
        assertEquals(null, GcFace.inning(Gc.Line(Gc.Side(emptyList(), null, null, null), Gc.Side(emptyList(), null, null, null), 6)))
        // no score in yet reads 0-0
        assertEquals("0-0", face(listOf(tigers.copy(status = "in_progress")), "2026-11-21T23:45:00Z").shortText)
    }

    @Test fun finalStaysUpAfterTheGameThenTheNextGame() {
        val done = tigers.copy(status = "completed", us = 4, them = 3)
        val g = listOf(hawks, done, owls)
        assertEquals(GcFace.Texts("FINAL", "W 4-3", "W 4-3 @ Tigers"), face(g, "2026-11-22T03:00:00Z"))
        // seven hours after the scheduled end, the next game takes over
        assertEquals(GcFace.Texts("WED", "6:30", "Wed 6:30 PM vs Owls"), face(g, "2026-11-22T08:30:00Z"))
        // nothing ahead: the last final stays, however old
        assertEquals(GcFace.Texts("FINAL", "W 7-3", "W 7-3 vs Hawks"), face(listOf(hawks), "2026-12-30T15:00:00Z"))
        assertEquals("L 2-5", face(listOf(hawks.copy(us = 2, them = 5)), "2026-11-15T15:00:00Z").shortText)
        // a final with no score
        assertEquals(GcFace.Texts(null, "FINAL", "Final vs Hawks"), face(listOf(hawks.copy(us = null, them = null)), "2026-11-15T15:00:00Z"))
    }

    @Test fun noGames() {
        assertEquals(GcFace.Texts(null, "GC", "No games on GameChanger yet"), face(emptyList(), "2026-11-18T15:00:00Z"))
        assertEquals("Can't reach GameChanger yet", face(emptyList(), "2026-11-18T15:00:00Z", everRead = false).longText)
        // a called-off game isn't a final
        assertEquals("GC", face(listOf(hawks.copy(status = "canceled", us = null, them = null)), "2026-11-18T15:00:00Z").shortText)
    }

    @Test fun readsEveryMinuteOnlyNearAGame() {
        val g = listOf(hawks, tigers)
        fun fast(now: String) = GcFace.fast(Gc.board(g, ms(now)), ms(now))
        assertFalse(fast("2026-11-18T15:00:00Z"))
        assertEquals(15 * 60_000L, GcFace.maxAgeMs(Gc.board(g, ms("2026-11-18T15:00:00Z")), ms("2026-11-18T15:00:00Z")))
        assertTrue(fast("2026-11-21T23:05:00Z")) // 25 minutes before the first pitch
        assertTrue(fast("2026-11-22T00:30:00Z")) // during the game
        assertEquals(50_000L, GcFace.maxAgeMs(Gc.board(g, ms("2026-11-22T00:30:00Z")), ms("2026-11-22T00:30:00Z")))
        assertFalse(fast("2026-11-22T04:00:00Z")) // after the live window, with nothing ahead
    }
}
