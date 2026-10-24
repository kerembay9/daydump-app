# Applied to the app's release build (R8). Keeps everything the models path touches whole, so R8 can't strip or
# rename anything reached by name: our module (small), LiteRT's Java side (its native code calls back into it,
# and the AAR only ships rules for the old TFLite API) and Play asset delivery (ships no rules).
-keep class expo.modules.clipembedder.** { *; }
-keep class com.google.ai.edge.litert.** { *; }
-keep class org.tensorflow.lite.** { *; }
-keep class com.google.android.play.core.** { *; }
