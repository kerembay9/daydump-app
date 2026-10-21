package expo.modules.clipembedder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.Size
import com.google.ai.edge.litert.Accelerator
import com.google.ai.edge.litert.CompiledModel
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private val CPU get() = CompiledModel.Options(Accelerator.CPU).apply { cpuOptions = CompiledModel.CpuOptions(4, null, null) }

/**
 * YuNet face detector (OpenCV Zoo, MIT; scripts/build_assets.py yunet) on LiteRT CPU, 4 threads. The photo is letterboxed
 * (longest side = size). The model returns (score, cx, cy, w, h, 5 landmarks) per cell; detect keeps score >= minScore and
 * drops overlaps (IoU > 0.3), as OpenCV's FaceDetectorYN does. Boxes are fractions of the photo, best first; aspect is its
 * width / height after EXIF rotation. With sface, each face also gets "vec": its SFace feature (base64 Float32 x 128).
 * Bundled: clip/yunet_320.tflite; the bench can pass a pushed file (yunet_640).
 */
internal class YuNet(ctx: Context, file: String?, private val size: Int) : AutoCloseable {
  private val m = file?.let { CompiledModel.create(it, CPU) } ?: CompiledModel.create(ctx.assets, "clip/yunet_$size.tflite", CPU)
  private val inBuf = m.createInputBuffers()
  private val outBuf = m.createOutputBuffers()
  private val px = FloatArray(size * size * 3)
  private val argb = IntArray(size * size)

  fun detect(ctx: Context, uri: String, minScore: Double, sface: SFace? = null): Map<String, Any> {
    val t0 = SystemClock.elapsedRealtime()
    return detect(decode(ctx, uri, sface != null, 0), minScore, sface, t0)
  }

  /**
   * The photo to detect on; not synchronized, so callers can decode several at once. SFace crops from a sharper decode
   * than the detector's letterbox. thumb > 0 (content:// uris, no SFace): MediaStore's cached thumbnail, ~5x cheaper.
   */
  fun decode(ctx: Context, uri: String, sharp: Boolean, thumb: Int): Bitmap =
    if (thumb > 0 && !sharp && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      runCatching { ctx.contentResolver.loadThumbnail(Uri.parse(uri), Size(thumb, thumb), null) }.getOrElse { decodeScaled(ctx, uri, size) }
    } else decodeScaled(ctx, uri, if (sharp) 720 else size)

  /** Recycles full. */
  @Synchronized
  fun detect(full: Bitmap, minScore: Double, sface: SFace?, t0: Long = SystemClock.elapsedRealtime()): Map<String, Any> {
    val k = size.toFloat() / max(full.width, full.height)
    val bmp = Bitmap.createScaledBitmap(full, max(1, (full.width * k).roundToInt()), max(1, (full.height * k).roundToInt()), true)
    val bw = bmp.width
    val bh = bmp.height
    bmp.getPixels(argb, 0, bw, 0, 0, bw, bh)
    if (bmp !== full) bmp.recycle()
    px.fill(0f)
    for (y in 0 until bh) for (x in 0 until bw) {
      val c = argb[y * bw + x]
      val o = (y * size + x) * 3
      px[o] = ((c shr 16) and 255).toFloat(); px[o + 1] = ((c shr 8) and 255).toFloat(); px[o + 2] = (c and 255).toFloat()
    }
    val t1 = SystemClock.elapsedRealtime()
    inBuf[0].writeFloat(px)
    m.run(inBuf, outBuf)
    val o = outBuf[0].readFloat()
    val t2 = SystemClock.elapsedRealtime()
    val keep = mutableListOf<Int>()
    for (i in (0 until o.size / N).filter { o[it * N] >= minScore }.sortedByDescending { o[it * N] }) {
      if (keep.none { iou(o, i, it) > 0.3f }) keep += i
    }
    val up = full.width.toFloat() / bw // letterbox px -> full px
    val faces = keep.map { i ->
      val b = i * N
      val f = mutableMapOf<String, Any>("score" to o[b].toDouble(), "x" to ((o[b + 1] - o[b + 3] / 2) / bw).toDouble(), "y" to ((o[b + 2] - o[b + 4] / 2) / bh).toDouble(),
        "w" to (o[b + 3] / bw).toDouble(), "h" to (o[b + 4] / bh).toDouble())
      if (sface != null) f["vec"] = encode(sface.embed(full, FloatArray(10) { o[b + 5 + it] * up }))
      f
    }
    full.recycle()
    return mapOf("decodeMs" to (t1 - t0).toDouble(), "modelMs" to (t2 - t1).toDouble(), "aspect" to bw.toDouble() / bh, "faces" to faces)
  }

  override fun close() = m.close()

  private fun iou(o: FloatArray, a: Int, b: Int): Float {
    fun box(i: Int) = floatArrayOf(o[i * N + 1] - o[i * N + 3] / 2, o[i * N + 2] - o[i * N + 4] / 2, o[i * N + 1] + o[i * N + 3] / 2, o[i * N + 2] + o[i * N + 4] / 2)
    val p = box(a)
    val q = box(b)
    val inter = max(0f, min(p[2], q[2]) - max(p[0], q[0])) * max(0f, min(p[3], q[3]) - max(p[1], q[1]))
    return inter / (o[a * N + 3] * o[a * N + 4] + o[b * N + 3] * o[b * N + 4] - inter)
  }

  private companion object { const val N = 15 }
}

/**
 * SFace face recognition (OpenCV Zoo, Apache 2.0; scripts/build_assets.py sface): a face aligned to 112x112 from its 5
 * landmarks -> L2-normalized 128-d feature. Same person when cosine > 0.363 (OpenCV's threshold).
 */
/** file: the faces pack's sface.tflite (release), null = the APK's asset (debug). */
internal class SFace(ctx: Context, file: String?) : AutoCloseable {
  private val m = file?.let { CompiledModel.create(it, CPU) } ?: CompiledModel.create(ctx.assets, "clip/sface.tflite", CPU)
  private val inBuf = m.createInputBuffers()
  private val outBuf = m.createOutputBuffers()
  private val crop = Bitmap.createBitmap(112, 112, Bitmap.Config.ARGB_8888)
  private val argb = IntArray(112 * 112)
  private val px = FloatArray(112 * 112 * 3)
  private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

  /** lm: 5 (x, y) landmarks in src pixels, YuNet's order. Least-squares similarity onto TEMPLATE, as FaceRecognizerSF.alignCrop. */
  @Synchronized
  fun embed(src: Bitmap, lm: FloatArray): FloatArray {
    val sx = (0 until 5).sumOf { lm[it * 2].toDouble() } / 5
    val sy = (0 until 5).sumOf { lm[it * 2 + 1].toDouble() } / 5
    val dx = (0 until 5).sumOf { TEMPLATE[it * 2].toDouble() } / 5
    val dy = (0 until 5).sumOf { TEMPLATE[it * 2 + 1].toDouble() } / 5
    var num1 = 0.0; var num2 = 0.0; var den = 0.0
    for (i in 0 until 5) {
      val x = lm[i * 2] - sx; val y = lm[i * 2 + 1] - sy
      val u = TEMPLATE[i * 2] - dx; val v = TEMPLATE[i * 2 + 1] - dy
      num1 += x * u + y * v; num2 += x * v - y * u; den += x * x + y * y
    }
    val a = (num1 / den).toFloat()
    val b = (num2 / den).toFloat()
    val mat = Matrix().apply { setValues(floatArrayOf(a, -b, (dx - a * sx + b * sy).toFloat(), b, a, (dy - b * sx - a * sy).toFloat(), 0f, 0f, 1f)) }
    crop.eraseColor(0)
    Canvas(crop).drawBitmap(src, mat, paint)
    crop.getPixels(argb, 0, 112, 0, 0, 112, 112)
    for (i in argb.indices) {
      val c = argb[i]
      px[i * 3] = ((c shr 16) and 255).toFloat(); px[i * 3 + 1] = ((c shr 8) and 255).toFloat(); px[i * 3 + 2] = (c and 255).toFloat()
    }
    inBuf[0].writeFloat(px)
    m.run(inBuf, outBuf)
    return outBuf[0].readFloat()
  }

  override fun close() = m.close()

  private companion object {
    val TEMPLATE = floatArrayOf(38.2946f, 51.6963f, 73.5318f, 51.5014f, 56.0252f, 71.7366f, 41.5493f, 92.3655f, 70.7299f, 92.2041f)
  }
}
