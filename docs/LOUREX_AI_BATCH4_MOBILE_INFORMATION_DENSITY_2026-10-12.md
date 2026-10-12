# LOUREX AI — Batch 4: mobile information density and supplier evidence

Scope: AI-only comparative data presentation and styling. No edits to supplier, product, invoice or financial records.

## Root cause
The AI's generic `CardRows` component renders different business fact types through the same definition-list structure. The supplier comparison uses a desktop-oriented five-column table with a 570px minimum width and 12px text, which can force horizontal reading on an iPhone. Shrinking everything further would make the text less accessible.

## Changes
1. Keep the full desktop/tablet five-column supplier-evidence table; on screens <=720px show each offer as a compact two-line row with the supplier name, unit cost/currency, quantity/unit and date.
2. Preserve `reliability` and `source` evidence inside an expandable `details` element per mobile offer. Do not invent missing currencies, totals, source reliability or available suppliers.
3. Preserve identical pagination (20 results/page) and exact `compareSuppliers` logic on mobile/desktop.
4. Change generic AI business fact rows to a dense two-column definition grid with 13px labels and 14px values. Improve 13px table reading size while retaining horizontal scroll for editable, truly wide document grids.
5. Keep all new selectors scoped to `#lourex-ai-panel[data-lourex-workspace='2']`. No global site UI changes.

## Verification and acceptance
- Source-level layout contracts: **4/4 passed**. This is not a browser or screenshot test.
- **Not run**: npm TypeScript/build/full tests; Safari/Chromium responsive QA with actual suppliers and dense evidence; user interactions at 320/390/430/820/900/1024 widths.
- Check that mobile source expansion is keyboard/touch accessible; no clipped price, label overlap, missing source, or horizontal page scroll. Confirm table/full details remain accessible on desktop, and Arabic/English directionality is correct.
- Product-import reviews, customer/supplier capture forms, full palette redesign, typography audit and all other AI tools still need their separate end-to-end component-density review. Do not infer those are complete.
- Keep Draft / NO-GO until tested. No deployment, merge, purchase or financial mutation.
