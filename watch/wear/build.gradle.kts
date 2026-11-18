// Dugout for Wear OS (Galaxy Watch): a remote for the walk-up songs on the phone, and a pitch counter.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
// The version code is the CI run number, so each build is newer than the last; the app compares it with the releases.
val dugoutVersion = (System.getenv("DUGOUT_VERSION") ?: "1").toInt()
val dugoutKey = System.getenv("DUGOUT_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
android {
    namespace = "com.steele.dugout.wear"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.steele.dugout" // the same as the phone app, so the two can talk
        minSdk = 25 // Android Wear 2.0 (older watches) and up; the Galaxy Watch 7 and 8 run Wear OS 5+
        targetSdk = 34
        versionCode = dugoutVersion
        versionName = "1.$dugoutVersion"
    }
    signingConfigs {
        // CI signs every build with the same Dugout key (see the workflow), so a new build installs over the old one.
        // Without the key (a local build, or a fork) the build uses the usual debug key.
        if (dugoutKey != null) create("dugout") {
            storeFile = dugoutKey
            storePassword = System.getenv("DUGOUT_KEY_PASSWORD")
            keyAlias = "dugout"
            keyPassword = System.getenv("DUGOUT_KEY_PASSWORD")
        }
    }
    buildTypes {
        release { isMinifyEnabled = false }
        debug { if (dugoutKey != null) signingConfig = signingConfigs.getByName("dugout") }
    }
    buildFeatures { compose = true }
    lint {
        // CI runs lint for calls newer than minSdk, so the app keeps working on older watches.
        checkOnly += "NewApi"
        abortOnError = true
        checkDependencies = true
    }
    compileOptions {
        isCoreLibraryDesugaringEnabled = true // java.time (used by the pitch math) on Android 7
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }
dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.3")
    implementation(project(":shared"))
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.wear.compose:compose-material:1.4.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    // Tiles (Pitch Count and Scores on a swipe from the watch face); see Tiles.kt
    implementation("androidx.wear.tiles:tiles:1.4.1")
    implementation("androidx.wear.protolayout:protolayout:1.2.1")
    implementation("androidx.wear.protolayout:protolayout-expression:1.2.1")
    implementation("androidx.concurrent:concurrent-futures:1.2.0")
    implementation("com.google.guava:listenablefuture:1.0")
    // the pitch count on the watch face (a complication); see Complication.kt
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")
}
