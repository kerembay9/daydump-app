# DayDump redesign: morning brief

## 1. First action (about 30–45 min)

1. Unlock the A54.
2. Ask Claude: **"do the device pass"**.

Why: the phone locked during P4. These were checked by code only, never on the phone:
- P5 Profile (light and dark), onboarding, Selfie page
- P6 Create and the share-in ("open with DayDump") cases
- X+Y "2 ways to finish"
- P7 cleanup
- P9 final audit walk-through

Also needed once, by you: do one real Post to IG. Post and Save only were never tapped on the phone.

## 2. What works now

- All 10 phases are built: Discover B, Library, Edit with Skia filters, Posted Preview, Profile, Create, X+Y "2 ways to finish", cleanup, Jest UI tests, final audit.
- Jest: 7 suites, 13 tests pass.
- tsc and lint are clean.
- 53 files changed on `batu-redesign`.
- Nothing is committed yet.

## 3. Decided (2026-10-20 morning)

All kept as chosen except: **#2** keep + visible **Delete** pill on draft rows (long-press still works) · **#6** new drafts start on **Original** · **#8** grid filler uses **only DayDump covers** (posted + story), no raw gallery photos; empty tiles otherwise. All three implemented.

### Original list

Reply with the number and "keep" or the alternative.

1. When does a dump become Posted? — chose: as soon as IG/TikTok (or the chooser) opens, no undo — reply 'keep' or 'add Undo posted'.
2. Emptying the Create basket — chose: delete the draft only if it was never edited in Edit — reply 'keep' or 'never delete, keep empty drafts'.
3. Dismissing the share-in sheet — chose: drop the shared photos, show a "Shared photos not added" toast — reply 'keep' or 'start a new draft with them'.
4. Deleted legacy files (App.tsx, index.ts, StoryCardsRow, StoryBuilder, CarouselViewer, CaptionStudio, SettingsModal, PaywallModal, PremiumStatusContext, gemmaService) — chose: delete — reply 'keep' or 'restore <file>' (all are still in git HEAD).
5. Tapping a Posted row in Library — chose: opens Preview (read-only; Reuse makes an editable copy) — reply 'keep' or 'open Edit like the mock'.
6. Default filter for a new draft — chose: Warm 35mm 68% — reply 'keep' or 'Original'.
7. "Today" story — chose: needs 3+ camera photos from today, title "Today" — reply 'keep' or a new minimum/title.
8. IG Profile Grid filler — chose: your Posted covers, then story covers, then raw recent photos (can show screenshots/ID cards) — reply 'keep' or 'never use raw recent photos'.
9. X+Y section takes space in Create — chose: Similar strip hides while it is open — reply 'keep' or 'move X+Y into a sheet'.
10. Suggested-photo badge — chose: ✧ icon (the ✨ emoji renders grey on the A54) — reply 'keep' or 'use ✨ emoji'.

## 4. Data the agents changed on your phone

All in DayDump only. Nothing was posted and nothing was saved to your gallery.

- **Fake "Shared to IG · Oct 20" item** ("Display windows"). A dev hook marked it Posted. Undo: Library, long-press it, "Remove from Library".
- **Reuse copy of it** ("Display windows (2)"), a test draft. Undo: long-press it, "Delete draft". After this test the Library had 2 drafts. The file does not name the other one, so check it before you delete it. It may be yours.
- **"Cat furnitures" draft was edited.** It is now Scrapbook + Border, 7 photos (one swapped, one added), per-photo Sunfade/B&W. Undo: change it back in Edit, or long-press, "Delete draft".
- **3 test JPGs (1080x1350)** from a dev export run, in the app cache only, not the gallery. Undo: nothing to do, or clear the app cache.
- **Stories marked seen:** the questions file does not record this. If Discover shows stories as seen that you did not open, tell Claude during the device pass.

## 5. Everything else

About 80 other calls are low-impact defaults (date formats, layout details, test setup). Read them only if you want to:
`/tmp/claude-1000/-home-ebk-dev-personal/50723673-872b-4b16-af58-ad95e1000765/scratchpad/design/morning-questions.md`

## Also
- Flow map (all 9 boards match the final code, v21): https://claude.ai/artifact/L8tBt7iswZqKERLMHTXfTc (private).
- P1's shuffle test marked 5 Discover stories as "seen". That's harmless: they rank lower for a while. No undo needed.
- Weekly quota used: 27% (limit you set: 50%).
