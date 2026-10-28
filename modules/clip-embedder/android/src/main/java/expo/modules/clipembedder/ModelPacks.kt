package expo.modules.clipembedder

import android.app.Activity
import android.content.Context
import android.content.pm.ApplicationInfo
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.assetpacks.AssetPackException
import com.google.android.play.core.assetpacks.AssetPackManagerFactory
import com.google.android.play.core.assetpacks.AssetPackState
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener
import com.google.android.play.core.assetpacks.model.AssetPackStatus
import java.io.File

/**
 * The big models ship as Play asset packs in release builds (android/<pack>/build.gradle); debug builds carry them in the APK.
 * app.json's pack config can put packs in the release APK too (app.plugin.js): those count as ready and Play is never asked.
 * The rest are fast-follow, so Play starts them at install, app opened or not, in an order Play picks. Whatever isn't on
 * the phone yet is fetched here one at a time: faces (onboarding's selfie step, which comes first) first, then the pack a
 * screen asked for (want: Create wants text), then the rest in Pack order. A release APK installed without Play
 * (sideloaded, adb) never gets them: every pack stays "unavailable".
 * ponytail: a want waits for the pack already downloading (no cancel: Play may drop its bytes); cancel it if 41 MB waits hurt.
 * A pack Play holds (WAITING_FOR_WIFI, REQUIRES_USER_CONFIRMATION) reports "waiting"; askToDownload shows Play's own dialog for it.
 */
internal object ModelPacks {
  /** Declaration order = download order. probe: a file of the pack, to tell a debug APK that carries it. */
  enum class Pack(val pack: String, val probe: String) {
    FACES("facepack", "sface.tflite"),
    VISION("visionpack", "vision_dw8.tflite"),
    TEXT("textpack", "text.tflite");

    val key = name.lowercase()
  }

  class Missing(p: Pack) : IllegalStateException("${p.key} model not downloaded yet")

  /** The pack the latest screen asked for: next after faces. */
  @Volatile private var wanted: Pack? = null
  /** The pack being fetched (null: none, or one a previous process started that state() hasn't seen yet). */
  @Volatile private var fetching: Pack? = null

  private fun manager(ctx: Context) = AssetPackManagerFactory.getInstance(ctx)
  private fun inApk(ctx: Context, p: Pack) = ctx.assets.list("clip")?.contains(p.probe) == true && !hidden(ctx, p)
  /** Debug only: a no-<pack> file in the app's external files dir (adb shell touch …/Android/data/<app>/files/no-vision) makes the APK's copy count as missing, to try the paths that run before a download. */
  private fun hidden(ctx: Context, p: Pack) = ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0 && File(ctx.getExternalFilesDir(null), "no-${p.key}").exists()
  fun ready(ctx: Context, p: Pack) = inApk(ctx, p) || manager(ctx).getPackLocation(p.pack) != null

  /** The pack's clip/ folder; null = the files are in the APK's assets (debug). Throws Missing while it isn't on the phone. */
  fun dir(ctx: Context, p: Pack): File? {
    if (inApk(ctx, p)) return null
    manager(ctx).getPackLocation(p.pack)?.assetsPath()?.let { return File(it, "clip") }
    want(ctx, p)
    throw Missing(p)
  }

  fun want(ctx: Context, p: Pack) { wanted = p; next(ctx) }

  /** Fetches the next pack not on the phone yet (again, if it failed or was cancelled), unless one is under way. */
  fun next(ctx: Context) {
    val missing = Pack.entries.filterNot { ready(ctx, it) }
    if (fetching in missing) return
    // faces, then vision (Home's dumps and Create's grid wait on it), then a wanted pack, then Pack order
    val p = missing.firstOrNull { it == Pack.FACES || it == Pack.VISION } ?: wanted?.takeIf { it in missing } ?: missing.firstOrNull() ?: return
    fetching = p
    manager(ctx).fetch(listOf(p.pack))
  }

  /** {vision|faces|text: {state, progress}}. Blocking (Play's IPC), call off the main thread. */
  fun state(ctx: Context): Map<String, Any> {
    val missing = Pack.entries.filterNot { ready(ctx, it) }
    var why = 0 // Play's reason when it can't (AssetPackErrorCode: -1 app unavailable, -2 pack unavailable, -6 network…), shown on the card
    val states = if (missing.isEmpty()) emptyMap() else
      runCatching { Tasks.await(manager(ctx).getPackStates(missing.map { it.pack })).packStates() }
        .onFailure { why = ((it.cause ?: it) as? AssetPackException)?.errorCode ?: 0 }.getOrNull()
    // what Play is really doing: a failed pack is fetched again, one a previous process started isn't doubled
    if (states != null) fetching = missing.firstOrNull { states[it.pack]?.status() in ACTIVE }
    next(ctx)
    return Pack.entries.associate { p ->
      p.key to when {
        p !in missing -> READY
        else -> states?.get(p.pack)?.let(::toMap) ?: (UNAVAILABLE + ("error" to why)) // no Play, or Play doesn't know this install
      }
    }
  }

  private val READY = mapOf("state" to "ready", "progress" to 1.0)
  private val UNAVAILABLE = mapOf("state" to "unavailable", "progress" to 0.0)
  private val ACTIVE = setOf(AssetPackStatus.PENDING, AssetPackStatus.DOWNLOADING, AssetPackStatus.TRANSFERRING,
    AssetPackStatus.WAITING_FOR_WIFI, AssetPackStatus.REQUIRES_USER_CONFIRMATION)

  private fun toMap(s: AssetPackState): Map<String, Any> = when (s.status()) {
    AssetPackStatus.COMPLETED -> READY
    AssetPackStatus.FAILED -> mapOf("state" to "failed", "progress" to 0.0, "error" to s.errorCode())
    AssetPackStatus.WAITING_FOR_WIFI, AssetPackStatus.REQUIRES_USER_CONFIRMATION -> mapOf("state" to "waiting", "progress" to 0.0)
    // behind another pack in the order (or cancelled: next() fetches it again in its turn)
    AssetPackStatus.NOT_INSTALLED, AssetPackStatus.CANCELED, AssetPackStatus.UNKNOWN -> mapOf("state" to "queued", "progress" to 0.0)
    AssetPackStatus.TRANSFERRING -> mapOf("state" to "downloading", "progress" to s.transferProgressPercentage() / 100.0)
    else -> mapOf("state" to "downloading", "progress" to if (s.totalBytesToDownload() > 0) s.bytesDownloaded().toDouble() / s.totalBytesToDownload() else 0.0)
  }

  /** Play's dialog for a pack it's holding: use mobile data (WAITING_FOR_WIFI) or its confirmation. True if the user said yes. Main thread. */
  fun askToDownload(act: Activity): Task<Boolean> {
    val m = manager(act)
    return m.getPackStates(Pack.entries.filterNot { ready(act, it) }.map { it.pack }).onSuccessTask { s ->
      val held = s!!.packStates().values.map { it.status() }
      when {
        AssetPackStatus.WAITING_FOR_WIFI in held -> m.showCellularDataConfirmation(act)
        AssetPackStatus.REQUIRES_USER_CONFIRMATION in held -> m.showConfirmationDialog(act)
        else -> Tasks.forResult(Activity.RESULT_OK) // not held any more (Wi-Fi came back)
      }
    }.continueWith { it.result == Activity.RESULT_OK }
  }

  /** cb gets {pack, state, progress} per update; a pack that lands starts the next one. */
  fun listen(ctx: Context, cb: (Map<String, Any>) -> Unit) =
    AssetPackStateUpdateListener { s ->
      val p = Pack.entries.firstOrNull { it.pack == s.name() } ?: return@AssetPackStateUpdateListener
      cb(toMap(s) + ("pack" to p.key))
      if (s.status() !in ACTIVE && fetching == p) fetching = null // failed or cancelled: fetched again at the next modelState
      if (s.status() == AssetPackStatus.COMPLETED) next(ctx)
    }.also { manager(ctx).registerListener(it) }

  fun unlisten(ctx: Context, l: AssetPackStateUpdateListener) = manager(ctx).unregisterListener(l)
}
