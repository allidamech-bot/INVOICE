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

Sampled historical diagnostics: 24/29 passed. Five failures require the obsolete
pre-portal no-Viewed rule, schema 15, the former revision snapshot spelling or
old stylesheet ordering. Their asserted source files are unchanged from main;
these are documented non-blocking historical checks, not merge gates.
The production service-worker auto-precache includes delivery-flow.js.
