package com.steele.family

import android.app.Activity
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.steele.family.core.SpellCore
import com.steele.family.core.Syllables
import com.steele.family.core.WordList
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.Locale

private val SalBlue = Color(0xFF6366F1)
private val Tile = Color(0xFF312E81)
/** every other part of the word (sor-cer-er) gets this tile, so the parts show */
private val TileB = Color(0xFF1E40AF)

/**
 * Sal, the spelling assistant: say "spell sorcerer" (or "hey Sal, how do you spell sorcerer") and the word comes up big,
 * one letter per tile, with "did you mean" choices when the voice may have heard it wrong. It opens straight into
 * listening, so a watch button set to open it (Galaxy Watch: double press) is the hot button.
 *
 * Unlike the other family apps it needs no link to the phone: the word list is in the app. The only thing that leaves
 * the watch is the voice clip, to the watch's own voice typing (the same as any voice reply on the watch). Nothing is
 * sent anywhere else, and the recent words stay on the watch.
 */
class SpellActivity : ComponentActivity() {
    /** goes up each time the app is opened (from the app list, a watch button or "Hey Google, open Sal") */
    private val opened = mutableIntStateOf(0)
    private var voice: Voice? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        voice = Voice(this)
        lifecycleScope.launch(Dispatchers.IO) { Words.load(applicationContext) }
        setContent { MaterialTheme { SpellApp(opened.intValue, voice!!) } }
        if (savedInstanceState == null) opened.intValue++
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        opened.intValue++   // already open and the button is pressed again: listen again
    }

    override fun onDestroy() {
        voice?.close()
        super.onDestroy()
    }
}

/**
 * the word list and the patterns for splitting a word into parts, read once from the app (assets/spell/words.txt and
 * parts.txt, built by tools/spell-words.py and tools/spell-parts.py)
 */
object Words {
    val list = MutableStateFlow<WordList?>(null)
    val parts = MutableStateFlow<Syllables?>(null)
    @Synchronized fun load(ctx: Context) {
        if (list.value != null) return
        val words = ctx.assets.open("spell/words.txt").bufferedReader().useLines { WordList(it) }
        list.value = words
        parts.value = ctx.assets.open("spell/parts.txt").bufferedReader().useLines { Syllables(it, words::sizeOf) }
    }
}

/** the watch reading the word and its letters out loud, when the watch has a voice */
class Voice(ctx: Context) : TextToSpeech.OnInitListener {
    private val tts = TextToSpeech(ctx.applicationContext, this)
    var ready by mutableStateOf(false)
        private set

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) return
        try {
            if (tts.setLanguage(Locale.US) < TextToSpeech.LANG_AVAILABLE) tts.setLanguage(Locale.getDefault())
            tts.setSpeechRate(0.85f)
            ready = true
        } catch (e: Exception) { }
    }

    /** the word, a pause, each letter, a pause, the word again */
    fun spell(word: String) {
        val said = SpellCore.spoken(word)
        speak(said) { i -> if (i == 0 || i == said.size - 2) 450L else 220L }
    }

    /** the word, then each part and its letters (sor, S O R, cer, C E R...), then the word again */
    fun spellParts(word: String, parts: List<String>) {
        val said = SpellCore.spokenParts(word, parts)
        // a longer pause after the word and after each part's last letter, so the parts are easy to hear
        val partEnds = HashSet<Int>()
        var at = 0
        for (p in parts) { at += 1 + SpellCore.spoken(p.trim()).size - 2; partEnds += at }
        speak(said) { i -> if (i == 0 || i in partEnds) 550L else 220L }
    }

    private fun speak(said: List<String>, gap: (Int) -> Long) {
        if (!ready) return
        tts.stop()
        said.forEachIndexed { i, p ->
            tts.speak(p, if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "spell$i")
            if (i < said.size - 1) tts.playSilentUtterance(gap(i), TextToSpeech.QUEUE_ADD, "gap$i")
        }
    }

    fun say(text: String) { if (ready) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "one") }

    fun close() { try { tts.stop(); tts.shutdown() } catch (e: Exception) { } }
}

/** the last words asked for, kept on the watch only */
private class Recent(ctx: Context) {
    private val p = ctx.getSharedPreferences("spell", Context.MODE_PRIVATE)
    fun get(): List<String> = (p.getString("recent", "") ?: "").split('\n').filter { it.isNotBlank() }
    fun add(word: String) = p.edit().putString("recent", SpellCore.remember(get(), word).joinToString("\n")).apply()
    fun clear() = p.edit().remove("recent").apply()
}

private const val REMOTE_INPUT = "android.support.wearable.input.action.REMOTE_INPUT"
private const val REMOTE_INPUTS = "android.support.wearable.input.extra.REMOTE_INPUTS"

private fun listenIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
    .putExtra(RecognizerIntent.EXTRA_PROMPT, "Say: spell sorcerer")

/** the watch's keyboard (or handwriting) for one word */
private fun typeIntent() = Intent(REMOTE_INPUT)
    .putExtra(REMOTE_INPUTS, arrayOf(RemoteInput.Builder("word").setLabel("Type a word").build()))

@Composable
fun SpellApp(opened: Int, voice: Voice) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val recent = remember { Recent(ctx) }
    var recents by remember { mutableStateOf(recent.get()) }
    var answer by remember { mutableStateOf<SpellCore.Answer?>(null) }
    var note by remember { mutableStateOf("") }
    val canListen = remember { listenIntent().resolveActivity(ctx.packageManager) != null }
    val canType = remember { typeIntent().resolveActivity(ctx.packageManager) != null }

    fun show(heard: List<String>) {
        scope.launch {
            val list = Words.list.filterNotNull().first()
            val a = SpellCore.answer(heard, list)
            if (a == null) { note = "I didn't catch a word. Try \"spell\" and the word."; return@launch }
            answer = a; note = ""
            recent.add(a.word); recents = recent.get()
            Buzz.tick(ctx)
        }
    }

    val listen = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val heard = r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
        if (r.resultCode == Activity.RESULT_OK && !heard.isNullOrEmpty()) show(heard)
        else if (answer == null) note = "Tap the mic and say \"spell\" and the word."
    }
    val type = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val typed = r.data?.let { RemoteInput.getResultsFromIntent(it) }?.getCharSequence("word")?.toString()
        if (r.resultCode == Activity.RESULT_OK && !typed.isNullOrBlank()) show(listOf(typed))
    }
    fun startListening() {
        try { listen.launch(listenIntent()) } catch (e: Exception) { note = "Voice typing didn't open. Type the word instead." }
    }
    fun startTyping() {
        try { type.launch(typeIntent()) } catch (e: Exception) { note = "The keyboard didn't open." }
    }

    // opens straight into listening
    LaunchedEffect(opened) { if (opened > 0 && canListen) startListening() }

    val a = answer
    if (a != null) BackScreen(onBack = { answer = null }) {
        AnswerScreen(a, voice, onPick = { w -> show(listOf(w)) }, onAgain = ::startListening, canListen = canListen, onBack = { answer = null })
    } else ScalingLazyColumn(Modifier.fillMaxWidth()) {
        item { Text("Sal", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = SalBlue) }
        item { Text("Spelling Assistant Legend", fontSize = 10.sp, color = Muted) }
        item {
            Text(if (canListen) "Say: spell sorcerer" else "This watch has no voice typing. Type the word instead.",
                fontSize = 12.sp, color = Muted, textAlign = TextAlign.Center)
        }
        if (canListen) item {
            Chip(onClick = ::startListening, label = { Text("🎤  Spell a word", fontWeight = FontWeight.Bold) },
                colors = ChipDefaults.primaryChipColors(backgroundColor = SalBlue), modifier = Modifier.fillMaxWidth())
        }
        if (canType) item {
            CompactChip(onClick = ::startTyping, label = { Text("⌨  Type it") }, colors = ChipDefaults.secondaryChipColors())
        }
        if (note.isNotBlank()) item { Text(note, fontSize = 11.sp, color = Yellow, textAlign = TextAlign.Center) }
        if (recents.isNotEmpty()) {
            item { Text("Recent", fontSize = 12.sp, color = Muted, modifier = Modifier.padding(top = 6.dp)) }
            recents.forEach { w ->
                item {
                    Chip(onClick = { show(listOf(w)) }, label = { Text(w, maxLines = 1) },
                        colors = ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth())
                }
            }
            item {
                CompactChip(onClick = { recent.clear(); recents = emptyList() }, label = { Text("Clear recent") },
                    colors = ChipDefaults.secondaryChipColors())
            }
        }
    }
}

@Composable
private fun AnswerScreen(a: SpellCore.Answer, voice: Voice, onPick: (String) -> Unit, onAgain: () -> Unit, canListen: Boolean, onBack: () -> Unit) {
    val letters = SpellCore.letters(a.word)
    var lit by remember(a.word) { mutableIntStateOf(-1) }
    val splitter = Words.parts.collectAsState().value
    val pieces = remember(a.word, splitter) { splitter?.split(a.word) ?: listOf(a.word) }
    // which part each letter is in, to color every other part's tiles
    val partOf = remember(pieces) { pieces.flatMapIndexed { n, p -> List(p.length) { n } } }
    // read it out once when it comes up
    LaunchedEffect(a.word, voice.ready) { if (voice.ready) voice.spell(a.word) }
    val size = when {
        a.word.length <= 6 -> 34.sp
        a.word.length <= 9 -> 28.sp
        a.word.length <= 12 -> 22.sp
        else -> 17.sp
    }
    ScalingLazyColumn(Modifier.fillMaxWidth()) {
        item { Text(a.word, fontSize = size, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center) }
        item {
            val count = letters.count { it.isNotBlank() && it[0].isLetter() }
            Text(if (a.hint != null) "$count letters · ${a.hint}" else "$count letters", fontSize = 12.sp, color = Muted, textAlign = TextAlign.Center)
        }
        if (pieces.size > 1) item {
            Text(pieces.joinToString(" · ") { it.trim() }, fontSize = 14.sp, color = SalBlue, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        }
        // one tile per letter, five to a row; tap a tile to hear that letter
        letters.chunked(5).forEachIndexed { row, chunk ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    chunk.forEachIndexed { i, ch ->
                        val at = row * 5 + i
                        if (ch == " ") Box(Modifier.width(14.dp))
                        else Box(
                            Modifier.size(30.dp).clip(RoundedCornerShape(7.dp)).background(if (at == lit) SalBlue else if ((partOf.getOrElse(at) { 0 }) % 2 == 1) TileB else Tile)
                                .clickable { lit = at; voice.say(SpellCore.spoken(ch).let { it[1] }) },
                            contentAlignment = Alignment.Center,
                        ) { Text(ch, fontSize = 19.sp, fontWeight = FontWeight.Bold, color = Color.White) }
                    }
                }
            }
        }
        if (!a.known) item {
            Text(if (a.word[0].isUpperCase()) "Names aren't in the word list. This is how the voice wrote it."
                 else "Not in the word list. Check the choices below.",
                fontSize = 11.sp, color = Yellow, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                if (voice.ready) CompactChip(onClick = { voice.spell(a.word) }, label = { Text("🔊 Say it") }, colors = ChipDefaults.secondaryChipColors())
                if (canListen) CompactChip(onClick = onAgain, label = { Text("🎤 Next") }, colors = ChipDefaults.primaryChipColors(backgroundColor = SalBlue))
            }
        }
        // a long word, one part at a time: "sor, S O R, cer, C E R, er, E R"
        if (voice.ready && pieces.size > 1) item {
            CompactChip(onClick = { voice.spellParts(a.word, pieces) }, label = { Text("🔊 In parts") }, colors = ChipDefaults.secondaryChipColors())
        }
        if (a.others.isNotEmpty()) {
            item { Text(if (a.known) "Or did you mean" else "Did you mean", fontSize = 12.sp, color = Muted, modifier = Modifier.padding(top = 6.dp)) }
            a.others.forEach { c ->
                item {
                    val h = c.hint
                    Chip(onClick = { onPick(c.word) }, label = { Text(c.word, maxLines = 1, fontWeight = FontWeight.Bold) },
                        secondaryLabel = if (h != null) { { Text(h, maxLines = 1) } } else null,
                        colors = ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth())
                }
            }
        }
        item { BackChip(onClick = onBack) }
    }
}
