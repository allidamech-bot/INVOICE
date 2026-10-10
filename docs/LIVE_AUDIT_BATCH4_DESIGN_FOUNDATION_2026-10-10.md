# Live audit Batch 4A — design foundation and PDF source context

Repository: allidamech-bot/INVOICE. Base: Batch 3 commit 3a2cfc49bbbea4a00735da06d42728e1bff8aff9 (draft PR #685). This is a stacked candidate, not an independent patch against main.

**Status: code-verified foundation only. Batch 4 is NOT visually closed.** The planned before/after screenshots, computed-style inventory and actual preview/export PDF comparison remain outstanding.

## Reproduced code findings

| Finding | Before | Candidate repair |
|---|---|---|
| DS-001: secondary text contrast | Light muted #6c819b measured 3.51:1 on the input canvas; light faint #8da0b7 measured 2.35:1 there; dark faint measured 3.00:1 on elevated surface | Preserve six existing surfaces; adjust muted/faint ink only. Tested normal-text ratios now exceed 4.5:1 on those solid token backgrounds |
| DS-001: primary button label contrast | White on gradient endpoints #619dff / #3975e8 measured 2.70:1 / 4.30:1 | Dedicated filled-action tokens #315fad / #244d91 with white ink, distinct from interactive/accent tokens; endpoints exceed 4.5:1 |
| Duplicate editor action owner | Source stylesheet and appended build guard separately fixed the same blue | Both consume the shared filled-action token, preserving the approved editor blue |
| Boot canvas delta | Boot/runtime/manifest used #0D0D0D and #f4f7fb while the final visible owner used #0a1826 and #f3f7fc | Align source HTML, bootstrap, runtime theme sync, presentation guard, document entry, startup stylesheet, manifest and existing finalizer with the current visible canvas. No workspace surface recoloring |
| Boot observer stale theme | Its cleanup reapplied the preference captured before authentication, even if runtime changed the theme meanwhile | Cleanup uses current root theme. Executed dark-to-light race now retains light color scheme, background and browser meta |
| PDF parent-context loss | Clone stage directly held articles but lacked invoice-pages, dropping direct-child and first/continued-page CSS contracts used in canonical pagination | Stage preserves invoice-pages and page order. Existing A4 sizing, direction stabilization, sanitization, searchable text and native artwork paths retained |
| Build drift | A successful build did not check final canvas agreement or clone parent | Existing v485/v580 build owners now verify emitted canvas contracts, manifest, four Arabic font assets and PDF clone parent; no reordered or shortened build chain |

The PDF parent loss is a confirmed source-context defect. It is **not a proven sole explanation for A20's historical navy-preview/gold-PDF header difference**; that finding remains open until the same snapshot is compared in a real browser and exported PDF.

## Measured token contrast

WCAG luminance calculation over each of six declared opaque workspace surfaces; minimum ratio shown. This is not a computed-style capture or a site-wide accessibility certificate.

| Ink role | Light minimum | Dark minimum |
|---|---:|---:|
| Primary text | 13.749:1 | 10.055:1 |
| Secondary text | 6.447:1 | 7.277:1 |
| Muted text | 5.110:1 | 4.583:1 |
| Faint text | 4.721:1 | 4.583:1 |

Primary action white/#315fad: 6.23:1. Gradient endpoint measurements do not certify every pixel/composited state. Interactive links, workspace tone accents, chart labels, disabled opacity, gradients, images, focus indicators and status-color combinations are not certified by these token tests.

## Typography and preservation

Six metadata declarations now consume the existing caption/body tokens; resolved sizes remain 12px/14px. The Arabic Tajawal family, its existing weights and document-paper exclusions remain unchanged. Build verification checks Regular/Medium/Bold/ExtraBold font assets exist. This does not prove browser font loading, shaping, line wrapping or spacing; no new font/package or global typography redesign.

Dashboard layout, cards, KPI composition, navigation, business calculations, saved appearance data, document template identities, scale, signature/stamp assets and print geometry are not replaced. No new CSS owner or runtime subsystem was introduced.

## PR #676 / #682 design-owner comparison

Compared the actual source trees 88f2ffbf683970c987879eefd41eccfbdb98d7f3 and ba9077021affd7c1b8b3ef4d8f3ebe719a8edb86 for both deferred v485 files.

- #682 replaces fixed editor blue with ft-accent. That is useful semantic direction, but ft-accent is an interactive ink token, not necessarily a safe white-label button background: the current dark ink accent #72a4ff is too light for white normal text. Adopt a dedicated action token instead, preserving #676's approved editor blue.
- #682 drops the explicit neutral non-primary Documents header action treatment. Retain #676's bounded neutral surface rule; no measured evidence justifies deleting it.
- #682 changes an earlier editor fallback and its comment to teal/light-blue semantics. Preserve the later final owner and don't resurrect a competing visual identity.

Neither branch was assumed best globally. No PR #676/#682 ref was changed.

## Verification and limitations

- TypeScript and full production build pass.
- Full suite after final build: **2,259 passed / 0 failed / 0 skipped / 0 cancelled** (14 additional cases over Batch 3).
- All earlier tests retained. Historical boot assertions now target the current final visible palette rather than a superseded v346 palette. Editor assertions protect semantic resolution with the same approved-blue fallback. No tests removed or skipped.
- Actual bootstrap/runtime functions execute in VM fixtures for explicit light/dark, system preference, blocked storage and a theme change during loading.
- Actual async PDF builder executes against three synthetic, already-paginated pages per EN/AR/bilingual case. PDF library/canvas are mocked: these tests verify page ordering, wrapper context, source immutability and single-flight caching, NOT real PDF validity, measured pagination, Arabic shaping, selectable text or rendered totals/footer/artwork.
- git diff --check passes. No deployment, merge, production-data mutation, Replit or physical-device test.

Local Playwright exists in the supplied runtime, but Chromium executables are absent. No browser package was installed and no new candidate deployment was created. No new screenshot or real candidate PDF is presented as proof.

## Remaining Batch 4 acceptance work

1. Capture candidate desktop EN/AR Light/Dark screenshots and computed owners for canvas/surface/card/overlay, text, controls and states.
2. Measure effective contrast including compositing, disabled/loading/error/success, interactive ink and charts; apply only demonstrated corrections.
3. Compare navy-preview/gold-export A20 on an identical snapshot, inspect the generated PDF, and document the actual cause rather than inferring closure from the wrapper fix.
4. Render synthetic short/long EN/AR/bilingual documents with totals, footer, logo, signature, stamp and page numbering; verify geometry, selection and extraction on actual output.
5. Continue bounded typography/spacing owner consolidation only after visual evidence; do not revive rejected designs or delete print/editor rules wholesale.

These are acceptance tasks, not completed checks. Batch 4 remains pending visual verification; later organization and workflow batches are separate.
