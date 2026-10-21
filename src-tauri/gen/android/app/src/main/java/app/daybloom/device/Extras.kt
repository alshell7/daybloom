// The rest of the phone's native side, used by DevicePlugin:
//
//   BioVault   the sync vault's key sealed by a Keystore key that only opens after your
//              fingerprint or face (so a phone unlocks sync without the master password, and a
//              new fingerprint enrolled on the phone makes it ask for the password again)
//   Speech     Android's own text-to-speech, for Alef's voice (the web view has none)
//   Usage      which app is in front, for the Time Tracker (with the user's usage access)
//   ApkUpdate  downloads a new Daybloom APK, checks its SHA-256, and opens the installer
//   CaptureTile  "Quick add" in the quick-settings panel
package app.daybloom.device

import android.app.AppOpsManager
import android.app.PendingIntent
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.service.quicksettings.TileService
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.FragmentActivity
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.security.MessageDigest
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object BioVault {
  private const val KEY = "daybloom-bio"
  private const val PREFS = "daybloom_bio"
  private const val STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG

  fun available(ctx: Context): Boolean = BiometricManager.from(ctx).canAuthenticate(STRONG) == BiometricManager.BIOMETRIC_SUCCESS

  fun sealed(ctx: Context, account: String): Boolean = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains(account)

  fun forget(ctx: Context, account: String) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(account).apply()

  private fun key(fresh: Boolean): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (fresh) ks.deleteEntry(KEY)
    (ks.getKey(KEY, null) as? SecretKey)?.let { return it }
    val b = KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true)
    if (Build.VERSION.SDK_INT >= 30) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(b.build()) }.generateKey()
  }

  private fun prompt(activity: FragmentActivity, title: String, cipher: Cipher, done: (Cipher?, String?) -> Unit) {
    val info = BiometricPrompt.PromptInfo.Builder()
      .setTitle(title)
      .setSubtitle("Daybloom")
      .setNegativeButtonText("Use password")
      .setAllowedAuthenticators(STRONG)
      .build()
    val p = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = done(result.cryptoObject?.cipher, null)
      override fun onAuthenticationError(code: Int, msg: CharSequence) = done(null, if (code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_USER_CANCELED) "cancelled" else msg.toString())
    })
    activity.runOnUiThread { p.authenticate(info, BiometricPrompt.CryptoObject(cipher)) }
  }

  fun seal(activity: FragmentActivity, account: String, value: String, done: (String?) -> Unit) {
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    try {
      c.init(Cipher.ENCRYPT_MODE, key(fresh = true))
    } catch (e: Exception) {
      return done(e.message ?: "The phone can't make a fingerprint key right now.")
    }
    prompt(activity, "Unlock sync with your fingerprint", c) { cipher, err ->
      if (cipher == null) return@prompt done(err)
      val ct = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
      activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString(account, Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)).apply()
      done(null)
    }
  }

  fun open(activity: FragmentActivity, account: String, title: String, done: (String?, String?) -> Unit) {
    val text = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(account, null) ?: return done(null, "not-sealed")
    val parts = text.split(":")
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    try {
      c.init(Cipher.DECRYPT_MODE, key(fresh = false), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
    } catch (e: KeyPermanentlyInvalidatedException) {
      forget(activity, account)
      return done(null, "invalidated")
    } catch (e: Exception) {
      return done(null, e.message ?: "unavailable")
    }
    prompt(activity, title, c) { cipher, err ->
      if (cipher == null) return@prompt done(null, err)
      try {
        done(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8), null)
      } catch (e: Exception) {
        done(null, "damaged")
      }
    }
  }
}

object Speech {
  private var tts: TextToSpeech? = null
  private var ready = false
  private val queue = mutableListOf<() -> Unit>()

  private fun with(ctx: Context, run: (TextToSpeech) -> Unit) {
    val t = tts
    if (t != null && ready) return run(t)
    queue.add { tts?.let(run) }
    if (t == null) {
      tts = TextToSpeech(ctx.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS
        if (ready) tts?.language = Locale.getDefault()
        val q = queue.toList()
        queue.clear()
        if (ready) q.forEach { it() }
      }
    }
  }

  fun speak(ctx: Context, text: String, pitch: Float, rate: Float, volume: Float, done: () -> Unit) {
    with(ctx) { t ->
      t.setPitch(pitch.coerceIn(0.5f, 2f))
      t.setSpeechRate(rate.coerceIn(0.5f, 2f))
      t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(id: String?) {}
        override fun onDone(id: String?) = done()
        @Deprecated("Deprecated in Java")
        override fun onError(id: String?) = done()
      })
      val params = android.os.Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume.coerceIn(0f, 1f)) }
      t.speak(text, TextToSpeech.QUEUE_FLUSH, params, "alef")
    }
  }

  fun stop() {
    tts?.stop()
  }
}

object Usage {
  fun granted(ctx: Context): Boolean {
    val ops = ctx.getSystemService(AppOpsManager::class.java)
    val mode = if (Build.VERSION.SDK_INT >= 29) ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
    else @Suppress("DEPRECATION") ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /** The app in front during the last few minutes, by its name ("Chrome"), or null. */
  fun foreground(ctx: Context): String? {
    if (!granted(ctx)) return null
    val usm = ctx.getSystemService(UsageStatsManager::class.java)
    val now = System.currentTimeMillis()
    val events = usm.queryEvents(now - 10 * 60_000L, now)
    var last: String? = null
    val e = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      if (e.eventType == UsageEvents.Event.ACTIVITY_RESUMED) last = e.packageName
    }
    val pkg = last ?: return null
    return try {
      val pm = ctx.packageManager
      pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) {
      pkg
    }
  }

  fun settings(ctx: Context) {
    ctx.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}

object ApkUpdate {
  /** Downloads `url`, checks it against `sha256`, then asks Android to install it. */
  fun run(ctx: Context, url: String, sha256: String): String? {
    if (!url.startsWith("https://")) return "The update must come over HTTPS."
    val file = File(ctx.cacheDir, "daybloom-update.apk")
    val md = MessageDigest.getInstance("SHA-256")
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.instanceFollowRedirects = true
    conn.connectTimeout = 20_000
    conn.readTimeout = 60_000
    conn.inputStream.use { input ->
      file.outputStream().use { out ->
        val buf = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          md.update(buf, 0, n)
          out.write(buf, 0, n)
        }
      }
    }
    val got = md.digest().joinToString("") { "%02x".format(it) }
    if (!got.equals(sha256.trim(), ignoreCase = true)) {
      file.delete()
      return "The download didn't match its checksum, so Daybloom didn't install it."
    }
    if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
      ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      return "allow-install"
    }
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
    ctx.startActivity(
      Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    return null
  }
}

/** "Quick add" in the quick-settings panel: opens Daybloom with the quick add field ready. */
class CaptureTile : TileService() {
  override fun onClick() {
    super.onClick()
    val i = packageManager.getLaunchIntentForPackage(packageName)!!
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra("daybloom.action", "capture")
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 7201, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    } else {
      @Suppress("DEPRECATION", "StartActivityAndCollapseDeprecated")
      startActivityAndCollapse(i)
    }
  }
}
