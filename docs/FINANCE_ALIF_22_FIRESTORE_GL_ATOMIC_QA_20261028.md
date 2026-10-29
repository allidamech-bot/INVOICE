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

## Server-owned session epoch and revocation QA — 28 October

A valid, signed Firebase owner token can remain valid after a privileged
financial role or user session is withdrawn. The original Firebase
signature verifier returns a UID and role, but does **not** independently
prove live revocation or a non-disabled account. A live General Ledger must
never claim otherwise.

The **test-only verified-owner gateway** now requires an explicitly
hardened QA Firestore service (`requireCurrentOwnerSession=true`).
After verifying the JWT signature using the **existing unchanged**
Firebase verifier, it reads `auth_time` and `iat` from that **already
verified** JWT payload. These cannot be injected through command or request
body.

Inside the **same Firestore transaction** used to validate original
inventory source, period authority and GL revision, the hardened adapter
reads a **server-owned demo session policy document** at
`users/{qaUid}/accounting/control/financeGlQaOwnerSessions/{scopeKey}`.
It requires owner identity, legal-entity scope, active permission,
structural integrity and an `auth_time` **strictly later** than
`tokensValidAfterSeconds`. Missing, disabled, corrupt or changed policy,
and a revoked older session, fail closed **before idempotent replay** and
before any proposed journal, receipt or ledger CAS write.

The emulator acceptance additionally verifies that the checked-in local
Firestore Rules deny a client write to the new session-policy namespace.
A signed but disabled owner cannot replay prior success. A signed but
revoked owner cannot create even the first journal; re-authentication after
the cutoff recovers access only to the isolated synthetic account, with
no duplicate historical booking.

This remains a **simulated revocation epoch** managed entirely in
test fixtures. It is NOT connected to Firebase Admin Auth `getUser`,
`verifyIdToken(checkRevoked)`, actual refresh-token revocation, disabled
real accounts, financial approval records, or production user sessions.
The helper's original direct `execute` remains available **for other
isolated QA tests only**, and MUST NEVER be treated as a secure
production endpoint. No live token revocation, role removal, employee
membership, policy authorization or disaster recovery is certified.

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


## 29 October 2026 — historic candidate-replay integrity and period generation

The synthetic atomic contract previously returned an idempotent operation receipt
after checking only the command fingerprint and whether its referenced journal
IDs existed in the in-memory ledger. It did **not** revalidate the stored
historical journal amounts or source valuation on this read-only replay.
In the emulator, changing both the Firestore ledger snapshot and corresponding
journal document could bypass the adapter's document-to-ledger equality check;
if the receipt and request were likewise jointly modified, the old replay
short-circuit had no independent WAC comparison.

The **test-only** contract now:
- Rejects duplicate/missing historic journal IDs or physical source IDs
  even when the sourceKind changes; enforces stored scope, transaction date
  and currency on every prior journal.
- Requires the complete historic receipt-to-journal graph, unique operation
  receipts, valid version/generation, identical source digest, original journal
  IDs and an exact already-committed journal payload on same-operation replay.
- Re-runs the original source-bound stock valuation/COGS and candidate trial
  balance audit **before returning an idempotent replay**. Even an orchestrated
  change to BOTH the stored journal bytes and operation receipt no longer
  qualifies as prior success. The most recent operation receipt's asserted
  trial amounts must match this recomputed synthetic audit.
- Keeps exact same-input, unchanged-history idempotency read-only. A current
  server period generation that differs from the isolated rehearsal ledger
  generation blocks even a stale replay; closing/reopening does not silently
  migrate historic candidate receipts or modify old journal records.
- Has targeted pure contract and **local demo Firestore transaction** regression
  tests for coordinated forged journal and receipt writes, fingerprint
  substitution, duplicate physical source aliasing and post-close generation
  mismatch.

**No evidence of real-book tampering is asserted.** This applies exclusively
to the synthetic, unconnected atomic trial contract and its local Firebase
emulator. The ledger and source objects can still be synthetic/caller-seeded,
the operator role is not finance-verified, and this change does not establish
authenticated durable business journal posting. A source hash or balanced
amount never certifies the original issuer's document.

No live Vercel or Firestore deployment, production database, published Rules,
period authority, AI route or customer record is changed. Alif 22, 35-B/C,
39/40 remain **NO-GO** for production GL activation and independent release
acceptance.


## 29 October 2026 — candidate COA/currency pinning and deterministic QA ledger scope

The isolated finance GL emulator previously allowed clients to choose
`scopeKey` freely while the request specified the same company and branch.
Two different keys could identify two independent candidate ledgers for the
same financial scope. The emulator now requires the SHA-256-derived,
unambiguous `syntheticFinanceGlScopeKey(workspaceId,branchId)` (first
48 hex characters after the `scope-` prefix), recomputed server-side
before any Firestore transaction or write. Arbitrary aliases and
company/branch concatenation collisions are rejected.

Earlier `sourceSha256` fingerprints bound the synthetic original stock
documents, but did not independently bind the candidate chart-of-accounts
mappings, asserted functional currency or accounting as-of controls. The
new `controlsSha256` binds the complete `FinanceGlControls` object at
candidate-ledger enrollment. The transaction checks it against the original
source controls, and the atomic contract checks it before append **and**
before idempotent replay. Historical operation receipts also carry the
control digest, and replay rejects receipt corruption.

Tests exercise:
- an alternate ledger path (same company/branch) and an apparent
  concatenation collision;
- changed AP/Inventory account mappings and asserted functional currency
  after local demo source enrollment, both before posting and after a
  successful operation;
- receipt control-digest corruption while original operation hash remains
  unchanged.

This is **in-test integrity**, not a signature or independent accounting
approval. Firestore QA controls and source snapshots remain created by a
test fixture; a privileged coordinated modification to all of them, including
its ledger anchor, requires separate authoritative identity and immutable
source governance. A correct SHA-256 or balanced TB cannot prove ownership,
source issuer, legal functional currency or approved chart of accounts.
It adds no real GL writer, production schema migration, Firestore Rules
publication, live Firebase writes or application deployment. **NO-GO**
remains in force for Plan Alif 22/35/39/40 cutover.
