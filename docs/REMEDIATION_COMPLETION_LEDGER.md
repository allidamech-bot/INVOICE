# Remediation completion ledger — reopened

Reviewed baseline: main `e8eaf04557108feb8c9fe116223481b6f2b1eeeb`.

PRs #492–#498 merged scoped improvements. A merged PR and green CI **do not**
establish completion of every requirement in the original seven-batch roadmap.
This ledger supersedes any blanket statement that all seven batches are complete.
Historical batch notes retain their implementation evidence, not completion authority.

## Completion rules

- Work sequentially; do not advance past an open mandatory acceptance item.
- Record implementation, test evidence and unavailable verification separately.
- An existing capability must be inspected and verified, not implemented twice.
- Conditional proposals require an explicit suitability decision, not an invented feature.
- Hardware/provider limitations must remain visible, never be described as PASS.
- Reuse existing owners/engines; no unrelated schema, finance, auth or design rewrite.

## Current status

| Batch | Status | Existing merged work | Remaining closeout |
| --- | --- | --- | --- |
| 1 Responsive/mobile | OPEN — active | Modal viewport, Documents density, import phone rows, existing shell/editor/iPad gates | Complete requirement-to-evidence review; search/quick-create keyboard defect reproduced in current main and under repair; final follow-up gates/PR not yet complete; physical Safari verification unavailable |
| 2 Design system | PARTIAL — not active | Retired one active v483 owner; semantic aliases and parity tests | Review surviving ownership/duplicates/breakpoints and all requested semantic roles/scales; prove any further consolidation by parity; no big-bang rewrite |
| 3 Workspace UX | PARTIAL — not active | Exact search navigation, Customer/Supplier 360 summaries/disclosure, compact Products and Finance | Review each named workspace and its empty/error/loading/form states; Reports, Settings, More, Create and Notifications were retained, not comprehensively acceptance-tested |
| 4 AI everywhere | PARTIAL — not active | Inline existing Copilot/Inbox entry, bounded context and deterministic product brief | Map every requested workspace intelligence outcome to real existing capability or remaining implementation; opening an advisor alone is not proof of a useful workflow; provider canaries not run |
| 5 AI reliability | PARTIAL — not active | Timeout/body-read cancellation, extraction completeness, local RFQ parsing/numerals, voice fixtures | Full reliability checklist review including selectable/scanned PDFs, ambiguity/evidence/confidence/telemetry and fallback; provider and physical voice canaries unavailable/not run |
| 6 Commercial workflows | PARTIAL — not active | Source-linked reviewed delivery drafts, deduplication and lifecycle tests | Explicit sales/purchase lifecycle completeness and candidate suitability review; Sales Order/Debit Note and automatic PO–receipt linkage were not added; do not imply otherwise |
| 7 Accounting foundation | SCOPED FOUNDATION MERGED — roadmap closeout pending | Option A documented; latest-vault treasury allocation validation and deterministic tests | Re-evaluate after 1–6 closeout; verify operational finance/reporting boundaries. Full GL was deliberately not implemented, as permitted by the roadmap |

## Batch 1 acceptance inventory

The following references describe existing automated coverage; they are not fresh
hardware tests and do not by themselves close this follow-up batch.

| Requirement | Implementation / evidence | Closeout status |
| --- | --- | --- |
| Safari/WebKit stability | Current CI v338/v339 editor/navigation gates; prior PR #492 results | Final follow-up gate pending |
| visualViewport / keyboard / offset | `ModalFrame` and `modal-visible-viewport.test.mjs`; import keyboard CTA strengthened in `run-responsive-batch1.cjs` | Import strengthened test PASS locally; search gap reproduced and being fixed |
| Browser chrome / safe area | Modal uses actual visual height with zero duplicate toolbar reserve; v363 reconciliation | Simulated coverage only; physical Safari unavailable |
| Bottom navigation | `run-v337-shell-navigation.cjs`: target geometry and navigation | Existing coverage; final blocking CI pending |
| Editor docks / nested scroll | v338 editor stability; v339 iPad portrait/landscape runners; new actual EditorPage/AppShell keyboard fixture | Commercial dock behind keyboard reproduced; follow-up repair and final gate pending |
| Dialogs / sheets | Modal viewport tests; shell More scroll-end checks | Search/Quick Create actual viewport was missing; follow-up test added |
| Overlay locks / More / Create release | `run-v339-shell-overlay-release.cjs`; search follow-up repeated Escape/action path | Existing and new coverage; final blocking CI pending |
| Documents density | All ten types retained; same filter state; 44px creation targets; search/header geometry | Eight representative widths PASS locally |
| Import phone review | Eight labeled fields including sale/cost currency and validation detail | Chromium/WebKit 320 Arabic PASS locally; keyboard confirmation saves once |
| 320 hard mode / overflow | Documents/import and shell gates | Covered surfaces only; no claim of every application form audited |
| 900/901 transition | Documents responsive runner | PASS locally |
| iPad portrait / landscape | v339 820 portrait and 1194 landscape actual-editor fixtures | Existing automated coverage; physical iPad unavailable |
| Arabic/English, light/dark, desktop | Documents representative coverage; existing current browser shards | Documents PASS locally; changed search surface final coverage pending |

## New defect evidence

`run-search-keyboard-batch1.cjs` failed on unmodified main in Chromium at a
300px visual viewport: `search ends behind keyboard`. The command surface used
the layout viewport (`100dvh`) rather than actual keyboard-visible bounds.
The fix must keep the input and actions reachable inside a scrollable panel,
restore approved geometry on keyboard dismissal/desktop rotation, remove
listeners on unmount, and preserve canonical creation/navigation behavior.
The implemented fix passed focused Chromium 390 English and WebKit 320 Arabic
tests at visual heights 300/190/844, nested scrolling, close/reopen and canonical
creation. Two behavior contracts passed for geometry restoration and listener
cleanup. Full-roadmap completion is still not inferred from these results.

No physical iPhone/iPad or live-provider success is claimed. Do not mark the
entire roadmap complete while the above open items remain.

An additional actual `EditorPage` inside `AppShell` fixture reproduced the
commercial editor dock behind a 360px keyboard viewport. A shell-scoped
constrained-viewport adjustment now lifts both commercial/Draft action docks
and limits the existing outer scroll owner. Normal geometry remains unchanged;
no money or editor saving logic is replaced. This acceptance item must pass its
new blocking regression before merge, even if the earlier PR head is green.

The same focused test subsequently reproduced the saved-product editor footer
behind the keyboard. The existing shell viewport variables now also constrain
product and purchasing editor overlays, without changing normal workspace
geometry. Final local coverage passed commercial/Draft docks at 390/900 and
320/820 respectively, and WebKit 390 product/purchase action hit tests. Four
modal/search/editor behavior contracts passed. The latest production build passed.

The path-triggered Notification Center blocking gate exposed another fixture
with `.app-ui` placed on `#root`, unlike production's `#root > .app-ui` ancestry.
That prevented the approved final modal owner from matching. The fixture now
matches production; all original overflow, 44px, RTL and mutation assertions
remain unchanged. Its three browser scenarios passed locally. Required remote
checks must still pass on the final published HEAD; do not use an earlier head's
success as merge evidence.
