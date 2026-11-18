package com.steele.dugout.wear

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.annotation.ChecksSdkIntAtLeast
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status

/**
 * The way back to the game. When Walk-Up or Pitch Count goes behind the watch face (the home button, a palm over the
 * screen), the watch face shows its icon, and a tap on it opens the app right where it was. Pitch Count's also says the
 * count ("42 pitches · 43 left") and keeps up with taps on the tile. Leaving the app with the back swipe means you're
 * done, so the icon goes away then.
 *
 * Wear OS 3 and up only (Galaxy Watch 4 and newer, Pixel Watch); on older watches nothing changes.
 */
object Ongoing {
    const val WALKUP = 4201
    const val PITCH = 4202
    private const val CHANNEL = "game"
    private val shown = HashSet<Int>()

    @ChecksSdkIntAtLeast(api = 30)
    private fun on() = Build.VERSION.SDK_INT >= 30

    /** Android 13 and up ask once whether the app may show it */
    fun askOnce(act: Activity, ask: (String) -> Unit) {
        if (!on() || Build.VERSION.SDK_INT < 33) return
        if (ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        val p = act.getSharedPreferences("ongoing", Context.MODE_PRIVATE)
        if (p.getBoolean("asked", false)) return
        p.edit().putBoolean("asked", true).apply()
        ask(Manifest.permission.POST_NOTIFICATIONS)
    }

    /** the app went behind the watch face */
    fun show(ctx: Context, id: Int) {
        if (!on()) return
        shown.add(id)
        post(ctx.applicationContext, id)
    }

    /** the app is back on screen, or was put away for good */
    fun hide(ctx: Context, id: Int) {
        shown.remove(id)
        if (!on()) return
        try { NotificationManagerCompat.from(ctx).cancel(id) } catch (e: Exception) { /* nothing to take down */ }
    }

    /** the pitch count changed (a tap on the tile, or the phone): keep the watch face's line up to date */
    fun pitch(ctx: Context?) {
        if (ctx == null || !on()) return
        val app = ctx.applicationContext
        // shown now, or left up by an earlier run of the app (the watch can close it while it's behind the face)
        val up = PITCH in shown || try {
            app.getSystemService(NotificationManager::class.java).activeNotifications.any { it.id == PITCH }
        } catch (e: Exception) { false }
        if (up) post(app, PITCH)
    }

    private fun pitchLine(): String {
        val log = PitchStore.log.value
        val c = PitchStore.cur(log) ?: return "Tap to count"
        val r = PitchStore.rows(log).firstOrNull { it.id == c.first } ?: return "Tap to count"
        val n = "${r.count} pitch" + (if (r.count == 1) "" else "es")
        return when {
            r.limit == 0 -> n
            r.left <= 0 -> "$n · at the limit"
            else -> "$n · ${r.left} left"
        }
    }

    @RequiresApi(30)
    private fun post(app: Context, id: Int) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        try {
            val nm = app.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(NotificationChannel(CHANNEL, app.getString(R.string.ongoing_channel), NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
            }
            val pitch = id == PITCH
            val cls = if (pitch) PitchCountActivity::class.java else WalkUpActivity::class.java
            val icon = if (pitch) R.drawable.ic_pitch_fg else R.drawable.ic_walkup_fg
            val title = app.getString(if (pitch) R.string.pitch_name else R.string.walkup_name)
            val line = if (pitch) pitchLine() else app.getString(R.string.ongoing_walkup)
            val tap = PendingIntent.getActivity(
                app, id, Intent(app, cls).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val n = NotificationCompat.Builder(app, CHANNEL)
                .setSmallIcon(icon).setContentTitle(title).setContentText(line)
                .setContentIntent(tap).setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            OngoingActivity.Builder(app, id, n)
                .setStaticIcon(icon).setTouchIntent(tap)
                .setStatus(Status.Builder().addTemplate(line).build())
                .build().apply(app)
            NotificationManagerCompat.from(app).notify(id, n.build())
        } catch (e: SecurityException) {
            /* not allowed to show it */
        } catch (e: Exception) {
            /* no ongoing activities on this watch */
        }
    }
}
