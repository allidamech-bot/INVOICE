# LOUREX — Batch 6B: documents, reports and customer navigation

Date: 2026-10-10. Repository: `allidamech-bot/INVOICE` only.
Base: Batch 6A draft #688, commit `f455fe566c96edd79d62d14ace1236e96a0bb056`.
Status: implementation and local automated verification complete; browser acceptance pending. No merge or deployment.

## Confirmed findings and changes

| Area | Source evidence before | Result | Targeted verification |
|---|---|---|---|
| Documents resume action | `DocumentsPage.render` selects latest non-final record without excluding `lifecycleStatus='voided'` | Resume selects latest non-final, non-voided document. Archive/list records are not removed | Actual extracted selection method with newest cancelled record, issued record, active draft/ready record, all-ineligible and empty arrays; source order/values unchanged |
| Performance currency scope | `ReportsPage.render` changes effective selected currency to all currencies if the selected code is absent from period rows | Selected code stays selected; show an explicit no-activity option and an empty scoped report, preserving currency across date changes | Actual component rendering and CSV callback in EN/AR with USD selected and only EUR activity, EUR selection and explicit reset |
| Customer workspace tabs | Directory/Pipeline have `role=tab` but both are default tab stops and lack key handler, panel linkage and tab ids | Shared existing keyboard handler, one active tab stop, stable ids, controls and labelled panels in both views | Actual Directory and Pipeline render trees in EN/AR |
| Customer focus and departure | Workspace switch replaces the tab DOM without restoring focus, and callbacks lack operation/editor guard | Focus moves to the selected tab after a successful switch; active edit or operation prevents leaving. Pipeline deletion confirmation also prevents leaving | Actual switch and directory-return methods with focus fixture, active editor, save and deletion states |
| Existing spacing/loading style | New labelled panel would interrupt direct-child loading selector and the parent's grid gap | Preserve original loading-card selector for legacy DOM and extend it to the new panel. Panel uses grid with inherited established gap | Source selector/layout review; rendered visual acceptance pending |

No package, router, schema, accounting calculation, currency conversion, persistence operation, record deletion, numbering allocation or AI workflow changed. The report filter governs the existing performance report and its CSV row callback; it does not alter independent Profitability or Tax/VAT engines.

## Verification

- `npm run typecheck`: passed on the final TypeScript changes.
- `npm run build`: passed on the final source/styles before running the full tests.
- `node --test tests/audit-batch6b-workspace-behavior.test.mjs`: 10 passed, 0 failed or skipped.
- `node --test tests/*.test.mjs`: **2,288 passed**, 0 failed, 0 skipped, 0 cancelled.
- `git diff --check`: passed.
- Two legacy source assertions initially failed because they encoded the behaviors being corrected: implicit currency fallback and inclusion of every non-final record in resume. Updated them to require retained selected currency with its explicit no-activity option, and to require both non-final and non-voided resume eligibility plus render wiring. All other checks remain; no tests deleted or skipped.
- Manual source review covered shared keyboard helper usage, guarded focus handoff, unchanged data/calculation boundaries, existing grid spacing and the loading-card selector affected by the new panel wrapper.

## Acceptance limits and continuation

These tests execute actual source methods and render callbacks with mocked rendering/dependencies. They are not browser screenshots, visual contrast certification, assistive-technology testing or a proof of every archive/export/editor workflow. The existing generic tab keyboard behavior has separate regression tests in the full suite; new cases verify the customer views are connected to that helper and expose valid panel relationships.

Candidate browser visual QA remains pending as recorded in Batch 4/5/6A. No screenshots of these fixes were captured. Physical iPhone/iPad remain excluded by user instruction. Production was not used to exercise data-changing operations.

Batch 6 is not fully closed. Remaining work includes Dashboard arrangement/density; broader Documents list, revisions and archive acceptance; populated Customer/CRM and Product states; supplier/procurement and remaining financial panels; full profitability/VAT label review; Search/Notifications/Help guidance; established subtab entry deficiencies; real EN/AR Light/Dark layout and focus/scroll checks. Follow the original execution ledger rather than treating this candidate as whole-site acceptance.

Main was read again during this candidate and remained `19e2a48b6ead561b77678d6145740fa8276101f0`. Keep the PR draft, stacked on Batch 6A. No direct main write, Replit usage, merge, deployment or destructive production operation is included.
