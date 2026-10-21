// Daybloom's own Android side: what a phone needs that the web view can't do by itself.
// Called from Rust (src-tauri/src/device.rs) through `device_call`; the planner's JS reaches
// it with `deviceCall()` (src/lib/native/device.ts).
//
//   secrets       the Android Keystore holds an AES key; values are sealed with it and kept
//                 in private preferences, so AI keys and sync tokens survive restarts
//   insets        the status / navigation bar and cut-out sizes, pushed into CSS variables
//                 (--safe-top …) whenever they change, so the app can draw edge to edge
//   system bars   light or dark icons to match the theme
//   back          while the planner has something open (a sheet), the system back gesture
//                 closes it instead of leaving the app
//   keep awake    the screen stays on during a focus session, if asked
package app.daybloom.device

import android.app.Activity
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.text.format.DateFormat
import android.util.Base64
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class AccountArgs {
  lateinit var account: String
}

@InvokeArg
class SecretArgs {
  lateinit var account: String
  lateinit var value: String
}

@InvokeArg
class OnArgs {
  var on: Boolean = false
}

@InvokeArg
class BarsArgs {
  /** The app is showing a dark theme, so the bars need light icons. */
  var dark: Boolean = false
}

/** Values sealed by a Keystore key that never leaves the device's secure hardware. */
object SecretStore {
  private const val KEY = "daybloom-secrets"
  private const val PREFS = "daybloom_secrets"

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(KEY, null) as? SecretKey)?.let { return it }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return gen.generateKey()
  }

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun put(ctx: Context, account: String, value: String) {
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.ENCRYPT_MODE, key())
    val sealed = c.doFinal(value.toByteArray(Charsets.UTF_8))
    val text = Base64.encodeToString(c.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP)
    prefs(ctx).edit().putString(account, text).apply()
  }

  fun get(ctx: Context, account: String): String? {
    val text = prefs(ctx).getString(account, null) ?: return null
    val parts = text.split(":")
    if (parts.size != 2) return null
    return try {
      val c = Cipher.getInstance("AES/GCM/NoPadding")
      c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
      String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
    } catch (e: Exception) {
      // The key is gone (a restored backup, a reset lock screen): the value can't come back.
      null
    }
  }

  fun delete(ctx: Context, account: String) {
    prefs(ctx).edit().remove(account).apply()
  }
}

@TauriPlugin
class DevicePlugin(private val activity: Activity) : Plugin(activity) {
  private var webView: WebView? = null
  private var insetsCss = ""
  private val back = object : OnBackPressedCallback(false) {
    override fun handleOnBackPressed() {
      webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('daybloom:back'))", null)
    }
  }

  override fun load(webView: WebView) {
    this.webView = webView
    (activity as? AppCompatActivity)?.onBackPressedDispatcher?.addCallback(activity, back)
    val density = activity.resources.displayMetrics.density
    ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      fun px(n: Int) = "${(n / density).toInt()}px"
      insetsCss = "{top:'${px(bars.top)}',right:'${px(bars.right)}',bottom:'${px(bars.bottom)}',left:'${px(bars.left)}',keyboard:'${px(ime.bottom)}'}"
      pushInsets()
      ViewCompat.onApplyWindowInsets(v, insets)
    }
  }

  /** Writes the insets into CSS variables (and again after each page load, via `insets`). */
  private fun pushInsets() {
    if (insetsCss.isEmpty()) return
    val js = "(function(i){var s=document.documentElement.style;s.setProperty('--safe-top',i.top);s.setProperty('--safe-right',i.right);" +
      "s.setProperty('--safe-bottom',i.bottom);s.setProperty('--safe-left',i.left);s.setProperty('--keyboard',i.keyboard);" +
      "window.dispatchEvent(new CustomEvent('daybloom:insets',{detail:i}))})($insetsCss)"
    activity.runOnUiThread { webView?.evaluateJavascript(js, null) }
  }

  @Command
  fun insets(invoke: Invoke) {
    pushInsets()
    invoke.resolve()
  }

  @Command
  fun secretGet(invoke: Invoke) {
    val a = invoke.parseArgs(AccountArgs::class.java)
    invoke.resolve(JSObject().put("value", SecretStore.get(activity, a.account)))
  }

  @Command
  fun secretSet(invoke: Invoke) {
    val a = invoke.parseArgs(SecretArgs::class.java)
    try {
      SecretStore.put(activity, a.account, a.value)
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject("The Android Keystore refused to keep this safely.", e)
    }
  }

  @Command
  fun secretDelete(invoke: Invoke) {
    SecretStore.delete(activity, invoke.parseArgs(AccountArgs::class.java).account)
    invoke.resolve()
  }

  @Command
  fun systemBars(invoke: Invoke) {
    val a = invoke.parseArgs(BarsArgs::class.java)
    activity.runOnUiThread {
      val c = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
      c.isAppearanceLightStatusBars = !a.dark
      c.isAppearanceLightNavigationBars = !a.dark
    }
    invoke.resolve()
  }

  /** On while the planner has something the back gesture should close. */
  @Command
  fun backHandler(invoke: Invoke) {
    val a = invoke.parseArgs(OnArgs::class.java)
    activity.runOnUiThread { back.isEnabled = a.on }
    invoke.resolve()
  }

  @Command
  fun keepAwake(invoke: Invoke) {
    val a = invoke.parseArgs(OnArgs::class.java)
    activity.runOnUiThread {
      if (a.on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    invoke.resolve()
  }

  @Command
  fun hour12(invoke: Invoke) {
    invoke.resolve(JSObject().put("value", !DateFormat.is24HourFormat(activity)))
  }

  /** Privacy mode: keep Daybloom out of screenshots, recordings and the app switcher's preview. */
  @Command
  fun secure(invoke: Invoke) {
    val a = invoke.parseArgs(OnArgs::class.java)
    activity.runOnUiThread {
      if (a.on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
    invoke.resolve()
  }
}
