package com.steele.family

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Text
import com.steele.dugout.shared.Gc
import com.steele.family.core.SchedCore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId

private val Sky = Color(0xFF0EA5E9)

/** Schedule on the watch: games and practices for the next two weeks, from the team app on the phone, with live scores. */
class ScheduleActivity : FamilyActivity(every = 60_000) {
    override val appName = "Schedule"
    override val phoneApp = "LYBS Ballclub › Calendar › Watch"
    @Composable override fun Screen() = ScheduleApp()
}

@Composable
fun ScheduleApp() {
    val ctx = LocalContext.current
    val h24 = remember { DateFormat.is24HourFormat(ctx) }
    val st by Link.state.collectAsState()
    val s = remember(st.fields["sc"]) { SchedCore.parse(st.fields["sc"]) }
    var games by remember { mutableStateOf<List<Gc.Game>>(emptyList()) }
    val zone = ZoneId.systemDefault()

    // GameChanger's games for the team, when the phone set one: every 15 minutes, every 30 seconds during a game
    LaunchedEffect(s?.gc) {
        val id = s?.gc ?: run { games = emptyList(); return@LaunchedEffect }
        while (true) {
            val got = withContext(Dispatchers.IO) {
                try { Link.http("GET", Gc.gamesUrl(id)).let { (c, b) -> if (c == 200) Gc.parseGames(b) else null } } catch (e: Exception) { null }
            }
            if (got != null) games = got
            delay(Gc.refreshMs(Gc.board(games, System.currentTimeMillis())))
        }
    }

    val t = now(30_000)
    if (s == null) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (st.checkedAt == 0L) "Getting the schedule from the phone…" else "Open the team app on your phone once, and your games and practices come over.",
                fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 30.dp))
        }
        return
    }
    val ahead = remember(s, games, t / 60_000) { SchedCore.ahead(SchedCore.merge(s, games, zone), t, zone) }
    val today = Instant.ofEpochMilli(t).atZone(zone).toLocalDate()

    ScalingLazyColumn(Modifier.fillMaxSize()) {
        item { Text("Schedule", fontSize = 13.sp, color = Sky) }
        if (ahead.isEmpty()) item { Text("Nothing in the next two weeks.", fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(8.dp)) }
        else {
            val next = ahead.first()
            item { NextUp(next, SchedCore.dayLabel(next.date, today), SchedCore.timeLabel(next.min, h24), SchedCore.live(next, t, zone), SchedCore.score(next, t)) }
            var day: java.time.LocalDate? = next.date
            ahead.drop(1).forEach { e ->
                if (e.date != day) {
                    day = e.date
                    item { Text(SchedCore.dayLabel(e.date, today), fontSize = 12.sp, color = Sky, modifier = Modifier.padding(top = 6.dp)) }
                }
                item { EvRow(e, SchedCore.timeLabel(e.min, h24), SchedCore.score(e, t)) }
            }
        }
        item { freshLine().takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center) } }
    }
}

/** the next thing on the list, big: when, what, where, and the score while it's on */
@Composable
private fun NextUp(e: SchedCore.Ev, day: String, time: String, live: Boolean, score: String) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (live) Green.copy(alpha = 0.3f) else Card).padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(if (live) "On now" else listOf(day, time).filter { it.isNotBlank() }.joinToString(" · "),
            fontSize = 12.sp, color = if (live) Green else Sky, fontWeight = FontWeight.Bold)
        Text(e.title, fontSize = 18.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2)
        if (score.isNotBlank()) Text(score, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        val sub = listOf(e.team, e.place).filter { it.isNotBlank() }.joinToString(" · ")
        if (sub.isNotBlank()) Text(sub, fontSize = 11.sp, color = Muted, textAlign = TextAlign.Center, maxLines = 2)
    }
}

/** one later event: time and what it is, the team underneath */
@Composable
private fun EvRow(e: SchedCore.Ev, time: String, score: String) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        Text(listOf(time, e.title).filter { it.isNotBlank() }.joinToString("  ") + if (score.isNotBlank()) "  $score" else "",
            fontSize = 13.sp, color = if (e.game) Color.White else Color.White.copy(alpha = 0.85f), fontWeight = if (e.game) FontWeight.Bold else FontWeight.Normal, maxLines = 1)
        val sub = listOf(e.team, e.place).filter { it.isNotBlank() }.joinToString(" · ")
        if (sub.isNotBlank()) Text(sub, fontSize = 10.sp, color = Muted, maxLines = 1)
    }
}
