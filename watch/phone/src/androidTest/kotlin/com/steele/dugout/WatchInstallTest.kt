package com.steele.dugout

import android.os.Build
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * "Update the watch app" talks to the watch the way a computer's adb does. Here it talks to this emulator's own adb over
 * Wi-Fi-style TCP instead (screen-check.sh gives the app the key the emulator already trusts), so the whole path runs
 * on a real Android: the key, connecting, reading the installed version, and sending an APK to the installer.
 */
@RunWith(AndroidJUnit4::class)
class WatchInstallTest {
    private val ctx get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun readsTheWatchAddress() {
        assertEquals("192.168.1.141" to 5555, WatchInstaller.parse("192.168.1.141:5555"))
        assertEquals("192.168.1.141" to 5555, WatchInstaller.parse(" 192.168.1.141 "))
        assertEquals("10.0.0.7" to 37001, WatchInstaller.parse("10.0.0.7:37001"))
        assertNull("not a home address", WatchInstaller.parse("8.8.8.8:5555"))
        assertNull(WatchInstaller.parse("192.168.1.300:5555"))
        assertNull(WatchInstaller.parse("watch.example.com"))
    }

    @Test fun talksToAdbAndInstalls() {
        WatchInstaller.connect(ctx, "127.0.0.1", 5555).use { d ->
            val sdk = d.shell("getprop ro.build.version.sdk").output.trim()
            Log.i("WatchInstallTest", "connected, sdk=$sdk")
            assertEquals(Build.VERSION.SDK_INT.toString(), sdk)
            assertEquals(BuildConfig.VERSION_CODE.toLong(), WatchInstaller.installedVersion(d, ctx.packageName))
            assertEquals(0L, WatchInstaller.installedVersion(d, "com.steele.nothere"))
            // a file that isn't an APK goes all the way to the installer, which says why it said no
            val junk = File(ctx.cacheDir, "junk.apk").apply { writeBytes(ByteArray(4096) { (it * 31).toByte() }) }
            try { WatchInstaller.install(d, junk); fail("the installer took a junk file") }
            catch (e: WatchInstaller.Problem) { Log.i("WatchInstallTest", "installer said: ${e.message}"); assertTrue(e.message!!.contains("INSTALL_") || e.message!!.contains("Failure")) }
            finally { junk.delete() }
        }
    }

    @Test fun onlyTheWatchBuildPasses() {
        // this phone build is the same app at the same version, but it isn't made for watches
        val self = File(ctx.applicationInfo.sourceDir)
        assertFalse(WatchInstaller.isWatchBuild(ctx, self, BuildConfig.VERSION_CODE.toLong()))
    }
}
