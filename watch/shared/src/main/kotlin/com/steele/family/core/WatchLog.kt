package com.steele.family.core

import org.json.JSONArray
import org.json.JSONObject

/**
 * The watch's log in the watch link (the "w" field): what happened on the watch, for the phone apps to take. Only the
 * watch writes it, so it is simply the watch's own list, newest last, capped. Each phone app takes the entries for
 * it once (it remembers their ids). See watchlink.js at the top of the apps repo for the whole picture.
 */
object WatchLog {
    const val MAX = 400
    private const val KEEP_MS = 45L * 24 * 3600 * 1000

    /** a new entry: [app] is "gr", "cc", "pp" or "r20"; [fields] is what that app needs */
    fun entry(app: String, at: Long, id: String, fields: Map<String, Any?>): JSONObject {
        val o = JSONObject().put("id", id).put("a", app).put("at", at)
        fields.forEach { (k, v) -> if (v != null) o.put(k, v) }
        return o
    }

    /** the stored log (as kept on the watch) plus [add], old and surplus entries dropped */
    fun append(stored: String?, add: List<JSONObject>, now: Long): JSONArray {
        val all = mutableListOf<JSONObject>()
        try { val a = JSONArray(stored ?: "[]"); for (i in 0 until a.length()) a.optJSONObject(i)?.let { all += it } } catch (e: Exception) {}
        all += add
        val kept = all.filter { now - it.optLong("at", 0) < KEEP_MS }.takeLast(MAX)
        return JSONArray().apply { kept.forEach { put(it) } }
    }

    /** the text that goes in the "w" field: {v, uid, e:[...]}; [uid] is the watch's sign-in for Gameday Picks, if any */
    fun field(log: JSONArray, uid: String?): String =
        JSONObject().put("v", 1).apply { if (uid != null) put("uid", uid) }.put("e", log).toString()

    fun entries(log: JSONArray, app: String): List<JSONObject> =
        (0 until log.length()).mapNotNull { log.optJSONObject(it) }.filter { it.optString("a") == app }

    /** Get Ready taps still in the log, for laying over the phone's copy */
    fun grTaps(log: JSONArray): List<GrCore.Tap> = entries(log, "gr").mapNotNull {
        val d = it.optString("d"); val i = it.optString("i")
        if (d.isBlank() || i.isBlank()) null else GrCore.Tap(d, i, it.optInt("on", 0) == 1, it.optLong("at"))
    }

    /** a random id for an entry */
    fun newId(rnd: java.util.Random = java.security.SecureRandom()): String {
        val abc = "abcdefghijklmnopqrstuvwxyz0123456789"
        return (1..12).map { abc[rnd.nextInt(abc.length)] }.joinToString("")
    }

    /** an 8-character linking code in the link alphabet (a-z, 2-7), and its display form "ABCD 2345" */
    fun newCode(rnd: java.util.Random = java.security.SecureRandom()): String {
        val abc = "abcdefghijklmnopqrstuvwxyz234567"
        return (1..8).map { abc[rnd.nextInt(32)] }.joinToString("")
    }
    fun showCode(code: String) = code.uppercase().chunked(4).joinToString(" ")
    fun validKey(k: String?) = k != null && Regex("[a-z2-7]{26}").matches(k)
}
