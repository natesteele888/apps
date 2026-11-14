// Code shared by the phone app and the watch app: the message format and the pitch-count math (a port of walkup/pitch-core.js).
plugins { id("org.jetbrains.kotlin.jvm") }
kotlin { jvmToolchain(17) }
dependencies {
    compileOnly("org.json:json:20240303") // Android has org.json built in
    testImplementation("org.json:json:20240303")
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
}
tasks.test { useJUnit() }
