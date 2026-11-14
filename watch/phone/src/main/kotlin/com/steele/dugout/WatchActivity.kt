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
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import com.steele.dugout.shared.Paths
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Watch and pitching settings on the phone: is the watch connected, a background photo for each batter (kept on this phone
 * and the watch only), and a way to open LYBS Ballclub inside Dugout so Walk-Up can read your pitchers and pitch counts.
 */
class WatchActivity : ComponentActivity() {
    private lateinit var list: LinearLayout
    private lateinit var watchText: TextView
    private var photoFor: String? = null

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
        col.addView(text("\nBatter photos", 18f))
        col.addView(text("A photo shows behind the batter's name on the watch. Photos stay on this phone and the watch.", 14f, Color.parseColor("#94A3B8")))
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(list)
        col.addView(text("\nPitching", 18f))
        col.addView(text("Walk-Up reads your pitchers and logged pitch counts from LYBS Ballclub on this phone. Inside Dugout, open your team in Ballclub once, then come back to Walk-Up.", 14f, Color.parseColor("#94A3B8")))
        col.addView(button("Open LYBS Ballclub here") { done("ballclub") })
        col.addView(button("Back to Walk-Up") { done("walkup") })
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0B1220")); addView(col) })
        refresh()
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
