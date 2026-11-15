package com.steele.dugout.shared

import org.json.JSONArray

/**
 * Which Dugout release is newer than the one installed. Releases are published by .github/workflows/watch-build.yml
 * with tags like "dugout-v42", where 42 is the build's version code, and carry dugout-phone.apk and dugout-watch.apk.
 */
object Updates {
    const val REPO = "natesteele888/apps"
    const val LIST_URL = "https://api.github.com/repos/$REPO/releases?per_page=20"
    const val DOWNLOAD_PREFIX = "https://github.com/$REPO/releases/download/"
    private val TAG = Regex("^dugout-v(\\d{1,9})$")

    data class Release(val version: Int, val apkUrl: String)

    /** the version code in a tag like "dugout-v42", or null */
    fun version(tag: String): Int? = TAG.matchEntire(tag)?.groupValues?.get(1)?.toIntOrNull()

    /**
     * The newest published release (not a draft or pre-release) with a version above [current] and the named APK
     * downloadable from this repo's releases, or null when there is none. [releases] is the GitHub releases list.
     */
    fun newest(releases: JSONArray, current: Int, apk: String = "dugout-phone.apk"): Release? {
        var best: Release? = null
        for (i in 0 until releases.length()) {
            val r = releases.optJSONObject(i) ?: continue
            if (r.optBoolean("draft") || r.optBoolean("prerelease")) continue
            val v = version(r.optString("tag_name")) ?: continue
            if (v <= current || (best != null && v <= best.version)) continue
            val assets = r.optJSONArray("assets") ?: continue
            for (j in 0 until assets.length()) {
                val a = assets.optJSONObject(j) ?: continue
                val url = a.optString("browser_download_url")
                if (a.optString("name") == apk && url == DOWNLOAD_PREFIX + "dugout-v$v/$apk") { best = Release(v, url); break }
            }
        }
        return best
    }
}
