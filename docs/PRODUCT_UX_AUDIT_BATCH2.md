# Batch 2 — controlled design ownership consolidation

Baseline: merged Batch 1, main `a2d8d9e42b260b7b7a4e19a815a2b33fbd8b2153`.

## Inventory and decision

The source archive has 237 CSS files and 70 direct index stylesheet references; source counts include retired history and are not production owner counts. The late production pipeline has five v481 owners, two v482 owners, v483 density, v484 hierarchy and the final v485 corrections. Both app.bundle and the standalone v482 artifact carry this ordered tail. Runtime v331/v332 document owners precede the standalone repair artifact. Keeping that order is essential.

v483 contains 59 important declarations across two mobile queries. Most are overwritten by the approved final owner. Removing the layer without transferring its remaining rules changed mobile header alignment, search dimensions and action typography. This batch transfers only visible surviving density behavior into v485 and removes v483 from the build. v483 source/history and its editor save-loop protection remain intact. No PR #484 design is restored. v484 and other broad owners remain until their own dependencies can be proven safely redundant.

## Small semantic system

Stable `--lx-ui-*` names live within the current approved final owner; they do not introduce another stylesheet. Canvas, surface, card, elevated, interactive and muted aliases resolve to the existing theme-aware palette. Success/warning/danger use existing semantic finance tokens. Spacing is 4/8/12/16/24px; control/card/sheet radii are 13/20/24px; comfortable controls are 44px, input text 16px; modal layer is 10000. Shared controls and modal stacking consume the relevant tokens. Historical aliases remain compatible. Arabic Tajawal and number/currency formatting are untouched.

## Verification

The parity runner intercepts the two original stylesheet URLs, preserving font URL resolution. It compares visible element geometry and computed typography, surfaces, borders, controls and stacking against compiled main artifacts, and writes paired screenshots. Fully transparent animated shadows are normalized because their changing offsets have no visible effect. Actual nontransparent shadows remain compared. Cases cover Dashboard, Documents, one editor, Settings, More and Receivables at representative 320/390/820/1024/1440 widths with Arabic/English and light/dark coverage. The current responsive gate checks the density and Safari import geometry retained from Batch 1.

Build ownership contract now requires absence of the retired v483 marker and exactly one final owner per emitted artifact. The first two existing v483 tests continue to protect editor identity/save behavior.

## Scope and limitations

This is the first controlled consolidation, not a claim that the historical cascade has been entirely eliminated. One obsolete active owner is removed; later broad owners remain, deliberately. No business logic, persisted data, accounting engines, authentication, PWA caching policy or packages change. Browser fixtures verify real components in the production cascade; physical Safari hardware is not available.
