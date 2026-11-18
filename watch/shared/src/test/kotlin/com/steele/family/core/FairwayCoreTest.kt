package com.steele.family.core

import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FairwayCoreTest {
    // a made-up 9-hole course; hole 2 has its green marked (front, middle, back about 10 yards apart going north)
    private val fg = """{"v":1,"at":1763400000000,"e":"abcdefghijklmnopqrst","sh":true,"r":1,"p":"pl0001ab","pn":"Sam","nm":"Test cup",
        "ck":"n:test course","cn":"Test Course","st":1,
        "h":[{"p":4,"y":380},{"p":5,"y":491,"f":[42.000000,-71.000000],"c":[42.000090,-71.000000],"b":[42.000180,-71.000000],"n":["OB left","Brook right"]},
             {"p":3,"y":150},{"p":4,"y":360},{"p":4,"y":400},{"p":5,"y":520},{"p":3,"y":170},{"p":4,"y":390},{"p":4,"y":410}],
        "s":{"1":5,"3":3},"bag":[["7 iron",150],["Driver",240],["Pitching wedge",120],["5 iron",175]]}"""

    @Test fun parsesTheRound() {
        val r = assertNotNull(FairwayCore.parse(fg))
        assertEquals(9, r.holes.size)
        assertTrue(r.shared)
        assertEquals(mapOf(1 to 5, 3 to 3), r.scores)
        assertEquals("Driver", r.bag.first().name, "the bag is longest first")
        assertEquals(listOf("OB left", "Brook right"), r.hole(2)!!.notes)
        assertNull(FairwayCore.parse("""{"v":1,"h":[]}"""), "a round needs 9 or 18 holes")
        assertNull(FairwayCore.parse("not json"))
        assertNull(FairwayCore.parse(null))
        val local = assertNotNull(FairwayCore.parse(fg.replace("\"sh\":true", "\"sh\":false")))
        assertTrue(!local.shared)
    }

    @Test fun playOrderFromAShotgunStart() {
        assertEquals(listOf(7, 8, 9, 1, 2, 3, 4, 5, 6), FairwayCore.playOrder(9, 7))
        assertEquals((1..18).toList(), FairwayCore.playOrder(18, 1))
    }

    @Test fun yardsToTheGreen() {
        val r = FairwayCore.parse(fg)!!
        // 0.0009 degrees of latitude south of the front is about 109 yards
        val here = FairwayCore.Spot(41.999100, -71.000000)
        val g = assertNotNull(FairwayCore.greenYards(r.hole(2)!!, here))
        assertEquals(109, g.front)
        assertEquals(120, g.mid)
        assertEquals(131, g.back)
        assertNull(FairwayCore.greenYards(r.hole(1)!!, here), "no marks on hole 1")
        assertNull(FairwayCore.greenYards(r.hole(2)!!, null), "no GPS yet")
    }

    @Test fun clubFromTheBag() {
        val bag = FairwayCore.parse(fg)!!.bag
        assertEquals("7 iron", FairwayCore.club(bag, 150))
        assertEquals("5 iron", FairwayCore.club(bag, 160))
        assertEquals("Driver, and it won't get there", FairwayCore.club(bag, 300))
        assertEquals("A soft pitching wedge", FairwayCore.club(bag, 80))
        assertEquals("", FairwayCore.club(emptyList(), 150))
    }

    @Test fun theRoundSoFar() {
        val r = FairwayCore.parse(fg)!!
        val s = FairwayCore.merged(r, mapOf(2 to 6, 3 to 0))
        assertEquals(mapOf(1 to 5, 2 to 6), s, "the watch's 6 on hole 2 is added and its clear on hole 3 wins")
        val sum = FairwayCore.summary(r, s)
        assertEquals(2, sum.thru); assertEquals(11, sum.strokes); assertEquals(2, sum.toPar)
        assertEquals("+2", FairwayCore.toParText(2)); assertEquals("E", FairwayCore.toParText(0)); assertEquals("-1", FairwayCore.toParText(-1))
        assertEquals(3, FairwayCore.nextHole(r, s))
        assertEquals("Birdie", FairwayCore.scoreName(4, 5)); assertEquals("Hole in one", FairwayCore.scoreName(1, 3))
    }

    @Test fun scoreWriteTouchesOnlyThatHole() {
        val (path, body) = assertNotNull(FairwayCore.scoreWrite("abcdefghijklmnopqrst", "pl0001ab", 1, 7, 5, 99L))
        assertTrue(path.startsWith("golf_events/abcdefghijklmnopqrst?updateMask.fieldPaths="))
        assertTrue(path.contains("p.%60pl0001ab%60.s.%601_7%60"), path)
        assertTrue(path.endsWith("&updateMask.fieldPaths=updated"))
        val o = JSONObject(body).getJSONObject("fields")
        assertEquals("5", o.getJSONObject("p").getJSONObject("mapValue").getJSONObject("fields").getJSONObject("pl0001ab")
            .getJSONObject("mapValue").getJSONObject("fields").getJSONObject("s").getJSONObject("mapValue").getJSONObject("fields")
            .getJSONObject("1_7").getString("integerValue"))
        assertEquals("99", o.getJSONObject("updated").getString("integerValue"))
        val cleared = assertNotNull(FairwayCore.scoreWrite("abcdefghijklmnopqrst", "pl0001ab", 1, 7, null, 99L)).second
        assertTrue(!cleared.contains("1_7"), "a clear leaves the hole out of the body, so the mask removes it")
        assertNull(FairwayCore.scoreWrite("not-a-code", "pl0001ab", 1, 7, 5, 0L))
        assertNull(FairwayCore.scoreWrite("abcdefghijklmnopqrst", "x", 1, 7, 5, 0L))
        assertNull(FairwayCore.scoreWrite("abcdefghijklmnopqrst", "pl0001ab", 1, 7, 25, 0L))
    }

    @Test fun jackAnswers() {
        val r = FairwayCore.parse(fg)!!
        val h2 = r.hole(2)!!
        val here = FairwayCore.greenYards(h2, FairwayCore.Spot(41.999100, -71.000000))
        val s = r.scores
        assertEquals("120 to the middle, 109 to the front, 131 to the back.", FairwayCore.jack("Hey Jack, how far?", r, h2, here, s).text)
        assertEquals("120 to go to the middle. Pitching wedge.", FairwayCore.jack("what club", r, h2, here, s).text)
        assertEquals("Hole 2: OB left. Brook right.", FairwayCore.jack("hey jack any notes", r, h2, here, s).text)
        val n = FairwayCore.jack("Hey Jack, remember that the green slopes back to front", r, h2, here, s)
        assertEquals("The green slopes back to front", n.note)
        assertEquals("You're 1 over through 2, 8 strokes.", FairwayCore.jack("how am I doing", r, h2, here, s).text)
        // no GPS marks on hole 4 and no score there yet: the club comes from the scorecard yards off the tee
        val h4 = r.hole(4)!!
        assertEquals("360 to go from the tee. Driver, and it won't get there.", FairwayCore.jack("what should I hit", r, h4, null, s).text)
        assertTrue(FairwayCore.jack("how far", r, h4, null, s).text.startsWith("Hole 4 is 360 from your tees."))
        assertNull(FairwayCore.jack("tell me a joke", r, h4, null, s).note)
    }
}
