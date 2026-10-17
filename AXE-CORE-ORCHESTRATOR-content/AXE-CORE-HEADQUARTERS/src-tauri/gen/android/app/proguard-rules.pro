# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# JNI loads GestureLockPlugin by class name; minify would make KeyStore
# storage fail closed and lock the user out of setup.
-keep class com.axe.core.GestureLockPlugin { *; }
-keep class com.axe.core.GestureLockStore { *; }
-keep class com.axe.core.GestureLockSaveArgs { *; }
-keep @app.tauri.annotation.TauriPlugin class * { *; }