# Walkthrough: Phase B UI Enhancements (July 11, 2026 at 20:47)

This document records the completion of Phase B UI enhancements and interactions on the `/experience` archive viewer.

## Tasks Completed

- [x] **Step 1: Text Asset Foundation**
  - Created [essay.md](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/essay.md) at the root containing the theoretical undertones and the sentience/parameter-nudging diatribe.
  - Created [faq.md](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/faq.md) at the root containing the technical synopsis and glossary.
  - Updated `tools/build-dh.mjs` to bundle these markdown files directly into the compiled `dh.json` to prevent extraneous build pipelines.
  - Regenerated `dh.json` with the bundled text.
- [x] **Step 2: Desktop Essay Panel**
  - Created [DHEssay.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHEssay.tsx) custom Markdown renderer.
  - Nudged the Canvas Map to the top-left section (270px height) and nested the scrollable-on-hover essay panel underneath it.
- [x] **Step 3: Desktop FAQ & Folds**
  - Created [DHFAQ.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHFAQ.tsx) custom Glossary/FAQ parser.
  - Formatted the synopsis to start with the dense technical phrase "contrastive language-audio pretraining (CLAP) embeddings" and supported collapsible progressive detail folds ("wtf?").
  - Nested the FAQ panel below the track details in the right-hand sidebar.
- [x] **Step 4: Interactive Auto-Scrolling & Tooltips**
  - Added native description tooltips to all metric cards and chips in [DHData.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHData.tsx).
  - Extended the UI to render `bounce` and `complexity` cards.
  - Implemented `handleMetricClick` in [ExperienceClient.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/ExperienceClient.tsx): clicking a metric (like `SPREAD` or `JOURNEY`) scrolls the right sidebar to its FAQ glossary definition, flashing the match in yellow for visual feedback. Repeated clicks cycle through occurrences of the term.
- [x] **Step 5: Mobile Swipe tab loop**
  - Integrated Touch gesture handlers (`onTouchStart`, `onTouchEnd`) on the main container.
  - Swiping horizontally on mobile loops the active screen between three view tabs: **Map & Theory** (Left sidebar), **Player** (Center list), and **FAQ & Data** (Right sidebar).
  - Kept the floating bottom `Dock` playbar persistent across all views.
  - Added a responsive tab bar header for mobile navigation.
- [x] **Step 6: Sticky Right Column & Folded Style Prompt**
  - Restructured the right sidebar so the selected track details stay fixed at the top (with a scrollable fallback on short screens) and the FAQ scrolls separately beneath it.
  - Placed the Suno style prompt into a collapsible `<details>` / `<summary>` block to preserve vertical space for the FAQ.
  - Updated the scrolling offset calculation to target the new separate FAQ scroll container.
- [x] **Step 7: Fading Intro Screen Overlay**
  - Implemented a clean, full-screen white entry portal.
  - Features the title **171 Days**, the requested synopsis *"Machine learning applied to a single person's generative music archive"*, and an *"Enter the Field"* button.
  - Fades out smoothly on dismissal (`opacity-0 pointer-events-none`) with a 500ms CSS transition.
- [x] **Step 8: Auto-play on entry**
  - Configured the "Enter the Field" button callback to automatically initiate playback of the first track (`playIdx(0)`) when the overlay is dismissed.
- [x] **Step 9: Page Refresh Reset & Label Removal**
  - Configured the intro screen to display on every page refresh (removed `sessionStorage` persistence checks).
  - Removed the hover track title label tooltip overlay drawn in the top-left corner of the UMAP map.
- [x] **Step 10: Intro Screen Branding & Interactive Glossary play buttons**
  - Placed the **glia.ca logo** (linked from public `/img/glia-bw.png`) centered at the top of the intro page.
  - Added project credits (*"Music: Suno 5.5 · Human: Jhave · Data-science: Fable 5 · Gemini 3.5 Flash"*) just above the entry button.
  - Implemented dynamic highest/lowest track lookup inside [DHFAQ.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHFAQ.tsx). Under each major numeric metric section (Spread, Journey, Novelty, Tempo, Bounce, Complexity), rendered two interactive play buttons to immediately play the track with the highest/lowest values, showing the track titles dynamically in their labels.
- [x] **Step 11: Intro Page Design Refinement**
  - Made the glia logo **2x larger** (`h-14`) and centered it inside the main vertical column content box to sit closer to the title.
  - Moved the date range subtitle (*"January 18 to July 11, 2026"*) to sit directly beneath the title.
  - Set the subtext font size to be **30% larger** (`text-[18px]`), made it fully selectable (`select-text`), and updated the copy: *"Machine learning applied to analyze a 31 hour corpus of AI generated music made by a single artist in the first 6 months of 2026"*.
  - Updated the button label to read *"Explore the Experience"*.
- [x] **Step 12: Intro Page Spacing & Subtitle Width adjustment**
  - Widened the subtitle container to `max-w-3xl` so that the entire text fits cleanly on exactly 2 lines.
  - Reduced the vertical margins and paddings by 50% between the subtitle paragraph, project credits divider, and active CTA button to tighten the vertical structure.
- [x] **Step 13: Subtext Simplification**
  - Simplified the subtext copy to read: *"Machine learning applied to analyze a 31 hour corpus of AI generated music"*.
- [x] **Step 14: Novelty Format & Precision adjustment**
  - Updated the frontend UI metric card inside [DHData.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHData.tsx) to format `novelty` as a discrete integer (whole number) instead of using a decimal float display.
- [x] **Step 15: Tempo granularity, technical FAQ additions, and 30s reset timers**
  - Mapped `tempoJumps` from descriptors data inside [build-dh.mjs](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/build-dh.mjs) and rebuilt the `dh.json` asset bundle.
  - Added new descriptor metadata chips for `tempoDrift` (e.g. `±X bpm drift`) and `tempoJumps` (e.g. `Y tempo jumps`) in the sidebar details panel [DHData.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHData.tsx) to reveal tracking instabilities or tempo shifts.
  - Refined technical details inside [faq.md](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/faq.md) glossary, describing onset autocorrelation anomalies, tempo drift, and jumps estimation.
  - Implemented a 30-seconds inactivity timeout for each metric word cycle in [ExperienceClient.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/ExperienceClient.tsx). If a metric button has not been pressed for 30s, the scroll cycle resets to target the section header first on the next interaction.
- [x] **Step 16: Technical Specification Fold in FAQ**
  - Added a comprehensive collapsible `<details>` / `<summary>` fold inside [faq.md](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/faq.md) outlining the entire pipeline: audio downsampling, 512-D CLAP extraction, UMAP mapping, 3D trajectory PCA projection, and Librosa analysis metrics.
  - Added explicit technical explanation of the **"Sousaphone" Effect** (why sub-bass matching frequency profiles trigger false-positive tags) and **Tempo Estimation Limits** (spectral autocorrelation doubling/halving octave errors on syncopated/arpeggiated beats).
- [x] **Step 17: Interactive Tempo Drift & Jumps scroll routing**
  - Configured highlight text parser in [DHFAQ.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHFAQ.tsx) to match multi-word terms (`"tempo drift"` and `"tempo jumps"`) and associate them with their respective hyphenated attributes.
  - Re-routed click handlers for `tempoDrift` (bpm drift) and `tempoJumps` badges in [DHData.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHData.tsx) to target `"tempo-drift"` and `"tempo-jumps"` text blocks directly in the FAQ instead of generic `"tempo"`.
- [x] **Step 18: Intro Subtitle Copy update**
  - Updated the intro screen description text to read: *"Machine learning analysis of a 31 hour corpus of AI generated music in a playable interface."*
- [x] **Step 19: Metric Renamed from Novelty to Shifts**
  - Renamed all frontend text labels, tooltips, and click scroll handlers for the metric from **Novelty** to **Shifts** in [DHData.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHData.tsx) and [DHFAQ.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/DHFAQ.tsx).
  - Updated [faq.md](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/faq.md) glossary heading to `SHIFTS (formerly Novelty)` and added a detailed technical note explaining why count-based novelty fails to capture aesthetic originality and instead reflects transition density.
  - Drafted a new [outlier-plan.md](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/outlier-plan.md) mapping out scikit-learn Local Outlier Factor (LOF) and Mahalanobis algorithms to compute anomaly indexes.
- [x] **Step 20: CLAP Class Bias Removal (Tag Normalization)**
  - Coded a diagnostic script [diag-tags.mjs](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/diag-tags.mjs) showing that probes like `violin`, `dub reggae`, and `sousaphone/brass` had disproportionately high raw global baseline averages (above 2.1) while tags like `acoustic guitar` scored below 0.7.
  - Mitigated global class bias in [build-dh.mjs](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/build-dh.mjs) by precalculating the global baseline mean for all 76 probes and subtracting the mean from scores during sorting in the `topTags` function. This ensures top-rendered tags are *distinctive* deviations from the dataset average, successfully removing irrelevant tags (like `"sousaphone/brass"`) from tracks (like `Beloved One Miss you Issue.`).
- [x] **Step 21: Added Subjective Taste Quote to Intro Screen**
  - Updated the subtitle text on the entry overlay page in [ExperienceClient.tsx](file:///Users/jhave/VIBE_Coding/audio-hub/2026-site/src/app/experience/ExperienceClient.tsx) to append the quote block: *"“It is a mild comfort to realize that basic datascience cannot discern beauty, identify novelty, know banality, etc. Subjective taste remains elusive.”"* in a subtle italic font.

## Commits & Backups
All steps were staged, compiled, verified to build without errors, committed, and pushed to the github remote repository after each step:
1. `6c40fa5` — `feat: add essay.md, faq.md and bundle them into dh.json`
2. `20d6853` — `feat: add scrollable essay panel in left column under map`
3. `43e6aa7` — `feat: add technical FAQ with collapsible simplified explanation folds`
4. `183798c` — `feat: add interactive tooltips and descriptor auto-scrolling to FAQ`
5. `b872aab` — `feat: implement mobile tab swipe loop layout with persistent player`
6. `e9c79f6` — `feat: make track data sticky in right column, scroll FAQ separately, and fold style prompt`
7. `0e5dc63` — `feat: add fading 171 Days intro screen overlay`
8. `845e885` — `feat: auto-play first track on entering archive from intro screen`
9. `f35e558` — `feat: show intro screen on every refresh and remove hovered map track label`
10. `d0a4bb6` — `feat: add glia logo and credits to intro, and add highest/lowest play buttons to FAQ glossary`
11. `ef86d98` — `feat: design updates to intro overlay screen`
12. `33bbcb4` — `feat: widen subtext and reduce spacing in experience entry page`
13. `98d690b` — `feat: simplify subtext on intro overlay page`
14. `ac682dc` — `style: remove horizontal separator line under subtitle`
15. `09cf162` — `feat: render novelty as integer rather than float`
16. `ec3ab3b` — `feat: show tempoDrift/tempoJumps chips, add 30s scroll reset timeout, update FAQ tech details`
17. `29168d8` — `feat: add technical specifications fold to FAQ describing pipeline, CLAP matching, and tempo doubling limits`
18. `0950d13` — `feat: redirect tempo drift/jump clicks to exact FAQ terms`
19. `aadf702` — `feat: update subtitle copy on entry screen`
20. `feb8bd2` — `feat: rename novelty to shifts in UI/FAQ, add naming critique, and draft outlier-plan.md`
21. `281a38b` — `feat: apply mean-centering to CLAP tag scores to remove global class bias (e.g. sousaphone)`
22. `abf6091` — `feat: add subjective taste quote to intro screen subtitle`
