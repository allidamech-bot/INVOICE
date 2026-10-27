# Finance Alif 22 — Source-bound stock ledger QA bridge
Date: 2026-10-27
Status: READ-ONLY, SYNTHETIC, NO-GO FOR LIVE GENERAL LEDGER

## Purpose
PR #1145 made an in-memory trial balance from illustrative financial
journals. Balanced debit and credit alone cannot prove that an inventory
journal agrees with the underlying posted purchase/issued invoice cost.

`src/lib/finance-source-bound-stock-gl-preview.ts` implements an **additional
read-only, source-bound gate** for the narrowly supported subset. It
recalculates existing finance-domain purchase/issue provenance using
`projectPostedValuationEvidence`, checks the candidate against
`inspectIllustrativeInventoryJournals`, and then derives
`previewFinanceInventoryTrialBalance`. All three checks must agree.

### Required, narrow scope
- One item, warehouse, company, branch, asserted functional currency.
- Complete source movement chronology and one exact-identity journal for
  each movement, in the **same order**, with identical source date.
- Only same-currency single-item-line posted purchases with **zero freight,
  duty and other costs**; these cannot be assumed to belong entirely to one
  supplier payable account when there are other expenses/lines.
- Final active ordinary sales invoice stock issues, with existing stock
  provenance proof; COGS is moving average, *not* the frozen invoice unitCost.
- One source debit/credit pair per entry, with exact approved monetary
  minor-unit precision (currently no fractional-cent adjustment).
- Source and candidate integrity checks independently refuse duplicate or
  unknown IDs, wrong accounts, even balanced-but-wrong amounts, currency,
  missing purchase/invoice sources and unsupported movements.

### Synthetic example
Purchase 4 cartons at USD 6 and 2 cartons at USD 10 (no extra landed-cost
allocation), sell 3. Source WAC is USD 22 COGS, with USD 22 gross inventory
remaining. Illustrative trial balance: Dr inventory 22 + Dr sales COGS 22 =
Cr supplier payable 44. A perfectly balanced candidate for sale COGS of
USD 30 **must fail** because it differs from the original WAC cost. This
does not rewrite a historic final invoice's frozen unit cost.

### Still blocked — deliberate
No purchasing/sales financial posting, schema, actual GL, Firebase, vault,
historic invoice, bank/AP balance, cloud rules, production deployment, AI
runtime or period authority is touched. The module does not certify source
authenticity, opening zero, operator signature, legal-entity functional
currency, an external trial balance, real supplier AP liability or a
production ledger.

FX, stock returns, purchase reversals, transfers, adjustments, opening
stock, VAT, shared freight/duty, tax, NRV allowance booking and residual
monetary rounding remain **outside this bridge**. An IAS 2 NRV proposal
has its own #1144 diagnostic, but is not silently accepted into the
source-bound stock GL until its historical allowance and genuine
valuation-source continuity are documented and approved.

The resulting `sourceMatchedWithinSyntheticEvidence=true` means
reconciliation of **supplied test objects only**. It explicitly cannot
change `sourceAuthenticated=false`, `postingApproved=false`,
`generalLedgerVerified=false`, `productionReady=false`, or the
underlying trial balance's authorization flags.

Do not turn this into an automatic GL writer or mark Plan A 22-B/C,
39 or 40 GO. Authorized secure posting, close-period locks, consolidated
multi-product GL, one-time atomic server writes, bank/AP reconciliation,
cost and returns policy, independent acceptance and physical iPhone
testing remain separate tasks.
