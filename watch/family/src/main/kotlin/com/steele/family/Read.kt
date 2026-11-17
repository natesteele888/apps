package com.steele.family

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Text
import com.steele.family.core.WatchLog
import org.json.JSONObject

private val Teal = Color(0xFF14B8A6)

/** Read 20 on the watch: a reading timer. The minutes go into the reader's log on the phone. */
class ReadActivity : FamilyActivity() {
    override val appName = "Read 20"
    override val phoneApp = "Read 20 › Settings › Watch"
    @Composable override fun Screen() = ReadApp(onChange = ::syncSoon)
}

/** the phone's summary for the reader the watch times for ("r20" field) */
private data class Reader(val name: String, val goal: Int, val d: String, val today: Int, val streak: Int, val at: Long)

private fun parseReader(json: String?): Reader? = try {
    val o = JSONObject(json ?: "")
    Reader(o.optString("name").take(24), o.optInt("goal", 20).coerceIn(1, 180), o.optString("d"), o.optInt("today", 0), o.optInt("streak", 0), o.optLong("at", 0))
} catch (e: Exception) { null }

/** the session in progress, kept on the watch so it survives leaving the app: when it (re)started, and the time banked before */
private class Session(ctx: Context) {
    private val p = ctx.getSharedPreferences("read", Context.MODE_PRIVATE)
    var start: Long get() = p.getLong("start", 0L); set(v) = p.edit().putLong("start", v).apply()
    var banked: Long get() = p.getLong("banked", 0L); set(v) = p.edit().putLong("banked", v).apply()
    var day: String get() = p.getString("day", "") ?: ""; set(v) = p.edit().putString("day", v).apply()
    fun total(now: Long) = banked + if (start > 0) now - start else 0
    fun clear() = p.edit().clear().apply()
}

@Composable
fun ReadApp(onChange: () -> Unit) {
    val ctx = LocalContext.current
    val st by Link.state.collectAsState()
    val r = remember(st.fields["r20"]) { parseReader(st.fields["r20"]) }
    val ses = remember { Session(ctx) }
    var rev by remember { mutableIntStateOf(0) }   // bumps when the session starts, pauses or ends
    var note by remember { mutableStateOf("") }
    val today = todayKey()
    val goal = r?.goal ?: 20
    // minutes the phone already counts for today, plus watch sessions it hasn't taken yet
    val fromWatch = remember(st.logRev, r?.at, today) {
        WatchLog.entries(Link.log(), "r20").filter { it.optString("d") == today && it.optLong("at") > (r?.at ?: 0L) }.sumOf { it.optInt("min") }
    }
    val before = (if (r?.d == today) r.today else 0) + fromWatch
    val running = remember(rev) { ses.start > 0 }
    val t = now(if (running) 500 else 5_000)
    val total = ses.total(t)
    val mins = (total / 60_000).toInt()

    // a buzz the moment today's goal is reached
    var buzzed by remember { mutableStateOf(before >= goal) }
    LaunchedEffect(before + mins >= goal) { if (before + mins >= goal && !buzzed) { buzzed = true; if (running) Buzz.done(ctx) } }

    fun startPause() {
        val n = System.currentTimeMillis()
        if (ses.start > 0) { ses.banked = ses.total(n); ses.start = 0; Buzz.tick(ctx) }
        else { if (ses.day != today) { ses.banked = 0; ses.day = today }; ses.start = n; Buzz.go(ctx) }
        note = ""; rev++
    }
    fun finish() {
        val m = Math.round(ses.total(System.currentTimeMillis()) / 60_000.0).toInt()
        if (m >= 1) {
            Link.add("r20", mapOf("d" to ses.day.ifBlank { today }, "min" to m.coerceAtMost(180), "s" to (ses.total(System.currentTimeMillis()) / 1000)))
            note = "Saved $m min"; Buzz.done(ctx); onChange()
        } else note = "Under a minute, not saved"
        ses.clear(); rev++
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(progress = ((before * 60_000L + total) / (goal * 60_000f)).coerceIn(0f, 1f),
            modifier = Modifier.fillMaxSize().padding(4.dp), indicatorColor = Teal, strokeWidth = 8.dp)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.padding(horizontal = 26.dp)) {
            Text(if (r?.name.isNullOrBlank()) "Read 20" else "${r!!.name} is reading", fontSize = 12.sp, color = Teal)
            val sec = (total / 1000).toInt()
            Text("${sec / 60}:${(sec % 60).toString().padStart(2, '0')}", fontSize = 40.sp, fontWeight = FontWeight.Bold)
            Text(if (before + mins >= goal) "Goal done! ${before + mins} min today" else "${before + mins} of $goal min today",
                fontSize = 12.sp, color = if (before + mins >= goal) Green else Muted, textAlign = TextAlign.Center)
            if ((r?.streak ?: 0) > 0) Text("🔥 ${r!!.streak} day streak", fontSize = 11.sp, color = Muted)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                CompactChip(onClick = ::startPause, label = { Text(if (running) "Pause" else if (total > 0) "Resume" else "Start") },
                    colors = ChipDefaults.primaryChipColors(backgroundColor = Teal))
                if (total > 0) CompactChip(onClick = ::finish, label = { Text("Finish") }, colors = ChipDefaults.secondaryChipColors())
            }
            if (note.isNotBlank()) Text(note, fontSize = 11.sp, color = Muted)
            if (r == null && st.checkedAt > 0) Text("Open Read 20 on the phone once to see your goal.", fontSize = 10.sp, color = Muted, textAlign = TextAlign.Center)
        }
    }
}
