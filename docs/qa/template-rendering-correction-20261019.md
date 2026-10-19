# LOUREX quotation rendering correction — engineering evidence

Status: visual acceptance in progress. Not merged or deployed. This document must not be read as final acceptance until its matrix is completed.

## Baseline and ownership

Main at investigation start and the production `runtime-config.js` both identify `304134f56f18723cbd8bb4c2c9fe49aa5e158c0e` (PR #812). PR #811 introduced the shared vector artwork/current canonical v141 owner; #812 added symbol-name classification/contours and expanded synthetic QA. The active app bundles v141 with application styles, then promotes the standalone Draft/UI owners. Preview, print portal and secure share use the existing TemplateRenderer; exported PDFs clone that paginated DOM through the existing output bridge.

Stored appearance -> `resolvedAppearanceTokens` -> Page inline semantic tokens -> canonical v141 surfaces/artwork -> preview/print/share. The output bridge waits for fonts/images/pagination, clones the same pages, prepares artwork derivatives and rasterizes them; it does not save or migrate the source document.

## Confirmed root causes

| Defect | Source and evidence | Correction |
| --- | --- | --- |
| App theme repaints quotation tables | `hostinger-inspired-v353.css` applies important workspace foreground/border/header declarations to every table beneath `.app-ui`. A dark UI yielded pale table ink on white document paper. The old fixture omitted `.app-ui`. | Exclude `.items-table` at the workspace rule source; no compensating important document rules. Exercise both UI themes and actual mobile/tablet viewports. |
| Split company name disappears | One masthead `art.ink` is white, although the SVG paints only the title side dark. Symbol/name text on the unpainted brand side measured 1:1. | Explicit independent brand ink in existing art palette and renderer; continuation brand ink follows its own page. |
| Obsidian name crosses cyan | The diagonal accent ran through white Arabic company-name glyphs (about 2.27:1). | Reserve the outer margin for those accent strokes; keep the existing dark facets and cyan identity. |
| Body guards disagree with rendered rows | A separately maintained light-surface list differed from canonical alternating-row CSS, including Minimal using white instead of #f5f6f8. | Emit the actual row surface from appearance resolution into canonical CSS; remove 17 template-specific duplicate row fill declarations. Unsafe #767676 ink on Minimal now falls back while the input object stays byte-for-byte unchanged. |
| Selected Latin title font ignored | Several canonical title rules forced Georgia, overriding the saved family selection. | Honor the existing resolved font variable, preserving saved font/size controls. |
| SVG logo clipped in actual PDF | Original browser wordmark was complete, but html2canvas rendered a viewBox-only SVG as a mostly blank rectangle. | Convert SVG artwork only in the output clone through the existing native PNG preparation. |
| Dark-logo contour missing from PDF | html2canvas did not reproduce CSS drop-shadow contours. The exported dark symbol blended into dark paper. | Prepare the same restrained contour in clone image pixels, including sequential shadow behavior; preserve original artwork colors and stored bytes. |
| Stamp/signature aspect ratio changes in PDF | Sharp overlays used full element boxes despite object-fit:contain. A circular stamp became noncircular. A behavioral test failed the original implementation. | Embed the contained artwork rectangle with its authored center/bottom alignment. |
| Long footer copy becomes white on white | Stretching footer vector geometry with multi-line copy moves the safe lower band below the first lines. Cobalt long-footer fixture reproduced 1:1 and ~2.86:1 failures. | Fix the decorative footer art to 20mm and continue the paired footer paper below it, with copy starting inside the safe band. |

## Why previous tests missed these failures

The previous contrast helper substituted `--art-main` for the entire painted masthead, sampled selected parent roles rather than every nested word, and omitted the real application ancestor. Its browser/native-print checks did not validate original ink or artwork in the actual html2canvas/jsPDF export. Passing builds and regular-expression source contracts could not expose these differences.

## New acceptance method

- Preserve existing layout, item order, totals count and overflow checks.
- Inspect each word's real text range, including nested bilingual content, company names and continuation/footer labels.
- Capture a text-free raster background and diagnostic glyph mask. Use glyph locations to sample the actual SVG/gradient/alpha-composited local surface; normal ink must clear 4.5:1 and qualifying large text 3:1.
- Inspect original exported PDF glyphs against browser reference glyphs separately, accounting for antialias/JPEG pixel phase. This is a missing/washed-out ink guard, not a substitute for the AA paired-ink check.
- Reject empty glyph coverage. Compare exported logo/stamp/signature/QR pixels to browser artwork with small raster-position tolerance.
- Export with the real output bridge and rasterize every PDF page using Poppler at physical A4 size. Record geometry and page count.
- Negative control: erase the company name only in the PDF export clone. The audit rejected each erased word at 1:1 while the unchanged browser reference remained about 16.23:1. This proves an export-only loss is detected.

## Protection and limitations

No financial calculations, adjustments, records, authentication, permissions, numbering, persistence/autosave, AI logic or database schemas are changed. All browser fixtures and banking/customer values are synthetic. No production account was written to.

Wordmark-versus-symbol classification still has an intrinsic aspect-ratio heuristic for images without semantic metadata. Arbitrary raster images cannot reliably reveal whether their pixels contain a company name; no OCR or stored-artwork alteration is introduced. Actual uploaded assets and physical printer/device behavior require separate real-asset acceptance; synthetic coverage must not be described as proof for every possible upload.

## Final results

This is a draft engineering delivery, **not acceptance or authorization to merge**.

| Gate | Observed result |
| --- | --- |
| Production baseline | Runtime reports 304134f56f18723cbd8bb4c2c9fe49aa5e158c0e |
| TypeScript and production build | Passed after the final surface/bridge changes |
| Full Node regression suite | 3,142 passed, zero failures before the final footer overlap/contour adjustment |
| Focused rendering contracts after final changes | 112 passed, zero failures |
| Cobalt long-footer actual browser pixels | Passed; minimum sampled contrast 6.338:1, 83,191 glyph-position samples, no failures |
| Export-only erased-text negative control | Correctly rejected invisible PDF words |
| Obsidian symbol actual exported PDF | BLOCKED: artwork comparison reports 2.9136% materially different pixels, above the 2.5% threshold; two A4 pages exported |
| All-template Chromium/WebKit/PDF matrix | Incomplete; earlier diagnostic runs are superseded, not final acceptance |
| Native iPhone/iPad and physical printer | Not tested; WebKit/viewport coverage is not a real-device claim |
| Secure shared production document | Not end-to-end certified |

Every template below remains pending final acceptance. A source correction or a partial diagnostic pass is not a release result.

| Template | Final acceptance |
| --- | --- |
| Executive | Pending complete matrix |
| Minimal | Pending; unsafe gray/row regression covered |
| Trade | Pending complete matrix |
| Signature | Pending complete matrix |
| Obsidian | Blocked on PDF artwork difference plus complete matrix |
| Cobalt | Pending; adversarial long-footer browser case passed |
| Editorial | Pending complete matrix |
| Split | Pending; local brand surface regression corrected |
| Prism | Pending complete matrix |
| Slate | Pending complete matrix |
| Horizon | Pending complete matrix |
| Mono | Pending complete matrix |
| Aurora | Pending complete matrix |
| Ledger | Pending complete matrix |
| Noir | Pending complete matrix |
| Midnight | Pending complete matrix |
| Black Ivory | Pending complete matrix |
| Carbon | Pending complete matrix |

## Exact production files changed

- `src/styles/hostinger-inspired-v353.css`
- `src/styles/document-premium-redesign-v141.css`
- `src/lib/appearance.ts`
- `src/templates/TemplateArtwork.tsx`
- `src/templates/TemplateRenderer.tsx`
- `src/components/DocumentDesignControls.tsx`
- `public/ios-print-bridge.js`

Other changes are isolated synthetic QA, CI and documentation. No merge or deployment has been performed. The remaining PDF artwork defect and incomplete acceptance matrix block readiness.
