package com.axe.core

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg
class GestureLockSaveArgs {
  lateinit var record: String
}

/**
 * Restricted Android plugin: only the particle-gesture PBKDF2 record.
 * Not a generic store. JS reaches this through the three Rust commands
 * `gesture_lock_load` / `gesture_lock_save` / `gesture_lock_clear`.
 */
@TauriPlugin
class GestureLockPlugin(private val activity: Activity) : Plugin(activity) {
  private val store = GestureLockStore(activity)

  @Command
  fun load(invoke: Invoke) {
    try {
      val rec = store.load()
      val obj = JSObject()
      if (rec == null) obj.put("record", JSONObject.NULL) else obj.put("record", rec)
      invoke.resolve(obj)
    } catch (e: Exception) {
      invoke.reject(e.message ?: "secure storage unavailable")
    }
  }

  @Command
  fun save(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(GestureLockSaveArgs::class.java)
      store.save(args.record)
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: "secure storage unavailable")
    }
  }

  @Command
  fun clear(invoke: Invoke) {
    try {
      store.clear()
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: "secure storage unavailable")
    }
  }
}
