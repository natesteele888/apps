package com.steele.dugout

import android.Manifest
import android.util.Log
import android.view.View
import android.webkit.WebView
import androidx.core.view.WindowInsetsCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Dugout's top bar has to sit below the phone's status bar, and the page has to end above the navigation bar. */
@RunWith(AndroidJUnit4::class)
class TopBarTest {
    @get:Rule val notify: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)

    @Test fun topBarClearsTheStatusBar() {
        ActivityScenario.launch(MainActivity::class.java).use { s ->
            Thread.sleep(4000)
            s.onActivity { a ->
                val decor = a.window.decorView
                val ins = WindowInsetsCompat.toWindowInsetsCompat(decor.rootWindowInsets, decor)
                val status = ins.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()).top
                val nav = ins.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
                val screenH = decor.height

                val bar = decor.findViewWithTag<View>(MainActivity.TOP_BAR_TAG)
                val at = IntArray(2).also { bar.getLocationOnScreen(it) }
                val web = findWeb(decor)!!
                val wat = IntArray(2).also { web.getLocationOnScreen(it) }
                val webBottom = wat[1] + web.height
                Log.i("TopBarTest", "status=$status nav=$nav screen=$screenH barTop=${at[1]} barH=${bar.height} webTop=${wat[1]} webBottom=$webBottom")

                assertTrue("the phone reports no status bar", status > 0)
                assertTrue("top bar starts at ${at[1]}px, under the status bar (${status}px)", at[1] >= status)
                assertTrue("page ends at ${webBottom}px, under the navigation bar (starts at ${screenH - nav}px)", webBottom <= screenH - nav)
            }
        }
    }

    private fun findWeb(v: View): WebView? {
        if (v is WebView) return v
        if (v is android.view.ViewGroup) for (i in 0 until v.childCount) findWeb(v.getChildAt(i))?.let { return it }
        return null
    }
}
