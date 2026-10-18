# DayDump 📸✨

> **AI Camera Roll Curator & Instagram Carousel Studio** powered by Gemini Nano & RevenueCat.

DayDump analyzes your photos from today (or any custom theme like *"6 pics from december"* or *"your summer vacation"*), identifies the best shots using on-device multimodal AI, and structures them into an aesthetic 4:5 Instagram carousel with tone-matched captions, trending audio recommendations, and aesthetic frames.

---

## ⚡️ Key Features

1. **Daily Auto-Recap:** Automatically clusters photos taken today and curates an aesthetic visual narrative.
2. **Theme Prompting:**
   - Pre-made curated chips (*"6 Pics from Dec"*, *"Summer Vacation"*, *"Coffee & Bakery"*, *"Golden Hour"*).
   - Custom user input prompt (*"6 pics from december"*, *"gym progress"*, *"tokyo trip"*).
3. **Gemini Nano Visual Story Pacing:**
   - **Slide 1:** Cover / The Hook
   - **Slide 2:** Atmosphere / Setting
   - **Slide 3:** Close-up Detail
   - **Slide 4:** Candid / Person
   - **Slide 5:** Movement / Action
   - **Slide 6:** Outro / Warm Memory
4. **Aesthetic Carousel Studio:**
   - True **4:5 Instagram Feed aspect ratio**.
   - **Frame Styles:** Clean Minimal (Free), 35mm Analog Film Grain (Pro), Editorial Magazine (Pro), Polaroid Instant (Pro).
5. **Multi-Tone Caption Studio:**
   - **Aesthetic:** Minimalist lowercase vibes with emojis.
   - **Witty:** Relatable, humorous Instagram dump captions.
   - **Story:** Poetic 2-sentence micro-journaling.
   - **Trending Sound Matches & Hashtags.**
6. **1-Tap Share & Clipboard Sync:**
   - Copies the caption to clipboard with haptics and launches Instagram Feed / Story sharing.

---

## 💰 Monetization: The Aggressive Creator Model

The app is built around the high-converting creator app model powered by **RevenueCat** (`react-native-purchases`):

* **Free Tier:**
  * 1 free daily auto-dump per day.
  * Clean minimal frame.
  * Default aesthetic caption.
  * Subtle `curated with DayDump` watermark tag.
* **DayDump Creator Pass (Pro):**
  * **Weekly Pass:** `$3.99 / week` with **3-Day Free Trial** (Most Popular for viral TikTok/IG users).
  * **Annual Pass:** `$34.99 / year` (`$2.91/mo`, Save 83%).
  * **Lifetime Pass:** `$59.99` (Pay once, own forever).
  * **Pro Unlocks:** Unlimited custom theme prompts, all 35mm film & editorial frames, multi-tone captions, watermark-free exports, and unlimited daily carousels.

---

## 🛠 Tech Stack

* **Cross-Platform:** React Native (Expo SDK 57 + TypeScript)
* **On-Device AI Engine:** Gemini Nano (via Google AI Edge / Android AICore architecture) with Gemini 2.0 Flash cloud fallback
* **Camera Roll:** `expo-media-library` with smart burst-shot deduplication & heuristic filtering
* **Aesthetic Canvas:** `expo-image`, `react-native-svg`, `lucide-react-native`
* **Sharing:** `expo-sharing` & `expo-clipboard`
* **Monetization:** RevenueCat (`react-native-purchases`)

---

## 🚀 Running the App

### 1. Start the Development Server
```bash
cd /Users/kerembayramoglu/Desktop/daydump-app
npm start
```

### 2. Run on iOS (Simulator or Physical Device)
```bash
npm run ios
```

### 3. Run on Android (Emulator or Physical Device)
```bash
npm run android
```

---

## 🧪 Testing Monetization in Dev Mode

1. Tap the **Settings icon** (top right gear).
2. Toggle **"Simulate Pro Active"** on or off to immediately test free tier limits vs full Pro creator features.
3. Tap **"Reset Daily Free Dump Limit"** to test the paywall trigger after 1 daily dump.
4. Input your RevenueCat API key whenever you're ready to test production StoreKit / Google Play Billing.

## 🧠 On-device stories (Android)

Story cards ("A week in Seattle", "A red winter") come from an on-device index: TinyCLIP embeddings
(`modules/clip-embedder`, ONNX Runtime) + GPS/dates + an offline city list. Nothing leaves the phone.

1. Build the model assets once (they're gitignored, ~110 MB):
   `python -m venv --system-site-packages .venv && .venv/bin/pip install onnx onnxruntime onnxscript wordfreq ftfy regex`
   then `.venv/bin/python scripts/build_assets.py`
   (`build_assets.py bench` exports the old 40M and the faster 22M vision models for the index bench and prints the adb push commands.)
   Accuracy vs phone speed of every model tried: [MODEL_BENCHMARKS.md](MODEL_BENCHMARKS.md).
2. Logic self-check: `npx -y tsx scripts/selfcheck.ts`
3. **Eval mode:** put a curated, diverse set of photos in a phone album (e.g. `DayDump Eval`) and add
   `EXPO_PUBLIC_EVAL_ALBUM=DayDump Eval` to `.env.local`. Every gallery read, the index, stories and search
   then use only that album (separate index DB). Inspect results in Settings → On-device stories → Stories debug.
   Only on a dedicated test phone: album copies keep their dates, so they show up twice in the gallery
   timeline. `scripts/make_eval_album.py push --test-phone` builds one; `... clean` removes it.

Attribution: GeoNames (CC BY 4.0), Open Images V7 class names (CC BY 4.0), TinyCLIP (MIT).
