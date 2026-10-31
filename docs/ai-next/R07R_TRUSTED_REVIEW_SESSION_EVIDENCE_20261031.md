# R07R — Audited Offline Quotation Review Session

Date: October 31, 2026. AI Next only. No production activation.

This package composes the already merged R07M/R07J authenticated quotation creation, R07P full-audited-history context, strict synthetic semantic proposals, trusted customer ID lookup and R07R to R07D atomic revision/hash CAS edit preparation. It introduces a single disabled server-side **composition function** with explicit offlineFixtureMode grant, not another coordinator, journal or route.

## Focused user journey (synthetic, no model API)

1. A verified owner creates a quotation through R07M deterministic path; R07D stores an UNSAVED needs_review draft.
2. A scoped customer name resolves to the uniquely verified existing customer ID and updates the canonical review draft at revision 2.
3. Currency is explicitly set by user, revision 3.
4. A fully described synthetic item with supplied quantity, unit, selling price and currency is appended, revision 4.
5. The owner corrects that line's quantity, revision 5, preserving previous selling unit price and customer selection.
6. An independent session reads the same verified draft and full journal-derived context. Neither the editor nor the conversation ever claims an accounting document was saved.

## Guardrails and tests

- Exact actor/account/company/branch/thread + role authority rechecked before every edit.
- Strict R07D CAS rejects stale replay and concurrent clobbering. Two open drafts are ambiguous; no silent selection. Unknown customers, malformed output, missing line details, foreign scope, revoked access or direct execution are blocked.
- Existing R07R editor, R07P planner and R07J journal are reused with no duplicate owner or storage system.
- Real R07D Mock Firestore transaction semantics and synthetic interpreter tests, not live Firebase/LLM or commercial data. TypeScript/regressions/isolation require exact final PR SHA green Actions.

## Not complete

This package does **not journal the semantic edit turn itself** into R07M. It is an unmounted offline integration of read/prepare and historical state, not a new active conversation API. No persistent per-edit operation receipt survives ambiguous acknowledgement beyond safe revision CAS rejection; durable semantic task-operation matching and idempotent read-after-write reconciliation remain open. Full undo/redo and cross-device QA, provider quality, source documents and T22/T23/T24 remain open. No finance writer/approval is connected, production flags OFF.

No real model inference, paid credit, production Firebase, live accounting document, production Vercel config, financial application file, or live IAM rule was altered.
