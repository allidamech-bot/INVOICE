# LOUREX INVOICE — Alif axes 39–40: isolated live-finance acceptance

**Date:** 27 October 2026  
**Status:** **NO-GO for final acceptance until independently signed.**  
**Scope:** finance only, not LOUREX AI or its document controller.  
**Deployment owner:** the product owner publishes Vercel. This protocol never
publishes, changes Firestore Rules, creates real customers, or revalues posted stock.

This checklist is *not* a list of newly discovered defects. Code and emulator CI
already cover the synthetic stock → invoice → AR/AP → cash/bank lifecycle and
several two-device races. **Those tests cannot certify the production auth,
deployed Firebase Rules, actual iPhone Safari, or an operational server-authority
restore.** The finance acceptance register is
`docs/FINANCIAL_WORK_REGISTER_20261023.md`.

## 1. Preconditions — no live financial mutations by this checklist

- The owner supplies a **separate, explicitly approved QA environment** and
  two authorized QA identities. Never select an existing real customer,
  supplier, financial company, bank, owner UID, tenant or posted period for
  destructive testing. If only the real production workspace is available,
  **stop**; code tests remain the evidence until an isolated environment exists.
- Record reviewed GitHub commit, Vercel production source commit, deployment
  state and UTC times. Both SHAs must match the *same* release selected for QA.
  A READY deployment alone is not finance acceptance.
- Obtain separate, read-only [published Firestore Rules](../FINANCIAL_WORK_REGISTER_20261023.md)
  release source, complete release/ruleset metadata, exact SHA comparison and
  security approval (35-B). GitHub checkout source cannot establish deployment
  parity. Do not run a browser that consumes credits or use a Firebase token in
  GitHub. The read-only Cloud Shell inspector is
  `scripts/inspect-live-firestore-rules.mjs`; it does **not** certify 35-C.
- Do not activate period-control server features or restore server-owned
  authority as part of these manual financial transactions; that has a
  separate privileged operational DR approval gate.

## 2. Minimal controlled finance scenario (QA company A / main branch)

Use purely synthetic names prefixed `QA-ALIF-`; set the test document's
VAT/discount/shipping/other charges to **off** so expected numbers are stable.
One currency, USD. Start with an empty bank and zero stock in the isolated QA
company and branch. Evidence must include before/after balances, document
identifiers, the applied revision and redacted screenshots or immutable log
hashes in an access-controlled location, **not this repository**.

| Step | QA action | Strict expected result |
| --- | --- | --- |
| F01 | Create tracked carton `QA-ALIF-CARTON`; save a posted purchase of **200 × $6.00** | Purchase total **$1,200.00**; physical stock **200** |
| F02 | Save a *draft* sales invoice for **20 × $10.00** | Stock remains **200**; no issued stock movement; no AR from draft |
| F03 | Finalize the same invoice exactly once | Stock **180**; exactly one immutable issue for **−20**; sales invoice **$200.00** |
| F04 | Refresh/reopen/retry the same completed invoice | Stock still **180**; **no second issue** |
| F05 | Record a $50.00 customer receipt against invoice | Invoice AR **$150.00**; no bank credit until deliberately allocated |
| F06 | Record a $30.00 supplier payment against posted purchase | Supplier AP **$1,170.00**; no bank debit until deliberately allocated |
| F07 | Open bank ledger with **$100.00** synthetic opening balance, allocate the **$50** receipt and **$30** payment once each | Bank closing balance **$120.00**; signed inflow **$50**, outflow **$30**, net **+$20**, zero phantom/unallocated cash for those items |
| F08 | Attempt second allocation of the same receipt, a stale change to an allocated payment and an invoice selling 181 additional cartons | All operations rejected with no extra cash, stock or AR/AP movement |

For the cost of goods sold, **do not approve any COGS or profit number from
this scenario**. The owner selected **perpetual moving weighted average** for
homogeneous, interchangeable inventory on 27 October 2026; non-interchangeable
or specifically assigned items require separately supported specific cost.
This choice is settled, but functional currency, opening balances, authoritative
movement order, FX, returns, journal rounding, independent GL reconciliation,
and production cutover remain unapproved. The $6 purchase unit cost here is
a synthetic QA fixture, not approved book COGS.

## 3. Separation, concurrency, mobile and DR checks

| Gate | Procedure and required evidence | Stop condition |
| --- | --- | --- |
| F09 — two devices | Two separate authenticated sessions on the *same isolated QA company*: A creates a receipt/bank allocation, B creates supplier payment/bank allocation, synchronize both orders, then independently replay/void | Double settlement, lost posting, changed immutable receipt, or mismatch of AR/AP/bank |
| F10 — two UIDs | QA identity B attempts to read/write identity A's private financial data using **authorized test identities only**; A still reads/writes its own | Any cross-UID access, broken owner access, or no proof of actual deployed Rules |
| F11 — company/branch | Create an isolated second QA branch/company; confirm neither its movements nor reports reduce A's AR/AP or cash position | Cross-company/branch bleed or reclassification |
| F12 — physical iPhone | On a **real** iPhone Safari/PWA, show that invoice preview equals the exported saved PDF, print/Share Sheet works, Arabic RTL is intact across a long multipage document, and the keyboard permits form save | Only desktop WebKit screenshots, mismatched preview/PDF, failure to share/print |
| F13 — trusted period DR | **Operator-only**, approved isolated demo environment: restore server-owned report chunks, receipts, manifest and period control; verify original hashes and deny new writes when restore is incomplete | RPO/RTO unsigned, only a business Vault restore, mismatched authority, or tests on a real customer |

Axis 4 (posted purchase document) stays **DEFERRED**. Do not implement or
make that feature a hidden condition of this QA acceptance.

## 4. Evidence format and release decision

For each independently reviewed gate, keep **the SHA-256 of one immutable,
redacted, access-controlled evidence artifact** and a reviewer identifier /
UTC review time. Keep the underlying files and access logs outside GitHub.
Never put credentials, Firebase UIDs, real customer names, production invoices,
personal data, or financial secrets in the evidence JSON.

`scripts/finance-alif-acceptance-evidence.mjs` checks the *completeness*
of a private `LOUREX_ALIF_FINANCE_EVIDENCE_V1` JSON dossier, with seven named
gates: `financeCycle`, `twoDevice`, `publishedRules`, `crossUid`,
`physicalIphone`, `authorityRecovery`, and `costPolicy`, plus matched
reviewed release SHAs, distinct proof hashes, and independent finance,
security and release reviewer details.

Usage *after evidence exists* on the operator's own local machine:

```bash
node scripts/finance-alif-acceptance-evidence.mjs /private/path/alif-finance-qa-evidence.json
```

If anything is absent or contradictory, it prints
`NO_GO_EVIDENCE_INCOMPLETE` with **field names only** and exits with code 2.
If all fields are present, it prints
`READY_FOR_INDEPENDENT_HUMAN_REVIEW_ONLY`; this is **never** a GO approval,
proof of source authenticity, a legal digital signature, or permission to
deploy. A human release owner must independently inspect the underlying
proof artifacts and explicitly decide signed GO/NO-GO. An otherwise complete
synthetic/mock dossier can pass *completeness* checking but **cannot serve as
authentic evidence**.

### Release blockers already known at this checkpoint

- **35-B**: current published Firestore Rules source/release proof still missing.
- **35-C and finance acceptance**: separately authorized live two-UID,
  two-device isolated QA not completed.
- **22-B/C**: moving weighted-average **method selected** for interchangeable stock; functional currency, source chronology, opening value, FX/returns, complete COGS/GL postings and cutover **remain unapproved**.
- **30–33**: physical iPhone acceptance not completed.
- **37–38**: managed operational period-authority recovery, approved RPO/RTO,
  and independent incident authorization not completed.
- **39/40**: the combined independent finance/security/release signoff is
  therefore **NO-GO / NOT ACCEPTED**.

No action in this document authorizes production mutations, rule publication,
any new user account, financial data deletion, or Vercel promotion.

## 28 October 2026 — policy-evidence gate clarification

The offline `finance-alif-acceptance-evidence.mjs` completeness checker now
requires `gates.costPolicy.method = PERPETUAL_WEIGHTED_AVERAGE` for the
**selected default**. It must reject `FIFO`, `PERIODIC_WEIGHTED_AVERAGE`, or a
specific-identification exception misrepresented as the universal default.
Specific-identification stock needs its own item-level independently approved
cost evidence; this simple dossier field does not certify that coverage.
This check tests document-field consistency **only**, not the authenticity of
approvals, financial policies, postings, real QA or production readiness.
The separate `returnsAndFxApproved` field must still be independently proven.

## 28 October 2026 — published-Rules evidence binding

For the private 39/40 dossier, the `gates.publishedRules` record must now
carry the locally captured `checkoutCommitSha`, `releaseRecheckMatched`,
`differenceStatus`, `rulesetCreatedAt`, `releaseUpdatedAt`, and
`capturedAtUtc` from the **operator's own read-only 35-B evidence**. The
checkout commit must match `release.githubMainSha`; the published release
must have been stable across the GETs; matching live/repository hashes must
correspond to `BYTE_IDENTICAL_SECURITY_REVIEW_REQUIRED`. The order
`rulesetCreatedAt <= releaseUpdatedAt <= capturedAtUtc <= checkpointUtc`
must hold; `publishedAt` denotes the **actual release publication time** and
must equal `releaseUpdatedAt` as an instant (never the later evidence
capture time). The gate reviewer cannot sign before capture.

The checker enforces **field consistency only** and cannot verify a fabricated
manifest or validate live authentication; keep original artifacts with secure
access controls and require independent security signoff. Prior mock/CI success
is not production proof and does not change the 39/40 NO-GO.


## 29 October 2026 — Fixed-candidate acceptance status; NO-GO unchanged

The 29 October finite reconciliation is recorded in
`docs/qa/FINANCE_ALIF_34_39_EVIDENCE_MATRIX_20261028.md`
under **"29 October 2026 — Consolidated finance acceptance checkpoint"**.

- Finance PRs #1158–#1164 are merged on GitHub through `88146e5c295bc01bf2c4b0436717067fb233cd74`; their passing automated source/GL tests are **not** a posted GL, official opening balance, or signed F01–F13.
- The production alias was observed as `READY` at `e7de8041e7145f86f684eb7068efda97d89c2175`, **not equal** to current main. A deployment of the fixed candidate belongs exclusively to the owner.
- The operator-observed 35-B read-only Rules capture reported stable published release and `SOURCE_DIFFERENT_RISK_NOT_ASSESSED` against checkout `358cd40...`. The private Rules diff was not independently reviewed, and 35-C real-QA two-UID evidence is not complete. Do **not** mark `gates.publishedRules` complete or claim production Rules parity.
- The seven gates remain separate: `financeCycle`, `twoDevice`, `publishedRules`, `crossUid`, `physicalIphone`, `authorityRecovery`, `costPolicy`. A passing evidence JSON schema never substitutes independent finance/security/operations/release signoff.

**Current human release decision: NOT SIGNED / NO-GO.** Future work should gather these exact external proofs once, on one explicitly authorized isolated QA candidate; no additional Cloud Shell instructions to the owner, live finance posting, Firestore Rules change or Vercel publication is authorized by this document. Axis 4 is still deferred.


## 29 October 2026 — Independent final-signoff chronology defect repaired

A previously complete `LOUREX_ALIF_FINANCE_EVIDENCE_V1` could pass the offline
*completeness* checker even if its finance/security/release signatures were
dated **before** one of the seven required gate reviews, or if another gate
was reviewed after the declared dossier checkpoint. The checker also lacked
an explicit operations signoff, despite the independent RPO/RTO and
server-authority recovery approval requirement in axes 37–40.

The validator now requires, in addition to the existing fields:

- `signoff.operations.reviewer` and `signoff.operations.reviewedAt` for the
  operations/incident recovery owner, alongside finance, security and release.
- Four **distinct**, non-placeholder reviewer identifiers across these four
  signoff roles. A reviewer repeating the same name under a different casing
  is not evidence of an independent approval.
- The seven gate reviews must occur **no later than**
  `checkpointUtc`; each final signoff must be dated **at or after the last
  gate review** and **no later than** `checkpointUtc`.
- Impossible calendar dates fail timestamp validation; valid timezone-offset
  timestamps describing the same instant remain valid.

These rules apply to the private dossier when genuine approvals are later
collected; they do not fabricate approvals, read personal evidence, test a
live site or publish a `GO` decision. Existing **synthetic** examples may
satisfy the schema but are never a real accounting, security, operations
or release signoff. Artifacts and reviewer identity remain private.

**Current observed 29 October release identity:** GitHub `main` after
finance #1177 was `b8eb0af59dff139fb5527d52cb057f4717e49445`;
the owner-controlled Vercel production deployment was `READY` but still
sourced from `3e59485b6f758aada523e22c3ce68347976eaae3`.
The unequal SHAs are a production release-identity blocker, not proof
of a production accounting defect. No deployment was attempted.

35-B published Rules independent security review, real isolated cross-UID
finance QA, device acceptance, full accounting policy and trusted authority
restore approvals are still required. No new Cloud Shell experiments or
production-period/GL activation are authorized here; **NO-GO** remains.
