package com.steele.family.core

import org.json.JSONObject
import java.util.Locale

/**
 * My Stats on the watch: one player's LYBS stats season by season, career totals and personal bests.
 *
 * The phone writes them into the watch link's "ps" field from apps/stats (it reads the LYBS Dashboard's GameChanger
 * stats after signing in, and copies one player's counting stats). No name, team or coach goes over: just the year,
 * the level and the numbers. The text looks like
 *   {"v":1, "at":ms,
 *    "s":[{"y":2026, "lv":"Majors",
 *          "b":{"g":12,"pa":40,"ab":33,"h":11,"r":8,"rbi":7,"bb":5,"so":6,"hbp":1,"sb":6,"cs":1,"2b":2,"3b":1,"hr":0,"tb":15},
 *          "p":{"g":6,"gs":3,"ip":14.333,"so":18,"bb":6,"h":12,"er":7,"w":2,"l":1,"pc":220}}]}
 * "ip" is innings as a plain number (14.333 is 14⅓). Rates (AVG, OPS, ERA...) are worked out here, so a season and the
 * career use the same sums.
 */
object StatsCore {
    data class Bat(
        val g: Int = 0, val pa: Int = 0, val ab: Int = 0, val h: Int = 0, val r: Int = 0, val rbi: Int = 0, val bb: Int = 0,
        val so: Int = 0, val hbp: Int = 0, val sb: Int = 0, val cs: Int = 0, val d2: Int = 0, val d3: Int = 0, val hr: Int = 0, val tb: Int = 0,
    ) {
        /** total bases: the phone's, or worked out from the hits when it sent none */
        val bases: Int get() = if (tb > 0) tb else h + d2 + 2 * d3 + 3 * hr
        val avg: Double? get() = if (ab > 0) h.toDouble() / ab else null
        val obp: Double? get() = (ab + bb + hbp).let { if (it > 0) (h + bb + hbp).toDouble() / it else null }
        val slg: Double? get() = if (ab > 0) bases.toDouble() / ab else null
        val ops: Double? get() = obp?.let { o -> slg?.let { o + it } }
        val xbh: Int get() = d2 + d3 + hr
        operator fun plus(o: Bat) = Bat(g + o.g, pa + o.pa, ab + o.ab, h + o.h, r + o.r, rbi + o.rbi, bb + o.bb, so + o.so, hbp + o.hbp,
            sb + o.sb, cs + o.cs, d2 + o.d2, d3 + o.d3, hr + o.hr, bases + o.bases)
        val any: Boolean get() = pa > 0 || ab > 0 || g > 0
    }

    data class Pit(
        val g: Int = 0, val gs: Int = 0, val outs: Int = 0, val so: Int = 0, val bb: Int = 0, val h: Int = 0, val er: Int = 0,
        val w: Int = 0, val l: Int = 0, val pc: Int = 0,
    ) {
        val ip: Double get() = outs / 3.0
        val era: Double? get() = if (outs > 0) er * 27.0 / outs else null
        val whip: Double? get() = if (outs > 0) (h + bb) * 3.0 / outs else null
        val k9: Double? get() = if (outs > 0) so * 27.0 / outs else null
        operator fun plus(o: Pit) = Pit(g + o.g, gs + o.gs, outs + o.outs, so + o.so, bb + o.bb, h + o.h, er + o.er, w + o.w, l + o.l, pc + o.pc)
        val any: Boolean get() = outs > 0 || g > 0
    }

    data class Season(val year: Int, val level: String, val bat: Bat, val pit: Pit) {
        val label: String get() = listOf(year.toString(), level).filter { it.isNotBlank() }.joinToString(" · ")
    }

    data class Stats(val at: Long, val seasons: List<Season>) {
        val career: Season get() = Season(0, "Career", seasons.fold(Bat()) { a, s -> a + s.bat }, seasons.fold(Pit()) { a, s -> a + s.pit })
    }

    /** one personal best: what, the number shown, the season it came in, and whether it came this season */
    data class Best(val what: String, val shown: String, val year: Int, val latest: Boolean)

    private fun JSONObject?.int(k: String): Int = this?.optDouble(k, 0.0)?.takeIf { !it.isNaN() && it >= 0 && it < 1e6 }?.toInt() ?: 0

    fun parse(json: String?): Stats? = try {
        val o = JSONObject(json ?: "")
        val a = o.optJSONArray("s")
        val seasons = if (a == null) emptyList() else (0 until minOf(a.length(), 30)).mapNotNull { i ->
            val s = a.optJSONObject(i) ?: return@mapNotNull null
            val y = s.optInt("y"); if (y !in 2000..2100) return@mapNotNull null
            val b = s.optJSONObject("b"); val p = s.optJSONObject("p")
            val ip = p?.optDouble("ip", 0.0)?.takeIf { !it.isNaN() && it in 0.0..1000.0 } ?: 0.0
            Season(
                y, s.optString("lv").take(20),
                Bat(b.int("g"), b.int("pa"), b.int("ab"), b.int("h"), b.int("r"), b.int("rbi"), b.int("bb"), b.int("so"), b.int("hbp"),
                    b.int("sb"), b.int("cs"), b.int("2b"), b.int("3b"), b.int("hr"), b.int("tb")),
                Pit(p.int("g"), p.int("gs"), Math.round(ip * 3).toInt(), p.int("so"), p.int("bb"), p.int("h"), p.int("er"), p.int("w"), p.int("l"), p.int("pc")),
            )
        }
        // newest first; two rows for one year (two teams) stay as two
        Stats(o.optLong("at"), seasons.sortedWith(compareByDescending<Season> { it.year }.thenBy { it.level }))
    } catch (e: Exception) { null }

    /** ".333" the way baseball writes it, "1.050" when it's over one */
    fun rate(v: Double?): String = when {
        v == null -> "—"
        v >= 1.0 -> String.format(Locale.US, "%.3f", v)
        else -> String.format(Locale.US, "%.3f", v).removePrefix("0")
    }

    fun era(v: Double?): String = if (v == null) "—" else String.format(Locale.US, "%.2f", v)

    /** innings the baseball way: 14⅓ is "14.1" */
    fun ip(outs: Int): String = "${outs / 3}.${outs % 3}"

    /**
     * Personal bests across the seasons. Rates need enough of a season to count (10 at-bats, 4 innings), so one lucky
     * at-bat isn't a .1000 average. ERA and WHIP are best when lowest. Ties go to the newer season.
     */
    fun bests(seasons: List<Season>): List<Best> {
        if (seasons.isEmpty()) return emptyList()
        val latest = seasons.maxOf { it.year }
        val out = mutableListOf<Best>()
        fun count(what: String, get: (Season) -> Int) {
            val b = seasons.filter { get(it) > 0 }.maxWithOrNull(compareBy<Season> { get(it) }.thenBy { it.year }) ?: return
            out += Best(what, get(b).toString(), b.year, b.year == latest)
        }
        fun high(what: String, ok: (Season) -> Boolean, get: (Season) -> Double?, fmt: (Double) -> String) {
            val b = seasons.filter { ok(it) && get(it) != null }.maxWithOrNull(compareBy<Season> { get(it)!! }.thenBy { it.year }) ?: return
            out += Best(what, fmt(get(b)!!), b.year, b.year == latest)
        }
        fun low(what: String, ok: (Season) -> Boolean, get: (Season) -> Double?, fmt: (Double) -> String) {
            val b = seasons.filter { ok(it) && get(it) != null }.minWithOrNull(compareBy<Season> { get(it)!! }.thenByDescending { it.year }) ?: return
            out += Best(what, fmt(get(b)!!), b.year, b.year == latest)
        }
        val bats = { s: Season -> s.bat.ab >= 10 }
        val arms = { s: Season -> s.pit.outs >= 12 }
        high("AVG", bats, { it.bat.avg }, ::rate)
        high("OBP", bats, { it.bat.obp }, ::rate)
        high("OPS", bats, { it.bat.ops }, ::rate)
        count("Hits") { it.bat.h }
        count("Home runs") { it.bat.hr }
        count("Extra-base hits") { it.bat.xbh }
        count("RBI") { it.bat.rbi }
        count("Runs") { it.bat.r }
        count("Stolen bases") { it.bat.sb }
        count("Walks") { it.bat.bb }
        count("Strikeouts pitching") { it.pit.so }
        high("Innings", { it.pit.outs > 0 }, { it.pit.outs.toDouble() }, { ip(it.toInt()) })
        count("Wins") { it.pit.w }
        low("ERA", arms, { it.pit.era }, ::era)
        low("WHIP", arms, { it.pit.whip }, ::era)
        return out
    }

    /** "3 personal bests in 2026" for the top of the screen (the newest season), or "" */
    fun newBestsLine(b: List<Best>): String {
        val n = b.count { it.latest }
        val y = b.firstOrNull { it.latest }?.year ?: return ""
        return if (n == 1) "1 personal best in $y" else "$n personal bests in $y"
    }
}
