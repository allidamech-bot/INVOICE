# Closed-period protection implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Implement inline, with no automatic live deployment.

**Goal:** Enforce the approved company-wide accounting close without silent historical changes or offline/old-client bypass.

**Architecture:** A trusted server commits immutable workspace generations under a per-account control transaction; browsers stage candidates but cannot publish locked-account manifests. The same deterministic period comparison powers client feedback and trusted commit validation. Closing retains a versioned financial snapshot; reopening appends a verified-owner event without replacing published history.

**Tech stack:** Existing TypeScript domain engines, Node API handlers, Firebase ID tokens, Firestore transactions and emulator, existing browser QA runners.

**Spec:** `docs/PERIOD_CLOSE_DECISION_2026-10-21.md`.

## Global constraints

- Company-wide, inclusive calendar cutoff covering all branches; no implicit branch or account fallback.
- Preserve approved transaction-date settlement recognition, source timestamps, currency rounding and VAT treatments.
- Owner-only online close/reopen with reason and current authoritative revision; local operator roles are not authorization.
- Published versions remain retained across reopen, backup and restore.
- No backfill, automatic close, production migration, deployment or live rules update.
- No close controls activated until the trusted commit and stale-client gates are tested together.
- Existing account-owner diagnostics UID is not an accounting authorization rule: every authenticated owner manages only their own account.

## Review focus

- An ordinary open-period receipt paying an old invoice must remain valid (Tasks 1 and 4).
- Changing IDs, company, branch, dates or import shape must not hide a closed record deletion (Tasks 1 and 3).
- Manifest CAS alone is insufficient if chunks can be replaced after validation (Task 2).
- Reopen changes the active boundary but never deletes a prior report publication (Tasks 2 and 3).
- A lost response after commit must not publish twice or erase successful work (Task 2).

## Task 1: Deterministic closed-state comparison and retained report data

**Files:** Create `src/lib/period-close.ts`, `tests/period-close.test.mjs`.
Read existing `payments.ts`, `receivables.ts`, `payables.ts`,
`treasury-ledger.ts`, `reports.ts`, `tax-vat.ts`, `operations.ts`,
`warehouses.ts`, `workspaces.ts`, and `types.ts`.

**Interfaces:**
- Produce `PeriodCloseBoundary { workspaceId:string; through:string }`.
- Produce `closedPeriodState(vault:VaultPayload, boundary:PeriodCloseBoundary): ClosedPeriodState`.
- Produce `assertClosedPeriodUnchanged(before:VaultPayload, after:VaultPayload, boundaries:PeriodCloseBoundary[]):void`.
- `ClosedPeriodState` contains a versioned deterministic JSON projection and currency-separated report results, including party and branch identifiers. Retain source record/revision references; do not hash unretained data.
- Existing report contracts: `financialReportByCurrency(documents,payments,'',through)`, `outputVatReport(documents,'',through)`, `receivablesByCurrency(documents,payments,through)`, `supplierPayablesByCurrency(purchases,supplierPayments,through)`, `treasuryProjection(payments,supplierPayments,expenses,entries,reconciliations,defaultCurrency,through)` and `treasuryAccountBalance(accountId,entries,through)`. Call only on the intended company's rows, grouping all branches explicitly. Existing `warehouseBalances` has no as-of parameter: filter movements by the validated inclusive date before calling it, and retain the dated valuation source rows rather than inventing an as-of valuation API.

- [x] Write failing real-engine fixtures: company A closed through 2026-10-31, company B open; reject 31 October receipt, accept 1 November payment against October invoice, reject moving/changing/deleting protected records, allow nonposting draft edits.
- [x] Add invoice/credit VAT, purchases, expenses, treasury, inventory valuation source rows and opening balance cases; verify aggregate equality cannot hide moving an amount between customers, branches, accounts or currencies.
- [x] Pin whether later void/reversal preserves the closed projection using actual existing engines. Reject operations that change it; do not silently redate corrections.
- [x] Run `npx tsc -p tsconfig.json && node --test tests/period-close.test.mjs`; observe intended RED, implement pure projection/comparison and run GREEN. Include malformed date, leap day, missing scope and duplicate identity cases.
- [x] Commit only the pure tested foundation; it does not activate locks or change schema by itself.

Task 1 evidence and exact limits: `docs/PERIOD_CLOSE_FOUNDATION_2026-10-21.md`.

## Task 2: Trusted publication and close/reopen transaction

**Files:** Create `api/_accounting/period-commit.js`, `api/workspace-commit.js`,
`tests/period-commit.test.mjs`, `tests/period-rules-emulator.integration.mjs`.
Modify `src/cloud/plain-workspace.ts`, `firestore.rules` and the existing emulator gate.

**Interfaces:**
- Consume Task 1's exact projection semantics through a bundled server artifact generated from the same source; never duplicate financial arithmetic in JS.
- `POST /api/workspace-commit`: authenticated bearer token, operation (`commit`, `close`, `reopen`), expected manifest revision, server-validated staged candidate reference; close adds company ID/cutoff/reason, reopen adds company ID/reason.
- Server identity comes from `verifyFirebaseIdToken`; reject nonowner/cross-UID claims. Body/operator fields never supply the actor UID.
- Return committed manifest revision and control generation, or a stable conflict/forbidden code with no raw credentials or payload in logs.

- [ ] Build tests for forged/anonymous/expired/nonowner tokens, cross-UID paths, arbitrary candidate paths, oversized payloads, missing chunks, hash mismatch and unsupported schemas.
- [ ] Supply a server-only Firestore adapter with least-privilege credentials. Never infer service-account credentials from the browser API key or reuse user-provided admin-role fields. Missing configuration fails closed; no fallback to client publication once protection is enabled.
- [ ] Validate the candidate read before committing. Server-owned generation chunks must be immutable after verification; use restrictive staging/server-published namespaces. Stage large payloads outside the HTTP request body, retaining existing chunk limits. Publish manifest, control version and audit event atomically; preserve preceding manifest history.
- [ ] Add idempotency tied to operation ID plus verified request fingerprint and UID. Duplicate request cannot close/reopen twice; same ID with another payload is rejected. Lost-response reconciliation must discover an already successful operation.
- [ ] Emulator-test denied direct manifest/control/event/snapshot writes, old-client replacement/deletion, malicious chunk overwrite and stale-device commit after another device closes. Include concurrent commits, close versus commit and reopen versus close.
- [ ] Keep the legacy path for accounts never enrolled only. Enrollment must atomically establish server authority before the first close; rules cannot use a browser-deletable flag. Protected accounts cannot downgrade or remove control records.
- [ ] Verify locally with synthetic emulator data, API tests, typecheck and build; commit without running a rules release or deployment.

## Task 3: Persistence, restore and recovery continuity

**Files:** Modify `src/app/App.tsx`, `src/app/index.tsx`, `src/storage/vault-merge.ts`,
`src/storage/db.ts`, `src/lib/backup.ts`, `src/types.ts`, `src/lib/defaults.ts`,
`src/storage/vault.ts`; create `tests/period-continuity.test.mjs`.

**Interfaces:** Consume the trusted control generation and boundary set from Task 2; preserve it as verified account context rather than authorizing payload metadata. Client preflight invokes Task 1; the server remains final authority.

- [ ] Write RED cases for ordinary save, full mutation, AI bridge, remote merge, import, restore, company/branch switching and local CAS conflict. Every path either preserves the closed state or is rejected without replacing the prior state.
- [ ] Extend schema deliberately with retained report references, versions and audit continuity. A legacy backup cannot remove server-owned control/history; restoring business data remains subject to the closed-state comparison.
- [ ] Preserve server-published immutable snapshot payloads and export references/data for account backup; prove restore does not overwrite a retained version. No storage deletion or chunk GC may prune referenced report history.
- [ ] Implement queue/preflight integration and unsynced offline behavior. A pending local draft is not a committed financial posting; show rejected synchronization clearly and retain recoverable user work.
- [ ] Run continuity, existing workspace/backup/cloud CAS/AI mutation tests and full Node suite; report inherited failures by exact test name rather than weakening assertions. Commit after review.

## Task 4: Owner controls and end-to-end acceptance

**Files:** Create `src/components/PeriodCloseSettings.tsx`, `tests/visual/period-close.html`,
`tests/visual/run-period-close.cjs`; modify `src/components/SettingsModal.tsx`,
`src/app/App.tsx` and add a focused CI workflow.

**Interfaces:** Consume verified owner/account identity, trusted control revision,
server-returned retained report versions and commit API. No local-role-derived reopen capability.

- [ ] Write browser RED scenarios for English/Arabic desktop/mobile Chromium and WebKit: company/all-branch scope, inclusive cutoff, preview, explicit confirmation/reason, reopen, retained previous version and failed save/conflict feedback.
- [ ] Implement controls only after Tasks 1–3 are green. Show unavailable/offline protection honestly; do not offer an operational close when server configuration or rules enforcement is missing.
- [ ] Test full cycle: publish October report; close company A; reject October change on second stale device; accept November payment; reject import/AI bypass; reopen with reason; correct; republish; inspect both original and new report versions.
- [ ] Run focused and full Node gates, emulator enforcement, typecheck, production build and browser scenarios. Physical iPhone remains separate verification, not inferred from WebKit.
- [ ] Review the complete diff and evidence before merging. Keep production deployment and exact Firebase rules release approval separate; prepare a rollback that cannot erase the lock or its historical reports.

## Readiness and progress

- Owner approved the business decision and publication on 21 October 2026.
- Repository transport: unauthenticated shell push is unavailable; connected GitHub tools successfully created PR #921. Do not rewrite or force-push the remote branch to match the earlier local-only commit.
- Plan self-review: shared interfaces and existing report contracts mapped above; no runtime implementation or active lock is claimed. The plan does not authorize invented report engines.
- Deployment prerequisite: a reviewed server-only Firestore credential/identity and rules release are required for authoritative enforcement. Neither has been configured or claimed by this planning change.
