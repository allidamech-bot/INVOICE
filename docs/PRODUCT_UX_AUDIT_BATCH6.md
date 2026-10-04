# Batch 6 — Connected commercial delivery

Baseline: main `98a8a8cb24aae35ca4e8647bcd06e3920a686beb` (Batch 5, PR #496).

## Inspected current workflows

- Sales already has RFQ, issued quotations, tracked sent/accepted/rejected states,
  quotation-to-invoice conversion, delivery notes, credit notes and collections.
- Purchasing already has supplier quotation capture/comparison, purchase-order
  documents, validated posted purchases with landed-cost inventory movements,
  reversal safeguards and supplier payments against real posted liabilities.
- Inventory already has reorder point, target stock, safety stock, preferred
  supplier, lead time, warehouse stock counts and transfer workflows.
- Customer credit terms/limits and commercial price/history are already present.
  No new Sales Order, Debit Note, reservation ledger or AP surrogate is warranted
  for this batch. Existing acceptance tracking is preserved, not relabeled as a
  new Sales Order. Purchase orders and purchasing records remain distinct;
  automatic PO-to-receipt linking is not claimed.

## Implemented

An active issued quotation/proforma invoice/commercial invoice can create a
reviewable delivery-note draft through its existing action menu or details.
Customer, exact quantities, descriptions, trade metadata and delivery terms
carry forward. Financial adjustments, prices, costs and payment terms do not.
The source document remains immutable. No inventory movement, payment or
financial posting is created. Normal issue approval and document lifecycle apply.

The existing created event links the delivery to its source; no schema migration
or overloaded convertedFromId is introduced. Documents shows both directions.
A quotation and its converted invoice reopen the same active full delivery.
Voided deliveries remain in history and permit an explicit replacement.

The App's existing encrypted write queue reads the latest scoped Vault before
creation, handles simultaneous quote/invoice requests, rejects a changed account
key/workspace/branch, appends normal audit events and preserves other workspaces.
This is one full delivery per local source family, not partial fulfillment or a
cross-device reservation protocol.

## QA

PASS: TypeScript; production build; static security; dependency audit.
PASS: six compiled lifecycle contracts: sales delivery/invoice/collection,
encrypted round trip/idempotence/void replacement, invalid source rejection,
workspace isolation, existing landed purchasing/inventory/payables/currency,
and actual App queued race/workspace-switch handling.
PASS: actual App at Chromium 320 Arabic dark, 390 English light and 1440 English
light: create from details, editor review, encrypted account IndexedDB persistence,
source prices intact, no inventory/payment side effects, duplicate reopen and no
horizontal overflow. Browser fixture bypasses sign-in only; real App creation,
write queue, encryption, scoped persistence and editor are exercised.

Physical hardware QA and partial deliveries/reservations are outside this change.

## Sequential closeout review from merged #502

Continuation baseline: main `3df0c7a2925a8879b1cc236156dad9249b88ba6e`.
Batch3 final HEAD `65518f6d` passed Invoice CI and all seven path-triggered QA
workflows before merge. Batches4 and5 are explicitly stopped by the user;
this review does not depend on their provider capabilities or change AI code.

### Mandatory commercial acceptance

| Requirement | Actual owner / behavior | Acceptance evidence |
| --- | --- | --- |
| Sales inquiry / quotation / decision | Existing RFQ and quotation documents; `commercial-flow.ts` records Sent and Accepted/Rejected separately from money | New compiled sent/accepted-to-converted lifecycle contract; current commercial-flow browser gate |
| Quotation to invoice | `documents.ts` and actual App conversion; standard active final source, source relation retained | Existing delivery/invoice/collection contract and new partial-payment/credit/statement reconciliation |
| Delivery review and traceability | `delivery-flow.ts`, actual App encrypted queue and Documents source/related links | Existing three-width real App browser gate; encrypted reload, duplicate, void replacement, workspace and queued race contracts |
| Collection / credit correction | Existing customer payments and invoice-linked credit notes, currency-separated statements | New partial collection + credit reconciles remaining20.00 and statement balance; excess payment rejected |
| Supplier / purchase workflow | Existing supplier editor, supplier snapshot, due date, item costs, reviewed purchase draft and explicit receipt posting | Current mobile core posting browser gate; deterministic landed-cost/payables contract |
| Receipt / stock / payable | `postPurchase` owns received stock movements, recorded landed cost and real posted liability | New draft has no AP projection/payment capability or stock; explicit post creates3 units and30.00 liability |
| Correction / cancellation | Existing explicit void/replacement and purchase reversal with reason and history | New stock-neutral reversal and duplicate reversal rejection; actual App rejects reversal with supplier payment without persistence |
| Reorder / stock context | Existing recorded movements, warehouse counts/transfers and `inventory-planning.ts` policies | Existing inventory-planning contracts and current browser gate; suggestions are advisory, never reservations |
| Commercial policy | Existing payment terms, customer credit policy and deterministic pricing controls | Existing current contract/business gates retained; no second finance engine |

### Conditional candidate suitability decisions

| Candidate | Decision for this remediation | Reason and explicit boundary |
| --- | --- | --- |
| Sales Order | Retain issued quotation acceptance and invoice conversion | A separately enforceable order needs cancellation, partial fulfillment and reservation policies. Existing Accepted is a commercial decision, not a stock reservation. Do not add a duplicate document with false fulfillment authority. |
| Debit Note | Retain explicit invoice and existing credit corrections | No separate debit-adjustment posting/tax policy exists. A new label alone cannot create a valid additional receivable. Not selected as an incremental remediation. |
| Automatic PO to receipt | Retain reviewed purchase draft / explicit receipt posting | `PurchaseRecord` has no PO receipt allocation or partial-receipt ledger. A PO is a supplier commitment document; posting it as received automatically would create unverified stock/AP. Automatic linkage is not implemented or implied. |
| Reservations / partial deliveries | Retain current full delivery per source family | Current movements record actual stock and delivery notes do not post stock. Reservation release/partial-fulfillment policies require a separate ledger; not selected here. |
| Reorder proposals | Reuse existing policy-based planning | Existing reorder, target, safety stock, lead time and preferred supplier cover advisory planning; no duplicate recommendation engine required. |
| Customer credit control | Reuse existing commercial controls | Retain reviewed credit terms/limits and currency boundaries; no invented balance or automatic financial decision. |

These conditional decisions satisfy the suitability review; they do not claim
that Sales Order, Debit Note, automatic PO receipts or reservation features shipped.
This batch closes the scoped commercial remediation, not a full ERP implementation.
Final acceptance and local evidence are recorded below; completion requires the
closeout PR's final blocking CI and merge.

Local closeout PASS: production build (includes TypeScript), all nine compiled
commercial-completion contracts, real App delivery/encrypted IndexedDB/duplicate
reopen at320 AR,390 EN,1440 EN, and all ten current mobile core scenarios including
purchase posting and manual stock. Diff check PASS. No production implementation,
AI, dependency, storage schema or accounting algorithm changed in this closeout.
Physical hardware unavailable; final remote gates/merge still required.

Sampled historical diagnostics: 24/29 passed. Five failures require the obsolete
pre-portal no-Viewed rule, schema 15, the former revision snapshot spelling or
old stylesheet ordering. Their asserted source files are unchanged from main;
these are documented non-blocking historical checks, not merge gates.
The production service-worker auto-precache includes delivery-flow.js.
