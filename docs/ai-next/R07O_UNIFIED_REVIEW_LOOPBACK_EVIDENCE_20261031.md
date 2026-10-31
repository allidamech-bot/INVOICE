# R07O local-only unified review-edit bridge — Candidate

Date: October 31, 2026. Repo: allidamech-bot/INVOICE.
Phase: AI Next Generation, conversation rebuild. Production deployment: NOT authorized.

## Scope

A new `review_edit` operation has been added to the existing isolated
R07O loopback-only preview handler and transport. Unlike a public browser API,
R07O remains **unmounted**, and its public activation constant remains false.
The handler still refuses construction outside an official local demo
Firestore Emulator process and HTTP loopback origin.

The new operation is **disabled by default even inside that local handler**:
the server must explicitly pass `allowOfflineReviewEditPreview: true`.
The existing secure bearer token, same-origin fetch metadata, no-cookie
policy, content type, bounded body and no-store response rules remain in place.

The operation delegates to the already merged
`R07MFastLocalCoordinator.acceptOfflineUnifiedReviewEdit`.
Only this existing coordinator resolves authenticated tenant identity,
persists the task and journal, and verifies a R07D unsaved review receipt.
R07O does not write business data and does not create an independent
task owner or mutation ledger.

The client transport offers `reviewEdit(input)`, retaining the exact
origin, idempotency key, draft revision and hash in caller-owned input.
It performs **no hidden retries** and checks the returned status and
receipt-shaped result. The caller still must request and display a
verified server history; the transport alone is not a production UI
or authorization mechanism.

## Focused acceptance

The official local Firestore Emulator end-to-end test uses a local
HTTP listener and a test Firebase token verifier. It covers default
denial, explicit offline opt-in, creation of an unsaved quotation,
one natural-language customer correction, exact-key HTTP replay without
second interpretation, R07D draft receipt and R07M journal history,
changed-payload collision, foreign branch rejection and revoked
membership rejection. It confirms no financial document issuance.

The complete existing R07O HTTP and R07N preview security tests remain
part of the original CI workflow.

## Open constraints

- No production route, deployed Firebase rules/IAM, secrets, or live
  model provider is installed/changed.
- R07N full UI handling of revision updates is not implemented by this
  isolated transport change. The original R07N `accept` interface and
  its source/draft revision assumptions remain untouched.
- Multi-step physical iPhone Safari, real NLU, cloud identity, privacy,
  performance, T22/T23/T24 and release readiness remain OPEN.
- This is NOT authorization to enable production or run live financial data.

Exact-head GitHub CI is required before claiming TESTED or MERGED.
