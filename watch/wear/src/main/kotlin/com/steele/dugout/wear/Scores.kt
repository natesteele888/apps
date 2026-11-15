package com.steele.dugout.wear

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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import com.steele.dugout.shared.LeagueScores
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val Card = Color(0xFF1E293B)
private val UsCard = Color(0xFF1E3A8A)

/**
 * Scores: every MAC League game today, Majors first, Lunenburg's games on top of each division. Swipe or turn the
 * bezel to scroll. On a day with no league games it shows the standings instead.
 */
@Composable
fun ScoresScreen() {
    val st = ScoresStore.state.collectAsState().value
    val board = st.board
    val list = rememberScalingLazyListState()
    ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text("League Scores") } }
        item { Text(statusLine(st), color = Muted, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
        if (board.divisions.isEmpty()) {
            item {
                Text(
                    if (st.loading || st.checkedAt == 0L) "Getting the scores…" else "No league scores yet",
                    fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
        } else if (board.gameCount > 0) {
            board.divisions.filter { it.games.isNotEmpty() }.forEach { d ->
                item { ListHeader { Text(d.name) } }
                items(d.games) { g -> GameCard(g) }
            }
        } else {
            item { Text("No league games today", fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) }
            board.divisions.filter { it.standings.isNotEmpty() }.forEach { d ->
                item { ListHeader { Text(d.name + " standings") } }
                items(d.standings.withIndex().toList()) { (i, s) -> StandingRow(i + 1, s) }
            }
        }
        item {
            Text(
                "The league posts new scores about every 30 minutes",
                color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            )
        }
    }
}

@Composable
private fun GameCard(g: LeagueScores.Game) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (g.us) UsCard else Card).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        TeamLine(g.away, g.played && g.away.score!! > g.home.score!!, g.played && g.away.score!! < g.home.score!!)
        TeamLine(g.home, g.played && g.home.score!! > g.away.score!!, g.played && g.home.score!! < g.away.score!!)
        val info = listOfNotNull(g.time.ifBlank { null }, g.location).joinToString(" · ")
        if (info.isNotBlank()) Text(info, color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun TeamLine(s: LeagueScores.Side, won: Boolean, lost: Boolean) {
    val color = if (lost) Muted else Color.White
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            s.name, color = color, fontSize = 14.sp, fontWeight = if (won || s.us) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        Text(s.score?.toString() ?: "–", color = color, fontSize = 16.sp, fontWeight = if (won) FontWeight.Bold else FontWeight.Normal)
    }
}

@Composable
private fun StandingRow(place: Int, s: LeagueScores.Standing) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (s.us) UsCard else Card).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("$place  ${s.team}", fontSize = 13.sp, fontWeight = if (s.us) FontWeight.Bold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text(s.record, fontSize = 13.sp, color = Muted)
    }
}

private val clock = DateTimeFormatter.ofPattern("h:mm a", Locale.US)

private fun statusLine(st: ScoresStore.State): String {
    val posted = st.board.scrapedAt?.let { iso ->
        try {
            val i = Instant.parse(iso)
            val z = i.atZone(ZoneId.systemDefault())
            val today = java.time.LocalDate.now(ZoneId.systemDefault())
            if (z.toLocalDate() == today) "Updated " + clock.format(z) else "Updated " + DateTimeFormatter.ofPattern("MMM d", Locale.US).format(z)
        } catch (e: Exception) { null }
    }
    return when {
        st.error != null && posted != null -> "$posted · offline"
        st.error != null -> st.error
        st.loading && posted == null -> "Checking…"
        posted != null -> posted
        else -> ""
    }
}
