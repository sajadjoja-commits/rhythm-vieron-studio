# Add project specific ProGuard rules here.
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(...);
}
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void *(...);
}
