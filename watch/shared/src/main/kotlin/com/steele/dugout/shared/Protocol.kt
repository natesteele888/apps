package com.steele.dugout.shared

import org.json.JSONObject

/** How the phone app and the watch app talk, over Google's Wear OS link (nothing goes to the internet). */
object Paths {
    /** phone to watch: who is up, the batting order, what is playing (a message) */
    const val STATE = "/walkup/state"
    /** watch to phone: hello, select, play, stop (a message) */
    const val CMD = "/walkup/cmd"
    /** each side's pitch log (a synced data item; it waits and syncs later if the two are apart) */
    const val PITCH = "/pitch/log"
    /** one batter's background photo, set on the phone (a synced data item with the picture) */
    const val PHOTO = "/walkup/photo/"

    private val ID = Regex("^[A-Za-z0-9_-]{1,60}$")
    fun safeId(id: String?): Boolean = id != null && ID.matches(id)
}

data class Batter(val id: String, val name: String, val num: String, val pos: String, val ready: Boolean, val code: String)

data class Playing(val id: String?, val label: String, val elapsed: Double, val total: Double)

/** What the watch shows in Batting mode. [receivedAt] is set by the watch when it arrives. */
data class BatState(
    val ready: Boolean,
    val batter: Int,
    val lineup: List<Batter>,
    val playing: Playing?,
    val loading: String?,
    val error: String?,
    val errorAt: Long,
    val speakerOn: Boolean,
    val speakerName: String,
    val receivedAt: Long = 0,
) {
    val busy: Boolean get() = playing != null || loading != null
}

/** optString, but JSON null and a missing key are both "" (org.json would give "null"). */
fun JSONObject.str(key: String): String = if (isNull(key)) "" else optString(key, "")

object Proto {
    fun parseState(json: String, now: Long): BatState? = try {
        val o = JSONObject(json)
        val arr = o.optJSONArray("lineup")
        val lineup = ArrayList<Batter>()
        if (arr != null) for (i in 0 until arr.length()) {
            val b = arr.optJSONObject(i) ?: continue
            val id = b.str("id")
            if (!Paths.safeId(id)) continue
            lineup.add(Batter(id, b.str("name").take(60), b.str("num").take(4), b.str("pos").take(6), b.optBoolean("ready"), b.str("code")))
        }
        val p = o.optJSONObject("playing")
        val playing = if (p == null) null else Playing(
            p.str("id").takeIf { Paths.safeId(it) }, p.str("label").take(80),
            p.optDouble("elapsed", 0.0).let { if (it.isFinite()) it else 0.0 }, p.optDouble("total", 0.0).let { if (it.isFinite()) it else 0.0 })
        val err = o.optJSONObject("error")
        val sp = o.optJSONObject("speaker")
        BatState(
            ready = o.optBoolean("ready"),
            batter = o.optInt("batter", 0).coerceIn(0, maxOf(0, lineup.size - 1)),
            lineup = lineup,
            playing = playing,
            loading = o.str("loading").takeIf { Paths.safeId(it) },
            error = err?.str("msg")?.take(120),
            errorAt = err?.optLong("at") ?: 0,
            speakerOn = sp?.optBoolean("on") ?: false,
            speakerName = sp?.str("name")?.take(40) ?: "",
            receivedAt = now,
        )
    } catch (e: Exception) { null }

    fun cmd(name: String, vararg extra: Pair<String, Any>): String {
        val o = JSONObject().put("cmd", name)
        for ((k, v) in extra) o.put(k, v)
        return o.toString()
    }
}
