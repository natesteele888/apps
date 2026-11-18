package com.steele.dugout.wear

import android.os.Handler
import android.os.Looper
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService
import com.steele.dugout.shared.Paths

/**
 * Takes the phone's pitch log when it changes, even with Pitch Count closed, so the Pitch Count tile shows the same
 * count as the phone (for example when someone counts on the phone's Game screen). While a watch app is open, PhoneLink
 * gets the same change too; merging a log twice changes nothing, because each pitch counts once.
 */
class PitchSyncService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        val logs = ArrayList<String>()
        for (ev in events) {
            if (ev.type != DataEvent.TYPE_CHANGED || ev.dataItem.uri.path != Paths.PITCH) continue
            ev.dataItem.data?.takeIf { it.size < 1_000_000 }?.let { logs.add(String(it, Charsets.UTF_8)) }
        }
        if (logs.isEmpty()) return
        val ctx = applicationContext
        // the pitch log lives on the main thread, the same as in the apps
        Handler(Looper.getMainLooper()).post {
            PitchStore.load(ctx)
            logs.forEach { PitchStore.fromPhone(it) }
        }
    }
}
