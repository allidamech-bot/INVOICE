# LOUREX INVOICE — Alif 38: trusted period-authority disaster-recovery runbook

**Status:** PREPARED FOR REVIEW — **NOT AN AUTHORIZED PRODUCTION RECOVERY OR DR ACCEPTANCE**  
**Date:** 2026-10-26 · **Scope:** finance-only period close authority, not LOUREX AI.  
**Relevant code:** `api/_accounting/period-store.js`, `api/_accounting/admin.js`,
`src/lib/period-archive.ts`, `src/lib/backup.ts`, `firestore.rules`.  
**Related evidence:** #1110 (business backup/restore only), #1112 (lost-control guard),
the existing period-close emulator suite, and this manifest-marker guard.

## 1. Boundary and failure model

The current portable `LOUREX_WORKSPACE_EXPORT_V2` restores **business Vault
payload only**. An optional `LOUREX_PERIOD_ARCHIVE_V1` is retained read-only
proof; importing it **does not** recreate owner authority, `accounting/control`,
`periodOperations`, `periodReports`, their chunks or the trusted server
generation. It must never be promoted into a signed/authoritative source.

An enrolled account's trusted `workspace/meta` contains
`chunkStorage: period-generations-v1`. If `accounting/control` is missing,
server commands must fail closed (`PERIOD_AUTHORITY_MISSING`) when the
remaining evidence includes this manifest marker, any historical period
operation or any retained report. A missing/malformed manifest already fails
normal validation. This avoids accidentally interpreting an enrolled account
as a new legacy account even if some other metadata has been lost.

**Limit:** loss of *all* server authority, all server history and the
authoritative manifest cannot be reconstructed merely from application files.
The system does not have an automatic restore-authority API, disaster-recovery
operator command, or certified backup-based authority reconstitution.

## 2. Incident triggers and immediate read-only triage

Typical indicators: `PERIOD_AUTHORITY_MISSING`,
`PERIOD_ENROLLMENT_REQUIRED` or `INVALID_PERIOD_CONTROL`, a missing closed
period boundary, a failed report integrity check, an unexpectedly changed
server generation, or inconsistent revision across synchronized devices.

1. **Stop financial release actions.** Restrict new enroll/close/reopen and
   trusted commits through an approved incident change process. Do not
   activate `LOUREX_PERIOD_SERVER_ENABLED` or change
   `LOUREX_PERIOD_RULES_VERSION` to bypass a guard.
2. **Do not rerun enroll, replace an account with a local backup, alter the
   current revision, delete report chunks or perform a generic Firebase
   restore.** Do not ask a user to create a new account to resolve a missing
   control record. Never promote AI/finance-assistant changes as recovery.
3. Identify the exact Firebase project and affected UID through authorized
   operational metadata, not a guessed email, token or account selection.
   Query only the affected UID's own accounting metadata, never inspect
   unrelated customers. Preserve existing access/audit logs and timestamps.
4. Authorized operations personnel may collect **read-only** presence,
   generation, revision and checksum evidence for the following namespaces:
   `users/{uid}/workspace/meta`, `accounting/control`,
   `periodOperations`, `periodReports` and its `chunks`,
   `periodGenerations`, `workspaceHistory` and
   `periodStaging`. Keep sensitive financial snapshots in an
   access-controlled incident store, never in GitHub issues, PR bodies or CI.
5. Verify the **currently published** Firestore ruleset separately from
   checked-in `firestore.rules` (Alif 35-B). Check owner-only server
   authorization, immutable namespaces and whether an older client can write.
   Do not publish rules during evidence gathering.
6. Mark the incident **NO-GO** until ledger continuity and retained report
   identities have been reconciled independently. A Vercel READY deployment
   or clean TypeScript build cannot certify database recovery.

## 3. Recovery source priority and authority rules

**Preferred source (when available):** independently protected, consistent
Cloud Firestore managed backups or independently verified point-in-time
recovery for the **same original project and UID**, preserving original
server-owned control, operations, report metadata and report chunks, and the
corresponding workspace manifest/generations. Confirm actual backup availability
and retention before attempting anything. The application does *not* itself
guarantee this service is enabled.

**Supporting evidence only:** exported `LOUREX_PERIOD_ARCHIVE_V1` and
portable `LOUREX_WORKSPACE_EXPORT_V2`, historical immutable invoices/stock
movements, report checksums, GitHub/Vercel SHA, and incident logs. A valid
archive can verify what was published but cannot automatically prove current
server authority or supply credentials to rebuild it.

**Never choose** a backup because it has the most convenient balance. All
candidate restores must be reconciled against accounting continuity, owner
identity, generations, source revisions, report hashes, operation receipts,
company/branch coverage, VAT and inventory movement integrity.

## 4. QA rehearsal — destructive simulation permitted ONLY on isolated demo UID

1. Use a `demo-*` Firebase Emulator project bound to `127.0.0.1:8080`.
   No production Firebase token, account, client collection or live user data.
2. Publish synthetic invoice/purchase/stock/receipt evidence into a
   known synthetic workspace, enroll and close a company through a chosen date.
   Verify recorded generation, report hash, original owner UID and event count.
3. Simulate loss of `accounting/control` while retaining operations/report.
   Assert `inspect`, `enroll` and cached command replay fail closed without
   publishing a new generation.
4. Repeat with both control and operations missing but a retained report;
   then with control/operations/reports missing but the trusted manifest still
   present. Assert **no false first-time enrollment** and unchanged financial
   state in each case. A truly pristine legacy demo account must still enroll.
5. Simulate a transaction abort before final publication. Assert no new
   control generation, report metadata or operation receipt; retry exactly one
   accepted command ID and verify idempotence.
6. Independently validate a complete archived report chain, immutable
   historical checksums and business backup continuity. **Do not claim** that
   this simulates operator-led restoration of a lost Firestore authority
   snapshot; that scenario needs a separate, explicitly approved QA design.
7. Preserve commands, build SHA, emulator ID, CI URL, pass/fail and scope.
   Do not rerun broad suites whose exact-head results are already green.

### Additional bounded emulator rehearsal (27 October 2026)

The finance DR acceptance test in
`tests/period-server-publication-acceptance.integration.mjs` creates one
isolated synthetic owner workspace, enrolls and closes it, captures trusted
control/receipts/report metadata and report chunks **in test memory only**, then
simulates deletion in the Firestore **demo emulator**. It proves that commands
fail closed while the snapshot is incomplete, restores the exact original
records, compares the financial authority before and after, checks the
original published report SHA-256 and immutable customer documents, validates
an idempotent close retry, and rejects a backdated invoice change.

A separate regression deletes only a retained report chunk while the control
exists: trusted `reopen` must now verify the original published state and
**reject the request**, leaving the active close boundary intact. After the
exact chunk is restored, an authenticated owner may reopen with a reason and
the original report remains retained.

**Acceptance boundary:** These are direct Firestore Emulator tests of
the existing server service using synthetic snapshots, **not** a supported
operator restoration procedure, a managed Firestore Backup/PITR integration,
a certified atomic multi-collection restore, a new server recovery endpoint
or approval to perform destructive tests on a live project. They do not
establish a measured RPO/RTO. Even with emulator PASS, section 5 below
remains an unaccepted independent authorization and recovery design gate.

## 5. Real authority restoration — design / approval gate, not implemented

Before any real write, a designated incident owner and independently authorized
financial approver must approve a **separate** migration/restore design that
specifies:

- Recovery source and its provenance, hash verification, completeness, access
  rights, encrypted custody, immutable history and exact UID/project binding.
- Atomic server-owned restoration order (manifest/generation, reports/chunks,
  receipts, control), how conflicting newer records are preserved rather than
  silently rolled back, and what happens on mid-restore failure.
- Report/ledger reconciliation for every closed company and branch; expected
  generation sequence; invariant that historical reports remain addressable
  and old financial debits/credits cannot be duplicated.
- Recovery Point Objective (RPO, tolerable *financial data* loss) and Recovery
  Time Objective (RTO, tolerable outage). **Both are UNAPPROVED / UNDEFINED.**
  Never promise zero loss or a specific number of minutes without evidence.
- Operator privileges, two-person authorization, test UID, explicit dry-run,
  staged QA restore, reconciliation reports, go/no-go signatures and rollback of
  the *software* only if needed. No uncontrolled Firebase restore commands.
- Fail-closed posture for client writes and the consequences for invoices,
  receipts, closed periods and synchronization until server authority is sound.

If these cannot be met, remain in no-write incident mode and escalate rather
than enabling old clients or resetting the accounting period.

## 6. Exit criteria and permanent boundaries

- ✅ Existing source and emulator tests show preventive denial on selected
  control-loss cases. This is **prevention**, not full authority restoration.
- ⬜ Approved DR design, explicit RPO/RTO, operator and finance sign-off.
- ⬜ Complete QA backup + destructive isolated rehearsal + independently
  verified reconstitution of trusted authority and unchanged report hashes.
- ⬜ Deployed Firestore Rules proof (35-B), authenticated cross-UID QA and
  physical Safari acceptance separately.
- ⬜ Current production SHA matched and release decision documented.
- ⬜ Explicit GO/NO-GO authorization before enabling production period service
  or modifying any live financial dataset.

**No commands in this runbook authorize touching customer, owner or production
financial data. Rollback of Vercel code is NOT rollback of financial history.**
