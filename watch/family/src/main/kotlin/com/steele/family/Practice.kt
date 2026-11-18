package com.steele.family

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Text
import com.steele.family.core.PracticeCore
import com.steele.family.core.PracticeCore.Mode

private val Amber = Color(0xFFFFB020)

/**
 * Practice Clock on the watch: the block or station that's on, its countdown and what's next, following the practice
 * the coach runs on the phone. Buzzes at every change, with the screen on or off (see PracticeAlarms). Watch only: all
 * the controls stay on the phone.
 */
class PracticeActivity : FamilyActivity(every = 5_000) {
    override val appName = "Practice Clock"
    override val phoneApp = "Practice Clock › Settings › Watch"
    @Composable override fun Screen() = PracticeApp()
}

@Composable
fun PracticeApp() {
    val ctx = LocalContext.current
    val st by Link.state.collectAsState()
    val text = st.fields["pk"]
    val p = remember(text) { PracticeCore.parse(text) }
    // the buzzes for the screen-off time, set again every time the phone's practice changes (and when this opens)
    LaunchedEffect(text) { PracticeAlarms.schedule(ctx.applicationContext, p) }
    val t = now(if (p != null) 250 else 5_000)
    val fresh = freshLine()

    if (p == null) {
        Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("⏱", fontSize = 28.sp)
            Text("No practice running", fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Text("Start one in Practice Clock on your phone. It shows up here.", fontSize = 12.sp, color = Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
            if (fresh.isNotBlank()) Text(fresh, fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
        }
        return
    }

    val n = PracticeCore.at(p, t)
    KeepScreenOn(n.mode == Mode.RUNNING || n.mode == Mode.HOLDING)
    // a buzz when the block or station changes while the screen is on. Only for a change that just happened (not one the
    // screen slept through) and only once: an alarm at the same change has already buzzed.
    val key = "${p.startMs}:${n.mode}:${n.index}"
    var seen by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(key) {
        val was = seen
        seen = key
        if (was != null && n.mode != Mode.PAUSED && t - n.since in 0L until 15_000L) PracticeAlarms.buzz(ctx.applicationContext, n.mode == Mode.DONE, n.since)
    }

    val seg = p.segs[n.index]
    val next = p.segs.getOrNull(n.index + 1)
    val ring = when (n.mode) { Mode.RUNNING -> Amber; Mode.PAUSED -> Muted; Mode.HOLDING -> Yellow; Mode.DONE -> Green }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(progress = if (n.mode == Mode.DONE) 1f else n.segDoneFraction,
            modifier = Modifier.fillMaxSize().padding(4.dp), indicatorColor = ring, strokeWidth = 8.dp)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(horizontal = 26.dp)) {
            Text(p.name, fontSize = 11.sp, color = Amber, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (n.mode == Mode.DONE) {
                Text("Practice done", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Green, textAlign = TextAlign.Center)
                Text("Nice work, coach.", fontSize = 12.sp, color = Muted)
            } else {
                Text(seg.name, fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(PracticeCore.clock(n.segLeftMs), fontSize = 36.sp, fontWeight = FontWeight.Bold, color = if (n.mode == Mode.RUNNING) Color.White else Muted)
                when (n.mode) {
                    Mode.PAUSED -> Text("Paused", fontSize = 12.sp, color = Yellow)
                    Mode.HOLDING -> Text("Waiting for the coach", fontSize = 12.sp, color = Yellow, textAlign = TextAlign.Center)
                    else -> {}
                }
                Text(if (next != null) "Next: ${next.name}" else "Last one", fontSize = 11.sp, color = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            }
            if (fresh.isNotBlank()) Text(fresh, fontSize = 9.sp, color = Muted, textAlign = TextAlign.Center)
        }
    }
}
