package com.steele.family.core

import org.json.JSONObject
import java.time.Instant

/**
 * Gameday Picks on the watch: this NFL week's games from ESPN's public scoreboard (the same feed picks/core.js
 * reads), and the player's own picks, saved straight into Gameday Picks (gp_picks/<uid>_<week key>) so they count on
 * the board like a pick made on the phone. A pick is the team's ESPN abbreviation, keyed by ESPN's event id.
 */
object PicksCore {
    const val SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"

    data class Team(val abbr: String, val name: String, val color: Long, val score: Int?)
    data class Game(val id: String, val date: Instant, val away: Team, val home: Team, val state: String, val done: Boolean, val winner: String?, val detail: String) {
        /** picks lock when a game starts, the same rule as the phone */
        fun locked(now: Instant) = state != "pre" || !date.isAfter(now)
    }
    data class Week(val key: String, val label: String, val games: List<Game>)

    /** NFL slate key, "year-type-week", the same as picks/core.js nflKey */
    fun nflKey(y: Int, t: Int, w: Int) = "$y-$t-$w"
    fun label(t: Int, w: Int) = (if (t == 1) "Pre " else if (t == 3) "Playoffs " else "Week ") + w

    fun parseWeek(json: String): Week? {
        val d = try { JSONObject(json) } catch (e: Exception) { return null }
        val season = d.optJSONObject("season"); val week = d.optJSONObject("week")
        val y = season?.optInt("year", 0) ?: 0; val t = season?.optInt("type", 0) ?: 0; val w = week?.optInt("number", 0) ?: 0
        if (y == 0 || w == 0) return null
        val games = mutableListOf<Game>()
        val ev = d.optJSONArray("events")
        if (ev != null) for (i in 0 until ev.length()) {
            val e = ev.optJSONObject(i) ?: continue
            val c = e.optJSONArray("competitions")?.optJSONObject(0) ?: continue
            val comps = c.optJSONArray("competitors") ?: continue
            var a: JSONObject? = null; var h: JSONObject? = null
            for (j in 0 until comps.length()) { val x = comps.optJSONObject(j) ?: continue; if (x.optString("homeAway") == "away") a = x else if (x.optString("homeAway") == "home") h = x }
            if (a == null || h == null) continue
            val st = c.optJSONObject("status")?.optJSONObject("type")
            val done = st?.optBoolean("completed", false) ?: false
            fun team(x: JSONObject): Team {
                val tm = x.optJSONObject("team") ?: JSONObject()
                val col = tm.optString("color").takeIf { Regex("[0-9a-fA-F]{6}").matches(it) }?.toLong(16) ?: 0x555555L
                return Team(tm.optString("abbreviation"), tm.optString("shortDisplayName").ifBlank { tm.optString("name") }, 0xFF000000L or col,
                    x.optString("score").toIntOrNull())
            }
            val at = team(a); val ht = team(h)
            val win = if (done) listOf(a, h).firstOrNull { it.optBoolean("winner", false) }?.optJSONObject("team")?.optString("abbreviation") else null
            val date = try { Instant.parse(e.optString("date").let { if (it.length == 17) it.dropLast(1) + ":00Z" else it }) } catch (x: Exception) { continue }
            if (at.abbr.isBlank() || ht.abbr.isBlank()) continue
            games += Game(e.optString("id"), date, at, ht, st?.optString("state") ?: "pre", done, win, st?.optString("shortDetail") ?: "")
        }
        return Week(nflKey(y, t, w), label(t, w), games.sortedBy { it.date })
    }

    /** {eventId: abbr} out of a Firestore REST document's "picks" map (empty when there's no document yet) */
    fun parsePicksDoc(json: String?): Map<String, String> {
        val o = try { JSONObject(json ?: return emptyMap()) } catch (e: Exception) { return emptyMap() }
        val f = o.optJSONObject("fields")?.optJSONObject("picks")?.optJSONObject("mapValue")?.optJSONObject("fields") ?: return emptyMap()
        val out = mutableMapOf<String, String>()
        f.keys().forEach { k -> f.optJSONObject(k)?.optString("stringValue")?.takeIf { it.isNotBlank() }?.let { out[k] = it } }
        return out
    }

    /** the Firestore REST body for gp_picks/<uid>_<key>, the same fields the phone writes */
    fun picksDocBody(uid: String, key: String, picks: Map<String, String>, now: Instant): String {
        val pm = JSONObject(); picks.forEach { (k, v) -> pm.put(k, JSONObject().put("stringValue", v)) }
        val fields = JSONObject()
            .put("uid", JSONObject().put("stringValue", uid))
            .put("week", JSONObject().put("stringValue", key))
            .put("picks", JSONObject().put("mapValue", JSONObject().put("fields", pm)))
            .put("updatedAt", JSONObject().put("stringValue", now.toString()))
        return JSONObject().put("fields", fields).toString()
    }

    /** tap the team already picked to take the pick back; tap the other to switch */
    fun toggle(picks: Map<String, String>, gid: String, abbr: String): Map<String, String> =
        if (picks[gid] == abbr) picks - gid else picks + (gid to abbr)

    /** wins and losses among this week's finished games */
    fun record(week: Week, picks: Map<String, String>): Pair<Int, Int> {
        var w = 0; var l = 0
        week.games.forEach { g -> val p = picks[g.id] ?: return@forEach; if (!g.done || g.winner == null) return@forEach; if (g.winner == p) w++ else l++ }
        return w to l
    }

    /** the phone's summary: the player's name, uid and the board ("gp" field) */
    data class Row(val name: String, val w: Int, val l: Int, val me: Boolean)
    data class Phone(val uid: String?, val name: String, val board: List<Row>)
    fun parsePhone(json: String?): Phone? {
        val o = try { JSONObject(json ?: return null) } catch (e: Exception) { return null }
        val rows = mutableListOf<Row>()
        o.optJSONArray("board")?.let { b -> for (i in 0 until minOf(b.length(), 8)) { val r = b.optJSONObject(i) ?: continue; rows += Row(r.optString("name").take(24), r.optInt("w"), r.optInt("l"), r.optBoolean("me")) } }
        return Phone(o.optString("uid").takeIf { Regex("[A-Za-z0-9]{10,128}").matches(it) }, o.optString("name").take(24), rows)
    }
}
