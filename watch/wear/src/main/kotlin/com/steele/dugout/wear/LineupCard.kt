package com.steele.dugout.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onPreRotaryScrollEvent
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
import com.steele.dugout.shared.Batter
import com.steele.dugout.shared.Lineup
import kotlin.math.abs

/**
 * The Lineup card (from the batting order: the "Lineup card" chip): who plays where, inning by inning, as set in Walk-Up's
 * Positions by inning on the phone. Turn the bezel or tap − and + to change the inning; it opens on the inning being played
 * when the phone knows it, else the last one looked at, else the first. Each of the nine positions shows who is there, then
 * who sits. A position with two players, or nobody, is marked. With no grid, each batter's one position shows instead.
 * [last] is the inning looked at last (0: none yet); [onInning] remembers a new one.
 */
@Composable
fun LineupCardScreen(last: Int, onInning: (Int) -> Unit, onDone: () -> Unit) {
    val ctx = LocalContext.current
    val st = PhoneLink.state.collectAsState().value
    if (st == null || !st.ready) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Lineup card", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text("Open Walk-Up in Dugout on your phone.", color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center)
            BackChip("Back", onClick = onDone)
        }
        return
    }
    val grid = Lineup.hasGrid(st)
    val n = if (grid) st.innings else 0
    var k by remember { mutableIntStateOf(Lineup.start(st.inning, last, n)) }
    // the game got shorter on the phone, or a grid showed up: stay on a real inning
    LaunchedEffect(n) { if (n > 0) k = k.coerceIn(1, n) }
    val report by rememberUpdatedState(onInning)
    LaunchedEffect(k) { if (k > 0) report(k) }
    fun move(d: Int) { val to = Lineup.step(k, d, n); if (to != k) { k = to; Buzz.tick(ctx) } }

    val card = Lineup.card(st, k)
    val warn = Lineup.warning(card)
    val focus = remember { FocusRequester() }
    val rotary = remember { mutableFloatStateOf(0f) }
    val list = rememberScalingLazyListState(initialCenterItemIndex = 1)
    // the list takes the bezel by itself; with a grid this box (around the list) takes it first, for the inning
    LaunchedEffect(grid) { if (grid) try { focus.requestFocus() } catch (e: IllegalStateException) { /* not placed yet */ } }

    Box(
        Modifier.fillMaxSize()
            // with a grid the bezel changes the inning (the list still scrolls by touch); without one it scrolls the list
            .onPreRotaryScrollEvent { e ->
                if (!grid) return@onPreRotaryScrollEvent false
                rotary.floatValue += e.verticalScrollPixels
                if (abs(rotary.floatValue) > 60f) { move(if (rotary.floatValue > 0) 1 else -1); rotary.floatValue = 0f }
                true
            }
            .focusRequester(focus).focusable(),
    ) {
        ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
            if (grid) {
                item { InningPicker(k, n, onMinus = { move(-1) }, onPlus = { move(1) }) }
                if (warn.isNotEmpty()) item {
                    Text("⚠ $warn", color = Yellow, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 16.dp))
                }
            } else item { ListHeader { Text("Positions", textAlign = TextAlign.Center) } }
            items(card.spots, key = { it.pos }) { s -> SpotRow(s.pos, s.players) }
            if (card.sitting.isNotEmpty()) item { GroupRow("Sits", card.sitting.joinToString(", ") { short(it) }, Muted) }
            if (card.unset.isNotEmpty()) item {
                if (grid) GroupRow("Not set", card.unset.joinToString(", ") { short(it) }, Yellow)
                else GroupRow("Other", card.unset.joinToString(", ") { short(it) + if (it.pos.isNotBlank()) " (${it.pos})" else "" }, Muted)
            }
            if (!grid) item {
                Text(
                    "Set who plays where each inning in Walk-Up on your phone: Team › Positions by inning.",
                    color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp, start = 12.dp, end = 12.dp),
                )
            }
            item { BackChip("Back to the order", onClick = onDone) }
        }
    }
}

/** − INNING 3 of 6 +, with big round buttons for a thumb in a batting glove */
@Composable
private fun InningPicker(k: Int, n: Int, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
        RoundButton("−", enabled = k > 1, onClick = onMinus)
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("INNING", fontSize = 11.sp, fontWeight = FontWeight.Black, color = Muted)
            Text("$k", fontSize = 34.sp, fontWeight = FontWeight.Black, color = Color.White, lineHeight = 36.sp)
            Text("of $n", fontSize = 11.sp, color = Muted)
        }
        RoundButton("+", enabled = k < n, onClick = onPlus)
    }
}

@Composable
private fun RoundButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).clip(CircleShape).background(Color(0xFF334155)).alpha(if (enabled) 1f else 0.35f)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White) }
}

/** one position: the position big on the left, who plays it on the right (red when two players have it, yellow when nobody does) */
@Composable
private fun SpotRow(pos: String, players: List<Batter>) {
    val two = players.size > 1
    val bg = when { two -> Color(0xFF7F1D1D); players.isEmpty() -> Color(0xFF3F3A1A); else -> Color(0xFF1E293B) }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(bg).padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(pos, fontSize = 20.sp, fontWeight = FontWeight.Black, color = if (two) Color.White else Green, modifier = Modifier.width(38.dp))
        Text(
            if (players.isEmpty()) "Nobody" else players.joinToString(" + ") { short(it) },
            fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = if (players.isEmpty()) Yellow else Color.White,
            maxLines = if (two) 2 else 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

/** who sits (or isn't set) this inning, in one block */
@Composable
private fun GroupRow(title: String, names: String, color: Color) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0xFF0F172A)).padding(horizontal = 14.dp, vertical = 7.dp)) {
        Text(title, fontSize = 12.sp, fontWeight = FontWeight.Black, color = color)
        Text(names, fontSize = 14.sp, color = Color.White, maxLines = 4, overflow = TextOverflow.Ellipsis)
    }
}

/** "#7 Player" */
private fun short(b: Batter) = (if (b.num.isNotEmpty()) "#${b.num} " else "") + b.name.ifBlank { "Player" }
