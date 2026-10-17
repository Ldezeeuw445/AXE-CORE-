# In-app browser on the A17

The HQ phone Browser tab no longer uses the Mac-mini / VPS screenshot proxy.
On the web/PWA it uses an iframe. On the Samsung APK it needs a **second
WebView** in `Ldezeeuw445/axe-core-android` (`AxeWebView.kt`).

This cloud session cannot clone that private repo. Drop the methods below onto
`__AXE_ANDROID__` (same bridge as `openApp` / `selectTab`), then rebuild.

## Bridge (JavascriptInterface)

```kotlin
@JavascriptInterface
fun browseOpen(url: String): Boolean = browseOverlay.open(url)

@JavascriptInterface
fun browseBack(): Boolean = browseOverlay.back()

@JavascriptInterface
fun browseForward(): Boolean = browseOverlay.forward()

@JavascriptInterface
fun browseReload(): Boolean = browseOverlay.reload()

@JavascriptInterface
fun browseClose(): Boolean = browseOverlay.close()

@JavascriptInterface
fun hasApp(packageName: String): Boolean =
    packageManager.getLaunchIntentForPackage(packageName) != null

@JavascriptInterface
fun openApp(packageName: String): Boolean {
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return false
    startActivity(intent)
    return true
}
```

The overlay WebView must:

- sit in the content slot (below the HQ app bar, above the collapsed composer)
- use a mobile Chrome UA (`Android … Mobile Safari`)
- `CookieManager.getInstance().setAcceptCookie(true)`
- `CookieManager.setAcceptThirdPartyCookies(view, true)` — also on the **HQ**
  WebView, so Companion (`axecompanion.com/chat`) and AXON
  (`app.axon-memory.com/`) keep their login in the iframe under the app bar
- `settings.javaScriptEnabled = true`, `domStorageEnabled = true`
- not go through the Mac-mini browser-agent

Companion and AXON stay **inside HQ** (iframe under the app bar). Never call
`openApp` / `hasApp` / `browseOpen` for those two: `com.axecompanion.app` is a
TWA/Custom Tab and leaves Device Manager. The Browser tab is the only one
that calls `browseOpen`. Other Apps-tab tiles may still use `openApp`.

## Rebuild

```bash
git clone https://github.com/Ldezeeuw445/axe-core-android.git
cd axe-core-android
# HQ orchestrator must contain this commit
./build-web.sh
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Package id: `com.axecore.core`.

Native shade-notifications (no FCM, no web-push): copy
`docs/android/notify/` into the same repo and wire `__AXE_ANDROID__.notify` /
`setNotifyPoll` / `requestNotifyPermission`. See that README for the rebuild.
