package com.steele.dugout.shared

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/** Made-up games in the shape GameChanger's public team feed returns (checked against a real 2026 team's feed, Nov 2026). */
class GcCoreTest {
    private fun ms(s: String) = Instant.parse(s).toEpochMilli()

    private val games = """
        [
          {"id":"6be1b53e-47a4-462d-ab32-3d0a22d094b6","opponent_team":{"name":"Hawks"},"start_ts":"2026-04-27T21:45:00.000Z","end_ts":"2026-04-27T23:45:00.000Z","timezone":"America/New_York","home_away":"home","score":{"team":3,"opponent_team":7},"game_status":"completed","has_live_stream":false},
          {"id":"5e109107-8cd0-484d-b12e-1ad7c81a11f5","opponent_team":{"name":"Pepperell","avatar_url":"https://x"},"start_ts":"2026-04-29T21:45:00.000Z","end_ts":"2026-04-29T23:45:00.000Z","home_away":"away","score":{"team":10,"opponent_team":2},"game_status":"completed"},
          {"id":"11111111-2222-3333-4444-555555555555","opponent_team":{"name":"Townsend"},"start_ts":"2026-05-02T14:00:00.000Z","end_ts":"2026-05-02T16:00:00.000Z","home_away":"home","score":{"team":2,"opponent_team":1},"game_status":"scheduled","has_live_stream":true},
          {"id":"22222222-2222-3333-4444-555555555555","opponent_team":null,"start_ts":"2026-05-06T21:45:00Z","home_away":"home","score":null,"game_status":"scheduled"},
          {"id":"bad id!","start_ts":"2026-05-06T21:45:00Z"},
          {"id":"33333333-2222-3333-4444-555555555555","opponent_team":{"name":"Groton"},"start_ts":"2026-05-01T21:45:00Z","game_status":"canceled"}
        ]
    """.trimIndent()

    @Test fun readsGamesInOrderAndSkipsBadOnes() {
        val g = Gc.parseGames(games)
        assertEquals(5, g.size)
        assertEquals("Hawks", g[0].opponent)
        assertEquals('L', g[0].result)
        assertEquals("@ Pepperell", g[1].vs)
        assertEquals('W', g[1].result)
        assertEquals("TBD", g.last().opponent)
        assertNull(g.last().us)
        assertEquals(emptyList(), Gc.parseGames("not json"))
    }

    @Test fun boardDuringAGame() {
        val g = Gc.parseGames(games)
        val b = Gc.board(g, ms("2026-05-02T15:00:00Z"))
        assertEquals("Townsend", b.live?.opponent)
        assertEquals(true, b.live?.liveStream)
        assertEquals(listOf("Groton", "Pepperell", "Hawks"), b.recent.map { it.opponent })
        assertEquals(Gc.Phase.OFF, Gc.phase(b.recent[0], ms("2026-05-02T15:00:00Z")))
        assertEquals("TBD", b.next?.opponent)
        assertEquals(30_000L, Gc.refreshMs(b))
    }

    @Test fun boardBetweenGames() {
        val g = Gc.parseGames(games)
        val b = Gc.board(g, ms("2026-04-30T12:00:00Z"))
        assertNull(b.live)
        assertEquals("Townsend", b.next?.opponent)
        assertEquals(listOf("Pepperell", "Hawks"), b.recent.map { it.opponent })
        assertEquals(15 * 60_000L, Gc.refreshMs(b))
        // a game that never got a final stops counting as live
        assertEquals(Gc.Phase.NO_FINAL, Gc.phase(g[2], ms("2026-05-03T12:00:00Z")))
    }

    @Test fun readsTheTeamAndLineScore() {
        val t = Gc.parseTeam("""{"id":"AbCdEf123456","name":"Sample Majors","team_season":{"season":"spring","year":2026,"record":{"win":5,"loss":8,"tie":0}},"staff":["x"]}""")
        assertEquals(Gc.Team("Sample Majors", "5-8", "Spring 2026"), t)
        val l = Gc.parseLine("""{"line_score":{"team":{"scores":[0,1,0,2,0,0],"totals":[3,13,3],"innings_per_game":6},"opponent_team":{"scores":[2,0,3,0,1,1,0],"totals":[7,12,1],"innings_per_game":6}}}""")
        assertNotNull(l)
        assertEquals(6, l.us.innings.size)
        assertEquals(7, l.them.innings.size)
        assertEquals(3, l.us.r); assertEquals(13, l.us.h); assertEquals(1, l.them.e)
        assertNull(Gc.parseLine("""{"line_score":null}"""))
    }

    @Test fun teamIdFromALinkOrTheId() {
        assertEquals("AbCdEf123456", Gc.teamId("https://web.gc.com/teams/AbCdEf123456/2026-spring-sample/schedule"))
        assertEquals("AbCdEf123456", Gc.teamId("  AbCdEf123456 "))
        assertNull(Gc.teamId("https://example.com/x"))
        assertNull(Gc.teamId(""))
        assertNull(Gc.teamId("../etc"))
    }
}
