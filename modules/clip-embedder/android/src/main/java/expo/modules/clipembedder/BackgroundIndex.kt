package expo.modules.clipembedder

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.exifinterface.media.ExifInterface
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import org.json.JSONArray
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt
import kotlin.math.roundToLong

private const val TAG = "ClipBgIndex"
private const val WORK = "clip-bg-index"
private const val BATCH = 128
private const val TOP = 10 // = photoIndex.ts TOP_CONCEPTS
private const val CHANNEL = "index"
private const val NOTE_RUN = 1
private const val NOTE_END = 2
private const val LOW_BATTERY = 20
/** Fast mode on an A54, screen on: 45 mAh for 3,961 photos (MODEL_BENCHMARKS.md). ponytail: one phone's number, measure per device if the estimate matters. */
private const val MAH_PER_PHOTO = 0.0114

/**
 * Indexing outside the app's JS loop. JS hands over its todo; the worker embeds it into bg-index.db, and JS moves the
 * results into photo-index.db (live while it runs, or on the next run). Two modes:
 * - fast: a foreground service with a progress notification, started while the app is on screen (Android refuses to
 *   start one from the background). Keeps going after the app leaves, on battery too, at ~80 ms/photo.
 * - slow: a background job while charging, ~120-165 ms/photo (background cgroup). Where paused or stopped runs end up.
 * Own DB file: expo-sqlite bundles its own SQLite, and two SQLite copies writing one file can corrupt it (POSIX locks).
 */
object BackgroundIndex {
  private var helper: SQLiteOpenHelper? = null

  @Synchronized
  fun db(ctx: Context): SQLiteDatabase = (helper ?: object : SQLiteOpenHelper(ctx.applicationContext, "bg-index.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL("CREATE TABLE todo (ord INTEGER PRIMARY KEY, id TEXT NOT NULL, uri TEXT NOT NULL)")
      db.execSQL("CREATE TABLE done (id TEXT PRIMARY KEY, emb BLOB, concepts TEXT, lat REAL, lon REAL)")
      db.execSQL("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)")
    }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {}
  }.also { helper = it }).writableDatabase

  /** Replaces the todo (JS order: camera newest-first, then the rest) and starts the worker: now (fast) or once the phone charges. */
  fun schedule(ctx: Context, ids: List<String>, uris: List<String>, model: String, fast: Boolean) {
    val d = db(ctx)
    d.beginTransaction()
    try {
      // Results from another model would land in the wrong vector space.
      if (get(d, "model") != model) d.delete("done", null, null)
      put(d, "model", model)
      put(d, "total", ids.size.toString())
      put(d, "state", if (fast) "running" else "slow")
      d.delete("todo", null, null)
      val ins = d.compileStatement("INSERT INTO todo (id, uri) VALUES (?, ?)")
      ids.forEachIndexed { i, id -> ins.bindString(1, id); ins.bindString(2, uris[i]); ins.executeInsert() }
      d.setTransactionSuccessful()
    } finally {
      d.endTransaction()
    }
    enqueue(ctx, fast)
    Log.i(TAG, "scheduled ${ids.size} photos, fast=$fast")
  }

  /** Continues a paused todo in fast mode. Call while the app is on screen. */
  fun resume(ctx: Context) {
    put(db(ctx), "state", "running")
    enqueue(ctx, true)
  }

  /** Stops a fast run; the rest waits for the next charge (or Resume in the app). */
  fun pause(ctx: Context, state: String = "paused") {
    put(db(ctx), "state", state)
    // ponytail: paused on the charger continues in an hour, not at the next plug-in (a closed app gets no plug-in event)
    enqueue(ctx, false, if (charging(ctx)) 60 else 0)
    Log.i(TAG, state)
  }

  fun cancel(ctx: Context) {
    WorkManager.getInstance(ctx).cancelUniqueWork(WORK)
    put(db(ctx), "state", "idle")
  }

  /** REPLACE also stops a running worker. */
  internal fun enqueue(ctx: Context, fast: Boolean, delayMin: Long = 0) {
    val req = OneTimeWorkRequestBuilder<BackgroundIndexWorker>()
      .setInputData(workDataOf("fast" to fast))
      .setInitialDelay(delayMin, TimeUnit.MINUTES)
      .setBackoffCriteria(BackoffPolicy.LINEAR, 30, TimeUnit.SECONDS)
    if (!fast) req.setConstraints(Constraints.Builder().setRequiresCharging(true).setRequiresBatteryNotLow(true).build())
    WorkManager.getInstance(ctx).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req.build())
  }

  /**
   * state: running (fast) | slow (waiting for or running on the charger) | paused | lowbattery | done | idle.
   * batteryPct: estimated battery the rest costs in fast mode, null while charging.
   * canFast: fast mode would keep running (charging, or enough battery and the notification can show).
   * msPerPhoto: the current fast run's average, null before its first batch.
   */
  fun status(ctx: Context): Map<String, Any?> {
    val d = db(ctx)
    val left = left(d)
    val active = WorkManager.getInstance(ctx).getWorkInfosForUniqueWork(WORK).get().any { !it.state.isFinished }
    val s = get(d, "state") ?: "idle"
    return mapOf(
      "state" to if (s in setOf("running", "slow") && !active) "idle" else s, // process died with no work left queued
      "total" to (get(d, "total")?.toIntOrNull() ?: left),
      "left" to left,
      "charging" to charging(ctx),
      "notify" to NotificationManagerCompat.from(ctx).areNotificationsEnabled(),
      "batteryPct" to if (charging(ctx)) null else batteryPct(ctx, left),
      "msPerPhoto" to if (s == "running") get(d, "ms")?.toLongOrNull() else null,
      "canFast" to (charging(ctx) || (NotificationManagerCompat.from(ctx).areNotificationsEnabled() && !lowBattery(ctx))),
    )
  }

  /**
   * Hands over and deletes up to `limit` finished photos: {model, rows: [{id, emb (base64 Float32), concepts (JSON as
   * photoIndex.ts stores it), lat, lon}]}. ponytail: deleted before JS writes them; a crash in between only re-embeds them.
   */
  fun take(ctx: Context, limit: Int): Map<String, Any?> {
    val d = db(ctx)
    val rows = d.rawQuery("SELECT id, emb, concepts, lat, lon FROM done LIMIT ?", arrayOf(limit.toString())).use { c ->
      List(c.count) {
        c.moveToNext()
        mapOf(
          "id" to c.getString(0),
          "emb" to Base64.encodeToString(c.getBlob(1), Base64.NO_WRAP),
          "concepts" to c.getString(2),
          "lat" to if (c.isNull(3)) null else c.getDouble(3),
          "lon" to if (c.isNull(4)) null else c.getDouble(4),
        )
      }
    }
    rows.chunked(500).forEach { ch -> d.delete("done", "id IN (${ch.joinToString(",") { "?" }})", ch.map { it["id"] as String }.toTypedArray()) }
    return mapOf("model" to get(d, "model"), "rows" to rows)
  }

  internal fun left(d: SQLiteDatabase) = d.rawQuery("SELECT COUNT(*) FROM todo", null).use { it.moveToFirst(); it.getInt(0) }
  internal fun get(d: SQLiteDatabase, k: String) = d.rawQuery("SELECT v FROM meta WHERE k = ?", arrayOf(k)).use { if (it.moveToFirst()) it.getString(0) else null }
  internal fun put(d: SQLiteDatabase, k: String, v: String) = d.execSQL("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", arrayOf(k, v))

  private fun battery(ctx: Context) = ctx.getSystemService(BatteryManager::class.java)
  internal fun charging(ctx: Context) = battery(ctx).isCharging
  internal fun level(ctx: Context) = battery(ctx).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
  internal fun lowBattery(ctx: Context) = level(ctx) <= LOW_BATTERY || ctx.getSystemService(PowerManager::class.java).isPowerSaveMode
  internal fun batteryPct(ctx: Context, left: Int): Int {
    val uah = battery(ctx).getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)
    val level = level(ctx)
    val mah = if (uah > 0 && level > 0) uah / 10.0 / level else 4000.0 // full capacity from charge left / level
    return (left * MAH_PER_PHOTO / mah * 100).roundToInt()
  }
}

class BackgroundIndexWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
  private val ctx: Context get() = applicationContext
  private val notes get() = NotificationManagerCompat.from(ctx)

  override suspend fun doWork(): Result {
    // Release builds: the vision model may still be downloading (ModelPacks). Try again later (WorkManager's backoff).
    if (!ModelPacks.ready(ctx, ModelPacks.Pack.VISION)) return Result.retry().also { ModelPacks.next(ctx) }
    val fast = inputData.getBoolean("fast", false)
    val t0 = SystemClock.elapsedRealtime()
    val clip = ClipEngine.get(ctx)
    val d = BackgroundIndex.db(ctx)
    val total = BackgroundIndex.get(d, "total")?.toIntOrNull() ?: BackgroundIndex.left(d)
    if (fast) {
      val n = runNote(total - BackgroundIndex.left(d), total, null)
      val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ForegroundInfo(NOTE_RUN, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else ForegroundInfo(NOTE_RUN, n)
      // Refused when WorkManager re-runs this from the background (e.g. after the process died). Never index on battery
      // without the notification showing it: leave the rest to the charging-only job.
      if (runCatching { setForeground(info) }.onFailure { Log.w(TAG, "foreground refused", it) }.isFailure) {
        BackgroundIndex.pause(ctx, "slow")
        return Result.success()
      }
    }
    BackgroundIndex.put(d, "state", if (fast) "running" else "slow")
    d.delete("meta", "k = 'ms'", null)
    var n = 0
    // WorkManager stops a background run at 10 min; leave before that and continue on the retry. Foreground runs have no cap.
    while (fast || SystemClock.elapsedRealtime() - t0 < 8 * 60_000) {
      if (fast && !BackgroundIndex.charging(ctx)) {
        if (BackgroundIndex.lowBattery(ctx)) {
          endNote("Paused to save battery", "Continues when you charge.")
          BackgroundIndex.pause(ctx, "lowbattery")
          return Result.success()
        }
        if (!notes.areNotificationsEnabled()) { // notifications turned off mid-run: the battery drain would be invisible
          BackgroundIndex.pause(ctx)
          return Result.success()
        }
      }
      val batch = d.rawQuery("SELECT ord, id, uri FROM todo ORDER BY ord LIMIT $BATCH", null).use { c ->
        List(c.count) { c.moveToNext(); Triple(c.getLong(0), c.getString(1), c.getString(2)) }
      }
      if (batch.isEmpty()) break
      val vecs = clip.embedImages(batch.map { it.third }, 0)
      @Suppress("UNCHECKED_CAST")
      val top = clip.topConcepts(vecs, TOP).let { it["ids"] as List<Int> to it["scores"] as List<Double> }
      val gps = batch.map { latLon(it.second) }
      d.beginTransaction()
      try {
        batch.forEachIndexed { j, (_, id, _) ->
          val s = j * TOP
          val concepts = JSONArray(listOf(JSONArray(top.first.subList(s, s + TOP)), JSONArray(top.second.subList(s, s + TOP).map { (it * 1e4).roundToLong() / 1e4 })))
          d.insertWithOnConflict("done", null, ContentValues().apply {
            put("id", id)
            put("emb", floatBytes(vecs.copyOfRange(j * DIM, (j + 1) * DIM)))
            put("concepts", concepts.toString())
            put("lat", gps[j]?.get(0))
            put("lon", gps[j]?.get(1))
          }, SQLiteDatabase.CONFLICT_REPLACE)
        }
        d.delete("todo", "ord <= ?", arrayOf(batch.last().first.toString()))
        d.setTransactionSuccessful()
      } finally {
        d.endTransaction()
      }
      n += batch.size
      if (fast) {
        val ms = (SystemClock.elapsedRealtime() - t0) / n
        BackgroundIndex.put(d, "ms", ms.toString())
        notify(NOTE_RUN, runNote(total - BackgroundIndex.left(d), total, ms))
      }
    }
    val left = BackgroundIndex.left(d)
    val ms = SystemClock.elapsedRealtime() - t0
    Log.i(TAG, "indexed $n photos in $ms ms (${if (n > 0) ms / n else 0} ms/photo), $left left, fast=$fast")
    if (left > 0) return Result.retry()
    BackgroundIndex.put(d, "state", "done")
    if (fast && !appVisible()) endNote("Your stories are ready", "%,d photos read. Tap to see them.".format(total))
    return Result.success()
  }

  private fun builder(title: String, text: String): NotificationCompat.Builder {
    notes.createNotificationChannel(NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_LOW).setName("Photo indexing").build())
    val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let { PendingIntent.getActivity(ctx, 0, it, PendingIntent.FLAG_IMMUTABLE) }
    // ponytail: system download arrow; draw a monochrome app glyph if the shade icon matters
    return NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(title).setContentText(text).setContentIntent(open).setSilent(true).setOnlyAlertOnce(true)
  }

  /** Brief but complete: progress, time left, battery cost, when it stops, how to stop it. Swipe away = Pause (PauseReceiver). */
  private fun runNote(done: Int, total: Int, msPerPhoto: Long?): Notification {
    val left = total - done
    val eta = msPerPhoto?.let { val m = left * it / 60_000; if (m < 1) " · under a minute left" else " · ~$m min left" } ?: ""
    val line = "%,d of %,d photos%s".format(done, total, eta)
    val pct = BackgroundIndex.batteryPct(ctx, left)
    val battery = when {
      BackgroundIndex.charging(ctx) -> "Charging, so no battery cost."
      pct >= 1 -> "Uses about $pct% battery. Stops by itself at $LOW_BATTERY%."
      else -> "Uses a little battery. Stops by itself at $LOW_BATTERY%."
    }
    val stop = if (Build.VERSION.SDK_INT >= 34) "Swipe away to pause." else "Tap Pause to stop."
    val pause = PendingIntent.getBroadcast(ctx, 0, Intent(ctx, PauseReceiver::class.java), PendingIntent.FLAG_IMMUTABLE)
    return builder("Building your stories · ${done * 100 / maxOf(1, total)}%", line)
      .setStyle(NotificationCompat.BigTextStyle().bigText("$line\n$battery $stop"))
      .setProgress(total, done, false)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setDeleteIntent(pause)
      .addAction(0, "Pause", pause)
      .build()
  }

  private fun endNote(title: String, text: String) = notify(NOTE_END, builder(title, text).setAutoCancel(true).build())

  @SuppressLint("MissingPermission") // checked: posting is a no-op without it anyway
  private fun notify(id: Int, n: Notification) { if (notes.areNotificationsEnabled()) notes.notify(id, n) }

  private fun appVisible() = ActivityManager.RunningAppProcessInfo().also { ActivityManager.getMyMemoryState(it) }.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND

  // Same read as expo-media-library's getAssetInfoAsync: EXIF of the original (needs ACCESS_MEDIA_LOCATION on API 29+).
  private fun latLon(id: String): DoubleArray? = runCatching {
    val u = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toLong())
    val src = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStore.setRequireOriginal(u) else u
    applicationContext.contentResolver.openInputStream(src)?.use { ExifInterface(it).latLong }
  }.onFailure { Log.w(TAG, "no EXIF for $id", it) }.getOrNull()
}

/** The notification's Pause button and swipe-away. */
class PauseReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) = BackgroundIndex.pause(ctx)
}
