package com.steele.family.core

import com.steele.dugout.shared.Gc
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Schedule on the watch: a kid's games and practices for the next two weeks.
 *
 * The phone writes them into the watch link's "sc" field from the team app (LYBS Ballclub: the coach-entered schedule
 * and practices of every team the parent is signed in to). The text looks like
 *   {"v":1, "at":ms, "gc":"<GameChanger team id or ''>",
 *    "ev":[{"d":"2026-11-20","t":"18:00","k":"g"|"p","tm":"Select","o":"<opponent>","h":1|0,"l":"<place>","x":"Practice"}]}
 * "t" is 24-hour "HH:MM" (or empty for no time), "k" is g for a game and p for anything else, "h" is home (1) or away (0)
 * for a game, "x" is what the team app calls a practice ("Practice", "Batting cage"...).
 *
 * When a GameChanger team is set, the watch also reads GameChanger's public feed (the same one Dugout's GC Scores uses)
 * for live scores and finals, and adds any GameChanger game the phone's list doesn't have.
 */
object SchedCore {
    data class Ev(
        val date: LocalDate,
        val min: Int?,              // minutes after midnight, or null for no time
        val game: Boolean,
        val team: String,
        val opp: String,
        val home: Boolean?,
        val place: String,
        val label: String,          // "Practice" etc. for a practice
        val gc: Gc.Game? = null,    // the GameChanger game for it, when there is one
    ) {
        val title: String get() = if (game) (if (home == false) "@ " else "vs ") + opp.ifBlank { "TBD" } else label.ifBlank { "Practice" }
        fun startMs(zone: ZoneId): Long = (gc?.startMs) ?: date.atTime(if (min == null) LocalTime.NOON else LocalTime.of(min / 60, min % 60)).atZone(zone).toInstant().toEpochMilli()
    }

    data class Sched(val at: Long, val gc: String?, val ev: List<Ev>)

    private val HHMM = Regex("^(\\d{1,2}):(\\d{2})\\s*([AaPp][Mm])?$")
    private val HAMPM = Regex("^(\\d{1,2})\\s*([AaPp])\\.?[Mm]?\\.?$")

    /** "18:00", "6:00 PM", "6pm" → minutes after midnight */
    fun minutes(t: String?): Int? {
        val s = t?.trim().orEmpty()
        if (s.isEmpty()) return null
        HHMM.find(s)?.let { m ->
            var h = m.groupValues[1].toInt(); val mm = m.groupValues[2].toInt()
            val ap = m.groupValues[3].lowercase()
            if (mm > 59) return null
            if (ap.isNotEmpty()) { if (h !in 1..12) return null; h = h % 12 + if (ap == "pm") 12 else 0 }
            return if (h in 0..23) h * 60 + mm else null
        }
        HAMPM.find(s)?.let { m ->
            val h = m.groupValues[1].toInt(); if (h !in 1..12) return null
            return (h % 12 + if (m.groupValues[2].lowercase() == "p") 12 else 0) * 60
        }
        return null
    }

    fun parse(json: String?): Sched? = try {
        val o = JSONObject(json ?: "")
        val a = o.optJSONArray("ev")
        val ev = if (a == null) emptyList() else (0 until minOf(a.length(), 80)).mapNotNull { i ->
            val e = a.optJSONObject(i) ?: return@mapNotNull null
            val d = try { LocalDate.parse(e.optString("d")) } catch (x: Exception) { return@mapNotNull null }
            Ev(
                date = d, min = minutes(e.optString("t")), game = e.optString("k") == "g",
                team = e.optString("tm").take(30), opp = e.optString("o").take(40),
                home = if (e.has("h") && !e.isNull("h")) e.optInt("h") == 1 else null,
                place = e.optString("l").take(60), label = e.optString("x").take(30),
            )
        }
        Sched(o.optLong("at"), o.optString("gc").takeIf { Gc.safeTeamId(it) }, ev)
    } catch (e: Exception) { null }

    /**
     * The phone's events with GameChanger's games laid on: a GameChanger game on the same day as a phone game (the one
     * nearest in time, within 3 hours) gives that game its score; one with no phone game to match is added.
     */
    fun merge(s: Sched, gc: List<Gc.Game>, zone: ZoneId, team: String = ""): List<Ev> {
        val ev = s.ev.toMutableList()
        val used = HashSet<Int>()
        gc.forEach { g ->
            val day = Instant.ofEpochMilli(g.startMs).atZone(zone).toLocalDate()
            val i = ev.indices.filter { it !in used && ev[it].game && ev[it].date == day }
                .minByOrNull { kotlin.math.abs(ev[it].startMs(zone) - g.startMs) }
                ?.takeIf { ev[it].min == null || kotlin.math.abs(ev[it].startMs(zone) - g.startMs) <= 3 * 3600_000L }
            if (i != null) { used += i; ev[i] = ev[i].copy(gc = g) }
            else {
                val t = Instant.ofEpochMilli(g.startMs).atZone(zone).toLocalTime()
                ev += Ev(day, t.hour * 60 + t.minute, true, team.ifBlank { ev.firstOrNull { it.game }?.team ?: "" }, g.opponent, g.home, "", "", g)
            }
        }
        return ev.sortedWith(compareBy({ it.date }, { it.min ?: 12 * 60 }))
    }

    /** what's still ahead: today's events stay on until 3 hours after they start, and two weeks out at most */
    fun ahead(ev: List<Ev>, now: Long, zone: ZoneId, days: Long = 14): List<Ev> {
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        return ev.filter { e ->
            !e.date.isBefore(today) && !e.date.isAfter(today.plusDays(days)) &&
                (e.date.isAfter(today) || e.min == null || e.startMs(zone) + 3 * 3600_000L > now)
        }
    }

    /** a game on now (GameChanger says so, or it started less than 3 hours ago) */
    fun live(e: Ev, now: Long, zone: ZoneId): Boolean =
        e.game && (if (e.gc != null) Gc.phase(e.gc, now) == Gc.Phase.LIVE else e.min != null && now in e.startMs(zone)..(e.startMs(zone) + 3 * 3600_000L))

    fun dayLabel(d: LocalDate, today: LocalDate): String = when (d) {
        today -> "Today"
        today.plusDays(1) -> "Tomorrow"
        else -> d.format(if (d.isBefore(today.plusDays(7))) DateTimeFormatter.ofPattern("EEEE", Locale.US) else DateTimeFormatter.ofPattern("EEE MMM d", Locale.US))
    }

    fun timeLabel(min: Int?, h24: Boolean = false): String {
        if (min == null) return ""
        val t = LocalTime.of(min / 60, min % 60)
        return t.format(DateTimeFormatter.ofPattern(if (h24) "HH:mm" else "h:mm a", Locale.US))
    }

    /** "W 7-3" for a final, "4-3" while it's on, "" otherwise */
    fun score(e: Ev, now: Long): String {
        val g = e.gc ?: return ""
        if (g.us == null || g.them == null) return ""
        return when (Gc.phase(g, now)) {
            Gc.Phase.FINAL -> "${g.result} ${g.us}-${g.them}"
            Gc.Phase.LIVE -> "${g.us}-${g.them}"
            else -> ""
        }
    }
}
