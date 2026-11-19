package com.steele.dugout.wear

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.SwipeToDismissBox
import androidx.wear.compose.material.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.MaterialTheme
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * What both watch apps share: keep the screen on during a game, load the pitch log, talk to the phone, and leave the
 * way back on the watch face while the app is behind it (see Ongoing.kt).
 */
abstract class GameActivity : ComponentActivity() {
    /** this app's icon on the watch face while it's behind it */
    abstract val ongoingId: Int
    private val askNotes = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        PitchStore.load(this)
        Ongoing.askOnce(this) { askNotes.launch(it) }
    }
    override fun onStart() { super.onStart(); PhoneLink.start(this); Ongoing.hide(this, ongoingId) }
    override fun onStop() {
        PhoneLink.stop()
        // behind the watch face (home button, palm): leave the way back. Swiped away: done with it.
        if (isFinishing) Ongoing.hide(this, ongoingId) else if (!isChangingConfigurations) Ongoing.show(this, ongoingId)
        super.onStop()
    }
    override fun onDestroy() { if (isFinishing) Ongoing.hide(this, ongoingId); super.onDestroy() }
}

/** Walk-Up on the watch: the walk-up song remote. Works without Pitch Count. */
class WalkUpActivity : GameActivity() {
    override val ongoingId = Ongoing.WALKUP
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { WalkUpApp() } }
    }
}

/** Pitch Count on the watch: counts pitches even with no phone nearby, and works without Walk-Up. */
class PitchCountActivity : GameActivity() {
    override val ongoingId = Ongoing.PITCH
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { PitchCountApp() } }
    }
}

/** Scores on the watch: today's MAC League scores, the same ones LYBS Select shows. Works without the other two apps. */
class ScoresActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ScoresStore.load(this)
        setContent { MaterialTheme { ScoresScreen() } }
        // While Scores is on screen, look for new scores every minute; stop when it's put away.
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) { ScoresStore.refresh(); delay(60_000) }
            }
        }
    }
}

val Green = Color(0xFF16A34A)
val Yellow = Color(0xFFEAB308)
val Red = Color(0xFFDC2626)
val Muted = Color(0xFF94A3B8)

@Composable
fun WalkUpApp() {
    var order by rememberSaveable { mutableStateOf(false) }
    var sounds by rememberSaveable { mutableStateOf(false) }
    var swapFor by rememberSaveable { mutableStateOf<String?>(null) }
    // the Lineup card (LineupCard.kt), opened from the batting order, and the inning it showed last
    var card by rememberSaveable { mutableStateOf(false) }
    var cardInning by rememberSaveable { mutableStateOf(0) }
    val out = swapFor
    when {
        out != null -> BackScreen(onBack = { swapFor = null }) { BenchScreen(out, onDone = { swapFor = null }) }
        card -> BackScreen(onBack = { card = false }) { LineupCardScreen(cardInning, onInning = { cardInning = it }, onDone = { card = false }) }
        order -> BackScreen(onBack = { order = false }) { OrderScreen(onDone = { order = false }, onSwap = { swapFor = it }, onCard = { card = true }) }
        sounds -> BackScreen(onBack = { sounds = false }) { SoundsScreen(onDone = { sounds = false }) }
        else -> BattingScreen(onOrder = { order = true }, onSounds = { sounds = true })
    }
}

@Composable
fun PitchCountApp() {
    var pen by rememberSaveable { mutableStateOf(false) }
    if (pen) BackScreen(onBack = { pen = false }) { BullpenScreen(onDone = { pen = false }) } else PitchingScreen(onBullpen = { pen = true })
}

/**
 * Every screen past an app's first one goes back the same three ways: swipe right, the watch's back button, or the
 * Back chip at the end of its list. (The theme turns off the watch's own swipe-to-close, so a swipe between batters can
 * never close Walk-Up; this puts swipe-back on the inner screens, where nothing else uses a sideways swipe.)
 */
@Composable
fun BackScreen(onBack: () -> Unit, content: @Composable () -> Unit) {
    val back by rememberUpdatedState(onBack)
    BackHandler { back() }
    SwipeToDismissBox(onDismissed = { back() }) { isBackground ->
        if (isBackground) Box(Modifier.fillMaxSize().background(Color.Black)) else content()
    }
}

/** the always-there way out at the bottom of an inner screen, for watches with no back button */
@Composable
fun BackChip(label: String = "Back", onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        label = { Text("‹ $label", maxLines = 1) },
        colors = ChipDefaults.secondaryChipColors(),
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
    )
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
