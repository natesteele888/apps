package com.steele.family

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.SwipeToDismissBox
import androidx.wear.compose.material.Text
import com.steele.family.core.WatchLog
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

val Green = Color(0xFF16A34A)
val Yellow = Color(0xFFEAB308)
val Red = Color(0xFFDC2626)
val Muted = Color(0xFF94A3B8)
val Card = Color(0xFF1E293B)

/**
 * What every family app on the watch does: load the link, check it every [every] ms while on screen (and send the
 * watch's log), and show the linking code until the watch is linked to a phone.
 */
abstract class FamilyActivity(private val every: Long = 20_000) : ComponentActivity() {
    abstract val appName: String
    abstract val phoneApp: String
    @Composable abstract fun Screen()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Link.load(this)
        setContent { MaterialTheme { LinkGate(appName, phoneApp) { Screen() } } }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) {
                    Link.sync()
                    delay(if (Link.state.value.linked) every else 3_000)
                }
            }
        }
    }
    /** a change made on the watch goes up straight away, not at the next check */
    fun syncSoon() { lifecycleScope.launch { Link.sync() } }
}

/** until this watch is linked: the code to type on the phone */
@Composable
fun LinkGate(appName: String, phoneApp: String, content: @Composable () -> Unit) {
    val st by Link.state.collectAsState()
    if (st.linked) { content(); return }
    Column(
        Modifier.fillMaxSize().padding(horizontal = 22.dp, vertical = 26.dp),
        verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Link to your phone", fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(st.code?.let { WatchLog.showCode(it) } ?: "…", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Yellow,
            textAlign = TextAlign.Center, modifier = Modifier.padding(vertical = 6.dp))
        Text(
            when {
                st.noRules -> "The watch link isn't switched on yet. Ask Dad."
                st.offline -> "No connection. Keep your phone close."
                else -> "On your phone, open $phoneApp and type this code."
            },
            fontSize = 12.sp, color = Muted, textAlign = TextAlign.Center,
        )
    }
}

/** an inner screen: swipe right, the back button, or a Back chip goes back */
@Composable
fun BackScreen(onBack: () -> Unit, content: @Composable () -> Unit) {
    val back by rememberUpdatedState(onBack)
    BackHandler { back() }
    SwipeToDismissBox(onDismissed = { back() }) { bg -> if (bg) Box(Modifier.fillMaxSize().background(Color.Black)) else content() }
}

@Composable
fun BackChip(label: String = "Back", onClick: () -> Unit) {
    Chip(onClick = onClick, label = { Text("‹ $label", maxLines = 1) }, colors = ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
}

/** the clock, ticking every [ms] */
@Composable
fun now(ms: Long = 1000): Long {
    val t by produceState(System.currentTimeMillis()) { while (true) { delay(ms); value = System.currentTimeMillis() } }
    return t
}

/** a small grey line on how fresh the phone's copy is */
@Composable
fun freshLine(): String {
    val st by Link.state.collectAsState()
    return when {
        st.offline && st.checkedAt > 0 -> "No connection · showing what the watch has"
        st.offline -> "No connection. Keep your phone close."
        else -> ""
    }
}

/** watch vibrations */
object Buzz {
    private fun vib(ctx: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        else @Suppress("DEPRECATION") (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)

    fun pattern(ctx: Context, vararg ms: Long) {
        val v = vib(ctx) ?: return
        val timings = longArrayOf(0) + ms
        try {
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(timings, -1))
            else @Suppress("DEPRECATION") v.vibrate(timings, -1)
        } catch (e: Exception) { }
    }
    fun tick(ctx: Context) = pattern(ctx, 25)
    fun go(ctx: Context) = pattern(ctx, 300)
    fun done(ctx: Context) = pattern(ctx, 150, 100, 150, 100, 400)
}

fun todayKey(): String = java.time.LocalDate.now().toString()

/** keeps the screen awake while a timer runs */
@Composable
fun KeepScreenOn(on: Boolean) {
    val view = LocalView.current
    DisposableEffect(on) {
        view.keepScreenOn = on
        onDispose { view.keepScreenOn = false }
    }
}
