# PicDump — Brief

Drafted 2026-10-29 from the repo (README, monetization spec, WORTH_REVIEW) and a store sweep the same day. The go / kill decision is not made; see the end.

## Problem
People post "photo dumps" (a casual carousel of 4 to 20 photos from a day, trip or week) but the work is in the camera roll: thousands of photos, mostly screenshots, receipts and near-duplicates, and the good shots are buried. Today they scroll the gallery by hand, pick photos, then open a collage or carousel app to arrange them. Collage apps start from a blank canvas and do not find the photos; cleaner apps delete photos but do not make anything. Nobody does "find the dump-worthy photos in my roll and lay them out".

## Target user
Phone users in their teens to thirties who post to Instagram or TikTok, have a big, unsorted camera roll, and do not want to upload their photos anywhere. Android first (the on-device index only exists on Android today); iOS planned.

## Why now
- On-device image-text models (TinyCLIP via ONNX Runtime, `modules/clip-embedder`) run on a phone, so the index, story suggestions and search work offline and nothing leaves the device.
- Instagram carousels now take up to 20 items and per-slide captions (June 2026), which makes the dump the normal post format.
- Privacy-first is a real selling point against cloud "AI memories" and cleaner apps with heavy ads.

## Competitors
Store data pulled 2026-10-29. App Store figures come from the iTunes Search API (US). Play figures are the rating only, from the listing page; Play install counts and update dates were not retrievable.

| App | Store | Rating (count) | Price | Last update | Gap from reviews |
|---|---|---|---|---|---|
| SCRL: Photo Collage Maker | iOS, Play (4.7) | 4.8 (126,589) | Free + subscription | 2026-10-27 | Billing complaints (trial charge with no reminder, hard to cancel); free plan cut in half; export to Instagram failing. Starts from a blank canvas, does not find photos. |
| Crsel: Carousel, Collage Maker | iOS | 4.8 (6,507) | Free | 2026-10-28 | Manual photo picking. New, little review data. |
| Carousel Post Collage SwipeMix | iOS | 4.8 (5,988) | Free | 2026-09-03 | Manual photo picking. |
| Collageable | iOS | 4.8 (512,285) | Free | 2026-10-26 | Generic collage; no curation. |
| PicCollage | iOS | 4.8 (1,847,336) | Free | 2026-10-29 | Generic collage; no curation. |
| Weekly: Photo Dumps / Lately - Photo Dump Generator / Dumpy | iOS | 0 to 4.7 (0 to 3 ratings) | Free | 2026-09 to 2026-10 | Direct concept competitors, brand new, almost no users yet. Worth watching. |
| Swipewipe: Photo Cleaner | iOS, Play (4.6) | 4.7 (99,814) | Free + subscription | 2026-10-19 | Full-screen ads after about 10 photos; 8-hour timers; trial/cancel billing complaints. Deletes only, makes nothing. |
| Slidebox: Photo Cleaner | iOS, Play (4.5) | 4.8 (16,680) | Paid | 2026-09-22 | Lost sorted work after glitches; restore purchase failing; one-time purchase charged again on big updates. |
| Cleanup: Phone Storage Cleaner | iOS | 4.7 (748,917) | Free + subscription | 2026-10-27 | Storage-focused; no creation side. |

Reading: the collage/carousel side is crowded and well rated, but none start from your roll. The cleaner side is crowded and the 1 to 3 star reviews are almost all ads and billing. The "auto-curated dump" gap is only touched by a handful of new apps with near-zero ratings.

## Keywords
Competition is my estimate from the top 10 US App Store results for each term, not store keyword-tool data. Play not sampled.

| Keyword | Competition (low/med/high) | Used in competitor titles? |
|---|---|---|
| photo dump | med | Yes: Dumpy, Lately, Weekly, glimpse; SCRL ranks first |
| photo dump maker | low | Few |
| photo dump generator | low | Yes: Lately |
| carousel maker | high | Yes: Crsel, SwipeMix |
| instagram carousel | high | Yes |
| photo collage | high | Yes: nearly all |
| photo recap | med | A few small apps; SCRL ranks first |
| year in photos | med | Few |
| photo cleaner | high | Yes: Swipewipe, Slidebox, Photo Cleaner |
| swipe to delete photos | high | Few titles, strong cleaners rank |

Suggested lead terms: "photo dump", "photo dump maker", "photo recap". Avoid leading on "collage" or "cleaner".

## Monetization hypothesis
Individual users pay for the curation, not for export. Free shows every suggested dump's title plus the recaps and one unlocked dump a week; Pro (RevenueCat subscription, entitlement `daydump_pro`) unlocks every dump, natural-language search, premium film looks and textures, Tidy's Move to Trash, 4 to 20 photos per dump, and removes the end slide. Plans, prices and trial lengths come from the store offering, not the code. Rationale and figures (hard paywalls convert better than freemium; weekly plans dominate the category) are in `docs/superpowers/specs/2026-10-28-monetization-design.md`. This is a guess until there are real purchases: no sandbox purchase test has run on either platform yet (see APP_STATE.md hold list). The competitor reviews say to avoid ad walls, hidden trial charges and re-charging a one-time purchase, which this model does not do.

## Decision
- **Go / kill:** Go
- **Date:** 2026-10-29
- **Owner:** Kerem Bayramoglu
