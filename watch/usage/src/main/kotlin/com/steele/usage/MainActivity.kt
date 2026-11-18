package com.steele.usage

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * Steele Usage on the phone: the Steele Usage web page full screen (GitHub Actions minutes), plus Claude.
 *
 * Claude: you sign in to claude.ai once, inside this app, the way FireUsage does. The sign-in stays in this app's own
 * web storage on the phone (no backup, nothing logged, nothing sent anywhere else). To fill the Claude card, a hidden
 * claude.ai page asks Claude for your usage and this app passes the page only four values: the 5-hour and weekly
 * percent and when each resets.
 */
class MainActivity : ComponentActivity() {
    companion object {
        const val HOST = "natesteele888.github.io"
        const val PAGE = "https://natesteele888.github.io/apps/usage/"
        const val CLAUDE = "claude.ai"
        const val ORGS = "https://claude.ai/api/organizations"
        const val LOGIN = "https://claude.ai/login"
        private val STAMP = Regex("^[0-9T:.+\\-Z]{10,40}$")

        /** Runs on claude.ai: finds your organization, asks for its usage, leaves the answer in window.__su. */
        private const val READ_JS = """(function(){window.__su=null;var t=document.body?document.body.innerText:'',o;
try{o=JSON.parse(t)}catch(e){window.__su={state:'error'};return 1}
if(!Array.isArray(o)){window.__su={state:(o&&o.type==='error')?'signedout':'error'};return 1}
if(!o.length){window.__su={state:'error'};return 1}
var g=o.find(function(x){return (x.capabilities||[]).indexOf('chat')>=0})||o[0];
fetch('/api/organizations/'+g.uuid+'/usage',{credentials:'include',headers:{accept:'application/json'}})
.then(function(r){if(r.status===401||r.status===403){window.__su={state:'signedout'};return}
if(!r.ok){window.__su={state:'error'};return}return r.json().then(function(j){window.__su={state:'ok',j:j}})})
.catch(function(){window.__su={state:'error'}});return 1})()"""
    }

    private lateinit var root: FrameLayout
    private lateinit var page: WebView
    private var reader: WebView? = null
    private var signIn: WebView? = null
    private val ui = Handler(Looper.getMainLooper())
    private var reading = false
    private var readId = 0
    private var last: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#0B0F17")) }
        page = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0F17"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(Bridge(), "SteeleApp")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    val u = req.url
                    if (u.scheme == "https" && u.host == HOST && (u.path ?: "").startsWith("/apps/usage/")) return false
                    openOutside(u); return true
                }
                override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                    // the "add to home screen" prompt makes no sense inside the app
                    if (req.url.host == HOST && req.url.path == "/apps/install.js") return WebResourceResponse("text/javascript", "utf-8", ByteArrayInputStream(ByteArray(0)))
                    return null
                }
                override fun onPageFinished(view: WebView, url: String?) { last?.let { send(it) } ?: readClaude() }
            }
        }
        root.addView(page, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val s = signIn
                when {
                    s != null && s.canGoBack() -> s.goBack()
                    s != null -> closeSignIn(false)
                    page.canGoBack() -> page.goBack()
                    else -> finish()
                }
            }
        })
        page.loadUrl(PAGE)
    }

    override fun onResume() { super.onResume(); if (signIn == null) readClaude() }

    override fun onPause() { super.onPause(); CookieManager.getInstance().flush() }

    /** What the Steele Usage page may ask for. No method takes anything from the page. */
    inner class Bridge {
        @JavascriptInterface fun refreshClaude() { ui.post { readClaude() } }
        @JavascriptInterface fun signIn() { ui.post { openSignIn() } }
        @JavascriptInterface fun signOut() { ui.post { signOutClaude() } }
    }

    /** Any Claude cookies at all on this phone. Whether they still sign you in, Claude itself answers when asked. */
    private fun hasClaudeSignIn(): Boolean = !CookieManager.getInstance().getCookie("https://$CLAUDE").isNullOrBlank()

    @SuppressLint("SetJavaScriptEnabled")
    private fun readClaude() {
        if (reading || signIn != null) return
        if (!hasClaudeSignIn()) { send("""{"state":"signedout"}"""); return }
        reading = true
        val id = ++readId
        val w = reader ?: WebView(this).also { v ->
            reader = v
            v.settings.javaScriptEnabled = true
            v.settings.domStorageEnabled = true
            v.visibility = View.INVISIBLE
            root.addView(v, 0, FrameLayout.LayoutParams(1, 1))
        }
        w.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                if (id != readId || url == null || !url.startsWith(ORGS)) return
                view.evaluateJavascript(READ_JS, null)
                poll(view, id, 0)
            }
        }
        w.loadUrl(ORGS)
        ui.postDelayed({ if (reading && id == readId) done(id, """{"state":"error"}""") }, 25_000)
    }

    private fun poll(view: WebView, id: Int, tries: Int) {
        ui.postDelayed({
            if (id != readId || !reading) return@postDelayed
            view.evaluateJavascript("JSON.stringify(window.__su)") { raw ->
                val txt = try { if (raw == null || raw == "null") null else JSONArray("[$raw]").optString(0, null) } catch (e: Exception) { null }
                when {
                    txt != null && txt != "null" -> done(id, numbersOnly(txt))
                    tries < 40 -> poll(view, id, tries + 1)
                    else -> done(id, """{"state":"error"}""")
                }
            }
        }, 400)
    }

    /** Keeps only the 5-hour and weekly percent and reset times from Claude's answer. */
    private fun numbersOnly(txt: String): String {
        return try {
            val o = JSONObject(txt)
            val state = o.optString("state")
            if (state != "ok") return JSONObject().put("state", if (state == "signedout") "signedout" else "error").toString()
            val j = o.optJSONObject("j") ?: return """{"state":"error"}"""
            fun win(k: String): JSONObject? {
                val w = j.optJSONObject(k) ?: return null
                val pct = w.optDouble("utilization", Double.NaN)
                if (pct.isNaN()) return null
                val reset = w.optString("resets_at", "").takeIf { STAMP.matches(it) } ?: ""
                return JSONObject().put("pct", pct).put("reset", reset)
            }
            val five = win("five_hour"); val week = win("seven_day")
            if (five == null && week == null) return """{"state":"error"}"""
            JSONObject().put("state", "ok").put("five", five ?: JSONObject()).put("week", week ?: JSONObject()).toString()
        } catch (e: Exception) { """{"state":"error"}""" }
    }

    private fun done(id: Int, json: String) {
        if (id != readId) return
        reading = false
        reader?.loadUrl("about:blank")
        send(json)
    }

    private fun send(json: String) {
        last = json
        page.evaluateJavascript("window.steeleClaude&&window.steeleClaude($json)", null)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun openSignIn() {
        if (signIn != null) return
        readId++; reading = false
        val w = WebView(this).apply {
            setBackgroundColor(Color.WHITE)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    val u = req.url
                    return u.scheme != "https"   // stays in the sign-in screen; nothing else opens from here
                }
                override fun onPageFinished(view: WebView, url: String?) = check(url)
                // Claude moves between its own pages without a full load, so watch the address too.
                override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) = check(url)
                private fun check(url: String?) {
                    val u = url?.let { Uri.parse(it) } ?: return
                    val path = u.path ?: ""
                    val stillSigningIn = listOf("/login", "/magic-link", "/api", "/oauth", "/verify", "/sso").any { path.startsWith(it) }
                    // Back on Claude past the sign-in pages means you're signed in.
                    if (u.host == CLAUDE && !stillSigningIn && hasClaudeSignIn() && signIn != null) ui.post { closeSignIn(true) }
                }
            }
        }
        signIn = w
        root.addView(w, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        w.loadUrl(LOGIN)
    }

    private fun closeSignIn(signedIn: Boolean) {
        val w = signIn ?: return
        signIn = null
        CookieManager.getInstance().flush()
        root.removeView(w); w.destroy()
        last = null
        if (signedIn) { send("""{"state":"loading"}"""); readClaude() } else readClaude()
    }

    private fun signOutClaude() {
        readId++; reading = false
        val cm = CookieManager.getInstance()
        cm.removeAllCookies { cm.flush(); send("""{"state":"signedout"}""") }
    }

    private fun openOutside(u: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (e: ActivityNotFoundException) { /* nothing can open it */ }
    }

    override fun onDestroy() {
        reader?.destroy(); signIn?.destroy(); page.destroy()
        super.onDestroy()
    }
}
