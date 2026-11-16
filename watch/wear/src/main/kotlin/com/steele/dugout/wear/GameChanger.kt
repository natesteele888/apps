package com.steele.dugout.wear

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
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
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import com.steele.dugout.shared.Gc
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** GC Scores on the watch: your team's GameChanger scoreboard (live score, next game, recent finals). Works without Walk-Up or Pitch Count. */
class GameChangerActivity : ComponentActivity(), DataClient.OnDataChangedListener {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        GcStore.load(this)
        setContent { MaterialTheme { GcApp() } }
    }

    override fun onStart() {
        super.onStart()
        Wearable.getDataClient(this).addListener(this)
        GcStore.pullTeam(this)
    }

    override fun onStop() {
        Wearable.getDataClient(this).removeListener(this)
        super.onStop()
    }

    override fun onDataChanged(buf: DataEventBuffer) {
        val got = ArrayList<String>()
        for (ev in buf) if (ev.type == DataEvent.TYPE_CHANGED && ev.dataItem.uri.path == Gc.PATH_TEAM) ev.dataItem.data?.let { got.add(String(it, Charsets.UTF_8)) }
        got.lastOrNull()?.let { GcStore.setTeam(this, it) }
    }
}

/** What the watch last read from GameChanger, kept on the watch so the scores show at once (and with no signal). */
object GcStore {
    data class Snap(val teamId: String, val team: Gc.Team?, val games: List<Gc.Game>, val readAt: Long, val error: String?, val loading: Boolean)

    val snap = MutableStateFlow(Snap("", null, emptyList(), 0, null, false))
    val lines = MutableStateFlow<Map<String, Gc.Line>>(emptyMap())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var raw = Pair("", "")

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("gc", Context.MODE_PRIVATE)

    fun load(ctx: Context) {
        val p = prefs(ctx)
        val id = p.getString("team", "") ?: ""
        val team = p.getString("teamJson", null)?.let { Gc.parseTeam(it) }
        val games = p.getString("gamesJson", null)?.let { Gc.parseGames(it) } ?: emptyList()
        if (snap.value.teamId.isEmpty()) snap.value = Snap(id, team, games, p.getLong("readAt", 0), null, false)
    }

    /** the team the coach picked in Dugout on the phone (Watch › GameChanger team) */
    fun pullTeam(ctx: Context) {
        val app = ctx.applicationContext
        scope.launch {
            try {
                val buf = Wearable.getDataClient(app).getDataItems(Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(Gc.PATH_TEAM).build()).await()
                val ids = buf.mapNotNull { it.data?.let { d -> String(d, Charsets.UTF_8) } }
                buf.release()
                ids.lastOrNull()?.let { setTeam(app, it) }
            } catch (e: Exception) { /* no phone yet: keep the team the watch already has */ }
        }
    }

    fun setTeam(ctx: Context, input: String) {
        val id = Gc.teamId(input) ?: ""
        if (id == snap.value.teamId) return
        prefs(ctx).edit().putString("team", id).remove("teamJson").remove("gamesJson").putLong("readAt", 0).apply()
        lines.value = emptyMap()
        snap.value = Snap(id, null, emptyList(), 0, null, false)
        if (id.isNotEmpty()) refresh(ctx)
    }

    private suspend fun get(url: String): String = withContext(Dispatchers.IO) {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000; c.readTimeout = 15_000
            c.setRequestProperty("Accept", "application/json")
            c.setRequestProperty("User-Agent", "DugoutWatch/1.0 (LYBS coach app)")
            if (c.responseCode !in 200..299) throw IllegalStateException("GameChanger answered ${c.responseCode}")
            val bytes = c.inputStream.use { it.readBytes() }
            if (bytes.size > 2_000_000) throw IllegalStateException("too big")
            String(bytes, Charsets.UTF_8)
        } finally { c.disconnect() }
    }

    fun refresh(ctx: Context) {
        val id = snap.value.teamId
        if (!Gc.safeTeamId(id) || snap.value.loading) return
        val app = ctx.applicationContext
        snap.value = snap.value.copy(loading = true, error = null)
        scope.launch {
            try {
                val gamesJson = get(Gc.gamesUrl(id))
                val teamJson = try { get(Gc.teamUrl(id)) } catch (e: Exception) { raw.first }
                if (snap.value.teamId != id) return@launch
                raw = teamJson to gamesJson
                val now = System.currentTimeMillis()
                prefs(app).edit().putString("teamJson", teamJson).putString("gamesJson", gamesJson).putLong("readAt", now).apply()
                snap.value = Snap(id, Gc.parseTeam(teamJson) ?: snap.value.team, Gc.parseGames(gamesJson), now, null, false)
                Gc.board(snap.value.games, now).live?.let { line(it.id, force = true) }
            } catch (e: Exception) {
                snap.value = snap.value.copy(loading = false, error = "Can't reach GameChanger")
            }
        }
    }

    /** one game's runs by inning, plus R/H/E; a final never changes, so it's read once */
    fun line(gameId: String, force: Boolean = false) {
        if (!Gc.safeGameId(gameId) || (!force && lines.value.containsKey(gameId))) return
        scope.launch {
            try { Gc.parseLine(get(Gc.lineUrl(gameId)))?.let { lines.value = lines.value + (gameId to it) } } catch (e: Exception) { /* the score still shows */ }
        }
    }

}

private val DarkCard = Color(0xFF1E293B)
private fun resultColor(r: Char?) = when (r) { 'W' -> Color(0xFF15803D); 'L' -> Color(0xFFB91C1C); else -> Color(0xFF334155) }

private fun whenText(ms: Long, now: Long): String {
    val day = SimpleDateFormat("yyyyMMdd", Locale.US)
    val d = Date(ms)
    val time = SimpleDateFormat("h:mm a", Locale.getDefault()).format(d)
    return when (day.format(d)) {
        day.format(Date(now)) -> "Today $time"
        day.format(Date(now + 86_400_000L)) -> "Tomorrow $time"
        else -> SimpleDateFormat(if (ms - now in 0..6 * 86_400_000L) "EEE" else "EEE MMM d", Locale.getDefault()).format(d) + " $time"
    }
}

private fun dateText(ms: Long) = SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(ms))

private fun agoText(readAt: Long, now: Long): String {
    if (readAt == 0L) return "Not read yet"
    val m = (now - readAt) / 60_000
    return when { m < 1 -> "Updated just now"; m < 60 -> "Updated $m min ago"; m < 1440 -> "Updated ${m / 60} h ago"; else -> "Updated ${dateText(readAt)}" }
}

@Composable
fun GcApp() {
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val s = GcStore.snap.collectAsState().value
    val t = now(30_000)
    val board = Gc.board(s.games, t)
    // read again every 30 seconds during a game, otherwise every 15 minutes, while this screen is open
    LaunchedEffect(s.teamId, board.live?.id) {
        if (s.teamId.isEmpty()) return@LaunchedEffect
        if (t - s.readAt > Gc.refreshMs(board)) GcStore.refresh(ctx)
        while (true) { delay(Gc.refreshMs(board)); GcStore.refresh(ctx) }
    }
    val game = open?.let { id -> s.games.firstOrNull { it.id == id } }
    if (game != null) BackScreen(onBack = { open = null }) { GameScreen(game, onBack = { open = null }) }
    else Scoreboard(s, board, t, onOpen = { open = it })
}

@Composable
private fun Scoreboard(s: GcStore.Snap, b: Gc.Board, t: Long, onOpen: (String) -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val list = rememberScalingLazyListState()
    ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
        item {
            ListHeader {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(s.team?.name ?: "GameChanger", maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                    val sub = listOf(s.team?.season ?: "", s.team?.record?.let { if (it.isNotEmpty()) "($it)" else "" } ?: "").filter { it.isNotBlank() }.joinToString(" ")
                    if (sub.isNotEmpty()) Text(sub, fontSize = 11.sp, color = Muted)
                }
            }
        }
        if (s.teamId.isEmpty()) {
            item { Text("Pick your team in Dugout on your phone: Watch › GameChanger team.", color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center) }
            return@ScalingLazyColumn
        }
        if (s.games.isEmpty()) item {
            Text(if (s.loading) "Reading GameChanger…" else s.error ?: "No games on GameChanger yet.", color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
        b.live?.let { g -> item { LiveCard(g, onClick = { onOpen(g.id) }) } }
        if (b.live == null) b.next?.let { g ->
            item {
                Chip(
                    onClick = {}, modifier = Modifier.fillMaxWidth(),
                    label = { Text("Next: " + g.vs, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    secondaryLabel = { Text(whenText(g.startMs, t), maxLines = 1) },
                    colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF1D4ED8)),
                )
            }
        }
        if (b.recent.isNotEmpty()) item { ListHeader { Text("Recent") } }
        items(b.recent.take(12)) { g ->
            val off = Gc.phase(g, t) == Gc.Phase.OFF
            Chip(
                onClick = { if (!off) onOpen(g.id) }, modifier = Modifier.fillMaxWidth(),
                label = { Text(if (off) g.vs else "${g.result ?: '-'} ${g.us ?: "-"}-${g.them ?: "-"} ${g.vs}", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text(dateText(g.startMs) + if (off) " · " + g.status.replaceFirstChar { it.uppercase() } else "", maxLines = 1) },
                colors = ChipDefaults.chipColors(backgroundColor = if (off) DarkCard else resultColor(g.result)),
            )
        }
        val later = b.upcoming.drop(if (b.live == null) 1 else 0).take(5)
        if (later.isNotEmpty()) item { ListHeader { Text("Coming up") } }
        items(later) { g ->
            Chip(
                onClick = {}, modifier = Modifier.fillMaxWidth(),
                label = { Text(g.vs, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text(whenText(g.startMs, t), maxLines = 1) },
                colors = ChipDefaults.chipColors(backgroundColor = DarkCard),
            )
        }
        item {
            Chip(
                onClick = { GcStore.refresh(ctx) }, modifier = Modifier.fillMaxWidth(),
                label = { Text(if (s.loading) "Reading…" else "Refresh", maxLines = 1) },
                secondaryLabel = { Text(s.error ?: agoText(s.readAt, t), maxLines = 1) },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
    }
}

@Composable
private fun LiveCard(g: Gc.Game, onClick: () -> Unit) {
    val line = GcStore.lines.collectAsState().value[g.id]
    Chip(
        onClick = onClick, modifier = Modifier.fillMaxWidth(),
        label = {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("● LIVE" + if (g.liveStream) " · streaming" else "", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFFFCA5A5))
                Text("${g.us ?: 0} - ${g.them ?: 0}", fontSize = 30.sp, fontWeight = FontWeight.Black, color = Color.White)
                Text(g.vs, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                line?.let { val inn = maxOf(it.us.innings.size, it.them.innings.size); if (inn > 0) Text("Inning $inn", fontSize = 11.sp, color = Color(0xCCFFFFFF)) }
            }
        },
        colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF7F1D1D)),
        shape = RoundedCornerShape(24.dp),
    )
}

/** one game: the score, and the line score (runs by inning, then R H E) when GameChanger has it */
@Composable
private fun GameScreen(g: Gc.Game, onBack: () -> Unit) {
    LaunchedEffect(g.id) { GcStore.line(g.id, force = Gc.phase(g, System.currentTimeMillis()) == Gc.Phase.LIVE) }
    val line = GcStore.lines.collectAsState().value[g.id]
    val t = now(30_000)
    val list = rememberScalingLazyListState()
    ScalingLazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                val live = Gc.phase(g, t) == Gc.Phase.LIVE
                Text(if (live) "● LIVE" else "Final", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (live) Color(0xFFFCA5A5) else Muted)
                Text("${g.us ?: "-"} - ${g.them ?: "-"}", fontSize = 34.sp, fontWeight = FontWeight.Black, color = Color.White)
                Text(g.vs, fontSize = 14.sp, maxLines = 2, textAlign = TextAlign.Center)
                Text(dateText(g.startMs), fontSize = 11.sp, color = Muted)
            }
        }
        item {
            if (line == null) Text("Line score loading…", fontSize = 11.sp, color = Muted)
            else LineScore(line)
        }
        item { BackChip("All games", onClick = onBack) }
    }
}

@Composable
private fun LineScore(l: Gc.Line) {
    val n = maxOf(l.inningsPerGame, l.us.innings.size, l.them.innings.size).coerceAtMost(7) // fits a round watch; youth games are 6 or 7
    @Composable fun cell(s: String, w: Int = 13, bold: Boolean = false, c: Color = Color.White) =
        Text(s, modifier = Modifier.width(w.dp), fontSize = 10.sp, fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, color = c, maxLines = 1)
    @Composable fun row(label: String, s: Gc.Side?, head: Boolean = false) = Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        cell(label, 26, bold = true, c = if (head) Muted else Color.White)
        for (i in 0 until n) cell(if (head) "${i + 1}" else s?.innings?.getOrNull(i)?.toString() ?: (if (i < (s?.innings?.size ?: 0)) "x" else ""), c = if (head) Muted else Color.White)
        cell(if (head) "R" else s?.r?.toString() ?: "", 16, bold = true, c = if (head) Muted else Color.White)
        cell(if (head) "H" else s?.h?.toString() ?: "", 16, c = if (head) Muted else Color.White)
        cell(if (head) "E" else s?.e?.toString() ?: "", 16, c = if (head) Muted else Color.White)
    }
    Column(Modifier.clip(RoundedCornerShape(10.dp)).background(DarkCard).padding(horizontal = 4.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        row("", null, head = true)
        row("Us", l.us)
        row("Opp", l.them)
    }
}
