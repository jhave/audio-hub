# Implementation Plan: Phase B — Essay, FAQ, and Mobile Swipe Layout (July 11, 2026)

This plan details the step-by-step additions to the `/experience` explorer to embed the theoretical essay, a technical FAQ with simplified folds, interactive descriptors, and a responsive mobile swipe layout.

## Data Core Updates
- Instead of hardcoding text or loading complex pipelines, we will create `essay.md` and `faq.md` in the root of `2026-exp/`.
- `tools/build-dh.mjs` will read these files and bundle them directly as `"essay"` and `"faq"` markdown/text strings in `dh.json`.
- The Next.js app fetches `dh.json` at runtime, meaning edits to these markdown files will instantly reflect in the UI upon running `build-dh.mjs` and reloading the page.

## Steps & Git Commits

To ensure safety and rollback capability, we will execute the steps sequentially, committing after each step.

### Step 1: Create `essay.md` and `faq.md` + Update `build-dh.mjs`
- **Action**: Create `2026-exp/essay.md` (combining the theoretical undertones and the sentience diatribe) and `2026-exp/faq.md` (technical synopsis + "wtf?" progressive folds). Update `tools/build-dh.mjs` to read and bundle these files. Run the script to regenerate `dh.json`.
- **Commit**: `feat: add essay.md, faq.md and bundle them into dh.json`

### Step 2: Implement Desktop Essay Panel (Left Column)
- **Action**: Modify the `/experience` layout. Nudge the Canvas Map to the top-left on desktop. Add the scrollable essay text from `data.essay` underneath the map.
- **Commit**: `feat: add scrollable essay panel in left column under map`

### Step 3: Implement Desktop FAQ & Progressive Folds (Right Column)
- **Action**: Display the FAQ content from `data.faq` in the right column underneath the track details panel. Render headings, collapsible progressive folds ("wtf?"), and glossary lists.
- **Commit**: `feat: add technical FAQ with collapsible simplified explanation folds`

### Step 4: Add Tooltips & Interactive Auto-Scrolling to FAQ
- **Action**: Add hover tooltips to descriptors (tempo, key, journey, spread, novelty). Make these descriptor labels clickable; clicking them will auto-scroll the FAQ section to their respective explanation (cycling matches on repeated clicks).
- **Commit**: `feat: add interactive tooltips and descriptor auto-scrolling to FAQ`

### Step 5: Implement Mobile Swipe Layout
- **Action**: Implement swipe gestures (touch handlers) on mobile to switch in a loop between three views: **Map/Essay**, **Listen/Player**, and **FAQ**, while keeping the transport playbar permanently visible at the bottom.
- **Commit**: `feat: implement mobile tab swipe loop layout with persistent player`

---

## Verification Plan

### Manual Verification
- Test scrollable-on-hover behavior of the left essay column on desktop.
- Verify that clicking descriptor chips (like `SPREAD`) in the right column scrolls the FAQ area to the correct definition.
- Verify the toggle/fold behavior of the technical details.
- Emulate mobile screen sizes and test the swipe gesture loops to switch views while checking that the bottom playbar stays active.
