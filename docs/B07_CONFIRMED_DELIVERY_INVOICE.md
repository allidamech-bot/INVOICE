# Batch 7 — Confirmed Delivery → Commercial Invoice Draft (Step 4C)

Status: **PR #642, runtime QA pending**. Baseline is `main` after #641, with no GitHub Actions.

## Process

1. Accept customer quotation and register the accepted Sales Order with a stable snapshot.
2. Issue a Delivery Note and confirm actual physically delivered quantities.
3. From the confirmed Delivery Note details, choose **Create / open invoice draft**. One invoice draft is linked to one confirmed Delivery Note.
4. The new invoice copies **only the delivered lines and quantities**, retaining the Sales Order price, currency, customer and language. When part of an order is delivered later, confirm another Delivery Note to create its own invoice.
5. Review invoice, discounts, VAT, freight, payment terms and amounts. Issue manually using the existing document governance and approval owner. **Only an issued invoice enters the existing receivables/payment workflow**.
6. Use the existing payment/collection controls to record actual customer receipts separately.

## Deterministic controls

- Exact immutable source: confirmed proof reference, DN number/version, accepted quotation and Sales Order IDs, customer, currency, mapped line IDs and quantities.
- Repeat request opens the same invoice; two offline concurrent creations for one DN are rejected on vault merge.
- The invoice cannot silently change confirmed quantities, line identity, accepted unit price, accepted customer or currency. Invoice creation and alteration are checked against immutable local event evidence.
- Unconfirmed, draft, voided or tampered source Delivery Notes are rejected.
- Accepted SO quotations cannot be directly converted into a whole-order invoice, bypassing partial delivery quantities.
- Quotation-level discounts, shipping, other charges and internal overhead are **not** automatically duplicated across partial invoices. Existing source tax rate remains a draft starting point; human must review legal/tax applicability.
- Existing authorization limits new invoice preparation to roles capable of document issuance: owner, admin, sales and finance.
- Nothing in the operation automatically decrements stock, posts an inventory cost, creates a payment, settles VAT or publishes an invoice. It does not create a general ledger.

## Evidence and follow-up

- New contract test: `tests/b07-confirmed-delivery-invoice.test.mjs` (8 scenarios).
- Changes: `sales-delivery-invoice.ts`, serialized App mutation, DocumentsPage and SalesDeliveryReview, vault merge and regression tests.
- Static source contract audit completed; no full Node 24 / npm typecheck, build or Playwright run has been performed in this execution environment. **Do not merge #642 or claim functionality tested until real local QA is available.**
- Local QA: on the final PR HEAD run `node scripts/verify-local.mjs` after installing Node 24, dependencies and Playwright Chromium/WebKit. See `docs/LOCAL_VERIFICATION_NO_ACTIONS.md`.
- Next in Batch 7: verify invoice issuance→receivables→partial collections and only then consider explicit SKU-level inventory issues, with physical stock and available-balance checks. Inventory posting needs independent human confirmation and must not be inferred from a Delivery Note's free-text item description.
