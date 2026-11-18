package com.steele.dugout.shared

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * The words for GC Scores on the watch face (the "Live score" complication): a tiny box with a title and a few
 * characters, and a long line for wide slots. Plain text from the same board GC Scores shows, so it's tested here.
 *
 * What it shows, first match wins:
 *   no team set            GC                 "Set a team in Dugout on the phone"
 *   a game going on        INN 5 / 4-3        "LIVE vs Hawks 4-3"
 *   a final in the last 6 h FINAL / W 7-3     "W 7-3 vs Hawks"   (so the result stays up after the game, not the next game)
 *   the next game          SAT / 6:30         "Sat 6:30 PM vs Hawks"
 *   the last final         FINAL / W 7-3      "W 7-3 vs Hawks"
 */
object GcFace {
    data class Texts(val shortTitle: String?, val shortText: String, val longText: String)

    /** how long a final stays on the face ahead of the next game, after its scheduled end */
    const val FINAL_STAYS_MS = 6 * 3600_000L

    /** a game this close to its start counts as "near", so the face reads GameChanger every minute */
    const val NEAR_MS = 30 * 60_000L

    /**
     * [teamSet]: the coach picked a team on the phone. [line]: the live game's line score, if the watch has it.
     * [h24]: the watch is set to 24-hour time. [everRead]: the watch has read this team from GameChanger at least once.
     */
    fun texts(teamSet: Boolean, board: Gc.Board, line: Gc.Line?, now: Long, zone: ZoneId, h24: Boolean, everRead: Boolean = true): Texts {
        if (!teamSet) return Texts(null, "GC", "Set a team in Dugout on the phone")
        val live = board.live
        // GameChanger counts a game as live from 15 minutes before the first pitch; until then show when it starts
        if (live != null && now < live.startMs) return upcoming(live, now, zone, h24)
        if (live != null) {
            val score = "${live.us ?: 0}-${live.them ?: 0}"
            return Texts(inning(line) ?: "LIVE", score, "LIVE ${live.vs} $score")
        }
        val last = board.recent.firstOrNull { Gc.phase(it, now) == Gc.Phase.FINAL }
        if (last != null && now - last.endMs < FINAL_STAYS_MS) return final(last)
        board.next?.let { return upcoming(it, now, zone, h24) }
        if (last != null) return final(last)
        return Texts(null, "GC", if (everRead) "No games on GameChanger yet" else "Can't reach GameChanger yet")
    }

    /**
     * The inning from the line score: how many innings either team has a box for, the same "Inning 5" the GC Scores
     * screen shows. The feed doesn't say top or bottom, so the face doesn't guess.
     */
    fun inning(line: Gc.Line?): String? {
        val n = line?.let { maxOf(it.us.innings.size, it.them.innings.size) } ?: 0
        return if (n > 0) "INN $n" else null
    }

    /** a game going on, or one starting within 30 minutes: then the face reads GameChanger every minute */
    fun fast(board: Gc.Board, now: Long): Boolean = board.live != null || board.next?.let { it.startMs - now <= NEAR_MS } == true

    /** how old the watch's copy of the scores may be before the face reads GameChanger again */
    fun maxAgeMs(board: Gc.Board, now: Long): Long = if (fast(board, now)) 50_000L else 15 * 60_000L

    private fun final(g: Gc.Game): Texts {
        val r = g.result
        val short = if (r == null) "FINAL" else "$r ${g.us}-${g.them}"
        return Texts(if (r == null) null else "FINAL", short, (if (r == null) "Final" else short) + " " + g.vs)
    }

    private fun upcoming(g: Gc.Game, now: Long, zone: ZoneId, h24: Boolean): Texts {
        val t = Instant.ofEpochMilli(g.startMs).atZone(zone)
        val days = ChronoUnit.DAYS.between(Instant.ofEpochMilli(now).atZone(zone).toLocalDate(), t.toLocalDate())
        fun f(p: String) = DateTimeFormatter.ofPattern(p, Locale.US).format(t)
        val clock = if (h24) f("HH:mm") else f("h:mm")
        val clockLong = if (h24) clock else f("h:mm a")
        val (title, day) = when {
            days == 0L -> "TODAY" to "Today"
            days in 1..6 -> f("EEE").uppercase(Locale.US) to f("EEE")
            else -> f("MMM d").uppercase(Locale.US) to f("MMM d")
        }
        return Texts(title, clock, "$day $clockLong ${g.vs}")
    }
}
