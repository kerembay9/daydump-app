package expo.modules.clipembedder

import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.SystemClock
import android.util.Log
import java.io.File

private const val W = 1080
private const val H = 1920
private const val FPS = 30
private const val SLIDE_SECONDS = 3
private const val LEAD = 3

/**
 * Slides (image files, in order) as a 9:16 H.264 mp4, each held SLIDE_SECONDS and fit inside the frame on black:
 * Instagram's Reels share screen takes a single video but drops a batch of images.
 * Frames are drawn with a hardware canvas onto the encoder's input surface; timestamps are set on the output side,
 * one frame period apart, since the canvas stamps frames with draw time.
 */
fun slideshowVideo(slides: List<File>, out: File) {
  val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, W, H).apply {
    setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
    setInteger(MediaFormat.KEY_BIT_RATE, 8_000_000)
    setInteger(MediaFormat.KEY_FRAME_RATE, FPS)
    setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
  }
  val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
  codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
  val surface = codec.createInputSurface()
  codec.start()
  out.delete()
  val muxer = MediaMuxer(out.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
  val info = MediaCodec.BufferInfo()
  var track = -1
  var frames = 0L
  var drawn = 0L

  // Keeps drawing at most LEAD frames ahead of the encoder: posting further ahead drops frames
  // (630 drawn, 120 encoded); lockstep (LEAD 0) drops none but takes twice as long, LEAD 3 drops ~3 of 630.
  fun drain(end: Boolean) {
    while (end || frames < drawn - LEAD) {
      val i = codec.dequeueOutputBuffer(info, 100_000)
      when {
        i == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!end) return
        i == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> { track = muxer.addTrack(codec.outputFormat); muxer.start() }
        i >= 0 -> {
          if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 && info.size > 0) {
            info.presentationTimeUs = frames++ * 1_000_000 / FPS
            muxer.writeSampleData(track, codec.getOutputBuffer(i)!!, info)
          }
          codec.releaseOutputBuffer(i, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
        }
      }
    }
  }

  val paint = Paint(Paint.FILTER_BITMAP_FLAG)
  val t0 = SystemClock.elapsedRealtime()
  try {
    for (f in slides) {
      val bmp = BitmapFactory.decodeFile(f.path) ?: continue
      val s = minOf(W.toFloat() / bmp.width, H.toFloat() / bmp.height)
      val dst = RectF(0f, 0f, bmp.width * s, bmp.height * s).apply { offset((W - width()) / 2, (H - height()) / 2) }
      repeat(SLIDE_SECONDS * FPS) {
        val c = surface.lockHardwareCanvas()
        c.drawColor(Color.BLACK)
        c.drawBitmap(bmp, null, dst, paint)
        surface.unlockCanvasAndPost(c)
        drawn++
        drain(false)
      }
      bmp.recycle()
    }
    codec.signalEndOfInputStream()
    drain(true)
    Log.i("SlideshowVideo", "${slides.size} slides, $drawn drawn, $frames encoded in ${SystemClock.elapsedRealtime() - t0} ms")
  } finally {
    codec.stop(); codec.release(); surface.release()
    if (track >= 0) muxer.stop()
    muxer.release()
  }
}
