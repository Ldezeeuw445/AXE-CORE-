package com.axe.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.util.Base64 as JavaBase64
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Particle-gesture lock at rest — recovered from the Samsung APK
 * (`com.particlequickactions.GestureLockStore`).
 *
 * AndroidKeyStore AES key (alias `particle_gesture_lock_particle_gesture_lock`)
 * encrypts the PBKDF2 JSON record with AES/GCM/NoPadding. The blob layout is
 * `[ivLen][iv][ciphertext+tag]`, stored Base64 in private SharedPreferences
 * `particle_gesture_lock` / key `record`.
 *
 * Decrypt failure with a stored blob fails closed (unlike the APK, which
 * treated it as "unset" and would have allowed a setup bypass).
 */
internal class GestureLockStore(context: Context) {
  private val appContext = context.applicationContext
  private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private val keyAlias = "particle_gesture_lock_$PREFS"

  fun load(): String? {
    val stored = prefs.getString(KEY_RECORD, null) ?: return null
    val blob = try {
      Base64.decode(stored, Base64.NO_WRAP)
    } catch (e: IllegalArgumentException) {
      throw SecureStorageException("encrypted record is not readable")
    }
    val plain = try {
      decrypt(blob)
    } catch (e: Exception) {
      throw SecureStorageException("secure storage unavailable")
    }
    val json = String(plain, Charsets.UTF_8)
    if (!recordGeldig(json)) {
      throw SecureStorageException("secure storage unavailable")
    }
    return json
  }

  fun save(record: String) {
    if (!recordGeldig(record)) {
      throw SecureStorageException("invalid gesture-lock record")
    }
    val blob = try {
      encrypt(record.toByteArray(Charsets.UTF_8))
    } catch (e: Exception) {
      throw SecureStorageException("secure storage unavailable")
    }
    val encoded = Base64.encodeToString(blob, Base64.NO_WRAP)
    val ok = prefs.edit().putString(KEY_RECORD, encoded).commit()
    if (!ok) throw SecureStorageException("could not persist encrypted record")
  }

  fun clear() {
    val ok = prefs.edit().remove(KEY_RECORD).commit()
    if (!ok) throw SecureStorageException("could not clear encrypted record")
    try {
      val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
      ks.load(null)
      if (ks.containsAlias(keyAlias)) ks.deleteEntry(keyAlias)
    } catch (_: Exception) {
      // prefs are empty; leftover key material cannot decrypt a record that is gone
    }
  }

  private fun secretKey(): SecretKey {
    val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
    ks.load(null)
    val existing = ks.getEntry(keyAlias, null) as? KeyStore.SecretKeyEntry
    if (existing != null) return existing.secretKey
    if (prefs.contains(KEY_RECORD)) {
      throw SecureStorageException("secure storage unavailable")
    }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(
        keyAlias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun encrypt(plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val iv = cipher.iv
    require(iv.isNotEmpty() && iv.size < 128) { "invalid GCM IV" }
    val cipherText = cipher.doFinal(plain)
    return ByteBuffer.allocate(1 + iv.size + cipherText.size)
      .put(iv.size.toByte())
      .put(iv)
      .put(cipherText)
      .array()
  }

  private fun decrypt(blob: ByteArray): ByteArray {
    if (blob.isEmpty()) throw SecureStorageException("encrypted record is empty")
    val ivSize = blob[0].toInt() and 0xFF
    if (ivSize < 8 || ivSize > 16 || blob.size <= 1 + ivSize) {
      throw SecureStorageException("encrypted record is corrupt")
    }
    val iv = blob.copyOfRange(1, 1 + ivSize)
    val cipherText = blob.copyOfRange(1 + ivSize, blob.size)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
    return cipher.doFinal(cipherText)
  }

  companion object {
    const val PREFS = "particle_gesture_lock"
    const val KEY_RECORD = "record"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private const val MAX_RECORD_CHARS = 4096
    private const val SALT_BYTES = 32
    private const val HASH_BYTES = 32
    private const val MIN_LENGTH = 3L
    private const val MAX_LENGTH = 16L
    private const val MIN_ITERATIONS = 120_000L
    private const val MAX_ITERATIONS = 1_000_000L

    @JvmStatic
    fun recordGeldig(raw: String): Boolean {
      if (raw.length > MAX_RECORD_CHARS) return false
      return try {
        val json = JSONObject(raw)
        if (json.length() != 6) return false
        if (!json.has("salt") || !json.has("hash") || !json.has("length") ||
          !json.has("iterations") || !json.has("failedAttempts") || !json.has("lockedUntil")
        ) {
          return false
        }
        if (b64Len(json.getString("salt")) != SALT_BYTES) return false
        if (b64Len(json.getString("hash")) != HASH_BYTES) return false
        val length = json.getLong("length")
        if (length < MIN_LENGTH || length > MAX_LENGTH) return false
        val iterations = json.getLong("iterations")
        if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return false
        if (json.getLong("failedAttempts") < 0) return false
        if (json.getLong("lockedUntil") < 0) return false
        true
      } catch (_: Exception) {
        false
      }
    }

    private fun b64Len(s: String): Int {
      if (s.isEmpty() || s.length > 128) throw IllegalArgumentException("b64")
      return JavaBase64.getDecoder().decode(s).size
    }
  }
}

internal class SecureStorageException(message: String) : Exception(message)
