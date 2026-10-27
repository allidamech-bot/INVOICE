# Finance Alif 22-B/C — prospective inventory valuation policy and engineering boundary
Date: 2026-10-27

## Owner authorization and selected accounting formula

The owner delegated the accounting-method choice for LOUREX INVOICE. The selected default for **ordinary interchangeable stock** is the **perpetual moving weighted average**. The policy is based on IAS 2 paragraph 25–27 (weighted-average cost may be calculated as shipments are received). Stock that is not ordinarily interchangeable or is segregated for an identified project requires specific identification, **not forced weighted averaging**. The same formula must be applied consistently to inventories of similar nature and use.

Sources:
- IFRS IAS 2: https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/
- IAS 2, paragraphs 23–27: https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ias-2-inventories.pdf
- IFRS IAS 21, initial recognition (paragraph 21) and historical cost (paragraph 23): https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/

**Do not assume USD (or the invoice currency) is always the legal entity's functional currency.** Functional currency must be documented by an authorized company operator, based on the primary economic environment (IAS 21), before production valuation. The default app currency is a UI setting, not proof of functional currency.

## Delivered in the isolated engineering stage

`src/lib/inventory-moving-average.ts::calculateMovingWeightedAverage` is a pure, deliberately non-connected engine for **one identified product, workspace, branch and warehouse**. Its ordered evidence stream has explicit sequence and transaction dates. For receipts it records original currency, actual landed unit cost and (only if necessary) dated direct FX evidence (source, identifier, rate, from/to currency); it refuses absent or mismatched FX rather than inventing a conversion. For issues it uses current carrying value divided by units. A return uses the linked original issue's cost (including residual rounding), not the current new average. Depletion clears residual carrying value; partial issues retain sub-cent precision until accounting-rounding rules are separately approved.

Example, one warehouse, functional USD:
- receipt 4 cartons × landed USD 6 = USD 24
- receipt 2 cartons × landed USD 10 = USD 20
- carried 6 cartons / USD 44; average USD 7.333333333333/carton
- issue 3 cartons => modeled COGS USD 22; remaining 3 cartons / USD 22
- by comparison: **old latest-unit-cost snapshot** could imply USD 30; neither result rewrites any historical invoice

### Fail-closed boundaries

This stage does **not**:
- change `postPurchase`, `postIssuedInvoiceStock`, `calculateProfitability`, catalog `lastUnitCost`, PDFs or financial reports
- read, post, backfill or revalue production data; change schema, Firestore Rules or period authority
- infer missing opening stock value from catalog last cost, migrate the old inventory ledger, invent exchange rates, or rewrite issued invoices
- accept warehouse transfers, stock adjustments, purchase reversals, physical returns without an original modeled sale, unique items, negative stock, or non-evidenced receipt valuation as a completed posting policy
- represent a certified IFRS financial statement: lower-of-cost-and-net-realisable-value write-downs, tax, cost variances, period lock, cross-device race controls, approval/audit and monetary journal rounding are separate gates

Foreign-currency valuation currently requires an **exactly dated** supported direct rate; future approved alternatives must have a documented rate policy rather than interpolation or automatic use of the latest FX quote.

## Mandatory steps before production adoption

1. Authorized operator documents functional currency **per legal company**, stock-item interchangeability classification, opening balances with original supporting documents, and cutover date.
2. Establish immutable movement order and scope/warehouse allocation, supplier landed-cost policy, handling charges and FX evidence snapshots. Determine same-day chronology. Validate account-specific data completeness using **isolated test identities**, not real users.
3. Implement complete audited transfer, reversal, adjustment, physical return, valuation-allowance / NRV, stock locking, period closing, and idempotent two-device posting semantics; address item IDs where one purchase contains multiple lines for same product.
4. Define cent-rounding, COGS/carrying-value posting and reporting reconciliation; reconcile receipts, remaining stock, returns, AP and GL journals with independent accountant acceptance.
5. Only then authorize prospective cutover. Historical finalized invoices and movements remain immutable; any correction or migration requires separately approved controlled journal/workflow and sign-off.

**Current acceptance: implementation foundation only; Alif 22-B/C remains PARTIAL / NOT READY FOR LIVE ACCOUNTING.** The CI tests are synthetic and cannot establish real owner QA, published security rules, functional currency or production accounting policy sign-off.
