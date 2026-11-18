package com.steele.dugout.wear

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.SystemClock
import android.text.format.DateFormat
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService
import com.steele.dugout.shared.Gc
import com.steele.dugout.shared.GcFace
import kotlinx.coroutines.withTimeoutOrNull
import java.time.ZoneId

/**
 * "Live score" for the watch face: the GC Scores team's live score, next game or last final in a watch-face slot
 * (long-press the face › Customize › tap a slot › Dugout › Live score). Tap it to open GC Scores.
 *
 * The words come from GcFace in the shared code (tested there). The scores are GcStore's, the same copy the GC Scores
 * screen shows. The watch asks for new words every 5 minutes (the least it allows, set in the manifest). While a game is
 * on, or starts within 30 minutes, this asks again every minute with an alarm, and never faster. Between games it reads
 * GameChanger at most every 15 minutes.
 */
class GcScoreComplication : SuspendingComplicationDataSourceService() {
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val ctx = applicationContext
        GcStore.load(ctx)
        withTimeoutOrNull(3_000) { GcStore.syncTeam(ctx) } // the team the phone synced, read from the watch's own copy
        GcStore.snap.value.let { s ->
            val t = System.currentTimeMillis()
            if (s.teamId.isNotEmpty()) GcStore.pull(ctx, maxAgeMs = GcFace.maxAgeMs(Gc.board(s.games, t), t), timeoutMs = 8_000, tellFace = false, withTeam = false)
        }
        val s = GcStore.snap.value
        val now = System.currentTimeMillis()
        val board = Gc.board(s.games, now)
        if (s.teamId.isNotEmpty() && GcFace.fast(board, now)) again(ctx)
        val texts = GcFace.texts(s.teamId.isNotEmpty(), board, board.live?.let { GcStore.lines.value[it.id] }, now, ZoneId.systemDefault(), DateFormat.is24HourFormat(ctx), s.readAt > 0)
        return data(ctx, request.complicationType, texts, open(ctx))
    }

    /** what the watch shows while the coach picks a slot: made-up teams */
    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        data(this, type, GcFace.Texts("INN 5", "4-3", "LIVE vs Hawks 4-3"), null)

    companion object {
        /** asks every watch face showing Live score to ask again (a new team, new scores on the GC Scores screen, the minute alarm) */
        fun update(ctx: Context) {
            val app = ctx.applicationContext
            try { ComplicationDataSourceUpdateRequester.create(app, ComponentName(app, GcScoreComplication::class.java)).requestUpdateAll() }
            catch (e: Exception) { /* no watch face to tell */ }
        }

        /** one more update in about a minute; an inexact alarm, so the watch can line it up with its other wake-ups */
        private fun again(ctx: Context) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val pi = PendingIntent.getBroadcast(ctx, 0, Intent(ctx, GcScoreTick::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 60_000L, pi)
        }

        /** tapping the slot opens GC Scores */
        private fun open(ctx: Context): PendingIntent = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, GameChangerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        private fun text(s: String) = PlainComplicationText.Builder(s).build()

        private fun data(ctx: Context, type: ComplicationType, t: GcFace.Texts, tap: PendingIntent?): ComplicationData? {
            val icon = MonochromaticImage.Builder(Icon.createWithResource(ctx, R.drawable.ic_face_gc)).build()
            return when (type) {
                // a small slot: a title over the score ("INN 5" over "4-3"), or the icon when there's no title ("GC")
                ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(text(t.shortText), text(t.longText))
                    .setTitle(t.shortTitle?.let { text(it) })
                    .setMonochromaticImage(if (t.shortTitle == null) icon else null)
                    .setTapAction(tap)
                    .build()
                ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(text(t.longText), text(t.longText))
                    .setMonochromaticImage(icon)
                    .setTapAction(tap)
                    .build()
                else -> null
            }
        }
    }
}

/** the minute alarm during a game: asks the watch face for new words, which reads GameChanger again */
class GcScoreTick : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) = GcScoreComplication.update(ctx)
}

/** wakes the app when the coach sends a new team from the phone, so the watch face changes even with GC Scores closed */
class GcTeamListener : WearableListenerService() {
    override fun onDataChanged(buf: DataEventBuffer) {
        var id: String? = null
        for (ev in buf) if (ev.type == DataEvent.TYPE_CHANGED && ev.dataItem.uri.path == Gc.PATH_TEAM) ev.dataItem.data?.let { id = String(it, Charsets.UTF_8) }
        val got = id ?: return
        GcStore.load(this)
        GcStore.setTeam(this, got)
    }
}
