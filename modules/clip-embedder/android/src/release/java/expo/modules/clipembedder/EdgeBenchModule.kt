package expo.modules.clipembedder

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Release stand-in for the debug-only bench (src/debug: Gemma via LiteRT-LM + ML Kit, ~22 MB of native libs).
 * Autolinking lists this class in every variant; a different name keeps JS's EdgeBench null, so the bench UI says it's unavailable.
 */
class EdgeBenchModule : Module() {
  override fun definition() = ModuleDefinition { Name("EdgeBenchDebugOnly") }
}
