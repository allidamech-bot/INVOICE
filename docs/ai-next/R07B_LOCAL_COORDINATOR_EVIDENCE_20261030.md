# R07B2 — Isolated Single-Owner Local Coordinator

Date: 2026-10-30. Production: NOT activated.

## Scope of code

- `src/ai-next/coordinator/local-coordinator.ts` is a server-side, non-HTTP integration seam; it binds R07B1 verified identity and company/branch ACL to R03 CAS event storage, R05 deterministic local intent, and R04 unsaved quote drafts.
- The API rejects role/actor/approval injection, unknown commands, attached sources, and viewer quotation preparation. All requests re-check current authenticated ACL.
- Successful greetings commit turn, messages and completion. Successful unsaved quotation-draft creation requires a server-side atomic draft-repository acknowledgement before reporting success; the response clearly states `financialSaved:false` and `providerCalls:0`.
- Same-key retries return the exact prior turn; changed same-key text/mode/request metadata is a collision. A failed draft store leaves a resumable in-progress task and rejects new unrelated turns in that thread; a missing persisted draft after completion yields an error, not fabricated success.
- The coordinator owns the local flow; no model or browser can execute a financial write. It does not call R05 provider gateway or legacy financial mutation APIs.
- All data in tests are synthetic; no production customer, provider or financial information was accessed.

## Unclosed acceptance requirements

1. No deployed, trusted company/branch membership store is connected. The R07B1 `TrustedIdentityProvider` is injected in tests only.
2. No actual durable draft store is implemented or selected. Tests use a shared in-process fake and R03 synthetic event backend; these are NOT restart/cross-device evidence.
3. The R07A proof-of-concept single-thread Firestore document caps at 300 events and is not connected to this coordinator. It cannot satisfy R07 long-conversation or T22 requirements.
4. Real source attachments, document evidence, invoice/quote editor synchronization, model inference, selected-source grounding, memory/consent, client UI connection and real Safari evidence remain NOT integrated.
5. Financial execution remains disabled in R04 and no approval receipt is issued. A local unsaved draft is not an issued or persisted financial record.
6. No HTTP endpoint or feature flag activation, credentials, environment changes, Firebase rule changes or production deployment.

Synthetic acceptance only. T01/local component and T15/empty-draft component may be considered mocked evidence; T24/T22 remains BLOCKED. Production release awaits separate approval.
