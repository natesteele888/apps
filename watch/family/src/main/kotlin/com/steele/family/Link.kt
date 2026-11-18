package com.steele.family

import android.content.Context
import android.content.SharedPreferences
import com.steele.family.core.WatchLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * The watch link: one private document joining this watch to the family apps on one phone (see watchlink.js at the
 * top of the apps repo). The phone writes each app's part ("gr", "cc", "pp", "r20", "gp", "sc", "pk"); the watch writes only its
 * log ("w"). No sign-in: the 26-letter key is the only way in, and nobody can list the links.
 *
 * Linking: the watch makes an 8-letter code and shows it; the phone, where the code is typed, leaves its key in
 * fw_pair/<code>; the watch picks it up and deletes that note. One link covers all the apps on the watch.
 */
object Link {
    private const val BASE = "https://firestore.googleapis.com/v1/projects/nates-toolbox/databases/(default)/documents/"
    /** the nates-toolbox web app id, the same public one in getready/cloud.js (not a secret); only used for the Picks sign-in */
    const val API_KEY = "AIzaSyDT_wGN93U4oM70orIU8flSAnvXHApqW2A"
    private val FIELDS = listOf("gr", "cc", "pp", "r20", "gp", "sc", "pk")
    private const val CODE_LIFE = 10 * 60_000L

    data class State(
        val linked: Boolean = false,
        val code: String? = null,
        val fields: Map<String, String> = emptyMap(),
        val checkedAt: Long = 0L,
        val offline: Boolean = false,
        val noRules: Boolean = false,
        /** bumps whenever the watch's own log changes, so screens lay new taps over the phone's copy */
        val logRev: Int = 0,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state
    private lateinit var prefs: SharedPreferences
    private val lock = Mutex()
    @Volatile private var dirty = false

    fun load(ctx: Context) {
        if (::prefs.isInitialized) return
        prefs = ctx.applicationContext.getSharedPreferences("link", Context.MODE_PRIVATE)
        dirty = prefs.getBoolean("dirty", false)
        val f = FIELDS.mapNotNull { n -> prefs.getString("f_$n", null)?.let { n to it } }.toMap()
        _state.value = State(linked = WatchLog.validKey(key()), fields = f, checkedAt = prefs.getLong("checkedAt", 0L))
    }

    private fun key(): String? = prefs.getString("key", null)?.takeIf { WatchLog.validKey(it) }
    fun field(name: String): String? = _state.value.fields[name]

    /** the watch's own log, as kept on the watch */
    fun log(): JSONArray = try { JSONArray(prefs.getString("log", "[]")) } catch (e: Exception) { JSONArray() }

    /** adds one entry to the watch's log; it goes up with the next [sync] */
    fun add(app: String, fields: Map<String, Any?>) {
        val now = System.currentTimeMillis()
        val e = WatchLog.entry(app, now, WatchLog.newId(), fields)
        synchronized(this) {
            prefs.edit().putString("log", WatchLog.append(prefs.getString("log", "[]"), listOf(e), now).toString()).putBoolean("dirty", true).apply()
            dirty = true
        }
        _state.value = _state.value.copy(logRev = _state.value.logRev + 1)
    }

    /** the Gameday Picks sign-in on this watch (its id goes in the log, for the phone to vouch for) */
    fun setPicksUid(uid: String?) { prefs.edit().putString("uid", uid).putBoolean("dirty", true).apply(); dirty = true }

    /** unlinks the watch (it keeps nothing of the phone's) */
    fun forget() {
        prefs.edit().clear().apply(); dirty = false
        _state.value = State()
    }

    /** one round: while unlinked, look for the phone's answer to the code; once linked, send the log and read the link. Safe to call often. */
    suspend fun sync() = lock.withLock {
        withContext(Dispatchers.IO) {
            try {
                if (key() == null) pair() else { if (dirty) push(); pull() }
            } catch (e: Exception) {
                _state.value = _state.value.copy(offline = true)
            }
        }
    }

    private fun pair() {
        var code = prefs.getString("code", null)
        val made = prefs.getLong("codeAt", 0L)
        val now = System.currentTimeMillis()
        if (code == null || now - made > CODE_LIFE) {
            code = WatchLog.newCode()
            prefs.edit().putString("code", code).putLong("codeAt", now).apply()
        }
        _state.value = _state.value.copy(code = code)
        val (status, body) = http("GET", BASE + "fw_pair/" + code)
        _state.value = _state.value.copy(offline = false, noRules = status == 403)
        if (status != 200) return
        val k = try { JSONObject(body).getJSONObject("fields").getJSONObject("k").getString("stringValue") } catch (e: Exception) { null }
        if (!WatchLog.validKey(k)) return
        prefs.edit().putString("key", k).remove("code").remove("codeAt").putBoolean("dirty", true).apply()
        dirty = true
        try { http("DELETE", BASE + "fw_pair/" + code) } catch (e: Exception) {}
        _state.value = _state.value.copy(linked = true, code = null)
        push(); pull()
    }

    private fun push() {
        val k = key() ?: return
        val text = WatchLog.field(log(), prefs.getString("uid", null))
        val body = JSONObject().put("fields", JSONObject()
            .put("w", JSONObject().put("stringValue", text))
            .put("updated", JSONObject().put("timestampValue", java.time.Instant.now().toString()))).toString()
        val (status, _) = http("PATCH", BASE + "fw_links/" + k + "?updateMask.fieldPaths=w&updateMask.fieldPaths=updated", body)
        if (status in 200..299) { dirty = false; prefs.edit().putBoolean("dirty", false).apply() }
        else throw IllegalStateException("HTTP $status")
    }

    private fun pull() {
        val k = key() ?: return
        val (status, body) = http("GET", BASE + "fw_links/" + k)
        val now = System.currentTimeMillis()
        if (status == 404) { _state.value = _state.value.copy(linked = true, offline = false, checkedAt = now); return }
        if (status != 200) throw IllegalStateException("HTTP $status")
        val f = JSONObject(body).optJSONObject("fields") ?: JSONObject()
        val out = mutableMapOf<String, String>()
        val ed = prefs.edit()
        FIELDS.forEach { n -> f.optJSONObject(n)?.optString("stringValue")?.takeIf { it.isNotBlank() }?.let { out[n] = it; ed.putString("f_$n", it) } }
        ed.putLong("checkedAt", now).apply()
        _state.value = _state.value.copy(linked = true, fields = out, checkedAt = now, offline = false, noRules = false)
    }

    // ---------- the Gameday Picks sign-in ----------
    // Picks are saved in Gameday Picks itself, which needs a sign-in. The watch gets its own anonymous one; the phone
    // (signed in as the player) vouches for it in gp_watch/<this id>, and the rules then let it save that player's picks only.
    private var idToken: String? = null
    private var tokenUntil = 0L

    /** this watch's sign-in token for Gameday Picks, or null when sign-in isn't possible (see [picksBlocked]) */
    fun picksToken(): Pair<String, String>? {
        val now = System.currentTimeMillis()
        val uid = prefs.getString("uid", null)
        idToken?.let { if (now < tokenUntil && uid != null) return it to uid }
        val refresh = prefs.getString("refresh", null)
        var json: String? = null
        if (refresh != null) {
            val (c, b) = http("POST", "https://securetoken.googleapis.com/v1/token?key=$API_KEY", "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8"), "application/x-www-form-urlencoded")
            if (c == 200) json = b
        }
        if (json == null) {
            val (c, b) = http("POST", "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$API_KEY", "{\"returnSecureToken\":true}")
            if (c != 200) { picksBlocked = true; return null }
            json = b
        }
        val o = JSONObject(json)
        val id = o.optString("idToken").ifBlank { o.optString("id_token") }
        val ref = o.optString("refreshToken").ifBlank { o.optString("refresh_token") }
        val newUid = o.optString("localId").ifBlank { o.optString("user_id") }
        val life = (o.optString("expiresIn").ifBlank { o.optString("expires_in") }.toLongOrNull() ?: 3600L) * 1000
        if (id.isBlank() || newUid.isBlank()) return null
        if (ref.isNotBlank()) prefs.edit().putString("refresh", ref).apply()
        if (newUid != uid) setPicksUid(newUid)
        idToken = id; tokenUntil = now + life - 60_000; picksBlocked = false
        return id to newUid
    }
    @Volatile var picksBlocked = false

    fun firestore(method: String, path: String, body: String? = null, token: String? = null) = http(method, BASE + path, body, null, token)

    fun http(method: String, url: String, body: String? = null, type: String? = null, token: String? = null): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            // PATCH isn't one of HttpURLConnection's methods on older Android: send it as a POST that says it's a PATCH
            if (method == "PATCH") { c.requestMethod = "POST"; c.setRequestProperty("X-HTTP-Method-Override", "PATCH") } else c.requestMethod = method
            c.connectTimeout = 15_000
            c.readTimeout = 20_000
            c.useCaches = false
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
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
