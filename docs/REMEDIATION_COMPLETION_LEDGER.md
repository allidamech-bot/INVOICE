# Remediation completion ledger — reopened

Reviewed baseline: main `e8eaf04557108feb8c9fe116223481b6f2b1eeeb`.
Current continuation baseline: main `a08788bce4e86758f4a45ce11d441f3f561b8947`
after PR #499 merged with every current blocking gate passing.

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
| 1 Responsive/mobile | COMPLETE — required automated acceptance and merge | PR #492, #499 and #500; final #500 CI all current shards, verify and quality gate PASS; merged main `077d3a2c24771eca2438c53aea51e13028c466d8` | Physical Safari/iPad verification unavailable, not claimed; no mandatory automated acceptance item remains open |
| 2 Design system | IN PROGRESS — closeout | Retired one active v483 owner; semantic aliases and parity tests | Review surviving ownership/duplicates/breakpoints and all requested semantic roles/scales; prove current consolidation by parity; no big-bang rewrite |
| 3 Workspace UX | PARTIAL — not active | Exact search navigation, Customer/Supplier 360 summaries/disclosure, compact Products and Finance | Review each named workspace and its empty/error/loading/form states; Reports, Settings, More, Create and Notifications were retained, not comprehensively acceptance-tested |
| 4 AI everywhere | PARTIAL — not active | Inline existing Copilot/Inbox entry, bounded context and deterministic product brief | Map every requested workspace intelligence outcome to real existing capability or remaining implementation; opening an advisor alone is not proof of a useful workflow; provider canaries not run |
| 5 AI reliability | PARTIAL — not active | Timeout/body-read cancellation, extraction completeness, local RFQ parsing/numerals, voice fixtures | Full reliability checklist review including selectable/scanned PDFs, ambiguity/evidence/confidence/telemetry and fallback; provider and physical voice canaries unavailable/not run |
| 6 Commercial workflows | PARTIAL — not active | Source-linked reviewed delivery drafts, deduplication and lifecycle tests | Explicit sales/purchase lifecycle completeness and candidate suitability review; Sales Order/Debit Note and automatic PO–receipt linkage were not added; do not imply otherwise |
| 7 Accounting foundation | SCOPED FOUNDATION MERGED — roadmap closeout pending | Option A documented; latest-vault treasury allocation validation and deterministic tests | Re-evaluate after 1–6 closeout; verify operational finance/reporting boundaries. Full GL was deliberately not implemented, as permitted by the roadmap |

## Batch 1 acceptance inventory

The following maps every original Batch 1 target to its code and automated
acceptance evidence. The remaining release requirement is the final closeout
PR's blocking gates and merge. Physical hardware is not claimed; the requested
Chromium/WebKit and representative iPad/boundary coverage is automated.

| Requirement | Implementation / evidence | Closeout status |
| --- | --- | --- |
| Safari/WebKit stability | Current CI v338/v339 editor/navigation gates; PR #499 all current shards and quality gate | PASS on merged #499; final closeout CI required |
| visualViewport / keyboard / offset | `ModalFrame`, two viewport behavior contracts, `run-modal-viewport-acceptance-batch1.cjs`, import/search/editor regressions | Local PASS: offsets, 360/190px keyboard heights, input/save hit areas, restore/fallback |
| Browser chrome / safe area | Modal uses actual visual height with zero duplicate toolbar reserve; v363 reconciliation | Simulated coverage only; physical Safari unavailable |
| Bottom navigation | `run-v337-shell-navigation.cjs`; new actual-viewport nav bounds assertion | #499 normal geometry/navigation PASS; new Safari-chrome geometry local PASS |
| Editor docks / nested scroll | v338/v339 and `run-editor-keyboard-batch1.cjs` | #499 PASS: commercial/Draft 390/900 and 320/820, product/purchase keyboard action hit tests |
| Dialogs / sheets | Shared actual Modal fixture 320/900/901/1024; More visible bounds + scroll-end action; actual Settings numbering save | Local PASS; normal geometry restored rather than redesigned |
| Overlay locks / More / Create release | `run-v339-shell-overlay-release.cjs`; search repeated Escape/action; nested actual ConfirmDialog and Settings close | #499 existing gates PASS; new nested-lock/last-close restore local PASS |
| Documents density | All ten types retained; same filter state; 44px creation targets; search/header geometry | Eight representative widths PASS locally |
| Import phone review | Eight labeled fields including sale/cost currency and validation detail | Chromium/WebKit 320 Arabic PASS locally; keyboard confirmation saves once |
| 320 hard mode / overflow | Documents/import/shell current gates; short-keyboard modal input/save and RTL | Current required surfaces PASS; unrelated workspace UX remains Batch 3, not falsely marked audited |
| 900/901 transition | Documents responsive runner | PASS locally |
| iPad portrait / landscape | v339 820 portrait and 1194 landscape current gates; new 900/901/1024 tablet keyboard bounds | #499 iPad gates PASS; tablet modal bounds local PASS; physical iPad unavailable |
| Arabic/English, light/dark, desktop | Documents representative coverage; #499 current shards; new AR dark / EN light compact cases | PASS representative coverage; no normal desktop geometry or approved palette replacement |

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

## Final Batch 1 closeout defects and verification

- On a08788bc, the actual shared Modal at width 900 ended at y=836 while the
  keyboard-visible bounds ended at y=380. The old 860px inline cutoff left
  tablet dialogs positioned in the full layout viewport. Actual visual height
  and offset now constrain both backdrop and card on tablets too; dismissal
  restores approved CSS. Invalid viewport measurements fall back safely.
- At a 190px keyboard height, stacked footer actions could consume all form
  space. Only this constrained short-viewport state uses compact header/footer
  spacing and horizontal actions, retaining 44px hit areas and the full title
  in the accessible dialog label. No action or field is removed.
- More/Create sheets and bottom navigation now consume the existing shell
  visual viewport variables instead of staying below the visible Safari edge.
- Primary modal labels inherited a muted span color despite a white button
  foreground. The primary label now inherits its button color; browser coverage
  asserts this in Arabic dark and English light, without changing the palette.
- Two historical v485 source-text diagnostics also fail on the unchanged main
  baseline (old exact background/gradient strings). These are non-blocking
  legacy diagnostics, not new regressions; they were not weakened or redesigned
  to satisfy obsolete palette assertions.
- New local acceptance PASS: Chromium 900 EN/light; WebKit 320/901 AR/dark and
  1024 EN/light; last input reachable at 360 and 190px; 44px save reachable;
  nested review keeps outer lock, final close restores it; WebKit 390 More
  scroll-end/release and actual Settings reviewed numbering save at 190px.
- Physical iOS keyboard/browser-toolbar behavior is simulated, not hardware
  verified. No finance/storage/auth/AI lifecycle changed. Final blocking CI on
  the associated closeout PR remains the merge requirement.
