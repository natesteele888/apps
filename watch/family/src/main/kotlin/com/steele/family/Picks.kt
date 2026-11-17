package com.steele.family

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Text
import com.steele.family.core.PicksCore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Gameday Picks on the watch: this week's NFL games; tap the left half for the away team, the right half for home. */
class PicksActivity : FamilyActivity(every = 60_000) {
    override val appName = "Gameday Picks"
    override val phoneApp = "Gameday Picks › watch (under your name)"
    @Composable override fun Screen() = PicksApp()
}

private sealed class Load { object Wait : Load(); object Off : Load(); data class Ok(val week: PicksCore.Week) : Load() }

/** why picks can't be saved from this watch yet */
private enum class Save { OK, SAVING, NOT_VOUCHED, BLOCKED, OFFLINE }

@Composable
fun PicksApp() {
    val ctx = LocalContext.current
    val st by Link.state.collectAsState()
    val phone = remember(st.fields["gp"]) { PicksCore.parsePhone(st.fields["gp"]) }
    var load by remember { mutableStateOf<Load>(Load.Wait) }
    var picks by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var save by remember { mutableStateOf(Save.OK) }
    var rev by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val week = (load as? Load.Ok)?.week

    // the games, every two minutes while open (scores move on game day)
    LaunchedEffect(Unit) {
        while (true) {
            val w = withContext(Dispatchers.IO) {
                try { Link.http("GET", PicksCore.SCOREBOARD).let { (c, b) -> if (c == 200) PicksCore.parseWeek(b) else null } } catch (e: Exception) { null }
            }
            load = if (w != null) Load.Ok(w) else if (load is Load.Ok) load else Load.Off
            delay(120_000)
        }
    }
    // this player's saved picks for the week
    // (tried again at each check of the link while the phone hasn't okayed this watch yet)
    val retry = if (save == Save.NOT_VOUCHED || save == Save.OFFLINE) st.checkedAt else 0L
    LaunchedEffect(week?.key, phone?.uid, retry) {
        val uid = phone?.uid ?: return@LaunchedEffect
        val key = week?.key ?: return@LaunchedEffect
        withContext(Dispatchers.IO) {
            try {
                val tok = Link.picksToken()
                if (tok == null) { save = Save.BLOCKED; return@withContext }
                val (c, b) = Link.firestore("GET", "gp_picks/${uid}_$key", token = tok.first)
                when (c) {
                    200 -> { if (rev == 0 || save != Save.OK) picks = PicksCore.parsePicksDoc(b); save = Save.OK }
                    404 -> save = Save.OK
                    403 -> { save = Save.NOT_VOUCHED; Link.sync() }
                }
            } catch (e: Exception) { save = Save.OFFLINE }
        }
    }
    // a pick goes up a moment after the last tap
    LaunchedEffect(rev) {
        if (rev == 0) return@LaunchedEffect
        delay(800)
        val uid = phone?.uid ?: return@LaunchedEffect
        val key = week?.key ?: return@LaunchedEffect
        save = Save.SAVING
        save = withContext(Dispatchers.IO) {
            try {
                val tok = Link.picksToken() ?: return@withContext Save.BLOCKED
                val (c, _) = Link.firestore("PATCH", "gp_picks/${uid}_$key", PicksCore.picksDocBody(uid, key, picks, Instant.now()), tok.first)
                when (c) { in 200..299 -> Save.OK; 403 -> Save.NOT_VOUCHED; else -> Save.OFFLINE }
            } catch (e: Exception) { Save.OFFLINE }
        }
        if (save == Save.NOT_VOUCHED) scope.launch { Link.sync() }   // sends this watch's id so the phone can vouch for it
    }

    val t = now(30_000)
    ScalingLazyColumn(Modifier.fillMaxSize()) {
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(week?.label ?: "Gameday Picks", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                if (week != null && phone?.uid != null) {
                    val (w, l) = PicksCore.record(week, picks)
                    Text("$w-$l this week" + when (save) { Save.SAVING -> " · saving…"; Save.OFFLINE -> " · not saved yet"; else -> "" }, fontSize = 11.sp, color = Muted)
                }
            }
        }
        when {
            phone?.uid == null -> item { Note("Open Gameday Picks on your phone and sign in, then your picks show here.") }
            save == Save.NOT_VOUCHED -> item { Note("Almost there: open Gameday Picks on your phone so it can okay this watch.") }
            save == Save.BLOCKED -> item { Note("Picks from the watch aren't switched on yet. Ask Dad.") }
        }
        when (val l = load) {
            Load.Wait -> item { Note("Getting this week's games…") }
            Load.Off -> item { Note("Can't reach the games right now.") }
            is Load.Ok -> {
                if (l.week.games.isEmpty()) item { Note("No games this week.") }
                else item { Text("Tap a side to pick", fontSize = 10.sp, color = Muted) }
                items(l.week.games, key = { it.id }) { g ->
                    val canPick = phone?.uid != null && save != Save.NOT_VOUCHED && save != Save.BLOCKED
                    GameRow(g, picks[g.id], Instant.ofEpochMilli(t), canPick) { abbr ->
                        picks = PicksCore.toggle(picks, g.id, abbr); rev++; Buzz.tick(ctx)
                    }
                }
            }
        }
        if (phone != null && phone.board.isNotEmpty()) {
            item { Text("Standings", fontSize = 12.sp, color = Muted, modifier = Modifier.padding(top = 8.dp)) }
            items(phone.board) { r ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(r.name, fontSize = 13.sp, fontWeight = if (r.me) FontWeight.Bold else FontWeight.Normal, color = if (r.me) Yellow else Color.White)
                    Text("${r.w}-${r.l}", fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
private fun Note(t: String) = Text(t, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(8.dp))

private val TIME = DateTimeFormatter.ofPattern("EEE h:mm a")

/** one game: away on the left, home on the right; the picked side lights up in the team's colour */
@Composable
private fun GameRow(g: PicksCore.Game, pick: String?, now: Instant, canPick: Boolean, onPick: (String) -> Unit) {
    val locked = g.locked(now)
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth().height(58.dp).clip(RoundedCornerShape(16.dp)).background(Card)) {
            listOf(g.away, g.home).forEach { tm ->
                val picked = pick == tm.abbr
                val right = g.done && g.winner == tm.abbr
                val color = Color(0xFF000000 or tm.color)
                Box(
                    Modifier.weight(1f).fillMaxHeight()
                        .background(if (picked) color.copy(alpha = 0.85f) else Color.Transparent)
                        .then(if (picked) Modifier.border(2.dp, if (!g.done) Color.White else if (right) Green else Red, RoundedCornerShape(16.dp)) else Modifier)
                        .clickable(enabled = canPick && !locked) { onPick(tm.abbr) },
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(tm.abbr, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = if (g.done && g.winner != tm.abbr) Muted else Color.White)
                        Text(if (g.state != "pre" && tm.score != null) "${tm.score}" else tm.name, fontSize = 10.sp, maxLines = 1, color = Color.White.copy(alpha = 0.8f))
                    }
                }
            }
        }
        Text(
            when {
                g.state == "pre" && !locked -> g.date.atZone(ZoneId.systemDefault()).format(TIME) + if (pick == null) "" else "  ·  you: $pick"
                g.done && pick != null -> (if (g.winner == pick) "✓ " else "✗ ") + g.detail
                else -> g.detail
            },
            fontSize = 10.sp, color = Muted, modifier = Modifier.padding(top = 2.dp, bottom = 4.dp),
        )
    }
}
