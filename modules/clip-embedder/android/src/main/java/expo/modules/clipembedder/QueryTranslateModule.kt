package expo.modules.clipembedder

import android.content.Context
import android.os.LocaleList
import android.util.Log
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.TaskCompletionSource
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.splitcompat.SplitCompat
import com.google.android.play.core.splitinstall.SplitInstallManagerFactory
import com.google.android.play.core.splitinstall.SplitInstallRequest
import com.google.android.play.core.splitinstall.SplitInstallStateUpdatedListener
import com.google.android.play.core.splitinstall.model.SplitInstallSessionStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/**
 * Search in other languages (src/services/index/queryLang.ts): ML Kit translates the query to English on the phone,
 * since the CLIP text towers only know English. One ~30 MB model per language, downloaded on request from Google;
 * queries never leave the phone. Language ID picks among the user's search languages. ML Kit's code is in the
 * translate feature module (TranslateFeature): until it's installed nothing is downloaded and identify finds nothing.
 */
class QueryTranslateModule : Module() {
  private val ctx get() = appContext.reactContext!!.applicationContext
  private fun <T> Task<T>.into(promise: Promise, map: (T) -> Any? = { it }) {
    addOnSuccessListener { promise.resolve(map(it)) }.addOnFailureListener { promise.reject("ERR_TRANSLATE", it.message, it) }
  }

  override fun definition() = ModuleDefinition {
    Name("QueryTranslate")

    /** The phone's first language, as an ML Kit tag (null: one ML Kit can't translate). */
    // the first preferred language: Locale.getDefault() is the first one the app has strings for (English, for tr + en)
    Function("deviceLanguage") { languageCode(LocaleList.getDefault()[0].language) }
    /** Every language ML Kit translates, with its English name, by name. */
    Function("languages") {
      LANGUAGES.map { mapOf("code" to it, "name" to Locale.forLanguageTag(it).getDisplayLanguage(Locale.ENGLISH)) }.sortedBy { it["name"] }
    }
    AsyncFunction("downloaded") { promise: Promise -> TranslateFeature.loaded(ctx)?.downloaded()?.into(promise) ?: promise.resolve(emptyList<String>()) }
    /** Installs the translate module first if needed. */
    AsyncFunction("download") { lang: String, promise: Promise -> TranslateFeature.load(ctx).onSuccessTask { it.download(lang) }.into(promise) { null } }
    AsyncFunction("remove") { lang: String, promise: Promise -> TranslateFeature.loaded(ctx)?.remove(lang)?.into(promise) { null } ?: promise.resolve(null) }
    /** Possible languages, most likely first: [{lang, conf}]; "und" = can't tell. */
    AsyncFunction("identify") { text: String, promise: Promise -> TranslateFeature.loaded(ctx)?.identify(text)?.into(promise) ?: promise.resolve(emptyList<Any>()) }
    /** text from lang to English; rejects if lang's model isn't downloaded. */
    AsyncFunction("toEnglish") { text: String, lang: String, promise: Promise ->
      TranslateFeature.loaded(ctx)?.toEnglish(text, lang)?.into(promise) ?: promise.reject("ERR_TRANSLATE", "translate module not installed", null)
    }
  }
}

/** ML Kit's TranslateLanguage.getAllLanguages() (translate 17.0.3), here so the list works before the module is. */
internal val LANGUAGES = listOf(
  "af", "sq", "ar", "be", "bg", "bn", "ca", "zh", "hr", "cs", "da", "nl", "en", "eo", "et", "fi", "fr", "gl", "ka", "de", "el", "gu",
  "ht", "he", "hi", "hu", "is", "id", "ga", "it", "ja", "kn", "ko", "lt", "lv", "mk", "mr", "ms", "mt", "no", "fa", "pl", "pt", "ro",
  "ru", "sk", "sl", "es", "sv", "sw", "tl", "ta", "te", "th", "tr", "uk", "ur", "vi", "cy",
)

/** ML Kit's TranslateLanguage.fromLanguageTag: Java's old codes mapped, null if it can't translate it. */
internal fun languageCode(tag: String): String? {
  val t = tag.lowercase(Locale.US)
  return mapOf("iw" to "he", "in" to "id", "nb" to "no")[t] ?: t.takeIf { it in LANGUAGES }
}

/** What MlKitTranslator (translate/, the feature module) does. */
interface QueryTranslator {
  fun downloaded(): Task<List<String>>
  fun download(lang: String): Task<Void>
  fun remove(lang: String): Task<Void>
  fun identify(text: String): Task<List<Map<String, Any>>>
  fun toEnglish(text: String, lang: String): Task<String>
}

/**
 * The translate feature module: ML Kit's ~7.5 MB of native code, on demand from Play in release builds, so only phones with
 * a search language besides English download it (queryLang's syncLangs asks for it with that language's model). Debug builds
 * compile it into the APK (build.gradle). A release APK installed without Play never gets it: download rejects.
 * ponytail: REQUIRES_USER_CONFIRMATION (Play wants an OK for big downloads; this one is ~7 MB) just fails; add
 * startConfirmationDialogForResult if it shows up in the field.
 */
internal object TranslateFeature {
  private const val MODULE = "translate"
  @Volatile private var translator: QueryTranslator? = null
  private var installing: Task<QueryTranslator>? = null

  /** The translator if the module's code is on the phone, else null. Never downloads. */
  fun loaded(ctx: Context): QueryTranslator? = translator ?: synchronized(this) {
    translator ?: try {
      SplitCompat.install(ctx) // makes a module installed by this process (or an earlier one) loadable
      (Class.forName("expo.modules.clipembedder.translate.MlKitTranslator").getConstructor(Context::class.java).newInstance(ctx) as QueryTranslator)
        .also { translator = it }
    } catch (_: ClassNotFoundException) {
      null
    }
  }

  /** The translator, installing the module from Play first if it isn't here. */
  @Synchronized fun load(ctx: Context): Task<QueryTranslator> {
    loaded(ctx)?.let { return Tasks.forResult(it) }
    installing?.let { return it }
    val done = TaskCompletionSource<QueryTranslator>()
    val sm = SplitInstallManagerFactory.create(ctx)
    lateinit var listener: SplitInstallStateUpdatedListener
    fun finish(e: Exception?) {
      if (e != null) Log.w("TranslateFeature", "install failed", e) else Log.i("TranslateFeature", "installed")
      sm.unregisterListener(listener)
      synchronized(this) { installing = null }
      if (e != null) done.trySetException(e)
      else loaded(ctx)?.let { done.trySetResult(it) } ?: done.trySetException(IllegalStateException("translate module installed but not loadable"))
    }
    listener = SplitInstallStateUpdatedListener { s ->
      if (MODULE in s.moduleNames()) when (s.status()) {
        SplitInstallSessionStatus.INSTALLED -> finish(null)
        SplitInstallSessionStatus.FAILED -> finish(IllegalStateException("translate module download failed (${s.errorCode()})"))
        SplitInstallSessionStatus.CANCELED -> finish(IllegalStateException("translate module download canceled"))
        SplitInstallSessionStatus.REQUIRES_USER_CONFIRMATION -> finish(IllegalStateException("translate module download needs the user's OK"))
      }
    }
    sm.registerListener(listener)
    Log.i("TranslateFeature", "installing")
    sm.startInstall(SplitInstallRequest.newBuilder().addModule(MODULE).build())
      .addOnSuccessListener { session -> if (session == 0) finish(null) } // 0: already installed
      .addOnFailureListener { finish(it) }
    return done.task.also { installing = it }
  }
}
