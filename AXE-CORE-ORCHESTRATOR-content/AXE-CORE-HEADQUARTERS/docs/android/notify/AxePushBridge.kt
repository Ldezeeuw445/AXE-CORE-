package com.axecore.core.notify

import android.app.Activity
import android.webkit.JavascriptInterface

/**
 * Drop these three methods onto the existing `__AXE_ANDROID__` JavascriptInterface
 * (same object as `selectTab` / `browseOpen` / `openApp` in AxeWebView.kt).
 *
 * HQ calls them from `androidNotifyBridge.ts`. The WebView origin is the
 * packaged bundle (`appassets.androidplatform.net`); do not expose this
 * interface to a third-party WebView.
 */
class AxePushBridge(private val activity: Activity) {

    @JavascriptInterface
    fun notify(title: String, body: String, id: String): Boolean =
        AxePush.notifyNow(activity.applicationContext, title, body, id)

    @JavascriptInterface
    fun setNotifyPoll(json: String): Boolean =
        AxePush.savePoll(activity.applicationContext, json)

    @JavascriptInterface
    fun requestNotifyPermission(): Boolean =
        AxePush.requestPermission(activity)
}
