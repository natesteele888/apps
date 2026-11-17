package com.steele.family

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Text
import com.steele.family.core.PowerCore
import com.steele.family.core.WatchLog

private val Orange = Color(0xFFF97316)

/** Power Program on the watch: today's workout from the phone, one exercise at a time, with timers for the timed ones. */
class PowerActivity : FamilyActivity() {
    override val appName = "Power Program"
    override val phoneApp = "Power Program › Program › Watch"
    @Composable override fun Screen() = PowerApp(onChange = ::syncSoon)
}

/** one screen of the workout: an exercise in a round, and which side for the "/side" ones */
private data class Step(val section: PowerCore.Section, val round: Int, val ex: PowerCore.Ex, val side: Int, val lastOfEx: Boolean)

private fun stepsOf(d: PowerCore.Day): List<Step> = d.sections.flatMap { s ->
    (1..s.rounds).flatMap { r ->
        s.ex.flatMap { e ->
            val sides = if (e.perSide) listOf(1, 2) else listOf(0)
            sides.map { side -> Step(s, r, e, side, r == s.rounds && (side == 0 || side == 2)) }
        }
    }
}

@Composable
fun PowerApp(onChange: () -> Unit) {
    val ctx = LocalContext.current
    val st by Link.state.collectAsState()
    val d = remember(st.fields["pp"]) { PowerCore.parse(st.fields["pp"]) }
    if (d == null) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Text(if (st.checkedAt == 0L) "Getting today's workout from the phone…" else "Open Power Program on your phone once, and today's workout comes over.",
                fontSize = 14.sp, textAlign = TextAlign.Center)
        }
        return
    }
    // what the watch already ticked for this day, on top of the phone's ticks
    val watchEntries = remember(st.logRev, d.day) { WatchLog.entries(Link.log(), "pp").filter { it.optInt("day") == d.day } }
    val checks = d.checks + watchEntries.mapNotNull { e -> e.optString("k").takeIf { it.isNotBlank() } }
    // done on the watch (this day, before the phone has taken it), or today's session already done on the phone
    val watchDone = watchEntries.any { it.optInt("done") == 1 }
    val steps = remember(d) { stepsOf(d) }
    var at by rememberSaveable(d.day) { mutableIntStateOf(-1) }   // -1: the overview
    var finished by rememberSaveable(d.day) { mutableStateOf(false) }

    fun next() {
        val s = steps[at]
        if (s.lastOfEx && s.ex.key !in checks) Link.add("pp", mapOf("day" to d.day, "k" to s.ex.key))
        if (at + 1 >= steps.size) {
            if (!watchDone) Link.add("pp", mapOf("day" to d.day, "done" to 1))
            Buzz.done(ctx); finished = true; at = -1
        } else { Buzz.tick(ctx); at++ }
        onChange()
    }

    when {
        finished -> Box(Modifier.fillMaxSize().clickable { finished = false }, contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("💪", fontSize = 40.sp)
                Text("Day ${d.day} done!", fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Text("${d.total - d.day} days to go", fontSize = 13.sp, color = Muted)
            }
        }
        at >= 0 && at < steps.size -> BackScreen(onBack = { at = if (at > 0) at - 1 else -1 }) {
            StepScreen(steps[at], at, steps.size, onNext = ::next, onQuit = { at = -1 })
        }
        else -> ScalingLazyColumn(Modifier.fillMaxSize()) {
            item { Text("Day ${d.day} of ${d.total}", fontSize = 12.sp, color = Orange) }
            item { Text(d.title, fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            item { Text(listOf(d.type, d.time).filter { it.isNotBlank() }.joinToString(" · ") + if (d.streak > 0) "  ·  🔥 ${d.streak}" else "",
                fontSize = 12.sp, color = Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            when {
                watchDone -> item { Text("Day ${d.day} done! 💪", fontSize = 16.sp, color = Green, textAlign = TextAlign.Center, modifier = Modifier.padding(8.dp)) }
                d.done -> item { Text("Done for today! 💪 This is what's next.", fontSize = 14.sp, color = Green, textAlign = TextAlign.Center, modifier = Modifier.padding(8.dp)) }
                d.rest -> item { Text("Rest day. The stretch is optional.", fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(8.dp)) }
            }
            if (steps.isNotEmpty()) {
                val firstOpen = steps.indexOfFirst { it.ex.key !in checks }.let { if (it < 0 || watchDone) 0 else it }
                item {
                    Chip(onClick = { at = firstOpen; Buzz.go(ctx) },
                        label = { Text(when { watchDone -> "Do it again"; d.done -> "Start Day ${d.day} early"; firstOpen > 0 -> "Keep going"; d.rest -> "Stretch"; else -> "Start" }) },
                        colors = ChipDefaults.primaryChipColors(backgroundColor = Orange), modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                }
                d.sections.forEach { s ->
                    item { Text(s.label + if (s.rounds > 1) " · ${s.rounds} rounds" else "", fontSize = 12.sp, color = Orange, modifier = Modifier.padding(top = 6.dp)) }
                    s.ex.forEach { e ->
                        item { Text((if (e.key in checks) "✓ " else "• ") + e.name + "  " + e.reps, fontSize = 13.sp,
                            color = if (e.key in checks) Muted else Color.White, modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) }
                    }
                }
            }
            if (d.note.isNotBlank()) item { Text(d.note, fontSize = 11.sp, color = Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp)) }
            item { freshLine().takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center) } }
        }
    }
}

/** one exercise: the reps and Done, or a timer that starts on Start and moves on by itself */
@Composable
private fun StepScreen(s: Step, i: Int, n: Int, onNext: () -> Unit, onQuit: () -> Unit) {
    val ctx = LocalContext.current
    val secs = s.ex.seconds
    var end by rememberSaveable(i) { mutableLongStateOf(0L) }
    KeepScreenOn(true)
    val t = now(200)
    val left = if (end == 0L) secs * 1000L else (end - t).coerceAtLeast(0)
    LaunchedEffect(i, end, left == 0L) { if (secs > 0 && end != 0L && left == 0L) onNext() }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (secs > 0) CircularProgressIndicator(progress = left / (secs * 1000f), modifier = Modifier.fillMaxSize().padding(4.dp), indicatorColor = Orange, strokeWidth = 7.dp)
        else CircularProgressIndicator(progress = (i + 1f) / n, modifier = Modifier.fillMaxSize().padding(4.dp), indicatorColor = Orange.copy(alpha = 0.5f), strokeWidth = 4.dp)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.padding(horizontal = 26.dp)) {
            Text(s.section.label + if (s.section.rounds > 1) " · round ${s.round} of ${s.section.rounds}" else "", fontSize = 11.sp, color = Orange, textAlign = TextAlign.Center)
            Text(s.ex.name, fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2)
            if (s.side > 0) Text(if (s.side == 1) "First side" else "Other side", fontSize = 12.sp, color = Yellow)
            if (secs > 0) Text(PowerCore.clock(((left + 999) / 1000).toInt()), fontSize = 34.sp, fontWeight = FontWeight.Bold)
            else Text(s.ex.reps, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            if (s.ex.cue.isNotBlank()) Text(s.ex.cue, fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center, maxLines = 2)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (secs > 0 && end == 0L) CompactChip(onClick = { end = System.currentTimeMillis() + secs * 1000L; Buzz.go(ctx) }, label = { Text("Start") },
                    colors = ChipDefaults.primaryChipColors(backgroundColor = Orange))
                else CompactChip(onClick = onNext, label = { Text(if (secs > 0) "Skip" else "Done") },
                    colors = if (secs > 0) ChipDefaults.secondaryChipColors() else ChipDefaults.primaryChipColors(backgroundColor = Orange))
            }
            Text("${i + 1} of $n", fontSize = 10.sp, color = Muted, modifier = Modifier.clickable { onQuit() })
        }
    }
}
