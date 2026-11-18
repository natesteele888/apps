package com.steele.dugout

import android.content.Context
import android.content.pm.PackageManager
import com.steele.dugout.shared.Updates
import dadb.AdbKeyPair
import dadb.Dadb
import dadb.InstallResult
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Puts the newest Dugout watch app on the watch, straight from this phone, so no computer is needed.
 *
 * Wear OS watches have no installer of their own for apps from outside the Play Store, so this does what a computer does
 * with `adb install`: it talks to the watch's "Debug over Wi-Fi" on the home Wi-Fi. The first time, the watch asks
 * "Allow debugging?" for this phone; tick "Always allow" and tap OK. The phone's key for that stays in Dugout's own files.
 *
 * Only the dugout-watch.apk from this repo's releases is installed, and only after checking it is the Dugout watch app.
 * Android on the watch also refuses it unless it is signed with the same key as the copy already there.
 */
object WatchInstaller {
    const val PORT = 5555
    private const val PREFS = "watch-install"
    private const val WATCH_APK = "dugout-watch.apk"
    private const val MAX_BYTES = 200L * 1024 * 1024

    class Problem(msg: String) : Exception(msg)

    /** the watch's address as typed ("192.168.1.141" or "192.168.1.141:5555"), or null if it isn't one */
    fun parse(input: String): Pair<String, Int>? {
        val m = Regex("^\\s*(\\d{1,3}(?:\\.\\d{1,3}){3})(?::(\\d{1,5}))?\\s*$").matchEntire(input) ?: return null
        val parts = m.groupValues[1].split(".").map { it.toInt() }
        if (parts.any { it > 255 }) return null
        // only a home network address: this never reaches out to the internet
        val home = parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && parts[1] in 16..31)
        if (!home) return null
        val port = m.groupValues[2].ifEmpty { "$PORT" }.toInt()
        if (port !in 1..65535) return null
        return m.groupValues[1] to port
    }

    fun savedAddress(c: Context): String = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("addr", "") ?: ""
    fun saveAddress(c: Context, addr: String) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("addr", addr.trim()).apply()

    /** this phone's debugging key, made the first time */
    fun keyPair(c: Context): AdbKeyPair {
        val dir = File(c.filesDir, "adb").apply { mkdirs() }
        val priv = File(dir, "adbkey")
        val pub = File(dir, "adbkey.pub")
        if (!priv.exists() || !pub.exists()) AdbKeyPair.generate(priv, pub)
        return AdbKeyPair.read(priv, pub)
    }

    /** connects to the watch; the first time, the watch asks to allow this phone, so there is a minute to answer */
    fun connect(c: Context, host: String, port: Int): Dadb = Dadb.create(host, port, keyPair(c), 8_000, 90_000)

    /** the newest published watch build */
    fun newest(): Updates.Release {
        val list = JSONArray(get(Updates.LIST_URL))
        return Updates.newest(list, 0, WATCH_APK) ?: throw Problem("There's no watch build published yet.")
    }

    /** the Dugout watch app's version on the watch, or 0 when it isn't there */
    fun installedVersion(d: Dadb, pkg: String): Long {
        val out = d.shell("dumpsys package $pkg").allOutput
        return Regex("versionCode=(\\d+)").find(out)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
    }

    /** downloads the watch build into Dugout's cache and checks it is the Dugout watch app at that version */
    fun fetch(c: Context, rel: Updates.Release, progress: (Int) -> Unit): File {
        val dir = File(c.cacheDir, "watch").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "dugout-watch-${rel.version}.apk")
        val conn = open(rel.apkUrl)
        try {
            if (conn.responseCode != 200) throw Problem("The download didn't work (HTTP ${conn.responseCode}).")
            val len = conn.contentLengthLong
            if (len > MAX_BYTES) throw Problem("The download is too big.")
            conn.inputStream.use { input ->
                file.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    var total = 0L
                    var shown = -1
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_BYTES) throw Problem("The download is too big.")
                        out.write(buf, 0, n)
                        if (len > 0) { val pct = (total * 100 / len).toInt(); if (pct != shown) { shown = pct; progress(pct) } }
                    }
                    if (len > 0 && total != len) throw Problem("The download was cut short.")
                }
            }
        } catch (e: Exception) { file.delete(); throw e } finally { conn.disconnect() }
        if (!isWatchBuild(c, file, rel.version.toLong())) { file.delete(); throw Problem("That download isn't the Dugout watch app.") }
        return file
    }

    /** the same app id as this phone app, the right version, and made for watches only */
    fun isWatchBuild(c: Context, apk: File, version: Long): Boolean {
        @Suppress("DEPRECATION")
        val info = c.packageManager.getPackageArchiveInfo(apk.path, PackageManager.GET_CONFIGURATIONS) ?: return false
        val watch = info.reqFeatures?.any { it.name == PackageManager.FEATURE_WATCH } == true
        return info.packageName == c.packageName && info.longVersionCode == version && watch
    }

    /** installs over the copy on the watch; throws [Problem] with the watch's own reason when it says no */
    fun install(d: Dadb, apk: File) {
        val r = d.install(apk, "-r")
        if (r is InstallResult.Failure) throw Problem("The watch said no: " + r.reason.trim().take(200))
    }

    private fun open(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000; c.readTimeout = 30_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "Dugout")
        c.setRequestProperty("Accept", "application/vnd.github+json")
        return c
    }

    private fun get(url: String): String {
        val c = open(url)
        try {
            if (c.responseCode != 200) throw Problem("Couldn't check for a watch build (HTTP ${c.responseCode}).")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally { c.disconnect() }
    }
}
