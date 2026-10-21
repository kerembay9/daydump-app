package expo.modules.clipembedder

import android.content.Context
import android.content.pm.ApplicationInfo
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.assetpacks.AssetPackManagerFactory
import com.google.android.play.core.assetpacks.AssetPackState
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener
import com.google.android.play.core.assetpacks.model.AssetPackStatus
import java.io.File

/**
 * The big models ship as Play asset packs in release builds (android/<pack>/build.gradle); debug builds carry them in the APK.
 * All three download on their own, one at a time, so each gets the whole connection: vision (indexing, Discover, Create)
 * first, as fast-follow, so Play starts it at install; then the pack a screen asked for (want: Create wants text, the
 * selfie finder and People want faces), then the rest in Pack order. faces and text are on-demand, fetched here as the
 * one before lands. A release APK installed without Play (sideloaded, adb) never gets them: every pack stays "unavailable".
 * ponytail: a want waits for the pack already downloading (no cancel: Play may drop its bytes); cancel it if 41 MB waits hurt.
 * ponytail: WAITING_FOR_WIFI / REQUIRES_USER_CONFIRMATION just report "waiting"; add showConfirmationDialog if it shows up in the field.
 */
internal object ModelPacks {
  /** Declaration order = download order. probe: a file of the pack, to tell a debug APK that carries it. */
  enum class Pack(val pack: String, val probe: String) {
    VISION("visionpack", "vision_dw8.tflite"),
    FACES("facepack", "sface.tflite"),
    TEXT("textpack", "text.tflite");

    val key = name.lowercase()
  }

  class Missing(p: Pack) : IllegalStateException("${p.key} model not downloaded yet")

  /** The pack the latest screen asked for: next after vision. */
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
    val p = missing.firstOrNull { it == Pack.VISION } ?: wanted?.takeIf { it in missing } ?: missing.firstOrNull() ?: return
    fetching = p
    manager(ctx).fetch(listOf(p.pack))
  }

  /** {vision|faces|text: {state, progress}}. Blocking (Play's IPC), call off the main thread. */
  fun state(ctx: Context): Map<String, Any> {
    val missing = Pack.entries.filterNot { ready(ctx, it) }
    val states = if (missing.isEmpty()) emptyMap() else
      runCatching { Tasks.await(manager(ctx).getPackStates(missing.map { it.pack })).packStates() }.getOrNull()
    // what Play is really doing: a failed pack is fetched again, one a previous process started isn't doubled
    if (states != null) fetching = missing.firstOrNull { states[it.pack]?.status() in ACTIVE }
    next(ctx)
    return Pack.entries.associate { p ->
      p.key to when {
        p !in missing -> READY
        else -> states?.get(p.pack)?.let(::toMap) ?: UNAVAILABLE // no Play, or Play doesn't know this install
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
