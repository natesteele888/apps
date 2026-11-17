package com.steele.family.core

import org.json.JSONObject

/**
 * Offseason Power Program on the watch: today's workout, sent by the phone (the "pp" field of the watch link), stepped
 * through one exercise at a time. The program itself lives only in the Power Program web app; the watch never keeps a
 * copy, so the two can't drift. Ticks and "day done" go into the watch's log ("pp" entries) for the phone to take.
 */
object PowerCore {
    data class Ex(val key: String, val name: String, val reps: String, val cue: String) {
        /** seconds for a timed exercise ("20 sec", "30 sec/side", "1 min"), else 0; "/side" means it runs twice */
        val seconds: Int get() = secondsOf(reps)
        val perSide: Boolean get() = Regex("""/\s*side""", RegexOption.IGNORE_CASE).containsMatchIn(reps) && seconds > 0
    }
    data class Section(val id: String, val label: String, val rounds: Int, val ex: List<Ex>)
    data class Day(
        val day: Int, val total: Int, val week: Int, val title: String, val type: String, val time: String,
        val rest: Boolean, val sections: List<Section>, val checks: Set<String>, val done: Boolean, val streak: Int, val note: String,
    ) {
        val steps: List<Ex> get() = sections.flatMap { it.ex }
    }

    fun secondsOf(reps: String): Int {
        val r = reps.lowercase()
        Regex("""(\d+)\s*(sec|s\b)""").find(r)?.let { return it.groupValues[1].toInt().coerceIn(1, 600) }
        Regex("""(\d+)\s*min""").find(r)?.let { return (it.groupValues[1].toInt() * 60).coerceIn(1, 1800) }
        return 0
    }

    fun parse(json: String?): Day? {
        val o = try { JSONObject(json ?: return null) } catch (e: Exception) { return null }
        val day = o.optInt("day", 0); if (day <= 0) return null
        val secs = mutableListOf<Section>()
        o.optJSONArray("sections")?.let { a ->
            for (i in 0 until minOf(a.length(), 6)) {
                val s = a.optJSONObject(i) ?: continue
                val ex = mutableListOf<Ex>()
                s.optJSONArray("ex")?.let { e -> for (j in 0 until minOf(e.length(), 30)) { val x = e.optJSONObject(j) ?: continue; val k = x.optString("k"); if (k.isBlank()) continue; ex += Ex(k.take(40), x.optString("name").take(60), x.optString("reps").take(40), x.optString("cue").take(160)) } }
                if (ex.isNotEmpty()) secs += Section(s.optString("s"), s.optString("label").take(30), s.optInt("rounds", 1).coerceIn(1, 6), ex)
            }
        }
        val checks = mutableSetOf<String>()
        o.optJSONObject("checks")?.let { c -> c.keys().forEach { if (c.optBoolean(it, false) || c.optInt(it, 0) == 1) checks += it } }
        return Day(day, o.optInt("total", 63), o.optInt("week", 1), o.optString("title").take(60), o.optString("type").take(30),
            o.optString("time").take(30), o.optBoolean("rest", false), secs, checks, o.optBoolean("done", false), o.optInt("streak", 0), o.optString("note").take(200))
    }

    fun clock(sec: Int): String = "${sec / 60}:${(sec % 60).toString().padStart(2, '0')}"
}
