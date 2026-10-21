// Home-screen widgets. The planner sends a snapshot (src/lib/native/widgets.svelte.ts → the
// `widgets` command): the day's blocks for the next day or so, the dial's colours, and Alef's
// face drawn by the app's own eye renderer. From it Android draws, with the app closed:
//
//   Dial   the next 12 hours on a clock face (your blocks as arcs on the bezel, the "now" hand,
//          the rest of the current block as an inner ring), a live countdown in the middle and
//          what's next; "Done" ticks the block (the planner applies it when it next opens).
//   Alef   Alef's face as the planner last drew it (asleep at night), one kind line, and
//          "Start 2 min" for the block that's on.
//
// They redraw every few minutes and at each block's start and end, only while the screen is
// on (a non-waking alarm), so a widget costs nothing in a pocket.
package app.daybloom.device

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import android.os.SystemClock
import android.text.format.DateFormat
import android.util.Base64
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Calendar
import java.util.Date
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

data class WBlock(val key: String, val start: Long, val end: Long, val color: Int, val title: String, val done: Boolean, val own: Boolean)

object WidgetData {
  private const val PREFS = "daybloom_widgets"
  const val DONE = "app.daybloom.widget.DONE"
  const val TICK = "app.daybloom.widget.TICK"

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(ctx: Context, json: String) {
    prefs(ctx).edit().putString("data", json).apply()
    // The faces are decoded once here, not on every redraw.
    try {
      val a = JSONObject(json).optJSONObject("alef")
      for (name in listOf("face", "sleep")) {
        val b64 = a?.optString(name, "") ?: ""
        val file = java.io.File(ctx.filesDir, "widget-alef-$name.png")
        if (b64.isNotEmpty()) file.writeBytes(Base64.decode(b64, Base64.DEFAULT)) else file.delete()
      }
    } catch (_: Exception) {
    }
  }

  fun data(ctx: Context): JSONObject? = prefs(ctx).getString("data", null)?.let {
    try {
      JSONObject(it)
    } catch (e: Exception) {
      null
    }
  }

  fun pendingDone(ctx: Context): Set<String> = prefs(ctx).getStringSet("done", emptySet()) ?: emptySet()

  fun addDone(ctx: Context, key: String) {
    prefs(ctx).edit().putStringSet("done", pendingDone(ctx) + key).apply()
  }

  /** The ticks the planner hasn't applied yet; taking them clears the list. */
  fun takeDone(ctx: Context): Set<String> {
    val s = pendingDone(ctx)
    prefs(ctx).edit().remove("done").apply()
    return s
  }

  fun blocks(ctx: Context, d: JSONObject): List<WBlock> {
    val done = pendingDone(ctx)
    val a = d.optJSONArray("blocks") ?: return emptyList()
    return (0 until a.length()).mapNotNull {
      val o = a.optJSONObject(it) ?: return@mapNotNull null
      val key = o.optString("k")
      WBlock(key, o.optLong("s"), o.optLong("e"), color(o.optString("c"), Color.GRAY), o.optString("t"), o.optBoolean("done") || key in done, o.optBoolean("own"))
    }.sortedBy { it.start }
  }

  fun color(s: String?, fallback: Int): Int = try {
    if (s.isNullOrEmpty()) fallback else Color.parseColor(s)
  } catch (e: Exception) {
    fallback
  }

  fun updateAll(ctx: Context) {
    val m = AppWidgetManager.getInstance(ctx)
    for (id in m.getAppWidgetIds(ComponentName(ctx, DialWidget::class.java))) DialWidget.draw(ctx, m, id)
    for (id in m.getAppWidgetIds(ComponentName(ctx, AlefWidget::class.java))) AlefWidget.draw(ctx, m, id)
    schedule(ctx)
  }

  private fun any(ctx: Context): Boolean {
    val m = AppWidgetManager.getInstance(ctx)
    return m.getAppWidgetIds(ComponentName(ctx, DialWidget::class.java)).isNotEmpty() ||
      m.getAppWidgetIds(ComponentName(ctx, AlefWidget::class.java)).isNotEmpty()
  }

  /** The next redraw: in five minutes, or sooner when a block starts or ends. Screen on only. */
  fun schedule(ctx: Context) {
    val am = ctx.getSystemService(AlarmManager::class.java)
    val pi = PendingIntent.getBroadcast(ctx, 7101, Intent(ctx, WidgetReceiver::class.java).setAction(TICK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    am.cancel(pi)
    if (!any(ctx)) return
    val now = System.currentTimeMillis()
    var next = now + 5 * 60_000L
    data(ctx)?.let { d -> for (b in blocks(ctx, d)) for (t in listOf(b.start, b.end)) if (t in (now + 5_000) until next) next = t }
    am.setWindow(AlarmManager.RTC, next, 30_000L, pi)
  }

  fun launch(ctx: Context, action: String, key: String?): PendingIntent {
    val i = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      .putExtra("daybloom.action", action)
      .putExtra("daybloom.key", key ?: "")
    return PendingIntent.getActivity(ctx, (action + key).hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun time(ctx: Context, ms: Long): String = DateFormat.getTimeFormat(ctx).format(Date(ms))

  /** Widget size in pixels, from the launcher's options. */
  fun sizePx(ctx: Context, opts: Bundle?, fallbackDp: Int): Pair<Int, Int> {
    val d = ctx.resources.displayMetrics.density
    val w = opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)?.takeIf { it > 0 } ?: fallbackDp
    val h = opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)?.takeIf { it > 0 } ?: fallbackDp
    return Pair((w * d).toInt(), (h * d).toInt())
  }
}

class DialWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, m: AppWidgetManager, ids: IntArray) {
    for (id in ids) draw(ctx, m, id)
    WidgetData.schedule(ctx)
  }

  override fun onAppWidgetOptionsChanged(ctx: Context, m: AppWidgetManager, id: Int, opts: Bundle) = draw(ctx, m, id)
  override fun onDisabled(ctx: Context) = WidgetData.schedule(ctx)

  companion object {
    private fun id(ctx: Context, name: String) = ctx.resources.getIdentifier(name, "id", ctx.packageName)
    private fun layout(ctx: Context, name: String) = ctx.resources.getIdentifier(name, "layout", ctx.packageName)

    fun draw(ctx: Context, m: AppWidgetManager, wid: Int) {
      val v = RemoteViews(ctx.packageName, layout(ctx, "widget_dial"))
      val d = WidgetData.data(ctx)
      val now = System.currentTimeMillis()
      val (w, h) = WidgetData.sizePx(ctx, m.getAppWidgetOptions(wid), 180)
      val size = min(min(w, h), 900).coerceAtLeast(240)
      val blocks = d?.let { WidgetData.blocks(ctx, it) } ?: emptyList()
      val cur = blocks.firstOrNull { !it.done && it.start <= now && now < it.end }
      val next = blocks.firstOrNull { !it.done && it.start > now }
      val f = d?.optJSONObject("finish")
      v.setInt(id(ctx, "bg"), "setColorFilter", WidgetData.color(d?.optString("ground"), Color.parseColor("#EEF1F5")))
      v.setImageViewBitmap(id(ctx, "dial"), dialBitmap(size, now, blocks, cur, f))

      val ink = WidgetData.color(f?.optString("ink"), Color.parseColor("#1A2230"))
      v.setTextColor(id(ctx, "count"), ink)
      v.setTextColor(id(ctx, "title"), ink)
      if (cur != null) {
        v.setViewVisibility(id(ctx, "count"), View.VISIBLE)
        v.setChronometer(id(ctx, "count"), SystemClock.elapsedRealtime() + (cur.end - now), null, true)
        v.setChronometerCountDown(id(ctx, "count"), true)
        v.setTextViewText(id(ctx, "title"), cur.title.ifEmpty { "Now" })
      } else {
        v.setViewVisibility(id(ctx, "count"), View.GONE)
        v.setTextViewText(id(ctx, "title"), if (d == null) "Open Daybloom" else "Free time")
      }
      v.setTextViewText(id(ctx, "next"), when {
        next != null -> "Next · ${next.title.ifEmpty { "a block" }} · ${WidgetData.time(ctx, next.start)}"
        d == null -> "Your day, as a dial"
        else -> "Nothing else planned"
      })
      v.setTextColor(id(ctx, "next"), WidgetData.color(d?.optString("ink2"), Color.parseColor("#5B6678")))
      val doneId = id(ctx, "done")
      if (cur != null && cur.own) {
        v.setViewVisibility(doneId, View.VISIBLE)
        val i = Intent(ctx, WidgetReceiver::class.java).setAction(WidgetData.DONE).putExtra("key", cur.key)
        v.setOnClickPendingIntent(doneId, PendingIntent.getBroadcast(ctx, cur.key.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
      } else v.setViewVisibility(doneId, View.GONE)
      v.setOnClickPendingIntent(id(ctx, "root"), WidgetData.launch(ctx, "open", null))
      m.updateAppWidget(wid, v)
    }

    /** A 12-hour face in the dial's colours: the blocks ahead on the bezel, the hand at now. */
    fun dialBitmap(size: Int, now: Long, blocks: List<WBlock>, cur: WBlock?, f: JSONObject?): Bitmap {
      val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val c = Canvas(bmp)
      val face = WidgetData.color(f?.optString("face"), Color.parseColor("#F7F8FA"))
      val bezel = WidgetData.color(f?.optString("bezel"), Color.parseColor("#E3E7EE"))
      val track = WidgetData.color(f?.optString("track"), Color.parseColor("#B8C0CC"))
      val signal = WidgetData.color(f?.optString("signal"), Color.parseColor("#F05A28"))
      val lume = WidgetData.color(f?.optString("lume"), Color.parseColor("#7FD1A8"))
      val cx = size / 2f
      val r = size * 0.47f
      val ring = r * 0.2f
      val p = Paint(Paint.ANTI_ALIAS_FLAG)

      p.style = Paint.Style.FILL
      p.color = bezel
      c.drawCircle(cx, cx, r, p)
      p.color = face
      c.drawCircle(cx, cx, r - ring, p)

      // Hour marks on the face's edge.
      p.color = track
      p.strokeCap = Paint.Cap.ROUND
      p.strokeWidth = size * 0.012f
      for (i in 0 until 12) {
        val a = Math.toRadians(i * 30.0 - 90)
        val r1 = r - ring - size * 0.03f
        val r2 = r1 - (if (i % 3 == 0) size * 0.05f else size * 0.025f)
        c.drawLine(cx + (r1 * cos(a)).toFloat(), cx + (r1 * sin(a)).toFloat(), cx + (r2 * cos(a)).toFloat(), cx + (r2 * sin(a)).toFloat(), p)
      }

      fun angle(ms: Long): Float {
        val cal = Calendar.getInstance().apply { timeInMillis = ms }
        val hours = (cal.get(Calendar.HOUR) + cal.get(Calendar.MINUTE) / 60f + cal.get(Calendar.SECOND) / 3600f)
        return hours * 30f - 90f
      }
      val until = now + 12 * 3_600_000L
      val arcBox = RectF(cx - r + ring / 2, cx - r + ring / 2, cx + r - ring / 2, cx + r - ring / 2)
      p.style = Paint.Style.STROKE
      p.strokeCap = Paint.Cap.BUTT
      p.strokeWidth = ring * 0.86f
      for (b in blocks) {
        val s = maxOf(b.start, now)
        val e = minOf(b.end, until)
        if (e <= s) continue
        val sweep = (e - s) / 3_600_000f * 30f
        p.color = if (b.done) (lume and 0x00FFFFFF) or 0x99000000.toInt() else b.color
        c.drawArc(arcBox, angle(s) + 0.6f, (sweep - 1.2f).coerceAtLeast(0.8f), false, p)
      }

      // What's left of the block that's on, as an inner ring.
      if (cur != null) {
        val rr = (r - ring) * 0.74f
        val box = RectF(cx - rr, cx - rr, cx + rr, cx + rr)
        p.strokeWidth = size * 0.028f
        p.strokeCap = Paint.Cap.ROUND
        p.color = (cur.color and 0x00FFFFFF) or 0x33000000
        c.drawCircle(cx, cx, rr, p)
        p.color = cur.color
        val left = (minOf(cur.end, until) - now) / 3_600_000f * 30f
        c.drawArc(box, angle(now), left.coerceAtLeast(1f), false, p)
      }

      // The hand: from just inside the face out past the bezel, with a small tip.
      val a = Math.toRadians(angle(now).toDouble())
      p.color = signal
      p.strokeCap = Paint.Cap.ROUND
      p.strokeWidth = size * 0.016f
      val h1 = r - ring - size * 0.06f
      val h2 = r + size * 0.005f
      c.drawLine(cx + (h1 * cos(a)).toFloat(), cx + (h1 * sin(a)).toFloat(), cx + (h2 * cos(a)).toFloat(), cx + (h2 * sin(a)).toFloat(), p)
      return bmp
    }
  }
}

class AlefWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, m: AppWidgetManager, ids: IntArray) {
    for (id in ids) draw(ctx, m, id)
    WidgetData.schedule(ctx)
  }

  override fun onDisabled(ctx: Context) = WidgetData.schedule(ctx)

  companion object {
    private fun id(ctx: Context, name: String) = ctx.resources.getIdentifier(name, "id", ctx.packageName)

    fun draw(ctx: Context, m: AppWidgetManager, wid: Int) {
      val v = RemoteViews(ctx.packageName, ctx.resources.getIdentifier("widget_alef", "layout", ctx.packageName))
      val d = WidgetData.data(ctx)
      val a = d?.optJSONObject("alef")
      val now = System.currentTimeMillis()
      val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
      val asleep = hour >= 23 || hour < 6
      val file = java.io.File(ctx.filesDir, if (asleep) "widget-alef-sleep.png" else "widget-alef-face.png")
      if (file.exists()) v.setImageViewBitmap(id(ctx, "face"), BitmapFactory.decodeFile(file.path))
      v.setInt(id(ctx, "bg"), "setColorFilter", WidgetData.color(d?.optString("ground"), Color.parseColor("#EEF1F5")))
      v.setInt(id(ctx, "screen"), "setColorFilter", WidgetData.color(a?.optString("well"), Color.parseColor("#0E141C")))
      val blocks = d?.let { WidgetData.blocks(ctx, it) } ?: emptyList()
      val cur = blocks.firstOrNull { !it.done && it.own && it.start <= now && now < it.end }
      val line = when {
        a == null -> "Turn on Alef in Daybloom to see me here."
        asleep -> "Shh… resting. See you in the morning."
        cur != null -> a.optString("line").ifEmpty { "“${cur.title}” is on. Two minutes is a perfect start." }
        else -> a.optString("idle").ifEmpty { "I'm here when you need a hand." }
      }
      v.setTextViewText(id(ctx, "line"), line)
      v.setTextColor(id(ctx, "line"), WidgetData.color(d?.optString("ink"), Color.parseColor("#1A2230")))
      val start = id(ctx, "start")
      if (cur != null && !asleep) {
        v.setViewVisibility(start, View.VISIBLE)
        v.setOnClickPendingIntent(start, WidgetData.launch(ctx, "start2", cur.key))
      } else v.setViewVisibility(start, View.GONE)
      v.setOnClickPendingIntent(id(ctx, "root"), WidgetData.launch(ctx, "alef", null))
      m.updateAppWidget(wid, v)
    }
  }
}

class WidgetReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    when (intent.action) {
      WidgetData.DONE -> intent.getStringExtra("key")?.let { WidgetData.addDone(ctx, it) }
    }
    WidgetData.updateAll(ctx)
  }
}
