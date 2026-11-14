package com.steele.dugout

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder

/** Keeps Dugout running while the phone is in a pocket or another app is open, so the music and the watch keep working. */
class KeepAliveService : Service() {
    companion object {
        fun start(ctx: Context) { try { ctx.startForegroundService(Intent(ctx, KeepAliveService::class.java)) } catch (e: Exception) { /* not allowed right now */ } }
        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, KeepAliveService::class.java)) }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("game", "Game day", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, "game")
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Dugout is ready")
            .setContentText("Walk-up songs and the watch keep working.")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        try { startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) } catch (e: Exception) { stopSelf() }
        return START_NOT_STICKY
    }
}
