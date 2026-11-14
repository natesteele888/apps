package com.steele.dugout.wear

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.Text
import com.steele.dugout.shared.PitchCore
import com.steele.dugout.shared.Row
import com.steele.dugout.shared.Zone
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.abs

private fun zoneColor(z: Zone?): Color = when (z) {
    Zone.YELLOW -> Color(0xFFA16207)
    Zone.RED, Zone.LIMIT -> Color(0xFFB91C1C)
    Zone.GREEN -> Color(0xFF15803D)
    null -> Color(0xFF1E293B)
}

/**
 * Pitching: tap anywhere in the middle to add a pitch. Green while well under, yellow at 10 left, red at 5 left, and a
 * buzz on every pitch from then on. Undo takes back the last one. Swipe up or down, or turn the bezel, for the bullpen.
 */
@Composable
fun PitchingScreen(onBullpen: () -> Unit) {
    val ctx = LocalContext.current
    val log = PitchStore.log.collectAsState().value
    PitchStore.resting.collectAsState().value
    val cur = PitchStore.cur(log)
    val row: Row? = cur?.let { c -> PitchStore.rows(log).firstOrNull { it.id == c.first } }
    val focus = remember { FocusRequester() }
    val rotary = remember { mutableFloatStateOf(0f) }
    val drag = remember { mutableFloatStateOf(0f) }
    val pulse by rememberInfiniteTransition(label = "limit").animateFloat(0.6f, 1f, infiniteRepeatable(tween(500), RepeatMode.Reverse), label = "pulse")
    LaunchedEffect(Unit) { focus.requestFocus() }
    val bg = zoneColor(row?.zone).let { if (row?.zone == Zone.LIMIT) it.copy(alpha = pulse) else it }

    Box(
        Modifier.fillMaxSize().background(Color.Black).background(bg)
            .onRotaryScrollEvent { e ->
                rotary.floatValue += e.verticalScrollPixels
                if (abs(rotary.floatValue) > 80f) { rotary.floatValue = 0f; onBullpen() }
                true
            }
            .focusRequester(focus).focusable()
            .pointerInput(Unit) {
                detectVerticalDragGestures(onDragEnd = { if (abs(drag.floatValue) > 50f) onBullpen(); drag.floatValue = 0f }, onDragCancel = { drag.floatValue = 0f }) { _, dy -> drag.floatValue += dy }
            },
        contentAlignment = Alignment.Center,
    ) {
        if (row != null && row.limit > 0) {
            CircularProgressIndicator(
                progress = (row.count.toFloat() / row.limit).coerceIn(0f, 1f), modifier = Modifier.fillMaxSize().padding(2.dp),
                indicatorColor = Color.White, trackColor = Color(0x33FFFFFF), strokeWidth = 6.dp,
            )
        }
        // the big tap target: the whole middle of the screen
        Box(
            Modifier.size(150.dp).clip(RoundedCornerShape(75.dp)).clickable {
                val (r, before) = PitchStore.add()
                if (r != null) Buzz.pitch(ctx, r.left, before, r.limit) else Buzz.tick(ctx)
            },
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${row?.count ?: 0}", fontSize = 58.sp, fontWeight = FontWeight.Black, color = Color.White)
                Text(
                    when {
                        row == null -> "Tap to count"
                        row.limit == 0 -> "No limit set"
                        row.left <= 0 -> "LIMIT REACHED"
                        else -> "${row.left} left"
                    },
                    fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color.White,
                )
                val step = row?.let { PitchCore.nextRestStep(it.count, log.division) }
                if (step != null && row != null && row.left > 0) Text("Pitch ${step.at} = ${step.rest} rest day" + (if (step.rest == 1) "" else "s"), fontSize = 10.sp, color = Color(0xCCFFFFFF))
            }
        }
        Text(
            (cur?.second ?: "Pitching") + " ▾",
            fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 18.dp, start = 36.dp, end = 36.dp).clickable { onBullpen() },
        )
        Box(
            Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp).size(width = 64.dp, height = 30.dp).clip(RoundedCornerShape(15.dp))
                .background(Color(0x55000000)).clickable { if (PitchStore.undo()) Buzz.pattern(ctx, 40, 60, 40) },
            contentAlignment = Alignment.Center,
        ) { Text("Undo", fontSize = 13.sp, color = Color.White) }
    }
}

/** Everyone who can pitch: pitches today, how many are left, and who is resting. Tap one to put them on the mound. */
@Composable
fun BullpenScreen(onDone: () -> Unit) {
    val log = PitchStore.log.collectAsState().value
    PitchStore.resting.collectAsState().value
    val rows = PitchStore.rows(log)
    val cur = PitchStore.cur(log)?.first
    val ok = PhoneLink.phoneOk(now())
    val list = rememberScalingLazyListState()
    ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text("Bullpen") } }
        if (rows.isEmpty()) item { Text("Go back and tap the middle to count. Add pitcher names in Dugout on your phone.", color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center) }
        items(rows) { r ->
            val sub = when {
                !r.eligible -> "Resting until " + day(r.eligibleOn)
                r.limit == 0 -> "${r.count} today"
                r.left <= 0 -> "${r.count} today · at the limit"
                else -> "${r.count} today · ${r.left} left"
            }
            Chip(
                onClick = { PitchStore.choose(r.id); onDone() },
                modifier = Modifier.fillMaxWidth(),
                label = { Text((if (r.id == cur) "▶ " else "") + r.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text(sub, maxLines = 1) },
                colors = ChipDefaults.chipColors(backgroundColor = if (!r.eligible) Color(0xFF334155) else zoneColor(r.zone)),
            )
        }
        item {
            Column(Modifier.padding(top = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Spacer(Modifier.height(2.dp))
                Text(if (ok) "Synced with your phone" else "Counts sync when the phone is near", color = Muted, fontSize = 11.sp, textAlign = TextAlign.Center)
            }
        }
    }
}

private fun day(d: String?): String = try {
    LocalDate.parse(d).dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault())
} catch (e: Exception) { "later" }
