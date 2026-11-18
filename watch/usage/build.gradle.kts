// Steele Usage for the phone: the Steele Usage web app (GitHub Actions minutes) full screen, plus a Claude sign-in
// that stays on the phone and fills the Claude card with the 5-hour and weekly usage. Built and released with Dugout
// (watch-build.yml) as steele-usage.apk.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
val usageVersion = (System.getenv("DUGOUT_VERSION") ?: "1").toInt()
val usageKey = System.getenv("DUGOUT_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
android {
    namespace = "com.steele.usage"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.steele.usage"
        minSdk = 29
        targetSdk = 35
        versionCode = usageVersion
        versionName = "1.$usageVersion"
    }
    signingConfigs {
        // the same key as Dugout, so every release installs over the last
        if (usageKey != null) create("usage") {
            storeFile = usageKey
            storePassword = System.getenv("DUGOUT_KEY_PASSWORD")
            keyAlias = "dugout"
            keyPassword = System.getenv("DUGOUT_KEY_PASSWORD")
        }
    }
    buildTypes {
        release { isMinifyEnabled = false }
        debug { if (usageKey != null) signingConfig = signingConfigs.getByName("usage") }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }
dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
