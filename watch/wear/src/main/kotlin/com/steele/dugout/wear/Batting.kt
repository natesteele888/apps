package com.steele.dugout.wear

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
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
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
 * Press and hold Play until the ring fills to start the song. While it plays, the screen turns blue with a big Stop,
 * and swiping is off. Swipe up for the batting order.
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
    BatterPager(st, line, color, onOrder)
}

@Composable
private fun BatterPager(st: BatState, line: String, color: Color, onOrder: () -> Unit) {
    val ctx = LocalContext.current
    val lineup = st.lineup
    val pager = rememberPagerState(initialPage = st.batter.coerceIn(0, lineup.size - 1)) { lineup.size }
    val cur by rememberUpdatedState(st)
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    var rotary = remember { mutableFloatStateOf(0f) }
    var drag = remember { mutableFloatStateOf(0f) }

    // the phone moved to another batter (a tap on the phone, or the next batter after a song)
    LaunchedEffect(st.batter, lineup.size) {
        if (st.batter in lineup.indices && pager.currentPage != st.batter && !pager.isScrollInProgress) pager.animateScrollToPage(st.batter)
    }
    // the watch moved: tell the phone who is up (never while a song plays; the phone ignores it then too)
    LaunchedEffect(pager.settledPage) {
        val p = pager.settledPage
        if (!cur.busy && p != cur.batter && p in cur.lineup.indices) PhoneLink.send(Proto.cmd("select", "index" to p))
    }
    LaunchedEffect(Unit) { focus.requestFocus() }

    Box(
        Modifier.fillMaxSize()
            .onRotaryScrollEvent { e ->
                rotary.floatValue += e.verticalScrollPixels
                if (abs(rotary.floatValue) > 60f) {
                    val to = (pager.currentPage + if (rotary.floatValue > 0) 1 else -1).coerceIn(0, lineup.size - 1)
                    rotary.floatValue = 0f
                    scope.launch { pager.animateScrollToPage(to) }
                }
                true
            }
            .focusRequester(focus).focusable()
            .pointerInput(Unit) {
                detectVerticalDragGestures(onDragEnd = { if (drag.floatValue < -50f) onOrder(); drag.floatValue = 0f }, onDragCancel = { drag.floatValue = 0f }) { _, dy -> drag.floatValue += dy }
            },
    ) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { i -> BatterPage(lineup[i], i, lineup.size) }
        Column(Modifier.align(Alignment.TopCenter).padding(top = 14.dp).clickable { onOrder() }, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(line, color = color, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 40.dp))
            Text("≡ Order", color = Muted, fontSize = 11.sp)
        }
        val b = lineup.getOrNull(pager.currentPage)
        val canPlay = b != null && b.ready && pager.currentPage == pager.settledPage
        HoldToPlay(
            enabled = canPlay,
            label = if (b != null && !b.ready) "No song" else "Hold\nto play",
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp),
        ) {
            if (b != null) { Buzz.started(ctx); PhoneLink.send(Proto.cmd("play", "id" to b.id)) }
        }
    }
}

@Composable
private fun BatterPage(b: Batter, i: Int, n: Int) {
    val ctx = LocalContext.current
    val ver = PhoneLink.photos.collectAsState().value
    val photo = remember(b.id, ver) {
        val f = PhoneLink.photoFile(ctx, b.id)
        if (f.exists()) try { BitmapFactory.decodeFile(f.path)?.asImageBitmap() } catch (e: Exception) { null } else null
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (photo != null) {
            Image(photo, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().alpha(0.55f))
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x66000000), Color(0xCC000000)))))
        }
        Column(Modifier.fillMaxSize().padding(horizontal = 22.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(4.dp))
            if (b.num.isNotEmpty()) Text("#" + b.num, fontSize = 50.sp, fontWeight = FontWeight.Black, color = Color.White)
            Text(b.name.ifBlank { "Batter ${i + 1}" }, fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis, color = Color.White)
            Text(listOf(b.pos, "${i + 1} of $n").filter { it.isNotBlank() }.joinToString(" · "), fontSize = 12.sp, color = Muted)
            if (!b.ready) Text(if (b.code == "needs-voice") "Needs the announcer" else "No song yet", fontSize = 12.sp, color = Yellow)
            Spacer(Modifier.height(58.dp))
        }
    }
}

/** Press and hold until the ring fills (about a second). Letting go early does nothing, so a brush can't start a song. */
@Composable
fun HoldToPlay(enabled: Boolean, label: String, modifier: Modifier = Modifier, onPlay: () -> Unit) {
    val ring = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val play by rememberUpdatedState(onPlay)
    val on by rememberUpdatedState(enabled)
    Box(
        modifier.size(64.dp).clip(CircleShape).background(if (enabled) Green else Color(0xFF334155))
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    if (!on) return@detectTapGestures
                    val job = scope.launch {
                        ring.snapTo(0f)
                        ring.animateTo(1f, tween(900, easing = LinearEasing))
                        play()
                    }
                    tryAwaitRelease()
                    job.cancel()
                    scope.launch { ring.snapTo(0f) }
                })
            },
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(progress = ring.value, modifier = Modifier.fillMaxSize(), indicatorColor = Color.White, trackColor = Color.Transparent, strokeWidth = 5.dp)
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, color = Color.White, lineHeight = 12.sp)
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

/** The batting order, to jump to the right batter. */
@Composable
fun OrderScreen(onDone: () -> Unit) {
    val st = PhoneLink.state.collectAsState().value
    val lineup = st?.lineup ?: emptyList()
    val busy = st?.busy == true
    val list = rememberScalingLazyListState(initialCenterItemIndex = (st?.batter ?: 0) + 1)
    ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text("Batting order") } }
        itemsIndexed(lineup) { i, b ->
            Chip(
                onClick = { if (!busy && st != null && i != st.batter) PhoneLink.send(Proto.cmd("select", "index" to i)); onDone() },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("${i + 1}. " + (if (b.num.isNotEmpty()) "#${b.num} " else "") + b.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = when {
                    st != null && i == st.batter -> { { Text("Up now") } }
                    !b.ready -> { { Text("No song yet", color = Yellow) } }
                    else -> null
                },
                colors = if (st != null && i == st.batter) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(),
            )
        }
        if (busy) item { Text("A song is playing. Stop it to change batters.", color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center) }
    }
}
