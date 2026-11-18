package com.steele.dugout.shared

import org.json.JSONArray
import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class LineupTest {
    private fun b(id: String, name: String, pos: String = "", inn: List<String?>? = null): JSONObject {
        val o = JSONObject().put("id", id).put("name", name).put("num", id.takeLast(1)).put("pos", pos).put("ready", true).put("code", "ready")
        if (inn != null) o.put("inn", JSONArray().apply { inn.forEach { put(it ?: JSONObject.NULL) } })
        return o
    }
    private fun parse(o: JSONObject) = assertNotNull(Proto.parseState(o.toString(), 5))

    /** nine batters at the nine positions in inning 1 and a tenth on the bench; inning 2 has two at SS and nobody in LF */
    private fun game(): BatState {
        val lineup = JSONArray()
        Lineup.POSITIONS.forEachIndexed { i, p ->
            val second = if (p == "LF") "SS" else p
            lineup.put(b("pl$i", "Player ${i + 1}", p, listOf(p, second, "", "", "", "")))
        }
        val bench = JSONArray().put(b("pl9", "Player 10", "", listOf("Bench", "LF", "", "", "", "")))
        return parse(JSONObject().put("ready", true).put("lineup", lineup).put("bench", bench).put("innings", 6))
    }

    @Test fun readsPositionsByInning() {
        val st = game()
        assertEquals(6, st.innings)
        assertEquals(listOf("P", "P", "", "", "", ""), st.lineup[0].inn)
        assertEquals(listOf("Bench", "LF", "", "", "", ""), st.bench[0].inn)
        assertTrue(Lineup.hasGrid(st))
        assertEquals(0, st.inning, "the phone doesn't say which inning it is")
    }

    @Test fun anOlderPhoneSendsNoGrid() {
        val st = parse(JSONObject().put("ready", true).put("lineup", JSONArray().put(b("a1", "Player 1", "SS"))))
        assertEquals(emptyList(), st.lineup[0].inn)
        assertEquals(0, st.innings)
        assertFalse(Lineup.hasGrid(st))
    }

    @Test fun oddValuesAreCleaned() {
        val o = JSONObject().put("ready", true).put("innings", 40).put("inning", -2)
            .put("lineup", JSONArray().put(b("a1", "Player 1", "", listOf(" ss", "bench", "XX", null, "lf", "P", "C", "1B", "2B", "3B", "SS"))))
        val st = parse(o)
        assertEquals(9, st.innings, "never more than 9")
        assertEquals(0, st.inning)
        assertEquals(listOf("SS", "Bench", "", "", "LF", "P", "C", "1B", "2B"), st.lineup[0].inn, "cut to 9, unknown values blank")
        val bad = JSONObject().put("ready", true).put("lineup", JSONArray().put(b("a1", "Player 1").put("inn", "SS")))
        assertEquals(emptyList(), parse(bad).lineup[0].inn, "not a list: none")
    }

    @Test fun aGridWithNothingInItIsNoGrid() {
        val o = JSONObject().put("ready", true).put("innings", 6).put("lineup", JSONArray().put(b("a1", "Player 1", "SS", listOf("", "", ""))))
        assertFalse(Lineup.hasGrid(parse(o)))
        // a position only past the game's innings doesn't count either
        val late = JSONObject().put("ready", true).put("innings", 2).put("lineup", JSONArray().put(b("a1", "Player 1", "SS", listOf("", "", "SS"))))
        assertFalse(Lineup.hasGrid(parse(late)))
    }

    @Test fun whoPlaysWhereInAnInning() {
        val st = game()
        val one = Lineup.card(st, 1)
        assertEquals(1, one.inning)
        assertEquals(Lineup.POSITIONS, one.spots.map { it.pos })
        assertEquals(listOf("pl5"), one.spots.first { it.pos == "SS" }.players.map { it.id })
        assertEquals(listOf("pl9"), one.sitting.map { it.id })
        assertEquals(emptyList(), one.unset)
        assertEquals(emptyList(), one.dupes); assertEquals(emptyList(), one.missing)
        assertEquals("", Lineup.warning(one))

        val two = Lineup.card(st, 2)
        assertEquals(listOf("pl5", "pl6"), two.spots.first { it.pos == "SS" }.players.map { it.id }, "two at SS, batting order first")
        assertEquals(listOf("pl9"), two.spots.first { it.pos == "LF" }.players.map { it.id }, "the bench player comes in to LF")
        assertEquals(listOf("SS"), two.dupes)
        assertEquals(emptyList(), two.missing)
        assertEquals("2 at SS", Lineup.warning(two))

        val three = Lineup.card(st, 3)
        assertEquals(0, three.placed)
        assertEquals(10, three.unset.size, "nobody set yet")
        assertEquals("", Lineup.warning(three), "an empty inning isn't a warning")

        assertEquals(6, Lineup.card(st, 99).inning, "past the last inning: the last")
        assertEquals(1, Lineup.card(st, 0).inning)
    }

    @Test fun missingPositionsAreNamed() {
        val lineup = JSONArray().put(b("a1", "Player 1", "", listOf("P"))).put(b("a2", "Player 2", "", listOf("P"))).put(b("a3", "Player 3", "", listOf("Bench")))
        val st = parse(JSONObject().put("ready", true).put("innings", 3).put("lineup", lineup))
        val c = Lineup.card(st, 1)
        assertEquals("2 at P · no C, 1B, 2B, 3B, SS, LF, CF, RF", Lineup.warning(c))
    }

    @Test fun withNoGridEachBatterHasTheirOnePosition() {
        val lineup = JSONArray().put(b("a1", "Player 1", "ss")).put(b("a2", "Player 2", "Pitcher")).put(b("a3", "Player 3", "First base"))
            .put(b("a4", "Player 4", "UT")).put(b("a5", "Player 5", "Left field"))
        val st = parse(JSONObject().put("ready", true).put("lineup", lineup).put("bench", JSONArray().put(b("a6", "Player 6", "C"))))
        val c = Lineup.card(st, 3)
        assertEquals(0, c.inning, "no inning without a grid")
        assertEquals(listOf("a1"), c.spots.first { it.pos == "SS" }.players.map { it.id })
        assertEquals(listOf("a2"), c.spots.first { it.pos == "P" }.players.map { it.id })
        assertEquals(listOf("a3"), c.spots.first { it.pos == "1B" }.players.map { it.id })
        assertEquals(listOf("a5"), c.spots.first { it.pos == "LF" }.players.map { it.id })
        assertEquals(listOf("a4"), c.unset.map { it.id }, "a position that isn't one of the nine")
        assertEquals(listOf("a6"), c.sitting.map { it.id }, "the bench sits, even with a position")
        assertEquals(emptyList(), c.spots.first { it.pos == "C" }.players)
    }

    @Test fun singlePositionWords() {
        assertEquals("SS", Lineup.single(" ss ")); assertEquals("SS", Lineup.single("Short stop")); assertEquals("CF", Lineup.single("Center Field"))
        assertEquals("2B", Lineup.single("2nd")); assertEquals("3B", Lineup.single("third base")); assertEquals("C", Lineup.single("catcher"))
        assertEquals("", Lineup.single("UT")); assertEquals("", Lineup.single(""))
    }

    @Test fun whichInningTheCardOpensOn() {
        assertEquals(4, Lineup.start(known = 4, last = 2, innings = 6), "the inning being played")
        assertEquals(2, Lineup.start(known = 0, last = 2, innings = 6), "else the last one looked at")
        assertEquals(1, Lineup.start(known = 0, last = 0, innings = 6), "else the first")
        assertEquals(1, Lineup.start(known = 9, last = 8, innings = 6), "nothing past the game")
        assertEquals(0, Lineup.start(known = 3, last = 3, innings = 0), "no grid: no inning")
    }

    @Test fun steppingStopsAtTheEnds() {
        assertEquals(2, Lineup.step(1, 1, 6)); assertEquals(6, Lineup.step(6, 1, 6)); assertEquals(1, Lineup.step(1, -1, 6)); assertEquals(5, Lineup.step(6, -1, 6))
        assertEquals(0, Lineup.step(1, 1, 0))
    }

    @Test fun everyoneIsTheOrderThenTheBench() {
        val st = game()
        assertEquals((0..9).map { "pl$it" }, Lineup.everyone(st).map { it.id })
    }
}
