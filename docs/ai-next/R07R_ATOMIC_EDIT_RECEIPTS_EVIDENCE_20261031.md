# R07R/R07D — Atomic Unsaved Review Edit Receipts (Offline)

Date: 2026-10-31. Production remains OFF. No financial core changes.

## Implemented

- Adds an isolated Firestore-compatible **AI review edit receipt** collection next to the existing R07D unsaved review draft collection. The draft edit and immutable request receipt are committed atomically within one R07D database transaction. There is no second financial writer, no document issuance, approval or accounting mutation.
- Receipts bind nine-field authenticated scope, original draft turn, server-hashed idempotency key, request-content fingerprint, exact expected revision/hash and committed revision/hash. Reusing a request key with different message or draft revision is rejected.
- Optional R07R prepareWithReceipt checks the server-verified receipt before semantic interpretation; replay after a lost ACK returns the committed revision and latest verified draft, not a misleading old snapshot. If the draft advanced after the original edit, appliedRevision and currentRevision are explicitly distinct. Replayed requests do not consume fixture model calls.
- Two requests with the same key and base revision converge to one CAS write; competing different keys with the same base revision have a single winner. Existing R07R prepare remains unchanged for legacy isolated tests; receipt mode requires a separately injected offlineReceiptMode flag.

## Tests and strict limits

- Synthetic local transactional Firestore mocks prove same-transaction draft/receipt, network acknowledgement loss and cross-instance replay, key collision, later-revision replay, same-key and different-key concurrency, membership revocation, forged branch, corrupt receipt, invalid origin ID, and model failure.
- CI must verify the exact PR head: strict TypeScript, focused tests, R07D/R07R/R07M regressions and production isolation.
- This is an **AI review draft operation receipt**, NOT a journaled R07M conversation turn or a production-approved exactly-once business transaction. The R07M semantic task stream is not yet integrated with this receipt transaction. There is no durable model-interpretation receipt before the first successful edit; concurrent first attempts may invoke an offline interpreter more than once but cannot apply the draft edit twice. Paid/live inference remains disallowed.
- No live Firebase IAM/rules, T22 cross-device acceptance, real provider cost/privacy approval, production rollout, audited history scaling, financial editor issuance boundary or physical Safari QA is proven.

No customer documents, providers, paid credits, Firebase configuration, production flags, finance files or deployment were changed.
