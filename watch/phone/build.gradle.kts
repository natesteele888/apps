// Dugout for the phone: the Walk-Up web app in a full-screen app, plus the link to the watch.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
// The version code is the CI run number, so each build is newer than the last; the app compares it with the releases.
val dugoutVersion = (System.getenv("DUGOUT_VERSION") ?: "1").toInt()
val dugoutKey = System.getenv("DUGOUT_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
android {
    namespace = "com.steele.dugout"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.steele.dugout" // the watch app uses the same id, so the two can talk
        minSdk = 29
        targetSdk = 35
        versionCode = dugoutVersion
        versionName = "1.$dugoutVersion"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }
dependencies {
    implementation(project(":shared"))
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    // On-screen checks run on an Android emulator by .github/workflows/dugout-screen.yml
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
