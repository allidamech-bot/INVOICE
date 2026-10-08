# Batch 7 — Confirmed Delivery → Commercial Invoice Draft (Step 4C)

Status: **PR #642, runtime QA pending**. Baseline is `main` after #641, with no GitHub Actions.

## Process

1. Accept customer quotation and register the accepted Sales Order with a stable snapshot.
2. Issue a Delivery Note and confirm actual physically delivered quantities.
3. From the confirmed Delivery Note details, choose **Create / open invoice draft**. One invoice draft is linked to one confirmed Delivery Note.
4. The new invoice copies **only the delivered lines and quantities**, retaining the Sales Order price, currency, customer and language. When part of an order is delivered later, confirm another Delivery Note to create its own invoice.
5. Review invoice, discounts, VAT, freight, payment terms and amounts. Issue manually using the existing document governance and approval owner. **Only an issued invoice enters the existing receivables/payment workflow**.
6. The invoice detail screen displays the **outstanding balance** and a **Record payment** action for issued unpaid or partially paid invoices. This opens the existing canonical Receivables workflow, where actual receipts are entered separately, with overpayment rejection and per-invoice separation.

7. Open the accepted Sales Order view to review quantities, partial invoices, issued net amounts, issued credits, collections and outstanding separately in the order currency. Never interpret the accepted quote's grand total as a second financial posting.

## Deterministic controls

- Exact immutable source: confirmed proof reference, DN number/version, accepted quotation and Sales Order IDs, customer, currency, mapped line IDs and quantities.
- The invoice event currency, source Sales Order currency, physical delivery customer/currency and legal buyer name/VAT/commercial registration are cross-checked against the accepted quotation snapshot, preventing a false customer or currency association.
- Repeat request opens the same invoice; two offline concurrent creations for one DN are rejected on vault merge.
- The invoice cannot silently change confirmed quantities, line identity, accepted unit price, accepted customer or currency. Invoice creation and alteration are checked against immutable local event evidence.
- Unconfirmed, draft, voided or tampered source Delivery Notes are rejected.
- Accepted SO quotations cannot be directly converted into a whole-order invoice, bypassing partial delivery quantities.
- Quotation-level discounts, shipping, other charges and internal overhead are **not** automatically duplicated across partial invoices. Existing source tax rate remains a draft starting point; human must review legal/tax applicability.
- Existing authorization limits new invoice preparation and the repeat create/open action to roles capable of document issuance: owner, admin, sales and finance.
- Partial invoice drafts retain the same approved customer payment-term preset and due-date calculation as ordinary quotation-to-invoice conversion; this is important for accurate receivables aging.
- The delivery→invoice creation event is append-only, even across two-device vault merges. Offline attempts to delete or rewrite the evidence must fail closed.
- A concurrently created event with the same identifier cannot overwrite a newer remote delivery→invoice record, even when the colliding event carries unrelated, non-invoice content.
- Conflicting duplicate event IDs within a single offline upload are rejected when one of those records contains delivery-invoice proof, rather than allowing merge deduplication to drop the proof.
- Product line HS classification, country of origin and packing cannot drift from the accepted quotation when the invoice is linked to physical delivery.
- The accepted Sales Order review now shows delivered/remaining quantities per SKU line, confirmed deliveries, invoices in draft/final state, issued net receivables, credits, collections and outstanding balances from canonical payments. Draft invoices are **not** receivables. The per-item detail is collapsed by default to preserve phone-screen density.
- Delivery-linked invoices cannot be deleted, duplicated or directly voided, because the physical delivery evidence must remain traceable. Correct issued invoices through the existing Credit Note process; dedicated cancel/replacement is deferred to an explicitly audited future workflow.
- Nothing in the operation automatically decrements stock, posts an inventory cost, creates a payment, settles VAT or publishes an invoice. It does not create a general ledger.

### Release verification contract

The complete local signoff must be recorded against the final PR head with **Node.js 24.x**: `npm ci`, `npm install --no-save --package-lock=false playwright@1.55.0`, `npx playwright install chromium webkit`, `git fetch origin main`, then `node scripts/verify-local.mjs`. It must pass TypeScript, build, Node contracts, mobile Chromium/WebKit QA and security checks. Static source inspections and draft previews alone are **not** signoff.

## Commercial UX

An accepted Sales Order retains its own commercial status even once partial invoice drafts exist. The Commercial Flow summary counts drafts separately from issued invoices rather than presenting a single invoice as if the whole order had been fully invoiced.

## Timeline rendering

Delivery-invoice creation evidence remains a structured, immutable document event. The Commercial Flow and Document Lifecycle timelines render localized human-readable descriptions for accepted Sales Orders, linked delivery drafts, confirmed physical deliveries and invoices instead of exposing serialized JSON payloads. The underlying payload and merge checks remain unchanged.

## Evidence and follow-up

- New contract test: `tests/b07-confirmed-delivery-invoice.test.mjs` (25 scenarios), including isolated partial/full receivables settlement, role bypass checks, chronology, and source reference tampering.
- Changes: `sales-delivery-invoice.ts`, `sales-order-progress.ts`, serialized App mutation, DocumentsPage, SalesOrderReview and SalesDeliveryReview, vault merge and regression tests.
- Static source contract audit completed; no full Node 24 / npm typecheck, build or Playwright run has been performed in this execution environment. **Do not merge #642 or claim functionality tested until real local QA is available.**
- Local QA: on the final PR HEAD run `node scripts/verify-local.mjs` after installing Node 24, dependencies and Playwright Chromium/WebKit. See `docs/LOCAL_VERIFICATION_NO_ACTIONS.md`.
- Next in Batch 7: verify invoice issuance→receivables→partial collections and only then consider explicit SKU-level inventory issues, with physical stock and available-balance checks. Inventory posting needs independent human confirmation and must not be inferred from a Delivery Note's free-text item description.
