package com.steele.dugout.shared

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.OffsetDateTime

/**
 * GameChanger scores for the watch: the same team schedule and scores that GameChanger's scoreboard widget shows, read from
 * the public JSON behind GameChanger's own public team pages (no sign-in, no key). LYBS Ballclub's scheduled schedule
 * mirror reads the same feed (lybs-ballclub scripts/scrape-gamechanger-schedule.mjs). A browser can't call it (CORS), but an
 * app can, so the watch reads it straight from GameChanger.
 *
 * Nothing here is Android-only: it's three HTTPS GETs returning JSON, so an Apple Watch app could read the same thing.
 * The feed has opponent names, times and scores only. No player names or stats.
 */
object Gc {
    const val API = "https://api.team-manager.gc.com/public"

    /** phone to watch: the GameChanger team id the coach set in Dugout on the phone (a synced data item; empty = none) */
    const val PATH_TEAM = "/gc/team"

    fun teamUrl(id: String) = "$API/teams/$id"
    fun gamesUrl(id: String) = "$API/teams/$id/games"
    fun lineUrl(gameId: String) = "$API/game-stream-processing/$gameId/details?include=line_scores"

    private val TEAM_ID = Regex("^[A-Za-z0-9]{6,24}$")
    private val TEAM_URL = Regex("gc\\.com/teams/([A-Za-z0-9]{6,24})", RegexOption.IGNORE_CASE)
    private val GAME_ID = Regex("^[A-Za-z0-9-]{8,64}$")

    /** The team's id from a pasted web.gc.com/teams/... link or the bare id (the same rule Ballclub's GameChanger tab uses). */
    fun teamId(input: String?): String? {
        val s = input?.trim().orEmpty()
        if (s.isEmpty()) return null
        TEAM_URL.find(s)?.let { return it.groupValues[1] }
        return s.takeIf { TEAM_ID.matches(it) }
    }

    fun safeTeamId(id: String?) = id != null && TEAM_ID.matches(id)
    fun safeGameId(id: String?) = id != null && GAME_ID.matches(id)

    data class Team(val name: String, val record: String, val season: String)

    data class Game(
        val id: String,
        val opponent: String,
        val startMs: Long,
        val endMs: Long,
        val home: Boolean?,
        val status: String,
        val us: Int?,
        val them: Int?,
        val liveStream: Boolean = false,
    ) {
        val result: Char? get() = if (us == null || them == null) null else if (us > them) 'W' else if (us < them) 'L' else 'T'
        val vs: String get() = (if (home == false) "@ " else "vs ") + opponent
    }

    enum class Phase { LIVE, FINAL, UPCOMING, OFF, NO_FINAL }

    data class Side(val innings: List<Int?>, val r: Int?, val h: Int?, val e: Int?)
    data class Line(val us: Side, val them: Side, val inningsPerGame: Int)

    /** What the watch shows: the game going on now (or about to start), the next game, finals newest first, and what's ahead. */
    data class Board(val live: Game?, val next: Game?, val recent: List<Game>, val upcoming: List<Game>)

    private fun JSONObject.intOrNull(k: String): Int? = if (!has(k) || isNull(k)) null else optInt(k, Int.MIN_VALUE).takeIf { it != Int.MIN_VALUE }

    private fun time(s: String): Long? = if (s.isBlank()) null else try { Instant.parse(s).toEpochMilli() } catch (e: Exception) {
        try { OffsetDateTime.parse(s).toInstant().toEpochMilli() } catch (e2: Exception) { null }
    }

    fun parseTeam(json: String): Team? = try {
        val o = JSONObject(json)
        val ts = o.optJSONObject("team_season")
        val rec = ts?.optJSONObject("record")
        val record = if (rec == null) "" else {
            val t = rec.optInt("tie", 0)
            "${rec.optInt("win", 0)}-${rec.optInt("loss", 0)}" + (if (t > 0) "-$t" else "")
        }
        val season = if (ts == null) "" else listOf(ts.str("season").replaceFirstChar { it.uppercase() }, if (ts.has("year")) ts.optInt("year").toString() else "")
            .filter { it.isNotBlank() }.joinToString(" ")
        Team(o.str("name").take(60).ifBlank { "Your team" }, record, season)
    } catch (e: Exception) { null }

    fun parseGames(json: String): List<Game> = try {
        val arr = JSONArray(json)
        val out = ArrayList<Game>()
        for (i in 0 until arr.length()) {
            val g = arr.optJSONObject(i) ?: continue
            val id = g.str("id")
            if (!safeGameId(id)) continue
            val start = time(g.str("start_ts")) ?: continue
            val end = time(g.str("end_ts")) ?: (start + 2 * 3600_000L)
            val sc = g.optJSONObject("score")
            out.add(
                Game(
                    id = id,
                    opponent = g.optJSONObject("opponent_team")?.str("name")?.take(40)?.ifBlank { null } ?: "TBD",
                    startMs = start, endMs = maxOf(end, start),
                    home = when (g.str("home_away")) { "home" -> true; "away" -> false; else -> null },
                    status = g.str("game_status").lowercase().take(30),
                    us = sc?.intOrNull("team"), them = sc?.intOrNull("opponent_team"),
                    liveStream = g.optBoolean("has_live_stream", false),
                )
            )
        }
        out.sortedBy { it.startMs }
    } catch (e: Exception) { emptyList() }

    fun parseLine(json: String): Line? = try {
        val ls = JSONObject(json).optJSONObject("line_score")
        fun side(s: JSONObject?): Side? {
            if (s == null) return null
            val sc = s.optJSONArray("scores") ?: JSONArray()
            val inn = (0 until minOf(sc.length(), 20)).map { i -> if (sc.isNull(i)) null else sc.optInt(i) }
            val tot = s.optJSONArray("totals")
            fun t(i: Int): Int? = if (tot == null || tot.length() <= i || tot.isNull(i)) null else tot.optInt(i)
            return Side(inn, t(0), t(1), t(2))
        }
        val us = side(ls?.optJSONObject("team"))
        val them = side(ls?.optJSONObject("opponent_team"))
        if (us == null || them == null) null
        else Line(us, them, (ls?.optJSONObject("team")?.optInt("innings_per_game", 6) ?: 6).coerceIn(1, 12))
    } catch (e: Exception) { null }

    private val OFF = listOf("cancel", "postpone", "forfeit", "suspend", "rain", "delay")

    /**
     * GameChanger marks a played game "completed". The feed doesn't document its other values, so anything not completed
     * or called off counts as live from 15 minutes before the start until 90 minutes after the scheduled end.
     */
    fun phase(g: Game, now: Long): Phase = when {
        g.status == "completed" || g.status == "final" -> Phase.FINAL
        OFF.any { g.status.contains(it) } -> Phase.OFF
        g.status.contains("progress") || g.status == "live" -> Phase.LIVE
        now < g.startMs - 15 * 60_000L -> Phase.UPCOMING
        now <= g.endMs + 90 * 60_000L -> Phase.LIVE
        else -> Phase.NO_FINAL
    }

    fun board(games: List<Game>, now: Long): Board {
        val live = games.filter { phase(it, now) == Phase.LIVE }.minByOrNull { kotlin.math.abs(it.startMs - now) }
        val upcoming = games.filter { phase(it, now) == Phase.UPCOMING }.sortedBy { it.startMs }
        val recent = games.filter { phase(it, now) == Phase.FINAL || (phase(it, now) == Phase.OFF && it.startMs < now) }.sortedByDescending { it.startMs }
        return Board(live, upcoming.firstOrNull(), recent, upcoming)
    }

    /** How long until the watch reads GameChanger again while the screen is open: every 30 seconds during a game, else 15 minutes. */
    fun refreshMs(b: Board): Long = if (b.live != null) 30_000L else 15 * 60_000L
}
