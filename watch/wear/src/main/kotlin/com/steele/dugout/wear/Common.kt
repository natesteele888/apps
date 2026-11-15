package com.steele.dugout.wear

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.MaterialTheme
import kotlinx.coroutines.delay

/** what both watch apps share: keep the screen on during a game, load the pitch log, and talk to the phone */
abstract class GameActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        PitchStore.load(this)
    }
    override fun onStart() { super.onStart(); PhoneLink.start(this) }
    override fun onStop() { PhoneLink.stop(); super.onStop() }
}

/** Walk-Up on the watch: the walk-up song remote. Works without Pitch Count. */
class WalkUpActivity : GameActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { WalkUpApp() } }
    }
}

/** Pitch Count on the watch: counts pitches even with no phone nearby, and works without Walk-Up. */
class PitchCountActivity : GameActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { PitchCountApp() } }
    }
}

val Green = Color(0xFF16A34A)
val Yellow = Color(0xFFEAB308)
val Red = Color(0xFFDC2626)
val Muted = Color(0xFF94A3B8)

@Composable
fun WalkUpApp() {
    var order by rememberSaveable { mutableStateOf(false) }
    if (order) OrderScreen(onDone = { order = false }) else BattingScreen(onOrder = { order = true })
    BackHandler(enabled = order) { order = false }
}

@Composable
fun PitchCountApp() {
    var pen by rememberSaveable { mutableStateOf(false) }
    if (pen) BullpenScreen(onDone = { pen = false }) else PitchingScreen(onBullpen = { pen = true })
    BackHandler(enabled = pen) { pen = false }
}

/** the clock, ticking every [ms] */
@Composable
fun now(ms: Long = 1000): Long {
    val t by produceState(System.currentTimeMillis()) { while (true) { delay(ms); value = System.currentTimeMillis() } }
    return t
}

/** one line on the phone and the speaker, and its color */
@Composable
fun linkLine(): Pair<String, Color> {
    val t = now()
    val st = PhoneLink.state.collectAsState().value
    return when {
        st == null || !PhoneLink.phoneOk(t) -> "Open Dugout on your phone" to Red
        !st.ready -> "Open Walk-Up in Dugout" to Yellow
        !st.speakerOn -> "No speaker" to Yellow
        else -> "● " + st.speakerName.ifBlank { "Speaker on" } to Green
    }
}
