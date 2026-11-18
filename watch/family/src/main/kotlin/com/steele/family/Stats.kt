package com.steele.family

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Text
import com.steele.family.core.StatsCore

private val Gold = Color(0xFFF59E0B)
private val Blue = Color(0xFF60A5FA)
private val Teal = Color(0xFF10B981)

/** My Stats on the watch: LYBS stats by season, personal bests and career, sent from the phone (apps/stats). */
class StatsActivity : FamilyActivity(every = 5 * 60_000) {
    override val appName = "My Stats"
    override val phoneApp = "My Stats"
    @Composable override fun Screen() = StatsApp()
}

@Composable
fun StatsApp() {
    val st by Link.state.collectAsState()
    val s = remember(st.fields["ps"]) { StatsCore.parse(st.fields["ps"]) }
    if (s == null || s.seasons.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (st.checkedAt == 0L) "Getting your stats from the phone…" else "Ask Dad to open My Stats on his phone once, and your seasons come over.",
                fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 30.dp))
        }
        return
    }
    val bests = remember(s) { StatsCore.bests(s.seasons) }
    val line = remember(bests) { StatsCore.newBestsLine(bests) }

    ScalingLazyColumn(Modifier.fillMaxSize()) {
        item { Text("My Stats", fontSize = 13.sp, color = Gold) }
        if (line.isNotBlank()) item { Text("★ $line", fontSize = 12.sp, color = Gold, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center) }
        item { SeasonCard(s.seasons.first(), big = true) }
        if (bests.isNotEmpty()) {
            item { Text("Personal bests", fontSize = 12.sp, color = Gold, modifier = Modifier.padding(top = 6.dp)) }
            bests.forEach { b -> item { BestRow(b) } }
        }
        s.seasons.drop(1).forEach { item { SeasonCard(it, big = false) } }
        if (s.seasons.size > 1) item { SeasonCard(s.career, big = false, career = s.seasons.size) }
        item { freshLine().takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center) } }
    }
}

/** one season (or the career): AVG and OPS big, the counting stats under, and the pitching line when he pitched */
@Composable
private fun SeasonCard(x: StatsCore.Season, big: Boolean, career: Int = 0) {
    val b = x.bat; val p = x.pit
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Card).padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(if (career > 0) "Career · $career seasons" else x.label, fontSize = 12.sp, color = if (career > 0) Teal else Blue, fontWeight = FontWeight.Bold)
        if (b.any) {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Big(StatsCore.rate(b.avg), "AVG", big)
                Big(StatsCore.rate(b.ops), "OPS", big)
            }
            Text("H ${b.h} · HR ${b.hr} · RBI ${b.rbi}", fontSize = 12.sp, textAlign = TextAlign.Center)
            Text("R ${b.r} · SB ${b.sb} · BB ${b.bb}", fontSize = 12.sp, color = Color.White.copy(alpha = 0.85f), textAlign = TextAlign.Center)
            Text("${b.ab} AB · OBP ${StatsCore.rate(b.obp)}", fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center)
        }
        if (p.any) {
            Text("Pitching", fontSize = 10.sp, color = Muted, modifier = Modifier.padding(top = 4.dp))
            Text("ERA ${StatsCore.era(p.era)} · K ${p.so}", fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Text("IP ${StatsCore.ip(p.outs)} · WHIP ${StatsCore.era(p.whip)}" + if (p.w + p.l > 0) " · ${p.w}-${p.l}" else "",
                fontSize = 11.sp, color = Color.White.copy(alpha = 0.85f), textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun Big(v: String, label: String, big: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(v, fontSize = if (big) 26.sp else 20.sp, fontWeight = FontWeight.Bold)
        Text(label, fontSize = 10.sp, color = Muted)
    }
}

/** "★ Hits  16  2026": the star marks a best set in the newest season */
@Composable
private fun BestRow(b: StatsCore.Best) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text((if (b.latest) "★ " else "") + b.what, fontSize = 12.sp, color = if (b.latest) Gold else Color.White, maxLines = 1, modifier = Modifier.weight(1f))
        Text(b.shown, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Text("  ${b.year}", fontSize = 10.sp, color = Muted)
    }
}
