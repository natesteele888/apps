package com.steele.dugout.wear

import androidx.wear.compose.foundation.lazy.items
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.Offset
import androidx.compose.runtime.key
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Canvas
import android.graphics.BitmapFactory
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.activity.compose.BackHandler
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.Text
import com.steele.dugout.shared.BatState
import com.steele.dugout.shared.Batter
import com.steele.dugout.shared.Proto
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * Batting: one screen per batter. Swipe left and right (or turn the bezel) to move; it never starts or stops music.
 * The order goes round: after the last batter comes the leadoff batter again.
 * Press and hold anywhere on the face: a green ring fills around the edge. When it closes, a short countdown (set on the
 * phone, 2 seconds unless changed) gives a moment to change your mind: a tap anywhere cancels before any sound plays.
 * While it plays, the screen turns blue with a big Stop, and swiping is off. Swipe up for the batting order, down for game sounds.
 */
@Composable
fun BattingScreen(onOrder: () -> Unit, onSounds: () -> Unit = {}) {
    val st = PhoneLink.state.collectAsState().value
    val (line, color) = linkLine()
    val t = now()
    if (st == null || !st.ready || st.lineup.isEmpty() || !PhoneLink.phoneOk(t)) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Walk-Up", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(
                if (st != null && st.ready && PhoneLink.phoneOk(t)) "Set up the batting order in Walk-Up on your phone." else line,
                color = if (st != null && st.ready) Muted else color, textAlign = TextAlign.Center, fontSize = 14.sp,
            )
            // game sounds still work before there's a batting order (the anthem comes first)
            if (st != null && st.ready && st.board.isNotEmpty() && PhoneLink.phoneOk(t)) {
                Spacer(Modifier.height(8.dp))
                Chip(onClick = onSounds, label = { Text("Game sounds", maxLines = 1) }, colors = ChipDefaults.secondaryChipColors())
            }
        }
        return
    }
    if (st.busy) { PlayingScreen(st); return }
    // a new pager when the order gets longer or shorter, so the pages still line up with the batters
    key(st.lineup.size) { BatterPager(st, line, color, onOrder, onSounds) }
}

/** how many times round the order the pager can go each way before it runs out (far more than any game) */
private const val LAPS = 2000

/** how long to hold before the song starts */
private const val HOLD_MS = 1000

@Composable
private fun BatterPager(st: BatState, line: String, color: Color, onOrder: () -> Unit, onSounds: () -> Unit) {
    val ctx = LocalContext.current
    val lineup = st.lineup
    val n = lineup.size
    // The pager has many laps of the same order, and starts in the middle, so swiping past the last batter
    // lands on the first one (and back past the first lands on the last).
    val pages = if (n > 1) n * LAPS else 1
    val pager = rememberPagerState(initialPage = if (n > 1) n * (LAPS / 2) + st.batter.coerceIn(0, n - 1) else 0) { pages }
    fun idx(page: Int) = Proto.wrap(page, n)
    val cur by rememberUpdatedState(st)
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    val rotary = remember { mutableFloatStateOf(0f) }
    val drag = remember { mutableFloatStateOf(0f) }
    val ring = remember { Animatable(0f) }
    // the countdown after the ring closes: seconds left, or null when there's none
    var countdown by remember { mutableStateOf<Int?>(null) }
    var countJob by remember { mutableStateOf<Job?>(null) }
    fun cancelCountdown() { countJob?.cancel(); countJob = null; if (countdown != null) { countdown = null; Buzz.tick(ctx) } }
    fun startSong(p: Batter) {
        val wait = cur.delay
        if (wait <= 0) { Buzz.started(ctx); PhoneLink.send(Proto.cmd("play", "id" to p.id)); return }
        Buzz.tick(ctx)
        countJob = scope.launch {
            for (left in wait downTo 1) { countdown = left; delay(1000) }
            countdown = null
            countJob = null
            // still the same batter, still nothing playing: go
            if (!cur.busy && cur.lineup.any { it.id == p.id }) { Buzz.started(ctx); PhoneLink.send(Proto.cmd("play", "id" to p.id)) }
        }
    }
    BackHandler(enabled = countdown != null) { cancelCountdown() }

    // the phone moved to another batter (a tap on the phone, or a pick from the lineup): go the short way round
    LaunchedEffect(st.batter, n) {
        val here = idx(pager.currentPage)
        if (st.batter in lineup.indices && here != st.batter && !pager.isScrollInProgress) {
            var d = Proto.wrap(st.batter - here, n)
            if (d > n / 2) d -= n
            pager.animateScrollToPage((pager.currentPage + d).coerceIn(0, pages - 1))
        }
    }
    // the watch moved: tell the phone who is up (never while a song plays; the phone ignores it then too)
    LaunchedEffect(pager.settledPage) {
        val p = idx(pager.settledPage)
        if (!cur.busy && p != cur.batter && p in cur.lineup.indices) PhoneLink.send(Proto.cmd("select", "index" to p))
    }
    LaunchedEffect(Unit) { focus.requestFocus() }

    val b = lineup.getOrNull(idx(pager.currentPage))
    val canPlay = b != null && b.ready && pager.currentPage == pager.settledPage && countdown == null
    val playable by rememberUpdatedState(canPlay)
    val batter by rememberUpdatedState(b)

    Box(
        Modifier.fillMaxSize()
            .onRotaryScrollEvent { e ->
                if (countdown != null) return@onRotaryScrollEvent true
                rotary.floatValue += e.verticalScrollPixels
                if (abs(rotary.floatValue) > 60f) {
                    val to = (pager.currentPage + if (rotary.floatValue > 0) 1 else -1).coerceIn(0, pages - 1)
                    rotary.floatValue = 0f
                    scope.launch { pager.animateScrollToPage(to) }
                }
                true
            }
            .focusRequester(focus).focusable()
            .pointerInput(Unit) {
                detectVerticalDragGestures(onDragEnd = { if (countdown == null) { if (drag.floatValue < -50f) onOrder() else if (drag.floatValue > 50f) onSounds() }; drag.floatValue = 0f }, onDragCancel = { drag.floatValue = 0f }) { _, dy -> drag.floatValue += dy }
            }
            // The whole face is the Play button. Letting go early, or starting a swipe, does nothing, so a brush can't start a song.
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    if (!playable) return@detectTapGestures
                    val job = scope.launch {
                        ring.snapTo(0f)
                        ring.animateTo(1f, tween(HOLD_MS, easing = LinearEasing))
                        val p = batter
                        if (p != null && playable) startSong(p)
                    }
                    tryAwaitRelease()
                    job.cancel()
                    scope.launch { ring.snapTo(0f) }
                })
            },
    ) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize(), beyondViewportPageCount = 0) { page -> val i = idx(page); BatterPage(lineup[i], i, n) }
        Text(
            line, color = color, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 14.dp, start = 40.dp, end = 40.dp),
        )
        if (st.board.isNotEmpty()) Text("﹀ Sounds", color = Muted, fontSize = 11.sp, modifier = Modifier.align(Alignment.TopCenter).padding(top = 30.dp))
        Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (b != null && !b.ready) "No song to play" else "Hold to play", color = Muted, fontSize = 11.sp)
            Text("︿ Lineup", color = Muted, fontSize = 11.sp)
        }
        EdgeRing(ring.value)
        countdown?.let { left -> CountdownScreen(left, batter?.let { label(it) } ?: "", onCancel = { cancelCountdown() }) }
    }
}

/**
 * The moment between the ring closing and the song starting. The whole face is the cancel button. The finger that held
 * the ring is still down when this shows; letting it go does nothing, only a new tap cancels.
 */
@Composable
internal fun CountdownScreen(left: Int, who: String, onCancel: () -> Unit) {
    val stop by rememberUpdatedState(onCancel)
    Box(
        Modifier.fillMaxSize().background(Color(0xF2111827)).pointerInput(Unit) { detectTapGestures(onPress = { stop() }) },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("STARTING IN", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Muted)
            Text("$left", fontSize = 64.sp, fontWeight = FontWeight.Black, color = Color.White, lineHeight = 66.sp)
            if (who.isNotBlank()) Text(who, fontSize = 14.sp, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 30.dp))
            Spacer(Modifier.height(8.dp))
            Box(Modifier.clip(RoundedCornerShape(20.dp)).background(Red).padding(horizontal = 22.dp, vertical = 8.dp)) {
                Text("TAP TO CANCEL", fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
        }
    }
}

/** the green ring around the edge of the face that fills while Play is held, with a soft glow */
@Composable
private fun EdgeRing(progress: Float) {
    if (progress <= 0f) return
    Canvas(Modifier.fillMaxSize()) {
        val w = 7.dp.toPx()
        val glow = 18.dp.toPx()
        val inset = glow / 2
        val tl = Offset(inset, inset)
        val sz = Size(size.width - glow, size.height - glow)
        drawArc(Green.copy(alpha = 0.18f), 0f, 360f, false, tl, sz, style = Stroke(w))
        drawArc(Green.copy(alpha = 0.35f * progress + 0.1f), -90f, 360f * progress, false, tl, sz, style = Stroke(glow, cap = StrokeCap.Round))
        drawArc(Green, -90f, 360f * progress, false, tl, sz, style = Stroke(w, cap = StrokeCap.Round))
    }
}

/** a name as big as fits: short names get the biggest letters */
private fun nameSize(name: String) = when {
    name.length <= 9 -> 34.sp
    name.length <= 14 -> 30.sp
    name.length <= 20 -> 26.sp
    else -> 22.sp
}

@Composable
private fun BatterPage(b: Batter, i: Int, n: Int) {
    val ctx = LocalContext.current
    val ver = PhoneLink.photos.collectAsState().value
    val photo = remember(b.id, ver) {
        val f = PhoneLink.photoFile(ctx, b.id)
        if (f.exists()) try { BitmapFactory.decodeFile(f.path)?.asImageBitmap() } catch (e: Exception) { null } else null
    }
    val name = b.name.ifBlank { "Batter ${i + 1}" }
    val size = nameSize(name)
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (photo != null) {
            Image(photo, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().alpha(0.55f))
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x66000000), Color(0xCC000000)))))
        }
        Column(Modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            if (b.num.isNotEmpty()) Text("#" + b.num, fontSize = 44.sp, fontWeight = FontWeight.Black, color = Color.White, lineHeight = 46.sp)
            Text(name, fontSize = size, lineHeight = size * 1.08f, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis, color = Color.White)
            Spacer(Modifier.height(2.dp))
            Text(listOf(b.pos, "${i + 1} of $n").filter { it.isNotBlank() }.joinToString(" · "), fontSize = 13.sp, color = Muted)
            if (!b.ready) Text(if (b.code == "needs-voice") "Needs the announcer" else "No song yet", fontSize = 13.sp, color = Yellow)
        }
    }
}

/**
 * While a song plays: unmistakable, with one big Stop. A tap on Stop cuts the song. When the song has more after its clip,
 * press and hold anywhere (Stop too) to keep it playing: a buzz, the ring turns gold, and it runs on until Stop, or fades
 * out by itself when the extra time is up.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun PlayingScreen(st: BatState) {
    val ctx = LocalContext.current
    val t = now(250)
    val pulse by rememberInfiniteTransition(label = "playing").animateFloat(0.75f, 1f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "pulse")
    val p = st.playing
    LaunchedEffect(p?.id, p?.board) { if (p != null) Buzz.started(ctx) }
    val next = st.queue.firstOrNull()
    val canKeep = p != null && p.ext > 0 && !p.extended
    val keep by rememberUpdatedState(canKeep)
    fun keepPlaying() { if (keep) { Buzz.pattern(ctx, 60, 80, 60); PhoneLink.send(Proto.cmd("extend")) } }
    fun stop() { Buzz.tick(ctx); PhoneLink.send(Proto.cmd("stop", "now" to true)) }
    val kept = p?.extended == true
    Box(
        Modifier.fillMaxSize().background((if (kept) Color(0xFF1E3A8A) else Color(0xFF1D4ED8)).copy(alpha = pulse))
            .pointerInput(Unit) { detectTapGestures(onLongPress = { keepPlaying() }) },
        contentAlignment = Alignment.Center,
    ) {
        if (p != null && p.total > 0) {
            val el = (p.elapsed + (t - st.receivedAt) / 1000.0).coerceIn(0.0, p.total)
            CircularProgressIndicator(
                progress = (el / p.total).toFloat(), modifier = Modifier.fillMaxSize().padding(3.dp),
                indicatorColor = if (kept) Yellow else Color.White, trackColor = Color(0x44FFFFFF), strokeWidth = 6.dp,
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (p == null) "STARTING" else if (kept) "KEEP PLAYING" else "PLAYING", fontSize = 14.sp, fontWeight = FontWeight.Black, color = if (kept) Yellow else Color.White)
            Text(p?.label ?: "", fontSize = 14.sp, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 30.dp))
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier.size(92.dp).clip(CircleShape).background(Red).combinedClickable(onClick = { stop() }, onLongClick = { keepPlaying() }),
                contentAlignment = Alignment.Center,
            ) { Text("STOP", fontSize = 22.sp, fontWeight = FontWeight.Black, color = Color.White) }
            Spacer(Modifier.height(4.dp))
            if (next != null && !canKeep && !kept) {
                // a game sound waits in Up next: one tap ends this one and plays it now (Stop ends both)
                Box(
                    Modifier.clip(RoundedCornerShape(16.dp)).background(Color(0x33FFFFFF))
                        .clickable { Buzz.tick(ctx); PhoneLink.send(Proto.cmd("upnext")) }.padding(horizontal = 12.dp, vertical = 4.dp),
                ) { Text("Next: ${next.label} ›", fontSize = 12.sp, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            } else Text(
                when { kept -> "Tap Stop to end"; canKeep -> "Hold to keep playing"; else -> "" },
                fontSize = 11.sp, color = Color(0xCCFFFFFF),
            )
        }
    }
}

/** The batting order: tap a batter to jump to them; press and hold one to swap in a bench player. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OrderScreen(onDone: () -> Unit, onSwap: (String) -> Unit) {
    val ctx = LocalContext.current
    val st = PhoneLink.state.collectAsState().value
    val lineup = st?.lineup ?: emptyList()
    val busy = st?.busy == true
    val list = rememberScalingLazyListState(initialCenterItemIndex = (st?.batter ?: 0) + 1)
    ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text("Batting order") } }
        itemsIndexed(lineup, key = { _, b -> b.id }) { i, b ->
            val up = st != null && i == st.batter
            PlayerRow(
                title = "${i + 1}. " + label(b),
                sub = when { up -> "Up now"; !b.ready -> "No song yet"; else -> null },
                subColor = if (!up && !b.ready) Yellow else Color.White.copy(alpha = 0.8f),
                bg = if (up) Green else Color(0xFF1E293B),
                onClick = { if (!busy && st != null && i != st.batter) PhoneLink.send(Proto.cmd("select", "index" to i)); onDone() },
                onLongClick = if (busy) null else ({ Buzz.tick(ctx); onSwap(b.id) }),
            )
        }
        item {
            Text(
                when {
                    lineup.isEmpty() -> "No batting order yet. Set it up in Walk-Up on your phone."
                    busy -> "A song is playing. Stop it to change batters."
                    else -> "Hold a batter to swap in a bench player."
                },
                color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp, start = 12.dp, end = 12.dp),
            )
        }
        item { BackChip("Back to batter", onClick = onDone) }
    }
}

/** Pick a bench player to take [outId]'s spot in the batting order. The one coming out goes to the bench. */
@Composable
fun BenchScreen(outId: String, onDone: () -> Unit) {
    val ctx = LocalContext.current
    val st = PhoneLink.state.collectAsState().value
    val out = st?.lineup?.firstOrNull { it.id == outId }
    val bench = st?.bench ?: emptyList()
    // the player left the order (a swap went through, or the phone changed it): back to the order
    LaunchedEffect(out == null) { if (out == null) onDone() }
    if (st == null || out == null) return
    val spot = st.lineup.indexOf(out) + 1
    val list = rememberScalingLazyListState(initialCenterItemIndex = 1)
    ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
        if (bench.isEmpty()) {
            // nobody to swap in: say so plainly, and the only thing to do is go back
            item { ListHeader { Text("No one on the bench", textAlign = TextAlign.Center) } }
            item {
                Text(
                    "Everyone on the team is already batting. Add players in Walk-Up on your phone to swap them in here.",
                    color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
            item { BackChip("Back to the order", onClick = onDone) }
            return@ScalingLazyColumn
        }
        item { ListHeader { Text("Swap in for $spot. ${label(out)}", textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis) } }
        items(bench, key = { it.id }) { b ->
            PlayerRow(
                title = label(b),
                sub = if (!b.ready) "No song yet" else b.pos.ifBlank { null },
                subColor = if (!b.ready) Yellow else Muted,
                bg = Color(0xFF1E293B),
                onClick = { if (!st.busy) { Buzz.tick(ctx); PhoneLink.send(Proto.swap(outId, b.id)); onDone() } },
                onLongClick = null,
            )
        }
        if (st.busy) item { Text("A song is playing. Stop it to swap.", color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center) }
        item { BackChip("Cancel", onClick = onDone) }
    }
}

private fun label(b: Batter) = (if (b.num.isNotEmpty()) "#${b.num} " else "") + b.name.ifBlank { "Player" }

/** one row in a list: a tap, and (where there's something to do) a press and hold */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PlayerRow(title: String, sub: String?, subColor: Color, bg: Color, onClick: () -> Unit, onLongClick: (() -> Unit)?) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(bg)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(title, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (sub != null) Text(sub, color = subColor, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
