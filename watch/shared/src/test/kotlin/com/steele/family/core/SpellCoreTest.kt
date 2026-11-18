package com.steele.family.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SpellCoreTest {
    /** the real list the watch ships with (watch/family/src/main/assets/spell/words.txt) */
    private val words: WordList by lazy {
        val f = listOf("../family/src/main/assets/spell/words.txt", "family/src/main/assets/spell/words.txt").map(::File).first { it.exists() }
        WordList(f.readLines().asSequence())
    }

    @Test fun parsesWhatAKidSays() {
        assertEquals("sorcerer", SpellCore.parse("spell sorcerer"))
        assertEquals("sorcerer", SpellCore.parse("Hey Spelling Genie, spell sorcerer."))
        assertEquals("sorcerer", SpellCore.parse("hey genie how do you spell sorcerer"))
        assertEquals("sorcerer", SpellCore.parse("Hey spelling, help me spell sorcerer please"))
        assertEquals("sorcerer", SpellCore.parse("how do you spell the word sorcerer"))
        assertEquals("sorcerer", SpellCore.parse("how is sorcerer spelled"))
        assertEquals("sorcerer", SpellCore.parse("what's the spelling of sorcerer"))
        assertEquals("sorcerer", SpellCore.parse("can you spell sorcerer for me"))
        assertEquals("Sorcerer", SpellCore.parse("Sorcerer"), "just the word works too")
        assertEquals("ice cream", SpellCore.parse("spell ice cream"))
        assertEquals("genie", SpellCore.parse("spell genie"), "the genie's own name can be asked for")
        assertEquals("they're", SpellCore.parse("spell they’re"), "a curly apostrophe from the voice")
        assertEquals("spelling", SpellCore.parse("how do you spell spelling"))
        assertNull(SpellCore.parse("hey spelling genie"))
        assertNull(SpellCore.parse("spell"))
        assertNull(SpellCore.parse(""))
        assertNull(SpellCore.parse(null))
        assertNull(SpellCore.parse("spell the whole thing I said at recess today"), "a sentence isn't a word")
    }

    @Test fun theWordList() {
        assertTrue(words.size > 70_000)
        assertTrue(words.knows("sorcerer"))
        assertTrue(words.knows("Sorcerer"))
        assertTrue(words.knows("ice cream"))
        assertTrue(words.knows("they're"))
        assertTrue(words.knows("Massachusetts"))
        assertFalse(words.knows("sorserer"))
        assertEquals("Tuesday", words.display("tuesday"))
        assertEquals("sorcerer", words.display("Sorcerer"), "the voice's first-word capital goes")
        assertEquals("Zorbly", words.display("Zorbly"), "a word not in the list stays as heard")
    }

    @Test fun closestRealWords() {
        assertEquals("sorcerer", words.closest("sorserer").first())
        assertTrue("necessary" in words.closest("neccesary"))
        assertTrue("phonetic" in words.closest("fonetik"), "spelled the way it sounds")
        assertTrue("circus" in words.closest("sircus"))
        assertTrue("because" in words.closest("becuase"), "two letters swapped")
        assertTrue(words.closest("a").isEmpty())
    }

    @Test fun answers() {
        val a = assertNotNull(SpellCore.answer(listOf("spell sorcerer"), words))
        assertEquals("sorcerer", a.word); assertTrue(a.known); assertTrue(a.others.isEmpty())

        val t = assertNotNull(SpellCore.answer(listOf("spell there", "spell their"), words))
        assertEquals("there", t.word); assertEquals("over there", t.hint)
        assertEquals(listOf("their", "they're"), t.others.map { it.word }, "sound-alikes, each once")
        assertEquals("belongs to them", t.others[0].hint)

        val g = assertNotNull(SpellCore.answer(listOf("spell sorcerors", "spell sorcerers"), words))
        assertEquals("sorcerers", g.word, "the voice's first real word wins")
        assertTrue(g.known)

        val typed = assertNotNull(SpellCore.answer(listOf("sorserer"), words))
        assertEquals("sorserer", typed.word); assertFalse(typed.known)
        assertEquals("sorcerer", typed.others.first().word)

        assertNull(SpellCore.answer(listOf("hey genie"), words))
        assertNull(SpellCore.answer(emptyList(), words))
    }

    @Test fun lettersAndVoice() {
        assertEquals(listOf("c", "a", "t"), SpellCore.letters("cat"))
        assertEquals(listOf("cat", "C", "A", "T", "cat"), SpellCore.spoken("cat"))
        assertEquals(listOf("they're", "T", "H", "E", "Y", "apostrophe", "R", "E", "they're"), SpellCore.spoken("they're"))
        assertEquals("capital T", SpellCore.spoken("Tuesday")[1])
    }

    @Test fun recentWords() {
        assertEquals(listOf("cat", "dog"), SpellCore.remember(listOf("dog"), "cat"))
        assertEquals(listOf("Dog", "cat"), SpellCore.remember(listOf("cat", "dog"), "Dog"), "each word once, newest first")
        assertEquals(12, SpellCore.remember((1..20).map { "w$it" }, "x").size)
    }

    @Test fun distance() {
        assertEquals(0, WordList.distance("cat", "cat"))
        assertEquals(1, WordList.distance("cat", "act"))
        assertEquals(1, WordList.distance("cat", "cart"))
        assertEquals(3, WordList.distance("kitten", "sitting"))
        assertEquals(2, WordList.distance("kitten", "sitting", limit = 1), "stops early past the limit")
    }
}
