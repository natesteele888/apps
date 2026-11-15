package com.steele.dugout

import android.content.Context
import android.net.Uri
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import com.steele.dugout.shared.Paths
import com.steele.dugout.shared.PitchCore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

/**
 * The phone's side of the watch link (Google's Wear OS Data Layer, phone to watch only, no internet):
 *  - sends the page's state to the watch as a message,
 *  - passes the watch's commands to the page,
 *  - keeps the pitch log in a synced data item, so taps on the watch while apart arrive later, once.
 */
class WearLink(private val a: MainActivity) : MessageClient.OnMessageReceivedListener, DataClient.OnDataChangedListener {
    private val msg = Wearable.getMessageClient(a)
    private val data = Wearable.getDataClient(a)
    private val nodes = Wearable.getNodeClient(a)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var localId: String? = null
    private var lastState: String? = null
    private val heard = HashSet<String>()

    fun start() {
        msg.addListener(this)
        data.addListener(this)
        scope.launch { localId = try { nodes.localNode.await().id } catch (e: Exception) { null } }
    }

    fun stop() {
        msg.removeListener(this)
        data.removeListener(this)
        scope.cancel()
    }

    override fun onMessageReceived(ev: MessageEvent) {
        if (ev.path != Paths.CMD || ev.data.size > 20_000) return
        heard.add(ev.sourceNodeId)
        a.fromWatch(String(ev.data, Charsets.UTF_8))
    }

    override fun onDataChanged(buf: DataEventBuffer) {
        val got = ArrayList<String>()
        for (ev in buf) {
            val item = ev.dataItem
            if (ev.type == DataEvent.TYPE_CHANGED && item.uri.path == Paths.PITCH && item.uri.host != localId) item.data?.let { got.add(String(it, Charsets.UTF_8)) }
        }
        got.forEach { a.pitchFromWatch(it) }
    }

    /* ---------- to the watch ---------- */
    fun sendState(json: String) {
        lastState = json
        val bytes = json.toByteArray(Charsets.UTF_8)
        scope.launch {
            val to = HashSet(heard)
            try { nodes.connectedNodes.await().forEach { to.add(it.id) } } catch (e: Exception) { /* no watch */ }
            for (n in to) try { msg.sendMessage(n, Paths.STATE, bytes).await() } catch (e: Exception) { /* not reachable now */ }
        }
    }

    /** the speaker changed: tell the watch with the same page state */
    fun resendState() {
        val s = lastState ?: return
        val o = try { JSONObject(s) } catch (e: Exception) { return }
        o.put("speaker", a.speakerJson())
        MainActivity.lastState = o.toString()
        sendState(o.toString())
    }

    fun putPitch(json: String) {
        var bytes = json.toByteArray(Charsets.UTF_8)
        if (bytes.size > 90_000) {
            // a data item holds about 100 KB: keep only today's events (older days are already in the phone's history)
            val o = try { JSONObject(json) } catch (e: Exception) { return }
            val today = PitchCore.ymd(System.currentTimeMillis())
            val log = PitchCore.parse(json)
            val t = PitchCore.toJson(log.copy(events = log.events.filter { PitchCore.ymd(it.t) == today }))
            o.optJSONObject("elig")?.let { t.put("elig", it) }
            bytes = t.toString().toByteArray(Charsets.UTF_8)
        }
        val req = PutDataRequest.create(Paths.PITCH).setData(bytes).setUrgent()
        scope.launch { try { data.putDataItem(req).await() } catch (e: Exception) { /* tried again on the next change */ } }
    }

    /** the watch's pitch log that synced while the page wasn't open */
    fun pullPitch() {
        scope.launch {
            try {
                val buf = data.getDataItems(Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(Paths.PITCH).build()).await()
                val got = ArrayList<String>()
                for (item in buf) if (item.uri.host != localId) item.data?.let { got.add(String(it, Charsets.UTF_8)) }
                buf.release()
                got.forEach { a.pitchFromWatch(it) }
            } catch (e: Exception) { /* no watch */ }
        }
    }

    companion object {
        /** a batter's background photo, sent to the watch as a synced picture */
        suspend fun putPhoto(ctx: Context, id: String, jpeg: ByteArray) {
            val req = PutDataRequest.create(Paths.PHOTO + id)
            req.putAsset("img", Asset.createFromBytes(jpeg))
            req.setData(System.currentTimeMillis().toString().toByteArray())
            req.setUrgent()
            Wearable.getDataClient(ctx).putDataItem(req).await()
        }

        suspend fun deletePhoto(ctx: Context, id: String) {
            val me = Wearable.getNodeClient(ctx).localNode.await().id
            Wearable.getDataClient(ctx).deleteDataItems(Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).authority(me).path(Paths.PHOTO + id).build()).await()
        }

        suspend fun watchCount(ctx: Context): Int = try { Wearable.getNodeClient(ctx).connectedNodes.await().size } catch (e: Exception) { 0 }
    }
}
