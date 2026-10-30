# R07M Semantic Durable Turn Increment — AI-only, Offline, Disabled

Reference: October 31, 2026. PR #1232. Baseline: main b5fc2d09bd9ade837bd87bc00c78fdca7c428389.

## Engineering change

The existing R07MFastLocalCoordinator gains a disabled acceptOfflineSemantic method. It shares the original R07M server membership authority, indexed R07J turn-request idempotency, transactional latest-turn projection, append-only event journal and historical audit; there is **no second coordinator, storage root or HTTP route**.

For one natural, non-deterministic user utterance, an explicitly injected synthetic offline R07P fixture interpreter runs only after the authenticated turn and user-message events have been committed. On a validated synthetic interpretation, a planning-only assistant reply and a completed task event are committed. Response states financialSaved:false, businessReadPerformed:false, draftEdited:false; never claim an authorized business read or saved quotation. The existing R05 local greeting/empty quotation flow is left intact and stays provider-free.

R07M request-key CAS prevents a second turn when a user repeats an accepted request. After an assistant message is committed, a network retry reconstructs the previously acknowledged text without reinterpreting; if an offline fixture crashes before the assistant event is persisted, the same request can resume its processing task. Concurrent requests use the established R07M transactional sequencing.

## Test evidence and limitations

Focused SHA-bound GitHub Actions run synthetic/transactional-store scenarios, existing R07M/R07P/R07R regressions, TypeScript and financial deployment isolation. Tests exercise revoked or forged membership, duplicate keys, old-key replay, offline-interpreter failure and recovery, concurrent requests, and blocked financial/source claims. Verify actual counts and results in final-head check logs.

**Not completed:** no real model inference or measured Arabic language accuracy; semantic context in these tests is synthetic, NOT reconstructed from trusted historical R07J records. This feature does not connect R07R guarded draft editing or claim persisted business document retrieval. There is no durable provider-outcome receipt before assistant message; a failure prior to acknowledgement can repeat synthetic-only interpretation, and any later live model requires explicit budget authorization and durable single-call protections. No real Firebase IAM/rules, independent QA backend, multi-device QA, physical Safari or T22/T23/T24 release acceptance.

## Release protection

- R07M_FAST_COORDINATOR_ACTIVATED stays FALSE.
- allowOfflineSemanticFixtures is injected server-side and defaults OFF.
- The semantic method rejects R05 deterministic commands and routed (non-synthetic) model output.
- No finance code, live data, provider credential, production Vercel route or Firebase rule changed.

Next: trusted scoped context from audited R07J history and R07D draft references, durable outcome receipts and separately guarded R07R draft-action integration. Avoid a second coordinator. No production activation.
