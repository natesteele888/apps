package com.steele.family

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.ToggleChip
import androidx.wear.compose.material.ToggleChipDefaults
import com.steele.family.core.GrCore
import com.steele.family.core.WatchLog

private val Blue = Color(0xFF2F8CFF)

/** Get Ready on the watch: today's list from the phone, one tap per item. Items with a timer start it first. */
class GetReadyActivity : FamilyActivity() {
    override val appName = "Get Ready"
    override val phoneApp = "Get Ready › More › Watch"
    @Composable override fun Screen() = GetReadyApp(onChange = ::syncSoon)
}

@Composable
fun GetReadyApp(onChange: () -> Unit) {
    val ctx = LocalContext.current
    val st by Link.state.collectAsState()
    val today = todayKey()
    val s = remember(st.fields["gr"], st.logRev, today) { GrCore.withTaps(GrCore.parse(st.fields["gr"]), WatchLog.grTaps(Link.log())) }
    val list = GrCore.listFor(s, today)
    var timing by rememberSaveable { mutableStateOf<String?>(null) }
    var party by rememberSaveable { mutableStateOf(false) }

    fun tap(id: String, on: Boolean) {
        val wasDone = GrCore.complete(s, today)
        Link.add("gr", mapOf("d" to today, "i" to id, "on" to if (on) 1 else 0))
        val after = GrCore.withTaps(GrCore.parse(Link.field("gr")), WatchLog.grTaps(Link.log()))
        if (!wasDone && GrCore.complete(after, today)) { party = true; Buzz.done(ctx) } else Buzz.tick(ctx)
        onChange()
    }

    val item = timing?.let { id -> list?.items?.firstOrNull { it.id == id } }
    when {
        party -> Party(GrCore.streak(s, today)) { party = false }
        item != null -> BackScreen(onBack = { timing = null }) { ItemTimer(item, onDone = { tap(item.id, true); timing = null }, onBack = { timing = null }) }
        else -> {
            val lc = rememberScalingLazyListState()
            ScalingLazyColumn(state = lc, modifier = Modifier.fillMaxSize()) {
                item { ListHeader { Text(list?.name ?: "Get Ready") } }
                when {
                    s.empty -> item { Note(if (st.checkedAt == 0L) "Getting your list from the phone…" else "Open Get Ready on your phone once, and your list comes over.") }
                    list == null -> item { Note("Day off today. No list!") }
                    list.items.isEmpty() -> item { Note("This list is empty. Add things on the phone.") }
                    else -> {
                        item {
                            val n = GrCore.count(s, today); val streak = GrCore.streak(s, today)
                            Text("$n of ${list.items.size} done" + if (streak > 0) "  ·  🔥 $streak" else "", fontSize = 12.sp, color = Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                        }
                        items(list.items) { i ->
                            val on = GrCore.checked(s, today, i.id)
                            ToggleChip(
                                checked = on,
                                onCheckedChange = { c -> if (c && i.timer > 0) timing = i.id else tap(i.id, c) },
                                label = { Text(i.name, maxLines = 2) },
                                secondaryLabel = if (i.timer > 0 && !on) ({ Text("⏱ " + GrCore.timerLabel(i.timer)) }) else null,
                                toggleControl = { androidx.wear.compose.material.Checkbox(checked = on) },
                                colors = ToggleChipDefaults.toggleChipColors(checkedStartBackgroundColor = Blue.copy(alpha = 0.55f), checkedEndBackgroundColor = Blue.copy(alpha = 0.35f)),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        if (GrCore.complete(s, today)) item { Note("All set! 🎉") }
                    }
                }
                item { freshLine().takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) } }
            }
        }
    }
}

@Composable
private fun Note(t: String) = Text(t, fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))

/** an item with a timer: Start, a ring that counts down, a buzz at the end, and it ticks itself */
@Composable
private fun ItemTimer(item: GrCore.Item, onDone: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    var end by rememberSaveable { mutableLongStateOf(0L) }
    val t = now(200)
    val left = if (end == 0L) item.timer * 1000L else (end - t).coerceAtLeast(0)
    LaunchedEffect(end, left == 0L) { if (end != 0L && left == 0L) { Buzz.done(ctx); onDone() } }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(progress = left / (item.timer * 1000f), modifier = Modifier.fillMaxSize().padding(4.dp), indicatorColor = Blue, strokeWidth = 8.dp)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(item.name, fontSize = 14.sp, textAlign = TextAlign.Center, maxLines = 2, modifier = Modifier.padding(horizontal = 30.dp))
            val sec = ((left + 999) / 1000).toInt()
            Text("${sec / 60}:${(sec % 60).toString().padStart(2, '0')}", fontSize = 40.sp, fontWeight = FontWeight.Bold)
            if (end == 0L) Chip(onClick = { end = System.currentTimeMillis() + item.timer * 1000L; Buzz.go(ctx) }, label = { Text("Start") }, colors = ChipDefaults.primaryChipColors(backgroundColor = Blue))
            else Text("Already done? Tap", fontSize = 11.sp, color = Muted, modifier = Modifier.clickable { onDone() })
            if (end == 0L) Text("Skip the timer", fontSize = 11.sp, color = Muted, modifier = Modifier.clickable { onDone() })
        }
    }
}

/** the whole list is done */
@Composable
private fun Party(streak: Int, onClose: () -> Unit) {
    val t = now(400)
    val colors = listOf(Blue, Green, Yellow, Color(0xFFEC4899))
    Box(Modifier.fillMaxSize().background(colors[((t / 400) % colors.size).toInt()].copy(alpha = 0.35f)).clickable { onClose() }, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🎉", fontSize = 40.sp)
            Text("All set!", fontSize = 28.sp, fontWeight = FontWeight.Bold)
            if (streak > 0) Text("🔥 $streak day" + (if (streak == 1) "" else "s") + " in a row", fontSize = 15.sp)
            Text("Tap to close", fontSize = 11.sp, color = Muted, modifier = Modifier.padding(top = 8.dp))
        }
    }
}
