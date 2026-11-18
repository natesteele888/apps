package com.steele.family.core

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Fairway (the golf app, apps/fairway) on the watch: what the phone sends in the watch link's "fg" field, the yards to
 * the green from a GPS spot, the club from the golfer's bag, the round so far, the score write that goes straight to a
 * shared tournament, and Jack's answers. Kept here, away from Android, so it can be tested on its own.
 *
 * The phone's "fg" field (fairway/watch.js writes it):
 *   {v:1, at, e:<tournament code>, sh:<shared?>, r:<round>, p:<player id>, pn:<player's name>, nm:<tournament name>,
 *    ck:<course key>, cn:<course name>, st:<start hole>, h:[{p:<par>, y:<yards from their tees>, f,c,b:[lat,lon], n:[notes]}],
 *    s:{"<hole>":<strokes>}, bag:[[<club>, <yards>], ...]}
 */
object FairwayCore {
    data class Spot(val lat: Double, val lon: Double)
    data class Hole(val n: Int, val par: Int, val yards: Int, val front: Spot?, val mid: Spot?, val back: Spot?, val notes: List<String>)
    data class Club(val name: String, val yards: Int)
    data class Round(
        val code: String, val shared: Boolean, val r: Int, val pid: String, val player: String, val name: String,
        val courseKey: String, val course: String, val start: Int, val holes: List<Hole>, val scores: Map<Int, Int>,
        val bag: List<Club>, val at: Long,
    ) {
        /** the holes in the order this golfer plays them (a shotgun start on 10 plays 10..18 then 1..9) */
        val order: List<Int> get() = playOrder(holes.size, start)
        fun hole(n: Int): Hole? = holes.getOrNull(n - 1)
    }
    data class Summary(val thru: Int, val strokes: Int, val toPar: Int)

    const val YD = 1.0936133
    private val CODE = Regex("[a-z2-7]{20}")
    private val PID = Regex("[a-z0-9]{6,16}")
    const val NOTES_PER_HOLE = 5
    const val NOTE_MAX = 140

    fun playOrder(n: Int, start: Int): List<Int> {
        val s = start.coerceIn(1, maxOf(1, n))
        return (0 until n).map { ((s - 1 + it) % n) + 1 }
    }

    private fun spot(a: JSONArray?): Spot? {
        if (a == null || a.length() != 2) return null
        val lat = a.optDouble(0, Double.NaN); val lon = a.optDouble(1, Double.NaN)
        return if (lat.isFinite() && lon.isFinite() && kotlin.math.abs(lat) <= 90 && kotlin.math.abs(lon) <= 180) Spot(lat, lon) else null
    }

    /** the phone's "fg" field, or null when there's no round on the phone (or it's damaged) */
    fun parse(text: String?): Round? {
        if (text.isNullOrBlank()) return null
        return try {
            val o = JSONObject(text)
            if (o.optInt("v") != 1) return null
            val code = o.optString("e"); val pid = o.optString("p")
            val ha = o.optJSONArray("h") ?: return null
            if (ha.length() != 9 && ha.length() != 18) return null
            val holes = (0 until ha.length()).map { i ->
                val h = ha.optJSONObject(i) ?: JSONObject()
                val notes = h.optJSONArray("n")?.let { a -> (0 until a.length()).map { a.optString(it).take(NOTE_MAX) }.filter { it.isNotBlank() } } ?: emptyList()
                Hole(i + 1, h.optInt("p", 4).coerceIn(3, 6), h.optInt("y", 0).coerceIn(0, 999),
                    spot(h.optJSONArray("f")), spot(h.optJSONArray("c")), spot(h.optJSONArray("b")), notes.take(NOTES_PER_HOLE))
            }
            val so = o.optJSONObject("s") ?: JSONObject()
            val scores = mutableMapOf<Int, Int>()
            so.keys().forEach { k -> val h = k.toIntOrNull(); val v = so.optInt(k, 0); if (h != null && h in 1..holes.size && v in 1..20) scores[h] = v }
            val bag = o.optJSONArray("bag")?.let { a -> (0 until a.length()).mapNotNull { i ->
                val c = a.optJSONArray(i) ?: return@mapNotNull null
                val y = c.optInt(1, 0); val n = c.optString(0)
                if (n.isBlank() || y !in 10..400) null else Club(n.take(30), y)
            } } ?: emptyList()
            Round(code, o.optBoolean("sh") && CODE.matches(code), o.optInt("r", 1).coerceIn(1, 4), pid, o.optString("pn").take(40),
                o.optString("nm").take(60), o.optString("ck").take(80), o.optString("cn").take(60), o.optInt("st", 1),
                holes, scores, bag.sortedByDescending { it.yards }, o.optLong("at", 0))
        } catch (e: Exception) { null }
    }

    /** yards between two GPS spots */
    fun yards(a: Spot, b: Spot): Int {
        val r = 6371008.8; val rad = { x: Double -> x * Math.PI / 180 }
        val dLat = rad(b.lat - a.lat); val dLon = rad(b.lon - a.lon)
        val s = sin(dLat / 2).let { it * it } + cos(rad(a.lat)) * cos(rad(b.lat)) * sin(dLon / 2).let { it * it }
        return (2 * r * asin(min(1.0, sqrt(s))) * YD).roundToInt()
    }

    data class GreenYards(val front: Int?, val mid: Int?, val back: Int?)
    fun greenYards(h: Hole, at: Spot?): GreenYards? {
        if (at == null || (h.front == null && h.mid == null && h.back == null)) return null
        return GreenYards(h.front?.let { yards(at, it) }, h.mid?.let { yards(at, it) }, h.back?.let { yards(at, it) })
    }

    /** the club for [yds] from the bag, worded like the phone (fairway/core.js clubFor and clubWords); "" with no bag */
    fun club(bag: List<Club>, yds: Int?): String {
        if (bag.isEmpty() || yds == null || yds <= 0) return ""
        val l = bag.sortedByDescending { it.yards }
        if (yds > l.first().yards) return "${l.first().name}, and it won't get there"
        if (yds < l.last().yards - 20) return "A soft ${l.last().name.lowercase()}"
        return l.last { it.yards >= yds }.name
    }

    /** the round so far, with the watch's own scores laid over the phone's ([overlay]: hole to strokes, 0 = cleared) */
    fun merged(r: Round, overlay: Map<Int, Int>): Map<Int, Int> {
        val out = r.scores.toMutableMap()
        overlay.forEach { (h, s) -> if (s in 1..20) out[h] = s else out.remove(h) }
        return out
    }
    fun summary(r: Round, scores: Map<Int, Int>): Summary {
        var strokes = 0; var par = 0
        scores.forEach { (h, s) -> r.hole(h)?.let { strokes += s; par += it.par } }
        return Summary(scores.size, strokes, strokes - par)
    }
    fun toParText(n: Int) = when { n == 0 -> "E"; n > 0 -> "+$n"; else -> "$n" }
    /** the next hole to play: the first in play order with no score, else the last hole */
    fun nextHole(r: Round, scores: Map<Int, Int>): Int = r.order.firstOrNull { it !in scores } ?: r.order.last()
    fun scoreName(strokes: Int, par: Int): String = when {
        strokes == 1 -> "Hole in one"
        strokes - par <= -3 -> "Albatross"
        strokes - par == -2 -> "Eagle"
        strokes - par == -1 -> "Birdie"
        strokes == par -> "Par"
        strokes - par == 1 -> "Bogey"
        strokes - par == 2 -> "Double bogey"
        strokes - par == 3 -> "Triple bogey"
        else -> "+${strokes - par}"
    }

    /**
     * The score write for a shared tournament: one PATCH of the Firestore REST API that sets (or, with [strokes] null,
     * removes) only this golfer's strokes for one hole, plus "updated", so it can't touch anyone else's card. The same
     * dotted path the phone writes (p.<player>.s.<round>_<hole>). Null when the code or player id isn't one.
     * Returns the path after documents/ and the body.
     */
    fun scoreWrite(code: String, pid: String, r: Int, h: Int, strokes: Int?, now: Long): Pair<String, String>? {
        if (!CODE.matches(code) || !PID.matches(pid) || r !in 1..4 || h !in 1..18) return null
        if (strokes != null && strokes !in 1..20) return null
        val k = "${r}_$h"
        val enc = { s: String -> URLEncoder.encode(s, "UTF-8") }
        val path = "golf_events/$code?updateMask.fieldPaths=" + enc("p.`$pid`.s.`$k`") + "&updateMask.fieldPaths=updated"
        val sFields = JSONObject().apply { if (strokes != null) put(k, JSONObject().put("integerValue", strokes.toString())) }
        val m = { f: JSONObject -> JSONObject().put("mapValue", JSONObject().put("fields", f)) }
        val fields = JSONObject()
            .put("p", m(JSONObject().put(pid, m(JSONObject().put("s", m(sFields))))))
            .put("updated", JSONObject().put("integerValue", now.toString()))
        val body = JSONObject().put("fields", fields)
        return path to body.toString()
    }

    // ---------- Jack ----------
    /** what Jack says back, and a note to save for this hole when he was asked to remember something */
    /* ---------- GPS that holds still: the watch's fixes wander a few yards every couple of seconds, even standing still ---------- */
    data class Fix(val lat: Double, val lon: Double, val acc: Double, val at: Long)

    /**
     * Steadies the watch's GPS for yards. Standing still, it averages the last few seconds of fixes (the better ones count
     * more), so the number stops jumping. One wild fix (a tree, a cart barn) is ignored; two in a row mean you really moved,
     * and it starts over from where you are now.
     */
    class Steady(private val keepMs: Long = 10_000, private val moved: Double = 10.0) {
        private val fixes = ArrayDeque<Fix>()
        private var far: Fix? = null
        fun reset() { fixes.clear(); far = null }
        fun add(f: Fix): Spot {
            while (fixes.isNotEmpty() && f.at - fixes.first().at > keepMs) fixes.removeFirst()
            far?.let { if (f.at - it.at > keepMs) far = null }
            // a much better fix than any so far (the GPS just locked on) wins outright
            if (fixes.isNotEmpty() && f.acc < 0.6 * fixes.minOf { it.acc }) { fixes.clear(); far = null }
            val now = mean()
            // with nothing but rough fixes so far, rough ones average together rather than the first one sticking
            val roughOnly = fixes.isNotEmpty() && fixes.minOf { it.acc } >= 25.0
            if (now != null && metres(now, Spot(f.lat, f.lon)) > maxOf(moved, minOf(f.acc, 25.0), if (roughOnly) 1.5 * f.acc else 0.0)) {
                // a rough fix (the phone network's, say) far from a good GPS lock is the rough one, never a move
                if (f.acc > 2 * fixes.minOf { it.acc }) return now
                val before = far
                // two wild fixes in a row aren't a move either if getting there would take faster than a cart (8 m/s)
                val tooFast = fixes.isNotEmpty() && metres(now, Spot(f.lat, f.lon)) / maxOf(1.0, (f.at - fixes.last().at) / 1000.0) > 8.0
                if (before == null || tooFast || metres(Spot(before.lat, before.lon), Spot(f.lat, f.lon)) > 2 * moved) { far = f; return now }
                fixes.clear(); fixes.addLast(before)
            }
            far = null
            fixes.addLast(f)
            return mean()!!
        }
        private fun mean(): Spot? {
            if (fixes.isEmpty()) return null
            var w = 0.0; var la = 0.0; var lo = 0.0
            fixes.forEach { x -> val k = 1.0 / maxOf(3.0, x.acc).let { it * it }; w += k; la += x.lat * k; lo += x.lon * k }
            return Spot(la / w, lo / w)
        }
    }
    fun metres(a: Spot, b: Spot): Double {
        val r = 6371008.8; val p1 = Math.toRadians(a.lat); val p2 = Math.toRadians(b.lat)
        val dp = p2 - p1; val dl = Math.toRadians(b.lon - a.lon)
        val x = Math.sin(dp / 2).let { it * it } + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2).let { it * it }
        return 2 * r * Math.asin(Math.min(1.0, Math.sqrt(x)))
    }

    /* ---------- scores the watch still has to send (shared tournaments), when there's no signal for a few holes ---------- */
    data class Pending(val code: String, val pid: String, val r: Int, val h: Int, val s: Int)
    /** only the last tap on each hole needs to go: three taps on + while out of signal are one write, not three */
    fun collapse(q: List<Pending>): List<Pending> {
        val last = LinkedHashMap<String, Pending>()
        q.forEach { p -> val k = "${p.code}|${p.pid}|${p.r}|${p.h}"; last.remove(k); last[k] = p }
        return last.values.toList()
    }

    data class Flush(val sent: List<Pending>, val toPhone: List<Pending>)
    /**
     * Sends the waiting scores, oldest first. [send] returns the server's answer, or null with no signal. No signal or a
     * server hiccup (5xx) stops it, to try again at the next look. A refusal (4xx: the tournament is gone, or its rules
     * aren't switched on) won't get better by trying again, so that score goes to the phone through the watch log instead
     * of being lost.
     */
    fun flush(q: List<Pending>, now: Long, send: (String, String) -> Int?): Flush {
        val sent = ArrayList<Pending>(); val phone = ArrayList<Pending>()
        for (p in collapse(q)) {
            val w = scoreWrite(p.code, p.pid, p.r, p.h, p.s.takeIf { it in 1..20 }, now)
            if (w == null) { sent += p; continue }
            val code = send(w.first, w.second) ?: break
            when (code) {
                in 200..299 -> sent += p
                in 400..499 -> { sent += p; phone += p }
                else -> break
            }
        }
        return Flush(sent, phone)
    }

    data class Answer(val text: String, val note: String? = null)

    private fun has(t: String, vararg w: String) = w.any { t.contains(it) }

    /**
     * Jack on the watch, without the AI brain: he answers from what the watch knows (yards from the GPS, the bag, the
     * round and the hole's notes). [said] is what the speech recognizer heard.
     */
    fun jack(said: String, r: Round, h: Hole, here: GreenYards?, scores: Map<Int, Int>): Answer {
        val body = said.trim().replace(Regex("^(hey|hi|ok|okay|a)?\\s*jacks?[,.!]?\\s*", RegexOption.IGNORE_CASE), "").trim()
        val t = body.lowercase()
        val mid = here?.mid
        val toGo = mid ?: if (scores[h.n] == null && h.yards > 0) h.yards else null
        val m = Regex("^(remember( that)?|make a note( that)?|note( that)?|save a note( that)?)[:,]?(\\s+|$)", RegexOption.IGNORE_CASE).find(body)
        return when {
            m != null -> {
                val note = body.substring(m.range.last + 1).trim().replaceFirstChar { it.uppercase() }.take(NOTE_MAX)
                if (note.isBlank()) Answer("What should I remember about hole ${h.n}?")
                else Answer("Got it. Next time on hole ${h.n}: $note", note)
            }
            has(t, "notes", "what do i know", "what do you know", "tell me about", "anything i should know", "what's the trouble", "trouble") ->
                if (h.notes.isEmpty()) Answer("No notes on hole ${h.n} yet. Say \"remember\" and what you want me to keep.")
                else Answer("Hole ${h.n}: " + h.notes.joinToString(". ") { it.trimEnd('.') } + ".")
            has(t, "club", "what do i hit", "what should i hit", "what am i hitting", "what to hit", "the play", "play here", "what's the shot") -> {
                val c = club(r.bag, toGo)
                when {
                    r.bag.isEmpty() -> Answer("Set up My bag in Fairway on your phone and I'll pick the club.")
                    toGo == null -> Answer("I need your yards first. Mark the green on this hole once and I'll know.")
                    else -> Answer("$toGo to go${if (mid == null) " from the tee" else " to the middle"}. $c.")
                }
            }
            has(t, "how far", "yard", "distance", "how long", "front", "back", "middle", "green", "number", "pin", "flag") -> when {
                here != null && (here.mid != null || here.front != null || here.back != null) -> Answer(listOfNotNull(
                    here.mid?.let { "$it to the middle" }, here.front?.let { "$it to the front" }, here.back?.let { "$it to the back" },
                ).joinToString(", ").replaceFirstChar { it.uppercase() } + ".")
                h.yards > 0 -> Answer("${h.yards} from your tees. No green marked here yet.")
                else -> Answer("I don't have yards for hole ${h.n}. Mark the green when you're on it and I'll know next time.")
            }
            has(t, "score", "how am i doing", "how'm i doing", "where am i", "how am i", "where do i stand", "what am i at", "what did i shoot") -> {
                val s = summary(r, scores)
                if (s.thru == 0) Answer("No scores yet. Hole ${h.n}, par ${h.par}. Go get it.")
                else Answer("You're ${spokenPar(s.toPar)} through ${s.thru}, ${s.strokes} strokes.")
            }
            has(t, "par", "what hole", "which hole", "this hole") -> Answer("Hole ${h.n}, par ${h.par}" + (if (h.yards > 0) ", ${h.yards} yards." else "."))
            else -> Answer("I do yards, a club, your score and notes. Ask me one of those.")
        }
    }
    fun spokenPar(n: Int) = when { n == 0 -> "even"; n > 0 -> "$n over"; else -> "${-n} under" }
}
