# R07Q Complementary Semantic Router Boundary — Offline Evidence

Date: October 31, 2026.
Base: merged R07Q free eligibility/provider cooldown PR #1225.
All AI Next production flags remain OFF.

## Added after R07Q free eligibility

- Reused **the existing R05 gateway**, its trusted dynamic free-model registry, task-fit ranking, bounded fallback and health book; no duplicate selector or model hardcodes.
- Exported the strict R07P structured semantic candidate validator to the existing R05 transport validation boundary. Invalid, extra-field and fabricated-success outputs are rejected before any task preparation.
- Added a **synthetic-only offline semantic routing adapter** with no HTTP provider client, credential reader or external API endpoint. Its input is explicitly synthetic and its transport must declare an offline fixture marker; this is a development guard, not a production authorization proof.
- Added runtime privacy_denied failure semantics to the R05 gateway: stop all attempts immediately, record a redacted category, and temporarily hold the provider in cooldown rather than trying a fallback after consent is revoked.
- Negative tests cover cost unverified, absent credentials, quota, provider disablement, privacy, malformed model results, wrong transport class, global cancellation, oversize registry, and deferred circuit breaker.

## Exact claims and limitations

The test suite proves offline structured-output safety and API contract composition using prerecorded synthetic responses, **not** actual model understanding of Arabic or English, actual provider free eligibility/quotas, production p95 latency, physically isolated customer data, or live security rules. Mock transports cannot establish real provider error translations. This adapter is not wired into the R07M durable Controller and has no financial-write authority.

The R07P server-authenticated semantic planner still defaults to unsupported for nonlocal prompts absent an explicitly injected test-only interpreter. R07R must attach a durable semantic operation to the existing R07M coordinator with bounded event steps, idempotency and independently trusted scope; no new parallel coordinator.

## Verification gates

Final-SHA GitHub Actions: strict TypeScript, R07Q offline model/failure tests, R05 and R07P/R07M regression, production bundle isolation, exact changed-path review. Do not assert a pass before the checks finish.

Unresolved: real eligible zero-cost account catalog, approved private-data inference, durable cross-instance health, end-to-end document grounding, T22/T23/T24, real QA Firebase IAM/rules, iPhone Safari and explicit production activation authority.

Finance track untouched; no paid inference or live Firebase data.
