// Daybloom's own Android side: what a phone needs that the web view can't do by itself.
// Called from Rust (src-tauri/src/device.rs) through `device_call`; the planner's JS reaches
// it with `deviceCall()` (src/lib/native/device.ts).
//
//   secrets       the Android Keystore holds an AES key; values are sealed with it and kept
//                 in private preferences, so AI keys and sync tokens survive restarts
//   insets        the status / navigation bar and cut-out sizes, pushed into CSS variables
//                 (--safe-top …) whenever they change, so the app can draw edge to edge
//   system bars   light or dark icons to match the theme, and the window's colour behind it
//   back          while the planner has something open (a sheet), the system back gesture
//                 closes it instead of leaving the app
//   keep awake    the screen stays on during a focus session, if asked
//   haptics       Android's own touch effects (ticks, long press, confirm…), see src/lib/haptics.ts
package app.daybloom.device

import android.app.Activity
import android.app.NotificationManager
import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.text.format.DateFormat
import android.util.Base64
import android.view.HapticFeedbackConstants
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import android.Manifest
import android.location.Location
import android.location.LocationManager
import androidx.fragment.app.FragmentActivity
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
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
class ModeArgs {
  var mode: String = "auto"
}

@InvokeArg
class ScheduleArgs {
  /** The reminders, as JSON objects (see Reminder). */
  var items: List<Map<String, Any?>> = emptyList()
}

@InvokeArg
class FocusArgs {
  var title: String = "Focus"
  var body: String = ""
  var endsAt: Long = 0
}

@InvokeArg
class SettingsArgs {
  /** notifications | exactAlarms | fullScreen | battery */
  var which: String = "notifications"
}

@InvokeArg
class WidgetArgs {
  /** The snapshot, as JSON text (see src/lib/native/widgets.svelte.ts). */
  var data: String = ""
}

@InvokeArg
class PinArgs {
  /** dial | alef */
  var kind: String = "dial"
}

@InvokeArg
class BioArgs {
  lateinit var account: String
  var value: String = ""
  var title: String = "Unlock with your fingerprint"
  /** The prompt's other way in (its button). */
  var other: String = "Use password"
}

@InvokeArg
class SpeakArgs {
  var text: String = ""
  var pitch: Float = 1f
  var rate: Float = 1f
  var volume: Float = 1f
}

@InvokeArg
class UpdateArgs {
  var url: String = ""
  var sha256: String = ""
}

@InvokeArg
class HapticArgs {
  /** snap | tick | pick | drop | done | no | on | off (see src/lib/haptics.ts) */
  var kind: String = "tick"
}

@InvokeArg
class BarsArgs {
  /** The app is showing a dark theme, so the bars need light icons. */
  var dark: Boolean = false
  /** system | light | dark, as picked in Settings (remembered for the next start). */
  var mode: String? = null
}

/**
 * The theme picked in the planner, remembered for the next start: the window and the web view
 * behind the page take the page's ground colour, so nothing white shows before it draws. On
 * Android 12+ a theme picked in the app (not "system") also becomes the app's own night mode,
 * so the system's start screen matches it too.
 */
object Appearance {
  private const val PREFS = "daybloom_look"
  // --ground in src/app.css (and res/values*/colors.xml), light and dark.
  private const val LIGHT = 0xFFECEFF3.toInt()
  private const val DARK = 0xFF0D121C.toInt()

  // The planner has painted its first screen; MainActivity keeps the start screen until then.
  private var shown = false
  private var onShown: (() -> Unit)? = null

  @Synchronized fun starting() {
    shown = false
    onShown = null
  }

  /** Runs [then] once the page has painted its first screen (at once if it has). */
  fun whenShown(then: () -> Unit) {
    synchronized(this) {
      if (!shown) {
        onShown = then
        return
      }
    }
    then()
  }

  fun markShown() {
    val then = synchronized(this) {
      shown = true
      onShown.also { onShown = null }
    }
    then?.invoke()
  }

  fun ground(dark: Boolean) = if (dark) DARK else LIGHT

  fun ground(ctx: Context) = ground(
    when (prefs(ctx).getString("mode", "system")) {
      "dark" -> true
      "light" -> false
      else -> (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }
  )

  fun remember(ctx: Context, mode: String) {
    val p = prefs(ctx)
    if (p.getString("mode", "system") == mode) return
    p.edit().putString("mode", mode).apply()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val night = when (mode) {
        "dark" -> UiModeManager.MODE_NIGHT_YES
        "light" -> UiModeManager.MODE_NIGHT_NO
        else -> UiModeManager.MODE_NIGHT_AUTO // follow the system again
      }
      try {
        ctx.getSystemService(UiModeManager::class.java)?.setApplicationNightMode(night)
      } catch (e: Exception) {
        // Only the start screen's colour depends on it.
      }
    }
  }

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
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

@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.ACCESS_COARSE_LOCATION], alias = "location"),
    Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone"),
  ]
)
class DevicePlugin(private val activity: Activity) : Plugin(activity) {
  private var webView: WebView? = null
  private var insetsCss = ""
  private val back = object : OnBackPressedCallback(false) {
    override fun handleOnBackPressed() {
      webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('daybloom:back'))", null)
    }
  }

  /** A widget's button that opened the app, until the planner takes it. */
  private var pendingAction: JSObject? = null

  private fun actionOf(intent: Intent?): JSObject? {
    // Shared to Daybloom from another app: the text becomes a quick add.
    if (intent?.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true) {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return null
      intent.action = Intent.ACTION_MAIN
      return JSObject().put("action", "capture").put("key", "").put("text", text.take(500))
    }
    val action = intent?.getStringExtra("daybloom.action") ?: return null
    intent.removeExtra("daybloom.action")
    return JSObject().put("action", action).put("key", intent.getStringExtra("daybloom.key") ?: "")
  }

  // Back in the app: the reminders already shown have done their job (the dial shows the day).
  override fun onResume(activity: AppCompatActivity) {
    try {
      Reminders.clearShown(activity)
    } catch (e: Exception) {
      // Only tidying.
    }
  }

  override fun onNewIntent(intent: Intent) {
    val a = actionOf(intent) ?: return
    webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('daybloom:intent',{detail:$a}))", null)
  }

  override fun load(webView: WebView) {
    this.webView = webView
    // Behind the page, the theme's ground colour (the web view's own default is white).
    activity.runOnUiThread { webView.setBackgroundColor(Appearance.ground(activity)) }
    pendingAction = actionOf(activity.intent)
    (activity as? AppCompatActivity)?.onBackPressedDispatcher?.addCallback(activity, back)
    val density = activity.resources.displayMetrics.density
    ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      // The keyboard: the page ends at its top edge (the classic "adjust resize", which an
      // edge-to-edge window doesn't get by itself), so a sheet or a chat box sits above it and
      // the field being typed in scrolls into view. Its height counts the gesture bar under it.
      val keyboard = if (ime.bottom > bars.bottom) ime.bottom else 0
      (v.layoutParams as? ViewGroup.MarginLayoutParams)?.let { lp ->
        if (lp.bottomMargin != keyboard) {
          lp.bottomMargin = keyboard
          v.layoutParams = lp
        }
      }
      fun px(n: Int) = "${(n / density).toInt()}px"
      val bottom = if (keyboard > 0) 0 else bars.bottom
      insetsCss = "{top:'${px(bars.top)}',right:'${px(bars.right)}',bottom:'${px(bottom)}',left:'${px(bars.left)}',keyboard:'${px(keyboard)}'}"
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
    a.mode?.let { Appearance.remember(activity, it) }
    val ground = Appearance.ground(a.dark)
    activity.runOnUiThread {
      val c = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
      c.isAppearanceLightStatusBars = !a.dark
      c.isAppearanceLightNavigationBars = !a.dark
      activity.window.setBackgroundDrawable(ColorDrawable(ground))
      webView?.setBackgroundColor(ground)
    }
    invoke.resolve()
  }

  /** Touch feedback from Android's own effects, so it follows the phone's Touch feedback setting. */
  @Command
  fun haptic(invoke: Invoke) {
    val sdk = Build.VERSION.SDK_INT
    val effect = when (invoke.parseArgs(HapticArgs::class.java).kind) {
      "snap" -> if (sdk >= 34) HapticFeedbackConstants.SEGMENT_FREQUENT_TICK else HapticFeedbackConstants.CLOCK_TICK
      "pick" -> HapticFeedbackConstants.LONG_PRESS
      "drop" -> if (sdk >= 30) HapticFeedbackConstants.GESTURE_END else HapticFeedbackConstants.CLOCK_TICK
      "done" -> if (sdk >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS
      "no" -> if (sdk >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
      "on" -> if (sdk >= 34) HapticFeedbackConstants.TOGGLE_ON else HapticFeedbackConstants.KEYBOARD_TAP
      "off" -> if (sdk >= 34) HapticFeedbackConstants.TOGGLE_OFF else HapticFeedbackConstants.KEYBOARD_TAP
      else -> HapticFeedbackConstants.KEYBOARD_TAP
    }
    activity.runOnUiThread { webView?.performHapticFeedback(effect) }
    invoke.resolve()
  }

  /** The planner's first screen is painted: the start screen can go. */
  @Command
  fun shown(invoke: Invoke) {
    Appearance.markShown()
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

  /** The next reminders and alarms (replaces what was scheduled before). */
  @Command
  fun schedule(invoke: Invoke) {
    val a = invoke.parseArgs(ScheduleArgs::class.java)
    val list = a.items.mapNotNull { m ->
      try {
        Reminder.from(org.json.JSONObject(m))
      } catch (e: Exception) {
        null
      }
    }
    Reminders.schedule(activity, list)
    invoke.resolve(JSObject().put("scheduled", list.size).put("exact", Reminders.canExact(activity)))
  }

  @Command
  fun focusShow(invoke: Invoke) {
    val a = invoke.parseArgs(FocusArgs::class.java)
    Reminders.focusShow(activity, a.title, a.body, a.endsAt)
    invoke.resolve()
  }

  @Command
  fun focusHide(invoke: Invoke) {
    Reminders.focusHide(activity)
    invoke.resolve()
  }

  /** What reminders and alarms are allowed to do here. */
  @Command
  fun reminderAccess(invoke: Invoke) {
    val nm = activity.getSystemService(NotificationManager::class.java)
    val fullScreen = if (Build.VERSION.SDK_INT >= 34) nm.canUseFullScreenIntent() else true
    val pm = activity.getSystemService(android.os.PowerManager::class.java)
    invoke.resolve(
      JSObject()
        .put("notifications", nm.areNotificationsEnabled())
        .put("exactAlarms", Reminders.canExact(activity))
        .put("fullScreen", fullScreen)
        .put("unrestricted", pm.isIgnoringBatteryOptimizations(activity.packageName))
        .put("onTime", Reminders.mode(activity))
        .put("clock", Reminders.clock(activity))
        .put("loose", Reminders.looseMaker())
        .put("late", Reminders.late(activity))
        .put("lateMin", Reminders.lateBy(activity) / 60_000)
    )
  }

  /** Settings › Phone › Try the alarm: the one alarm in `items`, rung like a planned one. */
  @Command
  fun testAlarm(invoke: Invoke) {
    val m = invoke.parseArgs(ScheduleArgs::class.java).items.firstOrNull()
    val r = try {
      m?.let { Reminder.from(org.json.JSONObject(it)) }
    } catch (e: Exception) {
      null
    }
    if (r == null) return invoke.reject("No alarm to try")
    Reminders.test(activity, r)
    invoke.resolve(JSObject().put("at", r.at))
  }

  /** How reminders are kept on time: "auto", "clock" (the alarm clock) or "standard". */
  @Command
  fun reminderMode(invoke: Invoke) {
    Reminders.setMode(activity, invoke.parseArgs(ModeArgs::class.java).mode)
    invoke.resolve(JSObject().put("clock", Reminders.clock(activity)))
  }

  /** Opens the system page where that permission is switched on. */
  @Command
  fun openSettings(invoke: Invoke) {
    val a = invoke.parseArgs(SettingsArgs::class.java)
    val pkg = Uri.parse("package:${activity.packageName}")
    val intent = when (a.which) {
      "exactAlarms" -> if (Build.VERSION.SDK_INT >= 31) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else null
      "fullScreen" -> if (Build.VERSION.SDK_INT >= 34) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg) else null
      "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
      else -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
    } ?: Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
    activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    invoke.resolve()
  }

  /** A new snapshot for the home-screen widgets; they redraw at once. */
  @Command
  fun widgets(invoke: Invoke) {
    WidgetData.save(activity, invoke.parseArgs(WidgetArgs::class.java).data)
    WidgetData.updateAll(activity)
    invoke.resolve()
  }

  /** Asks the launcher to put a widget on the home screen (it shows its own confirmation). */
  @Command
  fun pinWidget(invoke: Invoke) {
    val kind = invoke.parseArgs(PinArgs::class.java).kind
    val m = android.appwidget.AppWidgetManager.getInstance(activity)
    val cls = if (kind == "alef") AlefWidget::class.java else DialWidget::class.java
    val ok = m.isRequestPinAppWidgetSupported && m.requestPinAppWidget(android.content.ComponentName(activity, cls), null, null)
    invoke.resolve(JSObject().put("asked", ok))
  }

  /** What happened while the planner was closed: blocks ticked on a widget, a button pressed. */
  @Command
  fun widgetPending(invoke: Invoke) {
    val done = org.json.JSONArray()
    for (k in WidgetData.takeDone(activity)) done.put(k)
    val r = JSObject().put("done", done)
    pendingAction?.let { r.put("intent", it) }
    pendingAction = null
    invoke.resolve(r)
  }

  // -- location (Waqt's prayer times) -------------------------------------------------------

  @Command
  fun location(invoke: Invoke) {
    if (getPermissionState("location") != PermissionState.GRANTED) {
      requestPermissionForAlias("location", invoke, "locationAsked")
      return
    }
    findLocation(invoke)
  }

  @PermissionCallback
  fun locationAsked(invoke: Invoke) {
    if (getPermissionState("location") == PermissionState.GRANTED) findLocation(invoke)
    else invoke.reject("Location wasn't allowed. You can pick your city instead.", "denied")
  }

  private fun findLocation(invoke: Invoke) {
    val lm = activity.getSystemService(LocationManager::class.java)
    fun send(l: Location?) {
      if (l == null) invoke.reject("The phone doesn't know where it is just now. Try again outdoors, or pick your city.", "unknown")
      else invoke.resolve(JSObject().put("lat", l.latitude).put("lon", l.longitude).put("accuracy", l.accuracy.toDouble()))
    }
    try {
      // A city is precise enough for prayer times: a fix from the last few hours will do.
      val last = lm.getProviders(true).mapNotNull { lm.getLastKnownLocation(it) }.maxByOrNull { it.time }
      if (last != null && System.currentTimeMillis() - last.time < 6 * 3_600_000L) return send(last)
      val order = if (Build.VERSION.SDK_INT >= 31) listOf(LocationManager.FUSED_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
      else listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
      val provider = order.firstOrNull { lm.isProviderEnabled(it) }
      if (Build.VERSION.SDK_INT >= 30 && provider != null) {
        var answered = false
        val once = { l: Location? ->
          if (!answered) {
            answered = true
            send(l ?: last)
          }
        }
        lm.getCurrentLocation(provider, null, activity.mainExecutor) { l -> once(l) }
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ once(null) }, 10_000)
      } else send(last)
    } catch (e: SecurityException) {
      invoke.reject("Location wasn't allowed.", "denied")
    }
  }

  // -- the microphone (voice input, Alef) -----------------------------------------------------

  @Command
  fun microphone(invoke: Invoke) {
    if (getPermissionState("microphone") == PermissionState.GRANTED) invoke.resolve(JSObject().put("granted", true))
    else requestPermissionForAlias("microphone", invoke, "microphoneAsked")
  }

  @PermissionCallback
  fun microphoneAsked(invoke: Invoke) {
    invoke.resolve(JSObject().put("granted", getPermissionState("microphone") == PermissionState.GRANTED))
  }

  // -- fingerprint / face for the sync vault -----------------------------------------------------

  @Command
  fun bioStatus(invoke: Invoke) {
    val a = invoke.parseArgs(BioArgs::class.java)
    invoke.resolve(JSObject().put("available", BioVault.available(activity)).put("sealed", BioVault.sealed(activity, a.account)))
  }

  @Command
  fun bioSeal(invoke: Invoke) {
    val a = invoke.parseArgs(BioArgs::class.java)
    val fa = activity as? FragmentActivity ?: return invoke.reject("No fingerprint prompt here.")
    BioVault.seal(fa, a.account, a.value, a.title, a.other) { err -> if (err == null) invoke.resolve() else invoke.reject(err, err) }
  }

  @Command
  fun bioOpen(invoke: Invoke) {
    val a = invoke.parseArgs(BioArgs::class.java)
    val fa = activity as? FragmentActivity ?: return invoke.reject("No fingerprint prompt here.")
    BioVault.open(fa, a.account, a.title, a.other) { value, err -> if (value != null) invoke.resolve(JSObject().put("value", value)) else invoke.reject(err ?: "failed", err ?: "failed") }
  }

  @Command
  fun bioForget(invoke: Invoke) {
    BioVault.forget(activity, invoke.parseArgs(BioArgs::class.java).account)
    invoke.resolve()
  }

  // -- Alef's voice ----------------------------------------------------------------------------------

  @Command
  fun speak(invoke: Invoke) {
    val a = invoke.parseArgs(SpeakArgs::class.java)
    Speech.speak(activity, a.text.take(4000), a.pitch, a.rate, a.volume) { }
    invoke.resolve()
  }

  @Command
  fun stopSpeaking(invoke: Invoke) {
    Speech.stop()
    invoke.resolve()
  }

  // -- the Time Tracker --------------------------------------------------------------------------------

  @Command
  fun usageAccess(invoke: Invoke) = invoke.resolve(JSObject().put("granted", Usage.granted(activity)))

  @Command
  fun usageSettings(invoke: Invoke) {
    Usage.settings(activity)
    invoke.resolve()
  }

  @Command
  fun foregroundApp(invoke: Invoke) = invoke.resolve(JSObject().put("app", Usage.foreground(activity)))

  // -- updating the app itself (an APK from GitHub Releases) -------------------------------------------

  @Command
  fun apkUpdate(invoke: Invoke) {
    val a = invoke.parseArgs(UpdateArgs::class.java)
    Thread {
      try {
        val r = ApkUpdate.run(activity, a.url, a.sha256)
        if (r == null || r == "allow-install") invoke.resolve(JSObject().put("needsPermission", r != null)) else invoke.reject(r)
      } catch (e: Exception) {
        invoke.reject("The download stopped: ${e.message ?: "no connection"}. Try again in a moment.")
      }
    }.start()
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
