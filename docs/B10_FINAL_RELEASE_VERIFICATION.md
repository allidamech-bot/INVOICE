# Batch 10 — Release-readiness, verified stock availability and final acceptance

Status: implementation on feature branch. Release is **not certified** until the full exact-head browser/security gate succeeds and the PR is merged. This document is not a deploy authorization.

## Scope and baseline

- Approved baseline `main`: `c6be7eb49503c11e6370107a7f585d2912ef5d8e` after full Batch 9 closeout PRs #647–#650.
- This is a controlled final release hardening pass; preserve the approved UI, all templates, finance engines, customer/supplier records, saved offline data, and production deployment configuration.
- Batch 9 QA established B09-FINAL-QA-ALL-PASS with Chromium/WebKit at its reviewed head; those results do not substitute for final Batch 10 HEAD QA.

## Defect and correction

- `src/lib/operations.ts` excludes invalid movements through `inventoryMovementAccountingIsValid` before calculating enterprise inventory balance. `src/lib/warehouses.ts` previously parsed and added *every* movement in a warehouse including invalid purchases with missing source IDs, invalid issue signs, zero or malformed quantities and invalid transfers.
- As a result, warehouse availability and the delivery posting gate could incorrectly trust phantom receipts or throw on malformed inventory data, despite canonical accounting reports excluding those records.
- Warehouse location delta now applies **the same existing canonical validator** before quantity parsing or movement attribution. Invalid records remain in the ledger for integrity reporting, but do not change available stock. Valid transfers preserve total enterprise stock.
- The confirmed sales delivery posting flow already uses `warehouseItemQuantity`, so it now honors the validated availability balance without a parallel stock engine or new application state.

## Regression evidence

- `tests/b10-warehouse-ledger-parity.test.mjs`: company/warehouse balance reconciliation; correct two-way warehouse transfers; malformed amounts, bad dates, wrong sign, missing purchase source, negative unit cost and invalid transfers rejected from availability.
- `tests/b07-sales-stock-issue.test.mjs`: confirmed delivery rejects phantom unproven supplier receipts rather than silently issuing nonexistent stock.
- Quick isolated Render Node 24 gate on feature head `d617ff4833fab25861b84d6646c4f46254ec0b74`: security, typecheck, production build and 259 Node contracts PASS; **browser QA not run** in this preliminary gate.

## Blocking final release gate

1. Use a free isolated Render runner, pinned Node 24 and Playwright/Chromium/WebKit 1.55.0. Do not enable GitHub Actions, paid services, or push to main.
2. Clone the branch at the exact Render deploy HEAD and verify every tracked file is byte-identical with the Docker build context; confirm branch ancestry and `main` baseline.
3. Run the original `node scripts/verify-local.mjs` unchanged: dependency security audit, project security gate, TypeScript, production build, all core/changed contract tests and full Chromium/WebKit browser shards (mobile, iPad, PDF, RTL, AI and workflows).
4. Require explicit `B10-FINAL-QA-SOURCE-PARITY`, `Mandatory LOUREX local QA PASS including Chromium/WebKit.`, `B10-FINAL-QA-PASS` and `B10-FINAL-QA-ALL-PASS` for the **same final HEAD SHA**.
5. Merge through a mergeable, ready GitHub PR with `expected_head_sha`; verify `main` points to returned merge commit and no conflicting PRs remain.

## Limitations outside this verification

- Automated WebKit and Chromium QA is not a test on a physical iPhone/iPad. Human testing is still needed for Safari download, PDF share sheet, hardware keyboard behavior and real PWA installation.
- Provider-based AI, live external payments, and hosted cloud credentials cannot be certified by local deterministic QA. No live Vercel site has been published or modified.
- Batch 10 does not implement a general ledger, backfill unknown COGS, invent FX rates or authorize AI to post financial/stock transactions without explicit approval.

## Final status

**Pending final exact-sha acceptance.** Record the PR merge and production decision only after verifiable evidence. A merged GitHub release is not the same as deployment.
