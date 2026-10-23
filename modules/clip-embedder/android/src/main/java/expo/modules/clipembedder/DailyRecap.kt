package expo.modules.clipembedder

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.provider.MediaStore
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.Calendar
import java.util.concurrent.TimeUnit

private const val TAG = "DailyRecap"
private const val WORK = "daily-recap"
private const val CHANNEL = "daily_dump_channel" // = notificationService.ts
private const val NOTE_ID = 3 // BackgroundIndex uses 1 and 2
private const val HOUR = 20
private const val MIN_TODAY = 3 // = stories/index.ts MIN_TODAY: fewer and /preview/today has no story to open

/**
 * The 8 PM recap with today's cover photo: expo-notifications can't show an image in a local notification on Android.
 * A one-shot job that re-enqueues itself for the next 8 PM.
 * ponytail: WorkManager runs late under Doze (minutes, sometimes more); AlarmManager.setExactAndAllowWhileIdle plus a
 * boot receiver if it must fire on the dot.
 */
object DailyRecap {
  private fun prefs(ctx: Context) = ctx.getSharedPreferences("daily-recap", Context.MODE_PRIVATE)

  private fun midnight() = Calendar.getInstance().apply {
    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
  }.timeInMillis

  fun schedule(ctx: Context) {
    val now = Calendar.getInstance()
    val next = (now.clone() as Calendar).apply {
      set(Calendar.HOUR_OF_DAY, HOUR); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
      if (!after(now)) add(Calendar.DAY_OF_YEAR, 1)
    }
    val req = OneTimeWorkRequestBuilder<DailyRecapWorker>()
      .setInitialDelay(next.timeInMillis - now.timeInMillis, TimeUnit.MILLISECONDS)
      .build()
    WorkManager.getInstance(ctx).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req)
  }

  fun cancel(ctx: Context) {
    WorkManager.getInstance(ctx).cancelUniqueWork(WORK)
  }

  /** Today's dump cover, as the app curated it (worth-ranked, sensitive photos hidden). Kept for the day it was set. */
  fun setCover(ctx: Context, uri: String) {
    prefs(ctx).edit().putString("uri", uri).putLong("day", midnight()).apply()
  }

  /** Today's camera photos (DCIM minus Screenshots, like galleryService.isCameraPhoto). */
  private fun todayCount(ctx: Context): Int {
    val sel = "${MediaStore.Images.Media.DATE_TAKEN} >= ? AND ${MediaStore.Images.Media.DATA} LIKE ? AND ${MediaStore.Images.Media.DATA} NOT LIKE ?"
    val args = arrayOf(midnight().toString(), "%/DCIM/%", "%/DCIM/Screenshots/%")
    return ctx.contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, arrayOf(MediaStore.Images.Media._ID), sel, args, null)
      ?.use { it.count } ?: 0
  }

  /**
   * test: post even with fewer than MIN_TODAY photos (Profile's test button).
   * No curated cover today (app not opened since midnight) = text only: the newest photo could be a receipt or an ID
   * on the lock screen.
   */
  @SuppressLint("MissingPermission") // areNotificationsEnabled() checked first
  fun post(ctx: Context, test: Boolean = false) {
    val notes = NotificationManagerCompat.from(ctx)
    if (!notes.areNotificationsEnabled()) return
    val n = todayCount(ctx)
    if (n < MIN_TODAY && !test) return
    val p = prefs(ctx)
    val cover = p.getString("uri", null)?.takeIf { p.getLong("day", 0) == midnight() }
    val pic = cover?.let { runCatching { decodeScaled(ctx, it, 720) }.onFailure { e -> Log.w(TAG, "cover: $e") }.getOrNull() }

    notes.createNotificationChannel(
      NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH).setName("Daily Dump Reminders").build()
    )
    val open = PendingIntent.getActivity(
      ctx, NOTE_ID,
      Intent(Intent.ACTION_VIEW, Uri.parse("picdump://preview/today")).setPackage(ctx.packageName),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val title = "Your PicDump is ready 🎞️"
    val body = if (n > 0) "$n photos from today, curated into one dump. Take a look before bed." else "Review today's curated shots before heading to bed."
    val b = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(ctx.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(open)
      .setAutoCancel(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
    if (pic != null) {
      b.setLargeIcon(pic).setStyle(NotificationCompat.BigPictureStyle().bigPicture(pic).bigLargeIcon(null as Bitmap?))
      // secure lock screen: the photo only after unlock
      b.setPublicVersion(NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(ctx.applicationInfo.icon).setContentTitle(title).setContentText(body).build())
    }
    notes.notify(NOTE_ID, b.build())
    Log.i(TAG, "posted: $n photos, cover=${pic != null}")
  }
}

/** Plain Worker, not CoroutineWorker: re-enqueueing with REPLACE stops this run, which would cancel a coroutine mid-way. */
class DailyRecapWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
  override fun doWork(): Result {
    // A run delayed past midnight (phone off at 8 PM) would post yesterday's recap with today's photos: skip it.
    if (Calendar.getInstance().get(Calendar.HOUR_OF_DAY) >= HOUR) {
      runCatching { DailyRecap.post(applicationContext) }.onFailure { Log.w(TAG, "post failed", it) }
    }
    DailyRecap.schedule(applicationContext)
    return Result.success()
  }
}
