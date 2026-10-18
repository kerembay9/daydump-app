package expo.modules.clipembedder

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val SIZE = 224
private const val PLANE = SIZE * SIZE
private const val DIM = 512
private val MEAN = floatArrayOf(0.48145466f, 0.4578275f, 0.40821073f)
private val STD = floatArrayOf(0.26862954f, 0.26130258f, 0.27577711f)

/**
 * TinyCLIP image/text embeddings via ONNX Runtime. Vectors cross the bridge as base64
 * little-endian Float32 (n * 512), L2-normalized. A photo that fails to decode yields a zero vector.
 */
class ClipEmbedderModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val env by lazy { OrtEnvironment.getEnvironment() }
  private val vision by lazy { session("vision.onnx") }
  private val text by lazy { session("text.onnx") }
  private val tokenizer by lazy { ClipTokenizer(asset("tokenizer.json").decodeToString()) }
  private val vocabNames by lazy {
    val a = JSONObject(asset("vocab.json").decodeToString()).getJSONArray("names")
    Array(a.length()) { a.getString(it) }
  }
  private val vocab by lazy { asset("vocab.bin") } // rows of [float32 scale][512 x int8]
  private var timings = mapOf<String, Any>()

  private fun asset(name: String) = ctx.assets.open("clip/$name").use { it.readBytes() }

  private fun session(name: String): OrtSession =
    env.createSession(asset(name), OrtSession.SessionOptions().apply { setIntraOpNumThreads(4) })

  override fun definition() = ModuleDefinition {
    Name("ClipEmbedder")

    // thumb > 0: content:// uris decoded from MediaStore's cached thumbnail, requested at thumb x thumb.
    AsyncFunction("embedImages") Coroutine { uris: List<String>, thumb: Int? ->
      withContext(Dispatchers.Default) { encode(embedImages(uris, thumb ?: 0)) }
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

  private fun embedImages(uris: List<String>, thumb: Int): FloatArray {
    if (uris.isEmpty()) return FloatArray(0)
    val n = uris.size
    val input = FloatBuffer.allocate(n * 3 * PLANE)
    val ok = BooleanArray(n)
    val px = IntArray(PLANE)
    var srcSize = ""
    val t0 = SystemClock.elapsedRealtime()
    uris.forEachIndexed { i, uri ->
      try {
        val bmp = if (thumb > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          runCatching { loadThumb(ctx, uri, thumb) }.getOrElse { decodeScaled(ctx, uri, SIZE) }
        } else {
          decodeScaled(ctx, uri, SIZE)
        }
        if (i == 0) srcSize = "${bmp.width}x${bmp.height}"
        bmp.getPixels(px, 0, SIZE, (bmp.width - SIZE) / 2, (bmp.height - SIZE) / 2, SIZE, SIZE)
        bmp.recycle()
        val base = i * 3 * PLANE
        for (j in 0 until PLANE) {
          val p = px[j]
          input.put(base + j, ((p shr 16 and 255) / 255f - MEAN[0]) / STD[0])
          input.put(base + PLANE + j, ((p shr 8 and 255) / 255f - MEAN[1]) / STD[1])
          input.put(base + 2 * PLANE + j, ((p and 255) / 255f - MEAN[2]) / STD[2])
        }
        ok[i] = true
      } catch (e: Exception) {
        Log.w("ClipEmbedder", "decode failed: $uri", e)
      }
    }
    val t1 = SystemClock.elapsedRealtime()
    val out = run(vision, "pixel_values", OnnxTensor.createTensor(env, input, longArrayOf(n.toLong(), 3, SIZE.toLong(), SIZE.toLong())))
    timings = mapOf("decodeMs" to (t1 - t0).toDouble(), "modelMs" to (SystemClock.elapsedRealtime() - t1).toDouble(), "size" to srcSize)
    for (i in 0 until n) if (!ok[i]) out.fill(0f, i * DIM, (i + 1) * DIM)
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

  private fun topConcepts(qs: FloatArray, k: Int): Map<String, Any> {
    val stride = 4 + DIM
    val bb = ByteBuffer.wrap(vocab).order(ByteOrder.LITTLE_ENDIAN)
    val rows = vocab.size / stride
    val scale = FloatArray(rows) { bb.getFloat(it * stride) }
    val ids = ArrayList<Int>()
    val out = ArrayList<Double>()
    val scores = FloatArray(rows)
    for (q in 0 until qs.size / DIM) {
      val qo = q * DIM
      for (r in 0 until rows) {
        val off = r * stride + 4
        var dot = 0f
        for (j in 0 until DIM) dot += qs[qo + j] * vocab[off + j]
        scores[r] = dot * scale[r]
      }
      // ponytail: full sort per query (~20k); a k-sized heap if this shows up in profiles
      scores.indices.sortedByDescending { scores[it] }.take(k).forEach { ids.add(it); out.add(scores[it].toDouble()) }
    }
    return mapOf("ids" to ids, "scores" to out)
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
