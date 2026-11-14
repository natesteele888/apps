package com.steele.dugout

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * Dugout's main screen: the Walk-Up web app, full screen, with a thin bar on top that shows the speaker and has
 * Pocket mode and the Watch settings. The music plays here, on the phone; the watch is a remote.
 */
class MainActivity : ComponentActivity() {
    companion object {
        const val HOST = "natesteele888.github.io"
        const val WALKUP = "https://natesteele888.github.io/apps/walkup/"
        const val BALLCLUB = "https://natesteele888.github.io/lybs-ballclub/"
        const val EXTRA_OPEN = "open"

        /** the newest state the page sent, for the Watch settings screen */
        @Volatile var lastState: String? = null
    }

    lateinit var web: WebView
    lateinit var link: WearLink
    lateinit var tts: Tts
    private lateinit var speaker: SpeakerWatch
    private lateinit var speakerText: TextView
    private lateinit var pocket: View
    private val main = Handler(Looper.getMainLooper())

    /** true while the page is ours (Walk-Up or Ballclub on natesteele888.github.io); the bridge ignores any other page */
    @Volatile var pageOk = false
    @Volatile private var pageReady = false
    private var pendingFiles: ValueCallback<Array<Uri>>? = null
    private var pendingMic: PermissionRequest? = null

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = pendingFiles ?: return@registerForActivityResult
        pendingFiles = null
        val uris = ArrayList<Uri>()
        val d = res.data
        if (res.resultCode == RESULT_OK && d != null) {
            val clip = d.clipData
            if (clip != null) for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
            else d.data?.let { uris.add(it) }
        }
        cb.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }
    private val askMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val r = pendingMic ?: return@registerForActivityResult
        pendingMic = null
        if (ok) r.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else r.deny()
    }
    private val askNotify = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    private val openWatch = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        when (res.data?.getStringExtra(EXTRA_OPEN)) {
            "ballclub" -> web.loadUrl(BALLCLUB)
            "walkup" -> web.loadUrl(WALKUP)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        tts = Tts(this)
        link = WearLink(this)

        val root = FrameLayout(this)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(bar(), LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        web = WebView(this)
        col.addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        root.addView(col, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        pocket = pocketOverlay()
        root.addView(pocket, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)

        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(false)
        }
        web.setBackgroundColor(Color.parseColor("#0B1220"))
        web.addJavascriptInterface(Bridge(this), "WalkupNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                if (u.scheme == "https" && u.host == HOST) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (e: ActivityNotFoundException) { /* nothing can open it */ }
                return true
            }
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                // The store's "install this app" prompt makes no sense inside the app.
                if (req.url.host == HOST && req.url.path == "/apps/install.js") return WebResourceResponse("text/javascript", "utf-8", ByteArrayInputStream(ByteArray(0)))
                return null
            }
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                val u = url?.let { Uri.parse(it) }
                pageOk = u != null && u.scheme == "https" && u.host == HOST
                pageReady = false
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                pendingFiles?.onReceiveValue(null)
                pendingFiles = cb
                val i = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE)
                val types = mimeTypes(params.acceptTypes)
                i.type = if (types.size == 1) types[0] else "*/*"
                if (types.size > 1) i.putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                return try { pickFiles.launch(i); true } catch (e: ActivityNotFoundException) { pendingFiles = null; cb.onReceiveValue(null); false }
            }
            override fun onPermissionRequest(req: PermissionRequest) {
                val ours = req.origin.host == HOST && req.origin.scheme == "https"
                if (!ours || !req.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { req.deny(); return }
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else { pendingMic?.deny(); pendingMic = req; askMic.launch(Manifest.permission.RECORD_AUDIO) }
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    pocket.visibility == View.VISIBLE -> Unit // locked
                    web.canGoBack() -> web.goBack()
                    else -> moveTaskToBack(true) // keep the music and the watch link alive
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(WALKUP)
        speaker = SpeakerWatch(this) { on, name -> showSpeaker(on, name); link.resendState() }
        speaker.start()
        link.start()
        KeepAliveService.start(this)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); web.saveState(out) }

    override fun onDestroy() {
        link.stop(); speaker.stop(); tts.shutdown()
        if (isFinishing) KeepAliveService.stop(this)
        web.destroy()
        super.onDestroy()
    }

    /* ---------- the top bar ---------- */
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun bar(): View {
        val b = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#111A2E")); setPadding(dp(12), dp(4), dp(6), dp(4))
        }
        speakerText = TextView(this).apply { textSize = 14f; setTextColor(Color.WHITE); maxLines = 1 }
        b.addView(speakerText, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        fun btn(label: String, onClick: () -> Unit) = Button(this).apply {
            text = label; isAllCaps = false; textSize = 14f; setOnClickListener { onClick() }
            minHeight = dp(40); minimumHeight = dp(40)
        }
        b.addView(btn("Pocket") { setPocket(true) })
        b.addView(btn("Watch") { openWatch.launch(Intent(this, WatchActivity::class.java)) })
        showSpeaker(false, "")
        return b
    }

    private fun showSpeaker(on: Boolean, name: String) {
        speakerText.text = if (on) "●  " + (name.ifBlank { "Bluetooth speaker" }) else "○  No Bluetooth speaker"
        speakerText.setTextColor(if (on) Color.parseColor("#4ADE80") else Color.parseColor("#FBBF24"))
    }

    fun speakerJson(): JSONObject = JSONObject().put("on", speaker.on).put("name", speaker.name)

    /* ---------- Pocket mode: a black screen that ignores touches; hold 1.5 seconds to unlock ---------- */
    @SuppressLint("ClickableViewAccessibility")
    private fun pocketOverlay(): View {
        val v = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); visibility = View.GONE; isClickable = true; isFocusable = true }
        val t = TextView(this).apply {
            text = "Pocket mode\n\nMusic and the watch keep working.\n\nHold anywhere for 1.5 seconds to unlock."
            setTextColor(Color.parseColor("#64748B")); textSize = 16f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(32), 0, dp(32), 0)
        }
        v.addView(t, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        val unlock = Runnable { setPocket(false) }
        v.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> main.postDelayed(unlock, 1500)
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> main.removeCallbacks(unlock)
            }
            true
        }
        return v
    }

    private fun setPocket(on: Boolean) {
        pocket.visibility = if (on) View.VISIBLE else View.GONE
        window.attributes = window.attributes.apply { screenBrightness = if (on) 0.01f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE }
    }

    /* ---------- the page and the watch ---------- */
    fun runJs(js: String) = main.post { web.evaluateJavascript(js, null) }

    fun toPage(cmdJson: String) = runJs("window.__wuCmd&&window.__wuCmd(" + JSONObject.quote(cmdJson) + ")")

    /** from the page (any thread): who is up, the order, what is playing */
    fun onPageState(json: String) {
        val o = try { JSONObject(json) } catch (e: Exception) { return }
        main.post {
            o.put("speaker", speakerJson())
            val s = o.toString()
            lastState = s
            link.sendState(s)
            if (!pageReady) { pageReady = true; link.pullPitch() }
        }
    }

    fun onPagePitch(json: String) = main.post { link.putPitch(json) }

    /** a command from the watch */
    fun fromWatch(json: String) {
        val o = try { JSONObject(json) } catch (e: Exception) { return }
        if (o.optString("cmd") == "hello") {
            val s = lastState
            if (s != null && pageReady) link.sendState(s) else link.sendState(JSONObject().put("ready", false).put("speaker", speakerJson()).toString())
        }
        if (pageReady) toPage(json)
    }

    /** the watch's pitch log (it counted while the phone wasn't listening, or just now) */
    fun pitchFromWatch(json: String) {
        if (!pageReady) return // pulled again once the page is ready
        val log = try { JSONObject(json) } catch (e: Exception) { return }
        toPage(JSONObject().put("cmd", "pitchlog").put("log", log).toString())
    }

    private fun mimeTypes(accept: Array<String>?): List<String> {
        val out = LinkedHashSet<String>()
        for (raw in accept ?: emptyArray()) for (a in raw.split(',')) {
            val t = a.trim().lowercase()
            if (t.isEmpty()) continue
            if (t.startsWith(".")) {
                val m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(t.substring(1)) ?: return listOf("*/*")
                out.add(m)
            } else out.add(t)
        }
        return if (out.isEmpty()) listOf("*/*") else out.toList()
    }
}
