package com.steele.dugout

import android.os.Bundle
import androidx.activity.ComponentActivity

/**
 * Receives the installer's answer for an update (not exported, so only Dugout's own install session can reach it):
 * shows Android's confirm screen or the result, then closes.
 */
class UpdateStatusActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Updater.onStatus(this, intent)
        finish()
    }
}
