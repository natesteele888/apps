// Steele Family for Wear OS: the family apps on a kid's watch (Get Ready, Cube Clock, Power Program, Gameday Picks,
// Read 20). Standalone: it needs no phone app, only the internet (through the phone on most watches) and one link to
// the phone's web apps (see watchlink.js at the top of this repo). Built and released with Dugout (watch-build.yml).
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
val familyVersion = (System.getenv("DUGOUT_VERSION") ?: "1").toInt()
val familyKey = System.getenv("DUGOUT_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
android {
    namespace = "com.steele.family"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.steele.family"
        minSdk = 25 // Wear OS 2 (Huawei Watch 2) and up; built and checked first for the Galaxy Watch 7 (Wear OS 5)
        targetSdk = 34
        versionCode = familyVersion
        versionName = "1.$familyVersion"
    }
    signingConfigs {
        // the same key as Dugout, so every release installs over the last
        if (familyKey != null) create("family") {
            storeFile = familyKey
            storePassword = System.getenv("DUGOUT_KEY_PASSWORD")
            keyAlias = "dugout"
            keyPassword = System.getenv("DUGOUT_KEY_PASSWORD")
        }
    }
    buildTypes {
        release { isMinifyEnabled = false }
        debug { if (familyKey != null) signingConfig = signingConfigs.getByName("family") }
    }
    buildFeatures { compose = true }
    lint {
        checkOnly += "NewApi"
        abortOnError = true
        checkDependencies = true
    }
    compileOptions {
        isCoreLibraryDesugaringEnabled = true // java.time on Wear OS 2
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
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1") // Next up on the watch face
    // the Schedule tile (the same versions as Dugout's tiles)
    implementation("androidx.wear.tiles:tiles:1.4.1")
    implementation("androidx.wear.protolayout:protolayout:1.2.1")
    implementation("androidx.wear.protolayout:protolayout-expression:1.2.1")
    implementation("androidx.concurrent:concurrent-futures:1.2.0")
    implementation("com.google.guava:listenablefuture:1.0")
}
