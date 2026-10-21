import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val signingProps = Properties()
val signingFile = rootProject.file("keystore.properties")
if (signingFile.exists()) signingFile.inputStream().use(signingProps::load)

android {
    namespace = "com.vireon.ai"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.vireon.ai"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    if (signingFile.exists()) {
        signingConfigs {
            create("release") {
                storeFile = rootProject.file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug { }
        release {
            isMinifyEnabled = false
            if (signingFile.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
}
