# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Capacitor keep rules for code minification
-keep class com.getcapacitor.** { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep rules for Vireon Native AI STT & Whisper JNI bridge
-keep class com.vireon.ai.VireonSTTPlugin { *; }
-keep class com.vireon.ai.WhisperNative {
    native <methods>;
    *;
}
-keep class com.vireon.ai.NativeAudioDecoder { *; }

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
