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
