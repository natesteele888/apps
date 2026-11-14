package com.steele.dugout

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper

/** Watches whether the phone's sound is going to a Bluetooth speaker (like the adapter on the Bose L1). */
class SpeakerWatch(ctx: Context, private val changed: (Boolean, String) -> Unit) {
    private val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    var on = false; private set
    var name = ""; private set

    private fun isSpeaker(d: AudioDeviceInfo): Boolean {
        if (d.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) return true
        if (Build.VERSION.SDK_INT >= 31 && (d.type == AudioDeviceInfo.TYPE_BLE_SPEAKER || d.type == AudioDeviceInfo.TYPE_BLE_HEADSET)) return true
        if (Build.VERSION.SDK_INT >= 33 && d.type == AudioDeviceInfo.TYPE_BLE_BROADCAST) return true
        return false
    }

    private fun check() {
        val d = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { isSpeaker(it) }
        val nOn = d != null
        val nName = d?.productName?.toString()?.take(40) ?: ""
        if (nOn != on || nName != name) { on = nOn; name = nName; changed(on, name) }
    }

    private val cb = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = check()
        override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = check()
    }

    fun start() { am.registerAudioDeviceCallback(cb, Handler(Looper.getMainLooper())); check(); changed(on, name) }
    fun stop() { am.unregisterAudioDeviceCallback(cb) }
}
