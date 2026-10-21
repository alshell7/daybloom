// The alarm, full screen: shown over the lock screen when a block set to ring as an alarm
// starts. The tone keeps playing from the alarm notification until you snooze or stop it here
// (or from the notification's buttons). Calm on purpose: the block's name, the time, two big
// buttons, no countdown and nothing to read.
package app.daybloom.device

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.util.Date

class AlarmActivity : AppCompatActivity() {
  private var reminder: Reminder? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    reminder = intent.getStringExtra("r")?.let { Reminder.from(JSONObject(it)) }
    setContentView(layout())
  }

  private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

  private fun layout(): View {
    val r = reminder
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(32f), dp(48f), dp(32f), dp(48f))
      background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#141B26"), Color.parseColor("#0B0F16")))
    }
    fun text(s: String, sp: Float, color: String, bold: Boolean = false) = TextView(this).apply {
      text = s
      setTextColor(Color.parseColor(color))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
      gravity = Gravity.CENTER
      if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }
    root.addView(text(DateFormat.getTimeFormat(this).format(Date()), 64f, "#F4F7FB"))
    root.addView(View(this), LinearLayout.LayoutParams(1, dp(18f)))
    root.addView(text(r?.title ?: "Alarm", 26f, "#F4F7FB", bold = true))
    root.addView(View(this), LinearLayout.LayoutParams(1, dp(8f)))
    root.addView(text(r?.body ?: "", 16f, "#9AA6B8"))
    root.addView(View(this), LinearLayout.LayoutParams(1, dp(64f)))

    fun button(label: String, fill: String, ink: String, onClick: () -> Unit) = Button(this).apply {
      text = label
      isAllCaps = false
      setTextColor(Color.parseColor(ink))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      background = GradientDrawable().apply {
        cornerRadius = dp(28f).toFloat()
        setColor(Color.parseColor(fill))
      }
      setOnClickListener { onClick() }
    }
    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56f)).apply { bottomMargin = dp(14f) }
    root.addView(button("Snooze ${r?.snoozeMin ?: 10} minutes", "#243042", "#E6ECF5") {
      r?.let { Reminders.snooze(this, it) } ?: Reminders.stop(this)
      done()
    }, lp)
    root.addView(button("Stop", "#F4F7FB", "#0B0F16") {
      Reminders.stop(this)
      done()
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56f)))
    return root
  }

  /** Back to whatever was there; a locked phone stays locked. */
  private fun done() = finishAndRemoveTask()
}
