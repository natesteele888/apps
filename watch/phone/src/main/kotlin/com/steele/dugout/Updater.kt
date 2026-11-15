package com.steele.dugout

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.steele.dugout.shared.Updates
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

/**
 * Keeps Dugout up to date: when the app opens (at most every few hours) it asks GitHub for the newest Dugout release,
 * offers it in a pop-up, downloads it and hands it to Android's installer, which shows its own "Update this app?" screen.
 * Android only installs it over this copy if it is signed with the same key, so nothing else can slip in this way.
 */
class Updater(private val a: MainActivity) {
    companion object {
        private const val PREFS = "updates"
        private const val EVERY_MS = 6L * 60 * 60 * 1000
        private const val MAX_BYTES = 200L * 1024 * 1024

        /** the result of an install, from [UpdateStatusActivity] */
        fun onStatus(act: Activity, i: Intent) {
            when (i.getIntExtra(PackageInstaller.EXTRA_STATUS, Int.MIN_VALUE)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    val confirm: Intent? = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    else @Suppress("DEPRECATION") i.getParcelableExtra(Intent.EXTRA_INTENT)
                    if (confirm != null) try { act.startActivity(confirm) } catch (e: Exception) { toast(act, "Couldn't open the installer.") }
                }
                PackageInstaller.STATUS_SUCCESS -> Unit // Android restarts Dugout on the new version
                PackageInstaller.STATUS_FAILURE_ABORTED -> {
                    act.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("last", 0).apply()
                    toast(act, "Update cancelled. Dugout will offer it again next time.")
                }
                PackageInstaller.STATUS_FAILURE_CONFLICT, PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
                    toast(act, "This copy of Dugout came from an older build, so it can't update itself. Uninstall it and install the newest Dugout once.")
                else -> toast(act, "The update didn't install. " + (i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""))
            }
        }

        private fun toast(c: Context, s: String) = Toast.makeText(c, s.trim(), Toast.LENGTH_LONG).show()
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
                if (tell) toast(a, "Couldn't check for updates. Check the connection and try again.")
                busy = false
                return@launch
            }
            busy = false
            when {
                rel != null -> offer(rel)
                tell -> toast(a, "Dugout is up to date (version ${BuildConfig.VERSION_CODE}).")
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
                catch (e: Exception) { pending = null; toast(a, "Couldn't open that setting.") }
            }
            .setNegativeButton("Not now", null)
            .show()
    }

    private fun download(rel: Updates.Release) {
        busy = true
        val dlg = AlertDialog.Builder(a).setTitle("Updating Dugout").setMessage("Downloading…").setCancelable(false).show()
        a.lifecycleScope.launch {
            val err = withContext(Dispatchers.IO) {
                try { install(rel) { pct -> a.runOnUiThread { dlg.setMessage("Downloading… $pct%") } }; null } catch (e: Exception) { e }
            }
            busy = false
            dlg.dismiss()
            if (err != null) toast(a, "The update didn't download. Try again later.")
        }
    }

    /** streams the APK into an install session and commits it; Android then asks to confirm */
    private fun install(rel: Updates.Release, progress: (Int) -> Unit) {
        val conn = open(rel.apkUrl)
        try {
            if (conn.responseCode != 200) throw IllegalStateException("HTTP " + conn.responseCode)
            val len = conn.contentLengthLong
            if (len > MAX_BYTES) throw IllegalStateException("too big")
            val pi = a.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(a.packageName)
                if (len > 0) setSize(len)
            }
            val id = pi.createSession(params)
            val session = pi.openSession(id)
            try {
                conn.inputStream.use { input ->
                    session.openWrite("dugout.apk", 0, if (len > 0) len else -1).use { out ->
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
                        session.fsync(out)
                    }
                }
                val target = Intent(a, UpdateStatusActivity::class.java)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                session.commit(PendingIntent.getActivity(a, id, target, flags).intentSender)
                session.close()
            } catch (e: Exception) {
                session.abandon()
                throw e
            }
        } finally { conn.disconnect() }
    }

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
