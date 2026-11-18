package com.steele.family.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Practice Clock on the watch: the same numbers as practiceclock/core.js (positionAt and the "wait for me" hold). */
class PracticeCoreTest {
    private val MIN = 60_000L
    private val T = 1_700_000_000_000L
    // Warm-up 10, Hitting as two 5-minute stations, Throwing 5 (25 minutes)
    private fun pk(wait: Boolean = false, ack: Int = 0, startMs: Long = T, pausedMs: Long = 0, pausedAt: Long? = null, finished: Boolean = false, hold: Boolean = false) =
        """{"v":1,"at":$T,"name":"Tuesday","wait":$wait,"ack":$ack,"startMs":$startMs,"pausedMs":$pausedMs,"pausedAt":${pausedAt ?: "null"},
            "finished":$finished,"hold":$hold,"segs":[{"n":"Warm-up","d":${10 * MIN}},{"n":"Hitting · Tee","d":${5 * MIN}},
            {"n":"Hitting · Station 2","d":${5 * MIN}},{"n":"Throwing","d":${5 * MIN}}]}"""

    @Test fun running() {
        val p = PracticeCore.parse(pk())!!
        assertEquals("Tuesday", p.name); assertEquals(4, p.segs.size); assertEquals(25 * MIN, p.totalMs)
        var n = PracticeCore.at(p, T + 3 * MIN)
        assertEquals(PracticeCore.Mode.RUNNING, n.mode); assertEquals(0, n.index); assertEquals(7 * MIN, n.segLeftMs); assertEquals(22 * MIN, n.totalLeftMs); assertEquals(T, n.since)
        n = PracticeCore.at(p, T + 10 * MIN)
        assertEquals(1, n.index, "a boundary belongs to the block that starts there"); assertEquals(5 * MIN, n.segLeftMs); assertEquals(T + 10 * MIN, n.since)
        n = PracticeCore.at(p, T + 17 * MIN)
        assertEquals(2, n.index); assertEquals(3 * MIN, n.segLeftMs); assertEquals(0.4f, n.segDoneFraction, 0.001f)
        // before the start (a phone clock a little ahead) counts as 0
        assertEquals(0, PracticeCore.at(p, T - 5000).index)
        // every segment end still to come, the last one marked
        val ch = PracticeCore.changes(p, T + 12 * MIN)
        assertEquals(listOf(T + 15 * MIN, T + 20 * MIN, T + 25 * MIN), ch.map { it.at })
        assertEquals(listOf(false, false, true), ch.map { it.last }); assertEquals(listOf(1, 2, 3), ch.map { it.index })
        // pauses already taken push everything later
        val q = PracticeCore.parse(pk(pausedMs = 2 * MIN))!!
        assertEquals(0, PracticeCore.at(q, T + 11 * MIN).index); assertEquals(T + 12 * MIN, PracticeCore.changes(q, T).first().at)
        assertEquals("7:00", PracticeCore.clock(7 * MIN)); assertEquals("0:01", PracticeCore.clock(1)); assertEquals("0:00", PracticeCore.clock(-5))
        assertEquals("1:00:00", PracticeCore.clock(3_599_999)); assertEquals("59:59", PracticeCore.clock(3_599_000))
    }

    @Test fun paused() {
        val p = PracticeCore.parse(pk(pausedAt = T + 12 * MIN))!!
        val n = PracticeCore.at(p, T + 40 * MIN)
        assertEquals(PracticeCore.Mode.PAUSED, n.mode, "a paused clock doesn't run out, however long the break")
        assertEquals(1, n.index); assertEquals(3 * MIN, n.segLeftMs); assertEquals(13 * MIN, n.totalLeftMs)
        assertTrue(PracticeCore.changes(p, T + 13 * MIN).isEmpty(), "no buzzes while paused")
    }

    @Test fun waitForMeHolds() {
        // running in block 1 of a "wait for me" plan: only the end of that block buzzes, then it holds
        val p = PracticeCore.parse(pk(wait = true))!!
        assertEquals(listOf(PracticeCore.Change(T + 10 * MIN, 0, false)), PracticeCore.changes(p, T + MIN))
        val n = PracticeCore.at(p, T + 12 * MIN)   // the phone is asleep and hasn't said so yet: the watch holds by itself
        assertEquals(PracticeCore.Mode.HOLDING, n.mode); assertEquals(0, n.index); assertEquals(0, n.segLeftMs); assertEquals(15 * MIN, n.totalLeftMs)
        assertEquals(T + 10 * MIN, n.since, "held at the moment the block ended")
        assertTrue(PracticeCore.changes(p, T + 12 * MIN).isEmpty())
        // the phone's own hold (pausedAt where the block ended) reads the same
        val h = PracticeCore.parse(pk(wait = true, pausedAt = T + 10 * MIN, hold = true))!!
        val hn = PracticeCore.at(h, T + 30 * MIN)
        assertEquals(PracticeCore.Mode.HOLDING, hn.mode); assertEquals(0, hn.index); assertEquals(T + 10 * MIN, hn.since)
        // the coach tapped Start next 4 minutes later (4 minutes of pause, ack 1): block 2 runs and holds at its end
        val g = PracticeCore.parse(pk(wait = true, ack = 1, pausedMs = 4 * MIN))!!
        val gn = PracticeCore.at(g, T + 16 * MIN)
        assertEquals(PracticeCore.Mode.RUNNING, gn.mode); assertEquals(1, gn.index); assertEquals(3 * MIN, gn.segLeftMs)
        assertEquals(listOf(T + 19 * MIN), PracticeCore.changes(g, T + 16 * MIN).map { it.at })
        // the last block just finishes
        val l = PracticeCore.parse(pk(wait = true, ack = 3))!!
        assertEquals(listOf(PracticeCore.Change(T + 25 * MIN, 3, true)), PracticeCore.changes(l, T + 21 * MIN))
    }

    @Test fun finished() {
        val p = PracticeCore.parse(pk(finished = true, pausedAt = T + 18 * MIN))!!
        val n = PracticeCore.at(p, T + 20 * MIN)
        assertEquals(PracticeCore.Mode.DONE, n.mode); assertEquals(T + 18 * MIN, n.since); assertEquals(3, n.index)
        assertTrue(PracticeCore.changes(p, T + 20 * MIN).isEmpty())
        // run out on its own while the phone slept: done, at the planned end
        val r = PracticeCore.parse(pk())!!
        val d = PracticeCore.at(r, T + 30 * MIN)
        assertEquals(PracticeCore.Mode.DONE, d.mode); assertEquals(T + 25 * MIN, d.since); assertEquals(0, d.totalLeftMs)
        assertTrue(PracticeCore.changes(r, T + 30 * MIN).isEmpty())
    }

    @Test fun junkAndNone() {
        assertNull(PracticeCore.parse(null)); assertNull(PracticeCore.parse("")); assertNull(PracticeCore.parse("not json"))
        assertNull(PracticeCore.parse("""{"v":1,"at":5,"none":true}"""), "no practice running")
        assertNull(PracticeCore.parse("""{"v":2,"startMs":5,"segs":[{"n":"a","d":1000}]}"""), "a newer format")
        assertNull(PracticeCore.parse("""{"v":1,"startMs":5,"segs":[]}"""))
        assertNull(PracticeCore.parse("""{"v":1,"segs":[{"n":"a","d":1000}]}"""), "no start")
        assertNull(PracticeCore.parse("""{"v":1,"startMs":5,"segs":[{"n":"a","d":-1}]}"""))
        assertNull(PracticeCore.parse("""{"v":1,"startMs":5,"segs":"x"}"""))
        val odd = PracticeCore.parse("""{"v":1,"startMs":$T,"ack":99,"segs":[{"d":60000},{"n":"${"x".repeat(80)}","d":60000}]}""")
        assertNotNull(odd)
        assertEquals("Block 1", odd.segs[0].name); assertEquals(40, odd.segs[1].name.length); assertEquals(1, odd.ack); assertEquals("Practice", odd.name); assertNull(odd.pausedAt)
    }
}
