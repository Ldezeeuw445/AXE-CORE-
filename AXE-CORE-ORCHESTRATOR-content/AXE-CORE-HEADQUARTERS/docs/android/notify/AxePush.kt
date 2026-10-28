package com.axecore.core.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Shade notifications for Device Manager (`com.axecore.core`).
 *
 * No FCM. No web-push. The HQ WebView posts immediately via [notifyNow];
 * [NotifyPollWorker] polls AXE Core API `/device/notifications` every 15
 * minutes when the WebView is gone (device token, never the anon key).
 * Same four events as `src/domain/nativeMelding.ts` — keep [isShadeEvent]
 * in lockstep with that file.
 *
 * Drop this file next to `AxeWebView.kt`, add the JavascriptInterface methods
 * from `AxePushBridge.kt`, and the WorkManager bits in Application/Activity.
 */
object AxePush {
    const val CHANNEL_ID = "axe_core"
    const val WORK_NAME = "axe-notify-poll"
    private const val PREFS = "axe_notify"

    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = mgr.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return
        mgr.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "AXE Core", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Approvals, failed tasks, agent done, NorthSea needs-your-OK"
            },
        )
    }

    fun requestPermission(activity: android.app.Activity): Boolean {
        ensureChannel(activity)
        if (Build.VERSION.SDK_INT < 33) return true
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) return true
        activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 801)
        return false
    }

    fun savePoll(ctx: Context, json: String): Boolean {
        val o = JSONObject(json)
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("apiOrigin", o.optString("apiOrigin"))
            .putString("deviceToken", o.optString("deviceToken"))
            .putString("deviceId", o.optString("deviceId"))
            .remove("anonKey")
            .remove("accessToken")
            .remove("refreshToken")
            .remove("supabaseUrl")
            .apply()
        schedule(ctx)
        return true
    }

    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<NotifyPollWorker>(15, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
            )
            .build()
        val wm = WorkManager.getInstance(ctx)
        wm.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, req)
        wm.enqueue(OneTimeWorkRequestBuilder<NotifyPollWorker>().build())
    }

    fun notifyNow(ctx: Context, title: String, body: String, id: String): Boolean {
        ensureChannel(ctx)
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        val tap = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
            ?: Intent().setPackage(ctx.packageName)
        tap.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(
            ctx, id.hashCode(), tap,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title.ifBlank { "AXE Core" })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        val tag = id.ifBlank { title }.take(40)
        NotificationManagerCompat.from(ctx).notify(tag, 17, n)
        if (id.isNotBlank()) markSeen(ctx, id)
        return true
    }

    fun markSeen(ctx: Context, id: String) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val seen = p.getStringSet("seen", emptySet())!!.toMutableSet()
        seen.add(id)
        while (seen.size > 400) seen.remove(seen.first())
        p.edit().putStringSet("seen", seen).apply()
    }

    fun seenIds(ctx: Context): Set<String> =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet("seen", emptySet()) ?: emptySet()

    fun pollConfig(ctx: Context): JSONObject? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val origin = p.getString("apiOrigin", "") ?: ""
        val token = p.getString("deviceToken", "") ?: ""
        if (origin.isBlank() || token.isBlank()) return null
        return JSONObject()
            .put("apiOrigin", origin.trimEnd('/'))
            .put("deviceToken", token)
            .put("deviceId", p.getString("deviceId", "") ?: "")
    }

    /**
     * Same four events as HQ `nativeMeldingSoort`. Keep in lockstep.
     */
    fun isShadeEvent(message: String): Boolean {
        val kop = message.substringBefore('\n').substringBefore(": ").trim()
        if (kop.equals("Stuck", true) || kop.equals("Failed", true)
            || message.startsWith("Stuck:", ignoreCase = true)
            || message.startsWith("Failed:", ignoreCase = true)
        ) return true
        if (kop.equals("Done", true) || message.startsWith("Done:", ignoreCase = true)) return true
        val lower = message.lowercase()
        val deal = Regex("""\bdeal-\d+\b""", RegexOption.IGNORE_CASE).containsMatchIn(message)
            || lower.contains("northsea")
        val ja = lower.contains("yes needed") || lower.contains("needs your ok")
            || lower.contains("goedkeuring nodig") || lower.contains("approve?")
        if (deal && (ja || kop.startsWith("Yes needed", ignoreCase = true))) return true
        return ja || lower.contains("waiting approval") || kop.startsWith("Yes needed", ignoreCase = true)
    }
}
