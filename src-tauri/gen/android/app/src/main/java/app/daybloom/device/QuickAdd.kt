// Quick add, the way a to-do widget should: tap "+ Jot" on the Backlog widget and a card rises
// over the home screen with one field and the keyboard already up — no planner to open. Type,
// tap Add (or the keyboard's send), and it goes to the backlog; the card stays for the next one
// until you tap outside or go back. The mic fills the field with Android's speech recognition.
//
// What you add waits here (`QuickCaptures`) until the planner takes it — at once if it's running
// (src/lib/native/widgets.svelte.ts), else the next time it opens — and the widget shows it
// right away.
package app.daybloom.device

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.PorterDuff
import android.os.Bundle
import android.speech.RecognizerIntent
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject

/** Lines added from the quick-add card, until the planner files them in the backlog. */
object QuickCaptures {
  private const val PREFS = "daybloom_quick_add"
  /** Set by DevicePlugin while the planner's page is loaded. */
  @Volatile var listener: (() -> Unit)? = null

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun pending(ctx: Context): JSONArray = try {
    JSONArray(prefs(ctx).getString("q", "[]"))
  } catch (e: Exception) {
    JSONArray()
  }

  @Synchronized fun add(ctx: Context, text: String) {
    val a = pending(ctx)
    a.put(JSONObject().put("text", text.take(500)).put("at", System.currentTimeMillis()))
    prefs(ctx).edit().putString("q", a.toString()).commit()
    try {
      listener?.invoke()
    } catch (e: Exception) {
      // The planner takes it when it next opens.
    }
  }

  @Synchronized fun take(ctx: Context): JSONArray {
    val a = pending(ctx)
    prefs(ctx).edit().remove("q").commit()
    return a
  }
}

class QuickAddActivity : Activity() {
  private lateinit var field: EditText
  private lateinit var status: TextView
  private var added = 0

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    setContentView(resources.getIdentifier("quick_add", "layout", packageName))
    fun v(name: String): View = findViewById(resources.getIdentifier(name, "id", packageName))

    val card = v("card")
    field = v("field") as EditText
    status = v("status") as TextView
    val title = v("title") as TextView
    val mic = v("mic") as ImageButton
    val send = v("send") as ImageButton

    // The planner's own colours (as the widget has them), with text that always reads.
    val look = WidgetData.look(this, WidgetData.data(this))
    card.background?.mutate()?.setColorFilter(look.ground, PorterDuff.Mode.SRC_ATOP)
    title.setTextColor(look.ink)
    field.setTextColor(look.ink)
    field.setHintTextColor(look.ink2)
    status.setTextColor(look.ink2)
    mic.imageTintList = ColorStateList.valueOf(look.ink)
    val accent = WidgetData.color(WidgetData.data(this)?.optJSONObject("finish")?.optString("signal"), Color.parseColor("#E8603C"))
    send.background?.mutate()?.setColorFilter(accent, PorterDuff.Mode.SRC_ATOP)

    // Sit just above the keyboard (or the gesture bar) on an edge-to-edge screen.
    val pad = card.paddingBottom
    ViewCompat.setOnApplyWindowInsetsListener(card) { c, insets ->
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      val bars = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
      c.setPadding(c.paddingLeft, c.paddingTop, c.paddingRight, pad + maxOf(ime, bars))
      insets
    }

    v("scrim").setOnClickListener { finish() }
    send.setOnClickListener { add() }
    field.setOnEditorActionListener { _, action, event ->
      if (action == EditorInfo.IME_ACTION_SEND || action == EditorInfo.IME_ACTION_DONE || (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)) {
        add()
        true
      } else false
    }
    mic.setOnClickListener { listen() }

    field.requestFocus()
    field.post {
      getSystemService(InputMethodManager::class.java)?.showSoftInput(field, InputMethodManager.SHOW_IMPLICIT)
    }
    if (intent?.getBooleanExtra("voice", false) == true && savedInstanceState == null) listen()
  }

  private fun add() {
    val text = field.text?.toString()?.trim().orEmpty()
    if (text.isEmpty()) {
      if (added > 0) finish()
      return
    }
    QuickCaptures.add(this, text)
    added++
    field.setText("")
    status.text = if (added == 1) "Added “${text.take(60)}”. Add another, or tap outside." else "$added added. Add another, or tap outside."
    field.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM)
    WidgetData.updateAll(this)
  }

  private fun listen() {
    val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_PROMPT, "Say what to add")
    try {
      @Suppress("DEPRECATION")
      startActivityForResult(i, SPEECH)
    } catch (e: ActivityNotFoundException) {
      Toast.makeText(this, "This phone has no speech recognition", Toast.LENGTH_SHORT).show()
    }
  }

  @Deprecated("Deprecated in Java")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    @Suppress("DEPRECATION")
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != SPEECH || resultCode != RESULT_OK) return
    val heard = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim().orEmpty()
    if (heard.isEmpty()) return
    field.setText(heard)
    field.setSelection(heard.length)
  }

  override fun finish() {
    if (added > 0) Toast.makeText(this, if (added == 1) "Added to your backlog" else "$added added to your backlog", Toast.LENGTH_SHORT).show()
    super.finish()
  }

  companion object {
    private const val SPEECH = 41
  }
}
