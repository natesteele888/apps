package com.steele.dugout

import android.view.View
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Keeps Dugout's screens below the status bar and above the navigation bar.
 *
 * Android 15 draws apps edge to edge, under the bars. The Dugout theme opts out of that on Android 15 (values-v35),
 * so the system itself lays each screen out between the bars, painted [barColor]. As a safety net, any bar, cutout
 * or keyboard space the system still hands the screen is padded off [root], so nothing ends up under a bar either way.
 * Call it in onCreate, before setContentView.
 */
@Suppress("DEPRECATION") // bar colors still apply on Android 15 while the theme opts out of edge to edge
fun ComponentActivity.fitSystemBars(root: View, barColor: Int) {
    WindowCompat.setDecorFitsSystemWindows(window, true)
    window.statusBarColor = barColor
    window.navigationBarColor = barColor
    root.setBackgroundColor(barColor)
    val types = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
        val b = insets.getInsets(types)
        v.setPadding(b.left, b.top, b.right, b.bottom)
        WindowInsetsCompat.CONSUMED
    }
}
