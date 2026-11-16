package com.steele.dugout.wear

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.Text
import com.steele.dugout.shared.Proto
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Game sounds (swipe down on the batter): the anthem, music between innings, the coach's own clips, set up in Walk-Up on the phone.
 * Tap one to play it, after the same short countdown as a walk-up (a tap cancels). Press and hold one to put it in Up next, which
 * plays by itself when the sound before it ends. Tap a sound in Up next to take it out. While one plays, the screen is the same
 * blue Stop screen as a walk-up; Stop ends everything, Up next too.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SoundsScreen(onDone: () -> Unit) {
    val ctx = LocalContext.current
    val st = PhoneLink.state.collectAsState().value
    val cur by rememberUpdatedState(st)
    val scope = rememberCoroutineScope()
    var countdown by remember { mutableStateOf<Int?>(null) }
    var who by remember { mutableStateOf("") }
    var countJob by remember { mutableStateOf<Job?>(null) }
    fun cancelCountdown() { countJob?.cancel(); countJob = null; if (countdown != null) { countdown = null; Buzz.tick(ctx) } }
    /** [cmd] is "sound" (with the button's id) or "upnext" */
    fun start(label: String, cmd: String, id: String?) {
        val send = { Buzz.started(ctx); PhoneLink.send(if (id != null) Proto.cmd(cmd, "id" to id) else Proto.cmd(cmd)) }
        val wait = cur?.delay ?: Proto.DEFAULT_DELAY
        if (wait <= 0) { send(); return }
        Buzz.tick(ctx)
        who = label
        countJob = scope.launch {
            for (left in wait downTo 1) { countdown = left; delay(1000) }
            countdown = null
            countJob = null
            if (cur?.busy != true) send()
        }
    }
    BackHandler(enabled = countdown != null) { cancelCountdown() }

    if (st != null && st.busy) { PlayingScreen(st); return }
    val board = st?.board ?: emptyList()
    val queue = st?.queue ?: emptyList()
    val list = rememberScalingLazyListState(initialCenterItemIndex = 1)
    Box(Modifier.fillMaxSize()) {
        ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
            item { ListHeader { Text("Game sounds") } }
            if (queue.isNotEmpty()) {
                item {
                    SoundRow("▶ Play ${queue.first().label}", "Up next", Green, onClick = { start(queue.first().label, "upnext", null) }, onLongClick = null)
                }
                items(queue, key = { "q" + it.id }) { s ->
                    SoundRow("Next: " + s.label, "Tap to take out", Color(0xFF334155), onClick = { Buzz.tick(ctx); PhoneLink.send(Proto.cmd("unqueue", "id" to s.id)) }, onLongClick = null)
                }
            }
            items(board, key = { it.id }) { s ->
                val waiting = queue.any { it.id == s.id }
                SoundRow(
                    s.label,
                    when { !s.ready -> "Set it up on your phone"; waiting -> "In Up next"; else -> "Hold to play next" },
                    Color(0xFF1E293B),
                    subColor = if (!s.ready) Yellow else Muted,
                    onClick = { if (s.ready && countdown == null) start(s.label, "sound", s.id) },
                    onLongClick = if (s.ready && !waiting) ({ Buzz.pattern(ctx, 40, 60, 40); PhoneLink.send(Proto.cmd("queue", "id" to s.id)); Unit }) else null,
                )
            }
            if (board.isEmpty()) item {
                Text(
                    "No game sounds yet. Add them under Game sounds in Walk-Up on your phone.",
                    color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
            item { BackChip("Back to batter", onClick = onDone) }
        }
        countdown?.let { left -> CountdownScreen(left, who, onCancel = { cancelCountdown() }) }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SoundRow(title: String, sub: String?, bg: Color, subColor: Color = Color.White.copy(alpha = 0.8f), onClick: () -> Unit, onLongClick: (() -> Unit)?) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(bg)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(title, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (sub != null) Text(sub, color = subColor, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
