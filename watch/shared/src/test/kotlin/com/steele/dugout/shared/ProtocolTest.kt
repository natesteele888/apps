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
}
