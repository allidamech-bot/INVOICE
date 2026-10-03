# Product / UX audit — batch 1 baseline

Baseline: main `10999686` (PR #491). No open PRs were returned at the start of this inspection.

## Scope and evidence

This is an initial source inspection of the application shell, shared modal,
application initialization, and CSS build ownership. It is not a production visual
audit or a completed accounting/AI audit. Device behavior still needs browser
verification. Findings below distinguish confirmed code behavior from follow-up
risks.

## Confirmed defect fixed

`src/components/UI.tsx`, `ModalFrame.syncVisualViewport`: mobile overlays imposed
a 240px minimum even when `visualViewport.height` was smaller. With a landscape
keyboard leaving 190px, the backdrop was 240px high and extended 50px below the
visible viewport. Its geometry now follows the visible height, retaining the
existing offset, scroll listeners and desktop cleanup.

A focused behavioral test executes the transpiled component method with a
190px keyboard viewport, keyboard dismissal, desktop rotation and the fallback
without VisualViewport. This verifies generated geometry, not rendered device
layout. No new dependency was introduced.

## Visual ownership inventory

- 237 source CSS files; these are not all necessarily active in production.
- 70 direct local stylesheet links in `index.html`; additional build/runtime
  ownership must be traced before proposing removals.
- 36,047 `!important` occurrences across source styles. This is an inventory
  count, not evidence that every declaration affects the live cascade.
- `scripts/build.mjs` already retires some historical layers and enforces a final
  reliability bridge. Later build scripts add more visual bundles.

The next visual pass must map computed styles to active owners before changing
surface colors or geometry. The inventory alone does not justify another
foundation rewrite or deleting historical CSS.

## Follow-up order

1. Render shared dialogs and More/Create overlays in Arabic and English at phone,
   tablet and desktop widths; verify scrolling, footer reachability, keyboard and
   focus return. Inspect nested-overlay event ownership.
2. Trace active surface/background owners on Home, Documents and the editor;
   correct verified contrast and hierarchy defects in existing owners.
3. Exercise document create/edit/save/reopen and accounting validation with
   focused checks for actual defects.
4. Exercise AI attachment, voice repeat recording, proposal review and approval.

Preserve repository isolation and feature-branch delivery. Run checks tied to
changed behavior; avoid repeating unrelated historical suites.
