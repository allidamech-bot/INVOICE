# LOUREX Expansion — Batch 1 Commercial Flow + Quote Tracking

Implementation branch: `feat/lourex-commercial-flow-quote-tracking`

## Safety boundary

Batch 1 does not alter totals, tax, discount, currency, landed cost, receivables, payment allocation, invoice settlement, document finalization, revision semantics, `LourexDocument.status`, or `lifecycleStatus`.

Commercial state is a separate sales-workflow concept layered over the existing document lifecycle.

## Deterministic commercial flow

Implemented in `src/lib/commercial-flow.ts`:

- quotation/proforma eligibility
- real quote/proforma → invoice links using `convertedFromId`
- real invoice → credit-note links using `creditForId`
- existing `DocumentEventRecord` evidence across the linked chain
- deterministic quote expiry from the existing valid-until (`dueDate`) field
- conversion state from an actual active linked invoice
- converted invoices classified as `Converted` only when they carry a real `convertedFromId`
- standalone invoices excluded from the Commercial Flow panel
- explicit prohibition on automatic `Viewed` before the secure Customer Portal exists

Status precedence is deliberately conservative:

1. actual linked invoice → Converted
2. recorded Accepted / Rejected decision
3. valid-until date elapsed → Expired
4. recorded Sent
5. final quote/proforma → Ready to send
6. otherwise → Draft

Accepted and Rejected are terminal commercial decisions. The event reducer is monotonic so a late event merged from another device cannot downgrade a terminal decision back to Sent, replace it with the opposite decision, or re-open a follow-up.

## Encrypted persistence and cloud reconciliation

Manual tracking uses the existing encrypted `documentEvents` ledger with the reserved marker `@lourex:commercial:v1:` and the existing `created` event type. No new storage silo and no schema bump are required.

Mutations run through `mutateVaultSafely()`, which is already registered to the application write queue. This preserves the existing encrypted local write, `vaultWriteTail` ordering, UI refresh, and scheduled cloud synchronization.

Persisted commercial actions:

- Mark Sent
- Mark Accepted
- Mark Rejected with required reason
- Schedule follow-up
- Complete follow-up

Validation runs against the latest vault snapshot. It blocks tracking on missing, draft, voided, converted, or already-closed quotations, rejects past follow-up dates, and prevents recording a new Sent event after quotation expiry.

## Documents UX

Implemented in the Documents workspace:

- commercial status chip in quotation/proforma rows
- commercial status chip in document detail
- Commercial Flow detail panel
- linked document chain navigation
- commercial evidence timeline separated from the accounting/document lifecycle timeline
- mobile actions with 44px minimum targets
- iOS-safe 16px date input
- responsive single-column action layout
- Arabic RTL right alignment
- rejection modal using the existing responsive modal/bottom-sheet system

The existing lifecycle timeline explicitly filters reserved commercial marker events, keeping accounting/document history semantics unchanged.

## QA contract

`tests/commercial-flow-batch1.test.mjs` protects lifecycle separation, status precedence, encrypted mutation wiring, expiry rules, converted-invoice semantics, concurrent cloud-merge monotonicity, mobile touch targets, RTL, and stylesheet ownership.

`tests/visual/run-commercial-flow-batch1.cjs` is part of the blocking `business-current` browser shard and exercises real mobile Chromium flows at 390×844 for:

- English: Sent → Follow-up → Complete → Accepted
- Arabic: Rejected + rejection reason + RTL
- persistence count and event evidence
- preservation of `status='final'` and `lifecycleStatus='active'`

`Viewed` remains reserved for the secure Customer Portal batch because only an external authenticated share surface can provide trustworthy view evidence. A Home follow-up summary is intentionally deferred until the broader follow-up/task batch so Batch 1 stays focused and does not duplicate dashboard ownership.
