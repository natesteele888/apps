package com.steele.dugout

import android.media.AudioAttributes
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONObject

/** The announcer's computer voice: Android's own text-to-speech, standing in for the browser's (the web view has none). */
class Tts(private val a: MainActivity) {
    private var ready = false
    private var failed = false
    private val waiting = ArrayList<Array<Any>>()
    private val tts: TextToSpeech = TextToSpeech(a.applicationContext) { status ->
        a.runOnUiThread {
            ready = status == TextToSpeech.SUCCESS
            failed = !ready
            val w = ArrayList(waiting); waiting.clear()
            for (x in w) if (ready) speak(x[0] as String, x[1] as String, x[2] as Double, x[3] as Double) else event(x[0] as String, "error")
        }
    }

    init {
        tts.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String) = event(id, "start")
            override fun onDone(id: String) = event(id, "end")
            @Deprecated("old API") override fun onError(id: String) = event(id, "error")
            override fun onError(id: String, code: Int) = event(id, "error")
        })
    }

    private fun event(id: String, ev: String) = a.runJs("window.__wuTts&&window.__wuTts(" + JSONObject.quote(id) + "," + JSONObject.quote(ev) + ")")

    fun speak(id: String, text: String, rate: Double, vol: Double) = a.runOnUiThread {
        when {
            failed -> event(id, "error")
            !ready -> waiting.add(arrayOf(id, text, rate, vol))
            else -> {
                tts.setSpeechRate(rate.toFloat().coerceIn(0.3f, 2.5f))
                val b = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, vol.toFloat().coerceIn(0f, 1f)) }
                if (tts.speak(text, TextToSpeech.QUEUE_ADD, b, id) != TextToSpeech.SUCCESS) event(id, "error")
            }
        }
    }

    fun stop() = a.runOnUiThread { waiting.clear(); if (ready) tts.stop() }
    fun shutdown() { try { tts.shutdown() } catch (e: Exception) { /* ignore */ } }
}
