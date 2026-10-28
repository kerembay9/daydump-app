package expo.modules.clipembedder

import android.content.ComponentName
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Dev switch for the launcher icon (Profile → Developer tools → App icon). Each icon is an <activity-alias> of
// MainActivity named MainActivity_<icon> that holds the launcher intent filter (plugins/withAppIcons.js); the
// enabled one is what the home screen shows. MainActivity itself stays enabled, so shares and links keep working.
class AppIconModule : Module() {
  private val ctx get() = appContext.reactContext!!.applicationContext
  private val prefix get() = "${ctx.packageName}.MainActivity_"

  private fun aliases() = ctx.packageManager
    .getPackageInfo(ctx.packageName, PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS)
    .activities.orEmpty().filter { it.targetActivity != null && it.name.startsWith(prefix) }

  override fun definition() = ModuleDefinition {
    Name("AppIcon")

    Function("get") {
      val pm = ctx.packageManager
      val all = aliases()
      val on = all.firstOrNull {
        when (pm.getComponentEnabledSetting(ComponentName(ctx.packageName, it.name))) {
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
          PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> it.enabled
          else -> false
        }
      }
      mapOf("icons" to all.map { it.name.removePrefix(prefix) }, "current" to on?.name?.removePrefix(prefix))
    }

    Function("set") { icon: String ->
      val pm = ctx.packageManager
      // enable the new one first, so there's never a moment with no launcher entry
      aliases().sortedBy { it.name != prefix + icon }.forEach {
        val state = if (it.name == prefix + icon) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        pm.setComponentEnabledSetting(ComponentName(ctx.packageName, it.name), state, PackageManager.DONT_KILL_APP)
      }
    }
  }
}
