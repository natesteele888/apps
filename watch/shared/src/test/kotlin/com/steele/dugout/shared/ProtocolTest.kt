package com.steele.dugout.shared

import org.json.JSONArray
import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class ProtocolTest {
    private fun b(id: String, name: String) = JSONObject().put("id", id).put("name", name).put("num", "1").put("pos", "P").put("ready", true).put("code", "ready")

    @Test fun readsTheBench() {
        val o = JSONObject().put("ready", true).put("batter", 1)
            .put("lineup", JSONArray().put(b("a1", "Player 1")).put(b("a2", "Player 2")))
            .put("bench", JSONArray().put(b("a3", "Player 3")).put(b("a1", "Player 1 again")).put(b("bad id!", "x")))
        val st = assertNotNull(Proto.parseState(o.toString(), 5))
        assertEquals(listOf("a1", "a2"), st.lineup.map { it.id })
        assertEquals(listOf("a3"), st.bench.map { it.id }, "a lineup player or a bad id never shows on the bench")
        assertEquals(1, st.batter)
    }

    @Test fun anOlderPhoneWithNoBenchStillWorks() {
        val o = JSONObject().put("ready", true).put("lineup", JSONArray().put(b("a1", "Player 1")))
        val st = assertNotNull(Proto.parseState(o.toString(), 5))
        assertEquals(emptyList(), st.bench)
    }

    @Test fun theOrderWrapsAround() {
        assertEquals(0, Proto.wrap(9, 9), "after the ninth batter comes the first")
        assertEquals(8, Proto.wrap(-1, 9), "before the first comes the ninth")
        assertEquals(4, Proto.wrap(4, 9))
        assertEquals(0, Proto.wrap(3, 0))
    }

    @Test fun swapCommand() {
        val o = JSONObject(Proto.swap("a2", "a3"))
        assertEquals("swap", o.getString("cmd")); assertEquals("a2", o.getString("out")); assertEquals("a3", o.getString("in"))
    }

    @Test fun theSongCountdownComesFromThePhone() {
        val base = JSONObject().put("ready", true).put("lineup", JSONArray().put(b("a1", "Player 1")))
        assertEquals(2, assertNotNull(Proto.parseState(base.toString(), 5)).delay, "an older phone sends none: 2 seconds")
        assertEquals(0, assertNotNull(Proto.parseState(JSONObject(base.toString()).put("delay", 0).toString(), 5)).delay, "0 means play right away")
        assertEquals(4, assertNotNull(Proto.parseState(JSONObject(base.toString()).put("delay", 4).toString(), 5)).delay)
        assertEquals(5, assertNotNull(Proto.parseState(JSONObject(base.toString()).put("delay", 99).toString(), 5)).delay, "never more than 5")
        assertEquals(0, assertNotNull(Proto.parseState(JSONObject(base.toString()).put("delay", -3).toString(), 5)).delay)
    }

    @Test fun stopRightAway() {
        val o = JSONObject(Proto.cmd("stop", "now" to true))
        assertEquals("stop", o.getString("cmd")); assertEquals(true, o.getBoolean("now"))
    }

    @Test fun keepPlayingComesWithWhatIsPlaying() {
        val base = JSONObject().put("ready", true).put("lineup", JSONArray().put(b("a1", "Player 1")))
        val p1 = JSONObject().put("id", "a1").put("label", "#1 Player 1").put("elapsed", 2.0).put("total", 10.0)
        val old = assertNotNull(assertNotNull(Proto.parseState(JSONObject(base.toString()).put("playing", p1).toString(), 5)).playing)
        assertEquals(0, old.ext, "an older phone says nothing: no hold to keep playing"); assertEquals(false, old.extended)
        val p2 = JSONObject(p1.toString()).put("ext", 30).put("extended", false)
        assertEquals(30, assertNotNull(assertNotNull(Proto.parseState(JSONObject(base.toString()).put("playing", p2).toString(), 5)).playing).ext)
        val p3 = JSONObject(p1.toString()).put("ext", 0).put("extended", true).put("total", 40.0)
        val kept = assertNotNull(assertNotNull(Proto.parseState(JSONObject(base.toString()).put("playing", p3).toString(), 5)).playing)
        assertEquals(true, kept.extended); assertEquals(40.0, kept.total)
        assertEquals("extend", JSONObject(Proto.cmd("extend")).getString("cmd"))
    }
}
