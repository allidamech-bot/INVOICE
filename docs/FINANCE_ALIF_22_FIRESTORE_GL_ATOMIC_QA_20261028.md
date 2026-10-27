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
under server-owned `accounting/control` subcollections (emulator only):
- `users/{qaUid}/accounting/control/financeGlQaSources/{scopeKey}` — candidate source snapshots,
  asserted chart of accounts and as-of date; not authenticated business proof.
- `users/{qaUid}/accounting/control/financeGlQaLedgers/{scopeKey}` — small copied QA candidate
  ledger, revision, control generation, source digest and operation receipts.
- `users/{qaUid}/accounting/control/financeGlQaJournals/{journalId}` — isolated candidate
  journal snapshots.
- `users/{qaUid}/accounting/control/financeGlQaReceipts/{opId}` — isolated operation receipts.

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

## Follow-up security and provenance hardening — 28 October

The previous QA source snapshots were independent Firestore documents
linked to the period's manifest by revision only, not matched to its
actual published financial records. Furthermore, the new QA collection
names were initially placed directly under `users/{uid}`, where the
checked-in owner-write Rules could admit them.

Both design weaknesses were corrected **in the emulator-only adapter**,
without publishing or editing Firestore Rules:

- All QA ledger/source/journal/receipt collections now reside beneath
  `users/{qaUid}/accounting/control/`. The checked-in Rules explicitly
  deny client writes to the `accounting` namespace, including this subtree.
  A local Firestore Emulator rule test also attempts four owner-client
  writes and requires four HTTP 403 denials. This is proof of the **local
  checked-in ruleset**, NOT deployed rules parity (Alif 35-B).
- Synthetic posted purchases, issued invoices, and inventory movements
  now exist in the genuine **enrolled period workspace generation**.
  In each GL transaction, the adapter reads the original period generation
  chunks through the same Firestore transaction, validates their complete
  encoded length and SHA-256 using `decodeWorkspace`, and requires exact
  source-array equality to the QA-source snapshot and complete movement
  ordering. Revision equality and a caller-provided hash alone no longer
  qualify.
- Tamper cases independently replace QA source costs while updating BOTH
  ledger/source digests to match the forged data, and corrupt an immutable
  enrolled generation chunk. In both cases the whole proposed accounting
  operation must fail with no new journal, receipt or ledger version.

This is still a **test harness**. The published Vault is an authentic
server-enrolled *snapshot*, but no proof that its original purchase
documents, attachments, invoices or fiscal opening are correct,
approved or complete for real accounting. Period enrollment may adopt
caller-controlled business bytes. A forged older source later adopted
as trusted remains a distinct provenance gap for production use.

The isolated QA adapter remains unconnected to any production endpoint
and accepts only synthetic owner identities. Never infer that real
Firebase credentials, historical GL records, credit balances, audited
COA or independent authorizations have been verified.

## Verified-identity boundary rehearsal — 28 October

The period endpoint already authenticates signed Firebase ID tokens and
restricts the owner role; its existing tests cover JWT project/issuer,
cryptographic signature, role claims, invalid or anonymous sessions and
untrusted request identity. No shared AI authentication or existing
production period-service file was changed here.

The GL QA adapter previously accepted a **caller-supplied** `{uid,role}`
test argument. A new test-only gateway
`createFinanceGlQaVerifiedOwnerGateway` now uses the **unchanged**
`verifyFirebaseIdToken` implementation before calling the same demo
Firestore transaction service, and obtains the UID/owner role solely
from the verified token. It rejects client-supplied identity fields,
unrecognized command fields, employee/admin claims, anonymous or invalid
tokens, wrong Firebase project/issuer, and JWT signed for a different UID.
A valid owner token can post once to **its own synthetic emulator UID**;
its exact replay changes no financial record.

**Critical limits:** The integration test uses an ephemeral locally
generated RSA test key and substitutes only Google's JWKS fetch **in
process**. It never supplies an actual Google credential, never opens
an external Firebase or GL API, and never grants live financial posting.
A valid signature/owner claim is necessary but not sufficient for
financial authorization. Token revocation, disabled accounts, fresh
authoritative team membership, independently signed accounting policy,
COA/legal-entity currency approval and secondary finance approvals
are **not certified by this test**. The underlying owner fallback for
legacy single-UID Firebase tokens is existing functionality and remains
a business-policy decision before activating real GL writes.

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
