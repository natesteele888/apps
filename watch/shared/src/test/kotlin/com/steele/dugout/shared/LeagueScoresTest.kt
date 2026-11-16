package com.steele.dugout.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LeagueScoresTest {
    // The shape scripts/scrape-standings.mjs (lybs-ballclub) writes to shared/macLeagueStandings. Made-up teams.
    private val sample = """
    {
      "scrapedAt": "2026-05-12T22:30:04.000Z",
      "divisions": {
        "33694": { "name": "8u Rookies", "rows": [], "todayGames": [] },
        "33696": {
          "name": "12u Majors",
          "rows": [
            { "teamId": "1", "team": "12u Lunenburg Select", "w": "5", "l": "2", "t": "0", "isUs": true },
            { "teamId": "2", "team": "12u Ayer Red", "w": "4", "l": "3", "t": "1", "isUs": false }
          ],
          "todayGames": [
            "Old string-only entry",
            { "gameId": "10", "time": "5:30 PM", "location": "Ayer Field",
              "teams": [ { "teamId": "2", "name": "12u Ayer Red", "score": "7" }, { "teamId": "3", "name": "12u Groton Blue", "score": "4" } ] },
            { "gameId": "11", "time": "6:00 PM", "location": null,
              "teams": [ { "teamId": "4", "name": "12u Shirley Gold", "score": null }, { "teamId": "1", "name": "12u Lunenburg Select", "score": null } ] },
            { "gameId": "12", "time": "6:00 PM", "teams": [ { "teamId": "5", "name": "12u Harvard" } ] }
          ]
        },
        "33695": { "name": "10u Minors", "rows": [], "todayGames": [
            { "gameId": "20", "time": "Final", "teams": [ { "name": "10u Townsend", "score": 3 }, { "name": "10u Pepperell", "score": 3 } ] } ] }
      }
    }
    """.trimIndent()

    @Test fun majorsFirstThenMinorsThenRookies() {
        val b = LeagueScores.parse(sample)
        assertEquals(listOf("Majors", "Minors", "Rookies"), b.divisions.map { it.name })
        assertEquals("2026-05-12T22:30:04.000Z", b.scrapedAt)
        assertEquals(3, b.gameCount)
    }

    @Test fun readsScoresAndPutsLunenburgFirst() {
        val majors = LeagueScores.parse(sample).divisions.first()
        assertEquals(2, majors.games.size) // the string entry and the one-team game are skipped
        val first = majors.games[0]
        assertTrue(first.us)
        assertFalse(first.played)
        assertEquals("Shirley Gold", first.away.name)
        assertEquals("Lunenburg Select", first.home.name)
        assertNull(first.location)
        val second = majors.games[1]
        assertTrue(second.played)
        assertEquals(7, second.away.score)
        assertEquals(4, second.home.score)
        assertEquals("Ayer Field", second.location)
    }

    @Test fun numberScoresWorkToo() {
        val g = LeagueScores.parse(sample).divisions[1].games.single()
        assertEquals(3, g.away.score)
        assertEquals(3, g.home.score)
    }

    @Test fun standingsRecords() {
        val rows = LeagueScores.parse(sample).divisions.first().standings
        assertEquals("5-2", rows[0].record)
        assertTrue(rows[0].us)
        assertEquals("4-3-1", rows[1].record)
        assertEquals("Ayer Red", rows[1].team)
    }

    @Test fun emptyOrMissingData() {
        assertEquals(0, LeagueScores.parse("null").divisions.size)
        assertEquals(0, LeagueScores.parse("").divisions.size)
        assertEquals(0, LeagueScores.parse("{}").gameCount)
    }

    @Test fun shortNames() {
        assertEquals("Lunenburg Select", LeagueScores.shortName("12u Lunenburg Select"))
        assertEquals("Ayer", LeagueScores.shortName("8U Ayer"))
        assertEquals("Townsend 12", LeagueScores.shortName("Townsend 12"))
    }

    @Test fun tokens() {
        val signUp = LeagueScores.token("""{"idToken":"a","refreshToken":"r","expiresIn":"3600"}""")
        assertEquals(Triple("a", "r", 3_600_000L), signUp)
        val refresh = LeagueScores.token("""{"id_token":"b","refresh_token":"s","expires_in":"1800"}""")
        assertEquals(Triple("b", "s", 1_800_000L), refresh)
        assertNull(LeagueScores.token("""{"error":{"code":400}}"""))
        assertNull(LeagueScores.token("not json"))
    }
}
