# Finance Alif 22 — Firestore atomic GL QA, **emulator only**
**Date:** 28 October 2026
**Status:** isolated QA rehearsal — **no production activation; 22-B/C, 39 and 40 NO-GO**

## Objective and strict scope

PR #1145 created an illustrative trial balance. PR #1146 added source-bound
purchase/issue WAC verification. PR #1147 added an in-memory, side-effect-free
transaction contract. None of these is an authenticated, durable live GL.

This increment tests **actual Cloud Firestore transaction mechanics**, only in
`demo-lourex-gl-qa` and only when `FIRESTORE_EMULATOR_HOST` equals a local
loopback host. The new adapter is stored under `tests/helpers/` and is
imported only by a Node integration test. It is **not** an API endpoint, a
deployable GL adapter, a security-rules change, or an accounting release.

The test enrols a synthetic UID using the existing trusted period service,
then persists **artificial** finance valuation evidence and a rehearsal ledger
under newly scoped, test-only namespaces:
- `users/{qaUid}/financeGlQaSources/{scopeKey}` — candidate source snapshots,
  asserted chart of accounts and as-of date; not authenticated business proof.
- `users/{qaUid}/financeGlQaLedgers/{scopeKey}` — small copied QA candidate
  ledger, revision, control generation, source digest and operation receipts.
- `users/{qaUid}/financeGlQaJournals/{journalId}` — isolated candidate
  journal snapshots.
- `users/{qaUid}/financeGlQaReceipts/{opId}` — isolated operation receipts.

The service reads, in the **same** `db.runTransaction`:
the real demo account's trusted `accounting/control`,
`workspace/meta`, QA source snapshot, QA ledger, prior operation receipt,
and previously stored journal documents. It refuses missing enrollment,
malformed boundaries, owner/scope mismatches, unrelated source revisions,
tampered source digest, lost receipt/journal, stale generation or version,
wrong WAC cost, duplicate IDs, or backdated entries.

It buffers a journal document for **every** supported stock movement, an
operation receipt and a ledger CAS revision in one transaction. A fault injected
after all buffered writes must leave **zero** committed documents. Competing
demo writers must produce exactly one winner. A replay of the exact successful
operation ID is read-only; reuse with altered payload is rejected.

## What is not proven

The only caller identity is a **synthetic fixture**, not a verified Firebase
Auth bearer token. Synthetic QA source documents were explicitly seeded by
the test and are not an attested company ledger, independent accountant
approval, or complete source chronology for live users. The present inventory
WAC + NRV source bridge continues to reject unsupported sources and monetary
rounding. Trial balances are calculated from candidate test records only.

No activation flag, real Firebase project, production Firestore Rules,
security-role grants, external GL schema migration, customer journals,
production period operations, Vercel deployment, or LOUREX AI code was changed.
Real server auth, immutable source reads/locks, historical carry-forward,
allowance accounting, reversal/return policy, nonzero landed-cost AP/tax,
multi-item/multi-warehouse aggregated books, functional currency approval,
published Rules verification (35-B), managed DR, two-device owner QA and
physical iPhone Safari acceptance are **separate unaccepted gates**.

The test is deliberately **not** reusable for production: turning it into
a real posting endpoint without a finance/security design and explicit
owner authorization would be unsafe.

## Test execution

`finance-gl-atomic-emulator-22.yml` uses the same pinned local Firebase
Emulator as the existing period-server acceptance, on a **different**
`demo-*` project ID. It invokes just the new scoped integration suite.
Do not run broad financial/AI QA workflows solely for this acceptance; if
GitHub CI invokes a global build, that is not an authorization to edit AI.
