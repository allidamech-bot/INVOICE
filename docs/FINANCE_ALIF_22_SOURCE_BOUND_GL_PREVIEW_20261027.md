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
- Only same-currency **single tracked-item-line posted purchases**. The
  complete posted purchase payable (base line + freight + duty + other costs)
  must match the exact modeled stock receipt valuation, not merely the
  `landedUnitCost` copied from the purchase to the inventory movement.
  A purchase with several lines or external vendor fees remains unsupported;
  this bridge never credits an entire supplier liability to just one of
  several item-specific valuation streams.
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
stock, VAT, shared/multi-line freight/duty, external carrier liabilities, tax, NRV allowance booking and residual
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


## 29 October 2026 — Single-line landed-cost AP integrity, source-bound only

The original source-bound preview could verify the purchase line's
`landedUnitCost` against the inventory movement but did **not** reconcile
either to the independent original posted purchase total. If a synthetic
actor changed both `landedUnitCost` and the movement/unit-cost proof,
then provided equally inflated journal amounts, a candidate balanced
inventory/AP entry could be treated as internally matched while the
original purchase's base cost + freight/duty/other expense total was
unchanged. This is a confirmed **candidate-ledger evidence gap**, not
evidence of actual posted financial corruption.

The read-only bridge now independently recomputes `purchaseTotals(purchase)`
from the source's `unitCost × quantity` and its posted freight, duty and
other purchase charges. For an unambiguous **one-line tracked purchase
only**, it demands exact agreement of that entire original payable amount
with the 12-decimal receipt carrying-value delta. A matching proposal
may include documented *same-purchase* landed charges if their valuation
reconciles exactly in the currency's minor units. Forged stock/landed
values and source totals changed without a corresponding stock receipt
fail closed. Sales COGS continues to follow WAC rather than frozen
invoice unit cost; fractional-cent results remain blocked without an
approved residual policy. Existing zero-charge examples remain covered.

**Illustrative synthetic example:** 4 cartons × USD 6 + freight USD 4 +
duty USD 2 + other costs USD 2 = original purchase payable USD 32;
4 cartons arrive at USD 8 landed/unit. Another receipt is 2 × USD 10 =
USD 20. Sale of 3 cartons after both receipts has modeled WAC COGS USD 26,
remaining inventory USD 26 and an illustrative Cr supplier payable
total USD 52. This is NOT proof of actual supplier debt, nor proof that
a tax, charge, external carrier invoice, expense capitalization or cash
payment has been approved.

**Hard limitations:** no external carrier AP, no multi-line/multi-warehouse
apportionment, mixed tracked/nonstock rows, taxes, FX, returns, NRV/allowance,
historical source authentication, independent opening, signed functional
currency, real supplier settlement reconciliation, durable GL, period
authority or production enablement. No migrations, rules edits or writes.
Axes 22, 35-B/C, 39 and 40 remain NO-GO until separate approvals and
integrated acceptance. The bridge remains strictly a diagnostic.


## 29 October 2026 — Complete multi-item purchase cost / AP source reconciliation

`src/lib/finance-multi-item-source-gl-preview.ts` is a separate **read-only**
multi-product candidate-audit bridge. It does not relax the prior single-item
bridge, which remains deliberately single-product and single-purchase-line.

Supported evidence contract, **synthetic and unapproved for actual posting**:
- One explicit company/branch/warehouse, one caller-asserted functional currency,
  complete ordered source stock movement IDs, one distinct candidate journal for
  each supported physical receipt/ordinary final-invoice issue.
- All posted purchases in the supplied complete source set must consist only
  of unique, stock-tracked product lines. Each line must have exactly one
  source receipt. Partial receipts, nonstock expenses/lines, ambiguous repeated
  item IDs in the same purchase, reversed purchases and other movement types
  are rejected. VAT or charges payable to separate vendors are not modeled.
- Recompute the currently implemented purchase landed-cost distribution with
  `allocateLandedCost(purchase)` using its ORIGINAL base unit costs and
  freight/duty/other values. Every posted line's `landedUnitCost` must agree,
  so a compensating reallocation between two lines **does not** pass merely
  because the original total purchase amount remains unchanged.
- Compute exact WAC on separate full product histories through
  `projectPostedValuationEvidence`. Validate each candidate inventory/COGS
  debit/credit and the final invoice stock identity; enforce original global
  movement order and all tracked invoice lines. Do not equate a frozen invoice
  cost estimate to true WAC COGS.
- Aggregate all receipt value changes at **purchase level**, once, and compare
  with the independently recomputed full original purchase payable from
  `purchaseTotals`. Candidate AP account credits may be split across item
  source journals for this proof, but their sum must equal the purchase's
  actual original payable **exactly**, and the aggregate illustrative trial
  balance must reconcile to every item's inventory value and COGS.
- Do not silently round fractional accounting minor units: the existing
  isolated exact-money validators still reject any source cost for which the
  required residual policy has not been signed.

Illustrative source: two distinct items purchased on one posted purchase:
4 cartons A × USD 6 + 2 cartons B × USD 10 + freight USD 6 + duty USD 3 +
other USD 2 = original supplier payable **USD 55**. The already implemented
allocation attributes USD 6 of charges to A and USD 5 to B, making
receipts A USD 30, B USD 25. After an ordinary final-invoice issue of
2 units A and 1 unit B, WAC COGS is **USD 27.50** and remaining inventory
is **USD 27.50**. Combined candidate entries show credit AP USD 55,
debit inventory USD 27.50 and debit COGS USD 27.50; no payable is counted
twice. A second receipt on A at a new price exercises independent per-item
chronology.

**Important:** this is validation of the **existing application allocation
algorithm**, NOT an accountant's endorsement that every freight/duty/other
component qualifies for stock capitalization or that those charges are owed
to the same supplier. Inputs are caller-supplied, not signed/attested; missing
opening proof, historical source approvals, true company functional-currency
determination, multiple locations, specific-identification inventory, refunds,
tax, FX, adjustments, reversal, return, NRV, rounding-residual authorizations,
actual AP settlement, authenticated durable journals, trusted period control,
security review and independently reconciled GL/TB all remain outside scope.

There is no new API handler, production GL, Firestore write, finance cutover,
Rules publication, data migration, customer modification or Vercel deployment.
Results always report `sourceAuthenticated=false`,
`allocationPolicyApproved=false`, `postingApproved=false` and
`productionReady=false`. The seven-gate Plan A remains **NO-GO** for
full finance acceptance and live GL activation.
