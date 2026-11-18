package com.steele.family.core

import org.json.JSONObject

/**
 * Practice Clock on the watch: the practice running on the coach's phone (the "pk" field of the watch link, written by
 * practiceclock/app.js from Core.watchSummary). The phone sends each block or station's name and length plus the clock
 * numbers only when something changes (start, pause, skip, a minute added, the end); the watch works out where practice
 * is by itself, with the same math as practiceclock/core.js (positionAt, and the "wait for me" hold in settle), so it
 * keeps time and buzzes at every change even while the phone sleeps.
 */
object PracticeCore {
    data class Seg(val name: String, val durMs: Long)
    data class Practice(
        val at: Long, val name: String, val wait: Boolean, val ack: Int, val startMs: Long, val pausedMs: Long,
        val pausedAt: Long?, val finished: Boolean, val hold: Boolean, val segs: List<Seg>,
    ) {
        val totalMs: Long get() = segs.sumOf { it.durMs }
        /** where segment [i] ends, counted from the start of practice (pauses left out) */
        fun endOf(i: Int): Long = segs.take(i + 1).sumOf { it.durMs }
    }

    enum class Mode { RUNNING, PAUSED, HOLDING, DONE }

    /**
     * Where practice is: the segment that's on ([index]), the time left in it and in the whole practice, and since when
     * the watch has been in this state ([since], epoch ms: the start of the segment, the moment it held or finished),
     * so a screen can tell a change that just happened from one it slept through.
     */
    data class Now(val mode: Mode, val index: Int, val segLeftMs: Long, val segDurMs: Long, val totalLeftMs: Long, val since: Long) {
        val segDoneFraction: Float get() = if (segDurMs <= 0) 1f else (1f - segLeftMs.toFloat() / segDurMs).coerceIn(0f, 1f)
    }

    /** An upcoming change, for a buzz: the moment segment [index] ends; [last] is the end of practice. */
    data class Change(val at: Long, val index: Int, val last: Boolean)

    /** The phone's summary, or null when no practice is running (or the text can't be read). */
    fun parse(json: String?): Practice? {
        val o = try { JSONObject(json ?: return null) } catch (e: Exception) { return null }
        if (o.optBoolean("none", false) || o.optInt("v", 0) != 1) return null
        val a = o.optJSONArray("segs") ?: return null
        val segs = mutableListOf<Seg>()
        for (i in 0 until minOf(a.length(), 200)) {
            val s = a.optJSONObject(i) ?: return null
            val d = s.optLong("d", -1)
            if (d < 0 || d > 24 * 3_600_000L) return null
            segs += Seg(s.optString("n").take(40).ifBlank { "Block ${i + 1}" }, d)
        }
        if (segs.isEmpty() || !o.has("startMs")) return null
        val start = o.optLong("startMs", -1); if (start <= 0) return null
        val pausedAt = if (o.isNull("pausedAt") || !o.has("pausedAt")) null else o.optLong("pausedAt", -1).takeIf { it > 0 }
        return Practice(
            o.optLong("at", 0), o.optString("name").take(40).ifBlank { "Practice" }, o.optBoolean("wait", false),
            o.optInt("ack", 0).coerceIn(0, segs.size - 1), start, o.optLong("pausedMs", 0).coerceAtLeast(0), pausedAt,
            o.optBoolean("finished", false), o.optBoolean("hold", false), segs,
        )
    }

    /** where practice [p] is at [now] (epoch ms) */
    fun at(p: Practice, now: Long): Now {
        val total = p.totalMs
        val last = p.segs.size - 1
        val base = p.startMs + p.pausedMs            // the epoch moment practice would have started with no pauses
        val endAt = base + total
        if (p.finished) return Now(Mode.DONE, last, 0, p.segs[last].durMs, 0, p.pausedAt ?: endAt)
        val clock = p.pausedAt ?: now
        val elapsed = (clock - base).coerceAtLeast(0)
        // asleep past the end of everything: done (the phone does the same, "wait for me" or not)
        if (elapsed >= total) return Now(Mode.DONE, last, 0, p.segs[last].durMs, 0, if (p.pausedAt != null) p.pausedAt else endAt)
        var acc = 0L; var i = 0
        while (i < last && elapsed >= acc + p.segs[i].durMs) { acc += p.segs[i].durMs; i++ }
        val dur = p.segs[i].durMs
        // "wait for me": at the end of the acknowledged block the clock holds until the coach taps on the phone
        if (p.hold || (p.wait && i > p.ack)) {
            val held = p.ack.coerceAtMost(last)
            val heldEnd = p.endOf(held)
            return Now(Mode.HOLDING, held, 0, p.segs[held].durMs, total - heldEnd, p.pausedAt ?: (base + heldEnd))
        }
        val left = acc + dur - elapsed
        return if (p.pausedAt != null) Now(Mode.PAUSED, i, left, dur, total - elapsed, p.pausedAt)
        else Now(Mode.RUNNING, i, left, dur, total - elapsed, base + acc)
    }

    /**
     * Every change still to come while practice runs on its own, for the watch to buzz at with the screen off: the end of
     * each segment from [now] on, or, for a "wait for me" plan, only the end of the block that's on (then it holds).
     * Nothing while paused, holding or done.
     */
    fun changes(p: Practice, now: Long): List<Change> {
        if (at(p, now).mode != Mode.RUNNING) return emptyList()
        val base = p.startMs + p.pausedMs
        val last = p.segs.size - 1
        val out = mutableListOf<Change>()
        var end = 0L
        for (i in 0..last) {
            end += p.segs[i].durMs
            val t = base + end
            if (t > now) out += Change(t, i, i == last)
            if (p.wait && i >= p.ack) break
        }
        return out
    }

    /** the countdown as the phone shows it: rounded up to the second, "1:05", "1:00:00" */
    fun clock(ms: Long): String {
        val s = ((ms.coerceAtLeast(0) + 999) / 1000)
        val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
        return if (h > 0) "$h:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}" else "$m:${sec.toString().padStart(2, '0')}"
    }
}
