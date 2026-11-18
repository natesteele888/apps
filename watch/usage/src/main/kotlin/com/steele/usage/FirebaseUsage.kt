package com.steele.usage

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Today's Firestore reads, writes and deletes for each of your Firebase projects, from Google Cloud Monitoring.
 * Runs off the main thread with a read-only Google access token that lives only in memory for this one call.
 * The free (Spark) plan's daily caps reset at midnight Pacific time.
 */
object FirebaseUsage {
    const val SCOPE_MONITORING = "https://www.googleapis.com/auth/monitoring.read"
    const val SCOPE_FIREBASE = "https://www.googleapis.com/auth/firebase.readonly"
    private val PACIFIC: ZoneId = ZoneId.of("America/Los_Angeles")
    private val METRICS = listOf(
        "reads" to "firestore.googleapis.com/document/read_count",
        "writes" to "firestore.googleapis.com/document/write_count",
        "deletes" to "firestore.googleapis.com/document/delete_count",
    )
    private val ID = Regex("^[a-z][a-z0-9-]{4,62}$")

    class AuthError : Exception()

    /** The JSON the page gets: state, the next reset, and per project its id, name and three counts. */
    fun read(token: String): String {
        val now = ZonedDateTime.now(PACIFIC)
        val start = now.toLocalDate().atStartOfDay(PACIFIC)
        val reset = start.plusDays(1)
        val out = JSONArray()
        val projects = get("https://firebase.googleapis.com/v1beta1/projects?pageSize=30", token).optJSONArray("results") ?: JSONArray()
        for (i in 0 until minOf(projects.length(), 30)) {
            val p = projects.optJSONObject(i) ?: continue
            val id = p.optString("projectId").takeIf { ID.matches(it) } ?: continue
            val o = JSONObject().put("id", id).put("name", p.optString("displayName", id).take(60))
            for ((key, metric) in METRICS) o.put(key, total(id, metric, start.toInstant(), now.toInstant(), token))
            out.put(o)
        }
        return JSONObject().put("state", "ok").put("reset", reset.toInstant().toString()).put("projects", out).toString()
    }

    /** Sum of one counter since midnight Pacific, across every database in the project. */
    private fun total(project: String, metric: String, from: Instant, to: Instant, token: String): Long {
        val secs = maxOf(60L, to.epochSecond - from.epochSecond)
        val q = listOf(
            "filter" to "metric.type=\"$metric\"",
            "interval.startTime" to from.toString(),
            "interval.endTime" to to.toString(),
            "aggregation.alignmentPeriod" to "${secs}s",
            "aggregation.perSeriesAligner" to "ALIGN_SUM",
            "aggregation.crossSeriesReducer" to "REDUCE_SUM",
        ).joinToString("&") { (k, v) -> k + "=" + URLEncoder.encode(v, "UTF-8") }
        val j = try { get("https://monitoring.googleapis.com/v3/projects/$project/timeSeries?$q", token) }
                catch (e: AuthError) { throw e } catch (e: Exception) { return 0 }   // Firestore not set up there, or no access
        var sum = 0L
        val series = j.optJSONArray("timeSeries") ?: return 0
        for (s in 0 until series.length()) {
            val pts = series.optJSONObject(s)?.optJSONArray("points") ?: continue
            for (k in 0 until pts.length()) {
                val v = pts.optJSONObject(k)?.optJSONObject("value") ?: continue
                sum += v.optString("int64Value", "0").toLongOrNull() ?: v.optDouble("doubleValue", 0.0).toLong()
            }
        }
        return sum
    }

    private fun get(url: String, token: String): JSONObject {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000; c.readTimeout = 20_000
            c.setRequestProperty("Authorization", "Bearer $token")
            c.setRequestProperty("Accept", "application/json")
            val code = c.responseCode
            if (code == 401) throw AuthError()
            if (code !in 200..299) throw Exception("HTTP $code")
            return JSONObject(c.inputStream.bufferedReader().use { it.readText() })
        } finally { c.disconnect() }
    }
}
