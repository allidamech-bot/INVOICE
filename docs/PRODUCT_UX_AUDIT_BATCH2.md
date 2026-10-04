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

## Sequential closeout from main 077d3a2c (PR #500)

Batch 1 completed its mandatory automated acceptance and all blocking CI before
this independent closeout branch started. The rejected PR #484 is not restored.

Current source inventory: 237 CSS files, 72 stylesheet links in source index
(not a production-owner count). The build reports 69 initial bundled layers,
13 retired historical layers, two standalone document owners, and nine late
presentation owners. App bundle and final standalone artifact intentionally
repeat the tail across **different artifacts**, not twice within one artifact:
the standalone tail must follow v331/v332. Removing it would reintroduce their
historical overrides. The existing single-marker contract protects this boundary.

| Active tail owner | Important declarations after closeout | Responsibility / retention decision |
| --- | ---: | --- |
| v481 visual system | 263 | Mobile shell/dashboard, theme and reduced-motion foundations; retains structural rules not owned by v485 |
| v481 workspaces | 386 | Workspace-specific register and editor structures; not safely replaceable by one generic card |
| v481 overlays | 323 | More/Create/search/dialog geometry and AI surfaces; keep untransferred structural behavior |
| v481 business | 231 | Operational finance/pipeline/reporting layouts; no business calculations |
| v481 regression fixes | 65 | 320px monetary KPI isolation and real opaque action/KPI bases; keep Safari and currency readability fixes |
| v482 mobile repair | 268 | Phone command/search/dashboard/AI interaction geometry |
| v482 narrow readability | 123 | Narrow AI copy/workflow hit areas; do not drop merely because another owner follows |
| v484 hierarchy | 149 | Desktop activation, 901–1120 layout and surviving higher-specificity More rules; broad retirement is not parity-safe by assumption |
| v485 final corrections | 1599 | Approved palette/Arabic typography, shared controls, screen-only surface hierarchy and current responsive fixes |

Obsolete v483 remains retired (59 historical important declarations no longer
execute). The current pass also removes two provably superseded declarations
from the **same selector and same media context** in v485: the earlier mobile
modal max-height and the earlier global-create button background. Their later
declarations remain the authority. Other repeated selectors add different
properties (notification summary, Settings sizing, AI alignment); treating these
as duplicates would lose behavior. Repeated media blocks deliberately preserve
source order and intermediate specificity: they are not blindly coalesced.

Boundary inventory: inherited 350/360/380 narrow exceptions, mobile through900,
tablet/desktop from901, 1120/1150 compact desktop refinements, and1199/1200
shell mode. No new breakpoint is introduced. Parity covers320/390/820/1024/1440;
Batch1 retains the explicit900/901 behavior gate.

Semantic closeout adds primary/info/overlay roles, 12/14/16/18/24 typography,
the existing Arabic font alias, 44px controls/52px editor docks, and named
navigation80/editor900/advisor9998/backdrop9997/modal10000 layers. Existing
canvas/surface/card/elevated/success/warning/danger/muted roles, spacing and
radii remain. Search controls and overlay surfaces consume aliases without
changing resolved values. Arabic Tajawal, mixed-script currency isolation,
document paper/fonts, desktop hero composition and approved light/dark palette
are preserved. No glow, hero enlargement or alternative palette is added.

This is controlled consolidation, not a promise to erase every historical CSS
file. Required closeout evidence: exact computed-style/geometry parity on the
18 existing representative Dashboard/Documents/editor/More/Settings/Receivables
cases and paired screenshots, changed semantic contract, retained ownership
contract, production build, TypeScript, security and final blocking PR CI.

Local closeout evidence: all18 computed parity cases PASS; production build,
TypeScript, static security230 files, semantic and retained ownership/editor
contracts (four tests) PASS. Final blocking remote CI/merge is still pending.
