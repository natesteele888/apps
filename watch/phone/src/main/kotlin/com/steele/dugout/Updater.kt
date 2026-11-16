package com.steele.dugout

import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.steele.dugout.shared.Updates
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Keeps Dugout up to date: when the app opens (at most every half hour) it asks GitHub for the newest Dugout release,
 * offers it in a pop-up, downloads it and opens it in Android's own installer, which asks "Do you want to update this
 * app?". Android only installs it over this copy if it is signed with the same key, so nothing else can slip in this way.
 *
 * The installer is opened straight from Dugout's own screen. (Builds up to 40 committed an install session and waited
 * for Android to call back; on Android 15 that call-back was held until Dugout left the screen, and the update looped.)
 */
class Updater(private val a: MainActivity) {
    companion object {
        private const val PREFS = "updates"
        private const val EVERY_MS = 30L * 60 * 1000 // a new build shows up within half an hour of opening the app
        private const val MAX_BYTES = 200L * 1024 * 1024
        const val AUTHORITY_SUFFIX = ".updates" // the FileProvider in AndroidManifest.xml
        private const val APK_MIME = "application/vnd.android.package-archive"
    }

    private val prefs = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private var pending: Updates.Release? = null
    private var busy = false

    /** On open: look for a new version, unless we looked recently. [tell] also says so when there is none. */
    fun check(force: Boolean = false, tell: Boolean = false) {
        if (busy) return
        val pend = pending
        if (pend != null) { // back from the "Install unknown apps" switch
            pending = null
            if (a.packageManager.canRequestPackageInstalls()) download(pend)
            return
        }
        val now = System.currentTimeMillis()
        if (!force && now - prefs.getLong("last", 0) < EVERY_MS) return
        busy = true
        a.lifecycleScope.launch {
            val rel = try {
                val list = withContext(Dispatchers.IO) { JSONArray(get(Updates.LIST_URL)) }
                prefs.edit().putLong("last", now).apply()
                Updates.newest(list, BuildConfig.VERSION_CODE)
            } catch (e: Exception) {
                if (tell) toast("Couldn't check for updates. Check the connection and try again.")
                busy = false
                return@launch
            }
            busy = false
            when {
                rel != null -> offer(rel)
                tell -> toast("Dugout is up to date (version ${BuildConfig.VERSION_CODE}).")
            }
        }
    }

    private fun offer(rel: Updates.Release) {
        if (a.isFinishing) return
        AlertDialog.Builder(a)
            .setTitle("Update Dugout?")
            .setMessage("A new version of Dugout is ready (version ${rel.version}; you have ${BuildConfig.VERSION_CODE}). Your lineup, songs and pitch counts stay as they are.")
            .setPositiveButton("Update") { _, _ -> start(rel) }
            .setNegativeButton("Not now", null)
            .show()
    }

    private fun start(rel: Updates.Release) {
        if (a.packageManager.canRequestPackageInstalls()) { download(rel); return }
        AlertDialog.Builder(a)
            .setTitle("One-time setup")
            .setMessage("To update itself, Dugout needs your OK to install apps. On the next screen, turn on \"Allow from this source\", then come back.")
            .setPositiveButton("Continue") { _, _ ->
                pending = rel
                try { a.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.packageName))) }
                catch (e: Exception) { pending = null; toast("Couldn't open that setting.") }
            }
            .setNegativeButton("Not now", null)
            .show()
    }

    private fun download(rel: Updates.Release) {
        busy = true
        val dlg = AlertDialog.Builder(a).setTitle("Updating Dugout").setMessage("Downloading…").setCancelable(false).show()
        a.lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                try { Result.success(fetch(rel) { pct -> a.runOnUiThread { dlg.setMessage("Downloading… $pct%") } }) }
                catch (e: Exception) { Result.failure(e) }
            }
            busy = false
            dlg.dismiss()
            val apk = result.getOrNull()
            when {
                apk == null -> toast("The update didn't download. Try again later.")
                !a.isFinishing -> openInstaller(apk)
            }
        }
    }

    /** downloads the release's APK into Dugout's cache and checks it is this app at that version */
    private fun fetch(rel: Updates.Release, progress: (Int) -> Unit): File {
        val dir = File(a.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // an older download
        val file = File(dir, "dugout-${rel.version}.apk")
        val conn = open(rel.apkUrl)
        try {
            if (conn.responseCode != 200) throw IllegalStateException("HTTP " + conn.responseCode)
            val len = conn.contentLengthLong
            if (len > MAX_BYTES) throw IllegalStateException("too big")
            conn.inputStream.use { input ->
                file.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    var total = 0L
                    var shown = -1
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_BYTES) throw IllegalStateException("too big")
                        out.write(buf, 0, n)
                        if (len > 0) { val pct = (total * 100 / len).toInt(); if (pct != shown) { shown = pct; progress(pct) } }
                    }
                    if (len > 0 && total != len) throw IllegalStateException("short download")
                }
            }
        } catch (e: Exception) {
            file.delete(); throw e
        } finally { conn.disconnect() }
        @Suppress("DEPRECATION")
        val info = a.packageManager.getPackageArchiveInfo(file.path, 0)
        val code = info?.longVersionCode ?: -1L
        if (info?.packageName != a.packageName || code != rel.version.toLong()) { file.delete(); throw IllegalStateException("not this app") }
        return file
    }

    /** opens Android's installer on the downloaded APK, from Dugout's own screen */
    private fun openInstaller(apk: File) {
        val uri = FileProvider.getUriForFile(a, a.packageName + AUTHORITY_SUFFIX, apk)
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, APK_MIME).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try { a.startActivity(i) } catch (e: ActivityNotFoundException) { toast("Couldn't open Android's installer.") }
    }

    private fun toast(s: String) = Toast.makeText(a, s, Toast.LENGTH_LONG).show()

    private fun open(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000; c.readTimeout = 30_000
        c.instanceFollowRedirects = true // GitHub hands the file over from its download host
        c.setRequestProperty("User-Agent", "Dugout")
        c.setRequestProperty("Accept", "application/vnd.github+json")
        return c
    }

    private fun get(url: String): String {
        val c = open(url)
        try {
            if (c.responseCode != 200) throw IllegalStateException("HTTP " + c.responseCode)
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally { c.disconnect() }
    }
}
