package com.steele.dugout.shared

import org.json.JSONArray
import org.json.JSONObject

/**
 * The MAC League scores that LYBS Select (Ballclub) shows, read from the same place: Ballclub's Firebase database,
 * shared/macLeagueStandings. Ballclub's scheduled job (lybs-ballclub scripts/scrape-standings.mjs) copies every
 * division's "Today's Games" and standings there from macleague.org every 30 minutes, 8am to 9pm ET.
 *
 * It's plain HTTPS and JSON on purpose, so any watch can read it the same way (an Apple Watch version later included):
 *  1. sign in anonymously: POST [SIGNUP_URL] with {"returnSecureToken":true} gives an idToken (and a refreshToken)
 *  2. GET [dataUrl] with that idToken.
 * Only public league data lives there (team names, scores, records): nothing about any player.
 */
object LeagueScores {
    /** Ballclub's public Firebase project ids, the same ones in lybs-ballclub index.html. Not secrets. */
    const val API_KEY = "AIzaSyCK2-ZDnWxSs-5ghhueRIR4OaSZ-1NgHGY"
    const val DB_URL = "https://lybs-ballclub-default-rtdb.firebaseio.com"
    const val SIGNUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$API_KEY"
    const val REFRESH_URL = "https://securetoken.googleapis.com/v1/token?key=$API_KEY"

    fun dataUrl(idToken: String) = "$DB_URL/shared/macLeagueStandings.json?auth=$idToken"

    /** Majors first (the division the Select team plays in), then Minors, then Rookies, then anything new */
    private val ORDER = listOf("33696", "33695", "33694")
    private val NAMES = mapOf("33694" to "Rookies", "33695" to "Minors", "33696" to "Majors")

    data class Side(val name: String, val score: Int?, val us: Boolean)
    data class Game(val id: String?, val time: String, val away: Side, val home: Side, val location: String?) {
        val played get() = away.score != null && home.score != null
        val us get() = away.us || home.us
    }
    data class Standing(val team: String, val w: String, val l: String, val t: String, val us: Boolean) {
        val record get() = if (t.isBlank() || t == "0") "$w-$l" else "$w-$l-$t"
    }
    data class Division(val id: String, val name: String, val games: List<Game>, val standings: List<Standing>)
    data class Board(val divisions: List<Division>, val scrapedAt: String?) {
        val gameCount get() = divisions.sumOf { it.games.size }
    }

    /** "12u Lunenburg Select" -> "Lunenburg Select": every team in a division carries the same age prefix */
    fun shortName(name: String): String = name.replace(Regex("^\\s*\\d{1,2}\\s*[uU]\\s+"), "").trim()

    fun isUs(name: String) = name.contains("lunenburg", ignoreCase = true)

    private fun score(v: Any?): Int? = when (v) {
        null, JSONObject.NULL -> null
        is Number -> v.toInt()
        else -> v.toString().trim().toIntOrNull()
    }

    private fun str(o: JSONObject, k: String): String = if (o.isNull(k)) "" else o.optString(k).trim()

    /** the database's answer turned into what the watch shows; anything missing or odd is just left out */
    fun parse(json: String): Board {
        val text = json.trim()
        if (text.isEmpty() || text == "null") return Board(emptyList(), null)
        val root = JSONObject(text)
        val divs = root.optJSONObject("divisions") ?: JSONObject()
        val ids = divs.keys().asSequence().toList().sortedWith(compareBy({ ORDER.indexOf(it).let { i -> if (i < 0) 99 else i } }, { it }))
        val out = ids.mapNotNull { id ->
            val d = divs.optJSONObject(id) ?: return@mapNotNull null
            val name = NAMES[id] ?: str(d, "name").ifBlank { "Division $id" }
            Division(id, name, games(d.optJSONArray("todayGames")), standings(d.optJSONArray("rows")))
        }
        return Board(out, str(root, "scrapedAt").ifBlank { null })
    }

    private fun games(a: JSONArray?): List<Game> {
        if (a == null) return emptyList()
        val list = mutableListOf<Game>()
        for (i in 0 until a.length()) {
            val g = a.optJSONObject(i) ?: continue // very old entries were plain strings
            val teams = g.optJSONArray("teams") ?: continue
            val sides = (0 until teams.length()).mapNotNull { teams.optJSONObject(it) }.map {
                val n = shortName(str(it, "name")).ifBlank { "TBD" }
                Side(n, score(it.opt("score")), isUs(n))
            }
            if (sides.size < 2) continue
            list += Game(str(g, "gameId").ifBlank { null }, str(g, "time"), sides[0], sides[1], str(g, "location").ifBlank { null })
        }
        // Lunenburg's games first, then the rest in the order the league lists them (by start time)
        return list.sortedBy { if (it.us) 0 else 1 }
    }

    private fun standings(a: JSONArray?): List<Standing> {
        if (a == null) return emptyList()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map {
            val n = shortName(str(it, "team"))
            Standing(n, str(it, "w").ifBlank { "0" }, str(it, "l").ifBlank { "0" }, str(it, "t"), it.optBoolean("isUs") || isUs(n))
        }
    }

    /** the idToken from a sign-up (idToken, expiresIn) or a refresh (id_token, expires_in) answer, and its life in ms */
    fun token(json: String): Triple<String, String, Long>? {
        val o = try { JSONObject(json) } catch (e: Exception) { return null }
        val id = o.optString("idToken").ifBlank { o.optString("id_token") }
        val refresh = o.optString("refreshToken").ifBlank { o.optString("refresh_token") }
        val secs = o.optString("expiresIn").ifBlank { o.optString("expires_in") }.toLongOrNull() ?: 3600
        return if (id.isBlank()) null else Triple(id, refresh, secs * 1000)
    }
}
