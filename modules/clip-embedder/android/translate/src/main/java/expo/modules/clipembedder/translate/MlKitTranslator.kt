package expo.modules.clipembedder.translate

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.common.sdkinternal.MlKitContext
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.languageid.LanguageIdentificationOptions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.clipembedder.QueryTranslator

/** ML Kit behind QueryTranslator; made by name (TranslateFeature) once this module's code is on the phone. */
class MlKitTranslator(ctx: Context) : QueryTranslator {
  init { MlKitContext.initializeIfNeeded(ctx.applicationContext) } // release: its init provider is removed (AndroidManifest.xml)

  private val models = RemoteModelManager.getInstance()
  private val langId by lazy { LanguageIdentification.getClient(LanguageIdentificationOptions.Builder().setConfidenceThreshold(0.05f).build()) }
  private fun model(lang: String) = TranslateRemoteModel.Builder(lang).build()

  override fun downloaded(): Task<List<String>> =
    models.getDownloadedModels(TranslateRemoteModel::class.java).onSuccessTask { s -> Tasks.forResult(s.map { it.language }) }
  override fun download(lang: String): Task<Void> = models.download(model(lang), DownloadConditions.Builder().build())
  override fun remove(lang: String): Task<Void> = models.deleteDownloadedModel(model(lang))
  override fun identify(text: String): Task<List<Map<String, Any>>> = langId.identifyPossibleLanguages(text)
    .onSuccessTask { l -> Tasks.forResult(l.map { mapOf("lang" to it.languageTag, "conf" to it.confidence.toDouble()) }) }
  override fun toEnglish(text: String, lang: String): Task<String> {
    val t = Translation.getClient(TranslatorOptions.Builder().setSourceLanguage(lang).setTargetLanguage(TranslateLanguage.ENGLISH).build())
    return t.translate(text).addOnCompleteListener { t.close() }
  }
}
