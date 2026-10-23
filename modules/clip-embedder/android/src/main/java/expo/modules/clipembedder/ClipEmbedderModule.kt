package expo.modules.clipembedder

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.FileProvider
import androidx.core.view.WindowInsetsControllerCompat
import com.google.ai.edge.litert.Accelerator
import com.google.ai.edge.litert.CompiledModel
import com.google.ai.edge.litert.TensorBuffer
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import android.util.Size
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlin.math.sqrt
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val SIZE = 224
private const val PLANE = SIZE * SIZE
internal const val DIM = 512
private val MEAN = floatArrayOf(0.48145466f, 0.4578275f, 0.40821073f)
private val STD = floatArrayOf(0.26862954f, 0.26130258f, 0.27577711f)

/**
 * TinyCLIP image/text embeddings, all LiteRT. Images: the GPU (vision.tflite, batch 1, built from vision_dw8: VisionGpu) with
 * the CPU (vision_dw8.tflite) helping; without a usable GPU, vision_dw8 alone. Text: the CPU (text.tflite, dynamic int8).
 * Release builds download vision_dw8, concepts, sface and text after the install (ModelPacks); calls needing one that
 * hasn't landed reject ("... not downloaded yet") and work once it has. Vectors cross the bridge as base64
 * little-endian Float32 (n * 512), L2-normalized. A photo that fails to decode yields a zero vector.
 */
class ClipEmbedderModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val clip get() = ClipEngine.get(ctx)
  private val yunet by lazy { YuNet(ctx, null, 320) }
  // selfieCheck's own: detect is synchronized, and the finder overlaps the check with the next photos' thumbnails (faces)
  private val yunetCheck by lazy { YuNet(ctx, null, 320) }
  private val selfieGate by lazy { Gate(ctx) }
  private val sface by lazy { SFace(ctx, ModelPacks.dir(ctx, ModelPacks.Pack.FACES)?.resolve("sface.tflite")?.path) }
  private var packListener: com.google.android.play.core.assetpacks.AssetPackStateUpdateListener? = null

  override fun definition() = ModuleDefinition {
    Name("ClipEmbedder")

    // "Open with DayDump" / share-to-DayDump (intent filters in app.json): images handed to the app.
    Events("onShareIntent", "onModels")
    Function("getInitialShareIntent") { appContext.currentActivity?.intent?.let { takeShare(it) } }
    OnNewIntent { intent -> takeShare(intent)?.let { sendEvent("onShareIntent", it) } }

    // Edge-to-edge: drop the system scrim behind the 3-button nav bar (the tab bar paints bg-card there) and
    // set the button colour to match the app theme (light = dark buttons).
    Function("setNavigationBarStyle") { light: Boolean ->
      appContext.currentActivity?.let { a ->
        a.runOnUiThread {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) a.window.isNavigationBarContrastEnforced = false
          WindowInsetsControllerCompat(a.window, a.window.decorView).isAppearanceLightNavigationBars = light
        }
      }
    }
    // Multi-image share (ACTION_SEND_MULTIPLE). target: "instagram" | "tiktok" | null; returns the package that got it or "chooser".
    AsyncFunction("shareImages") { uris: List<String>, caption: String, target: String? -> shareImages(uris, caption, target) }
    Function("shareTargets") { TARGETS.keys.filter { forTarget(ctx.packageManager, Intent(Intent.ACTION_SEND_MULTIPLE).setType("image/*"), it) != null } }

    // thumb > 0: content:// uris decoded from MediaStore's cached thumbnail, requested at thumb x thumb.
    AsyncFunction("embedImages") Coroutine { uris: List<String>, thumb: Int? ->
      withContext(Dispatchers.Default) { encode(clip.embedImages(uris, thumb ?: 0)) }
    }

    // model: use filesDir/models/vision_<model>.tflite (pushed by hand, see build_assets.py bench) instead of the bundled one.
    AsyncFunction("configure") Coroutine { parallelDecode: Boolean, eng: String, model: String? ->
      withContext(Dispatchers.Default) { clip.configure(parallelDecode, eng, model) }
    }

    // Split of the last embedImages call: decode vs model ms, plus the first decoded bitmap's size.
    Function("lastEmbedTimings") { clip.timings }

    AsyncFunction("embedTexts") Coroutine { texts: List<String> ->
      withContext(Dispatchers.Default) { encode(clip.embedTexts(texts)) }
    }

    // The model downloads (ModelPacks), per pack: ready | downloading (progress 0..1) | queued | waiting | failed | unavailable (no Play).
    AsyncFunction("modelState") Coroutine { -> withContext(Dispatchers.IO) { ModelPacks.state(ctx) } }
    Function("wantModel") { pack: String -> ModelPacks.Pack.entries.firstOrNull { it.key == pack }?.let { ModelPacks.want(ctx, it) } }
    OnCreate {
      packListener = ModelPacks.listen(ctx) { sendEvent("onModels", it) }
      ModelPacks.next(ctx)
    }
    OnDestroy { packListener?.let { ModelPacks.unlisten(ctx, it) } }

    AsyncFunction("tokenize") Coroutine { s: String ->
      withContext(Dispatchers.Default) { clip.tokenizer.encode(s).toList() }
    }

    // Top-k vocabulary concepts per vector (n*512 base64) -> flat n*k ids/scores, best first.
    AsyncFunction("topConcepts") Coroutine { vecsB64: String, k: Int ->
      withContext(Dispatchers.Default) { clip.topConcepts(decode(vecsB64), k) }
    }

    // Loads the selfie scan's YuNets, SFace and CLIP ahead (~0.3 s on a fresh install: XNNPACK packs the weights), so its first look doesn't wait.
    AsyncFunction("warmSelfie") Coroutine { ->
      withContext(Dispatchers.Default) {
        yunet.detect(Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888), 1.0, null)
        yunetCheck.detect(Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888), 1.0, null)
        runCatching { sface.embed(Bitmap.createBitmap(112, 112, Bitmap.Config.ARGB_8888), floatArrayOf(38f, 52f, 74f, 52f, 56f, 72f, 42f, 92f, 71f, 92f)) } // no faces pack yet: loads later
        if (ModelPacks.ready(ctx, ModelPacks.Pack.VISION)) clip.embedNow(0, Channel<Pair<Int, Bitmap>>().apply { close() })
        else selfieGate.score(Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888))
        Unit
      }
    }

    // YuNet faces per photo, best first (+ SFace vectors with embed); a photo that fails to decode has none.
    // Decodes 4 at a time (decoding is ~90% of the cost); thumb > 0: MediaStore thumbnails of content:// uris.
    AsyncFunction("faces") Coroutine { uris: List<String>, minScore: Double, embed: Boolean, thumb: Int? ->
      withContext(Dispatchers.Default) {
        val sf = if (embed) sface else null // rejects while the faces pack hasn't landed
        val none = mapOf("aspect" to 1.0, "faces" to emptyList<Any>())
        var decodeMs = 0L
        val t0 = SystemClock.elapsedRealtime()
        uris.chunked(4).flatMap { c ->
          val d = SystemClock.elapsedRealtime()
          c.map { u -> async(Dispatchers.IO) { runCatching { yunet.decode(ctx, u, sf != null, thumb ?: 0) }.getOrNull() } }.awaitAll()
            .also { decodeMs += SystemClock.elapsedRealtime() - d }
            .map { b -> b?.let { runCatching { yunet.detect(it, minScore, sf) }.getOrNull() } ?: none }
        }.also { Log.i("ClipEmbedder", "faces ${uris.size} (thumb ${thumb ?: 0}): ${SystemClock.elapsedRealtime() - t0} ms, decode wait $decodeMs") }
      }
    }

    // The selfie finder's check of its solo photos: each decoded once (720 with embed, for SFace; else 320), YuNet (+ SFace, one-face photos only)
    // on it while CLIP (embedNow) reads a 224 copy, side by side. -> { scans: as faces, vecs: as embedImages }. Without visionpack
    // the Gate scores each photo instead: { scans, vecs: "", reject: P(document, screen or pet), gateVecs: n x 1024 base64,
    // sharp: Laplacian variance of the single face (0: not one face) }.
    AsyncFunction("selfieCheck") Coroutine { uris: List<String>, minScore: Double, embed: Boolean ->
      withContext(Dispatchers.Default) {
        val sf = if (embed) sface else null
        val none = mapOf("aspect" to 1.0, "faces" to emptyList<Any>())
        val t0 = SystemClock.elapsedRealtime()
        val gate = Semaphore(4)
        val decoded = uris.map { u -> async(Dispatchers.IO) { gate.withPermit { runCatching { yunetCheck.decode(ctx, u, sf != null, 0) }.getOrNull() } } }
        val small = Channel<Pair<Int, Bitmap>>(Channel.UNLIMITED)
        val vision = ModelPacks.ready(ctx, ModelPacks.Pack.VISION)
        val vecs = if (vision) async { clip.embedNow(uris.size, small) } else null
        val reject = DoubleArray(uris.size)
        val sharp = DoubleArray(uris.size)
        val gateVecs = if (vision) null else FloatArray(uris.size * 1024)
        var detectMs = 0L
        var gateMs = 0L
        val split = DoubleArray(3) // prep (scale + pixels), YuNet, SFace
        val scans = try {
          decoded.mapIndexed { i, d ->
            val b = d.await() ?: return@mapIndexed none
            if (vision) small.send(i to clipSize(b))
            else {
              val g = SystemClock.elapsedRealtime()
              runCatching { selfieGate.score(b) }.getOrNull()?.let { (p, f) -> reject[i] = p; f.copyInto(gateVecs!!, i * 1024) }
              gateMs += SystemClock.elapsedRealtime() - g
            }
            val t = SystemClock.elapsedRealtime()
            (runCatching { yunetCheck.detect(b, minScore, sf, solo = true, keepFull = !vision) }.getOrNull() ?: none).also { r ->
              detectMs += SystemClock.elapsedRealtime() - t
              listOf("decodeMs", "modelMs", "sfaceMs").forEachIndexed { k, key -> split[k] += r[key] as? Double ?: 0.0 }
              if (!vision) {
                (r["faces"] as? List<*>)?.singleOrNull()?.let { f -> f as Map<*, *>
                  val g = SystemClock.elapsedRealtime()
                  sharp[i] = runCatching { selfieGate.sharpness(b, f["x"] as Double, f["y"] as Double, f["w"] as Double, f["h"] as Double) }.getOrDefault(0.0)
                  gateMs += SystemClock.elapsedRealtime() - g
                }
                b.recycle()
              }
            }
          }
        } finally { small.close() }
        val t1 = SystemClock.elapsedRealtime()
        val v = vecs?.await()
        Log.i("ClipEmbedder", "selfieCheck ${uris.size}: faces done ${t1 - t0} ms (detect $detectMs: ${split.joinToString("/") { it.toInt().toString() }} prep/yunet/sface${if (vision) "" else ", gate+sharpness $gateMs"}), ${if (vision) "clip" else "gate"} done ${SystemClock.elapsedRealtime() - t0} ms")
        mapOf("scans" to scans, "vecs" to (v?.let(::encode) ?: ""), "reject" to reject.toList(), "gateVecs" to (gateVecs?.let(::encode) ?: ""), "sharp" to sharp.toList())
      }
    }

    // The app calls this on every touch: indexing waits until then (holdIndexing).
    Function("holdIndexing") { ms: Double -> holdUntil = SystemClock.uptimeMillis() + ms.toLong() }
    AsyncFunction("conceptNames") Coroutine { -> withContext(Dispatchers.Default) { clip.vocabNames.toList() } }

    AsyncFunction("scheduleBackgroundIndex") Coroutine { ids: List<String>, uris: List<String>, model: String, fast: Boolean ->
      withContext(Dispatchers.IO) { BackgroundIndex.schedule(ctx, ids, uris, model, fast) }
    }

    AsyncFunction("cancelBackgroundIndex") { BackgroundIndex.cancel(ctx) }
    AsyncFunction("pauseBackgroundIndex") Coroutine { -> withContext(Dispatchers.IO) { BackgroundIndex.pause(ctx) } }
    AsyncFunction("resumeBackgroundIndex") Coroutine { -> withContext(Dispatchers.IO) { BackgroundIndex.resume(ctx) } }
    AsyncFunction("backgroundIndexStatus") Coroutine { -> withContext(Dispatchers.IO) { BackgroundIndex.status(ctx) } }

    AsyncFunction("takeBackgroundResults") Coroutine { limit: Int ->
      withContext(Dispatchers.IO) { BackgroundIndex.take(ctx, limit) }
    }

    AsyncFunction("scheduleDailyRecap") { DailyRecap.schedule(ctx) }
    AsyncFunction("cancelDailyRecap") { DailyRecap.cancel(ctx) }
    AsyncFunction("postDailyRecap") Coroutine { -> withContext(Dispatchers.IO) { DailyRecap.post(ctx, test = true) } }
    Function("setRecapCover") { uri: String -> DailyRecap.setCover(ctx, uri) }
  }
}

private val SHARE_ACTIONS = setOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE, Intent.ACTION_VIEW, Intent.ACTION_EDIT)
private val TARGETS = mapOf(
  "instagram" to listOf("com.instagram.android"),
  "instagram-story" to listOf("com.instagram.android"),
  "instagram-reel" to listOf("com.instagram.android"),
  "tiktok" to listOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill"),
)
/** Instagram's share screens by activity name (ShareHandlerActivity[MultipleFeedAlias], [Multi]StoryShareHandlerActivity,
 *  ReelShareHandlerActivity): not an API, so a renamed one falls back to Instagram's own app-only picker. */
private fun screenOf(target: String?, cls: String) = when (target) {
  "instagram" -> "ShareHandlerActivity" in cls && "Story" !in cls && "Reel" !in cls
  "instagram-story" -> "Story" in cls
  "instagram-reel" -> "Reel" in cls
  else -> false
}

/** send aimed at target: its Instagram screen when found, else the app; null = not installed. */
@Suppress("DEPRECATION")
private fun forTarget(pm: PackageManager, send: Intent, target: String?): Intent? {
  for (pkg in TARGETS[target].orEmpty()) {
    val i = Intent(send).setPackage(pkg)
    val acts = pm.queryIntentActivities(i, 0)
    if (acts.isEmpty()) continue
    val screen = acts.firstOrNull { screenOf(target, it.activityInfo.name) } ?: return i
    return i.setClassName(pkg, screen.activityInfo.name)
  }
  return null
}
private var lastShareIntent: Intent? = null

/** Image uris an incoming share/view intent carries, once per intent (a JS reload does not replay it).
 *  Only content:// / file:// with an image (or unset) type: daydump:// deep links stay with expo-router. */
private fun takeShare(intent: Intent): Map<String, Any>? {
  if (intent.action !in SHARE_ACTIONS || intent === lastShareIntent) return null
  if (intent.type?.startsWith("image/") == false) return null
  val uris = mutableListOf<Uri>()
  intent.data?.let { uris.add(it) }
  @Suppress("DEPRECATION")
  when (intent.action) {
    Intent.ACTION_SEND -> (intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { uris.add(it) }
    Intent.ACTION_SEND_MULTIPLE -> intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
  }
  intent.clipData?.let { c -> for (i in 0 until c.itemCount) c.getItemAt(i).uri?.let { uris.add(it) } }
  val list = uris.filter { it.scheme == "content" || it.scheme == "file" }.map { it.toString() }.distinct()
  if (list.isEmpty()) return null
  lastShareIntent = intent
  return mapOf("action" to intent.action!!.substringAfterLast('.'), "uris" to list, "mimeType" to (intent.type ?: "image/*"))
}

private fun ClipEmbedderModule.shareImages(uris: List<String>, caption: String, target: String?): String {
  val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
  // file:// (rendered slides in cache) go through expo-sharing's FileProvider; content:// pass as is.
  val authority = "${activity.packageName}.SharingFileProvider"
  val list = ArrayList(uris.map { u ->
    val uri = Uri.parse(u)
    if (uri.scheme == "file" || uri.scheme == null) FileProvider.getUriForFile(activity, authority, File(uri.path!!)) else uri
  })
  val send = Intent(if (list.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
    type = "image/*"
    if (list.size == 1) putExtra(Intent.EXTRA_STREAM, list[0]) else putParcelableArrayListExtra(Intent.EXTRA_STREAM, list)
    if (caption.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, caption)
    clipData = ClipData.newRawUri(null, list[0]).also { c -> list.drop(1).forEach { c.addItem(ClipData.Item(it)) } }
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
  }
  forTarget(activity.packageManager, send, target)?.let { i ->
    try {
      activity.startActivity(i)
      return i.`package`!!
    } catch (_: ActivityNotFoundException) {}
  }
  activity.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
  return "chooser"
}

/**
 * Indexing pauses while the user touches the screen and for a moment after (a fling): the GPU and the 8 worker threads
 * otherwise take the frames and the big cores from the UI and JS (Discover 55% janky frames while indexing). The photo
 * in flight finishes; the next waits. Only matters while the app is on screen, where touches come from.
 */
@Volatile internal var holdUntil = 0L
private fun waitForUser() { while (SystemClock.uptimeMillis() < holdUntil) Thread.sleep(50) }

/** One per process: shared by the JS module and the background indexing worker (embeds are serialized). */
class ClipEngine private constructor(private val ctx: Context) {
  companion object {
    @Volatile private var inst: ClipEngine? = null
    fun get(ctx: Context) = inst ?: synchronized(this) { inst ?: ClipEngine(ctx.applicationContext).also { inst = it } }
  }

  private val mutex = Mutex()
  // Bench knobs (configure): parallel batch decode, engine (gpu-cpu8: LiteRT GPU + cpu8 helping, gpu-only,
  // cpu8: LiteRT CPU dynamic int8), optional alternative vision model file.
  private var parallel = true
  private var engine = "gpu-cpu8"
  private var visionFile: String? = null
  // Indexing threads run below the UI and JS threads so scrolling stays smooth while it runs; they still get every idle
  // core. Nice 9, not THREAD_PRIORITY_BACKGROUND (10): from 10 Android may also move the thread to the little cores.
  // XNNPACK's workers inherit it from the thread that creates the model (so helperModel() is only called on cpuThread).
  private val low = ThreadFactory { r -> Thread { Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND + Process.THREAD_PRIORITY_MORE_FAVORABLE); r.run() } }
  // LiteRT model, created on liteThread (GPU contexts are thread-bound); null = not loaded yet or not usable here.
  private val liteThread = Executors.newSingleThreadExecutor(low).asCoroutineDispatcher()
  private val cpuThread = Executors.newSingleThreadExecutor(low).asCoroutineDispatcher()
  private var lite: CompiledModel? = null
  private var liteFailed = false
  private var helper: CompiledModel? = null // gpu-cpu8: the CPU's model
  private var helperFailed = false
  private val decodePool = Executors.newFixedThreadPool(4, low).asCoroutineDispatcher()
  // Batch 1, one phrase per run; textLock: embedTexts isn't behind the mutex. Output is L2-normalized in the model.
  private val textLock = Any()
  // These lazies throw (and retry on the next call) while their pack hasn't landed.
  private fun packFile(p: ModelPacks.Pack, name: String) = ModelPacks.dir(ctx, p)?.resolve(name)?.path
  private val text by lazy { cpuModel("text", packFile(ModelPacks.Pack.TEXT, "text.tflite")) }
  private fun cpuModel(name: String, file: String? = null): Triple<CompiledModel, List<TensorBuffer>, List<TensorBuffer>> {
    val cache = File(ctx.cacheDir, "litert").apply { mkdirs() }.resolve("$name-$installed.xnnpack").path
    val opts = CompiledModel.Options(Accelerator.CPU).apply { cpuOptions = CompiledModel.CpuOptions(4, null, cache) }
    val m = if (file != null) CompiledModel.create(file, opts) else CompiledModel.create(ctx.assets, "clip/$name.tflite", opts)
    return Triple(m, m.createInputBuffers(), m.createOutputBuffers())
  }
  // The app's fixed phrases (selfie finder), embedded at build time (phrases.json): they work before the text model arrives.
  private val fixed by lazy {
    val o = JSONObject(asset("phrases.json").decodeToString())
    o.keys().asSequence().associateWith { decode(o.getString(it)) }
  }
  val tokenizer by lazy { ClipTokenizer(packFile(ModelPacks.Pack.TEXT, "tokenizer.json")?.let { File(it).readText() } ?: asset("tokenizer.json").decodeToString()) }
  val vocabNames by lazy {
    val a = JSONObject(asset("vocab.json").decodeToString()).getJSONArray("names")
    Array(a.length()) { a.getString(it) }
  }
  // q (1 x 512) -> scores against every vocab row (fp16 weights, fp32 math), one vector per run.
  private val conceptsLock = Any()
  private val concepts by lazy { cpuModel("concepts", packFile(ModelPacks.Pack.VISION, "concepts.tflite")) }
  var timings = mapOf<String, Any>()
    private set

  private fun asset(name: String) = ctx.assets.open("clip/$name").use { it.readBytes() }

  // Serial decode (lazy jobs) would all start at once when the helper awaits them; a bench visionFile has no dw8 twin.
  private val helps get() = parallel && visionFile == null

  // Batch 1: the Mali GPU delegate rejects batched graphs. Compiled GPU programs are cached (~3 s compile on first load).
  private fun makeLite(): CompiledModel {
    if (engine == "cpu8") return makeCpu8()
    val key = "$engine-" + (visionFile?.let { File(it).run { "$name-${length()}" } } ?: "bundled-$installed")
    val opts = CompiledModel.Options(Accelerator.GPU).apply {
      gpuOptions = CompiledModel.GpuOptions(
        serializationDir = File(ctx.cacheDir, "litert").apply { mkdirs() }.path, modelCacheKey = key, serializeProgramCache = true,
      )
    }
    // The bundled GPU model is built from vision_dw8 on first use (VisionGpu); the stale-cache sweep drops old installs'.
    return CompiledModel.create(visionFile ?: VisionGpu.build(ctx, packFile(ModelPacks.Pack.VISION, "vision_dw8.tflite"), File(ctx.cacheDir, "litert/vision-$installed.tflite")), opts)
  }

  private val installed get() = ctx.packageManager.getPackageInfo(ctx.packageName, 0).lastUpdateTime

  // Caches are keyed by install time, so each app update would leave the old set (~75 MB) behind. Runs before any model loads.
  init {
    val now = installed.toString()
    File(ctx.cacheDir, "litert").listFiles()?.forEach { if (Regex("""\d{12,}""").containsMatchIn(it.name) && now !in it.name) it.deleteRecursively() }
  }

  // Dynamic int8 (weights int8, activations quantized per run) on XNNPACK, 4 threads. In the app it runs 43-52 ms/photo
  // (16-18 alone): decode threads share the big cores. Packed weights cached next to the GPU cache.
  private fun makeCpu8(name: String = "dw8"): CompiledModel {
    val cache = File(ctx.cacheDir, "litert").apply { mkdirs() }.resolve("$name-$installed.xnnpack").path
    val opts = CompiledModel.Options(Accelerator.CPU).apply { cpuOptions = CompiledModel.CpuOptions(4, null, cache) }
    val f = packFile(ModelPacks.Pack.VISION, "vision_dw8.tflite")
    return if (f != null) CompiledModel.create(f, opts) else CompiledModel.create(ctx.assets, "clip/vision_dw8.tflite", opts)
  }

  private fun helperModel(): CompiledModel? {
    if (helper == null && !helperFailed && engine == "gpu-cpu8" && helps) {
      helper = runCatching(::makeCpu8).onFailure { helperFailed = true; Log.w("ClipEmbedder", "LiteRT CPU unavailable, GPU alone", it) }.getOrNull()
    }
    return helper
  }

  // Call on liteThread. null when LiteRT can't run here at all (GPU and CPU): no image embeddings. Throws while the vision
  // pack hasn't landed, before trying: that isn't the device failing, so it mustn't stick in liteFailed.
  private fun liteModel(): CompiledModel? {
    if (lite == null && !liteFailed) {
      if (visionFile == null) ModelPacks.dir(ctx, ModelPacks.Pack.VISION)
      lite = runCatching(::makeLite).recoverCatching {
        // No usable GPU: the app's engine runs on its CPU half alone.
        if (engine != "gpu-cpu8" || visionFile != null) throw it
        Log.w("ClipEmbedder", "LiteRT GPU unavailable, using LiteRT CPU int8", it)
        engine = "cpu8"
        makeCpu8()
      }.onFailure { liteFailed = true; Log.w("ClipEmbedder", "LiteRT $engine unavailable", it) }.getOrNull()
    }
    return lite
  }

  suspend fun configure(parallelDecode: Boolean, eng: String, model: String?) = mutex.withLock {
    parallel = parallelDecode
    engine = eng
    visionFile = model?.let { File(ctx.filesDir, "models/vision_$it.tflite") }?.takeIf { it.exists() }?.path
    val t0 = SystemClock.elapsedRealtime()
    // Load now so loadMs is measured here.
    val ok = withContext(liteThread) { lite?.close(); lite = null; liteFailed = false; liteModel() != null }
    withContext(cpuThread) {
      helper?.close()
      helper = null
      helperFailed = false
      helperModel()
    }
    mapOf("loadMs" to (SystemClock.elapsedRealtime() - t0).toDouble(), "found" to (model == null || visionFile != null), "ok" to ok)
  }

  suspend fun embedImages(uris: List<String>, thumb: Int) = mutex.withLock { embedImagesLocked(uris, thumb) }

  private suspend fun embedImagesLocked(uris: List<String>, thumb: Int): FloatArray {
    if (uris.isEmpty()) return FloatArray(0)
    val n = uris.size
    val input = FloatArray(n * 3 * PLANE)
    val t0 = SystemClock.elapsedRealtime()
    // waits first: on a fresh install the GPU model build (seconds of CPU) would land on the selfie finder's first look
    val model = withContext(liteThread) { waitForUser(); liteModel() } ?: throw IllegalStateException("LiteRT can't run on this device")
    return embedLite(model, n, input, t0) { waitForUser(); fill(uris[it], thumb, input, it) }
  }

  // The selfie finder's few photos while indexing runs: its own vision_dw8 on a normal-priority thread, so neither the
  // mutex (an indexing batch is ~7 s) nor holdIndexing makes it wait. Same model as the index's CPU half.
  // ponytail: kept for the process (~1 dw8 copy in memory); close it after onboarding if memory gets tight.
  private val nowThread = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
  private var nowModel: CompiledModel? = null
  // Photo i of n arrives as (i, bitmap) (clipSize; recycled here) and lands in row i; rows never sent stay zero.
  suspend fun embedNow(n: Int, bmps: ReceiveChannel<Pair<Int, Bitmap>>): FloatArray = withContext(nowThread) {
    val m = nowModel ?: makeCpu8("dw8now").also { nowModel = it }
    val input = FloatArray(3 * PLANE)
    val out = FloatArray(n * DIM)
    val one = FloatArray(DIM)
    val inBuf = m.createInputBuffers()
    val outBuf = m.createOutputBuffers()
    try {
      for ((i, b) in bmps) { fillBitmap(b, input, 0); runLite(m, inBuf, outBuf, input, 0, one); one.copyInto(out, i * DIM) }
    } finally {
      (inBuf + outBuf).forEach { it.close() }
    }
    out
  }

  // Photo i writes its own disjoint slice of input; returns the decoded size or null if undecodable.
  private fun fill(uri: String, thumb: Int, input: FloatArray, i: Int): String? = try {
      val bmp = if (thumb > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        runCatching { loadThumb(ctx, uri, thumb) }.getOrElse { decodeScaled(ctx, uri, SIZE) }
      } else {
        decodeScaled(ctx, uri, SIZE)
      }
      "${bmp.width}x${bmp.height}".also { fillBitmap(bmp, input, i) }
    } catch (e: Exception) {
      Log.w("ClipEmbedder", "decode failed: $uri", e)
      null
    }

  // bmp: shortest side SIZE; its center SIZE x SIZE, normalized, into photo i's slice. Recycles bmp.
  private fun fillBitmap(bmp: Bitmap, input: FloatArray, i: Int) {
    val px = IntArray(PLANE)
    bmp.getPixels(px, 0, SIZE, (bmp.width - SIZE) / 2, (bmp.height - SIZE) / 2, SIZE, SIZE)
    bmp.recycle()
    val base = i * 3 * PLANE
    for (j in 0 until PLANE) {
      val p = px[j]
      input[base + j] = ((p shr 16 and 255) / 255f - MEAN[0]) / STD[0]
      input[base + PLANE + j] = ((p shr 8 and 255) / 255f - MEAN[1]) / STD[1]
      input[base + 2 * PLANE + j] = ((p and 255) / 255f - MEAN[2]) / STD[2]
    }
  }

  // Pipelined: photos decode on decodePool while the GPU embeds them front to back. Once every photo is decoded the CPU
  // is idle, so (engine gpu-cpu8) vision_dw8 takes photos from the back until the two meet. decodeMs = wall time the GPU wasn't busy.
  // ponytail: the pipeline drains at the end of each call; overlap across calls if batches get small.
  private suspend fun embedLite(model: CompiledModel, n: Int, input: FloatArray, t0: Long, fill: (Int) -> String?): FloatArray {
    val out = FloatArray(n * DIM)
    var modelMs = 0L
    var cpuPhotos = 0
    var lo = 0
    var hi = n
    val lock = Any()
    // The CPU (~66 ms/photo) leaves the last photo to the GPU (~53 ms): taking it would only make the batch end later.
    fun take(cpu: Boolean) = synchronized(lock) { if (lo >= hi || (cpu && hi - lo < 2)) -1 else if (cpu) --hi else lo++ }
    val sizes = coroutineScope {
      val jobs = (0 until n).map { i -> async(decodePool, if (parallel) CoroutineStart.DEFAULT else CoroutineStart.LAZY) { fill(i) } }
      val cpu = async(cpuThread) {
        val h = helperModel()
        if (h == null) return@async 0
        jobs.awaitAll()
        var c = 0
        val hIn = h?.createInputBuffers()
        val hOut = h?.createOutputBuffers()
        try {
          while (true) {
            waitForUser()
            val i = take(cpu = true).takeIf { it >= 0 } ?: break
            if (jobs[i].await() == null) continue
            runLite(h, hIn!!, hOut!!, input, i, out)
            c++
          }
        } finally {
          (hIn.orEmpty() + hOut.orEmpty()).forEach { it.close() }
        }
        c
      }
      withContext(liteThread) {
        val inBuf = model.createInputBuffers()
        val outBuf = model.createOutputBuffers()
        try {
          while (true) {
            waitForUser()
            val i = take(cpu = false).takeIf { it >= 0 } ?: break
            jobs[i].await()?.also {
              val t = SystemClock.elapsedRealtime()
              runLite(model, inBuf, outBuf, input, i, out)
              modelMs += SystemClock.elapsedRealtime() - t
            }
          }
        } finally {
          (inBuf + outBuf).forEach { it.close() }
        }
      }
      cpuPhotos = cpu.await()
      jobs.awaitAll()
    }
    val wall = SystemClock.elapsedRealtime() - t0
    timings = mapOf("decodeMs" to (wall - modelMs).toDouble(), "modelMs" to modelMs.toDouble(), "cpuPhotos" to cpuPhotos.toDouble(), "size" to (sizes.firstOrNull() ?: ""))
    return out
  }

  // Photo i of input -> out[i], L2-normalized here: the GPU has no L2_NORMALIZATION op, so the .tflite outputs raw vectors.
  private fun runLite(model: CompiledModel, inBuf: List<TensorBuffer>, outBuf: List<TensorBuffer>, input: FloatArray, i: Int, out: FloatArray) {
    inBuf[0].writeFloat(input.copyOfRange(i * 3 * PLANE, (i + 1) * 3 * PLANE))
    model.run(inBuf, outBuf)
    val e = outBuf[0].readFloat()
    val norm = sqrt(e.fold(0f) { a, x -> a + x * x })
    for (j in 0 until DIM) out[i * DIM + j] = e[j] / norm
  }

  fun embedTexts(texts: List<String>): FloatArray {
    if (texts.isEmpty()) return FloatArray(0)
    val out = FloatArray(texts.size * DIM)
    synchronized(textLock) {
      texts.forEachIndexed { i, t ->
        val v = fixed[t] ?: text.let { (m, inBuf, outBuf) ->
          inBuf[0].writeInt(tokenizer.encode(t))
          m.run(inBuf, outBuf)
          outBuf[0].readFloat()
        }
        v.copyInto(out, i * DIM, 0, DIM)
      }
    }
    return out
  }

  fun topConcepts(qs: FloatArray, k: Int): Map<String, Any> {
    val ids = ArrayList<Int>()
    val scores = ArrayList<Double>()
    synchronized(conceptsLock) {
      val (m, inBuf, outBuf) = concepts
      for (q in 0 until qs.size / DIM) {
        inBuf[0].writeFloat(qs.copyOfRange(q * DIM, (q + 1) * DIM))
        m.run(inBuf, outBuf)
        val s = outBuf[0].readFloat()
        s.indices.sortedByDescending { s[it] }.take(k).forEach { ids.add(it); scores.add(s[it].toDouble()) }
      }
    }
    return mapOf("ids" to ids, "scores" to scores)
  }
}

internal fun floatBytes(v: FloatArray): ByteArray =
  ByteBuffer.allocate(v.size * 4).order(ByteOrder.LITTLE_ENDIAN).also { it.asFloatBuffer().put(v) }.array()

internal fun encode(v: FloatArray): String = Base64.encodeToString(floatBytes(v), Base64.NO_WRAP)

private fun decode(s: String): FloatArray {
  val fb = ByteBuffer.wrap(Base64.decode(s, Base64.DEFAULT)).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
  return FloatArray(fb.remaining()).also { fb.get(it) }
}

/** Decoded so the shortest side is exactly `side` (EXIF orientation applied on API 28+). */
/**
 * MediaStore's cached thumbnail (EXIF rotation applied), scaled so the shortest side is SIZE.
 * ponytail: the cache can be evicted; MediaProvider regenerates it from the original, which costs a full decode.
 */
// Caller checks SDK_INT >= Q.
private fun loadThumb(ctx: Context, uri: String, req: Int): Bitmap {
  val t = ctx.contentResolver.loadThumbnail(Uri.parse(uri), Size(req, req), null)
  val s = SIZE.toFloat() / min(t.width, t.height)
  if (s == 1f) return t
  return Bitmap.createScaledBitmap(t, max(SIZE, (t.width * s).roundToInt()), max(SIZE, (t.height * s).roundToInt()), true).also { if (it !== t) t.recycle() }
}

/** A copy with the shortest side SIZE (CLIP's input), halved first while 2x or more too big so the bilinear scale doesn't alias. */
internal fun clipSize(src: Bitmap): Bitmap {
  var b = src
  fun scaled(k: Float) = Bitmap.createScaledBitmap(b, max(1, (b.width * k).roundToInt()), max(1, (b.height * k).roundToInt()), true)
  while (min(b.width, b.height) >= 2 * SIZE) b = scaled(0.5f).also { if (b !== src) b.recycle() }
  val k = SIZE.toFloat() / min(b.width, b.height)
  val out = Bitmap.createScaledBitmap(b, max(SIZE, (b.width * k).roundToInt()), max(SIZE, (b.height * k).roundToInt()), true)
  if (b !== src && out !== b) b.recycle()
  return if (out === src) src.copy(Bitmap.Config.ARGB_8888, false) else out
}

internal fun decodeScaled(ctx: Context, uri: String, side: Int): Bitmap {
  val u = Uri.parse(uri)
  val isFile = u.scheme == null || u.scheme == "file"
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
    val src = if (isFile) ImageDecoder.createSource(File(u.path!!)) else ImageDecoder.createSource(ctx.contentResolver, u)
    return ImageDecoder.decodeBitmap(src) { dec, info, _ ->
      val s = side.toFloat() / min(info.size.width, info.size.height)
      dec.setTargetSize(max(side, (info.size.width * s).roundToInt()), max(side, (info.size.height * s).roundToInt()))
      dec.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
    }
  }
  // ponytail: pre-Android 9 path ignores EXIF rotation; add androidx.exifinterface if those devices matter.
  fun open() = if (isFile) File(u.path!!).inputStream() else ctx.contentResolver.openInputStream(u)!!
  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  open().use { BitmapFactory.decodeStream(it, null, bounds) }
  var sample = 1
  while (min(bounds.outWidth, bounds.outHeight) / (sample * 2) >= side) sample *= 2
  val raw = open().use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }!!
  val s = side.toFloat() / min(raw.width, raw.height)
  return Bitmap.createScaledBitmap(raw, max(side, (raw.width * s).roundToInt()), max(side, (raw.height * s).roundToInt()), true)
}
