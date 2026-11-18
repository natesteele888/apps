package com.steele.dugout.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

/**
 * The pitch count on the watch face: pick "Pitch Count" for a slot on a watch face that has them (complications).
 * A small slot shows the count and how many are left, a ring slot fills toward the limit, and a wide slot also names
 * the pitcher. Tap it to open Pitch Count. Like the tiles, it's switched on from Android 8 only.
 */
class PitchComplicationService : SuspendingComplicationDataSourceService() {
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        PitchStore.load(this)
        val log = PitchStore.log.value
        val cur = PitchStore.cur(log)
        val row = cur?.let { c -> PitchStore.rows(log).firstOrNull { it.id == c.first } }
        return data(request.complicationType, cur?.second ?: "Pitching", row?.count ?: 0, row?.limit ?: 0, row?.left ?: 0, open(this))
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? = data(type, "Pitcher", 42, 85, 43, null)

    private fun data(type: ComplicationType, name: String, count: Int, limit: Int, left: Int, tap: PendingIntent?): ComplicationData? {
        val about = PlainComplicationText.Builder(if (limit > 0) "$count pitches, $left left" else "$count pitches").build()
        val sub = if (limit == 0) "pitches" else if (left <= 0) "LIMIT" else "$left left"
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(PlainComplicationText.Builder("$count").build(), about)
                .setTitle(PlainComplicationText.Builder(sub).build()).setTapAction(tap).build()
            ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(count.toFloat().coerceAtMost(limit.toFloat().coerceAtLeast(1f)), 0f, limit.toFloat().coerceAtLeast(1f), about)
                .setText(PlainComplicationText.Builder("$count").build()).setTitle(PlainComplicationText.Builder(sub).build()).setTapAction(tap).build()
            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(PlainComplicationText.Builder("$count · $sub").build(), about)
                .setTitle(PlainComplicationText.Builder(name).build()).setTapAction(tap).build()
            else -> null
        }
    }

    companion object {
        private fun open(ctx: Context): PendingIntent = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, PitchCountActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        /** asks every watch face showing the pitch count to read it again */
        fun update(ctx: Context?) {
            if (ctx == null || Build.VERSION.SDK_INT < 26) return
            try {
                ComplicationDataSourceUpdateRequester.create(ctx.applicationContext, ComponentName(ctx.applicationContext, PitchComplicationService::class.java)).requestUpdateAll()
            } catch (e: Exception) { /* no complications here */ }
        }
    }
}
