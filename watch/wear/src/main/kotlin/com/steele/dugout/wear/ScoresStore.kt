package com.steele.dugout.wear

import android.content.Context
import android.content.SharedPreferences
import com.steele.dugout.shared.LeagueScores
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * League scores for the Scores app: the MAC League scores LYBS Select shows, read straight from Ballclub's database
 * (see LeagueScores in the shared code). The last answer is kept, so the list shows at once and with no signal.
 */
object ScoresStore {
    data class State(
        val board: LeagueScores.Board = LeagueScores.Board(emptyList(), null),
        val loading: Boolean = false,
        val error: String? = null,
        val checkedAt: Long = 0L,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state
    private val lock = Mutex()
    private var idToken: String? = null
    private var tokenUntil = 0L
    private lateinit var prefs: SharedPreferences

    fun load(ctx: Context) {
        if (::prefs.isInitialized) return
        prefs = ctx.applicationContext.getSharedPreferences("scores", Context.MODE_PRIVATE)
        val json = prefs.getString("json", null) ?: return
        val board = try { LeagueScores.parse(json) } catch (e: Exception) { return }
        _state.value = State(board, checkedAt = prefs.getLong("checkedAt", 0L))
    }

    /** asks for the newest scores; safe to call often (one at a time) */
    suspend fun refresh() {
        lock.withLock { pull() }
    }

    private suspend fun pull() {
        _state.value = _state.value.copy(loading = true)
        try {
            val json = withContext(Dispatchers.IO) { fetch() }
            val board = LeagueScores.parse(json)
            val t = System.currentTimeMillis()
            prefs.edit().putString("json", json).putLong("checkedAt", t).apply()
            _state.value = State(board, checkedAt = t)
        } catch (e: Exception) {
            _state.value = _state.value.copy(loading = false, error = "Can't reach the scores right now")
        }
    }


    private fun fetch(): String {
        val token = token()
        val (code, body) = http("GET", LeagueScores.dataUrl(token))
        if (code == 401 || code == 403) { // the sign-in ran out early: start a fresh one and try once more
            idToken = null; prefs.edit().remove("refresh").apply()
            val (c2, b2) = http("GET", LeagueScores.dataUrl(token()))
            if (c2 != 200) throw IllegalStateException("HTTP $c2")
            return b2
        }
        if (code != 200) throw IllegalStateException("HTTP $code")
        return body
    }

    /** an anonymous sign-in to Ballclub's database, the same kind a visitor to LYBS Select gets */
    private fun token(): String {
        val now = System.currentTimeMillis()
        idToken?.let { if (now < tokenUntil) return it }
        val refresh = prefs.getString("refresh", null)
        val answer = if (refresh != null) {
            val (code, body) = http("POST", LeagueScores.REFRESH_URL, "grant_type=refresh_token&refresh_token=" + java.net.URLEncoder.encode(refresh, "UTF-8"), "application/x-www-form-urlencoded")
            if (code == 200) body else null
        } else null
        val json = answer ?: http("POST", LeagueScores.SIGNUP_URL, "{\"returnSecureToken\":true}", "application/json").let { (code, body) ->
            if (code != 200) throw IllegalStateException("sign-in HTTP $code")
            body
        }
        val (id, newRefresh, life) = LeagueScores.token(json) ?: throw IllegalStateException("no token")
        if (newRefresh.isNotBlank()) prefs.edit().putString("refresh", newRefresh).apply()
        idToken = id
        tokenUntil = now + life - 60_000
        return id
    }

    private fun http(method: String, url: String, body: String? = null, type: String? = null): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 15_000
            c.readTimeout = 20_000
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", type ?: "application/json")
                c.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            return code to text
        } finally {
            c.disconnect()
        }
    }
}
