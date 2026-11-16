package com.steele.dugout

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import com.steele.dugout.shared.Gc
import com.steele.dugout.shared.Paths
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Watch and pitching settings on the phone: is the watch connected, a background photo for each batter (kept on this phone
 * and the watch only), the GameChanger team for GC Scores on the watch, and a way to open LYBS Ballclub inside Dugout so Walk-Up
 * can read your pitchers and pitch counts.
 */
class WatchActivity : ComponentActivity() {
    private lateinit var list: LinearLayout
    private lateinit var watchText: TextView
    private var photoFor: String? = null
    private lateinit var gcText: TextView
    private lateinit var gcInput: EditText
    private lateinit var delayRow: LinearLayout

    private val pick = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val id = photoFor ?: return@registerForActivityResult
        photoFor = null
        if (uri != null) setPhoto(id, uri)
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun text(s: String, size: Float = 16f, color: Int = Color.WHITE) = TextView(this).apply { text = s; textSize = size; setTextColor(color) }
    private fun button(label: String, onClick: () -> Unit) = Button(this).apply { text = label; isAllCaps = false; setOnClickListener { onClick() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(32)) }
        col.addView(text("Watch and pitching", 22f))
        watchText = text("Looking for your watch…", 15f, Color.parseColor("#94A3B8"))
        col.addView(watchText)
        col.addView(text("\nSong countdown", 18f))
        col.addView(text("After the green ring closes on the watch, it counts down before the song starts. Tap the watch anywhere during the countdown to cancel, so nothing plays by mistake.", 14f, Color.parseColor("#94A3B8")))
        delayRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        col.addView(delayRow)
        showDelay()
        col.addView(text("\nBatter photos", 18f))
        col.addView(text("A photo shows behind the batter's name on the watch. Photos stay on this phone and the watch.", 14f, Color.parseColor("#94A3B8")))
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(list)
        col.addView(text("\nGameChanger team", 18f))
        col.addView(text("GC Scores on the watch shows this team's GameChanger scoreboard: the live score, the next game and recent finals. Open the team on web.gc.com, copy the page link, and paste it here.", 14f, Color.parseColor("#94A3B8")))
        gcText = text("", 15f)
        col.addView(gcText)
        gcInput = EditText(this).apply { hint = "web.gc.com/teams/… link"; setSingleLine(); setTextColor(Color.WHITE); setHintTextColor(Color.parseColor("#64748B")) }
        col.addView(gcInput, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        val gcRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        gcRow.addView(button("Send to watch") { saveGc(gcInput.text.toString()) })
        gcRow.addView(button("Remove") { saveGc(null) })
        col.addView(gcRow)
        col.addView(text("\nPitching", 18f))
        col.addView(text("Walk-Up reads your pitchers and logged pitch counts from LYBS Ballclub on this phone. Inside Dugout, open your team in Ballclub once, then come back to Walk-Up.", 14f, Color.parseColor("#94A3B8")))
        col.addView(button("Open LYBS Ballclub here") { done("ballclub") })
        col.addView(text("\nOfficial pitch counts are the ones on the MAC League website. Dugout opens it here, and remembers your team's page.", 14f, Color.parseColor("#94A3B8")))
        col.addView(button("Official counts (MAC League)") { startActivity(Intent(this, LeagueActivity::class.java)) })
        col.addView(text("\nField tablet", 18f))
        col.addView(text("For a tablet that stays at the field: it plays every Lunenburg team's walk-ups from the lineups coaches save in LYBS Select. Full screen, the screen stays on, and the app stays pinned so nobody leaves it by mistake. A board member lets the tablet in once.", 14f, Color.parseColor("#94A3B8")))
        col.addView(button("Open Field mode") { FieldActivity.open(this) })
        col.addView(button("Add Field mode to the home screen") {
            android.widget.Toast.makeText(this, if (FieldActivity.addHomeIcon(this)) "Look for the Field mode icon on the home screen." else "This tablet's home screen can't add the icon. Open Field mode from here.", android.widget.Toast.LENGTH_LONG).show()
        })
        val pin = android.widget.CheckBox(this).apply {
            text = "Keep Field mode pinned (to leave, hold Back and Overview)"; isChecked = FieldActivity.pinOn(this@WatchActivity); setTextColor(Color.WHITE)
            setOnCheckedChangeListener { _, on -> FieldActivity.setPin(this@WatchActivity, on) }
        }
        col.addView(pin)
        col.addView(text("\nDugout version ${BuildConfig.VERSION_CODE}. Dugout checks for a new version when it opens.", 14f, Color.parseColor("#94A3B8")))
        col.addView(button("Check for updates") { done("update") })
        col.addView(button("Back to Walk-Up") { done("walkup") })
        val scroll = ScrollView(this).apply { addView(col) }
        fitSystemBars(scroll, Color.parseColor("#0B1220"))
        setContentView(scroll)
        refresh()
        showGc()
    }

    /** 0 to 5 seconds; the one in use is marked */
    private fun showDelay() {
        delayRow.removeAllViews()
        val cur = MainActivity.songDelay(this)
        for (sec in 0..com.steele.dugout.shared.Proto.MAX_DELAY) {
            val b = button(if (sec == cur) "[ ${sec}s ]" else "${sec}s") { MainActivity.setSongDelay(this, sec); showDelay() }
            b.contentDescription = (if (sec == 0) "No countdown" else "$sec second countdown") + (if (sec == cur) ", chosen" else "")
            delayRow.addView(b, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        }
    }

    private fun gcPrefs() = getSharedPreferences("gc", MODE_PRIVATE)

    private fun showGc() {
        val id = gcPrefs().getString("team", "") ?: ""
        val name = gcPrefs().getString("name", "") ?: ""
        gcText.text = if (id.isEmpty()) "No team picked yet." else "On the watch: " + name.ifBlank { "team $id" }
    }

    /** checks the link with GameChanger (so a typo doesn't reach the watch), then sends the team id to the watch */
    private fun saveGc(input: String?) {
        if (input == null) {
            gcPrefs().edit().putString("team", "").putString("name", "").apply()
            lifecycleScope.launch { try { WearLink.putGcTeam(this@WatchActivity, "") } catch (e: Exception) { /* sent when the watch connects */ } }
            showGc(); return
        }
        val id = Gc.teamId(input)
        if (id == null) { Toast.makeText(this, "Paste the team's web.gc.com/teams/… link.", Toast.LENGTH_LONG).show(); return }
        gcText.text = "Checking with GameChanger…"
        lifecycleScope.launch {
            val team = withContext(Dispatchers.IO) {
                try {
                    val c = URL(Gc.teamUrl(id)).openConnection() as HttpURLConnection
                    try {
                        c.connectTimeout = 15_000; c.readTimeout = 15_000
                        c.setRequestProperty("Accept", "application/json")
                        if (c.responseCode == 404) null else Gc.parseTeam(c.inputStream.use { String(it.readBytes(), Charsets.UTF_8) })
                    } finally { c.disconnect() }
                } catch (e: Exception) { Gc.Team("", "", "") /* no signal: send it anyway */ }
            }
            if (team == null) { showGc(); Toast.makeText(this@WatchActivity, "GameChanger doesn't know that team. Check the link.", Toast.LENGTH_LONG).show(); return@launch }
            gcPrefs().edit().putString("team", id).putString("name", team.name).apply()
            gcInput.setText("")
            try { WearLink.putGcTeam(this@WatchActivity, id) } catch (e: Exception) { /* sent when the watch connects */ }
            showGc()
            Toast.makeText(this@WatchActivity, "Sent. Open GC Scores on the watch.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun done(open: String) { setResult(RESULT_OK, Intent().putExtra(MainActivity.EXTRA_OPEN, open)); finish() }

    private fun photoFile(id: String) = File(File(filesDir, "photos").apply { mkdirs() }, "$id.jpg")

    private fun refresh() {
        lifecycleScope.launch {
            val n = WearLink.watchCount(this@WatchActivity)
            watchText.text = if (n > 0) "Your watch is connected." else "No watch connected. Pair it with the Galaxy Wearable app, then open Dugout on the watch."
        }
        list.removeAllViews()
        val st = MainActivity.lastState?.let { try { JSONObject(it) } catch (e: Exception) { null } }
        val lineup = st?.optJSONArray("lineup")
        if (lineup == null || lineup.length() == 0) { list.addView(text("Set up the batting order in Walk-Up first.", 14f)); return }
        for (i in 0 until lineup.length()) {
            val b = lineup.optJSONObject(i) ?: continue
            val id = b.optString("id")
            if (!Paths.safeId(id)) continue
            val num = b.optString("num")
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(6), 0, dp(6)) }
            val img = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; setBackgroundColor(Color.parseColor("#1E293B")) }
            val f = photoFile(id)
            if (f.exists()) img.setImageBitmap(BitmapFactory.decodeFile(f.path))
            row.addView(img, LinearLayout.LayoutParams(dp(48), dp(48)))
            row.addView(text("  " + (if (num.isNotEmpty()) "#$num " else "") + b.optString("name"), 16f), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            row.addView(button(if (f.exists()) "Change" else "Add photo") { photoFor = id; pick.launch("image/*") })
            if (f.exists()) row.addView(button("Remove") { removePhoto(id) })
            list.addView(row, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }
    }

    /** a square, about 360 pixels, which is plenty for a watch and small to send */
    private fun setPhoto(id: String, uri: Uri) {
        lifecycleScope.launch {
            try {
                val jpeg = withContext(Dispatchers.IO) {
                    val src = ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, uri)) { d, info, _ ->
                        d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                        val s = maxOf(1, minOf(info.size.width, info.size.height) / 720)
                        d.setTargetSampleSize(s)
                    }
                    val side = minOf(src.width, src.height)
                    val sq = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
                    val out = Bitmap.createScaledBitmap(sq, 360, 360, true)
                    val bytes = ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.JPEG, 80, it) }.toByteArray()
                    photoFile(id).writeBytes(bytes)
                    bytes
                }
                WearLink.putPhoto(this@WatchActivity, id, jpeg)
                Toast.makeText(this@WatchActivity, "Photo set. It shows on the watch when it's connected.", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this@WatchActivity, "Couldn't use that photo.", Toast.LENGTH_SHORT).show()
            }
            refresh()
        }
    }

    private fun removePhoto(id: String) {
        photoFile(id).delete()
        lifecycleScope.launch { try { WearLink.deletePhoto(this@WatchActivity, id) } catch (e: Exception) { /* the watch removes it when it connects */ } }
        refresh()
    }
}
