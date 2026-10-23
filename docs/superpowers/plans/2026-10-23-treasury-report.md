# Treasury Report Implementation Plan

Goal: read-only period output for checklist item 8.
Architecture: pure scoped projection, report component on the live treasury
screen, print rules in the existing financial workspace stylesheet.
Tech: existing TypeScript, React, Node tests and Playwright; no new packages.
Spec: ../specs/2026-10-23-treasury-reconciliation-output-design.md

## Constraints and review focus

No App, merge, AI, schema or production changes. Preserve canonical balances.
Check late voids, negative openings, transfers, unallocated sources, historical
statuses, inactive accounts, CSV formulas and scope changes explicitly.

## Task 1: Pure report

- [ ] Write `tests/treasury-period-report.test.mjs`; watch missing module fail.
- [ ] Add `src/lib/treasury-report.ts`: `treasuryPeriodReport(input)` returns
  scoped accounts with opening, closing, signed effective movements and
  separate unallocated rows. Filters: workspaceId, branchId, from, to,
  currency and accountId. Existing balance/projection functions are authority.
- [ ] Verify exact balances, historical void effects and no source mutation.

## Task 2: Actual output

- [ ] Add `TreasuryReconciliationReport.tsx`; integrate via one report button
  in `TreasuryLedgerPage.tsx`, keyed by workspace/branch.
- [ ] Freeze preview data on generate; CSV and print consume that preview.
  Filters changing invalidates preview. Cancel scheduled print on unmount.
- [ ] Add scoped print rules to `tailadmin-finance-workspaces-v320.css`.
- [ ] Browser fixture uses actual FinanceWorkspace/AppShell. Verify dates,
  balances, statuses, CSV, native PDFs, both languages and engines.

## Task 3: Validation and integration

- [ ] Add isolated pinned Playwright workflow, run typecheck/build and focused
  Node/browser checks. Review native PDFs, then independent branch review.
- [ ] Open PR, wait for required CI at exact head, merge and verify main.

## Execution record

User continued after the concrete recommended contract; execute inline.
Baseline main 37ec64a6f91dcacaaa462e3b38461ad49946e53c.

Task 1 complete: 8 projection/CSV tests pass. Task 2: 10 local Chromium
cases pass; 8 native PDFs reviewed, WebKit pending CI. Independent review
found four issues; all addressed with regression evidence: equivalent scoped
clones retain preview (RED→GREEN), company default currency and currency-only
unallocated filter, malformed amounts rejected and CSV normalized (RED→GREEN).
No shared source files or AI files changed.

Ruling: use content identity rather than prop reference identity because actual
App.scopeVault clones arrays on ordinary renders. Include active storage UID
and cancel a scheduled print if its UID/source changes.

Validation note: running bare tsc after the complete build overwrote patched
dist runtime files; full Node rerun then reported build-runtime contract
failures. Re-run full production build before final Node validation.
