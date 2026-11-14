package com.steele.dugout.wear

import android.content.Context
import android.net.Uri
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataItemAsset
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import com.steele.dugout.shared.BatState
import com.steele.dugout.shared.Paths
import com.steele.dugout.shared.Proto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File

/**
 * The watch's side of the link to Dugout on the phone, shared by the Walk-Up and Pitch Count watch apps. Every few seconds it says hello, and the phone answers with
 * who is up, the batting order and what is playing. No answer for 9 seconds means "Open Dugout on your phone".
 */
object PhoneLink : MessageClient.OnMessageReceivedListener, DataClient.OnDataChangedListener {
    val state = MutableStateFlow<BatState?>(null)
    /** goes up by one when a batter photo arrives or is removed */
    val photos = MutableStateFlow(0)
    private lateinit var app: Context
    private var scope: CoroutineScope? = null
    private var localId: String? = null

    /** how many of the two watch apps (Walk-Up, Pitch Count) are on screen; the link runs while either is */
    private var users = 0

    fun start(ctx: Context) {
        app = ctx.applicationContext
        users++
        if (scope != null) return
        val s = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        scope = s
        Wearable.getMessageClient(app).addListener(this)
        Wearable.getDataClient(app).addListener(this)
        s.launch {
            localId = try { Wearable.getNodeClient(app).localNode.await().id } catch (e: Exception) { null }
            pull()
        }
        s.launch { while (isActive) { send(Proto.cmd("hello")); delay(4000) } }
    }

    fun stop() {
        users = (users - 1).coerceAtLeast(0)
        if (users > 0 || scope == null) return
        Wearable.getMessageClient(app).removeListener(this)
        Wearable.getDataClient(app).removeListener(this)
        scope?.cancel(); scope = null
    }

    fun phoneOk(now: Long): Boolean { val s = state.value; return s != null && now - s.receivedAt < 9000 }

    fun send(json: String): Job? = scope?.launch {
        val bytes = json.toByteArray(Charsets.UTF_8)
        try {
            for (n in Wearable.getNodeClient(app).connectedNodes.await()) {
                try { Wearable.getMessageClient(app).sendMessage(n.id, Paths.CMD, bytes).await() } catch (e: Exception) { /* not reachable */ }
            }
        } catch (e: Exception) { /* no phone */ }
    }

    fun putPitch(json: String) {
        val req = PutDataRequest.create(Paths.PITCH).setData(json.toByteArray(Charsets.UTF_8)).setUrgent()
        val s = scope ?: return
        s.launch { try { Wearable.getDataClient(app).putDataItem(req).await() } catch (e: Exception) { /* synced on the next change */ } }
    }

    override fun onMessageReceived(ev: MessageEvent) {
        if (ev.path != Paths.STATE || ev.data.size > 200_000) return
        Proto.parseState(String(ev.data, Charsets.UTF_8), System.currentTimeMillis())?.let { state.value = it }
    }

    override fun onDataChanged(buf: DataEventBuffer) {
        val items = ArrayList<Pair<Int, DataItem>>()
        for (ev in buf) items.add(ev.type to ev.dataItem.freeze())
        items.forEach { (type, item) -> handle(type, item) }
    }

    private fun handle(type: Int, item: DataItem) {
        val path = item.uri.path ?: return
        if (item.uri.host == localId) return
        if (path == Paths.PITCH && type == DataEvent.TYPE_CHANGED) {
            item.data?.let { PitchStore.fromPhone(String(it, Charsets.UTF_8)) }
        } else if (path.startsWith(Paths.PHOTO)) {
            val id = path.removePrefix(Paths.PHOTO)
            if (!Paths.safeId(id)) return
            if (type == DataEvent.TYPE_DELETED) { photoFile(app, id).delete(); photos.value++ }
            else item.assets["img"]?.let { a -> scope?.launch { savePhoto(id, a) } }
        }
    }

    private suspend fun savePhoto(id: String, a: DataItemAsset) {
        try {
            val fd = Wearable.getDataClient(app).getFdForAsset(a).await()
            withContext(Dispatchers.IO) {
                val bytes = fd.inputStream.use { it.readBytes() }
                if (bytes.size in 1..2_000_000) photoFile(app, id).writeBytes(bytes)
            }
            photos.value++
        } catch (e: Exception) { /* tried again next time */ }
    }

    /** what synced while the app was closed: the phone's pitch log and the photos */
    private suspend fun pull() {
        val dc = Wearable.getDataClient(app)
        try {
            val buf = dc.getDataItems(Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(Paths.PITCH).build()).await()
            val items = buf.map { it.freeze() }; buf.release()
            items.forEach { handle(DataEvent.TYPE_CHANGED, it) }
        } catch (e: Exception) { /* none */ }
        try {
            val buf = dc.getDataItems(Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(Paths.PHOTO).build(), DataClient.FILTER_PREFIX).await()
            val items = buf.map { it.freeze() }; buf.release()
            val keep = HashSet<String>()
            items.forEach { keep.add((it.uri.path ?: "").removePrefix(Paths.PHOTO)); handle(DataEvent.TYPE_CHANGED, it) }
            photoDir(app).listFiles()?.forEach { f -> if (f.nameWithoutExtension !in keep) f.delete() }
            photos.value++
        } catch (e: Exception) { /* none */ }
    }

    fun photoDir(ctx: Context) = File(ctx.filesDir, "photos").apply { mkdirs() }
    fun photoFile(ctx: Context, id: String) = File(photoDir(ctx), "$id.jpg")
}
