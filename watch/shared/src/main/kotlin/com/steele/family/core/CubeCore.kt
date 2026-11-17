package com.steele.family.core

import org.json.JSONObject
import kotlin.random.Random

/**
 * Cube Clock on the watch: the same six puzzles, scrambles and averages as cube-clock/public/app.js, so a time on the
 * wrist means what it means on the phone. Times are milliseconds; a penalty is 0, 2000 (+2) or -1 (DNF).
 */
object CubeCore {
    data class Puzzle(val id: String, val name: String, val n: Int, val kind: String)
    val PUZZLES = listOf(
        Puzzle("222", "2x2", 2, "cube"), Puzzle("333", "3x3", 3, "cube"), Puzzle("444", "4x4", 4, "cube"),
        Puzzle("555", "5x5", 5, "cube"), Puzzle("pyra", "Pyraminx", 0, "pyra"), Puzzle("mega", "Megaminx", 0, "mega"),
    )
    fun puzzle(id: String?) = PUZZLES.firstOrNull { it.id == id } ?: PUZZLES[1]

    data class Solve(val t: Long, val p: Int, val d: Long) {
        /** the time that counts: +2 added, DNF as no time at all */
        val eff: Long? get() = if (p == -1) null else t + p
    }

    private val AXIS = mapOf("U" to 0, "D" to 0, "L" to 1, "R" to 1, "F" to 2, "B" to 2)

    fun scramble(p: Puzzle, rnd: Random = Random.Default): String = when (p.kind) {
        "pyra" -> pyra(rnd)
        "mega" -> mega(rnd)
        else -> cube(p.n, rnd)
    }

    private fun cube(n: Int, rnd: Random): String {
        val faces = if (n == 2) listOf("R", "U", "F") else listOf("U", "D", "L", "R", "F", "B")
        val len = mapOf(2 to 11, 3 to 20, 4 to 44, 5 to 60)[n] ?: 20
        val wide = n >= 4
        val out = mutableListOf<String>(); val hist = mutableListOf<String>()
        var guard = 0
        while (out.size < len && guard++ < 4000) {
            val f = faces[rnd.nextInt(faces.size)]
            val last = hist.lastOrNull(); val prev = hist.getOrNull(hist.size - 2)
            if (f == last) continue
            if (last != null && AXIS[f] == AXIS[last] && f == prev) continue
            hist += f
            out += f + (if (wide && rnd.nextDouble() < 0.42) "w" else "") + listOf("", "'", "2")[rnd.nextInt(3)]
        }
        return out.joinToString(" ")
    }

    private fun pyra(rnd: Random): String {
        val faces = listOf("U", "L", "R", "B"); val out = mutableListOf<String>()
        var last: String? = null; var guard = 0
        while (out.size < 10 && guard++ < 400) {
            val f = faces[rnd.nextInt(4)]
            if (f == last) continue
            last = f; out += f + if (rnd.nextBoolean()) "" else "'"
        }
        listOf("u", "l", "r", "b").forEach { t -> val x = rnd.nextDouble(); if (x < 0.68) out += t + if (x < 0.34) "" else "'" }
        return out.joinToString(" ")
    }

    private fun mega(rnd: Random): String = (0 until 7).joinToString("\n") {
        val parts = mutableListOf<String>()
        repeat(5) { parts += "R" + (if (rnd.nextBoolean()) "++" else "--"); parts += "D" + (if (rnd.nextBoolean()) "++" else "--") }
        parts += if (rnd.nextBoolean()) "U" else "U'"
        parts.joinToString(" ")
    }

    /** an average of [win] the way speedcubers count it: drop the best and worst; two DNFs make it a DNF (null) */
    fun avgOf(win: List<Solve>): Long? {
        val n = win.size
        if (n < 3) return null
        if (win.count { it.p == -1 } > 1) return null
        val v = win.map { it.eff ?: Long.MAX_VALUE }.sorted().subList(1, n - 1)
        if (v.any { it == Long.MAX_VALUE }) return null
        return v.sum() / v.size
    }
    /** the newest [n] solves' average, or null when there aren't n yet */
    fun lastAvg(list: List<Solve>, n: Int): Long? = if (list.size < n) null else avgOf(list.takeLast(n))
    fun best(list: List<Solve>): Long? = list.mapNotNull { it.eff }.minOrNull()

    /** 12.34, or 1:02.50 past a minute; "DNF" for none */
    fun fmt(ms: Long?): String {
        if (ms == null || ms < 0) return "DNF"
        val cs = ms / 10; val sec = cs / 100; val c = cs % 100
        val m = sec / 60; val ss = sec % 60
        val cc = c.toString().padStart(2, '0')
        return if (m > 0) "$m:${ss.toString().padStart(2, '0')}.$cc" else "$ss.$cc"
    }

    /** the phone's numbers for one puzzle (the "cc" field of the watch link) */
    data class PhoneStats(val n: Int, val best: Long?, val ao5: Long?, val ao12: Long?)
    data class Phone(val puz: String?, val stats: Map<String, PhoneStats>)

    fun parsePhone(json: String?): Phone? {
        val o = try { JSONObject(json ?: return null) } catch (e: Exception) { return null }
        val p = o.optJSONObject("p") ?: JSONObject()
        val map = mutableMapOf<String, PhoneStats>()
        p.keys().forEach { id ->
            val s = p.optJSONObject(id) ?: return@forEach
            fun num(k: String): Long? = if (s.isNull(k) || !s.has(k)) null else s.optLong(k, -1).takeIf { it > 0 }
            map[id] = PhoneStats(s.optInt("n", 0), num("best"), num("ao5"), num("ao12"))
        }
        return Phone(o.optString("puz").ifBlank { null }, map)
    }
}
