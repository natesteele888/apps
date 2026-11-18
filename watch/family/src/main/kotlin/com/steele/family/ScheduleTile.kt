package com.steele.family

import android.content.Context
import android.os.Build
import android.text.format.DateFormat
import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import com.steele.family.core.SchedCore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Instant
import java.time.ZoneId

/**
 * The Schedule tile (swipe from the watch face; add it from the watch's list of tiles): the next game or practice big,
 * with its day, time and place, and the two after it underneath. Tap it to open Schedule. Same words as the Schedule
 * screen, from the watch's copy of the phone's schedule (read again first when it's more than 15 minutes old).
 * Tiles need Android 8: before that the service stays off (@bool/face_on) and Schedule works as before.
 */
class ScheduleTileService : TileService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private fun <T> answer(block: suspend () -> T): ListenableFuture<T> = CallbackToFutureAdapter.getFuture { done ->
        scope.launch { try { done.set(block()) } catch (e: Throwable) { done.setException(e) } }
        "schedule-tile"
    }

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> = answer {
        Link.load(this)
        val now = System.currentTimeMillis()
        if (Link.state.value.linked && now - Link.state.value.checkedAt > 15 * 60_000L) withTimeoutOrNull(8_000) { Link.sync() }
        TileBuilders.Tile.Builder()
            .setResourcesVersion(RES)
            .setFreshnessIntervalMillis(30 * 60_000L)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout(this, now)))
            .build()
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        answer { ResourceBuilders.Resources.Builder().setVersion(RES).build() }

    override fun onDestroy() { scope.cancel(); super.onDestroy() }

    private fun layout(ctx: Context, now: Long): LayoutElement {
        val zone = ZoneId.systemDefault()
        val h24 = DateFormat.is24HourFormat(ctx)
        val s = SchedCore.parse(Link.field("sc"))
        val col = LayoutElementBuilders.Column.Builder().setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        col.addContent(text("NEXT UP", 12f, SKY, bold = true)).addContent(space(4f))
        val ahead = if (s == null) emptyList() else SchedCore.ahead(SchedCore.merge(s, emptyList(), zone), now, zone)
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        when {
            !Link.state.value.linked || s == null -> col.addContent(text("Open Schedule on the watch once", 14f, WHITE, lines = 3))
            ahead.isEmpty() -> col.addContent(text("Nothing in the next two weeks", 14f, WHITE, lines = 2))
            else -> {
                val e = ahead.first()
                val live = SchedCore.live(e, now, zone)
                col.addContent(text(if (live) "On now" else listOf(SchedCore.dayLabel(e.date, today), SchedCore.timeLabel(e.min, h24)).filter { it.isNotBlank() }.joinToString(" · "),
                    13f, if (live) GREEN else SKY, bold = true))
                col.addContent(text(e.title, 20f, WHITE, bold = true, lines = 2))
                listOf(e.team, e.place).filter { it.isNotBlank() }.joinToString(" · ").takeIf { it.isNotBlank() }?.let { col.addContent(text(it, 12f, MUTED, lines = 1)) }
                ahead.drop(1).take(2).forEach { x ->
                    col.addContent(space(5f))
                    col.addContent(text(listOf(SchedCore.dayLabel(x.date, today).take(3), SchedCore.timeLabel(x.min, h24), x.title).filter { it.isNotBlank() }.joinToString(" "), 12f, DIM))
                }
            }
        }
        return LayoutElementBuilders.Box.Builder()
            .setWidth(expand()).setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(
                ModifiersBuilders.Clickable.Builder().setId("open").setOnClick(
                    ActionBuilders.LaunchAction.Builder().setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder().setPackageName(ctx.packageName).setClassName(ScheduleActivity::class.java.name).build(),
                    ).build(),
                ).build(),
            ).setPadding(ModifiersBuilders.Padding.Builder().setStart(dp(18f)).setEnd(dp(18f)).build()).build())
            .addContent(col.build())
            .build()
    }

    companion object {
        private const val RES = "1"
        private const val WHITE = 0xFFFFFFFF.toInt()
        private const val DIM = 0xCCFFFFFF.toInt()
        private const val MUTED = 0xFF94A3B8.toInt()
        private const val SKY = 0xFF0EA5E9.toInt()
        private const val GREEN = 0xFF22C55E.toInt()

        private fun text(s: String, size: Float, color: Int, bold: Boolean = false, lines: Int = 1): LayoutElement =
            LayoutElementBuilders.Text.Builder()
                .setText(s)
                .setMaxLines(lines)
                .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
                .setOverflow(LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE_END)
                .setFontStyle(LayoutElementBuilders.FontStyle.Builder().setSize(sp(size)).setColor(argb(color))
                    .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL).build())
                .build()

        private fun space(h: Float): LayoutElement = LayoutElementBuilders.Spacer.Builder().setHeight(dp(h)).build()

        /** asks the watch to draw the tile again (a new schedule from the phone); nothing where tiles aren't available */
        fun update(ctx: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            try { getUpdater(ctx.applicationContext).requestUpdate(ScheduleTileService::class.java) } catch (e: Exception) { }
        }
    }
}
