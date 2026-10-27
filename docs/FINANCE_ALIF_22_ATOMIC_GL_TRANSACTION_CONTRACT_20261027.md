# Finance Alif 22 — unconnected atomic General Ledger transaction contract (QA)

Date: 27 October 2026

**Status: SYNTHETIC / NO PRODUCTION WRITES / NO-GO for Plan A finance
axes 22-B/C, 39, 40.**

## Where this stage starts

PR #1145 created a read-only, candidate-journal trial balance.
PR #1146 cross-checked such journals with actual *synthetic* posted
purchase and final-invoice stock movement shapes, refusing a balanced but
source-wrong cost. Neither writes an actual ledger.

The existing period service (`api/_accounting/period-store.js`) has
owner-gated server revision and period generation controls, but the
new GL preview is **not** a service endpoint and is not protected by that
service. Never reuse the current `workspaceCommit` operation as a substitute
for atomic, signed GL posting.

## What was added

`api/_accounting/finance-gl-atomic-contract.js` is **never imported by
production API handlers**. Its exported `prototypeFinanceGlAtomicAppend`
is an immutable transaction-state rehearsal. The test harness binds
`verifySourceBoundGl` to the actual isolated
`inspectSourceBoundStockGl` valuation validator from #1146.

The rehearsal expects server-sourced, explicitly identified state:
owner UID, verified workspace/branch scope, existing control generation,
an incrementing ledger version, a complete source digest, period close
cutoff, prior journal rows and prior operation receipts. The test must not
infer genuine authority from these caller-provided in-memory records.

One proposed journal batch is accepted into a **copied in-memory candidate**
only after:
- owner ID and role, active authority and company/branch match;
- exact digest of source snapshot and expected source digest;
- expected ledger version and period generation match;
- every new journal ID and source ID is unique, has a valid date,
  is after a supplied closed-period boundary and uses scoped currency;
- the new complete journal history reconciles with the supplied full
  purchase/invoice/source WAC history;
- exactly one journal ID/source accounting identity is introduced once;
- one source-bound trial balance has matching debit/credit totals;
- one SHA-256 operation fingerprint prevents the same operation ID being
  reused with changed inputs; replay retains its original receipt and
  does not introduce new journal rows.

## Synthetic example

2 cartons at USD 5 are bought (candidate Dr inventory USD 10, Cr
supplier payable USD 10), one is sold (candidate Dr COGS USD 5, Cr
inventory USD 5). The complete history yields gross inventory USD 5
and a balanced candidate trial balance. Retrying the same op returns the
same receipt. A different op targeting the original ledger version is
rejected instead of appending the same source twice.

A source revision change or missing period authority blocks even
an operation receipt replay; a backdated candidate is rejected. A
balanced source-wrong USD 6 COGS rejects through #1146.

## Production gap (must not be skipped)

This module is **not connected** to an authentication middleware, real
Firebase transaction, General Ledger collection, or any persistent
financial account. A locally supplied identity, generation, JSON SHA-256,
period boundary, receipt and comparison is **not** trusted production proof.

The future adapter must read and verify independently, **inside the same
server-authorized atomic transaction**, the authenticated UID, owner
permissions, independently approved functional currency, active server
period control, source-record immutability and revision, source document
values, complete opening history, account mapping, distinct approval
record, actual immutable existing GL postings, operation receipts and
the legal entity. It must serialize concurrent writers via authoritative
CAS and support Firestore constraints; production signoff must prove that
all writes either commit together or none commit. A preliminary hash
checked outside a transaction does not prevent races.

Never expose an endpoint, switch on Firestore Rules, add client posting
controls, migrate historic invoices, move company books or change
production environment settings based on this rehearsal. No production
software code path imports this module.

Full IFRS source valuation, multi-warehouse/multi-currency items,
returns, manual stock adjustments, supplier extra costs, historical
opening, per-currency minor rounding residuals, NRV source history,
approval, managed DR, deployed Rules comparison and actual iPhone
finance acceptance remain separately blocked.
