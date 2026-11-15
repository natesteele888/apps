package com.steele.dugout

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

/**
 * The MAC League's own website, inside Dugout, so a coach sees the official pitch counts in one tap without leaving the app.
 * It's the league's page as the league shows it: Dugout doesn't read it, copy it or check it on a timer. This web view has
 * no Walk-Up bridge, and links off the league's site open in the phone's browser. Dugout remembers the last league page
 * the coach was on (only its address), so next time it opens straight to their team.
 */
class LeagueActivity : ComponentActivity() {
    companion object {
        const val HOME = "https://www.macleague.org/"
        private val HOSTS = setOf("www.macleague.org", "macleague.org")
        fun ok(u: Uri?) = u != null && u.scheme == "https" && u.host in HOSTS
    }

    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("league", Context.MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val d = resources.displayMetrics.density
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.parseColor("#0B1220")) }
        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding((8 * d).toInt(), (4 * d).toInt(), (8 * d).toInt(), (4 * d).toInt()) }
        bar.addView(Button(this).apply { text = "‹ Walk-Up"; isAllCaps = false; setOnClickListener { finish() } })
        bar.addView(TextView(this).apply {
            text = "  Official counts: MAC League"; textSize = 15f; setTextColor(Color.WHITE)
        }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { gravity = android.view.Gravity.CENTER_VERTICAL })
        bar.addView(Button(this).apply { text = "Home"; isAllCaps = false; setOnClickListener { web.loadUrl(HOME) } })
        col.addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        web = WebView(this)
        col.addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        fitSystemBars(col, Color.parseColor("#0B1220"))
        setContentView(col)

        web.settings.apply { javaScriptEnabled = true; domStorageEnabled = true; allowFileAccess = false; setSupportMultipleWindows(false) }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                if (ok(req.url)) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, req.url)) } catch (e: ActivityNotFoundException) { /* nothing can open it */ }
                return true
            }
            override fun onPageFinished(view: WebView, url: String?) {
                val u = url?.let { Uri.parse(it) }
                // keep only the page's path: no query, so no sign-in or session codes are kept
                if (ok(u) && u!!.query == null) prefs.edit().putString("last", "https://" + u.host + (u.path ?: "/")).apply()
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })
        val last = prefs.getString("last", null)?.let { Uri.parse(it) }
        web.loadUrl(if (ok(last)) last.toString() else HOME)
    }
}
