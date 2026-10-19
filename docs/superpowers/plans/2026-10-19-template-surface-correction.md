# Template surface correction implementation plan

Goal: readable quotations in all 18 existing identities without changing saved business or appearance data.

Architecture: keep TemplateRenderer and canonical v141 CSS. Make local brand/title surface ownership explicit. Validate actual raster backgrounds, including vector artwork, rather than substitute palette variables for painted pixels.

Baseline: main and production runtime both identify 304134f56f18723cbd8bb4c2c9fe49aa5e158c0e. PRs 811/812 reviewed. Build passed; 10 initial appearance contract tests passed. Browser raster diagnosis reproduces Split symbol-name white on white (1:1) and Obsidian bilingual symbol-name over cyan (2.27:1). Old QA substitutes art.main for the entire masthead and does not enumerate logo-name text descendants.

- [x] Reproduce failures before production edits using browser screenshots with text removed from the background sample.
- [ ] Add permanent pixel regression checking text-node ranges on each page, nested bilingual labels, and both logo and no-logo names. Keep existing checks.
- [ ] Separate brand ink from title ink in existing artwork palette; preserve continuation header paper ownership. Reserve safe decorative space where accent artwork crosses text.
- [ ] Replace inaccurate light semantic surface entries with actual canonical row fills; test boundary colors and preservation of stored settings.
- [ ] Run Chromium/WebKit, all languages, unsafe custom colors, sparse/dense documents, PDF output and node regressions. Review actual images.
- [ ] Review code and evidence, open one PR. No merge or deploy before approval.

Constraints: no accounting, persistence, schemas, permissions, AI or production data changes. No rescue stylesheet, duplicate renderer, or extra cascade layers. Any incomplete validation remains explicitly blocked.
