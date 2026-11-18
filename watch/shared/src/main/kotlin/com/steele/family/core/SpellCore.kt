package com.steele.family.core

/**
 * Spelling Genie: turns what was said ("hey spelling genie, how do you spell sorcerer") into the word, checks it against a
 * real word list (SCOWL, see tools/spell-words.py), and offers choices when the voice may have heard it wrong:
 * the voice's other guesses, words that sound the same (their, there, they're) and, for a word that isn't in the list,
 * the closest real words. Nothing here touches the network or keeps anything: the screen on the watch does the keeping.
 */
object SpellCore {
    data class Choice(val word: String, val hint: String? = null)
    data class Answer(
        val word: String,
        /** every word of it is in the word list */
        val known: Boolean,
        /** what to say next to the word when it sounds like another one ("belongs to them") */
        val hint: String?,
        /** "did you mean" choices, best first */
        val others: List<Choice>,
    )

    private val wake = listOf(
        "hey spelling genie", "hi spelling genie", "ok spelling genie", "okay spelling genie", "spelling genie",
        "hey genie", "hi genie", "ok genie", "okay genie", "hey jeannie", "hey jeanie", "hey jenny", "hey spelling", "genie",
    )
    private val askWords = setOf("spell", "spelling", "spelled", "spelt", "spells")
    private val leadFill = listOf(
        "the word", "a word", "the name", "word", "out", "please", "for me", "of", "is", "as", "like",
    )
    private val tailFill = listOf("please", "for me", "thanks", "thank you", "genie", "spelling genie", "again")
    private val politeStart = listOf(
        "can you help me", "could you help me", "help me", "can you", "could you", "would you", "will you", "please",
        "how do you", "how do i", "how to", "i need to", "i want to", "what's the", "whats the", "tell me how to", "show me how to",
        "help", "what is the", "how is",
    )

    /** the word or short phrase asked for, or null when nothing is left once the asking words are taken off */
    fun parse(heard: String?): String? {
        if (heard == null) return null
        var t = heard.replace('’', '\'').replace(Regex("[^\\p{L}\\p{N}' -]"), " ").trim().replace(Regex("\\s+"), " ")
        fun low() = t.lowercase()
        fun dropStart(p: String): Boolean {
            val l = low()
            if (l == p || l.startsWith("$p ")) { t = t.substring(p.length).trim(); return true }
            return false
        }
        fun dropEnd(p: String): Boolean {
            val l = low()
            if (l != p && l.endsWith(" $p")) { t = t.substring(0, t.length - p.length).trim(); return true }
            return false
        }
        while (wake.any(::dropStart) || politeStart.any(::dropStart)) { }
        val toks = t.split(' ').filter { it.isNotEmpty() }
        val at = toks.indexOfFirst { it.lowercase() in askWords }
        if (at >= 0 && at < toks.size - 1) t = toks.drop(at + 1).joinToString(" ")
        else if (at >= 0) t = toks.take(at).joinToString(" ")      // "sorcerer, how do you spell that"
        while (leadFill.any { low() != it && dropStart(it) }) { }
        while (tailFill.any(::dropEnd)) { }
        t = t.trim('\'', '-', ' ')
        if (t.isEmpty()) return null
        val words = t.split(' ')
        if (words.size > 4) return null                              // a sentence, not a word to spell
        return words.joinToString(" ")
    }

    /** the letters as they show on the watch: one tile each, spaces kept as gaps */
    fun letters(word: String): List<String> = word.map { it.toString() }

    /** what the watch says out loud: the word, then each letter, then the word again */
    fun spoken(word: String): List<String> {
        val parts = mutableListOf(word)
        for (c in word) parts += when (c) {
            ' ' -> "space"
            '-' -> "dash"
            '\'' -> "apostrophe"
            else -> if (c.isUpperCase()) "capital $c" else c.uppercaseChar().toString()
        }
        parts += word
        return parts
    }

    /** the newest first, each word once, at most [max] */
    fun remember(recent: List<String>, word: String, max: Int = 12): List<String> =
        (listOf(word) + recent.filter { !it.equals(word, ignoreCase = true) }).take(max)

    /**
     * The answer from the voice's guesses ([heard], best first): its first guess that's a real word, else its first guess.
     * Typed words come in the same way, as a one-item list.
     */
    fun answer(heard: List<String>, words: WordList): Answer? {
        val asked = heard.mapNotNull(::parse).map { words.display(it) }.distinctBy { it.lowercase() }
        if (asked.isEmpty()) return null
        val word = asked.firstOrNull { words.knows(it) } ?: asked.first()
        val known = words.knows(word)
        val out = mutableListOf<Choice>()
        fun add(w: String, hint: String? = null) {
            if (!w.equals(word, ignoreCase = true) && out.none { it.word.equals(w, ignoreCase = true) }) out += Choice(w, hint)
        }
        Homophones.of(word).forEach { (w, h) -> add(w, h) }
        asked.drop(1).forEach { add(it, Homophones.hint(it)) }
        // a word the list doesn't have: the closest real ones (not for a name, which the list leaves out)
        if (!known && !word.contains(' ') && !word[0].isUpperCase()) words.closest(word).forEach { add(it) }
        return Answer(word, known, Homophones.hint(word), out.take(6))
    }
}

/** words that sound the same, with a few words on which is which */
object Homophones {
    private val groups: List<List<Pair<String, String>>> = listOf(
        listOf("there" to "over there", "their" to "belongs to them", "they're" to "they are"),
        listOf("to" to "go to school", "too" to "also, or too much", "two" to "the number 2"),
        listOf("your" to "belongs to you", "you're" to "you are"),
        listOf("its" to "belongs to it", "it's" to "it is"),
        listOf("whose" to "belongs to who", "who's" to "who is"),
        listOf("weather" to "rain or sun", "whether" to "if"),
        listOf("which" to "which one", "witch" to "on a broom"),
        listOf("right" to "correct, or not left", "write" to "with a pencil"),
        listOf("know" to "I know it", "no" to "not yes"),
        listOf("knew" to "already knew", "new" to "not old"),
        listOf("hear" to "with your ears", "here" to "this place"),
        listOf("by" to "next to", "buy" to "pay for", "bye" to "goodbye"),
        listOf("for" to "this is for you", "four" to "the number 4"),
        listOf("one" to "the number 1", "won" to "won the game"),
        listOf("ate" to "ate dinner", "eight" to "the number 8"),
        listOf("our" to "belongs to us", "hour" to "60 minutes"),
        listOf("whole" to "all of it", "hole" to "a hole in the ground"),
        listOf("threw" to "threw the ball", "through" to "go through"),
        listOf("week" to "7 days", "weak" to "not strong"),
        listOf("meet" to "meet a friend", "meat" to "food"),
        listOf("see" to "with your eyes", "sea" to "the ocean"),
        listOf("son" to "a boy", "sun" to "in the sky"),
        listOf("tail" to "a dog's tail", "tale" to "a story"),
        listOf("road" to "a street", "rode" to "rode a bike"),
        listOf("flour" to "for baking", "flower" to "a plant"),
        listOf("piece" to "a part", "peace" to "calm, no fighting"),
        listOf("plain" to "simple", "plane" to "flies"),
        listOf("break" to "break it", "brake" to "slow down"),
        listOf("wait" to "wait for it", "weight" to "how heavy"),
        listOf("way" to "which way", "weigh" to "on a scale"),
        listOf("wood" to "from a tree", "would" to "I would"),
        listOf("knight" to "in armor", "night" to "not day"),
        listOf("not" to "no", "knot" to "tie a knot"),
        listOf("made" to "made it", "maid" to "cleans"),
        listOf("mail" to "letters", "male" to "a boy or man"),
        listOf("pair" to "two of them", "pear" to "a fruit"),
        listOf("sail" to "a boat sail", "sale" to "on sale"),
        listOf("bare" to "nothing on", "bear" to "an animal"),
        listOf("blew" to "the wind blew", "blue" to "a color"),
        listOf("dear" to "Dear Mom", "deer" to "an animal"),
        listOf("be" to "to be", "bee" to "buzzes"),
        listOf("cent" to "a penny", "sent" to "sent it", "scent" to "a smell"),
        listOf("principal" to "runs the school", "principle" to "a rule"),
        listOf("allowed" to "you're allowed", "aloud" to "out loud"),
        listOf("board" to "a wood board", "bored" to "nothing to do"),
        listOf("stair" to "steps", "stare" to "look hard"),
        listOf("steal" to "take, or steal a base", "steel" to "a metal"),
        listOf("pitcher" to "throws the pitch, or holds water", "picture" to "a photo (sounds close)"),
        listOf("then" to "after that", "than" to "bigger than"),
        listOf("accept" to "take it", "except" to "all but"),
        listOf("affect" to "to change something", "effect" to "the result"),
        listOf("lose" to "not win", "loose" to "not tight"),
        listOf("desert" to "sand", "dessert" to "sweet treat"),
        listOf("were" to "we were", "where" to "which place", "wear" to "wear a hat"),
        listOf("feet" to "on your legs", "feat" to "a big deed"),
        listOf("in" to "inside", "inn" to "a hotel"),
        listOf("hair" to "on your head", "hare" to "a rabbit"),
        listOf("heal" to "get better", "heel" to "back of your foot"),
        listOf("rain" to "water from clouds", "reign" to "a king's rule", "rein" to "for a horse"),
        listOf("toe" to "on your foot", "tow" to "pull a car"),
        listOf("ad" to "an ad", "add" to "plus"),
        listOf("ant" to "a bug", "aunt" to "your parent's sister"),
        listOf("cell" to "a phone, or in your body", "sell" to "for money"),
        listOf("die" to "a dice cube", "dye" to "color it"),
        listOf("fair" to "fair play", "fare" to "a ticket price"),
        listOf("higher" to "more high", "hire" to "give a job"),
        listOf("idle" to "not moving", "idol" to "a hero"),
        listOf("mind" to "your brain", "mined" to "dug out"),
        listOf("nose" to "on your face", "knows" to "he knows"),
        listOf("quarts" to "of milk", "quartz" to "a rock"),
        listOf("root" to "of a plant", "route" to "the way to go"),
        listOf("soar" to "fly high", "sore" to "it hurts"),
        listOf("some" to "a few", "sum" to "add it up"),
        listOf("tea" to "a drink", "tee" to "golf tee or T-shirt"),
        listOf("waist" to "your middle", "waste" to "throw away"),
        listOf("weave" to "like a basket", "we've" to "we have"),
        listOf("aisle" to "in a store", "I'll" to "I will", "isle" to "an island"),
    )
    private val byWord: Map<String, List<Pair<String, String>>> = buildMap {
        for (g in groups) for ((w, _) in g) put(w.lowercase(), (get(w.lowercase()) ?: emptyList()) + g)
    }

    /** the other words that sound like [word], each with its hint */
    fun of(word: String): List<Pair<String, String>> =
        (byWord[word.lowercase()] ?: emptyList()).filter { !it.first.equals(word, ignoreCase = true) }.distinctBy { it.first }

    fun hint(word: String): String? =
        byWord[word.lowercase()]?.firstOrNull { it.first.equals(word, ignoreCase = true) }?.second
}

/**
 * The word list. Lines are words; a "#NN" line starts a size (SCOWL's: the smaller, the more common).
 * Lookups ignore case; [display] gives the list's own capitals (tuesday → Tuesday).
 */
class WordList(lines: Sequence<String>) {
    private class Entry(val form: String, val size: Int)
    private val map = HashMap<String, Entry>(120_000)
    private val bySound: Map<String, List<String>> by lazy {
        val m = HashMap<String, MutableList<String>>(90_000)
        for (k in map.keys) if (!k.contains(' ')) m.getOrPut(soundKey(k)) { mutableListOf() } += k
        m
    }

    init {
        var size = 10
        for (raw in lines) {
            val l = raw.trim()
            if (l.isEmpty()) continue
            if (l.startsWith("#")) { size = l.drop(1).toIntOrNull() ?: size; continue }
            val k = l.lowercase()
            val old = map[k]
            // keep the lowercase form when both exist (polish and Polish: "polish" is what a kid asks for)
            if (old == null || (old.form != k && l == k)) map[k] = Entry(l, minOf(size, old?.size ?: size))
        }
    }

    val size get() = map.size

    fun knows(phrase: String) = phrase.split(' ').all { it.isEmpty() || map.containsKey(it.lowercase()) }

    /**
     * the list's spelling of each word (its capitals: "sorcerer", "Tuesday"), or the word as it came in when it isn't in
     * the list (a name the voice wrote with a capital keeps it)
     */
    fun display(phrase: String) = phrase.split(' ').joinToString(" ") { w -> map[w.lowercase()]?.form ?: w }

    /** the closest real words to [word]: one or two letters off, or spelled the way it sounds; common words first */
    fun closest(word: String, max: Int = 4): List<String> {
        val w = word.lowercase()
        if (w.length < 2) return emptyList()
        val limit = if (w.length <= 4) 1 else 2
        val sound = (bySound[soundKey(w)] ?: emptyList()).toHashSet()
        // score: twice the letters off, one less when it also sounds the same; sounds-the-same-only words come after
        // one-letter-off words and before two-letters-off ones
        val found = HashMap<String, Int>()
        for (k in map.keys) {
            if (kotlin.math.abs(k.length - w.length) > limit) continue
            val d = distance(w, k, limit)
            if (d <= limit) found[k] = 2 * d - if (k in sound) 1 else 0
        }
        for (k in sound) if (k !in found) found[k] = 3
        found.remove(w)
        return found.entries
            .sortedWith(compareBy({ it.value }, { distance(w, it.key) }, { map[it.key]!!.size }, { it.key }))
            .take(max).map { map[it.key]!!.form }
    }

    companion object {
        /** letters swapped, added, dropped or changed (Damerau-Levenshtein), stopping early past [limit] */
        fun distance(a: String, b: String, limit: Int = Int.MAX_VALUE): Int {
            val n = a.length; val m = b.length
            var prev2 = IntArray(m + 1); var prev = IntArray(m + 1) { it }; var cur = IntArray(m + 1)
            for (i in 1..n) {
                cur[0] = i
                var best = cur[0]
                for (j in 1..m) {
                    val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                    var v = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
                    if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) v = minOf(v, prev2[j - 2] + 1)
                    cur[j] = v
                    if (v < best) best = v
                }
                if (best > limit) return limit + 1
                val t = prev2; prev2 = prev; prev = cur; cur = t
            }
            return prev[m]
        }

        /** a rough "how it sounds" key, so fonetik finds phonetic and sircus finds circus */
        fun soundKey(word: String): String {
            var s = word.lowercase().filter { it.isLetter() }
            if (s.isEmpty()) return ""
            val rules = listOf(
                "tch" to "ch", "ph" to "f", "gh" to "", "ck" to "k", "wr" to "r", "kn" to "n", "wh" to "w", "qu" to "kw",
                "x" to "ks", "dg" to "j", "sch" to "sk", "tion" to "shun", "sion" to "shun", "ce" to "se", "ci" to "si", "cy" to "sy",
                "c" to "k", "q" to "k", "z" to "s", "y" to "i",
            )
            for ((a, b) in rules) s = s.replace(a, b)
            val first = s[0]
            val rest = s.drop(1).map { if (it in "aeiou") 'a' else it }.joinToString("")
            val sb = StringBuilder().append(if (first in "aeiou") 'a' else first)
            for (c in rest) if (c != sb.last()) sb.append(c)
            return sb.toString().trimEnd('a').ifEmpty { "a" }
        }
    }
}
