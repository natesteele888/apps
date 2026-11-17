package com.steele.family.core

import org.json.JSONObject
import java.time.LocalDate

/**
 * Get Ready on the watch: the parts of getready/core.js the watch needs, read from the phone's copy of the lists
 * (the "gr" field of the watch link). The phone owns the lists; the watch only ticks and unticks, and each tap goes
 * into the watch's log ("gr" entries) for the phone to take. Until the phone has taken a tap, the watch lays it over
 * the phone's copy: a tap counts when it is newer than the phone's last change to that day.
 */
object GrCore {
    data class Item(val id: String, val name: String, val timer: Int)
    data class Lst(val id: String, val name: String, val days: List<Int>, val items: List<Item>)
    data class Day(val checked: Set<String>, val done: Boolean, val m: Long, val list: String?)
    data class State(val lists: List<Lst>, val days: Map<String, Day>) {
        val empty get() = lists.isEmpty()
    }
    /** one tap on the watch */
    data class Tap(val day: String, val item: String, val on: Boolean, val at: Long)

    val NONE = State(emptyList(), emptyMap())

    fun dayKey(d: LocalDate): String = d.toString()
    /** 0 = Sunday, like JavaScript's getDay() */
    fun dow(k: String): Int = LocalDate.parse(k).dayOfWeek.value % 7

    fun parse(json: String?): State {
        if (json.isNullOrBlank()) return NONE
        val o = try { JSONObject(json) } catch (e: Exception) { return NONE }
        val lists = mutableListOf<Lst>()
        val la = o.optJSONArray("lists")
        if (la != null) for (i in 0 until minOf(la.length(), 12)) {
            val l = la.optJSONObject(i) ?: continue
            val items = mutableListOf<Item>()
            val ia = l.optJSONArray("items")
            if (ia != null) for (j in 0 until minOf(ia.length(), 60)) {
                val it = ia.optJSONObject(j) ?: continue
                val id = it.optString("id"); val name = it.optString("name").trim()
                if (id.isBlank() || name.isBlank()) continue
                items += Item(id.take(30), name.take(40), it.optInt("timer", 0).coerceIn(0, 3600))
            }
            val days = mutableListOf<Int>()
            l.optJSONArray("days")?.let { for (j in 0 until it.length()) { val d = it.optInt(j, -1); if (d in 0..6) days += d } }
            lists += Lst(l.optString("id").ifBlank { "l$i" }, l.optString("name").ifBlank { "My list" }.take(30), days, items)
        }
        val days = mutableMapOf<String, Day>()
        o.optJSONObject("days")?.let { dd ->
            dd.keys().forEach { k ->
                val v = dd.optJSONObject(k) ?: return@forEach
                if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(k)) return@forEach
                val c = mutableSetOf<String>()
                v.optJSONObject("c")?.let { cc -> cc.keys().forEach { id -> if (cc.optInt(id, 0) != 0 || cc.optBoolean(id, false)) c += id } }
                days[k] = Day(c, v.optInt("done", 0) != 0, v.optLong("m", 0L), v.optString("l").ifBlank { null })
            }
        }
        return State(lists, days)
    }

    /** the list a day uses: the one picked for that date, else the one for its weekday, else none (a day off) */
    fun listFor(s: State, k: String): Lst? {
        val pick = s.days[k]?.list?.let { id -> s.lists.firstOrNull { it.id == id } }
        return pick ?: s.lists.firstOrNull { dow(k) in it.days }
    }

    /** the phone's copy with the watch's taps that the phone hasn't taken yet laid over it */
    fun withTaps(s: State, taps: List<Tap>): State {
        if (taps.isEmpty()) return s
        val days = s.days.toMutableMap()
        taps.sortedBy { it.at }.forEach { t ->
            val d = days[t.day] ?: Day(emptySet(), false, 0L, null)
            if (t.at <= d.m) return@forEach // the phone has this tap already, or changed the day after it
            val c = if (t.on) d.checked + t.item else d.checked - t.item
            days[t.day] = d.copy(checked = c, m = t.at)
        }
        // on the days the watch changed, done follows the check marks
        val out = State(s.lists, days)
        val touched = taps.map { it.day }.toSet()
        return State(s.lists, days.mapValues { (k, d) -> if (k in touched) d.copy(done = complete(out, k)) else d })
    }

    fun checked(s: State, k: String, id: String) = s.days[k]?.checked?.contains(id) == true
    fun count(s: State, k: String) = listFor(s, k)?.items?.count { checked(s, k, it.id) } ?: 0
    fun complete(s: State, k: String): Boolean {
        val items = listFor(s, k)?.items ?: return false
        return items.isNotEmpty() && items.all { checked(s, k, it.id) }
    }
    private fun done(s: State, k: String) = s.days[k]?.done == true || complete(s, k)

    /** days in a row with the whole list ticked; days with no list are skipped, and an unfinished today doesn't break it */
    fun streak(s: State, today: String): Int {
        var d = LocalDate.parse(today)
        if (!done(s, today)) d = d.minusDays(1)
        var n = 0
        repeat(800) {
            val k = dayKey(d)
            if (done(s, k)) n++ else if (listFor(s, k) != null) return n
            d = d.minusDays(1)
        }
        return n
    }

    fun timerLabel(sec: Int): String = when {
        sec <= 0 -> ""
        sec < 60 -> "$sec sec"
        sec % 60 == 0 -> "${sec / 60} min"
        else -> "${sec / 60}:${(sec % 60).toString().padStart(2, '0')}"
    }
}
