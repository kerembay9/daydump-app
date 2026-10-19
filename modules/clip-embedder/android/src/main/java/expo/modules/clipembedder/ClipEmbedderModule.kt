package expo.modules.clipembedder

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import com.google.ai.edge.litert.Accelerator
import com.google.ai.edge.litert.CompiledModel
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
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
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlin.math.sqrt
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val SIZE = 224
private const val PLANE = SIZE * SIZE
private const val DIM = 512
private val MEAN = floatArrayOf(0.48145466f, 0.4578275f, 0.40821073f)
private val STD = floatArrayOf(0.26862954f, 0.26130258f, 0.27577711f)

/**
 * TinyCLIP image/text embeddings. Images: LiteRT on the GPU (vision.tflite, batch 1, see scripts/build_assets.py),
 * falling back to ONNX Runtime on the CPU (vision.onnx). Text: ONNX Runtime. Vectors cross the bridge as base64
 * little-endian Float32 (n * 512), L2-normalized. A photo that fails to decode yields a zero vector.
 */
class ClipEmbedderModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val env by lazy { OrtEnvironment.getEnvironment() }
  private var visionSession: OrtSession? = null
  private val vision get() = visionSession ?: makeVision().also { visionSession = it }
  // Bench knobs (configure): parallel batch decode, engine (gpu: LiteRT GPU + ORT CPU helping, gpu-only; ort | xnnpack: ONNX Runtime), optional alternative vision model file.
  private var parallel = true
  private var engine = "gpu"
  private var visionFile: String? = null
  // LiteRT model, created on liteThread (GPU contexts are thread-bound); null = not loaded yet or not usable here.
  private val liteThread = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
  private var lite: CompiledModel? = null
  private var liteFailed = false
  private val decodePool = Executors.newFixedThreadPool(4).asCoroutineDispatcher()
  private val text by lazy { session("text.onnx") }
  private val tokenizer by lazy { ClipTokenizer(asset("tokenizer.json").decodeToString()) }
  private val vocabNames by lazy {
    val a = JSONObject(asset("vocab.json").decodeToString()).getJSONArray("names")
    Array(a.length()) { a.getString(it) }
  }
  private val concepts by lazy { session("concepts.onnx") }
  // vocab.bin rows are [float32 scale][512 x int8]; dequantized once into a rows x 512 tensor (~7 MB).
  private val vocabTensor by lazy {
    val vocab = asset("vocab.bin")
    val stride = 4 + DIM
    val rows = vocab.size / stride
    val bb = ByteBuffer.wrap(vocab).order(ByteOrder.LITTLE_ENDIAN)
    val fb = ByteBuffer.allocateDirect(rows * DIM * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
    for (r in 0 until rows) {
      val s = bb.getFloat(r * stride)
      for (j in 0 until DIM) fb.put(vocab[r * stride + 4 + j] * s)
    }
    fb.rewind()
    OnnxTensor.createTensor(env, fb, longArrayOf(rows.toLong(), DIM.toLong()))
  }
  private var timings = mapOf<String, Any>()

  private fun asset(name: String) = ctx.assets.open("clip/$name").use { it.readBytes() }

  private fun session(name: String): OrtSession =
    env.createSession(asset(name), OrtSession.SessionOptions().apply { setIntraOpNumThreads(4) })

  private val useLite get() = engine == "gpu" || engine == "gpu-only"
  // Serial decode (lazy jobs) would all start at once when the helper awaits them; a bench visionFile is a .tflite, not ONNX.
  private val cpuHelps get() = engine == "gpu" && parallel && visionFile == null

  // Batch 1: the Mali GPU delegate rejects batched graphs. Compiled GPU programs are cached (~3 s compile on first load).
  private fun makeLite(): CompiledModel {
    val key = "$engine-" + (visionFile?.let { File(it).run { "$name-${length()}" } } ?: "bundled-${ctx.packageManager.getPackageInfo(ctx.packageName, 0).lastUpdateTime}")
    val opts = CompiledModel.Options(Accelerator.GPU).apply {
      gpuOptions = CompiledModel.GpuOptions(
        serializationDir = File(ctx.cacheDir, "litert").apply { mkdirs() }.path, modelCacheKey = key, serializeProgramCache = true,
      )
    }
    return visionFile?.let { CompiledModel.create(it, opts) } ?: CompiledModel.create(ctx.assets, "clip/vision.tflite", opts)
  }

  // Call on liteThread. null when this device can't run it (no GPU driver, ...): callers fall back to ONNX Runtime.
  private fun liteModel(): CompiledModel? {
    if (lite == null && !liteFailed) {
      lite = runCatching(::makeLite).onFailure { liteFailed = true; Log.w("ClipEmbedder", "LiteRT $engine unavailable, using ONNX Runtime", it) }.getOrNull()
    }
    return lite
  }

  private fun makeVision(): OrtSession {
    val opts = OrtSession.SessionOptions().apply {
      if (engine == "xnnpack") {
        // ORT guidance for XNNPACK: threads go to the EP, session pool stays at 1 without spinning.
        addXnnpack(mapOf("intra_op_num_threads" to "4"))
        setIntraOpNumThreads(1)
        addConfigEntry("session.intra_op.allow_spinning", "0")
      } else {
        setIntraOpNumThreads(4)
      }
    }
    return visionFile?.let { env.createSession(it, opts) } ?: env.createSession(asset("vision.onnx"), opts)
  }

  override fun definition() = ModuleDefinition {
    Name("ClipEmbedder")

    // thumb > 0: content:// uris decoded from MediaStore's cached thumbnail, requested at thumb x thumb.
    AsyncFunction("embedImages") Coroutine { uris: List<String>, thumb: Int? ->
      withContext(Dispatchers.Default) { encode(embedImages(uris, thumb ?: 0)) }
    }

    // model: use filesDir/models/vision_<model>.onnx|.tflite (pushed by hand, see build_assets.py bench) instead of the bundled one.
    AsyncFunction("configure") Coroutine { parallelDecode: Boolean, eng: String, model: String? ->
      withContext(Dispatchers.Default) {
        parallel = parallelDecode
        engine = eng
        val ext = if (useLite) "tflite" else "onnx"
        visionFile = model?.let { File(ctx.filesDir, "models/vision_$it.$ext") }?.takeIf { it.exists() }?.path
        visionSession?.close()
        visionSession = null
        val t0 = SystemClock.elapsedRealtime()
        // Load now so loadMs is measured here.
        val ok = if (useLite) withContext(liteThread) { lite?.close(); lite = null; liteFailed = false; liteModel() != null } else true
        if (!useLite || cpuHelps) vision.inputNames
        mapOf("loadMs" to (SystemClock.elapsedRealtime() - t0).toDouble(), "found" to (model == null || visionFile != null), "ok" to ok)
      }
    }

    // Split of the last embedImages call: decode vs model ms, plus the first decoded bitmap's size.
    Function("lastEmbedTimings") { timings }

    AsyncFunction("embedTexts") Coroutine { texts: List<String> ->
      withContext(Dispatchers.Default) { encode(embedTexts(texts)) }
    }

    AsyncFunction("tokenize") Coroutine { s: String ->
      withContext(Dispatchers.Default) { tokenizer.encode(s).map { it.toInt() } }
    }

    // Top-k vocabulary concepts per vector (n*512 base64) -> flat n*k ids/scores, best first.
    AsyncFunction("topConcepts") Coroutine { vecsB64: String, k: Int ->
      withContext(Dispatchers.Default) { topConcepts(decode(vecsB64), k) }
    }

    AsyncFunction("conceptNames") Coroutine { -> withContext(Dispatchers.Default) { vocabNames.toList() } }
  }

  private suspend fun embedImages(uris: List<String>, thumb: Int): FloatArray {
    if (uris.isEmpty()) return FloatArray(0)
    val n = uris.size
    val input = FloatArray(n * 3 * PLANE)
    val t0 = SystemClock.elapsedRealtime()
    // Each photo writes its own disjoint slice of input; returns the decoded size or null if undecodable.
    fun fill(i: Int): String? = try {
      val uri = uris[i]
      val bmp = if (thumb > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        runCatching { loadThumb(ctx, uri, thumb) }.getOrElse { decodeScaled(ctx, uri, SIZE) }
      } else {
        decodeScaled(ctx, uri, SIZE)
      }
      val size = "${bmp.width}x${bmp.height}"
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
      size
    } catch (e: Exception) {
      Log.w("ClipEmbedder", "decode failed: ${uris[i]}", e)
      null
    }
    val model = if (useLite) withContext(liteThread) { liteModel() } else null
    if (model != null) return embedLite(model, n, input, t0) { fill(it) }
    val sizes = if (parallel) coroutineScope { (0 until n).map { i -> async(decodePool) { fill(i) } }.awaitAll() } else (0 until n).map(::fill)
    val t1 = SystemClock.elapsedRealtime()
    val out = run(vision, "pixel_values", OnnxTensor.createTensor(env, FloatBuffer.wrap(input), longArrayOf(n.toLong(), 3, SIZE.toLong(), SIZE.toLong())))
    timings = mapOf("decodeMs" to (t1 - t0).toDouble(), "modelMs" to (SystemClock.elapsedRealtime() - t1).toDouble(), "size" to (sizes.firstOrNull() ?: ""))
    for (i in 0 until n) if (sizes[i] == null) out.fill(0f, i * DIM, (i + 1) * DIM)
    return out
  }

  // Pipelined: photos decode on decodePool while the GPU embeds them front to back. Once every photo is decoded the CPU
  // is idle, so (engine gpu) ORT takes photos from the back until the two meet. decodeMs = wall time the GPU wasn't busy.
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
      val cpu = async(Dispatchers.Default) {
        if (!cpuHelps) return@async 0
        jobs.awaitAll()
        var c = 0
        while (true) {
          val i = take(cpu = true).takeIf { it >= 0 } ?: break
          if (jobs[i].await() == null) continue
          val e = run(vision, "pixel_values", OnnxTensor.createTensor(env, FloatBuffer.wrap(input, i * 3 * PLANE, 3 * PLANE).slice(), longArrayOf(1, 3, SIZE.toLong(), SIZE.toLong())))
          e.copyInto(out, i * DIM)
          c++
        }
        c
      }
      withContext(liteThread) {
        val inBuf = model.createInputBuffers()
        val outBuf = model.createOutputBuffers()
        try {
          while (true) {
            val i = take(cpu = false).takeIf { it >= 0 } ?: break
            jobs[i].await()?.also {
              val t = SystemClock.elapsedRealtime()
              inBuf[0].writeFloat(input.copyOfRange(i * 3 * PLANE, (i + 1) * 3 * PLANE))
              model.run(inBuf, outBuf)
              val e = outBuf[0].readFloat() // not normalized: the GPU has no L2_NORMALIZATION op
              val norm = sqrt(e.fold(0f) { a, x -> a + x * x })
              for (j in 0 until DIM) out[i * DIM + j] = e[j] / norm
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

  private fun embedTexts(texts: List<String>): FloatArray {
    if (texts.isEmpty()) return FloatArray(0)
    val ids = LongBuffer.allocate(texts.size * ClipTokenizer.CTX)
    texts.forEach { ids.put(tokenizer.encode(it)) }
    ids.rewind()
    return run(text, "input_ids", OnnxTensor.createTensor(env, ids, longArrayOf(texts.size.toLong(), ClipTokenizer.CTX.toLong())))
  }

  private fun run(s: OrtSession, name: String, t: OnnxTensor): FloatArray = t.use {
    s.run(mapOf(name to it)).use { r -> (r[0] as OnnxTensor).floatBuffer.let { b -> FloatArray(b.remaining()).also { a -> b.get(a) } } }
  }

  // One ORT Gemm + TopK for the whole batch (concepts.onnx, weightless; the vocab is an input).
  private fun topConcepts(qs: FloatArray, k: Int): Map<String, Any> {
    val n = qs.size / DIM
    if (n == 0) return mapOf("ids" to emptyList<Int>(), "scores" to emptyList<Double>())
    OnnxTensor.createTensor(env, FloatBuffer.wrap(qs), longArrayOf(n.toLong(), DIM.toLong())).use { q ->
      OnnxTensor.createTensor(env, LongBuffer.wrap(longArrayOf(k.toLong())), longArrayOf(1)).use { kt ->
        concepts.run(mapOf("q" to q, "vocab" to vocabTensor, "k" to kt)).use { r ->
          val v = (r[0] as OnnxTensor).floatBuffer
          val i = (r[1] as OnnxTensor).longBuffer
          return mapOf("ids" to List(i.remaining()) { i.get(it).toInt() }, "scores" to List(v.remaining()) { v.get(it).toDouble() })
        }
      }
    }
  }

  private fun encode(v: FloatArray): String {
    val bb = ByteBuffer.allocate(v.size * 4).order(ByteOrder.LITTLE_ENDIAN)
    bb.asFloatBuffer().put(v)
    return Base64.encodeToString(bb.array(), Base64.NO_WRAP)
  }

  private fun decode(s: String): FloatArray {
    val fb = ByteBuffer.wrap(Base64.decode(s, Base64.DEFAULT)).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
    return FloatArray(fb.remaining()).also { fb.get(it) }
  }
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
