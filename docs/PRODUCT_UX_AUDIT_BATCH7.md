# Batch 7 — Operational finance decision and safe foundation

Baseline: main `aaa97505f9a243896ad58275487f311b6ec4789a` after Batch 6 / PR #497.
Decision: **Option A — Commercial / Trading / Business Finance OS**.

## Evidence and authority

| Existing area | Authoritative records / deterministic owner | Boundary |
| --- | --- | --- |
| Receivables and collections | Issued active sales invoices, accounted credit notes and customer payments; `payments.ts`, `receivables.ts` | Drafts, quotations and delivery notes are not receivables. |
| Supplier liabilities/payments | Posted purchase records and linked supplier payments; `operations.ts`, `payables.ts` | Purchase-order documents are not payable balances. No invented AP. |
| Cash and bank | Explicit treasury accounts, opening balances and entries; `treasury-ledger.ts` | Company bank metadata does not create cash. Movement net differs from account position. |
| Inventory and purchase cost | Validated purchase movements, landed-cost allocation, warehouses/transfers | Quantity/cost evidence is not a complete GL inventory valuation or FIFO COGS engine. |
| FX | User-maintained dated rates and deterministic direct/inverse conversion; `fx-rates.ts` | Presentation conversion does not rewrite source currency or silently settle another currency. |
| Management profitability | Issued source documents with reviewed cost metadata; `profitability.ts`, `reports.ts` | Missing cost withholds authoritative profit; these reports are not statutory P&L. |
| Output tax | Active issued sales invoices/accounted credits; `tax-vat.ts` | Input VAT remains explicitly unsupported. No invented purchase tax or tax return. |
| Review and audit | Approval gates, issued snapshots/revisions, event ledger, explicit treasury void/reconcile | AI explains/suggests; existing deterministic engines and user approval execute. |

The current product architecture (`LOUREX_PRODUCT_OS_V451.md`) explicitly protects
operational money engines and prohibits invented accounting capabilities. There
is no current Chart of Accounts, journal-line model, accounting period/lock or
journal-derived Trial Balance/Balance Sheet. A full GL would require a distinct
product commitment, reviewed accounting policies and safe migrations; it is not a
correct incremental addition to this remediation cycle.

## Implemented safe foundation

The existing treasury owner now validates an appended entry **inside the existing
scoped encrypted mutation queue**, against the latest Vault, rather than treating
a rendered payment/account snapshot as authority:

- Unique entry ID; active/unreconciled new entry; active workspace and branch.
- Exactly one current active account for each link, same scope and currency,
  including the formerly permissive zero-accounts case; explicit currency.
- Exactly one current payment source, same scope, unchanged reviewed amount and
  currency, with no other live treasury allocation.
- Customer source traced to a current invoice and existing invoice/payment
  invariant; supplier source traced to a posted purchase and the existing supplier
  payment validator. Authoritative calculation algorithms are reused unchanged.
- Clear Arabic/English source-change error. The disabled displayed amount remains
  the reviewed amount even if newer props arrive. User must reselect/review a
  changed source before retry; no invisible amount substitution.
- Source documents/payments remain unchanged. Existing explicit void and
  replacement preserve correction history; transfers remain currency separate.

This guard applies to new treasury allocations. Historical/imported records are
not silently repaired or reposted. If a canonical source is subsequently corrected,
its existing allocation must be reviewed and explicitly voided/replaced through
the current workflow; this batch does not claim an immutable double-entry ledger
or automatic historical reconciliation. No persisted schema, migration, provider,
package, business calculation, GL route or silent posting is introduced.

## Future full-accounting boundary

If a later product decision selects Option B, implement a separate reviewed
foundation before any automated posting:

1. Versioned Chart of Accounts and explicit accounting/tax/costing policies.
2. Immutable journal entries with deterministic balanced debit/credit per currency,
   source ID/revision/workspace/branch, posting timestamp and policy version.
3. Stable idempotent source keys; user-reviewed posting preview; atomic journal
   persistence; no half-posted source or automatic replay of historical documents.
4. Accounting periods and locks; explicit linked reversal/correction entries rather
   than hidden edits, including dated FX and source-currency handling.
5. Trial Balance/GL/P&L/Balance Sheet derived solely from posted journals with
   source drill-down and reconciliation. Management profit remains separately
   labeled until costing and complete operating expense policies exist.
6. Additive safe migrations with backups/rollback and reviewed historical imports;
   preserve encrypted account/workspace isolation and existing commercial records.
7. Mandatory deterministic balance/post/reverse/period/currency/idempotence/source
   and report-reconciliation tests before enabling posting. AI may suggest an
   account or explain an anomaly, never author authoritative values or approve.

These are future acceptance requirements, not shipped or implied capabilities.

## QA

PASS: TypeScript, production build, static security, dependency audit.
PASS: eight new deterministic contracts plus eleven existing treasury/FX/migration
contracts: canonical source traceability, stale/missing/ambiguous source rejection,
current account/scope/currency checks, duplicate allocation/void correction,
real supplier liability, neutral same-currency transfer, sales/receivables/output-tax
reconciliation and missing-cost profit withholding, Arabic guidance.
PASS: Chromium 320 Arabic and 390 English: real TreasuryLedgerPage with queued
latest-state mutation bridge and encrypted account IndexedDB; stale source rejected,
newer props do not replace the reviewed displayed amount, explicit reselect/review
retries successfully once and removes the already allocated source. No overflow.
No visual design change; no WebKit-specific code or provider calls. Physical
hardware verification is unavailable. Blocking CI must pass before merge.

## Sequential closeout after Batch6

Baseline: main `bffe5c724655f59a76248aeca61c9bf314a5d6ed`, after #504 merged.
Batch6 final HEAD `42f45488`: verify/security/TypeScript/build/contracts/WebKit,
all seven current browser shards and quality gate PASS before merge.
Batches4/5 remain stopped and incomplete by user instruction. They are not
prerequisites for deterministic operational finance; no AI modification is made.

### Product decision retained after commercial review

Option A remains the suitable scope. Batch6 verified the current full-delivery,
invoice/credit/collection and explicit posted-receipt/payment/reversal paths.
These are operational records; acceptance of a quotation does not reserve stock,
a PO does not post stock/AP, and a delivery note does not post COGS. There is still
no journal-derived Trial Balance, statutory P&L or Balance Sheet. Do not fabricate
these outputs from unrelated invoice, purchase or cash totals. The future Option B
requirements above remain a separate product decision, not an unfinished mandatory
implementation in this selected Option A remediation.

### Mandatory Option A acceptance mapping

| Area | Verified boundary / evidence |
| --- | --- |
| Receivables | Active issued invoice, accounted credit and payment owners; Batch6 partial payment/credit reconciles to customer statement; Batch7 as-of credit/void/draft/future-source contract |
| Supplier payables | Actual posted purchases and matching supplier payments; Batch6 draft/no AP and paid-reversal rejection; Batch7 canonical source/scope/currency contract |
| Treasury cash position | Explicit opening balance/account entries; new contract confirms130.00 position while movement net is30.00, and explicit allocation void restores source movement without double counting |
| Transfers / FX | Same-currency transfer is operationally neutral; cross-currency transfer rejected; existing dated FX presentation remains separate from settlement |
| Management sales/profit | Recorded source costs, separate currencies and unknown-cost withholding; as-of full credit reconciles sales/profit/receivables; visible EN/AR report scope now distinguishes gross profit from net profit after all expenses and statutory statements |
| Output VAT | Deterministic active source invoices/accounted credits; new as-of contract reconciles5.00 before credit to0.00 after; draft/void/future sources excluded; input VAT unsupported remains explicit |
| Review / latest-state safety | Real latest-vault allocation guard; existing encrypted browser gate rejects stale source and unreviewed newer props, then explicit review retries once |
| Correction / audit / isolation | Append-only treasury correction via explicit void/replacement; duplicate source rejected; account/workspace/branch/currency checks; no source document/payment rewrite or historical automatic reposting |
| Schema / storage / accounting policy | Existing owners retained; no GL, accounting-period model, schema migration or deterministic calculation change; report wording uses the existing presentation owner |

Two additional compiled contracts cover opening-position/movement separation and
as-of invoice/credit/receivable/VAT reconciliation. The existing eight foundation
contracts remain unchanged. The report scope note sits after the current tables,
preserving the compact header and first-metric placement; printed output also
states its management scope. Local acceptance and final closeout PR evidence must
pass before merge. Hardware verification remains unavailable, not claimed.

Local closeout PASS: full production build/TypeScript;21 compiled contracts
(ten foundation + eleven treasury/FX/migration); encrypted Treasury latest-state
review/retry at320 AR and390 EN; Reports recovery, stock/planning acceptance at
320 AR/dark,390 EN/light,820 AR/light,1440 EN/dark; visible report scope at320 AR
and390 EN with screenshot inspection; diff check. Required remote checks apply
to the final published closeout HEAD. Completion takes effect only when this
closeout PR is merged with every blocking gate PASS; no pre-merge completion is claimed.
