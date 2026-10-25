package expo.modules.clipembedder

import com.google.android.gms.tasks.Task
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.languageid.LanguageIdentificationOptions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/**
 * Search in other languages (src/services/index/queryLang.ts): ML Kit translates the query to English on the phone,
 * since the CLIP text towers only know English. One ~30 MB model per language, downloaded on request from Google;
 * queries never leave the phone. Language ID (bundled) picks among the user's search languages.
 */
class QueryTranslateModule : Module() {
  private val models = RemoteModelManager.getInstance()
  private val langId by lazy { LanguageIdentification.getClient(LanguageIdentificationOptions.Builder().setConfidenceThreshold(0.05f).build()) }
  private fun model(lang: String) = TranslateRemoteModel.Builder(lang).build()
  private fun <T> Task<T>.into(promise: Promise, map: (T) -> Any? = { it }) {
    addOnSuccessListener { promise.resolve(map(it)) }.addOnFailureListener { promise.reject("ERR_TRANSLATE", it.message, it) }
  }

  override fun definition() = ModuleDefinition {
    Name("QueryTranslate")

    /** The phone's first language, as an ML Kit tag (null: one ML Kit can't translate). */
    Function("deviceLanguage") { TranslateLanguage.fromLanguageTag(Locale.getDefault().language) }
    /** Every language ML Kit translates, with its English name, by name. */
    Function("languages") {
      TranslateLanguage.getAllLanguages().map { mapOf("code" to it, "name" to Locale.forLanguageTag(it).getDisplayLanguage(Locale.ENGLISH)) }.sortedBy { it["name"] }
    }
    AsyncFunction("downloaded") { promise: Promise -> models.getDownloadedModels(TranslateRemoteModel::class.java).into(promise) { s -> s.map { it.language } } }
    AsyncFunction("download") { lang: String, promise: Promise -> models.download(model(lang), DownloadConditions.Builder().build()).into(promise) { null } }
    AsyncFunction("remove") { lang: String, promise: Promise -> models.deleteDownloadedModel(model(lang)).into(promise) { null } }
    /** Possible languages, most likely first: [{lang, conf}]; "und" = can't tell. */
    AsyncFunction("identify") { text: String, promise: Promise ->
      langId.identifyPossibleLanguages(text).into(promise) { l -> l.map { mapOf("lang" to it.languageTag, "conf" to it.confidence.toDouble()) } }
    }
    /** text from lang to English; rejects if lang's model isn't downloaded. */
    AsyncFunction("toEnglish") { text: String, lang: String, promise: Promise ->
      val t = Translation.getClient(TranslatorOptions.Builder().setSourceLanguage(lang).setTargetLanguage(TranslateLanguage.ENGLISH).build())
      t.translate(text).addOnCompleteListener { t.close() }.into(promise)
    }
  }
}
