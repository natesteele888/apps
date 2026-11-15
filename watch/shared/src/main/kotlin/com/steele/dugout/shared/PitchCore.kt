package com.steele.dugout.shared

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToLong
import kotlin.random.Random

/*
 * The pitch log, the same as walkup/pitch-core.js on the phone's web page, so the watch can count on its own and merge later.
 * The log is a list of small events, each with its own id; a merge keeps every event once, so no pitch is counted twice.
 *   k "p": one pitch by pitcher p
 *   k "u": undo of event x
 *   k "s": pitcher p (name n) is now on the mound
 * Counts are per calendar day. Limits are MAC League's Spring daily max and rest days, as in LYBS Ballclub.
 */

data class Pitcher(val id: String, val name: String, val limit: Int = 0, val club: Boolean = false)

data class PitchEvent(val i: String, val k: String, val p: String = "", val x: String = "", val n: String = "", val t: Long)

data class PitchLog(
    val division: String = "Majors",
    val max: Int = 0,
    val pitchers: List<Pitcher> = emptyList(),
    val setupAt: Long = 0,
    val events: List<PitchEvent> = emptyList(),
)

data class Rule(val dailyMax: Int, val tiers: List<IntArray>)

data class Row(
    val id: String, val name: String, val count: Int, val limit: Int, val left: Int, val zone: Zone,
    val eligible: Boolean, val eligibleOn: String?, val restAfter: Int,
)

enum class Zone { GREEN, YELLOW, RED, LIMIT }

data class RestStep(val at: Int, val rest: Int)

data class Merged(val log: PitchLog, val changed: Boolean, val added: Int)

object PitchCore {
    private val TIERS = listOf(intArrayOf(1, 20, 0), intArrayOf(21, 35, 1), intArrayOf(36, 50, 2), intArrayOf(51, 65, 3), intArrayOf(66, 999, 4))
    val RULES: Map<String, Rule> = mapOf(
        "Majors" to Rule(85, TIERS),
        "Minors" to Rule(75, TIERS),
        "Juniors" to Rule(95, TIERS),
        "Seniors" to Rule(105, listOf(intArrayOf(1, 30, 0), intArrayOf(31, 45, 1), intArrayOf(46, 60, 2), intArrayOf(61, 80, 3), intArrayOf(81, 999, 4))),
    )
    val DIVISIONS = listOf("Majors", "Minors", "Juniors", "Seniors", "None")
    const val MAX_PITCHERS = 40
    const val MAX_EVENTS = 4000
    const val MAX_NAME = 40
    const val KEEP_DAYS = 3
    private val ID_RE = Regex("^[A-Za-z0-9_-]{4,40}$")
    private const val ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789"

    /** the time zone days are counted in (the device's own); tests set it */
    var tz: ZoneId = ZoneId.systemDefault()

    fun ymd(ms: Long): String = Instant.ofEpochMilli(ms).atZone(tz).toLocalDate().toString()
    fun addDays(day: String, n: Int): String = LocalDate.parse(day).plusDays(n.toLong()).toString()
    fun uid(prefix: String = "e"): String = prefix + (1..10).map { ALPHA[Random.nextInt(ALPHA.length)] }.joinToString("")

    private fun str(x: Any?, max: Int): String =
        if (x is String) x.replace(Regex("[\\u0000-\\u001f]"), " ").trim().take(max) else ""

    private fun num(x: Any?): Double? = when (x) {
        is Number -> x.toDouble()
        is String -> x.trim().toDoubleOrNull()
        JSONObject.NULL -> 0.0
        else -> null
    }

    private fun int(x: Any?, lo: Long, hi: Long, dflt: Long): Long {
        val n = num(x) ?: return dflt
        if (!n.isFinite()) return dflt
        return n.roundToLong().coerceIn(lo, hi)
    }

    /* ---------- reading and writing ---------- */
    fun parse(json: String?): PitchLog = try { sanitize(JSONObject(json ?: "{}")) } catch (e: Exception) { PitchLog() }

    fun sanitize(r: JSONObject): PitchLog {
        val division = r.opt("division").let { if (it is String && it in DIVISIONS) it else "Majors" }
        val seenP = HashSet<String>()
        val pitchers = ArrayList<Pitcher>()
        r.optJSONArray("pitchers")?.let { a ->
            for (i in 0 until a.length()) {
                val p = a.optJSONObject(i) ?: continue
                val rawId = p.opt("id")
                val id = if (rawId is String && ID_RE.matches(rawId) && rawId !in seenP) rawId else uid("p")
                val name = str(p.opt("name"), MAX_NAME)
                if (name.isEmpty()) continue
                seenP.add(id)
                pitchers.add(Pitcher(id, name, int(p.opt("limit"), 0, 200, 0).toInt(), p.opt("club") == true))
            }
        }
        val seenE = HashSet<String>()
        val events = ArrayList<PitchEvent>()
        r.optJSONArray("events")?.let { a ->
            for (i in 0 until a.length()) {
                val e = a.optJSONObject(i)?.let { sanitizeEvent(it) } ?: continue
                if (!seenE.add(e.i)) continue
                events.add(e)
            }
        }
        events.sortWith(compareBy<PitchEvent> { it.t }.thenBy { it.i })
        val kept = if (events.size > MAX_EVENTS) events.subList(events.size - MAX_EVENTS, events.size).toList() else events
        return PitchLog(division, int(r.opt("max"), 0, 200, 0).toInt(), pitchers.take(MAX_PITCHERS), int(r.opt("setupAt"), 0, 9_000_000_000_000_000L, 0), kept)
    }

    private fun idOk(x: Any?): Boolean = x is String && ID_RE.matches(x)

    private fun sanitizeEvent(r: JSONObject): PitchEvent? {
        val i = r.opt("i")
        if (!idOk(i)) return null
        val t = num(r.opt("t")) ?: return null
        if (!t.isFinite() || t <= 0) return null
        val tl = t.toLong()
        return when (r.opt("k")) {
            "p" -> if (idOk(r.opt("p"))) PitchEvent(i as String, "p", p = r.getString("p"), t = tl) else null
            "u" -> if (idOk(r.opt("x"))) PitchEvent(i as String, "u", x = r.getString("x"), t = tl) else null
            "s" -> if (idOk(r.opt("p"))) PitchEvent(i as String, "s", p = r.getString("p"), n = str(r.opt("n"), MAX_NAME), t = tl) else null
            else -> null
        }
    }

    fun toJson(log: PitchLog): JSONObject {
        val ps = JSONArray()
        log.pitchers.forEach { ps.put(JSONObject().put("id", it.id).put("name", it.name).put("limit", it.limit).put("club", it.club)) }
        val es = JSONArray()
        log.events.forEach { e ->
            val o = JSONObject().put("i", e.i).put("k", e.k).put("t", e.t)
            when (e.k) {
                "p" -> o.put("p", e.p)
                "u" -> o.put("x", e.x)
                "s" -> o.put("p", e.p).put("n", e.n)
            }
            es.put(o)
        }
        return JSONObject().put("v", 1).put("division", log.division).put("max", log.max).put("pitchers", ps).put("setupAt", log.setupAt).put("events", es)
    }

    /** Everything from both sides once. The pitcher list and limits come from whichever side changed them last.
     *  Events older than [cutoff] (a YYYY-MM-DD day) are left out. */
    fun merge(mine: PitchLog, theirs: PitchLog, cutoff: String?): Merged {
        val have = HashSet<String>()
        mine.events.forEach { have.add(it.i) }
        val events = ArrayList(mine.events)
        var added = 0
        for (e in theirs.events) {
            if (e.i in have) continue
            if (cutoff != null && ymd(e.t) < cutoff) continue
            have.add(e.i); events.add(e); added++
        }
        events.sortWith(compareBy<PitchEvent> { it.t }.thenBy { it.i })
        val trimmed = if (events.size > MAX_EVENTS) events.subList(events.size - MAX_EVENTS, events.size).toList() else events
        val setup = theirs.setupAt > mine.setupAt
        val out = if (setup) PitchLog(theirs.division, theirs.max, theirs.pitchers, theirs.setupAt, trimmed) else mine.copy(events = trimmed)
        return Merged(out, added > 0 || setup, added)
    }

    /* ---------- counts and limits ---------- */
    private fun undone(log: PitchLog): Set<String> = log.events.filter { it.k == "u" }.map { it.x }.toHashSet()

    fun counts(log: PitchLog, day: String): Map<String, Int> {
        val u = undone(log)
        val c = LinkedHashMap<String, Int>()
        log.events.forEach { e -> if (e.k == "p" && e.i !in u && ymd(e.t) == day) c[e.p] = (c[e.p] ?: 0) + 1 }
        return c
    }

    private fun namesFromEvents(log: PitchLog): Map<String, String> {
        val n = HashMap<String, String>()
        log.events.forEach { if (it.k == "s" && it.n.isNotEmpty()) n[it.p] = it.n }
        return n
    }

    fun pitcherById(log: PitchLog, id: String): Pitcher? = log.pitchers.firstOrNull { it.id == id }
    fun nameOf(log: PitchLog, id: String): String = pitcherById(log, id)?.name ?: namesFromEvents(log)[id] ?: "Pitcher"

    /** who is on the mound today: the last "s" event today, or nobody */
    fun current(log: PitchLog, day: String): Pair<String, String>? {
        for (e in log.events.asReversed()) {
            if (ymd(e.t) != day) continue
            if (e.k == "s") return e.p to nameOf(log, e.p)
        }
        return null
    }

    /** the smallest of the league's daily max, the team's own max and this pitcher's own limit; 0 means no limit */
    fun limitFor(log: PitchLog, pitcherId: String): Int {
        val vals = ArrayList<Int>()
        RULES[log.division]?.let { vals.add(it.dailyMax) }
        if (log.max > 0) vals.add(log.max)
        pitcherById(log, pitcherId)?.let { if (it.limit > 0) vals.add(it.limit) }
        return vals.minOrNull() ?: 0
    }

    /** green while well under, yellow at 10 left, red at 5 left, limit at 0 */
    fun zone(left: Int, limit: Int): Zone = when {
        limit == 0 -> Zone.GREEN
        left <= 0 -> Zone.LIMIT
        left <= 5 -> Zone.RED
        left <= 10 -> Zone.YELLOW
        else -> Zone.GREEN
    }

    fun restDaysFor(pitches: Int, division: String): Int {
        val t = RULES[division]?.tiers ?: return 0
        if (pitches <= 0) return 0
        for (r in t) if (pitches >= r[0] && pitches <= r[1]) return r[2]
        return t.last()[2]
    }

    /** the next pitch count that adds a rest day, or null */
    fun nextRestStep(pitches: Int, division: String): RestStep? {
        val t = RULES[division]?.tiers ?: return null
        val now = restDaysFor(pitches, division)
        for (r in t) if (r[0] > pitches && r[2] > now) return RestStep(r[0], r[2])
        return null
    }

    /** One row per pitcher: everyone on the list, plus anyone who pitched today but isn't on it.
     *  [resting] is from the phone (pitcher id to the day they can pitch again), worked out there from Ballclub and past days. */
    fun bullpen(log: PitchLog, day: String, resting: Map<String, String>): List<Row> {
        val c = counts(log, day)
        val names = namesFromEvents(log)
        val rows = ArrayList<Row>()
        val seen = HashSet<String>()
        fun row(id: String, name: String) {
            val n = c[id] ?: 0
            val lim = limitFor(log, id)
            val left = if (lim > 0) lim - n else 0
            val on = resting[id]?.takeIf { it > day }
            seen.add(id)
            rows.add(Row(id, name, n, lim, left, zone(left, lim), on == null, on, restDaysFor(n, log.division)))
        }
        log.pitchers.forEach { row(it.id, it.name) }
        c.keys.forEach { if (it !in seen) row(it, names[it] ?: nameOf(log, it)) }
        return rows
    }

    /* ---------- changes: each returns the new log ---------- */
    fun addPitch(log: PitchLog, pitcherId: String, now: Long): PitchLog =
        log.copy(events = log.events + PitchEvent(uid("e"), "p", p = pitcherId, t = now))

    fun setCurrent(log: PitchLog, pitcherId: String, name: String, now: Long): PitchLog =
        log.copy(events = log.events + PitchEvent(uid("e"), "s", p = pitcherId, n = str(name, MAX_NAME), t = now))

    /** undo the newest pitch of this pitcher today that isn't undone yet; null if there is none */
    fun undo(log: PitchLog, pitcherId: String, day: String, now: Long): PitchLog? {
        val u = undone(log)
        for (e in log.events.asReversed()) {
            if (e.k == "p" && e.p == pitcherId && e.i !in u && ymd(e.t) == day) {
                return log.copy(events = log.events + PitchEvent(uid("e"), "u", x = e.i, t = maxOf(now, e.t + 1)))
            }
        }
        return null
    }

    /** the watch keeps only the last few days; the phone keeps the history */
    fun trimOld(log: PitchLog, today: String): PitchLog {
        val cutoff = addDays(today, -KEEP_DAYS)
        val keep = log.events.filter { ymd(it.t) >= cutoff }
        return if (keep.size == log.events.size) log else log.copy(events = keep)
    }

    fun cutoff(today: String): String = addDays(today, -KEEP_DAYS)
}
