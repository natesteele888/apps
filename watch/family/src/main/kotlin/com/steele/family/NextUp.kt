package com.steele.family

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.text.format.DateFormat
import androidx.annotation.RequiresApi
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.steele.family.core.SchedCore
import kotlinx.coroutines.withTimeoutOrNull
import java.time.ZoneId

/**
 * "Next up" for the watch face: the next game or practice from Schedule in a watch-face slot (long-press the face ›
 * Customize › tap a slot › Steele Family › Next up). Tap it to open Schedule.
 *
 * The words come from SchedCore.face (tested there) and use only clock times and days, so they stay right between
 * updates. The watch asks for new words every 30 minutes (set in the manifest), and the link asks again whenever the
 * phone sends a new schedule. When the watch's copy is more than 15 minutes old, this reads the link first.
 *
 * Google's watch-face library needs Android 8, so on an Android Wear 2.0 watch (Android 7.1) it's switched off in the
 * manifest (@bool/face_on) and Schedule works as before.
 */
@RequiresApi(26)
class NextUpComplication : SuspendingComplicationDataSourceService() {
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val ctx = applicationContext
        Link.load(ctx)
        val now = System.currentTimeMillis()
        if (Link.state.value.linked && now - Link.state.value.checkedAt > 15 * 60_000L) withTimeoutOrNull(8_000) { Link.sync() }
        val zone = ZoneId.systemDefault()
        val s = SchedCore.parse(Link.field("sc"))
        val ahead = if (s == null) emptyList() else SchedCore.ahead(SchedCore.merge(s, emptyList(), zone), now, zone)
        return data(ctx, request.complicationType, SchedCore.face(s != null, ahead, now, zone, DateFormat.is24HourFormat(ctx)), open(ctx))
    }

    /** what the watch shows while picking a slot: a made-up practice */
    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        data(this, type, SchedCore.Face("PRAC", "5:30", "Practice 5:30 PM"), null)

    companion object {
        private fun open(ctx: Context): PendingIntent = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, ScheduleActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        private fun text(s: String) = PlainComplicationText.Builder(s).build()

        private fun data(ctx: Context, type: ComplicationType, f: SchedCore.Face, tap: PendingIntent?): ComplicationData? {
            val icon = MonochromaticImage.Builder(Icon.createWithResource(ctx, R.drawable.ic_face_next)).build()
            return when (type) {
                ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(text(f.shortText), text(f.longText))
                    .setTitle(f.shortTitle?.let { text(it) })
                    .setMonochromaticImage(if (f.shortTitle == null) icon else null)
                    .setTapAction(tap)
                    .build()
                ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(text(f.longText), text(f.longText))
                    .setMonochromaticImage(icon)
                    .setTapAction(tap)
                    .build()
                else -> null
            }
        }
    }
}

/** tells the watch face's Next up and the Schedule tile to ask again (a new schedule from the phone) */
object NextUp {
    fun update(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        ScheduleTileService.update(ctx)
        val app = ctx.applicationContext
        try { ComplicationDataSourceUpdateRequester.create(app, ComponentName(app, NextUpComplication::class.java)).requestUpdateAll() }
        catch (e: Exception) { /* no watch face to tell */ }
    }
}
