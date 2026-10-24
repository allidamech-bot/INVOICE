# Original finance item 22 — mixed-price stock cost: bounded evidence (24 October 2026)

**Scope:** accounting and data integrity only; no AI, runtime policy change, production deployment or financial revaluation.

The existing source paths have distinct purposes:

- `src/lib/operations.ts::postPurchase` calculates/records landed unit costs per posted purchase line and creates immutable historical receipt movements. Each recorded purchase uses its own currency. It also replaces the catalog item's `lastUnitCost` and `lastCostCurrency` with the most recently posted line for that item, without recomputing a weighted average.
- `src/lib/invoice-stock.ts::postIssuedInvoiceStock` debits quantities **only** for final issued invoices, once per invoice line, using the catalog's `lastUnitCost` and `lastCostCurrency` at the moment of issue. It does not assign FIFO/weighted-average cost layers. Existing sale debit history is immutable.
- `src/lib/profitability.ts::calculateProfitability` calculates sales gross profit from the **invoice line's own `unitCost`** and internal cost fields; it does not derive COGS from historic inventory layers. A line with missing cost is flagged incomplete in the existing reporting path.

The narrow synthetic test `tests/finance-mixed-purchase-cost-provenance.test.mjs` demonstrates two USD purchases with distinct actual landed costs (6.00 and 10.00 per carton); issuing 3 cartons once at the then-current 10.00 cost; negative-stock protection and immutability of the prior issue after a separate later EUR purchase updates the catalog to 15.00 EUR. It proves preservation of historical amounts/currency and quantities. It does **not** approve 10.00 as the correct COGS under an undefined company accounting valuation policy.

**Explicit owner decision still needed before changing cost accounting:**
How should mixed-purchase inventory and invoice COGS be valued (FIFO, periodic or perpetual weighted average, or another method), for each product/warehouse and with FX conversions at documented rates? How should historical returns, zero/negative stock, charges, and cross-currency purchases be handled? No new valuation engine, retroactive revaluation, bulk migration or journal was implemented. Original item 22 remains **partial**, not accepted.

The test suite is synthetic and does not touch customer data. Actual multi-device, accounting-period, and financial-report reconciliation are separate acceptance gates.
