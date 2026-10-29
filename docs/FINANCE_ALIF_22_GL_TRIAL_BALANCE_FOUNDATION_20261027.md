# Finance Alif 22 — Isolated inventory GL trial-balance foundation
Date: 27 October 2026
Status: ENGINEERING QA ONLY / NOT POSTED / NO GO.

## Why this exists
PRs #1131–#1144 built prospective moving-weighted-average (WAC), original
invoice COGS comparison, exact minor-unit and IAS 2 net-realisable-value (NRV)
calculators, and illustrative debit/credit inspectors. Those source-side checks
did not create a posted General Ledger (GL), a trusted trial balance or a
company-authorized accounting cutover. Do not call source inventory movements
a posted GL.

The new `src/lib/finance-gl-foundation.ts` builds a **pure in-memory,
read-only, fully synthetic** trial balance for five caller-supplied accounts:
gross inventory asset, supplier payable, cost of goods sold, contra-asset
inventory NRV allowance, and impairment expense.

A strictly dated, ordered, one-currency / one-company / one-branch collection
of proposed journals may contain only:
- purchase receipt: Dr gross inventory / Cr supplier payable;
- genuine sales issue: Dr sales COGS / Cr gross inventory;
- NRV write-down: Dr impairment expense / Cr inventory allowance;
- bounded NRV reversal: Dr allowance / Cr impairment expense.

Each journal requires a unique journal ID, unique source movement ID **across
all supported journal kinds**, exact two-line debit/credit direction, exact positive
currency minor units, date at or before the chosen cutoff, and approved *by
the caller only* distinct accounts. Duplicate journals, unbalanced lines,
extra artificial entries, wrong date/company/branch/currency, negative gross
inventory, negative allowance or allowance exceeding gross stock fail closed.
Unknown source kinds (returns, transfers, opening, FX, physical corrections,
cash purchases) require separately authorized journal policies and cannot
enter this rehearsal.

The 29 October 2026 fail-closed acceptance adds two source-integrity checks
to the **unposted** trial-balance rehearsal: a wholly empty journal stream
cannot be presented as an evidenced zero opening balance, and one source
movement/estimate ID cannot be reused by changing journal `sourceKind`
(e.g. using one ID once as a receipt and again as a sale or impairment).
A debit-credit-balanced candidate is still unsupported if its source
identity was reused. Distinct sources still produce the same valid
illustrative totals. This does not authenticate an opening balance, make a
new GL account, post journals, authorize an NRV estimate or activate production.

`previewAppendFinanceInventoryJournal` refuses a **proposed** new journal
on or before a caller-supplied close date. This is an offline diagnostic,
**not** trusted server-side closed-period enforcement or an authorized reopen.

## Reproducible synthetic scenario
Purchase 4 units at USD 6 and 2 units at USD 10, recognize an illustrative
issue cost of USD 22 on a sale of 3 units, then an illustrative NRV write-down
of USD 7. After the four entries:
- gross inventory USD 22 Dr;
- allowance USD 7 Cr; **net inventory USD 15**;
- sales COGS USD 22 Dr; impairment USD 7 Dr;
- supplier payable USD 44 Cr;
- trial-balance **debit balances USD 51 = credit balances USD 51**.

A subsequent bounded USD 3 impairment reversal produces a USD 4 allowance,
net inventory USD 18, and balanced trial-balance sides USD 48.

The focused deterministic tests check that these are *computations from
supplied candidate journal amounts*, not evidence of historical company books.
Prior validators (#1140 and #1144) independently check candidate entry
amounts against separate cost/NRV calculations. Combining those previews
still does not authenticate an actual posting or a complete audit trail.

## NO-GO gates — do not silently waive
1. No authenticated Chart of Accounts, legal-entity functional currency
   determination or individually approved source-document costs.
2. No complete, independently signed opening balances, evidence chronology,
   period cutover, FX / stock adjustment / return / transfer policy or
   authorized final monetary rounding policy.
3. No durable, atomic, idempotent, two-device-safe production GL posting
   service; no posted GL transaction IDs or immutable signed journal chain.
4. No independent actual trial balance, audit reviewer signature, owner
   financial authorization, published Firestore Rules parity, or trusted
   server-side period lock/reopen certification.
5. No real-account, isolated two-identity QA, managed DR signoff or physical
   iPhone Safari final finance acceptance for Plan A axes 39–40.

Therefore all result flags remain false:
`sourceAuthenticated`, `approvalsAuthenticated`,
`periodAuthorityVerified`, `trustedPostingCommitted`,
`independentTrialBalanceVerified`, `productionReady`.
An in-memory preview is never proof that invoices, purchases, stock movements,
payables, historical reports, Vercel production, Firebase Rules or the
accounting period authority have changed. None of those is touched here.

This project must next design and approve a trustworthy posting/storage
contract **before** connecting the isolated core to finance runtime. Keep the
entire LOUREX AI track outside this work.
