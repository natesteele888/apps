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
        minSdk = 30
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
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }
dependencies {
    implementation(project(":shared"))
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.wear.compose:compose-material:1.4.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
}
