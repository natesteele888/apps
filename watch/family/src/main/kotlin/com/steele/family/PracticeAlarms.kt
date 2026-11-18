package com.steele.family

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.steele.family.core.PracticeCore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Practice Clock's buzzes with the watch screen off: one exact alarm at every block or station change still to come
 * (from [PracticeCore.changes]), each waking [PracticeBuzzReceiver], which buzzes. Set again whenever the phone's
 * practice changes and when Practice Clock opens on the watch; all cancelled while practice is paused, holding, done or
 * not running. While a practice is going, a quiet check every two minutes reads the link again, so a pause or skip on
 * the phone moves the buzzes even when nobody looks at the watch.
 */
object PracticeAlarms {
    private const val MAX = 60            // alarms set at once (request codes 0..59); the next check sets more
    private const val CHECK = 1000        // the request code of the quiet check
    private const val CHECK_EVERY = 2 * 60_000L
    private const val STALE = 4 * 3_600_000L   // a practice the phone hasn't touched in 4 hours is left alone

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("practice", Context.MODE_PRIVATE)
    private fun intent(ctx: Context, at: Long = 0L, last: Boolean = false, check: Boolean = false) =
        Intent(ctx, PracticeBuzzReceiver::class.java).putExtra("at", at).putExtra("last", last).putExtra("check", check)
    private fun pending(ctx: Context, code: Int, i: Intent, flags: Int) =
        PendingIntent.getBroadcast(ctx, code, i, flags or PendingIntent.FLAG_IMMUTABLE)

    /** cancels every alarm set before, then sets one for each change still to come in [p] (none when null) */
    fun schedule(ctx: Context, p: PracticeCore.Practice?, now: Long = System.currentTimeMillis()) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pr = prefs(ctx)
        for (code in 0 until pr.getInt("n", MAX).coerceIn(0, MAX)) cancel(ctx, am, code)
        cancel(ctx, am, CHECK)
        val changes = if (p == null) emptyList() else PracticeCore.changes(p, now + 500).take(MAX)
        changes.forEachIndexed { code, c -> set(am, c.at, pending(ctx, code, intent(ctx, at = c.at, last = c.last), PendingIntent.FLAG_UPDATE_CURRENT)) }
        pr.edit().putInt("n", changes.size).apply()
        val going = p != null && PracticeCore.at(p, now).mode != PracticeCore.Mode.DONE && now - maxOf(p.at, p.startMs) < STALE
        if (going) {
            val t = now + CHECK_EVERY
            val pi = pending(ctx, CHECK, intent(ctx, check = true), PendingIntent.FLAG_UPDATE_CURRENT)
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi) } catch (e: Exception) { }
        }
    }

    private fun cancel(ctx: Context, am: AlarmManager, code: Int) {
        pending(ctx, code, intent(ctx), PendingIntent.FLAG_NO_CREATE)?.let { am.cancel(it); it.cancel() }
    }

    /** exact when the watch allows it (Android 12+ can say no), otherwise as close as the watch will do while idle */
    private fun set(am: AlarmManager, at: Long, pi: PendingIntent) {
        try {
            var exact = true
            if (Build.VERSION.SDK_INT >= 31) exact = am.canScheduleExactAlarms()
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (e: SecurityException) {
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi) } catch (e2: Exception) { }
        }
    }

    /**
     * The change buzz: two strong pulses, or a long triple one at the end of practice. Once per change: the alarm and the
     * open screen both see the change that happens at [at] (epoch ms), and whichever comes second stays quiet. Marked as
     * an alarm, so the watch lets it through with the screen off.
     */
    fun buzz(ctx: Context, last: Boolean, at: Long) {
        val pr = prefs(ctx)
        if (Math.abs(at - pr.getLong("buzzedFor", 0L)) < 1_500L) return
        pr.edit().putLong("buzzedFor", at).apply()
        val timings = if (last) longArrayOf(0, 800, 250, 800, 250, 1200) else longArrayOf(0, 500, 200, 500)
        val v: Vibrator? =
            if (Build.VERSION.SDK_INT >= 31) (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            else @Suppress("DEPRECATION") (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)
        v ?: return
        val audio = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        try {
            when {
                Build.VERSION.SDK_INT >= 33 -> v.vibrate(VibrationEffect.createWaveform(timings, -1), VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
                Build.VERSION.SDK_INT >= 26 -> @Suppress("DEPRECATION") v.vibrate(VibrationEffect.createWaveform(timings, -1), audio)
                else -> @Suppress("DEPRECATION") v.vibrate(timings, -1, audio)
            }
        } catch (e: Exception) { }
    }
}

/** wakes at a change (buzz) or for the quiet check, reads the link again and sets the next alarms */
class PracticeBuzzReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        if (!intent.getBooleanExtra("check", false)) PracticeAlarms.buzz(ctx, intent.getBooleanExtra("last", false), intent.getLongExtra("at", 0L))
        val done = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Link.load(ctx)
                if (Link.state.value.linked) withTimeoutOrNull(8_000) { Link.sync() }
                PracticeAlarms.schedule(ctx, PracticeCore.parse(Link.field("pk")))
            } catch (e: Exception) {
            } finally { done.finish() }
        }
    }
}
