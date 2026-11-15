package com.steele.dugout

import android.graphics.Color
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Android 15 draws every app edge to edge, under the status bar and the navigation bar. This keeps Dugout's screens
 * clear of them (and of a camera cutout and the keyboard) by padding [root], whose background shows behind the bars.
 * Call it in onCreate, before setContentView.
 */
fun ComponentActivity.fitSystemBars(root: View, barColor: Int) {
    enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT)) // light icons on our dark bars
    root.setBackgroundColor(barColor)
    val types = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
        val b = insets.getInsets(types)
        v.setPadding(b.left, b.top, b.right, b.bottom)
        WindowInsetsCompat.CONSUMED
    }
}
