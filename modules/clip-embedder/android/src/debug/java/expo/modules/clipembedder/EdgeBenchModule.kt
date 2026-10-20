package expo.modules.clipembedder

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.ExperimentalApi
import com.google.ai.edge.litertlm.ExperimentalFlags
import com.google.ai.edge.litertlm.ThinkingConfig
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Benchmark-only engines to compare against CLIP: Gemma 4 E2B (LiteRT-LM, downloaded at runtime) and
 * ML Kit image labeling (Play services; its model downloads once, on request). Every timing includes decoding the photo, like CLIP's embedImages.
 */
@OptIn(ExperimentalApi::class)
class EdgeBenchModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val model get() = File(ctx.filesDir, "models/gemma-4-E2B-it.litertlm")
  private val labeler by lazy { ImageLabeling.getClient(ImageLabelerOptions.DEFAULT_OPTIONS) }
  private var engine: Engine? = null

  override fun definition() = ModuleDefinition {
    Name("EdgeBench")
    Events("onDownload")

    AsyncFunction("gemmaFile") { -> mapOf("path" to model.path, "bytes" to model.length().toDouble(), "partial" to File(model.path + ".part").length().toDouble()) }

    AsyncFunction("downloadGemma") Coroutine { url: String -> withContext(Dispatchers.IO) { download(url) } }

    AsyncFunction("deleteGemma") { ->
      engine?.close(); engine = null
      model.delete(); File(model.path + ".part").delete()
    }

    /** Loads the model; returns load time in ms. gpu / visionGpu pick the backend for the LLM and the image encoder. */
    AsyncFunction("loadGemma") Coroutine { gpu: Boolean, visionGpu: Boolean ->
      withContext(Dispatchers.Default) {
        engine?.close(); engine = null
        ExperimentalFlags.enableBenchmark = true // fills getBenchmarkInfo (ttft, tok/s)
        val t0 = SystemClock.elapsedRealtime()
        // maxNumImages: room for one call per 6-photo story.
        engine = Engine(EngineConfig(model.path, if (gpu) Backend.GPU() else Backend.CPU(), visionBackend = if (visionGpu) Backend.GPU() else Backend.CPU(), maxNumImages = 6, cacheDir = ctx.cacheDir.path))
          .also { it.initialize() }
        SystemClock.elapsedRealtime() - t0
      }
    }

    AsyncFunction("unloadGemma") { -> engine?.close(); engine = null }

    /** One prompt over 1..6 photos. prepMs = decode + resize + JPEG; ms = total wall time. thinking=null keeps the model default. */
    AsyncFunction("gemmaDescribe") Coroutine { uris: List<String>, prompt: String, side: Int, maxTokens: Int, thinking: Boolean? ->
      withContext(Dispatchers.Default) {
        val e = engine ?: throw IllegalStateException("Gemma not loaded")
        val t0 = SystemClock.elapsedRealtime()
        val images = uris.map { uri ->
          val jpeg = ByteArrayOutputStream().also { decodeScaled(ctx, uri, side).apply { compress(Bitmap.CompressFormat.JPEG, 90, it); recycle() } }.toByteArray()
          Content.ImageBytes(jpeg)
        }
        val prepMs = SystemClock.elapsedRealtime() - t0
        // Fresh conversation per call so earlier answers don't grow the context.
        e.createConversation().use { c ->
          val msg = c.sendMessage(Contents.of(images + Content.Text(prompt)), maxOutputToken = maxTokens, thinkingConfig = thinking?.let { ThinkingConfig(it) })
          val ms = SystemClock.elapsedRealtime() - t0
          val b = c.getBenchmarkInfo()
          mapOf(
            "ms" to ms.toDouble(),
            "prepMs" to prepMs.toDouble(),
            "text" to msg.contents.contents.filterIsInstance<Content.Text>().joinToString("") { it.text }.trim(),
            "ttftMs" to b.timeToFirstTokenInSecond * 1000,
            "prefillTokens" to b.lastPrefillTokenCount,
            "prefillTps" to b.lastPrefillTokensPerSecond,
            "decodeTokens" to b.lastDecodeTokenCount,
            "decodeTps" to b.lastDecodeTokensPerSecond,
          )
        }
      }
    }

    AsyncFunction("mlkitReady") Coroutine { ->
      withContext(Dispatchers.IO) { Tasks.await(ModuleInstall.getClient(ctx).areModulesAvailable(labeler)).areModulesAvailable() }
    }

    // Asks Play services for the labeling model and waits (up to 2 min) until it is usable.
    AsyncFunction("mlkitInstall") Coroutine { ->
      withContext(Dispatchers.IO) {
        val client = ModuleInstall.getClient(ctx)
        Tasks.await(client.installModules(ModuleInstallRequest.newBuilder().addApi(labeler).build()))
        repeat(240) {
          if (Tasks.await(client.areModulesAvailable(labeler)).areModulesAvailable()) return@withContext true
          delay(500)
        }
        false
      }
    }

    AsyncFunction("mlkitLabels") Coroutine { uri: String, side: Int ->
      withContext(Dispatchers.Default) {
        val t0 = SystemClock.elapsedRealtime()
        val bmp = decodeScaled(ctx, uri, side)
        val labels = Tasks.await(labeler.process(InputImage.fromBitmap(bmp, 0)))
        bmp.recycle()
        mapOf("ms" to (SystemClock.elapsedRealtime() - t0).toDouble(), "labels" to labels.map { mapOf("text" to it.text, "conf" to it.confidence.toDouble()) })
      }
    }
  }

  /** Resumable download to filesDir/models (a .part file until complete); emits onDownload progress. */
  private fun download(url: String): String {
    val part = File(model.path + ".part").apply { parentFile!!.mkdirs() }
    val have = part.length()
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      connectTimeout = 15_000
      readTimeout = 30_000
      if (have > 0) setRequestProperty("Range", "bytes=$have-")
    }
    val append = conn.responseCode == 206
    if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
    var done = if (append) have else 0L
    val total = done + conn.contentLengthLong
    var lastEmit = 0L
    conn.inputStream.use { inp ->
      FileOutputStream(part, append).use { out ->
        val buf = ByteArray(1 shl 16)
        while (true) {
          val n = inp.read(buf)
          if (n < 0) break
          out.write(buf, 0, n)
          done += n
          if (done - lastEmit > total / 200) {
            lastEmit = done
            sendEvent("onDownload", mapOf("bytes" to done.toDouble(), "total" to total.toDouble()))
          }
        }
      }
    }
    if (done != total) throw IllegalStateException("incomplete: $done of $total bytes")
    part.renameTo(model)
    sendEvent("onDownload", mapOf("bytes" to done.toDouble(), "total" to total.toDouble()))
    return model.path
  }
}
