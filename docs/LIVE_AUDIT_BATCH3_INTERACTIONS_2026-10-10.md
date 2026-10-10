# Live audit Batch 3 — overlay and keyboard interactions

Repository: allidamech-bot/INVOICE. Base: Batch 2 commit 2ea17e8dff744940a78b4692a24e6b2369462cc2 (draft PR #684). This candidate is stacked on Batch 2; it must not be reviewed as an independent patch against main.

## Findings and candidate changes

| Audit finding | Change | Evidence and status |
|---|---|---|
| A17: Search Shift+Tab escaped to the background AI launcher | Contain Tab and programmatic focus, preserve opener, cancel stale delayed focus callbacks | Actual Search methods and shared helper run in isolated DOM fixtures; graphical candidate verification pending |
| A18 / LAYER-001: Search and AI overlapped; Escape closed both | Opening paths defer to the visible top overlay; Escape acts only on its owner; nested confirmation retains ownership | Search/AI overlap, nested overlay and generated AI menu Escape cases pass |
| A19 / A11Y-TABS: Arrow keys did not move workspace tabs | Shared RTL-aware Left/Right, vertical Up/Down, Home/End; enabled visible tabs activate through existing click handlers | Actual handler behavior, canonical guard invocation and DomainWorkspaceTabs render checked |
| A19: Create menu had no arrow navigation | Up/Down wrap, Home/End and Tab containment in both menu variants | Actual AppShell methods tested with 900/901 matchMedia branches; no physical device or geometric assertion |
| A04: first Finance tab clipped after moving through tabs | Selected tab scrolls into view; horizontal strip starts at the beginning and exposes a thin scrollbar | Actual selected-tab scroll callback checked; Cash & Bank pixel geometry remains pending live candidate QA |
| SEARCH / ATTACH / shared modal focus return | Shared scroll leases and focus restoration choose a connected opener inside the remaining top overlay | Out-of-order cleanup, repeated cleanup, empty overlay, preview close and nested return tests pass |
| Generated AI scope menu escape repair silently missed its source token | Correct exact emitted token, add missing-token build failure and scope capture handlers to their own AI dialog | Final production build applies repair; three emitted Escape handlers execute in isolated fixtures |

## Implementation boundaries

Shared interaction helpers are applied to Search, AI, ModalFrame, Create/More and attachment preview. Scroll ownership is released by owner rather than a component-local counter. Visible overlays are ordered using ancestor z-index chains so an AI child with a high local z-index does not outrank a separate Search dialog.

Workspace tabs, Operations, Reports, Settings, Saved Items and Notifications have keyboard navigation, roving tabIndex and associated tab/panel identifiers. Vertical Settings navigation keeps the existing guarded click path. Saved-item picker instances get distinct identifiers. Conditional Operations layouts do not point to absent tab labels.

No accounting, issuance, encrypted storage, routing, package, AI request or file-processing subsystem was replaced. Existing pending/applying/dirty guards remain authoritative. Quick Create waits for the More sheet to commit closed before dispatching Search.

## Validation

- TypeScript and complete production build pass.
- Full suite after the final build: **2,245 passed, 0 failed, 0 skipped, 0 cancelled**.
- 24 additional behavioral cases above the 2,221 Batch 2 baseline. Both Create variants additionally assert Tab containment.
- All earlier tests retained. Structural assertions now check shared focus/scroll delegation; three older fixtures include the DOM methods or focus listener introduced by that delegation. No test was removed or skipped.
- git diff --check passes.
- Build and full tests ran sequentially because existing tests consume generated dist files.

The new tests execute actual transpiled helpers/component methods, the tab component render, and emitted production AI Escape handlers in isolated fixtures. They are not browser screenshots or end-to-end user-session evidence.

## Unverified and deferred

No deployment, production data edit, merge, Replit use, physical iPhone/iPad test or candidate screenshot capture occurred. Desktop Arabic/English Light/Dark visual geometry, CSS stacking-context behavior beyond numeric z-index fixtures, click/backdrop reachability and full authenticated workflows still require the final live browser pass. The original live screenshots remain historical evidence, not screenshots of this candidate.

A04 therefore remains visually unconfirmed rather than marked completely closed. Attachment testing covers preview interaction and focus return, not upload/PDF extraction or multi-file processing. Scope and tools-menu tests cover keyboard ownership, not model/voice operation.

Batch 4 follows: consolidate typography, spacing, colors, visual states and preview/PDF consistency. Batch 5 covers information organization; later batches cover page polish, AI workflows, finance behavior and final live QA. Main and production remain unchanged.
