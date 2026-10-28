package com.axecore.core.notify

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Polls AXE Core API `/device/notifications` with the stored device token.
 * 15-minute cadence is WorkManager's floor for periodic work — while the
 * WebView is alive, HQ posts instantly via `__AXE_ANDROID__.notify`.
 *
 * Never uses the anon key, a user JWT, or AXE_API_KEY. Token refresh is
 * HQ's job: the signed-in WebView re-registers a hash on `core_axe_devices`.
 */
class NotifyPollWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val cfg = AxePush.pollConfig(applicationContext) ?: return Result.success()
        val origin = cfg.getString("apiOrigin")
        val token = cfg.getString("deviceToken")
        if (origin.isBlank() || token.isBlank()) return Result.retry()

        val raw = get("$origin/device/notifications", token) ?: return Result.retry()
        val rijen = JSONObject(raw).optJSONArray("notifications") ?: JSONArray()
        val gezien = AxePush.seenIds(applicationContext)
        for (i in 0 until rijen.length()) {
            val rij = rijen.getJSONObject(i)
            val id = rij.optString("id")
            val message = rij.optString("message")
            if (id.isBlank() || gezien.contains(id)) continue
            if (rij.optBoolean("read")) continue
            if (!AxePush.isShadeEvent(message)) continue
            val titel = titelVan(message)
            val body = bodyVan(message)
            AxePush.notifyNow(applicationContext, titel, body, id)
        }
        return Result.success()
    }

    private fun titelVan(message: String): String {
        val first = message.substringBefore('\n').trim()
        val colon = first.indexOf(": ")
        return if (colon in 1..72) first.substring(0, colon).trim() else first.take(80).ifBlank { "AXE Core" }
    }

    private fun bodyVan(message: String): String {
        val nl = message.indexOf('\n')
        if (nl in 1..72) return message.substring(nl + 1).trim()
        val colon = message.indexOf(": ")
        return if (colon in 1..72) message.substring(colon + 2).trim() else ""
    }

    private fun get(url: String, token: String): String? {
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Accept", "application/json")
                connectTimeout = 8_000
                readTimeout = 8_000
            }
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream).bufferedReader().use(BufferedReader::readText)
            if (code in 200..299) body else null
        } catch (_: Exception) {
            null
        }
    }
}
