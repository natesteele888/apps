package com.steele.family.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SyllablesTest {
    private fun asset(name: String) = listOf("../family/src/main/assets/spell/$name", "family/src/main/assets/spell/$name").map(::File).first { it.exists() }
    private val words: WordList by lazy { WordList(asset("words.txt").readLines().asSequence()) }
    private val parts: Syllables by lazy { Syllables(asset("parts.txt").readLines().asSequence(), words::sizeOf) }
    private fun s(w: String) = parts.split(w).joinToString("-")

    @Test fun clapsItOut() {
        assertTrue(parts.size > 4000)
        assertEquals("sor-cer-er", s("sorcerer"))
        assertEquals("but-ter-fly", s("butterfly"))
        assertEquals("ba-na-na", s("banana"), "split again after the patterns")
        assertEquals("a-bout", s("about"))
        assertEquals("e-le-phant", s("elephant"), "ph stays together")
        assertEquals("di-no-saur", s("dinosaur"))
        assertEquals("fam-i-ly", s("family"))
        assertEquals("hap-py", s("happy"))
        assertEquals("dif-fer-ent", s("different"))
        assertEquals("Wed-nes-day", s("Wednesday"), "capitals stay")
        assertEquals("yes-ter-day", s("yesterday"))
        assertEquals("beau-ti-ful", s("beautiful"))
    }

    @Test fun endings() {
        assertEquals("ta-ble", s("table"))
        assertEquals("lit-tle", s("little"))
        assertEquals("can-dles", s("candles"))
        assertEquals("cho-co-late", s("chocolate"), "a silent e makes no part")
        assertEquals("fire", s("fire"))
        assertEquals("jumped", s("jumped"))
        assertEquals("want-ed", s("wanted"))
        assertEquals("makes", s("makes"))
        assertEquals("box-es", s("boxes"))
        assertEquals("grant-ing", s("granting"), "no part without a vowel sound")
        assertEquals("queen", s("queen"))
    }

    @Test fun twoWordsInOne() {
        assertEquals("home-work", s("homework"))
        assertEquals("base-ment", s("basement"))
        assertEquals("some-times", s("sometimes"))
        assertEquals("brave-ly", s("bravely"))
    }

    @Test fun shortAndOdd() {
        assertEquals("cat", s("cat"))
        assertEquals("they're", s("they're"))
        assertEquals("ice -cream", s("ice cream"), "each word on its own, the space kept")
        assertEquals(emptyList(), parts.split(""))
    }

    @Test fun spokenInParts() {
        assertEquals(listOf("table", "ta", "T", "A", "ble", "B", "L", "E", "table"), SpellCore.spokenParts("table", listOf("ta", "ble")))
        assertEquals(listOf("ice cream", "ice", "I", "C", "E", "cream", "C", "R", "E", "A", "M", "ice cream"),
            SpellCore.spokenParts("ice cream", listOf("ice ", "cream")))
    }
}
