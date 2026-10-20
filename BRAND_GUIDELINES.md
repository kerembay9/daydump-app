# DayDump — Brand Guidelines

**Version:** 2.0 (redesign, October 2026)
**Source of truth in code:** `src/theme/tokens.ts` (colours, shadows), `src/theme/type.ts` (fonts), `src/components/ui/` (shared pieces). If this file and the code disagree, the code wins; update this file.

---

## 1. Essence

DayDump turns a cluttered camera roll into ready-to-post photo dumps. It reads the whole library on the phone, groups photos into stories (trips, topics, Today), and lets you lay them out, filter them and hand them to Instagram or TikTok.

- **Private by design.** Indexing, stories, search and rendering run on the device. Photos are never uploaded to DayDump.
- **Scrapbook, not dashboard.** Photos look like printed photos: cream borders, a small tilt, tape on the hero. Paper-coloured cards, serif titles.
- **No paywall.** `PAYWALLS_ENABLED = false` (`src/constants/flags.ts`): everyone gets every feature, no crowns, no watermark.

---

## 2. Colour

Two themes. The app follows the system setting; Profile → Appearance overrides it (System / Cashmere / Espresso). Always read colours through `useTheme()`; never call `useColorScheme()` directly.

| Token | Cashmere (light) | Espresso (dark) | Use |
| :--- | :--- | :--- | :--- |
| `bgScreen` | `#F6EFE6` (+ vertical gradient `#F9F4E8 → #F5F2E7 → #F7EDE6`) | `#241D14` | Screen background |
| `bgCard` | `#EFE6DA` | `#2E2418` | Cards, sheets, inputs |
| `borderSubtle` | `rgba(74,52,40,0.08)` | `rgba(255,232,200,0.09)` | Card edges, dividers |
| `borderStrong` | `rgba(74,52,40,0.15)` | `rgba(255,232,200,0.17)` | Inactive chips, empty photo wells |
| `ink` | `#261F1B` | `#F3ECE3` | Titles, primary text, active pills |
| `inkMuted` | `#766860` | `#9E9080` | Meta lines, section labels, hints |
| `accentFab` | `#DFD1C4` | `#A84A2F` (rust) | Accent buttons |
| `tapeBg` / `tapeBorder` | `rgba(212,196,182,0.58)` / `rgba(140,115,95,0.22)` | `rgba(212,169,106,0.36)` / `rgba(235,195,130,0.25)` | Masking tape on hero cards |
| `draftPill` | `rgba(0,0,0,0.05)` | `#A84A2F` | Library "Draft" pill |

Theme-independent (`fixed`): print border `#FAF6F0`, photo chips `rgba(0,0,0,0.6)` with `#F3ECE3` text, like red `#E0393E`, IG blue `#3897F0`.

Shadows are CSS `boxShadow` strings per theme: `shadowCard` (cards), `shadowDeck` (pinned bottom areas), `shadowPrint` (photo prints).

---

## 3. Type

Fonts are embedded by the expo-font plugin, one family per weight. Android ignores `fontWeight` for custom fonts, so choose the family and never set `fontWeight` with it.

| Role | Font | Helper |
| :--- | :--- | :--- |
| Page titles (28, line 1.05), hero (19.5), tile titles (15.5–16.5) | Source Serif 4 Medium, tracking −0.02em | `display(size, lineHeight?)` |
| Body, meta, buttons | Inter 400 / 500 / 600 / 700 | `ui(size, weight)` |
| Section labels ("OTHER DUMPS", "LAST SEARCHES") | Inter 600, uppercase, tracking 0.14em, `inkMuted` | `label(size)` |

Titles must fit: up to 2 lines with auto-shrink, never "…". Do not set `lineHeight` on text that auto-shrinks (Android does not scale it).

---

## 4. Shapes and components

- **FrameCard** — `bgCard`, 1px `borderSubtle`, `shadowCard`, radius 16. The basic container.
- **Print** — a photo with a cream `#FAF6F0` border, `shadowPrint`, small tilt. Stacks of prints (`PhotoStack`) show a dump; the Discover hero is taped (`Tape`) and tilted −1°.
- **Pill** — fully rounded; active = `ink` fill with `bgScreen` text, inactive = `borderStrong` outline.
- **Sheet** — bottom sheet in `bgCard` for menus and confirmations, instead of stock alerts where possible.
- **TabBar** — Discover · Create · Library, custom icons from the mock.

---

## 5. Dumps: ratios, frames, layouts, filters

- **Ratios:** 4:5 (IG Post, default), 9:16, 1:1, 3:4. Default ratio and frame come from Profile.
- **Frames:** *Full Bleed* (photo to the edge) or *Cashmere Border* (cream matte).
- **Layouts:** 1 Photo, 2 Split, 3 Bento, 2×2 Grid, Scrapbook. Photos are chunked across slides with no repeats.
- **Filters (Skia colour matrices, 0–100%):** Warm 35mm (default, 68%), Cashmere, Soft Film, Sunfade, B&W Roll, Original. Apply to all, or per photo.
- **Captions:** on-device templates, about 6 per dump.
- **Export:** 1080 px wide JPGs, saved to the "DayDump" album, then shared to Instagram or TikTok.

---

## 6. Voice

Short, plain, friendly. Say what happens: "Reading your library · 1,200 of 3,963", "Paused at 800 of 3,963", "Your current draft is safe in Library → Drafts". No hype words, no "AI magic". Meta lines read "{N} photos · {range}", for example "6 photos · Jun–Sep".

---

## 7. Haptics

- Selection change (dragging a filmstrip thumb, onboarding pages): `Haptics.selectionAsync()`.
- Primary taps: `Haptics.impactAsync(Light)`.
