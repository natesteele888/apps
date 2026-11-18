package com.steele.dugout.shared

import org.json.JSONObject

/** How the phone app and the watch app talk, over Google's Wear OS link (nothing goes to the internet). */
object Paths {
    /** phone to watch: who is up, the batting order, what is playing (a message) */
    const val STATE = "/walkup/state"
    /** watch to phone: hello, select, play, stop, extend, swap, and the game sounds: sound, queue, unqueue, upnext (a message) */
    const val CMD = "/walkup/cmd"
    /** each side's pitch log (a synced data item; it waits and syncs later if the two are apart) */
    const val PITCH = "/pitch/log"
    /** one batter's background photo, set on the phone (a synced data item with the picture) */
    const val PHOTO = "/walkup/photo/"

    private val ID = Regex("^[A-Za-z0-9_-]{1,60}$")
    fun safeId(id: String?): Boolean = id != null && ID.matches(id)
}

/** [inn]: where the batter plays in each inning ("P", "SS", [Lineup.BENCH] or "" when not set), from Walk-Up's Positions by inning; empty when none */
data class Batter(val id: String, val name: String, val num: String, val pos: String, val ready: Boolean, val code: String, val inn: List<String> = emptyList())

/**
 * [id]: the batter whose walk-up is playing, or null; [board]: the game sound that is playing instead, or null.
 * [ext]: seconds the song can keep playing past its clip if the coach holds (0: it can't); [extended]: it already is
 */
data class Playing(val id: String?, val label: String, val elapsed: Double, val total: Double, val ext: Int = 0, val extended: Boolean = false, val board: String? = null)

/** a game sound button (the anthem, music between innings, the coach's own clips); [ready]: it has a sound on the phone */
data class Sound(val id: String, val label: String, val ready: Boolean)

/** What the watch shows in Batting mode. [receivedAt] is set by the watch when it arrives. */
data class BatState(
    val ready: Boolean,
    val batter: Int,
    val lineup: List<Batter>,
    /** everyone on the team who isn't in the batting order, to swap in from the watch */
    val bench: List<Batter> = emptyList(),
    val playing: Playing?,
    val loading: String?,
    val error: String?,
    val errorAt: Long,
    val speakerOn: Boolean,
    val speakerName: String,
    val receivedAt: Long = 0,
    /** seconds the watch counts down after the hold-to-play ring closes, so a tap can cancel before any sound (set on the phone) */
    val delay: Int = Proto.DEFAULT_DELAY,
    /** the game sound buttons, in the coach's order, and what waits in Up next (it plays by itself when the sound before it ends) */
    val board: List<Sound> = emptyList(),
    val queue: List<Sound> = emptyList(),
    /** innings in the game when Walk-Up has positions by inning (the Lineup card), else 0; [inning]: the inning being played, 0 if unknown */
    val innings: Int = 0,
    val inning: Int = 0,
) {
    val busy: Boolean get() = playing != null || loading != null
}

/** optString, but JSON null and a missing key are both "" (org.json would give "null"). */
fun JSONObject.str(key: String): String = if (isNull(key)) "" else optString(key, "")

object Proto {
    /** the countdown before a song, in seconds: 2 unless the coach changes it, never more than [MAX_DELAY] */
    const val DEFAULT_DELAY = 2
    const val MAX_DELAY = 5

    /** the phone's countdown setting; a phone app from before the setting sends none, which means the default */
    fun delay(o: JSONObject): Int = if (!o.has("delay") || o.isNull("delay")) DEFAULT_DELAY else o.optInt("delay", DEFAULT_DELAY).coerceIn(0, MAX_DELAY)

    fun parseState(json: String, now: Long): BatState? = try {
        val o = JSONObject(json)
        val lineup = batters(o, "lineup")
        val bench = batters(o, "bench").filter { b -> lineup.none { it.id == b.id } }
        val p = o.optJSONObject("playing")
        val playing = if (p == null) null else Playing(
            p.str("id").takeIf { Paths.safeId(it) }, p.str("label").take(80),
            p.optDouble("elapsed", 0.0).let { if (it.isFinite()) it else 0.0 }, p.optDouble("total", 0.0).let { if (it.isFinite()) it else 0.0 },
            p.optInt("ext", 0).coerceIn(0, 60), p.optBoolean("extended", false), p.str("board").takeIf { Paths.safeId(it) })
        val err = o.optJSONObject("error")
        val sp = o.optJSONObject("speaker")
        BatState(
            ready = o.optBoolean("ready"),
            batter = o.optInt("batter", 0).coerceIn(0, maxOf(0, lineup.size - 1)),
            lineup = lineup,
            bench = bench,
            playing = playing,
            loading = o.str("loading").takeIf { Paths.safeId(it) },
            error = err?.str("msg")?.take(120),
            errorAt = err?.optLong("at") ?: 0,
            speakerOn = sp?.optBoolean("on") ?: false,
            speakerName = sp?.str("name")?.take(40) ?: "",
            receivedAt = now,
            delay = delay(o),
            board = sounds(o, "board"),
            queue = sounds(o, "queue"),
            innings = o.optInt("innings", 0).coerceIn(0, Lineup.MAX_INNINGS),
            inning = o.optInt("inning", 0).coerceIn(0, Lineup.MAX_INNINGS),
        )
    } catch (e: Exception) { null }

    private fun batters(o: JSONObject, key: String): List<Batter> {
        val arr = o.optJSONArray(key) ?: return emptyList()
        val out = ArrayList<Batter>()
        for (i in 0 until minOf(arr.length(), 60)) {
            val b = arr.optJSONObject(i) ?: continue
            val id = b.str("id")
            if (!Paths.safeId(id) || out.any { it.id == id }) continue
            out.add(Batter(id, b.str("name").take(60), b.str("num").take(4), b.str("pos").take(12), b.optBoolean("ready"), b.str("code"), Lineup.row(b.optJSONArray("inn"))))
        }
        return out
    }

    private fun sounds(o: JSONObject, key: String): List<Sound> {
        val arr = o.optJSONArray(key) ?: return emptyList()
        val out = ArrayList<Sound>()
        for (i in 0 until minOf(arr.length(), 20)) {
            val b = arr.optJSONObject(i) ?: continue
            val id = b.str("id")
            if (!Paths.safeId(id) || out.any { it.id == id }) continue
            out.add(Sound(id, b.str("label").take(40).ifBlank { "Sound" }, if (b.has("ready")) b.optBoolean("ready") else true))
        }
        return out
    }

    /** the batting order goes round: after the last batter comes the leadoff batter again */
    fun wrap(i: Int, n: Int): Int = if (n <= 0) 0 else ((i % n) + n) % n

    /** swap bench player [inId] into [outId]'s spot in the batting order */
    fun swap(outId: String, inId: String): String = cmd("swap", "out" to outId, "in" to inId)

    fun cmd(name: String, vararg extra: Pair<String, Any>): String {
        val o = JSONObject().put("cmd", name)
        for ((k, v) in extra) o.put(k, v)
        return o.toString()
    }
}
