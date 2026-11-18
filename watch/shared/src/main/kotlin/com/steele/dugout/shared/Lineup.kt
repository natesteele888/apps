package com.steele.dugout.shared

import org.json.JSONArray

/**
 * The Lineup card on the watch: who plays where in each inning, from Walk-Up's Positions by inning (Team tab on the phone).
 * Walk-Up sends each batting-order and bench row an "inn" list, one entry per inning ("P", "SS", "Bench" or "" when not set),
 * and the game's "innings". A phone with no grid (or an older one) sends neither; the card then shows each player's one position.
 */
object Lineup {
    /** the nine positions, in scorebook order */
    val POSITIONS = listOf("P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF")
    /** sits that inning */
    const val BENCH = "Bench"
    /** the most innings a game can have in Walk-Up */
    const val MAX_INNINGS = 9

    /** one entry of an "inn" list: one of the nine, [BENCH], or "" for anything else */
    fun pos(x: String?): String {
        val s = x?.trim()?.uppercase() ?: return ""
        return if (s == "BENCH") BENCH else if (s in POSITIONS) s else ""
    }

    /** a row's "inn" list, cleaned and cut to [MAX_INNINGS]; missing means none */
    fun row(arr: JSONArray?): List<String> {
        if (arr == null) return emptyList()
        return (0 until minOf(arr.length(), MAX_INNINGS)).map { i -> pos(if (arr.isNull(i)) null else arr.optString(i, "")) }
    }

    private val WORDS = mapOf(
        "PITCHER" to "P", "CATCHER" to "C", "FIRST" to "1B", "1ST" to "1B", "SECOND" to "2B", "2ND" to "2B", "THIRD" to "3B", "3RD" to "3B",
        "SHORT" to "SS", "SHORTSTOP" to "SS", "LEFT" to "LF", "CENTER" to "CF", "CENTRE" to "CF", "RIGHT" to "RF",
    )

    /** a player's one position as typed in Walk-Up ("ss", "Pitcher", "1st"), as one of the nine, or "" */
    fun single(pos: String): String {
        val s = pos.trim().uppercase().replace(" ", "").replace("BASE", "").replace("FIELD", "")
        return if (s in POSITIONS) s else WORDS[s] ?: ""
    }

    /** everyone who can play: the batting order, then the bench */
    fun everyone(st: BatState): List<Batter> = st.lineup + st.bench.filter { b -> st.lineup.none { it.id == b.id } }

    /** did the coach set positions by inning in Walk-Up for this game? */
    fun hasGrid(st: BatState): Boolean = st.innings > 0 && everyone(st).any { b -> b.inn.take(st.innings).any { it.isNotEmpty() } }

    /** one position on the card and who is there (nobody, one, or more than one when two were put in the same spot) */
    data class Spot(val pos: String, val players: List<Batter>)

    /**
     * One inning's card. [inning] counts from 1 (0: no grid, each player's one position). [sitting]: on the bench that inning
     * (with no grid, everyone not in the batting order). [unset]: no position that inning (with no grid, a batter whose position
     * isn't one of the nine; [Batter.pos] still has what was typed).
     */
    data class Card(val inning: Int, val spots: List<Spot>, val sitting: List<Batter>, val unset: List<Batter>) {
        /** positions with two or more players */
        val dupes: List<String> get() = spots.filter { it.players.size > 1 }.map { it.pos }
        /** positions with nobody */
        val missing: List<String> get() = spots.filter { it.players.isEmpty() }.map { it.pos }
        /** how many players have a position */
        val placed: Int get() = spots.sumOf { it.players.size }
    }

    /** inning [k] (from 1) for [players], from their "inn" lists */
    fun inning(players: List<Batter>, k: Int): Card {
        val at = { b: Batter -> b.inn.getOrNull(k - 1) ?: "" }
        return Card(
            k,
            POSITIONS.map { p -> Spot(p, players.filter { at(it) == p }) },
            players.filter { at(it) == BENCH },
            players.filter { at(it).isEmpty() },
        )
    }

    /** the card with no grid: each batter at their one position, the bench sitting */
    fun singleCard(st: BatState): Card {
        val bench = everyone(st).drop(st.lineup.size)
        return Card(
            0,
            POSITIONS.map { p -> Spot(p, st.lineup.filter { single(it.pos) == p }) },
            bench,
            st.lineup.filter { single(it.pos).isEmpty() },
        )
    }

    /** the card for inning [k] of this game, or the one-position card when there's no grid */
    fun card(st: BatState, k: Int): Card = if (hasGrid(st)) inning(everyone(st), k.coerceIn(1, st.innings)) else singleCard(st)

    /** "2 at SS · no LF", or "" when every position has one player (or nobody is placed yet) */
    fun warning(c: Card): String {
        if (c.placed == 0) return ""
        val bits = c.dupes.map { p -> "${c.spots.first { it.pos == p }.players.size} at $p" }.toMutableList()
        if (c.missing.isNotEmpty()) bits.add("no " + c.missing.joinToString(", "))
        return bits.joinToString(" · ")
    }

    /** which inning the card opens on: the inning being played if the phone knows it, else the last one looked at, else 1 */
    fun start(known: Int, last: Int, innings: Int): Int = when {
        innings <= 0 -> 0
        known in 1..innings -> known
        last in 1..innings -> last
        else -> 1
    }

    /** the next or previous inning, stopping at the first and the last */
    fun step(k: Int, d: Int, innings: Int): Int = if (innings <= 0) 0 else (k + d).coerceIn(1, innings)
}
