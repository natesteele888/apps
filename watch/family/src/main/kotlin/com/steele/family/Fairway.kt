package com.steele.family

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Text
import com.steele.family.core.FairwayCore
import com.steele.family.core.FairwayCore.Spot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

private val Turf = Color(0xFF1F6B47)
private val Sage = Color(0xFF8FB3A0)
private val Soft = Color(0xFFB9D3C4)

/**
 * Fairway on the watch: three screens you swipe between. Yards (to the front, middle and back of the green, from the
 * watch's own GPS, only while the screen is on), Score (+ and - for this hole, saved to the round), and Jack (tap and
 * talk, or tap a question; he answers on screen and out loud).
 *
 * The round comes from Fairway on the phone through the watch link ("fg", see FairwayCore). A score in a shared
 * tournament goes straight to the tournament from the watch, so the phone can stay in a pocket; a tournament kept on the
 * phone only takes the watch's scores the next time Fairway is open there.
 */
class FairwayActivity : FamilyActivity() {
    override val appName = "Fairway"
    override val phoneApp = "Fairway › Share › Your watch"
    @Composable override fun Screen() = FairwayApp(onChange = ::syncSoon)
}

/** what the watch keeps of its own: scores it set, scores still to send, green marks and notes it made */
object FwStore {
    private lateinit var p: SharedPreferences
    var rev by mutableIntStateOf(0)
        private set
    fun load(ctx: Context) { if (!::p.isInitialized) p = ctx.applicationContext.getSharedPreferences("fairway", Context.MODE_PRIVATE) }
    private fun obj(k: String) = try { JSONObject(p.getString(k, "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
    private fun put(k: String, o: Any) { p.edit().putString(k, o.toString()).apply(); rev++ }

    /** the watch's scores for one round: hole to strokes, 0 = cleared on the watch */
    fun scores(r: FairwayCore.Round): Map<Int, Int> {
        val o = obj("s:${r.code}:${r.pid}:${r.r}")
        return o.keys().asSequence().mapNotNull { k -> k.toIntOrNull()?.let { it to o.optInt(k) } }.toMap()
    }
    fun setScore(r: FairwayCore.Round, h: Int, s: Int?) {
        val k = "s:${r.code}:${r.pid}:${r.r}"
        put(k, obj(k).put(h.toString(), s ?: 0))
        if (r.shared) put("q", queue().put(JSONObject().put("e", r.code).put("p", r.pid).put("r", r.r).put("h", h).put("s", s ?: 0)))
    }
    /** shared-tournament scores not yet sent, oldest first */
    fun queue(): JSONArray = try { JSONArray(p.getString("q", "[]")) } catch (e: Exception) { JSONArray() }
    fun sent(n: Int) { val q = queue(); val left = JSONArray(); for (i in n until q.length()) left.put(q.get(i)); put("q", left) }

    /** green marks made on the watch, by hole: "f", "c", "b" to [lat, lon] */
    fun marks(ck: String): JSONObject = obj("g:$ck")
    fun mark(ck: String, h: Int, which: String, at: Spot) {
        val all = marks(ck); val hole = all.optJSONObject(h.toString()) ?: JSONObject()
        hole.put(which, JSONArray().put(at.lat).put(at.lon)); put("g:$ck", all.put(h.toString(), hole))
    }
    /** notes made on the watch, by hole (shown until the phone sends them back) */
    fun notes(ck: String, h: Int): List<String> = obj("n:$ck").optJSONArray(h.toString())?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()
    fun addNote(ck: String, h: Int, t: String) {
        val all = obj("n:$ck"); val a = all.optJSONArray(h.toString()) ?: JSONArray()
        a.put(t); put("n:$ck", all.put(h.toString(), a))
    }

    /** the round as the phone sent it, with the watch's own marks and notes laid on top */
    fun withMine(r: FairwayCore.Round): FairwayCore.Round {
        val g = marks(r.courseKey)
        val s = { a: JSONArray? -> if (a != null && a.length() == 2) Spot(a.optDouble(0), a.optDouble(1)) else null }
        return r.copy(holes = r.holes.map { h ->
            val m = g.optJSONObject(h.n.toString())
            val notes = (h.notes + notes(r.courseKey, h.n).filter { it !in h.notes }).take(FairwayCore.NOTES_PER_HOLE)
            if (m == null) h.copy(notes = notes)
            else h.copy(front = s(m.optJSONArray("f")) ?: h.front, mid = s(m.optJSONArray("c")) ?: h.mid, back = s(m.optJSONArray("b")) ?: h.back, notes = notes)
        })
    }

    /** sends the shared-tournament scores waiting on the watch, straight to the tournament (no phone needed) */
    suspend fun flush() = withContext(Dispatchers.IO) {
        val q = queue(); var done = 0
        try {
            for (i in 0 until q.length()) {
                val e = q.getJSONObject(i)
                val s = e.optInt("s").takeIf { it in 1..20 }
                val w = FairwayCore.scoreWrite(e.optString("e"), e.optString("p"), e.optInt("r"), e.optInt("h"), s, System.currentTimeMillis())
                if (w != null) {
                    val (code, _) = Link.firestore("PATCH", w.first, w.second)
                    // a 4xx (the tournament is gone, or the rules aren't published) won't get better by trying again
                    if (code !in 200..299 && code < 400) break
                }
                done = i + 1
            }
        } catch (e: Exception) { }
        if (done > 0) withContext(Dispatchers.Main) { sent(done) }
    }
}

/** the watch's GPS spot while [on] and the app is on screen; nothing runs otherwise */
@SuppressLint("MissingPermission")
@Composable
private fun rememberGps(on: Boolean, allowed: Boolean): Pair<Spot?, Float?> {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var here by remember { mutableStateOf<Location?>(null) }
    DisposableEffect(on, allowed, owner) {
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val l = object : LocationListener {
            override fun onLocationChanged(loc: Location) { if (here == null || loc.accuracy <= (here?.accuracy ?: 999f) + 10 || loc.time - (here?.time ?: 0) > 4000) here = loc }
            @Deprecated("old Android calls it") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        var running = false
        fun start() {
            if (running || lm == null || !on || !allowed) return
            val ps = try { lm.getProviders(true).filter { it != LocationManager.PASSIVE_PROVIDER } } catch (e: Exception) { emptyList() }
            ps.forEach { p ->
                try {
                    lm.getLastKnownLocation(p)?.takeIf { System.currentTimeMillis() - it.time < 60_000 }?.let { if (here == null) here = it }
                    lm.requestLocationUpdates(p, 2000L, 0f, l, Looper.getMainLooper())
                } catch (e: Exception) { }
            }
            running = ps.isNotEmpty()
        }
        fun stop() { if (running) { try { lm?.removeUpdates(l) } catch (e: Exception) { }; running = false } }
        val obs = LifecycleEventObserver { _, ev -> if (ev == Lifecycle.Event.ON_START) start() else if (ev == Lifecycle.Event.ON_STOP) stop() }
        owner.lifecycle.addObserver(obs)
        if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) start()
        onDispose { owner.lifecycle.removeObserver(obs); stop() }
    }
    val h = here
    return (if (h == null || !on) null else Spot(h.latitude, h.longitude)) to h?.accuracy
}

/** Jack's voice on the watch (its speaker, or earbuds paired to the watch) */
private class JackVoice(ctx: Context) {
    private var ready = false
    private val tts = TextToSpeech(ctx.applicationContext) { ready = it == TextToSpeech.SUCCESS }
    fun say(t: String) { if (ready) try { tts.language = Locale.US; tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, "jack") } catch (e: Exception) { } }
    fun close() = try { tts.shutdown() } catch (e: Exception) { }
}

@Composable
fun FairwayApp(onChange: () -> Unit) {
    val ctx = LocalContext.current
    remember { FwStore.load(ctx) }
    val st by Link.state.collectAsState()
    val rev = FwStore.rev
    val sent = remember(st.fields["fg"]) { FairwayCore.parse(st.fields["fg"]) }
    if (sent == null) {
        Box(Modifier.fillMaxSize().padding(26.dp), contentAlignment = Alignment.Center) {
            Text(if (st.checkedAt == 0L) "Getting your round from the phone…" else "Open your round in Fairway on your phone once, and it comes over.",
                fontSize = 14.sp, textAlign = TextAlign.Center)
        }
        return
    }
    val r = remember(sent, rev) { FwStore.withMine(sent) }
    val scores = remember(r, rev) { FairwayCore.merged(r, FwStore.scores(r)) }
    var hole by rememberSaveable(r.code, r.r) { mutableIntStateOf(FairwayCore.nextHole(r, scores)) }
    val h = r.hole(hole) ?: r.holes.first()
    val scope = rememberCoroutineScope()

    var allowed by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) }
    val askGps = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed = it }
    val pager = rememberPagerState { 3 }
    val (here, acc) = rememberGps(on = pager.currentPage != 1, allowed = allowed)
    val gy = FairwayCore.greenYards(h, here)

    val voice = remember { JackVoice(ctx) }
    DisposableEffect(Unit) { onDispose { voice.close() } }
    var said by rememberSaveable { mutableStateOf("") }
    fun move(d: Int) { val o = r.order; val i = o.indexOf(hole); hole = o[((i + d) % o.size + o.size) % o.size]; Buzz.tick(ctx) }
    fun ask(q: String) {
        val a = FairwayCore.jack(q, r, h, gy, scores)
        a.note?.let { n ->
            FwStore.addNote(r.courseKey, h.n, n)
            Link.add("fg", mapOf("k" to "n", "c" to r.courseKey, "h" to h.n, "t" to n)); onChange()
        }
        said = a.text; voice.say(a.text)
    }
    val listen = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val heard = res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (!heard.isNullOrBlank()) ask(heard)
    }
    val canListen = remember { Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).resolveActivity(ctx.packageManager) != null }
    fun talk() {
        Buzz.tick(ctx)
        try {
            listen.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "Ask Jack"))
        } catch (e: Exception) { said = "This watch can't listen. Tap a question below." }
    }
    fun setScore(s: Int?) {
        FwStore.setScore(r, h.n, s)
        if (!r.shared) Link.add("fg", mapOf("k" to "s", "e" to r.code, "p" to r.pid, "r" to r.r, "h" to h.n, "s" to (s ?: 0)))
        Buzz.tick(ctx); onChange()
        scope.launch { FwStore.flush() }
    }
    // anything the watch couldn't send last time goes with the next look at the link
    androidx.compose.runtime.LaunchedEffect(st.checkedAt) { if (FwStore.queue().length() > 0) FwStore.flush() }

    Box(Modifier.fillMaxSize()) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize(), beyondViewportPageCount = 0) { page ->
            when (page) {
                0 -> YardsPage(r, h, gy, here, acc, allowed, onAsk = { askGps.launch(Manifest.permission.ACCESS_FINE_LOCATION) }, onMove = ::move,
                    onMark = { which -> here?.let { at ->
                        FwStore.mark(r.courseKey, h.n, which, at)
                        Link.add("fg", mapOf("k" to "g", "c" to r.courseKey, "h" to h.n, "m" to which, "lat" to at.lat, "lon" to at.lon, "acc" to (acc ?: 0f).toInt()))
                        Buzz.go(ctx); onChange()
                    } })
                1 -> ScorePage(r, h, scores, onMove = ::move, onSet = ::setScore)
                else -> JackPage(said, canListen, onTalk = ::talk, onAsk = ::ask)
            }
        }
        Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            repeat(3) { i -> Box(Modifier.size(5.dp).background(if (pager.currentPage == i) Color.White else Muted.copy(alpha = 0.5f), CircleShape)) }
        }
    }
}

@Composable
private fun HoleBar(h: FairwayCore.Hole, onMove: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("‹", fontSize = 22.sp, color = Sage, modifier = Modifier.clickable { onMove(-1) }.padding(horizontal = 8.dp))
        Text("HOLE ${h.n} · PAR ${h.par}", fontSize = 12.sp, color = Sage, letterSpacing = 1.sp)
        Text("›", fontSize = 22.sp, color = Sage, modifier = Modifier.clickable { onMove(1) }.padding(horizontal = 8.dp))
    }
}

@Composable
private fun YardsPage(r: FairwayCore.Round, h: FairwayCore.Hole, gy: FairwayCore.GreenYards?, here: Spot?, acc: Float?, allowed: Boolean,
                      onAsk: () -> Unit, onMove: (Int) -> Unit, onMark: (String) -> Unit) {
    var marking by rememberSaveable(h.n) { mutableStateOf(false) }
    if (marking) {
        BackScreen(onBack = { marking = false }) {
            Column(Modifier.fillMaxSize().padding(horizontal = 30.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Standing on it? Mark the green", fontSize = 13.sp, textAlign = TextAlign.Center, fontWeight = FontWeight.Bold)
                val good = here != null && (acc ?: 999f) <= 25f
                Text(if (here == null) "Finding you…" else if (!good) "GPS is rough (±${((acc ?: 0f) * 1.09f).toInt()} yds). Give it a few seconds." else "Saved for this course, on the watch and your phone.",
                    fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(vertical = 4.dp))
                listOf("f" to "Front", "c" to "Middle", "b" to "Back").forEach { (k, n) ->
                    CompactChip(onClick = { if (good) onMark(k) }, enabled = good, label = { Text(n) }, modifier = Modifier.padding(2.dp),
                        colors = ChipDefaults.primaryChipColors(backgroundColor = Turf))
                }
            }
        }
        return
    }
    val club = FairwayCore.club(r.bag, gy?.mid)
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        HoleBar(h, onMove)
        when {
            !allowed -> {
                Text(if (h.yards > 0) "${h.yards}" else "–", fontSize = 48.sp, fontWeight = FontWeight.ExtraBold)
                Text("from your tees", fontSize = 11.sp, color = Soft)
                CompactChip(onClick = onAsk, label = { Text("Use GPS for yards") }, colors = ChipDefaults.primaryChipColors(backgroundColor = Turf), modifier = Modifier.padding(top = 6.dp))
            }
            gy != null -> {
                Text("${gy.mid ?: "–"}", fontSize = 54.sp, fontWeight = FontWeight.ExtraBold)
                Row(horizontalArrangement = Arrangement.spacedBy(26.dp)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("FRONT", fontSize = 9.sp, color = Sage); Text("${gy.front ?: "–"}", fontSize = 18.sp, fontWeight = FontWeight.Bold) }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("BACK", fontSize = 9.sp, color = Sage); Text("${gy.back ?: "–"}", fontSize = 18.sp, fontWeight = FontWeight.Bold) }
                }
                if (club.isNotBlank()) Text(club, fontSize = 12.sp, color = Soft, textAlign = TextAlign.Center, maxLines = 2)
                if ((acc ?: 0f) > 15f) Text("GPS ±${((acc ?: 0f) * 1.09f).toInt()} yds", fontSize = 10.sp, color = Yellow)
            }
            else -> {
                Text(if (h.yards > 0) "${h.yards}" else "–", fontSize = 48.sp, fontWeight = FontWeight.ExtraBold)
                Text(if (here == null) "from your tees · finding you…" else "from your tees", fontSize = 11.sp, color = Soft, textAlign = TextAlign.Center)
                Text("No green marked on this hole yet", fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center)
            }
        }
        if (allowed) Text("Mark the green", fontSize = 11.sp, color = Sage, modifier = Modifier.clickable { marking = true }.padding(6.dp))
    }
}

@Composable
private fun ScorePage(r: FairwayCore.Round, h: FairwayCore.Hole, scores: Map<Int, Int>, onMove: (Int) -> Unit, onSet: (Int?) -> Unit) {
    val v = scores[h.n]
    val sum = FairwayCore.summary(r, scores)
    Column(Modifier.fillMaxSize().padding(horizontal = 22.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        HoleBar(h, onMove)
        Row(verticalAlignment = Alignment.CenterVertically) {
            RoundKey("−") { onSet(if (v == null) h.par - 1 else maxOf(1, v - 1)) }
            Text(v?.toString() ?: "Par?", fontSize = if (v == null) 26.sp else 46.sp, fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 10.dp).clickable { if (v == null) onSet(h.par) })
            RoundKey("+") { onSet(if (v == null) h.par + 1 else minOf(20, v + 1)) }
        }
        Text(if (v == null) "Tap Par? for a par" else FairwayCore.scoreName(v, h.par), fontSize = 12.sp, color = if (v != null && v < h.par) Red else Soft)
        Text(if (sum.thru == 0) "No scores yet" else "${FairwayCore.toParText(sum.toPar)} thru ${sum.thru}", fontSize = 15.sp, fontWeight = FontWeight.Bold,
            color = when { sum.toPar < 0 -> Red; sum.toPar > 0 -> Green; else -> Color.White }, modifier = Modifier.padding(top = 4.dp))
        if (v != null) Text("Next hole ›", fontSize = 12.sp, color = Sage, modifier = Modifier.clickable { onMove(1) }.padding(6.dp))
        if (!r.shared) Text("Goes to your phone next time Fairway is open", fontSize = 9.sp, color = Muted, textAlign = TextAlign.Center)
    }
}

@Composable
private fun RoundKey(label: String, onClick: () -> Unit) {
    Box(Modifier.size(42.dp).background(Color(0xFF213A2E), CircleShape).clickable { onClick() }, contentAlignment = Alignment.Center) {
        Text(label, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun JackPage(said: String, canListen: Boolean, onTalk: () -> Unit, onAsk: (String) -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 26.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        if (canListen) Chip(onClick = onTalk, label = { Text("Talk to Jack", fontWeight = FontWeight.Bold) },
            colors = ChipDefaults.primaryChipColors(backgroundColor = Turf), modifier = Modifier.fillMaxWidth())
        Text(said.ifBlank { if (canListen) "Tap, then ask: how far, what club, how am I doing, any notes, or \"remember…\"" else "Tap a question" },
            fontSize = if (said.isBlank()) 11.sp else 13.sp, color = if (said.isBlank()) Muted else Color.White, textAlign = TextAlign.Center,
            maxLines = 4, modifier = Modifier.padding(vertical = 6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            CompactChip(onClick = { onAsk("how far") }, label = { Text("Yards") })
            CompactChip(onClick = { onAsk("what club") }, label = { Text("Club") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 2.dp)) {
            CompactChip(onClick = { onAsk("how am I doing") }, label = { Text("Score") })
            CompactChip(onClick = { onAsk("notes") }, label = { Text("Notes") })
        }
    }
}
