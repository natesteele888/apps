package com.steele.dugout

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.ByteArrayInputStream

/**
 * Field mode: the tablet at the field. Walk-Up's Field mode page (walkup/field.html), full screen with the system bars
 * hidden, the screen kept on, and the app pinned so a kid can't wander off it (Android asks once, and holding Back and
 * Overview unpins it). The page gets Android's text-to-speech for the announcer, since the web view has none, and nothing
 * else: no watch link and no file saving. Links off natesteele888.github.io open in the browser.
 */
class FieldActivity : ComponentActivity() {
    companion object {
        const val FIELD = "https://natesteele888.github.io/apps/walkup/field.html"
        private const val PREFS = "field"

        fun pinOn(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("pin", true)
        fun setPin(ctx: Context, on: Boolean) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("pin", on).apply()

        fun open(ctx: Context) = ctx.startActivity(Intent(ctx, FieldActivity::class.java))

        /** a "Field mode" icon on the tablet's home screen that opens straight here; false if the launcher can't add one */
        fun addHomeIcon(ctx: Context): Boolean {
            if (!ShortcutManagerCompat.isRequestPinShortcutSupported(ctx)) return false
            val info = ShortcutInfoCompat.Builder(ctx, "field-mode")
                .setShortLabel("Field mode")
                .setLongLabel("Walk-Up Field mode")
                .setIcon(IconCompat.createWithResource(ctx, R.mipmap.ic_launcher))
                .setIntent(Intent(ctx, FieldActivity::class.java).setAction(Intent.ACTION_VIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
                .build()
            return ShortcutManagerCompat.requestPinShortcut(ctx, info, null)
        }
    }

    private lateinit var web: WebView
    private lateinit var tts: Tts
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var pageOk = false

    /** what field.js calls as window.WalkupNative: the announcer's voice only */
    inner class FieldBridge {
        @JavascriptInterface fun ttsSpeak(id: String, text: String, rate: Double, vol: Double) { if (pageOk) tts.speak(id.take(40), text.take(400), rate, vol) }
        @JavascriptInterface fun ttsStop() { if (pageOk) tts.stop() }
    }

    private fun runJs(js: String) = main.post { if (!isDestroyed) web.evaluateJavascript(js, null) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        volumeControlStream = AudioManager.STREAM_MUSIC
        tts = Tts(this) { runJs(it) }

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0A0D12"))
        setContentView(web)
        fullScreen()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
        }
        web.addJavascriptInterface(FieldBridge(), "WalkupNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                if (u.scheme == "https" && u.host == MainActivity.HOST) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (e: ActivityNotFoundException) { /* nothing can open it */ }
                return true
            }
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                if (req.url.host == MainActivity.HOST && req.url.path == "/apps/install.js") return WebResourceResponse("text/javascript", "utf-8", ByteArrayInputStream(ByteArray(0)))
                return null
            }
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                val u = url?.let { Uri.parse(it) }
                pageOk = u != null && u.scheme == "https" && u.host == MainActivity.HOST
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            // Back goes back inside Field mode (a game to today's list, settings to where they came from); from the top it
            // leaves, unless the tablet is pinned
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(function(){var b=document.querySelector('.fm-top [data-a=home],.fm-top [data-a=back]');if(b){b.click();return 1}return 0})()") { r ->
                    if (r != "1" && !pinned()) finish()
                }
            }
        })
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(FIELD)
    }

    override fun onResume() {
        super.onResume()
        fullScreen()
        if (pinOn(this) && !pinned()) try { startLockTask() } catch (e: Exception) { /* this tablet doesn't allow pinning */ }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) fullScreen() }

    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); web.saveState(out) }

    override fun onDestroy() {
        tts.shutdown()
        web.destroy()
        super.onDestroy()
    }

    private fun pinned(): Boolean = (getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE

    private fun fullScreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
