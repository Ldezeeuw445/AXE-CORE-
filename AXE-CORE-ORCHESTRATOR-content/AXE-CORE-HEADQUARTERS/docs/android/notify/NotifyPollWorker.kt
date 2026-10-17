package com.axecore.core.notify

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

/**
 * Polls `core_notifications` with the stored user session. 15-minute cadence
 * is WorkManager's floor for periodic work — while the WebView is alive, HQ
 * posts instantly via `__AXE_ANDROID__.notify`.
 *
 * Uses the anon key + refresh token (never AXE_API_KEY). Token refresh goes
 * through GoTrue; failed refresh leaves the last access token for one try.
 */
class NotifyPollWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val cfg = AxePush.pollConfig(applicationContext) ?: return Result.success()
        val url = cfg.getString("supabaseUrl")
        val anon = cfg.getString("anonKey")
        var access = cfg.optString("accessToken")
        val refresh = cfg.getString("refreshToken")

        val nieuw = refreshAccess(url, anon, refresh)
        if (nieuw != null) {
            access = nieuw
            applicationContext.getSharedPreferences("axe_notify", Context.MODE_PRIVATE)
                .edit().putString("accessToken", nieuw).apply()
        }
        if (access.isBlank()) return Result.retry()

        val sinds = Instant.now().minusSeconds(30 * 60).toString()
        val raw = get(
            "$url/rest/v1/core_notifications?select=id,type,message,read,created_at&read=eq.false&created_at=gte.$sinds&order=created_at.desc&limit=40",
            anon, access,
        ) ?: return Result.retry()
        val rijen = JSONArray(raw)
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

    private fun refreshAccess(supabaseUrl: String, anon: String, refresh: String): String? {
        return try {
            val conn = (URL("$supabaseUrl/auth/v1/token?grant_type=refresh_token").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("apikey", anon)
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
                connectTimeout = 8_000
                readTimeout = 8_000
            }
            OutputStreamWriter(conn.outputStream).use { it.write(JSONObject().put("refresh_token", refresh).toString()) }
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream).bufferedReader().use(BufferedReader::readText)
            if (code !in 200..299) return null
            JSONObject(body).optString("access_token").ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    private fun get(url: String, anon: String, access: String): String? {
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("apikey", anon)
                setRequestProperty("Authorization", "Bearer $access")
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
