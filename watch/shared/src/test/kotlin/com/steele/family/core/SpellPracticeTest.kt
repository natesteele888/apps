package com.steele.family.core

import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SpellPracticeTest {
    @Test fun lettersTheVoiceWritesDown() {
        assertEquals("sorcerer", SpellCore.lettersSaid("s o r c e r e r"))
        assertEquals("sorcerer", SpellCore.lettersSaid("S O R C E R E R."))
        assertEquals("sor", SpellCore.lettersSaid("S-O-R"))
        assertEquals("cat", SpellCore.lettersSaid("see a tea"), "letter names written as words")
        assertEquals("ruby", SpellCore.lettersSaid("are you be why"))
        assertEquals("Tuesday", SpellCore.lettersSaid("capital T u e s d a y"))
        assertEquals("ball", SpellCore.lettersSaid("b a double l"))
        assertEquals("they're", SpellCore.lettersSaid("t h e y apostrophe r e"))
        assertEquals("ice cream", SpellCore.lettersSaid("i c e space c r e a m"))
        assertEquals("wow", SpellCore.lettersSaid("double you o double you"))
        assertEquals("wow", SpellCore.lettersSaid("w o w"))
    }

    @Test fun notLetters() {
        assertNull(SpellCore.lettersSaid("sorcerer"), "said the word instead of spelling it")
        assertNull(SpellCore.lettersSaid("I don't know"))
        assertNull(SpellCore.lettersSaid(""))
        assertNull(SpellCore.lettersSaid(null as String?))
        assertNull(SpellCore.lettersSaid("apostrophe space"), "needs at least one letter")
        assertEquals("cat", SpellCore.lettersSaid(listOf("cat", "c a t")), "the first guess that is letters")
    }

    @Test fun rightOrNot() {
        assertTrue(SpellCore.isRight("Tuesday", "tuesday"), "capitals don't count")
        assertTrue(SpellCore.isRight("sorcerer", " sorcerer "))
        assertFalse(SpellCore.isRight("they're", "theyre"), "the apostrophe does")
        assertFalse(SpellCore.isRight("sorcerer", "sorserer"))
    }

    @Test fun whichLettersWereRight() {
        assertEquals(listOf(true, true, true, false, true, true, true, true), SpellCore.marks("sorcerer", "sorserer").toList())
        assertEquals(1, SpellCore.marks("necessary", "necesary").count { !it }, "one missed letter doesn't mark the rest wrong")
        assertTrue(SpellCore.marks("cat", "CAT").all { it })
        assertTrue(SpellCore.marks("cat", "").none { it })
    }

    @Test fun practiceList() {
        val words = SpellCore.practiceWords(listOf("cat", "dog", "Cat", "sorcerer"), random = Random(1))
        assertEquals(3, words.size, "each word once")
        assertEquals(setOf("cat", "dog", "sorcerer"), words.map { it.lowercase() }.toSet())
        assertEquals(2, SpellCore.practiceWords((1..20).map { "w$it" }, max = 2).size)
        assertEquals("Spell sorcerer.", SpellCore.ask("sorcerer"))
        assertEquals("Spell there. As in, over there.", SpellCore.ask("there"))
    }
}
