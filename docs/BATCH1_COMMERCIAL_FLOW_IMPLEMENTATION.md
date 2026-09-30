# LOUREX Expansion — Batch 1 Commercial Flow + Quote Tracking

Implementation branch: `feat/lourex-commercial-flow-quote-tracking`

## Safety boundary

Batch 1 must not alter totals, tax, discount, currency, landed cost, receivables, payment allocation, invoice settlement, document finalization, revision semantics or `LourexDocument.status` / `lifecycleStatus`.

Commercial state is a separate sales-workflow concept.

## Phase A — deterministic flow foundation

Implemented in `src/lib/commercial-flow.ts`:

- quotation/proforma eligibility
- real quote/proforma → invoice links using `convertedFromId`
- real invoice → credit-note links using `creditForId`
- existing `DocumentEventRecord` evidence across the linked chain
- deterministic quote expiry from the existing valid-until (`dueDate`) field
- conversion state from an actual active linked invoice
- commercial status overlay contract for future persisted manual Sent / Accepted / Rejected decisions
- explicit prohibition on automatic Viewed state before the secure Customer Portal exists

Status precedence is deliberately conservative:

1. actual linked invoice → Converted
2. recorded Accepted / Rejected decision
3. valid-until date elapsed → Expired
4. recorded Sent
5. final quote/proforma → Ready to send
6. otherwise → Draft

## Phase B — Documents integration

Next within this same batch:

- status chip on quote/proforma register/detail
- Commercial Flow panel in document detail
- encrypted persisted manual tracking for Sent / Accepted / Rejected + follow-up
- safe migration and cloud reconciliation
- mobile bottom-sheet/editor treatment
- Home follow-up summary only after the persisted tracking contract is stable

`Viewed` remains reserved for Batch 10 because only a secure external share surface can provide trustworthy view evidence.
