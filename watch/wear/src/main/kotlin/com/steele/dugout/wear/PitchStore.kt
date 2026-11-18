package com.steele.dugout.wear

import android.content.Context
import android.content.SharedPreferences
import com.steele.dugout.shared.PitchCore
import com.steele.dugout.shared.PitchLog
import com.steele.dugout.shared.Row
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject

/**
 * The watch's own pitch log, saved on the watch. Taps count right away, even with the phone out of reach; the log syncs
 * with the phone when they're together again, and each pitch counts once.
 */
object PitchStore {
    val log = MutableStateFlow(PitchLog())
    /** pitcher id to the day they can pitch again, from the phone */
    val resting = MutableStateFlow<Map<String, String>>(emptyMap())
    private var prefs: SharedPreferences? = null
    private var app: Context? = null

    fun today(): String = PitchCore.ymd(System.currentTimeMillis())

    fun load(ctx: Context) {
        if (prefs != null) return
        app = ctx.applicationContext
        val p = ctx.applicationContext.getSharedPreferences("pitch", Context.MODE_PRIVATE)
        prefs = p
        log.value = PitchCore.trimOld(PitchCore.parse(p.getString("log", null)), today())
        resting.value = readResting(p.getString("resting", null))
    }

    private fun readResting(json: String?): Map<String, String> = try {
        val o = JSONObject(json ?: "{}")
        o.keys().asSequence().mapNotNull { k -> o.optString(k).takeIf { Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(it) }?.let { k to it } }.toMap()
    } catch (e: Exception) { emptyMap() }

    private fun save(push: Boolean) {
        prefs?.edit()?.putString("log", PitchCore.toJson(log.value).toString())?.putString("resting", JSONObject(resting.value).toString())?.apply()
        if (push) app?.let { PhoneLink.putPitch(it, PitchCore.toJson(log.value).toString()) }
        Tiles.pitch(app)
        PitchComplicationService.update(app)
        Ongoing.pitch(app)
    }

    /**
     * The Pitch Count tile's button ids carry this number, and it goes up after each press, so a press counts once even
     * when the watch asks for the tile again with the same last-pressed id.
     */
    fun tileSeq(): Int = prefs?.getInt("tileSeq", 0) ?: 0
    fun nextTileSeq() { prefs?.edit()?.putInt("tileSeq", tileSeq() + 1)?.apply() }

    /** who is pitching: the one picked today, or the first on the list */
    fun cur(l: PitchLog = log.value): Pair<String, String>? =
        PitchCore.current(l, today()) ?: l.pitchers.firstOrNull()?.let { it.id to it.name }

    fun rows(l: PitchLog = log.value): List<Row> = PitchCore.bullpen(l, today(), resting.value)

    /** one pitch for whoever is pitching; returns the row after it and how many were left before */
    fun add(): Pair<Row?, Int> {
        val now = System.currentTimeMillis()
        var l = log.value
        var c = cur(l)
        if (c == null) {
            // nobody on the list yet: count for "Pitcher 1" (the phone can rename them later)
            c = PitchCore.uid("p") to "Pitcher 1"
        }
        val before = rows(l).firstOrNull { it.id == c.first }?.left ?: 999
        if (PitchCore.current(l, today()) == null) l = PitchCore.setCurrent(l, c.first, c.second, now)
        l = PitchCore.addPitch(l, c.first, now)
        log.value = l
        save(true)
        return rows(l).firstOrNull { it.id == c.first } to before
    }

    /** the next pitch for this pitcher adds a rest day (and isn't the one that reaches the limit) */
    fun restSoon(r: Row, l: PitchLog = log.value): Boolean =
        PitchCore.restSoon(r.count, l.division) != null && (r.limit == 0 || r.left > 1)

    /** "Next pitch = 1 rest day" when it does, or null */
    fun restLine(r: Row, l: PitchLog = log.value): String? {
        if (!restSoon(r, l)) return null
        val step = PitchCore.restSoon(r.count, l.division) ?: return null
        return "Next pitch = ${step.rest} rest day" + (if (step.rest == 1) "" else "s")
    }

    /** one pitch, and the buzz that goes with it */
    fun addAndBuzz(ctx: Context) {
        val (r, before) = add()
        if (r != null) Buzz.pitch(ctx, r.left, before, r.limit, restSoon(r)) else Buzz.tick(ctx)
    }

    fun undo(): Boolean {
        val c = cur() ?: return false
        val l = PitchCore.undo(log.value, c.first, today(), System.currentTimeMillis()) ?: return false
        log.value = l
        save(true)
        return true
    }

    fun choose(id: String) {
        val l = log.value
        log.value = PitchCore.setCurrent(l, id, PitchCore.nameOf(l, id), System.currentTimeMillis())
        save(true)
    }

    /** the phone's log arrived: keep every pitch once, and send ours back if the phone is missing some */
    fun fromPhone(json: String) {
        val theirs = PitchCore.parse(json)
        try { JSONObject(json).optJSONObject("elig")?.let { resting.value = readResting(it.toString()) } } catch (e: Exception) { /* ignore */ }
        val cutoff = PitchCore.cutoff(today())
        val m = PitchCore.merge(log.value, theirs, cutoff)
        if (m.changed) log.value = m.log
        val theirIds = theirs.events.map { it.i }.toHashSet()
        val phoneMissing = log.value.events.any { it.i !in theirIds && PitchCore.ymd(it.t) >= cutoff }
        save(phoneMissing)
    }
}
