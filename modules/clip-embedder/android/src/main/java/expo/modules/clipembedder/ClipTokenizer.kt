package expo.modules.clipembedder

import org.json.JSONObject
import java.text.Normalizer

/** CLIP byte-level BPE (same steps as the HF tokenizer.json shipped next to the model). */
class ClipTokenizer(tokenizerJson: String) {
  companion object {
    const val CTX = 77
    private const val SOT = 49406L
    private const val EOT = 49407L
    private val PAT = Regex("""<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|\p{L}+|\p{N}|[^\s\p{L}\p{N}]+""")
    private val WS = Regex("""\s+""")
  }

  private val encoder = HashMap<String, Int>()
  private val ranks = HashMap<String, Int>() // "a b" -> merge priority
  private val byteChar = CharArray(256)
  private val cache = HashMap<String, List<String>>()

  init {
    val model = JSONObject(tokenizerJson).getJSONObject("model")
    val vocab = model.getJSONObject("vocab")
    vocab.keys().forEach { encoder[it] = vocab.getInt(it) }
    val merges = model.getJSONArray("merges")
    for (i in 0 until merges.length()) ranks[merges.getString(i)] = i
    // GPT-2 bytes_to_unicode
    val printable = (33..126) + (161..172) + (174..255)
    var n = 0
    for (b in 0 until 256) byteChar[b] = if (b in printable) b.toChar() else (256 + n++).toChar()
  }

  fun encode(text: String): LongArray {
    val norm = WS.replace(Normalizer.normalize(text, Normalizer.Form.NFC), " ").lowercase().trim()
    val ids = ArrayList<Long>()
    ids.add(SOT)
    for (m in PAT.findAll(norm)) {
      val word = m.value.toByteArray(Charsets.UTF_8).map { byteChar[it.toInt() and 255] }.joinToString("")
      for (tok in bpe(word)) encoder[tok]?.let { ids.add(it.toLong()) }
    }
    val out = LongArray(CTX) { EOT }
    for (i in 0 until minOf(ids.size, CTX - 1)) out[i] = ids[i]
    return out
  }

  private fun bpe(word: String): List<String> = cache.getOrPut(word) {
    val parts = word.map { it.toString() }.toMutableList()
    parts[parts.size - 1] = parts.last() + "</w>"
    while (parts.size > 1) {
      var best = -1
      var bestRank = Int.MAX_VALUE
      for (i in 0 until parts.size - 1) {
        val r = ranks["${parts[i]} ${parts[i + 1]}"] ?: continue
        if (r < bestRank) { bestRank = r; best = i }
      }
      if (best < 0) break
      val a = parts[best]
      val b = parts[best + 1]
      // merge every occurrence of the winning pair, left to right
      var i = 0
      val merged = ArrayList<String>(parts.size)
      while (i < parts.size) {
        if (i < parts.size - 1 && parts[i] == a && parts[i + 1] == b) { merged.add(a + b); i += 2 } else merged.add(parts[i++])
      }
      parts.clear(); parts.addAll(merged)
    }
    parts
  }
}
