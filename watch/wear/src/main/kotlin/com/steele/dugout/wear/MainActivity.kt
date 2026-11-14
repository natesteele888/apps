package com.steele.dugout.wear

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import kotlinx.coroutines.delay

/** Dugout on the watch: Batting (the walk-up song remote) and Pitching (the pitch counter). */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        PitchStore.load(this)
        setContent { MaterialTheme { DugoutApp() } }
    }

    override fun onStart() { super.onStart(); PhoneLink.start(this) }
    override fun onStop() { PhoneLink.stop(); super.onStop() }
}

val Green = Color(0xFF16A34A)
val Yellow = Color(0xFFEAB308)
val Red = Color(0xFFDC2626)
val Muted = Color(0xFF94A3B8)

@Composable
fun DugoutApp() {
    var screen by rememberSaveable { mutableStateOf("home") }
    when (screen) {
        "bat" -> BattingScreen(onOrder = { screen = "order" })
        "order" -> OrderScreen(onDone = { screen = "bat" })
        "pitch" -> PitchingScreen(onBullpen = { screen = "pen" })
        "pen" -> BullpenScreen(onDone = { screen = "pitch" })
        else -> HomeScreen(onBatting = { screen = "bat" }, onPitching = { screen = "pitch" })
    }
    BackHandler(enabled = screen != "home") {
        screen = when (screen) { "order" -> "bat"; "pen" -> "pitch"; else -> "home" }
    }
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

@Composable
fun HomeScreen(onBatting: () -> Unit, onPitching: () -> Unit) {
    val (line, color) = linkLine()
    Box(Modifier.fillMaxSize()) {
        TimeText()
        Column(
            Modifier.fillMaxSize().padding(horizontal = 18.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(14.dp))
            Chip(
                onClick = onBatting, modifier = Modifier.fillMaxWidth(),
                label = { Text("Batting", fontSize = 18.sp) },
                secondaryLabel = { Text("Walk-up songs") },
                colors = ChipDefaults.primaryChipColors(),
            )
            Spacer(Modifier.height(8.dp))
            Chip(
                onClick = onPitching, modifier = Modifier.fillMaxWidth(),
                label = { Text("Pitching", fontSize = 18.sp) },
                secondaryLabel = { Text("Pitch count") },
                colors = ChipDefaults.secondaryChipColors(),
            )
            Spacer(Modifier.height(8.dp))
            Text(line, color = color, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
    }
}
