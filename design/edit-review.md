## DayDump Edit studio: filters, photo edit and layout review (Oct 2026)

Code read for this review: `src/app/edit/[id].tsx`, `src/components/edit/{FilterCard,SlidePager,Filmstrip}.tsx`, `src/services/{filters,layouts,slides}.ts(x)`, `Tidy.kt` (`tidyStats`) and BRAND_GUIDELINES.md.

### What others do

| App | Looks | Adjustments | Auto | Per-photo vs batch | Layout tools |
|---|---|---|---|---|---|
| Instagram post | About 20 named filters. Tap a filter again for intensity (default 100), with a frame toggle next to the slider | 13 tools, bipolar sliders with 0 in the middle | Lux (one sun button) | The filter strip applies to all photos; tap one photo to edit it alone. One ratio per post | Ratio only |
| IG Edits (Carousel) | Saved presets carry into carousels | Adjust plus adjustment layers | Colour correction | Unclear | Layouts per slide, padding and spacing, elements that run across slides. A separate tool from colour |
| TikTok Photo Mode | Grouped by subject (Portrait, Landscape, Food, Vibe), default 80 | Brightness, contrast, saturation | None | Per slide only, no apply-to-all | Fill or Fit |
| VSCO | Film X looks; tap again for Strength, Character, Warmth | Exposure, contrast, white balance, Fade, Grain, HSL | AI Lab enhance | Recipes, batch edit of 100 photos | Collage (secondary) |
| Dazz / Huji / Afterlight | The look is a "camera": colour, grain, light leak, date stamp and frame in one bundle | A small set, plus copy and paste | None | Copy/paste, recipes | Instant-film frames |
| Tezza | Presets kept apart from Effects and Overlays (Paper, Dust) | 14 tools | None | Templates | 150+ templates |
| Apple Photos | 9 filters, each with an intensity dial | 16 tools: a row of icons whose ring shows the value, a tick ruler that clicks at zero | Auto wand, first in the row; it moves the sliders so you can see what it did | Copy Edits and Paste Edits (crop is not copied) | Crop tab only |
| Lightroom / Snapseed | Presets with an Amount slider; film stocks plus Grain and Halation | Grouped as Light, Color, Effects, Detail | Auto writes the slider values | Copy settings by group; batch | Crop and geometry only |
| Google Photos collage | Filters live in the normal editor | Lives in the normal editor | Enhance chip | Per photo | Templates (Grid, Film, Classic) and Borders (width, radius, colour). Switching layout keeps the photos |
| PicsArt / Canva | – | – | – | – | Ratio, then Border (gap, radius, outer frame), then Background (colour or paper). Drag a photo onto another to swap them. Double-tap a cell to reframe the photo |

**Pattern:** every app keeps composition (ratio, layout, gap, frame) apart from the look (filter and adjustments). Most put the filter on all photos by default and let you tap one photo to give it its own settings. Auto is one tap and sits first.

### Gaps in DayDump

1. **Everything is on one screen.** Drag-to-crop owns the canvas, so there is no gesture left for compare, and the filter controls compete with the ratio and layout controls for space.
2. **There are no per-photo adjustments.** You cannot brighten one dark photo. Tidy.kt already measures `b`, `sd`, `lap`, `hi`, `lo`, `tilt` and the face brightness `l`, and none of it reaches Edit.
3. **"Apply to all photos" turned off means per slide, not per photo.** `setLook` writes every photo on the slide, and the hint says "this slide only". The brand guide promises per photo.
4. **The looks are flat.** They are linear 4x5 matrices built from sepia, saturate, contrast and brightness. They have no grain, fade, vignette or light leak, which are the things that make film apps feel analog.
5. **Look previews are colour dots** (`swatch`), not your own photo.
6. **Fit cannot be changed in Edit.** `fit = fitOf(dump.fit)` is read-only and comes from the Profile default. There is no gap, corner or matte colour control either.
7. **One layout for the whole dump, chunked n per slide.** You cannot give one slide a single photo and the next a grid.
8. **No before/after, no reset, no copy look.**
9. **No 3:4 grid-safe guide on slide 1.** IG crops the profile grid to 3:4.

### Recommendation: split Layout and Photos

**Your hunch is right**, with one nuance: the split should follow **what the control acts on**, not what kind of control it is.

- **Layout** acts on the dump and its slides. Default scope: every slide. It covers ratio (one per dump, because IG forces every slide to the first slide's ratio), arrangement, Fit (Fill / Matte / Blur fill), gap, corners, matte colour, slide order and cover. **Crop stays here.** A crop only means something inside a cell, so drag and pinch to reframe are Layout gestures.
- **Photos** acts on the pixels. It covers the **Look** (dump-wide by default), **Adjust** (per photo by default, because exposure fixes are about one photo) and **Texture** (Grain, Fade, Vignette, later light leak and date stamp). Texture follows the Look's scope, because texture is part of the dump's vibe.

**The structure:**

- **Entry.** A segmented `Layout | Photos` control sits under the title row. Both tabs keep the canvas card and the filmstrip, so you never lose your place. In Layout, tapping a cell selects it and shows a small chip with "Edit photo", which switches to Photos with that photo targeted.
- **Scope in Photos.** A chip reads `All photos` / `This photo`.
  - With nothing targeted, a look change goes to the dump look.
  - Tapping a photo on the canvas or in the filmstrip targets it: the others dim to 45% and the chip shows `This photo`. Changes become overrides for that photo, and a small dot marks edited photos in the filmstrip.
  - "Use on every photo" promotes the photo's look to the dump look.
  - The Adjust tab always targets one photo. If nothing is targeted, it targets the slide's first photo.
- **Data.** Extend `FilterState` to `{ key, pct, tex, per: Record<photoId, { look?, adj?, tex? }> }`. Drop `all`: a photo with no override follows the dump. Store settings, never pixels. Render at export through the same `SlideDrawing` tree.
- **Compare.** In Photos, press and hold the canvas to show the original. This works because cropping is not active in that tab.
- **Reset.**
  - Double-tap a tool icon to reset that tool.
  - "Reset photo" is in the photo's ⋯ menu.
  - "Reset look" is in All photos scope.
- **Copy look.** For now, "Use on every photo". Next, Copy edits → Paste to…, with ticks for Look, Adjust and Texture.
- **Auto.** A wand sits first in the Adjust row. It writes visible slider values, never baked pixels. "Auto all" is available in All photos scope.

### What to add

**Now** (this release; all of it on-device, no new dependencies):

| # | Item | How | Size |
|---|---|---|---|
| 1 | Layout / Photos tabs, moving controls to the right tab, Fit control in Layout | Existing components, re-homed | M |
| 2 | Per-photo scope that replaces the checkbox, filmstrip dot on overrides, hold to compare | `lookFor` extension, Skia uniform or `null` matrix while held | S |
| 3 | One SkSL "develop" `RuntimeEffect`: Light, Contrast, Shadows, Warmth, Saturation, Sharpen, Fade, Grain, Vignette as uniforms. The look's ColorMatrix is folded in as a mat4 plus offset uniform | Grain from a seeded hash so it doesn't shimmer, sized to output pixels. Sharpen is a 5-tap kernel whose radius scales with output size | M |
| 4 | Auto, from `tidyStats` | `b` and `sd` give exposure and contrast; `lo` and `hi` give shadows and highlights; face `l` aims faces at about 58% luma. About 20 ms in Kotlin, output is slider values | S |
| 5 | Look tray with your photo as each thumbnail, and Strength under it (default 68) | Same ColorMatrix as the Filmstrip thumbs | S |
| 6 | Each look bundles default Texture (for example Soft Film: Grain 18, Fade 10) | Values in `PRESETS` | S |
| 7 | Frame controls: Gap (0–12), Corners (0–16), Matte (Cream, White, Black, Kraft) | Extra params to `slideCells` | S |
| 8 | 3:4 grid-safe guide on slide 1 | Dashed overlay, preview only | S |
| 9 | Suggestion chips only when Tidy flagged the photo: "Brighten" (too dark), "Straighten" (uses `tilt`), "Sharper take" (opens the Same shot swap) | Reuses Shot check reasons | S |

**Next:**

| # | Item | How | Size |
|---|---|---|---|
| 10 | Per-slide arrangement (`Every slide` / `This slide`) with suggested layouts from the photos' orientations | Slide boundaries stored in the dump instead of chunked | M |
| 11 | Drag a cell onto another cell to swap, across slides too. Layout changes keep crops | – | M |
| 12 | LUT film looks (self-made or CC0 `.cube` → strip SkImage, trilinear sampling in SkSL), plus about 4 new looks named like stocks without trademarks: Honey 200, Coastline 400, Night Bus 800, Paper Mono | – | M |
| 13 | Orange '98-style date stamp from `photo.created` | – | S |
| 14 | Seeded light leaks; tapping Leak again rerolls them | Gradients with screen blend | S |
| 15 | Blur fill Fit | Blurred copy of the photo behind it | S |
| 16 | Print frames for Scrapbook: polaroid, tape, paper background | – | M |
| 17 | Copy edits → Paste to… with group ticks | – | S |
| 18 | Tick ruler with a zero detent (`expo-haptics`) and value rings on the tool icons | – | S |

**Later:**

| # | Item | How | Size |
|---|---|---|---|
| 19 | Halation and Bloom | Precomputed blur at ¼ resolution as a shader child | M |
| 20 | Saved looks plus a 6-character recipe code to share | – | M |
| 21 | Spread: one panorama across 2–3 slides | Breaks the pager's 1:1 slide-to-image model | L |
| 22 | "For this dump" suggested look | CLIP plus scores rank the looks | M |
| 23 | Highlights, Tint, Vibrance | Uniforms only | S |

### What to drop or change

- **Drop the "Apply to all photos" checkbox.** Scope comes from what you tapped.
- **Drop the colour swatches on look pills.** Show the real photo instead.
- **Rename the "Filter" label to "Look".** Keep the six look names; they already sound like film stocks. Original stays first in the tray, the BeReal lesson that no edit is a valid choice.
- **Drop the "Tap sides · drag to crop" badge in Photos.** It stays in Layout only.
- **Change the layout pills to small diagram tiles.** "Scrapbook" becomes the first Print frame.
- **Keep the 4x5 matrices as each look's colour stage** inside the new shader. Do not rewrite them; replace them only when LUTs land.
- **Skip:**
  - Cloud or AI restyle: it breaks the privacy promise.
  - Skin smoothing and ML unblur: Tidy already offers the sharper take.
  - HSL, curves, tilt shift, perspective: they are tools for professional editors, not for making a dump.
  - Mixed ratios in one carousel: IG cannot post it.
  - Text and stickers: for now.
- **No paywall, no crowns,** including on looks. Drops of new looks are fine; locks are not.
