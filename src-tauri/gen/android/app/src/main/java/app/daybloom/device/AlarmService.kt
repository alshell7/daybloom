// Rings an alarm: the block's tone on the alarm stream, looping, starting soft and growing over
// 40 seconds when "Start gently" is on (like the open app), with a gentle vibration, until it
// is snoozed or stopped — or the ring time runs out, which leaves a quiet "it rang" note. Runs
// as a foreground service so it keeps ringing with the app closed and the screen off; the
// exact alarm that wakes it is allowed to start one.
package app.daybloom.device

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import org.json.JSONObject

class AlarmService : Service() {
  private var player: MediaPlayer? = null
  private var focus: AudioFocusRequest? = null
  private val handler = Handler(Looper.getMainLooper())
  private var current: Reminder? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val r = intent?.getStringExtra("r")?.let { Reminder.from(JSONObject(it)) }
    if (r == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    ring(r)
    return START_NOT_STICKY
  }

  private fun vibrator(): Vibrator =
    if (Build.VERSION.SDK_INT >= 31) getSystemService(VibratorManager::class.java).defaultVibrator
    else @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator

  private fun ring(r: Reminder) {
    current = r
    val n = Reminders.alarmNotification(this, r)
    if (Build.VERSION.SDK_INT >= 29) startForeground(Reminders.ALARM_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(Reminders.ALARM_ID, n)

    quiet()
    val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    val am = getSystemService(AudioManager::class.java)
    focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attrs).build().also { am.requestAudioFocus(it) }
    val target = r.volume.toFloat().coerceIn(0.05f, 1f)
    player = MediaPlayer().apply {
      setAudioAttributes(attrs)
      setDataSource(this@AlarmService, Uri.parse("android.resource://$packageName/raw/tone_${r.tone}"))
      isLooping = true
      prepare()
      setVolume(if (r.gentle) target * 0.12f else target, if (r.gentle) target * 0.12f else target)
      start()
    }
    if (r.gentle) {
      val start = System.currentTimeMillis()
      val step = object : Runnable {
        override fun run() {
          val k = ((System.currentTimeMillis() - start) / 40_000f).coerceIn(0f, 1f)
          val v = target * (0.12f + 0.88f * k * k)
          player?.setVolume(v, v)
          if (k < 1f) handler.postDelayed(this, 500)
        }
      }
      handler.postDelayed(step, 500)
    }
    vibrator().vibrate(VibrationEffect.createWaveform(longArrayOf(0, 500, 900, 500, 2400), 0))
    handler.postDelayed({
      Reminders.rangOut(this, r)
      stopSelf()
    }, r.ringForMin * 60_000L)
  }

  private fun quiet() {
    handler.removeCallbacksAndMessages(null)
    player?.let {
      try {
        it.stop()
      } catch (_: Exception) {
      }
      it.release()
    }
    player = null
    vibrator().cancel()
    focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
    focus = null
  }

  override fun onDestroy() {
    quiet()
    super.onDestroy()
  }
}
