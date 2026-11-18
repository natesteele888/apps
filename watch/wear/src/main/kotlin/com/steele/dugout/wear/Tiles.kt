package com.steele.dugout.wear

import android.content.Context
import android.os.Build
import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DeviceParametersBuilders
import androidx.wear.protolayout.DimensionBuilders.degrees
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
import com.steele.dugout.shared.LeagueScores
import com.steele.dugout.shared.Zone
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Tiles: the cards you swipe to from the watch face. Two of them, each added from the watch's tile list:
 *   Pitch Count: who's pitching, the count, how many are left, in the same green, yellow and red as the app,
 *                with +1 and Undo right on the tile, so a coach can count without opening anything.
 *   Scores:      today's MAC League games, Lunenburg's first.
 * Tap anywhere else on a tile to open its app. Tiles need Wear OS 2 (Android 8) or newer: on an Android Wear 2.0 watch
 * the two services stay switched off (res/values/bools.xml), and everything else works the same.
 */
object Tiles {
    /** asks the watch to draw a tile again because its data changed; does nothing where tiles aren't available */
    fun update(ctx: Context?, cls: Class<out TileService>) {
        if (ctx == null || Build.VERSION.SDK_INT < 26) return
        try { TileService.getUpdater(ctx.applicationContext).requestUpdate(cls) } catch (e: Exception) { /* no tiles here */ }
    }

    fun pitch(ctx: Context?) = update(ctx, PitchTileService::class.java)
    fun scores(ctx: Context?) = update(ctx, ScoresTileService::class.java)

    internal const val RES = "1"
    internal const val WHITE = 0xFFFFFFFF.toInt()
    internal const val DIM = 0xCCFFFFFF.toInt()
    internal const val MUTED = 0xFF94A3B8.toInt()

    internal fun text(s: String, size: Float, color: Int = WHITE, bold: Boolean = false, lines: Int = 1): LayoutElement =
        LayoutElementBuilders.Text.Builder()
            .setText(s)
            .setMaxLines(lines)
            .setOverflow(LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE_END)
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(sp(size))
                    .setColor(argb(color))
                    .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL)
                    .build(),
            )
            .build()

    internal fun space(h: Float): LayoutElement = LayoutElementBuilders.Spacer.Builder().setHeight(dp(h)).build()
    internal fun gap(w: Float): LayoutElement = LayoutElementBuilders.Spacer.Builder().setWidth(dp(w)).build()

    internal fun open(ctx: Context, cls: Class<*>): ActionBuilders.Action =
        ActionBuilders.LaunchAction.Builder()
            .setAndroidActivity(ActionBuilders.AndroidActivity.Builder().setPackageName(ctx.packageName).setClassName(cls.name).build())
            .build()

    internal fun click(id: String, action: ActionBuilders.Action): ModifiersBuilders.Clickable =
        ModifiersBuilders.Clickable.Builder().setId(id).setOnClick(action).build()

    /** a rounded button: [label] on [color], [w] by [h] dp */
    internal fun button(label: String, color: Int, w: Float, h: Float, size: Float, clickable: ModifiersBuilders.Clickable): LayoutElement =
        LayoutElementBuilders.Box.Builder()
            .setWidth(dp(w)).setHeight(dp(h))
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(clickable)
                    .setBackground(
                        ModifiersBuilders.Background.Builder().setColor(argb(color))
                            .setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(h / 2)).build()).build(),
                    )
                    .build(),
            )
            .addContent(text(label, size, WHITE, bold = true))
            .build()

    internal fun tile(root: LayoutElement, freshMs: Long): TileBuilders.Tile =
        TileBuilders.Tile.Builder()
            .setResourcesVersion(RES)
            .setFreshnessIntervalMillis(freshMs)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root))
            .build()

    internal fun width(req: RequestBuilders.TileRequest): Float =
        req.deviceConfiguration.screenWidthDp.toFloat().takeIf { it > 0f } ?: 192f

    internal fun round(req: RequestBuilders.TileRequest): Boolean =
        req.deviceConfiguration.screenShape == DeviceParametersBuilders.SCREEN_SHAPE_ROUND
}

/** what both tiles share: answers off the main thread's coroutine scope, and an empty resource list (no pictures) */
abstract class DugoutTile : TileService() {
    protected val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    protected fun <T> answer(block: suspend () -> T): ListenableFuture<T> = CallbackToFutureAdapter.getFuture { done ->
        scope.launch {
            try { done.set(block()) } catch (e: Throwable) { done.setException(e) }
        }
        "dugout-tile"
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        answer { ResourceBuilders.Resources.Builder().setVersion(Tiles.RES).build() }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}

/**
 * The Pitch Count tile. +1 and Undo work right on the tile (each press comes back here as a tile request with that
 * button's id). Every drawing gets fresh button ids, so a press counts once even if the watch asks for the tile again.
 */
class PitchTileService : DugoutTile() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> = answer {
        PitchStore.load(this)
        val seq = PitchStore.tileSeq()
        when (requestParams.currentState.lastClickableId) {
            "add.$seq" -> {
                val (r, before) = PitchStore.add()
                if (r != null) Buzz.pitch(this, r.left, before, r.limit) else Buzz.tick(this)
                PitchStore.nextTileSeq()
            }
            "undo.$seq" -> {
                if (PitchStore.undo()) Buzz.pattern(this, 40, 60, 40)
                PitchStore.nextTileSeq()
            }
        }
        Tiles.tile(layout(requestParams, PitchStore.tileSeq()), 15 * 60_000L)
    }

    private fun zoneColor(z: Zone?): Int = when (z) {
        Zone.YELLOW -> 0xFFA16207.toInt()
        Zone.RED, Zone.LIMIT -> 0xFFB91C1C.toInt()
        Zone.GREEN -> 0xFF15803D.toInt()
        null -> 0xFF1E293B.toInt()
    }

    private fun layout(req: RequestBuilders.TileRequest, seq: Int): LayoutElement {
        val log = PitchStore.log.value
        val cur = PitchStore.cur(log)
        val row = cur?.let { c -> PitchStore.rows(log).firstOrNull { it.id == c.first } }
        val w = Tiles.width(req)
        val status = when {
            row == null -> "Tap +1 to count"
            row.limit == 0 -> "No limit set"
            row.left <= 0 -> "LIMIT REACHED"
            else -> "${row.left} left"
        }
        val openApp = Tiles.click("open", Tiles.open(this, PitchCountActivity::class.java))
        val load = ActionBuilders.LoadAction.Builder().build()

        val middle = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(openApp).build())
            .addContent(Tiles.text(cur?.second ?: "Pitch Count", 13f, Tiles.WHITE, bold = true))
            .addContent(Tiles.text("${row?.count ?: 0}", 44f, Tiles.WHITE, bold = true))
            .addContent(Tiles.text(status, 13f, Tiles.WHITE, bold = true))
            .build()

        val buttons = LayoutElementBuilders.Row.Builder()
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(Tiles.button("Undo", 0x55000000, w * 0.26f, 34f, 12f, Tiles.click("undo.$seq", load)))
            .addContent(Tiles.gap(6f))
            .addContent(Tiles.button("+1", 0x66FFFFFF, w * 0.36f, 40f, 20f, Tiles.click("add.$seq", load)))
            .build()

        val body = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(middle)
            .addContent(Tiles.space(6f))
            .addContent(buttons)
            .build()

        val root = LayoutElementBuilders.Box.Builder()
            .setWidth(expand()).setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setBackground(ModifiersBuilders.Background.Builder().setColor(argb(zoneColor(row?.zone))).build())
                    .build(),
            )
        // the edge ring fills toward the limit, like the app's
        if (row != null && row.limit > 0 && Tiles.round(req)) {
            val frac = (row.count.toFloat() / row.limit).coerceIn(0f, 1f)
            root.addContent(arc(360f, 0x33FFFFFF))
            if (frac > 0f) root.addContent(arc(360f * frac, Tiles.WHITE))
        }
        root.addContent(body)
        return root.build()
    }

    private fun arc(deg: Float, color: Int): LayoutElement =
        LayoutElementBuilders.Arc.Builder()
            .setAnchorAngle(degrees(0f))
            .setAnchorType(LayoutElementBuilders.ARC_ANCHOR_START)
            .addContent(LayoutElementBuilders.ArcLine.Builder().setLength(degrees(deg)).setThickness(dp(5f)).setColor(argb(color)).build())
            .build()
}

/**
 * The Scores tile: today's MAC League games, Lunenburg's first, two at a time. When the watch asks for it and the last
 * scores are more than 5 minutes old, it reads new ones first (the league posts about every 30 minutes).
 */
class ScoresTileService : DugoutTile() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> = answer {
        ScoresStore.load(this)
        if (System.currentTimeMillis() - ScoresStore.state.value.checkedAt > 5 * 60_000L) {
            withTimeoutOrNull(12_000) { ScoresStore.refresh() }
        }
        Tiles.tile(layout(requestParams), 15 * 60_000L)
    }

    private fun layout(req: RequestBuilders.TileRequest): LayoutElement {
        val st = ScoresStore.state.value
        val board = st.board
        val w = Tiles.width(req)
        val cardW = w * 0.74f
        // Lunenburg's games from every division first, then the rest in the league's order
        val all = board.divisions.flatMap { d -> d.games.map { d.name to it } }
        val games = (all.filter { it.second.us } + all.filterNot { it.second.us }).take(2)

        val col = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(Tiles.text("League Scores", 13f, 0xFFFBBF24.toInt(), bold = true))
            .addContent(Tiles.text(updated(board.scrapedAt, st.error != null), 10f, Tiles.MUTED))
            .addContent(Tiles.space(4f))
        when {
            board.divisions.isEmpty() -> col.addContent(Tiles.text(if (st.checkedAt == 0L) "Getting the scores…" else "No league scores yet", 13f, Tiles.WHITE, lines = 2))
            games.isEmpty() -> col.addContent(Tiles.text("No league games today", 13f, Tiles.WHITE, lines = 2))
            else -> games.forEachIndexed { i, (div, g) ->
                if (i > 0) col.addContent(Tiles.space(4f))
                col.addContent(card(div, g, cardW))
            }
        }
        if (board.gameCount > games.size && games.isNotEmpty()) {
            col.addContent(Tiles.space(3f)).addContent(Tiles.text("+${board.gameCount - games.size} more", 10f, Tiles.MUTED))
        }
        return LayoutElementBuilders.Box.Builder()
            .setWidth(expand()).setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(Tiles.click("open", Tiles.open(this, ScoresActivity::class.java))).build())
            .addContent(col.build())
            .build()
    }

    /** one game: both teams with their runs, the winner in white and the loser dimmed */
    private fun card(div: String, g: LeagueScores.Game, w: Float): LayoutElement {
        val a = g.away.score; val h = g.home.score
        val c = LayoutElementBuilders.Column.Builder()
            .setWidth(dp(w))
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_START)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setBackground(
                        ModifiersBuilders.Background.Builder().setColor(argb(if (g.us) 0xFF1E3A8A.toInt() else 0xFF1E293B.toInt()))
                            .setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(12f)).build()).build(),
                    )
                    .setPadding(ModifiersBuilders.Padding.Builder().setStart(dp(10f)).setEnd(dp(10f)).setTop(dp(4f)).setBottom(dp(4f)).build())
                    .build(),
            )
            .addContent(team(g.away, g.played && a!! < h!!, w - 20f))
            .addContent(team(g.home, g.played && h!! < a!!, w - 20f))
        if (!g.played) c.addContent(Tiles.text(listOf(div, g.time).filter { it.isNotBlank() }.joinToString(" · "), 9f, Tiles.MUTED))
        return c.build()
    }

    private fun team(s: LeagueScores.Side, lost: Boolean, w: Float): LayoutElement {
        val color = if (lost) Tiles.MUTED else Tiles.WHITE
        return LayoutElementBuilders.Row.Builder()
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(
                LayoutElementBuilders.Box.Builder().setWidth(dp(w - 24f))
                    .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_START)
                    .addContent(Tiles.text(s.name, 12f, color, bold = s.us))
                    .build(),
            )
            .addContent(
                LayoutElementBuilders.Box.Builder().setWidth(dp(24f))
                    .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_END)
                    .addContent(Tiles.text(s.score?.toString() ?: "–", 13f, color, bold = !lost && s.score != null))
                    .build(),
            )
            .build()
    }

    private fun updated(iso: String?, offline: Boolean): String {
        val t = try { iso?.let { Instant.parse(it).atZone(ZoneId.systemDefault()) } } catch (e: Exception) { null } ?: return if (offline) "Offline" else ""
        val s = if (t.toLocalDate() == LocalDate.now(ZoneId.systemDefault())) "Updated " + DateTimeFormatter.ofPattern("h:mm a", Locale.US).format(t)
        else "Updated " + DateTimeFormatter.ofPattern("MMM d", Locale.US).format(t)
        return if (offline) "$s · offline" else s
    }
}
