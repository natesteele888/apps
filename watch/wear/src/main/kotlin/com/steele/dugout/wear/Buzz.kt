package com.steele.dugout.wear

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** Watch vibrations, so the coach can feel what happened without looking. */
object Buzz {
    private fun vib(ctx: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        else @Suppress("DEPRECATION") (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)

    fun pattern(ctx: Context, vararg ms: Long) {
        val v = vib(ctx) ?: return
        val timings = longArrayOf(0) + ms
        try { v.vibrate(VibrationEffect.createWaveform(timings, -1)) } catch (e: Exception) { /* no vibration */ }
    }

    fun tick(ctx: Context) = pattern(ctx, 25)
    /** the song started */
    fun started(ctx: Context) = pattern(ctx, 200, 100, 200)
    /** after each pitch: a tick, one long buzz on reaching 10 left, two short from 5 left, three at the limit */
    fun pitch(ctx: Context, left: Int, before: Int, limit: Int) {
        when {
            limit == 0 -> tick(ctx)
            left <= 0 -> pattern(ctx, 300, 150, 300, 150, 300)
            left <= 5 -> pattern(ctx, 120, 90, 120)
            left <= 10 && before > 10 -> pattern(ctx, 400)
            else -> tick(ctx)
        }
    }
}
