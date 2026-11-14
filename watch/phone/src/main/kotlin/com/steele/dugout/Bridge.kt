package com.steele.dugout

import android.content.ContentValues
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * What walkup/bridge.js calls as window.WalkupNative. These run on a background thread, and do nothing unless the page
 * is on natesteele888.github.io.
 */
class Bridge(private val a: MainActivity) {
    private class Save(val uri: Uri, val out: OutputStream)
    private val saves = ConcurrentHashMap<String, Save>()
    private var seq = 0

    @JavascriptInterface fun postState(json: String) { if (a.pageOk && json.length < 200_000) a.onPageState(json) }
    @JavascriptInterface fun postPitch(json: String) { if (a.pageOk && json.length < 400_000) a.onPagePitch(json) }

    @JavascriptInterface fun ttsSpeak(id: String, text: String, rate: Double, vol: Double) {
        if (!a.pageOk) return
        a.tts.speak(id.take(40), text.take(400), rate, vol)
    }
    @JavascriptInterface fun ttsStop() { if (a.pageOk) a.tts.stop() }

    /* Backups: the web view can't download, so files go to the phone's Downloads folder. */
    @JavascriptInterface fun saveStart(name: String, mime: String): String {
        if (!a.pageOk) return ""
        return try {
            val clean = name.replace(Regex("[^A-Za-z0-9 ._()-]"), "_").trim().take(100).ifBlank { "walkup-file" }
            val v = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, clean)
                put(MediaStore.Downloads.MIME_TYPE, mime.takeIf { Regex("^[a-z]+/[A-Za-z0-9.+-]+$").matches(it) } ?: "application/octet-stream")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val r = a.contentResolver
            val uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: return ""
            val out = r.openOutputStream(uri) ?: run { r.delete(uri, null, null); return "" }
            val id = synchronized(this) { "s" + (++seq) }
            saves[id] = Save(uri, out)
            id
        } catch (e: Exception) { "" }
    }

    @JavascriptInterface fun saveChunk(id: String, b64: String): Boolean {
        val s = saves[id] ?: return false
        return try { s.out.write(Base64.decode(b64, Base64.DEFAULT)); true } catch (e: Exception) { abort(id, s); false }
    }

    @JavascriptInterface fun saveEnd(id: String): Boolean {
        val s = saves.remove(id) ?: return false
        return try {
            s.out.close()
            a.contentResolver.update(s.uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            true
        } catch (e: Exception) { abort(id, s); false }
    }

    private fun abort(id: String, s: Save) {
        saves.remove(id)
        try { s.out.close() } catch (e: Exception) { /* ignore */ }
        try { a.contentResolver.delete(s.uri, null, null) } catch (e: Exception) { /* ignore */ }
    }
}
