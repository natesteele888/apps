package com.steele.family

import android.content.Context
import androidx.compose.foundation.background
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.Text
import com.steele.family.core.CubeCore
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

private val Cyan = Color(0xFF22D3EE)

/** Cube Clock on the watch: tap, 3-2-1, solve, tap to stop. Every solve goes to Cube Clock on the phone. */
class CubeActivity : FamilyActivity() {
    override val appName = "Cube Clock"
    override val phoneApp = "Cube Clock › Statistics › Your watch"
    @Composable override fun Screen() = CubeApp(onChange = ::syncSoon)
}

/** the watch's own recent solves per puzzle, so its PB and averages show straight away */
private object Solves {
    private const val KEEP = 100
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("cube", Context.MODE_PRIVATE)
    fun list(ctx: Context, puz: String): List<CubeCore.Solve> = try {
        val a = JSONArray(prefs(ctx).getString("s_$puz", "[]"))
        (0 until a.length()).map { a.getJSONObject(it) }.map { CubeCore.Solve(it.getLong("t"), it.optInt("p"), it.optLong("d")) }
    } catch (e: Exception) { emptyList() }
    fun add(ctx: Context, puz: String, s: CubeCore.Solve) {
        val all = (list(ctx, puz) + s).takeLast(KEEP)
        val a = JSONArray(); all.forEach { a.put(JSONObject().put("t", it.t).put("p", it.p).put("d", it.d)) }
        prefs(ctx).edit().putString("s_$puz", a.toString()).apply()
    }
    fun puzzle(ctx: Context): String? = prefs(ctx).getString("puz", null)
    fun setPuzzle(ctx: Context, id: String) = prefs(ctx).edit().putString("puz", id).apply()
}

private enum class Phase { READY, COUNT, RUN, DONE }

@Composable
fun CubeApp(onChange: () -> Unit) {
    val ctx = LocalContext.current
    val st by Link.state.collectAsState()
    val phone = remember(st.fields["cc"]) { CubeCore.parsePhone(st.fields["cc"]) }
    var puzId by rememberSaveable { mutableStateOf(Solves.puzzle(ctx) ?: phone?.puz ?: "333") }
    val puz = CubeCore.puzzle(puzId)
    var rev by remember { mutableIntStateOf(0) }
    val mine = remember(puzId, rev) { Solves.list(ctx, puzId) }
    var scramble by rememberSaveable(puzId) { mutableStateOf(CubeCore.scramble(puz)) }
    var phase by rememberSaveable { mutableStateOf(Phase.READY) }
    var mark by rememberSaveable { mutableLongStateOf(0L) }      // countdown start, then solve start
    var time by rememberSaveable { mutableLongStateOf(0L) }
    var pen by rememberSaveable { mutableIntStateOf(0) }         // 0, 2000 (+2) or -1 (DNF)
    var picking by rememberSaveable { mutableStateOf(false) }
    KeepScreenOn(phase == Phase.COUNT || phase == Phase.RUN)

    /** the solve on screen is kept: on the watch, and in the log for the phone */
    fun commit() {
        if (phase != Phase.DONE) return
        val s = CubeCore.Solve(time, pen, System.currentTimeMillis())
        Solves.add(ctx, puzId, s)
        Link.add("cc", mapOf("puz" to puzId, "t" to time, "p" to pen, "s" to scramble))
        onChange()
        rev++; pen = 0; phase = Phase.READY
        scramble = CubeCore.scramble(puz)
    }

    if (picking) {
        BackScreen(onBack = { picking = false }) {
            ScalingLazyColumn(Modifier.fillMaxSize()) {
                item { ListHeader { Text("Puzzle") } }
                items(CubeCore.PUZZLES) { p ->
                    Chip(onClick = { commit(); puzId = p.id; Solves.setPuzzle(ctx, p.id); picking = false },
                        label = { Text(p.name) }, colors = if (p.id == puzId) ChipDefaults.primaryChipColors(backgroundColor = Cyan.copy(alpha = 0.5f)) else ChipDefaults.secondaryChipColors(),
                        modifier = Modifier.fillMaxWidth())
                }
            }
        }
        return
    }

    val t = now(if (phase == Phase.RUN) 33 else 250)
    // the 3-2-1, then go
    LaunchedEffect(phase, mark) {
        if (phase == Phase.COUNT) {
            for (i in 0 until 3) { Buzz.tick(ctx); delay(1000) }
            Buzz.go(ctx); mark = System.currentTimeMillis(); phase = Phase.RUN
        }
        if (phase == Phase.DONE) { delay(15_000); commit() }
    }

    fun tapScreen() {
        when (phase) {
            Phase.READY -> { mark = System.currentTimeMillis(); phase = Phase.COUNT }
            Phase.COUNT -> phase = Phase.READY
            Phase.RUN -> { time = System.currentTimeMillis() - mark; pen = 0; phase = Phase.DONE; Buzz.done(ctx) }
            Phase.DONE -> { commit(); mark = System.currentTimeMillis(); phase = Phase.COUNT }
        }
    }

    val bg = when (phase) { Phase.COUNT -> Yellow.copy(alpha = 0.25f); Phase.RUN -> Green.copy(alpha = 0.22f); else -> Color.Black }
    Box(Modifier.fillMaxSize().background(bg).clickable { tapScreen() }, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(horizontal = 24.dp)) {
            when (phase) {
                Phase.READY -> {
                    Text(puz.name + " ▾", fontSize = 13.sp, color = Cyan, modifier = Modifier.clickable { picking = true }.padding(4.dp))
                    Text(scramble, fontSize = if (puz.kind == "mega") 9.sp else if (puz.n >= 4) 10.sp else 13.sp, fontFamily = FontFamily.Monospace,
                        textAlign = TextAlign.Center, lineHeight = if (puz.kind == "mega") 11.sp else 16.sp)
                    Text("Tap to start", fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp))
                    Stats(mine, phone?.stats?.get(puzId))
                }
                Phase.COUNT -> {
                    val left = 3 - ((t - mark) / 1000).toInt().coerceIn(0, 2)
                    Text("$left", fontSize = 64.sp, fontWeight = FontWeight.Bold)
                    Text("Tap to cancel", fontSize = 11.sp, color = Muted)
                }
                Phase.RUN -> {
                    Text(CubeCore.fmt((t - mark).coerceAtLeast(0)), fontSize = 44.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    Text("Tap to stop", fontSize = 11.sp, color = Muted)
                }
                Phase.DONE -> {
                    val shown = CubeCore.Solve(time, pen, 0)
                    val isPb = shown.eff != null && (CubeCore.best(mine) == null || shown.eff!! < CubeCore.best(mine)!!)
                    if (isPb) Text("🏆 New best!", fontSize = 13.sp, color = Yellow)
                    Text(if (pen == -1) "DNF" else CubeCore.fmt(shown.eff) + if (pen > 0) "+" else "", fontSize = 40.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        CompactChip(onClick = { pen = if (pen == 2000) 0 else 2000 }, label = { Text("+2") },
                            colors = if (pen == 2000) ChipDefaults.primaryChipColors(backgroundColor = Yellow.copy(alpha = 0.6f)) else ChipDefaults.secondaryChipColors())
                        CompactChip(onClick = { pen = if (pen == -1) 0 else -1 }, label = { Text("DNF") },
                            colors = if (pen == -1) ChipDefaults.primaryChipColors(backgroundColor = Red.copy(alpha = 0.6f)) else ChipDefaults.secondaryChipColors())
                    }
                    Text("Tap for the next one", fontSize = 11.sp, color = Muted)
                }
            }
        }
    }
}

/** best and average of 5 from this watch, or the phone's when the phone has more */
@Composable
private fun Stats(mine: List<CubeCore.Solve>, phone: CubeCore.PhoneStats?) {
    val best = listOfNotNull(CubeCore.best(mine), phone?.best).minOrNull()
    val ao5 = CubeCore.lastAvg(mine, 5) ?: phone?.ao5
    if (best == null && ao5 == null) return
    Text(listOfNotNull(best?.let { "PB " + CubeCore.fmt(it) }, ao5?.let { "ao5 " + CubeCore.fmt(it) }).joinToString("  ·  "),
        fontSize = 12.sp, color = Muted, textAlign = TextAlign.Center)
}
