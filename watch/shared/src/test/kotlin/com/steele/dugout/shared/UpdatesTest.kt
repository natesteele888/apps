package com.steele.dugout.shared

import org.json.JSONArray
import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class UpdatesTest {
    private fun rel(tag: String, apk: String = "dugout-phone.apk", url: String? = null, draft: Boolean = false, pre: Boolean = false) =
        JSONObject().put("tag_name", tag).put("draft", draft).put("prerelease", pre).put(
            "assets", JSONArray().put(JSONObject().put("name", apk).put("browser_download_url", url ?: (Updates.DOWNLOAD_PREFIX + "$tag/$apk")))
        )

    @Test fun picksTheNewestAboveCurrent() {
        val list = JSONArray().put(rel("dugout-v12")).put(rel("dugout-v15")).put(rel("dugout-v14"))
        assertEquals(15, Updates.newest(list, 12)?.version)
        assertEquals(Updates.DOWNLOAD_PREFIX + "dugout-v15/dugout-phone.apk", Updates.newest(list, 12)?.apkUrl)
        assertNull(Updates.newest(list, 15))
    }

    @Test fun skipsOtherTagsDraftsAndStrangeLinks() {
        val list = JSONArray()
            .put(rel("v99"))
            .put(rel("dugout-v20", draft = true))
            .put(rel("dugout-v21", pre = true))
            .put(rel("dugout-v22", apk = "dugout-watch.apk"))
            .put(rel("dugout-v23", url = "https://example.com/dugout-phone.apk"))
            .put(rel("dugout-v24", url = Updates.DOWNLOAD_PREFIX + "dugout-v1/dugout-phone.apk"))
        assertNull(Updates.newest(list, 1))
        assertEquals(22, Updates.newest(list, 1, apk = "dugout-watch.apk")?.version)
        assertNull(Updates.version("dugout-v"))
        assertEquals(7, Updates.version("dugout-v7"))
    }
}
