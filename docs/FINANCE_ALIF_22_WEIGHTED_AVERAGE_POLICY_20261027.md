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

## Isolated domain-ledger projection gate (27 October, follow-up)

`src/lib/inventory-valuation-evidence.ts::projectPostedValuationEvidence` connects the **actual finance-domain posting shapes** (posted purchase movements and final issued-invoice stock movements) to the pure prospective average engine in a read-only synthetic QA projection. It does **not** activate a valuation method in the live app.

- Callers must provide a **complete, explicitly approved chronology** of all matching in-branch product movements. An array's insertion order is not an auditable timestamp policy; callers carry responsibility for supplying the correct immutable order.
- Every movement/source must have the expected workspace and branch; missing/unscoped legacy movements are refused. Sales stock proofs are compared with final invoice lines; receipt values must match a uniquely identified posted purchase line.
- **29 October 2026 — source-document identity integrity:** read-only posting evidence now demands **exactly one** purchase record for each valued receipt's `sourceId` and **exactly one** final invoice record for each valued issue's `sourceId`. A duplicate source document, even if byte-for-byte equal, is ambiguous and fails closed before WAC, illustrative GL or Trial Balance computations. Previously a first-match `.find()` could ignore the duplicate and calculate a seemingly verified cost from a non-unique source. This change does not deduplicate, delete or rewrite real source records; any existing duplicate IDs require separate independently approved remediation, never a silent choice of the first.
- The 29 October 2026 source-date gate also checks that an actual purchase receipt's `movement.date` **exactly matches** the posted purchase `date`, and an issued-invoice stock movement's `date` **exactly matches** the immutable final invoice `issueDate`. Those are the dates used by their existing posting functions; both dates must be consistent even if each is individually valid and the sequence still sorts. Otherwise a valid-looking date change can alter which receipts contribute to the prospective moving average before a sale. This is an isolated **read-only evidence check**, not a rewrite of prior sales, GL, books or production timestamps.
- The 29 October source-location safeguard also requires **directional warehouse evidence**: a positive receipt/opening cannot name a source warehouse, and a negative invoice issue cannot name a destination warehouse. If the direction-specific field is absent, the branch default location remains eligible only when it equals the explicitly valued warehouse; an opposite-direction field never supplies trusted fallback provenance. This safeguards the **unposted projection** only and does not rewrite historical movements or activate GL/COGS posting.
- Transfers, purchase reversals, unsupported adjustments, voided invoices and verified physical returns are *not* silently skipped or assigned guessed values. They block this projection until the corresponding accounting rules are implemented.
- Old manual opening movements lacking their actual supporting cost evidence are refused. FX cannot be sourced from a catalog's latest cost; it must be identified per receipt and tied to its transaction date.
- The tests use synthetic objects exercised through real `postPurchase` / `postIssuedInvoiceStock` domain functions, and confirm that the old invoice profitability snapshot is **not overwritten**. The projection may calculate a different COGS figure from the current production report; that difference is a documented cutover gap, **not** an automatic accounting adjustment.
- This projection only checks minimal evidence fields; it does not verify authenticity of attached files, approve expense capitalization, reconcile GL amounts, or validate published Firebase Rules. Independent acceptance remains outstanding.

## Read-only two-warehouse transfer value conservation (next engineering gate)

`src/lib/inventory-transfer-valuation.ts::previewMovingAverageWarehouseTransfer` is a pure **single-transfer** acceptance calculator. It takes two independent, verified, chronological warehouse-specific streams from the existing moving-average core and one synthetic `createWarehouseTransfer` record. It computes a proportional **carrying-value** debit in the source and the exact same value credit in the destination, with 12dp precision, without booking COGS or changing the originating catalog's last purchase cost. A full-source transfer moves all remaining value, including roundoff residuals. Existing COGS from earlier sales remains untouched.

Examples:
- East has 4 cartons at 6 USD + 2 at 10 USD => 6 cartons, carrying value USD 44.
- Transfer 3 cartons East -> West: source 3 / USD 22, destination 3 / USD 22, group total still USD 44, **no sale or profit from transfer**.
- If West previously held 2 at USD 12 (USD 24), post-transfer West is 5 / USD 46 (average USD 9.20) and total is conserved at USD 68.

The simulator refuses missing stock or source scope, wrong warehouse pair, duplicate known transfer identity, future events dated after transfer, unsupported source costs and foreign FX without evidence. Actual `createWarehouseTransfer` and warehouse delta functions are exercised by synthetic tests.

**Hard boundary:** This is not an end-to-end multiple-transfer posting engine. The pre-transfer streams must be complete, verified and auditable; the calculator does not establish their authenticity. It does not post stock movements, mutate accounts, book inter-warehouse transit/in-transit accounts, handle overhead/cost additions, returns, purchase reversals, stock losses, NRV, intercompany transfers, monetary journal rounding or period authority. The existing read-only posted-ledger projector still rejects transfer movements. Full Alif 22-B/C remains PARTIAL / NO-GO until separate real multi-warehouse accounting acceptance and owner-approved cutover.

## Read-only supplier purchase reversal reconciliation gate (27 October)

`src/lib/inventory-purchase-reversal-valuation.ts::previewMovingAveragePurchaseReversal` is a stand-alone **not-booking** cost simulator for a documented full purchase reversal. It accepts one reversed purchase, its original receipt and the newly appended reversal stock movement from the existing LOUREX `reversePurchase` domain function, plus a caller-supplied *complete/approved* preceding chronological WAC stream. Strict receipt-to-source matching, currency, date, warehouse, document identity, reversal reason, landed cost and exact quantity are required; insufficient stock or ambiguously duplicated purchase lines fail closed. Foreign-currency reversal and accounting journal selection remain deliberately unsupported.

The method uses current moving-average carrying value to **preview** the outgoing stock value separately from the original purchase's supplier-side landed amount. Their difference is an **unresolved reconciliation amount**, never a draft/general-ledger journal, sales COGS, AP adjustment or hidden cost correction. The actual financial journal must be defined, approved and independently reconciled before any live activation.

Example: 4 cartons purchased at USD 6, 2 at USD 10, stock USD 44 / 6. Reverse the second purchase quantity of 2: original landed supplier amount USD 20, simulated WAC inventory decrease USD 14.666666666667, remaining carrying value USD 29.333333333333 and **unresolved USD 5.333333333333** for separately approved accounting treatment. If 3 cartons had been sold previously at WAC, that sale's COGS remains unchanged; this purchase return is not recognized as new revenue or sales COGS.

No existing stock posting/GL rules, invoice cost snapshots, Firestore data, FX records or written periods are changed. Full cost/return eligibility, supplier credits, discount/cost allocations, real proof of quantity returned and simultaneous-device consistency require separate acceptance. **Alif 22-B/C remains PARTIAL / NO GO for live accounting.**

## Evidence-backed manual stock-count adjustment preview

`src/lib/inventory-manual-adjustment-valuation.ts::previewManualStockAdjustment` is an isolated read-only acceptance calculator. Physical count **shortages** are valued by the currently verified moving-average carrying cost, **not by the catalog's latest unit cost** and never silently booked as sales COGS. A positive count correction requires an explicitly documented, same-currency unit cost. Both paths require the existing manual inventory evidence validator, with attachment, operator, reason category and supporting description. The adjustment affects only the *simulated* carrying amount and quantity, not live or historical records.

The 29 October focused warehouse-direction correction fails closed when a
manual positive count adjustment carries a **source** warehouse, or a
negative count adjustment carries a **destination** warehouse, even if a
missing direction-specific location would otherwise default to the current
branch's warehouse. Old manual evidence with **both direction fields absent**
continues to be scoped only to the explicitly selected default warehouse.
This is a source-location integrity guard in the read-only preview, not proof
that historic production adjustments were wrongly posted or permission to
alter saved inventory.

The preview explicitly reports `requiresSeparateJournal=true`. It does **not** select a loss, inventory-gain, expense, supplier, transfer, FX, tax or period posting account. No inventory GL journal is created, and it does not authorize posting a physical adjustment. Linked manual corrections and previously issued invoice voids remain unsupported pending an independent rule and audit.

Examples (synthetic): six cartons carried at USD 44 have a USD 7.333333333333/unit average. A documented count shortage of two cartons decreases inventory's modeled book value by USD 14.666666666667, without changing any prior sales COGS. A supported positive count adjustment of two cartons at USD 8 increases modeled inventory value by USD 16, and needs a separate authorized offsetting financial entry.

All modules created in this stage are QA-only. Full stock-book-versus-general-ledger reconciliation, IFRS lower-of-cost/NRV, functional-currency confirmation, dated immutable ordering, published cloud rules evidence, and operator acceptance remain outstanding.

## Actual document COGS versus prospective inventory WAC reconciliation gate

`src/lib/inventory-cost-reconciliation.ts::reconcilePostedInvoiceCostsToWac` provides a **read-only, per-product/warehouse/branch** comparison. It passes genuine documented purchase/issued-stock movement shapes through the existing complete-chronology evidence projector, obtains actual valuation COGS by issue, identifies the exact frozen invoice line and compares the two figures rounded to the currency's two-decimal reporting precision. This is a diagnostic **difference** only: it never changes the stored final invoice, its `unitCost`, approved period, payments, stock ledger or a financial report.

Synthetic acceptance scenario: two receipts of 4 cartons at USD 6 landed and 2 at USD 10 landed; 3 sold at the historical frozen invoice cost of USD 10 each. Frozen invoice item cost = USD 30, modeled moving-average cost = USD 22, unposted discrepancy = **USD 8**. Remaining physical stock = 3 cartons / USD 22. The existing `calculateProfitability` output stays at its historical frozen USD 30 and is not falsely relabeled as adjusted.

**CRITICAL: this product does not yet have a complete, auditable general ledger with posted Inventory / COGS / AP / variance journal entries.** Source-ledger evidence and reports are not the general ledger. Accordingly, the comparison's acceptance field is always `BLOCKED_NO_GENERAL_LEDGER_AND_COST_CUTOVER`, **even if the observed cost difference is zero**. The module neither constructs missing GL amounts nor certifies multi-currency totals. It refuses an invoice outside the explicitly documented functional currency, missing historical cost, incomplete stock source chain and unsupported transfers/reversals/returns.

Future requirements: company-approved functional currency; verified opening value and immutable movement chronology; approved cost cutover; durable two-device-safe atomic stock/COGS posting; signed variance and supplier-return accounting; general ledger accounts, double-entry journal, independent Trial Balance reconciliation, closed-period locks, owner audit and external source verification. Never mark 22-B/C or final 39/40 GO until these are evidenced.

## Complete-source pre-cutover audit (read-only, no production authorization)

`src/lib/inventory-cost-cutover-audit.ts::auditInventoryValuationCutover` checks a single product/warehouse company/branch using the **complete, unchanged source vault** and the existing issued-invoice/WAC evidence projector. The result explicitly separates `evidenceCoverage` (replay of **supported** source events) from `productionReady` (always `false`).

A caller must supply a proposed policy, identified company/branch/product, explicit functional currency, interchangeability/moving weighted-average classification, method reference, proposed cutoff date and **opening-balance evidence**. The app default USD is not an authorization or functional-currency determination. For zero opening, a clearly identified zero balance record is required; for documented opening, its source must lead the original chronological stream and its operator/category/attachment pass the existing structural validator. Missing record, duplicate source, changed cost with unchanged ID, changed invoice/purchase, unsupported transfer, future movement or unrecognized FX prevents evidence-complete reporting. The entire stock movement, purchase and invoice arrays are compared to the read-only source snapshot. The actual source chronology still needs independent off-app authentication; this module cannot establish historical completeness simply from an array.

The user-visible fields are meant for **an auditor's evidence inventory**, not an operational “activate weighted average” button. A supported synthetic history may produce the expected inventory/WAC/COGS invoice difference and `evidenceCoverage=COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS`, while `productionReady=false` and blockers persist for actual owner authentication, published close-period authority, independently posted Inventory/COGS double-entry ledger and Trial Balance, and net realisable value evidence. None of those is supplied, proved or installed by this code. Non-interchangeable stock must use its own specific-identification route.

This stage does not create a journal, modify a customer, change any permanent cost or schema, import missing opening values, read real Firestore production, publish security rules, or interact with AI. A claimed approval ID is unauthenticated until independently verified. Historic valuations remain frozen. No final GO for 22/39/40.

## Isolated debit/credit journal integrity preview — no GL activation

`src/lib/inventory-journal-integrity-preview.ts::inspectIllustrativeInventoryJournals` validates **caller-supplied illustrative entries** against the actual synthetic purchase/issued-invoice ledger movements and the independently recomputed WAC cost steps. The caller explicitly supplies Inventory asset and sales COGS account identifiers, counterparty ledger lines and the chosen currency's **minor digits**; the calculator never invents account identifiers or posts any journal. Each financial source requires one unique, correctly dated, company/branch-scoped, same-functional-currency journal with two or more positive lines whose total debits equal credits. Inventory asset changes must match the *entire* WAC value change, sales COGS changes must match its actual issue; the ending illustrative Inventory and COGS controls reconcile to the **modeled** stock balance.

A debit/credit journal can be balanced and still economically wrong: synthetic tests refuse a journal that posts the previous historical invoice cost (e.g. USD 30) where WAC is USD 22. They also reject absent/duplicate entries, wrong company/branch/date/currency, incorrectly mapped accounts, non-minor-unit money and fractional-unit WAC issues that cannot be booked without an **approved rounding/residual policy**. This isolated diagnostic supports receipts and sales issues only. Initial/opening equity postings, supplier cost components, purchase reversals/variance, returns, transfers, manual count, FX and IFRS NRV are excluded pending separate signoff.

The output always contains `posted=false`, `approved=false`, `productionReady=false`: passing a synthetic double-entry integrity check does **not** create a real, independently authenticated financial ledger, establish authoritative legal entity functional currency, or prove an approved trial balance. Do not activate this as a journal writer, substitute it for bank/AP accounting, backdate closing balances or silently update historical issued invoices.

## Prospective minor-unit rounding and visible residual — no journal acceptance

`src/lib/inventory-minor-unit-rounding-preview.ts::previewCumulativeInventoryMinorUnitRounding` tests one **proposed**, non-authorized `cumulative-rounded-balance-v1` policy. It starts from the verified prospective WAC receipt/issue stream (one company, branch, warehouse, item, currency); rounds the **running inventory balance** to the caller-selected currency minor units (0, 2 or 3 digits); takes successive rounded-balance changes as illustrative inventory asset entries. Purchase receipts increase illustrative inventory cost, and genuine sales issues increase illustrative COGS. The output conserves the **rounded book asset** exactly at each step without mutating the engine's 12-decimal cost or the original invoice cost.

For 4 cartons at USD 6 and 2 at USD 10, three successive sales of one carton each would have proposed book COGS of USD **7.33, 7.34, 7.33** and a remaining candidate book asset of USD 22.00. This demonstrates why naively rounding USD 7.333333... separately on each invoice can lose a cent. Conversely, with stock values only fractions of a cent, the proposed total journal COGS can differ from the rounded 12-decimal modeled COGS; the preview explicitly reports `unresolvedSalesCOGSRoundingDifference` and `hasUnresolvedRoundingDifference`, rather than concealing the discrepancy.

Any movement for which the proposed receipt/issue book value rounds to zero, or has the wrong sign, **fails closed** until a documented memorandum/aggregation policy exists. Opening values, returns, transfer, reversals and physical-count corrections remain outside this narrower preview. The strict illustrative journal checker from PR #1140 is **not loosened**. This preview never posts a journal, authenticates a functional currency, selects GL accounts, approves a rounding policy, adjusts a historic invoice, or proves a trial balance. `journalPosted`, `policyApproved` and `productionReady` are always `false`. Accountant-approved signoff, period authority, NRV, FX and trusted posting remain separate gates.

## IAS 2 lower-of-cost-and-NRV assessment (read-only prospective acceptance)

`src/lib/inventory-nrv-preview.ts::previewInventoryNrvAllowance` is a **non-posting** per-item / warehouse / company evaluation of a proposed finished/saleable stock NRV assessment. IAS 2 requires inventory to be measured at the lower of cost and net realisable value (estimated ordinary-course selling price **less** estimated completion and costs necessary to make the sale). See [IFRS IAS 2 official overview](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/) and IAS 2 paragraph 33 on bounded reversal.

- Recalculate the existing WAC evidence stream without changing its 12dp inventory amount, sale COGS or frozen invoices. Require all events to precede the dated NRV estimate. Only **ordinary saleable goods** with a supported receipt/issue history enter this early QA: materials, work in progress, contract-specific lots, returns/transfers/adjustments and already impaired historic COGS require further policy and accounting evidence.
- Obtain *separate* references for selling price, costs to complete, and all necessary selling costs **in the explicit functional currency, per physical unit**. Reject an unproved price/expense, unsupported FX, mismatched date or negative NRV case rather than inventing a value. Cost evidence authenticity and estimated completeness are **not** certified merely by reference IDs.
- `grossCostValue` is the original modeled value of goods still in stock. `totalNrv` equals (estimated sale price – necessary completion – necessary sale costs) × supported remaining physical quantity. Proposed ending book carrying value is `min(gross cost, total NRV)`; proposed allowance is gross cost less that amount. All mathematics is fixed-point, no JS floats.
- The required **opening allowance assertion** must be explicit. An earlier claimed allowance must include source/journal reference, date, scope, matching current quantity and matching unchanged gross cost; changes in stock or cost **fail closed** because a partial historical allowance may need allocation on sales, transfers or changes of stock layers. A reversal equals the decrease in the proposed allowance and cannot exceed the prior allowance or lift the asset above original cost (IAS 2 paragraph 33).
- Allowance creation, loss/reversal classification, expense recognition and period posting require real supporting market documents, functional currency authorization, independent signed previous posting/zero-balance proof, NRV estimates appropriate to product, and trusted journal/Trial Balance/closed-period acceptance. The calculator returns `sourceEvidenceAuthenticated=false`, `priorJournalAuthenticated=false`, `posted=false`, `approved=false`, `productionReady=false` regardless of numeric result.

Synthetic example: after 4 cartons × USD 6 and 2 × USD 10, selling 3 leaves 3 at **USD 22** gross cost. Estimated selling price USD 6/carton minus completion USD 0.50 and necessary selling cost USD 0.50 gives NRV USD 5/carton, or **USD 15** total and proposed write-down **USD 7**. If an earlier supported USD 10 allowance were genuinely recorded for the **same unchanged stock**, the modeled proposed reversal would be **USD 3**; if NRV recovers above cost, reversal would be capped at that earlier USD 10. This is NOT an authorization to alter historic invoices, COGS, tax, posted purchases, payables, inventory movement or actual accounting balances. No source production dataset, Firestore security rules or AI code was touched.

## NRV impairment and reversal double-entry proposal gate (read-only)

`src/lib/inventory-nrv-journal-integrity-preview.ts::inspectIllustrativeNrvJournal` extends the previous NRV valuation *diagnostic* with a **strict synthetic debit/credit verification**. It independently recalculates the full original WAC/NRV comparison and reconciles gross cost, prior allowance, proposed closing allowance, and net inventory. Any nonzero change requires exactly one explicitly supplied, identified, same-date, same-company/branch/item/warehouse/currency journal, **not** a generated or posted record. All account identifiers are provided by the caller; original gross inventory, the contra-asset allowance, and impairment expense must be three distinct accounts.

Expected illustrative accounting for a proposed NRV **write-down**: **debit impairment expense; credit inventory allowance (contra asset)**. For a supported NRV **reversal**: **debit the same inventory allowance; credit impairment expense**, with the reversal no larger than the actually documented prior allowance. The existing gross-cost Inventory asset account is not directly credited or overwritten. No valuation change means **zero** journals, never a synthetic zero debit/credit.

Synthetic scenario: three units remain at WAC gross USD 22, supported NRV USD 15, and zero historical allowance reference: proposed write-down USD 7 = Dr impairment expense USD 7 / Cr inventory allowance USD 7. If an earlier *supported and unchanged-stock* allowance of USD 10 existed, a newly calculated USD 7 ending allowance implies a proposed reversal USD 3 = Dr inventory allowance USD 3 / Cr impairment expense USD 3. Recovery above original gross cost reverses no more than the prior USD 10. The inspection refuses a balanced but economically wrong USD 8 entry, missing or duplicate journals, wrong account direction or identity, mismatched source/date/currency/warehouse, and fractional currency minor units (0, 2 or 3 selected) that lack a **separately approved** residual-rounding rule.

**Hard NO-GO boundary:** All proposed journals come from unverified caller inputs. Evidence IDs are not authentic accounting records. This program **does not write GL entries, verify real expense/allowance balances or a trial balance, prove market-price completeness, sign owner approval, record tax or close a period**. Its results always have `journalPosted=false`, `approvalAuthenticated=false`, `generalLedgerReconciled=false`, `productionReady=false`. The original NRV preview and the actual financial data remain unchanged. Future signed policy must resolve per-period recognition, prior impairments after sales/transfers, NRV by product category, currency/FX, closing locks, atomic concurrent posting and account-level reconciliation.

## Mandatory steps before production adoption

1. Authorized operator documents functional currency **per legal company**, stock-item interchangeability classification, opening balances with original supporting documents, and cutover date.
2. Establish immutable movement order and scope/warehouse allocation, supplier landed-cost policy, handling charges and FX evidence snapshots. Determine same-day chronology. Validate account-specific data completeness using **isolated test identities**, not real users.
3. Implement complete audited transfer, reversal, adjustment, physical return, valuation-allowance / NRV, stock locking, period closing, and idempotent two-device posting semantics; address item IDs where one purchase contains multiple lines for same product.
4. Define cent-rounding, COGS/carrying-value posting and reporting reconciliation; reconcile receipts, remaining stock, returns, AP and GL journals with independent accountant acceptance.
5. Only then authorize prospective cutover. Historical finalized invoices and movements remain immutable; any correction or migration requires separately approved controlled journal/workflow and sign-off.

**Current acceptance: implementation foundation only; Alif 22-B/C remains PARTIAL / NOT READY FOR LIVE ACCOUNTING.** The CI tests are synthetic and cannot establish real owner QA, published security rules, functional currency or production accounting policy sign-off.

## 28 October 2026 — prior impairment allowance stock-continuity safeguard

A **confirmed gap in the isolated NRV preview** was that its prior-allowance check
compared only final quantity and gross carrying value. A later stock issue
followed by an equal-valued replacement receipt could restore those **same
numbers** while the previously impaired stock had partly been sold and replaced.
The preview could then incorrectly propose a prior-allowance reversal against
the replacement goods. This is an accounting-continuity problem in the
prospective diagnostic, **not evidence of an actual posted error**.

The preview now conservatively refuses reuse of a dated prior allowance if
**any inventory movement occurred on or after the prior assessment date**.
An event on the same date is also blocked: dated-only records cannot prove
whether it occurred before or after assessment. In those cases a later
approved item-specific allowance roll-forward, documented quantity
attribution, immutable posting order and complete impairment-journal chain
are required before a valuation can be proposed. The source/approval remains
independently unauthenticated; no prior journal, book inventory, GL, closed
period, historical invoice or production record is modified. No posting policy
has been approved, and Alif 22-B/C remains **PARTIAL / NO-GO**.
