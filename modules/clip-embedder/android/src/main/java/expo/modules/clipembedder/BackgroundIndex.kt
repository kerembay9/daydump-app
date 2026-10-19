package expo.modules.clipembedder

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import androidx.exifinterface.media.ExifInterface
import android.os.Build
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONArray
import java.util.concurrent.TimeUnit
import kotlin.math.roundToLong

private const val TAG = "ClipBgIndex"
private const val WORK = "clip-bg-index"
private const val BATCH = 128
private const val TOP = 10 // = photoIndex.ts TOP_CONCEPTS

/**
 * Indexing while the app is closed and the phone charges. JS hands over its remaining todo when it leaves the foreground;
 * the worker embeds it into bg-index.db, and JS moves the results into photo-index.db on its next run. Own DB file:
 * expo-sqlite bundles its own SQLite, and two SQLite copies writing one file can corrupt it (POSIX locks).
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

  /** Replaces the todo (JS order: camera newest-first, then the rest) and starts the worker once the phone charges. */
  fun schedule(ctx: Context, ids: List<String>, uris: List<String>, model: String) {
    val d = db(ctx)
    d.beginTransaction()
    try {
      // Results from another model would land in the wrong vector space.
      if (model(d) != model) d.delete("done", null, null)
      d.execSQL("INSERT OR REPLACE INTO meta (k, v) VALUES ('model', ?)", arrayOf(model))
      d.delete("todo", null, null)
      val ins = d.compileStatement("INSERT INTO todo (id, uri) VALUES (?, ?)")
      ids.forEachIndexed { i, id -> ins.bindString(1, id); ins.bindString(2, uris[i]); ins.executeInsert() }
      d.setTransactionSuccessful()
    } finally {
      d.endTransaction()
    }
    val constraints = Constraints.Builder().setRequiresCharging(true).setRequiresBatteryNotLow(true).build()
    val req = OneTimeWorkRequestBuilder<BackgroundIndexWorker>()
      .setConstraints(constraints)
      .setBackoffCriteria(BackoffPolicy.LINEAR, 30, TimeUnit.SECONDS)
      .build()
    WorkManager.getInstance(ctx).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req)
    Log.i(TAG, "scheduled ${ids.size} photos")
  }

  fun cancel(ctx: Context) {
    WorkManager.getInstance(ctx).cancelUniqueWork(WORK)
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
    return mapOf("model" to model(d), "rows" to rows)
  }

  private fun model(d: SQLiteDatabase) = d.rawQuery("SELECT v FROM meta WHERE k = 'model'", null).use { if (it.moveToFirst()) it.getString(0) else null }
}

class BackgroundIndexWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
  override suspend fun doWork(): Result {
    val t0 = SystemClock.elapsedRealtime()
    val clip = ClipEngine.get(applicationContext)
    val d = BackgroundIndex.db(applicationContext)
    var n = 0
    // WorkManager stops a run at 10 min; leave before that and continue on the retry.
    while (SystemClock.elapsedRealtime() - t0 < 8 * 60_000) {
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
    }
    val left = d.rawQuery("SELECT COUNT(*) FROM todo", null).use { it.moveToFirst(); it.getInt(0) }
    val ms = SystemClock.elapsedRealtime() - t0
    Log.i(TAG, "indexed $n photos in $ms ms (${if (n > 0) ms / n else 0} ms/photo), $left left")
    return if (left > 0) Result.retry() else Result.success()
  }

  // Same read as expo-media-library's getAssetInfoAsync: EXIF of the original (needs ACCESS_MEDIA_LOCATION on API 29+).
  private fun latLon(id: String): DoubleArray? = runCatching {
    val u = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toLong())
    val src = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStore.setRequireOriginal(u) else u
    applicationContext.contentResolver.openInputStream(src)?.use { ExifInterface(it).latLong }
  }.onFailure { Log.w(TAG, "no EXIF for $id", it) }.getOrNull()
}
