package app.daybloom

import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.daybloom.device.Appearance

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // The icon stays on top while the planner starts underneath it (the web view can only get
    // ready to draw while the app draws), and fades once the page has painted its first screen
    // (`shown` in DevicePlugin): a start goes from the icon straight to the dial, with no empty
    // page between. A page that never says so (a failed start) still gets the screen at 2.5 s.
    val started = SystemClock.uptimeMillis()
    Appearance.starting()
    installSplashScreen().setOnExitAnimationListener { splash ->
      var gone = false
      val fade = Runnable {
        if (!gone) {
          gone = true
          splash.view.animate().alpha(0f).setDuration(200).withEndAction { splash.remove() }.start()
        }
      }
      Appearance.whenShown { runOnUiThread(fade) }
      window.decorView.postDelayed(fade, (2500 - (SystemClock.uptimeMillis() - started)).coerceAtLeast(0))
    }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    window.setBackgroundDrawable(ColorDrawable(Appearance.ground(this)))
  }
}
