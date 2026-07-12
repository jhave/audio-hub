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
  - Persists the dismissed state in browser `sessionStorage` to avoid intrusive reload prompts within the same session.

## Commits & Backups
All steps were staged, compiled, verified to build without errors, committed, and pushed to the github remote repository after each step:
1. `6c40fa5` — `feat: add essay.md, faq.md and bundle them into dh.json`
2. `20d6853` — `feat: add scrollable essay panel in left column under map`
3. `43e6aa7` — `feat: add technical FAQ with collapsible simplified explanation folds`
4. `183798c` — `feat: add interactive tooltips and descriptor auto-scrolling to FAQ`
5. `b872aab` — `feat: implement mobile tab swipe loop layout with persistent player`
6. `e9c79f6` — `feat: make track data sticky in right column, scroll FAQ separately, and fold style prompt`
7. `0e5dc63` — `feat: add fading 171 Days intro screen overlay`
