# R07Q — Offline Free-Model Pool and Failure-Aware Routing

Reference date: 2026-10-31. AI Next code-only change. No provider account/config/deployment change.

## Implementation

The existing R05 account-gated registry and gateway remain authoritative. R07Q makes three scoped corrections:

1. Remove static model-name exclusion: previously even server-verified configured zero-cost models could be silently discarded based on a historical provider preference. Eligibility still requires provider enabled, credential present, explicitly verified account free entitlement, per-model zero price, quota, privacy, task capability, modality and health. **This change enables no new live provider by itself.**
2. Evaluate every model in a bounded server-trusted pool (at most 1,000) rather than silently omitting models beyond position 300. Oversized catalogs fail explicitly; catalog discovery/entitlement verification remains a separate operational requirement.
3. Rank only *already eligible* models by documented task class and observed health. Retain shared deadline, max attempts, validation and cancellation; add separate failure categories and bounded cooldown for authentication, quota exhaustion, regional denial and unsupported-model cases. Failures can fall back to another independently eligible provider without reopening the same failed provider immediately.

## Verification targets

- R05 and server registry synthetic regression tests prove verified zero cost and private-data approval remain mandatory, name-based defaults do not grant access, and 350-record pool coverage does not silently truncate.
- Task-aware selection and provider-auth/quota/model-unsupported scoped cooldown are tested with mocked transports only.
- Existing R05 compiled typecheck and code-only isolation checks must pass on the exact PR head.
- No real model, live provider API, production account settings or paid credits used.

## Remaining gaps and hard stops

Real per-account free access, privacy permissions, provider quotas, currently reachable models, regional rules and latency p95 remain unverified. Existing server registry candidates are metadata, not live entitlements. Health state is in-memory and not cross-instance durable; the task-quality tiers in current registry are conservative priors, not benchmarked real model quality. R07P is not connected to R05 inference; R07R coordinator and trusted source integration remain open. T22/T23/T24 and all production security/activation gates remain OPEN.

This work does not claim that all five configured providers or all advertised models are actually zero cost or usable. Provider activation requires separate evidence and explicit approval.
