package expo.modules.clipembedder

import android.content.Context
import java.io.DataInputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import java.util.zip.CRC32

/**
 * The GPU vision model (fp16 weights, 90 MB) isn't shipped: it is built once per install from vision_dw8.tflite's int8
 * weights, fp16(int8 * row scale), into vision_gpu.skel (vision.tflite with those weights zeroed, ~0.5 MB deflated).
 * See gpu_skel in scripts/build_assets.py for the format. dw8 and the output are mapped, not loaded on the heap.
 * A CRC mismatch throws, and the caller falls back to the CPU.
 */
internal object VisionGpu {
  /** dw8: the vision pack's file (release), null = the APK's asset (debug). */
  fun build(ctx: Context, dw8: String?, out: File): String {
    if (!out.exists() && dw8 != null) {
      RandomAccessFile(dw8, "r").channel.use { dc -> write(ctx.assets.open("clip/vision_gpu.skel"), dc.map(FileChannel.MapMode.READ_ONLY, 0, dc.size()), out) }
    } else if (!out.exists()) {
      ctx.assets.openFd("clip/vision_dw8.tflite").use { fd ->
        FileInputStream(fd.fileDescriptor).channel.use { dc ->
          write(ctx.assets.open("clip/vision_gpu.skel"), dc.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.length), out)
        }
      }
    }
    return out.path
  }

  fun write(skel: InputStream, dw8: ByteBuffer, out: File) {
    val tmp = File(out.path + ".tmp")
    val crc: Long
    val rows: IntArray
    DataInputStream(skel.buffered(1 shl 20)).use { inp ->
      check(inp.readInt() == 0x44444731) { "vision_gpu.skel: bad header" } // "DDG1"
      crc = inp.readInt().toLong() and 0xffffffffL
      rows = IntArray(inp.readInt() * 5) { inp.readInt() }
      tmp.outputStream().use { inp.copyTo(it, 1 shl 20) }
    }
    RandomAccessFile(tmp, "rw").channel.use { ch ->
      val mapped = ch.map(FileChannel.MapMode.READ_WRITE, 0, ch.size())
      val o = mapped.duplicate().order(ByteOrder.LITTLE_ENDIAN)
      val d = dw8.order(ByteOrder.LITTLE_ENDIAN)
      val half = ShortArray(256)
      for (t in rows.indices step 5) { // offset, count, rows, dw8 offset, dw8 scales offset
        val n = rows[t + 2]
        val per = rows[t + 1] / n
        val src = ByteArray(per)
        val dst = ShortArray(per)
        for (r in 0 until n) {
          val s = d.getFloat(rows[t + 4] + 4 * r)
          for (q in -128..127) half[q + 128] = toHalf(q * s)
          d.position(rows[t + 3] + r * per); d.get(src)
          for (j in 0 until per) dst[j] = half[src[j] + 128]
          o.position(rows[t] + 2 * r * per); o.asShortBuffer().put(dst)
        }
      }
      val c = CRC32()
      val buf = ByteArray(1 shl 20)
      o.position(0)
      while (o.hasRemaining()) { val k = minOf(buf.size, o.remaining()); o.get(buf, 0, k); c.update(buf, 0, k) }
      check(c.value == crc) { "vision_gpu: CRC mismatch" }
      mapped.force()
    }
    check(tmp.renameTo(out)) { "vision_gpu: rename failed" }
  }

  // float -> IEEE half, round half to even like numpy's astype(float16); weights are finite. android.util.Half needs API 26.
  fun toHalf(f: Float): Short {
    val x = java.lang.Float.floatToRawIntBits(f)
    val sign = (x ushr 16) and 0x8000
    val e = ((x ushr 23) and 0xff) - 112 // half's biased exponent
    if (e >= 31) return (sign or 0x7c00).toShort()
    if (e < -10) return sign.toShort()
    val m = if (e > 0) x and 0x7fffff else (x and 0x7fffff) or 0x800000
    val shift = if (e > 0) 13 else 14 - e
    var h = (if (e > 0) e shl 10 else 0) or (m ushr shift)
    val rem = m and ((1 shl shift) - 1)
    val mid = 1 shl (shift - 1)
    if (rem > mid || (rem == mid && (h and 1) == 1)) h++ // a carry into the exponent is still correct
    return (sign or h).toShort()
  }
}
