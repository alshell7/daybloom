// Reminders that work while Daybloom is closed. The planner hands over the next two days
// (src/lib/native/reminders.svelte.ts → `schedule`): block starts, heads-ups, alerts, salah
// times and alarms. Android keeps them in its alarm clock (exact, allowed while idle),
// posts each when its time comes, and after a restart or a clock change puts them back.
//
// An alarm rings like a clock's (AlarmService): the block's own tone on the alarm stream
// (rendered from the app's synthesiser, res/raw/tone_*.wav), growing gently, until it's
// answered or the ring time runs out; on a locked or idle phone AlarmActivity opens full
// screen. A focus session shows a quiet ongoing notification that counts down by itself.
package app.daybloom.device

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

data class Reminder(
  val id: String,
  val at: Long,
  /** alarm | start | heads | before | salah | focusEnd */
  val kind: String,
  val title: String,
  val body: String,
  val tone: String = "dawn",
  val ringForMin: Int = 5,
  val snoozeMin: Int = 10,
  /** Start soft and grow over 40 seconds. */
  val gentle: Boolean = true,
  /** 0..1, within the phone's alarm volume. */
  val volume: Double = 0.7,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id).put("at", at).put("kind", kind).put("title", title).put("body", body)
    .put("tone", tone).put("ringForMin", ringForMin).put("snoozeMin", snoozeMin)
    .put("gentle", gentle).put("volume", volume)

  companion object {
    fun from(o: JSONObject) = Reminder(
      id = o.getString("id"),
      at = o.getLong("at"),
      kind = o.optString("kind", "start"),
      title = o.optString("title", "Daybloom"),
      body = o.optString("body", ""),
      tone = o.optString("tone", "dawn").ifEmpty { "dawn" },
      ringForMin = o.optInt("ringForMin", 5).coerceIn(1, 30),
      snoozeMin = o.optInt("snoozeMin", 10).coerceIn(1, 60),
      gentle = o.optBoolean("gentle", true),
      volume = o.optDouble("volume", 0.7).coerceIn(0.0, 1.0),
    )
  }
}

object Reminders {
  private const val PREFS = "daybloom_reminders"
  const val FIRE = "app.daybloom.reminder.FIRE"
  const val SNOOZE = "app.daybloom.reminder.SNOOZE"
  const val STOP = "app.daybloom.reminder.STOP"
  const val ALARM_ID = 7001
  const val FOCUS_ID = 7002
  private val TONES = listOf("dawn", "meadow", "harp", "chimes", "bedside", "musicbox", "tide")

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun nm(ctx: Context) = ctx.getSystemService(NotificationManager::class.java)
  private fun am(ctx: Context) = ctx.getSystemService(AlarmManager::class.java)

  fun channels(ctx: Context) {
    val nm = nm(ctx)
    nm.createNotificationChannel(NotificationChannel("reminders", "Reminders", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "When a block starts, a heads-up before it ends, and your alerts"
    })
    nm.createNotificationChannel(NotificationChannel("salah", "Salah", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Prayer times from the Waqt addon"
    })
    nm.createNotificationChannel(NotificationChannel("focus", "Focus", NotificationManager.IMPORTANCE_LOW).apply {
      description = "The focus timer, counting down"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    })
    // AlarmService plays the tone and vibrates; the notification itself stays quiet.
    nm.createNotificationChannel(NotificationChannel("alarms", "Alarms", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Blocks you set to ring as an alarm"
      setSound(null, null)
      enableVibration(false)
    })
    for (t in TONES) nm.deleteNotificationChannel("alarm-$t")
  }

  private fun fireIntent(ctx: Context, r: Reminder): PendingIntent {
    val i = Intent(ctx, ReminderReceiver::class.java).setAction(FIRE).putExtra("r", r.toJson().toString())
    return PendingIntent.getBroadcast(ctx, r.id.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun openApp(ctx: Context): PendingIntent {
    val i = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, 1, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun canExact(ctx: Context): Boolean = Build.VERSION.SDK_INT < 31 || am(ctx).canScheduleExactAlarms()

  /** Replaces every scheduled reminder with `list` (past ones are skipped). */
  fun schedule(ctx: Context, list: List<Reminder>) {
    channels(ctx)
    val old = load(ctx)
    for (r in old) am(ctx).cancel(fireIntent(ctx, r))
    val now = System.currentTimeMillis()
    val next = list.filter { it.at > now - 30_000 }.sortedBy { it.at }.take(120)
    save(ctx, next)
    for (r in next) arm(ctx, r)
  }

  private fun arm(ctx: Context, r: Reminder) {
    val pi = fireIntent(ctx, r)
    val am = am(ctx)
    when {
      r.kind == "alarm" && canExact(ctx) -> am.setAlarmClock(AlarmManager.AlarmClockInfo(r.at, openApp(ctx)), pi)
      canExact(ctx) -> am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.at, pi)
      else -> am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.at, pi)
    }
  }

  /** After a restart, an update or a clock change. */
  fun rearm(ctx: Context) {
    val now = System.currentTimeMillis()
    val left = load(ctx).filter { it.at > now }
    save(ctx, left)
    for (r in left) arm(ctx, r)
  }

  private fun load(ctx: Context): List<Reminder> {
    val text = prefs(ctx).getString("list", null) ?: return emptyList()
    return try {
      val a = JSONArray(text)
      (0 until a.length()).map { Reminder.from(a.getJSONObject(it)) }
    } catch (e: Exception) {
      emptyList()
    }
  }

  private fun save(ctx: Context, list: List<Reminder>) {
    val a = JSONArray()
    for (r in list) a.put(r.toJson())
    prefs(ctx).edit().putString("list", a.toString()).apply()
  }

  fun fire(ctx: Context, r: Reminder) {
    channels(ctx)
    when (r.kind) {
      "alarm" -> ring(ctx, r)
      "focusEnd" -> {
        nm(ctx).cancel(FOCUS_ID)
        post(ctx, r, "reminders")
      }
      "salah" -> post(ctx, r, "salah")
      else -> post(ctx, r, "reminders")
    }
  }

  private fun post(ctx: Context, r: Reminder, channel: String) {
    val n = NotificationCompat.Builder(ctx, channel)
      .setSmallIcon(R_drawable.stat(ctx))
      .setContentTitle(r.title)
      .setContentText(r.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(r.body))
      .setContentIntent(openApp(ctx))
      .setAutoCancel(true)
      .setCategory(if (channel == "salah") NotificationCompat.CATEGORY_REMINDER else NotificationCompat.CATEGORY_EVENT)
      .build()
    nm(ctx).notify(r.id.hashCode(), n)
  }

  private fun action(ctx: Context, what: String, r: Reminder): PendingIntent {
    val i = Intent(ctx, ReminderReceiver::class.java).setAction(what).putExtra("r", r.toJson().toString())
    return PendingIntent.getBroadcast(ctx, (what + r.id).hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun ring(ctx: Context, r: Reminder) {
    val tone = if (r.tone in TONES) r.tone else "dawn"
    val i = Intent(ctx, AlarmService::class.java).putExtra("r", r.copy(tone = tone).toJson().toString())
    androidx.core.content.ContextCompat.startForegroundService(ctx, i)
  }

  /** The ringing alarm's notification (AlarmService shows it while it plays). */
  fun alarmNotification(ctx: Context, r: Reminder): Notification {
    channels(ctx)
    val full = Intent(ctx, AlarmActivity::class.java)
      .putExtra("r", r.toJson().toString())
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    val fullPi = PendingIntent.getActivity(ctx, r.id.hashCode(), full, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return NotificationCompat.Builder(ctx, "alarms")
      .setSmallIcon(R_drawable.stat(ctx))
      .setContentTitle(r.title)
      .setContentText(r.body)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setFullScreenIntent(fullPi, true)
      .setContentIntent(fullPi)
      .setOngoing(true)
      .setAutoCancel(false)
      .addAction(0, "Snooze ${r.snoozeMin} min", action(ctx, SNOOZE, r))
      .addAction(0, "Stop", action(ctx, STOP, r))
      .build()
  }

  fun stop(ctx: Context) {
    ctx.stopService(Intent(ctx, AlarmService::class.java))
    nm(ctx).cancel(ALARM_ID)
  }

  /** Nobody answered: a calm note instead of more ringing. */
  fun rangOut(ctx: Context, r: Reminder) {
    val time = android.text.format.DateFormat.getTimeFormat(ctx).format(java.util.Date(r.at))
    post(ctx, r.copy(id = "rang:${r.id}", title = "Your alarm rang at $time", body = "${r.title}. Whenever you're ready."), "reminders")
  }

  fun snooze(ctx: Context, r: Reminder) {
    stop(ctx)
    val again = r.copy(id = "snooze:${r.id}", at = System.currentTimeMillis() + r.snoozeMin * 60_000L, body = "Snoozed · ${r.body}")
    save(ctx, load(ctx).filter { it.id != again.id } + again)
    arm(ctx, again)
  }

  // -- the focus timer --------------------------------------------------------------------

  fun focusShow(ctx: Context, title: String, body: String, endsAt: Long) {
    channels(ctx)
    val n = NotificationCompat.Builder(ctx, "focus")
      .setSmallIcon(R_drawable.stat(ctx))
      .setContentTitle(title)
      .setContentText(body)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setWhen(endsAt)
      .setShowWhen(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setContentIntent(openApp(ctx))
      .build()
    nm(ctx).notify(FOCUS_ID, n)
  }

  fun focusHide(ctx: Context) = nm(ctx).cancel(FOCUS_ID)
}

/** The small monochrome icon in the status bar (res/drawable/ic_stat_daybloom.xml). */
object R_drawable {
  fun stat(ctx: Context): Int = ctx.resources.getIdentifier("ic_stat_daybloom", "drawable", ctx.packageName)
}

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    val r = intent.getStringExtra("r")?.let { Reminder.from(JSONObject(it)) }
    when (intent.action) {
      Reminders.FIRE -> r?.let { Reminders.fire(ctx, it) }
      Reminders.SNOOZE -> r?.let { Reminders.snooze(ctx, it) }
      Reminders.STOP -> Reminders.stop(ctx)
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED, AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> Reminders.rearm(ctx)
    }
  }
}
