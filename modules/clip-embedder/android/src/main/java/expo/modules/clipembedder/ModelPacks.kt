package expo.modules.clipembedder

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.assetpacks.AssetPackManagerFactory
import com.google.android.play.core.assetpacks.AssetPackState
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener
import com.google.android.play.core.assetpacks.model.AssetPackStatus
import java.io.File

/**
 * The big models ship as Play asset packs in release builds (android/<pack>/build.gradle); debug builds carry them in the APK.
 * One pack downloads at a time, in Pack order, so the first gets the whole connection: vision (indexing, Discover,
 * Create) is fast-follow, so Play starts it at install; faces and text are on-demand, fetched here as the one before
 * lands. A release APK installed without Play (sideloaded, adb) never gets them: every pack stays "unavailable".
 * ponytail: strict order; a feature waiting on a later pack doesn't jump the queue. Bump it in next() if that matters.
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

  private fun manager(ctx: Context) = AssetPackManagerFactory.getInstance(ctx)
  private fun inApk(ctx: Context, p: Pack) = ctx.assets.list("clip")?.contains(p.probe) == true
  fun ready(ctx: Context, p: Pack) = inApk(ctx, p) || manager(ctx).getPackLocation(p.pack) != null

  /** The pack's clip/ folder; null = the files are in the APK's assets (debug). Throws Missing while it isn't on the phone. */
  fun dir(ctx: Context, p: Pack): File? {
    if (inApk(ctx, p)) return null
    manager(ctx).getPackLocation(p.pack)?.assetsPath()?.let { return File(it, "clip") }
    next(ctx)
    throw Missing(p)
  }

  /** Fetches the first pack not on the phone yet (again, if it failed or was cancelled). Play ignores a fetch already under way. */
  fun next(ctx: Context) {
    Pack.entries.firstOrNull { !ready(ctx, it) }?.let { manager(ctx).fetch(listOf(it.pack)) }
  }

  /** {vision|faces|text: {state, progress}}. Blocking (Play's IPC), call off the main thread. */
  fun state(ctx: Context): Map<String, Any> {
    val missing = Pack.entries.filterNot { ready(ctx, it) }
    val states = if (missing.isEmpty()) emptyMap() else
      runCatching { Tasks.await(manager(ctx).getPackStates(missing.map { it.pack })).packStates() }.getOrNull()
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
      if (s.status() == AssetPackStatus.COMPLETED) next(ctx)
    }.also { manager(ctx).registerListener(it) }

  fun unlisten(ctx: Context, l: AssetPackStateUpdateListener) = manager(ctx).unregisterListener(l)
}
