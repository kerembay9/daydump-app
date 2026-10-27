package expo.modules.clipembedder

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Size
import java.security.MessageDigest
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.sqrt

// Tidy (src/services/tidy): the whole photo library with file sizes, per-photo pixel checks, same-shot sets, and Trash.
// Everything takes MediaStore ids; the listing's file:// paths can't be trashed and change while a photo is in Trash.

internal fun imageUri(id: String): Uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toLong())

/** Every photo, unpruned (bursts, panoramas, long screenshots too), as parallel lists. API 30+ (IS_FAVORITE). */
internal fun tidyList(ctx: Context): Map<String, Any> {
  val ids = ArrayList<String>(); val paths = ArrayList<String>(); val taken = ArrayList<Double>()
  val w = ArrayList<Int>(); val h = ArrayList<Int>(); val size = ArrayList<Double>(); val bucket = ArrayList<String>(); val fav = ArrayList<Boolean>()
  val cols = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATA, MediaStore.MediaColumns.DATE_TAKEN, MediaStore.MediaColumns.DATE_MODIFIED,
    MediaStore.MediaColumns.WIDTH, MediaStore.MediaColumns.HEIGHT, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.BUCKET_ID, MediaStore.MediaColumns.IS_FAVORITE)
  ctx.contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cols, null, null, null)?.use { c ->
    while (c.moveToNext()) {
      ids += c.getLong(0).toString(); paths += c.getString(1) ?: ""
      taken += c.getLong(2).takeIf { it > 0 }?.toDouble() ?: (c.getLong(3) * 1000.0)
      w += c.getInt(4); h += c.getInt(5); size += c.getLong(6).toDouble(); bucket += c.getString(7) ?: ""; fav += c.getInt(8) == 1
    }
  }
  return mapOf("ids" to ids, "paths" to paths, "taken" to taken, "w" to w, "h" to h, "size" to size, "bucket" to bucket, "fav" to fav)
}

/** Variance of the 4-neighbour Laplacian of gray g (row stride `stride`) over [x0, x1) x [y0, y1): higher = more fine detail. */
private fun lapVar(g: FloatArray, stride: Int, x0: Int, y0: Int, x1: Int, y1: Int): Double {
  var sum = 0.0; var sq = 0.0; var n = 0
  for (r in maxOf(1, y0) until minOf(y1, g.size / stride - 1)) for (c in maxOf(1, x0) until minOf(x1, stride - 1)) {
    val i = r * stride + c
    val v = (g[i - stride] + g[i + stride] + g[i - 1] + g[i + 1] - 4 * g[i]).toDouble()
    sum += v; sq += v * v; n++
  }
  return if (n == 0) 0.0 else sq / n - (sum / n) * (sum / n)
}

/**
 * Pixel checks of one photo, decoded with its shortest side `side` (<= 512: MediaStore's cached thumbnail). b: mean
 * brightness 0-255, sd: its spread, lap: Laplacian variance (compare only at the same side), hi / lo: share of blown-out /
 * crushed pixels, finger: a corner is smooth, warm and unlike the rest. With yunet: faces as YuNet's, plus l (face
 * brightness), sharp (its Laplacian), cut (touches the edge), yaw (nose off the eyes' midpoint, in eye widths; 0 = facing).
 */
internal fun tidyStats(ctx: Context, id: String, side: Int, yunet: YuNet?): Map<String, Any> {
  val uri = imageUri(id)
  val bmp: Bitmap = if (side <= 512 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    runCatching { ctx.contentResolver.loadThumbnail(uri, Size(side, side), null) }.getOrElse { decodeScaled(ctx, uri.toString(), side) }
  } else decodeScaled(ctx, uri.toString(), side)
  val w = bmp.width; val h = bmp.height
  val p = IntArray(w * h).also { bmp.getPixels(it, 0, w, 0, 0, w, h) }
  val g = FloatArray(p.size)
  var sum = 0.0; var sq = 0.0; var hi = 0; var lo = 0
  for (i in p.indices) {
    val c = p[i]
    val l = 0.299f * ((c shr 16) and 255) + 0.587f * ((c shr 8) and 255) + 0.114f * (c and 255)
    g[i] = l; sum += l; sq += l * l
    if (l > 250) hi++ else if (l < 5) lo++
  }
  val mean = sum / p.size
  val lap = lapVar(g, w, 0, 0, w, h)
  // ponytail: finger = one corner quarter much smoother than the frame, reddish and off the frame's brightness; calibrate on real finger shots
  val cw = w / 4; val ch = h / 4
  val finger = listOf(0 to 0, w - cw to 0, 0 to h - ch, w - cw to h - ch).any { (x0, y0) ->
    var r = 0.0; var gr = 0.0; var bl = 0.0; var l = 0.0
    for (y in y0 until y0 + ch) for (x in x0 until x0 + cw) { val c = p[y * w + x]; r += (c shr 16) and 255; gr += (c shr 8) and 255; bl += c and 255; l += g[y * w + x] }
    val n = (cw * ch).toDouble()
    r /= n; gr /= n; bl /= n; l /= n
    lap > 20 && lapVar(g, w, x0, y0, x0 + cw, y0 + ch) < 0.08 * lap && r > gr + 10 && r - bl > 30 && abs(l - mean) > 25
  }
  val out = mutableMapOf<String, Any>("b" to mean, "sd" to sqrt(maxOf(0.0, sq / p.size - mean * mean)), "lap" to lap,
    "hi" to hi.toDouble() / p.size, "lo" to lo.toDouble() / p.size, "finger" to finger)
  if (yunet != null) {
    @Suppress("UNCHECKED_CAST")
    val faces = yunet.detect(bmp, 0.6, null, keepFull = true)["faces"] as List<Map<String, Any>>
    out["faces"] = faces.map { f ->
      val x = f["x"] as Double; val y = f["y"] as Double; val fw = f["w"] as Double; val fh = f["h"] as Double
      val x0 = (x * w).toInt().coerceIn(0, w - 1); val y0 = (y * h).toInt().coerceIn(0, h - 1)
      val x1 = ((x + fw) * w).toInt().coerceIn(x0 + 1, w); val y1 = ((y + fh) * h).toInt().coerceIn(y0 + 1, h)
      var l = 0.0
      for (yy in y0 until y1) for (xx in x0 until x1) l += g[yy * w + xx]
      @Suppress("UNCHECKED_CAST") val lm = f["lm"] as List<Double>
      val eye = abs(lm[2] - lm[0]) * w
      val yaw = if (eye > 0) ((lm[4] - (lm[0] + lm[2]) / 2) * w) / eye else 0.0
      mapOf("score" to f["score"]!!, "x" to x, "y" to y, "w" to fw, "h" to fh, "l" to l / ((x1 - x0) * (y1 - y0)),
        "sharp" to lapVar(g, w, x0, y0, x1, y1), "cut" to (x < 0.005 || y < 0.005 || x + fw > 0.995 || y + fh > 0.995), "yaw" to yaw)
    }
  }
  bmp.recycle()
  return out
}

/** SHA-1 of the first 64 KB: Exact copies' check when a pair isn't both embedded. null = unreadable. */
internal fun headHash(ctx: Context, id: String): String? = runCatching {
  ctx.contentResolver.openInputStream(imageUri(id))!!.use { s ->
    val buf = ByteArray(65536)
    var n = 0
    while (n < buf.size) { val r = s.read(buf, n, buf.size - n); if (r < 0) break; n += r }
    MessageDigest.getInstance("SHA-1").digest(buf.copyOf(n)).joinToString("") { "%02x".format(it) }
  }
}.getOrNull()

private const val WINDOW = 10 * 60 * 1000.0

/**
 * Same-shot sets over photos in time order (v: n x 512 CLIP vectors, zero row = none): each photo links to the next 30 within
 * 10 min at cosine >= 0.94 (0.98 when either is a document or screen: pages of one document look alike), linked photos join
 * (union-find), a set splits at a 10 min gap, and a member stays only at >= 0.92 to the set's mean, so a chain of small
 * steps can't join two scenes. -> a set number per photo, -1 = none.
 */
internal fun tidySets(v: FloatArray, t: DoubleArray, strict: BooleanArray): IntArray {
  val n = t.size
  fun dot(a: Int, b: FloatArray, bo: Int): Float { var s = 0f; for (k in 0 until DIM) s += v[a * DIM + k] * b[bo + k]; return s }
  val ok = BooleanArray(n) { dot(it, v, it * DIM) > 0.25f }
  val par = IntArray(n) { it }
  fun find(x: Int): Int { var r = x; while (par[r] != r) { par[r] = par[par[r]]; r = par[r] }; return r }
  for (i in 0 until n) {
    if (!ok[i]) continue
    for (j in i + 1 until min(n, i + 31)) {
      if (t[j] - t[i] > WINDOW) break
      if (ok[j] && dot(i, v, j * DIM) >= if (strict[i] || strict[j]) 0.98f else 0.94f) par[find(j)] = find(i)
    }
  }
  val out = IntArray(n) { -1 }
  var next = 0
  for (m0 in (0 until n).filter { ok[it] }.groupBy { find(it) }.values) {
    if (m0.size < 2) continue
    val parts = mutableListOf(mutableListOf(m0[0]))
    for (k in 1 until m0.size) if (t[m0[k]] - t[m0[k - 1]] > WINDOW) parts += mutableListOf(m0[k]) else parts.last() += m0[k]
    for (m in parts) {
      if (m.size < 2) continue
      val c = FloatArray(DIM)
      for (i in m) for (k in 0 until DIM) c[k] += v[i * DIM + k]
      val len = sqrt(c.sumOf { (it * it).toDouble() }).toFloat()
      for (k in 0 until DIM) c[k] /= len
      val keep = m.filter { dot(it, c, 0) >= 0.92f }
      if (keep.size < 2) continue
      for (i in keep) out[i] = next
      next++
    }
  }
  return out
}

/** Per id still in MediaStore (Trash included): trashed, and when Trash empties it (ms; 0 = not trashed). Missing ids are gone. */
internal fun trashState(ctx: Context, ids: List<String>): Map<String, Map<String, Any>> {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || ids.isEmpty()) return emptyMap()
  val out = mutableMapOf<String, Map<String, Any>>()
  for (chunk in ids.chunked(500)) {
    val args = Bundle().apply {
      putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, "${MediaStore.MediaColumns._ID} IN (${chunk.joinToString(",") { it.toLong().toString() }})")
      putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_INCLUDE)
    }
    ctx.contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.IS_TRASHED, MediaStore.MediaColumns.DATE_EXPIRES), args, null)?.use { c ->
      while (c.moveToNext()) out[c.getLong(0).toString()] = mapOf("trashed" to (c.getInt(1) == 1), "expires" to c.getLong(2) * 1000.0)
    }
  }
  return out
}
