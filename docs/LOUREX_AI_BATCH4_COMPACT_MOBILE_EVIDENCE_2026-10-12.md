# LOUREX AI — Batch 4: Mobile supplier evidence, structured product rows and data density

## Purpose
Replace oversized, horizontally scrolling supplier/product information on narrow phones with clear, dense layouts **without modifying accounting data, user approvals, tool execution or deterministic calculations**. Visual theme remains black, charcoal, white and gray.

## Findings in the audited source
- `AiCommercialWorkspace` rendered supplier evidence exclusively as a wide table (`lxw-grid` with a 560–570px minimum width even on phones).
- `PricingGrid` likewise forced horizontally scrolling item lines on phones, including editing five properties.
- Generic workspace facts showed a stacked label/value presentation for every field; pickers showed technical IDs unconditionally.
- `QuotePreviewSummary` used compact font sizes in some document-review sections (10–12px), even when content was already readable in larger type.

## Changes
- **SupplierComparison** keeps the original native desktop table. Under 720px an alternate vertical list uses supplier name and exact unit cost/currency in the main line, quantity/unit/date underneath, and a disclosure with evidence reliability and full source text.
- **PricingGrid** retains its desktop table. Under 720px the existing page of 10 exact `doc.rows` records becomes compact mobile entries. Inputs invoke the **same** guarded cell command with `artifactId`, `revision`, `lineId`, field and value. No new write path is introduced.
- **RegisteredWorkspaceCard** now lays out compact key/value rows with labels and values in two columns, visible unknown value marks and readable >=14px detail text.
- **Product/CustomerPicker** shows technical IDs only for exact name collisions, preserving duplicate disambiguation with minimal vertical noise.
- Quote preview rows, terms and facts use denser spacing and more legible text. No new colors or global site CSS.

## Safety
- No amount is recalculated; `compareSuppliers` remains the source of supplier rows.
- No currencies are converted or combined. Missing values remain unknown with a dash, not zero.
- All mobile actions are the existing review-only or approval-gated functions. No automatic save/navigation from visual layout.
- Mobile and desktop DOM variants are mutually hidden with AI-only responsive CSS.
- Full provenance is available behind an accessible `details` / `summary` disclosure.

## Verification
- 4/4 isolated contract/source checks passed for preserved fields, callbacks, accessibility structure, CSS and screen-size branches.
- Full TypeScript compile, npm build, complete automated test suite, Playwright screenshot tests and authenticated iPhone Safari testing **not performed**; a live repo checkout is unavailable due to GitHub DNS errors.
- This is a stacked draft branch based on Batch 3 PR #711. Merge only after #711 and after resolving Batch 4 tests on the resulting main branch.

## Release acceptance checklist
1. Run `npm ci && npm run typecheck && npm run build` and all repository tests.
2. Verify real-device 320px, 375px, 390px and 430px widths on iPhone Safari; no horizontal bleed, overly tall empty cards, too-small text or hidden approvals.
3. Compare one supplier with multiple historical and external offers in different currencies/units. The desktop and mobile versions must show the exact same rows and values with no conversion or invented data.
4. Edit quantity and unit price on a review-only draft on mobile, reject and then approve through existing explicit review controls. Ensure no action fires from opening the list itself.
5. Check Arabic RTL and English LTR; visible focus, keyboard, screen readers, dynamic font scaling and reduced motion.
6. Review warnings for missing source, currency, price and supplier identity; do not present unavailable evidence as verified.
7. Ensure Batch 3 history and two-mode isolation remain intact.

**Status: implementation on branch, NO-GO until integrated QA. No production deployment or merge.**
