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
 * Press and hold anywhere on the face: a green ring fills around the edge, and the song starts when it closes.
 * While it plays, the screen turns blue with a big Stop, and swiping is off. Swipe up for the batting order.
 */
@Composable
fun BattingScreen(onOrder: () -> Unit) {
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
        }
        return
    }
    if (st.busy) { PlayingScreen(st); return }
    // a new pager when the order gets longer or shorter, so the pages still line up with the batters
    key(st.lineup.size) { BatterPager(st, line, color, onOrder) }
}

/** how many times round the order the pager can go each way before it runs out (far more than any game) */
private const val LAPS = 2000

/** how long to hold before the song starts */
private const val HOLD_MS = 1000

@Composable
private fun BatterPager(st: BatState, line: String, color: Color, onOrder: () -> Unit) {
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
    val canPlay = b != null && b.ready && pager.currentPage == pager.settledPage
    val playable by rememberUpdatedState(canPlay)
    val batter by rememberUpdatedState(b)

    Box(
        Modifier.fillMaxSize()
            .onRotaryScrollEvent { e ->
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
                detectVerticalDragGestures(onDragEnd = { if (drag.floatValue < -50f) onOrder(); drag.floatValue = 0f }, onDragCancel = { drag.floatValue = 0f }) { _, dy -> drag.floatValue += dy }
            }
            // The whole face is the Play button. Letting go early, or starting a swipe, does nothing, so a brush can't start a song.
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    if (!playable) return@detectTapGestures
                    val job = scope.launch {
                        ring.snapTo(0f)
                        ring.animateTo(1f, tween(HOLD_MS, easing = LinearEasing))
                        val p = batter
                        if (p != null && playable) { Buzz.started(ctx); PhoneLink.send(Proto.cmd("play", "id" to p.id)) }
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
        Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (b != null && !b.ready) "No song to play" else "Hold to play", color = Muted, fontSize = 11.sp)
            Text("︿ Lineup", color = Muted, fontSize = 11.sp)
        }
        EdgeRing(ring.value)
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

/** While a song plays: unmistakable, with one big Stop. */
@Composable
private fun PlayingScreen(st: BatState) {
    val ctx = LocalContext.current
    val t = now(250)
    val pulse by rememberInfiniteTransition(label = "playing").animateFloat(0.75f, 1f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "pulse")
    val p = st.playing
    LaunchedEffect(p?.id) { if (p != null) Buzz.started(ctx) }
    Box(Modifier.fillMaxSize().background(Color(0xFF1D4ED8).copy(alpha = pulse)), contentAlignment = Alignment.Center) {
        if (p != null && p.total > 0) {
            val el = (p.elapsed + (t - st.receivedAt) / 1000.0).coerceIn(0.0, p.total)
            CircularProgressIndicator(progress = (el / p.total).toFloat(), modifier = Modifier.fillMaxSize().padding(3.dp), indicatorColor = Color.White, trackColor = Color(0x44FFFFFF), strokeWidth = 6.dp)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (p != null) "PLAYING" else "STARTING", fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White)
            Text(p?.label ?: "", fontSize = 14.sp, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 30.dp))
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier.size(92.dp).clip(CircleShape).background(Red).clickable { Buzz.tick(ctx); PhoneLink.send(Proto.cmd("stop")) },
                contentAlignment = Alignment.Center,
            ) { Text("STOP", fontSize = 22.sp, fontWeight = FontWeight.Black, color = Color.White) }
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
                if (busy) "A song is playing. Stop it to change batters." else "Hold a batter to swap in a bench player.",
                color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp, start = 12.dp, end = 12.dp),
            )
        }
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
        item { ListHeader { Text("Swap in for $spot. ${label(out)}", textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis) } }
        if (bench.isEmpty()) item {
            Text("Nobody is on the bench. Add players to the team in Walk-Up on your phone.", color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 12.dp))
        }
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
