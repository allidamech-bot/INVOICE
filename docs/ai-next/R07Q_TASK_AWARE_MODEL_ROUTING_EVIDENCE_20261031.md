# R07Q — Task-Aware Zero-Cost Semantic Model Routing (Offline Gate)

Date: 2026-10-31. AI Next only. **No production activation or live inference.**

## Implementation

- Reuses R05's trusted model registry, verified account-specific zero-cost/credential/privacy eligibility, health-based bounded fallback and shared deadline. R05 remains the only route selector; no competing orchestration layer or financial writer was introduced.
- Adds a narrowly injected task-aware ranking function to the existing R05 gateway. Light requests prefer lower-complexity eligible models, while complex document/reasoning requests prefer capable eligible models. Actual recent health metrics can outweigh unproven static tier preferences. Models lacking eligibility can never enter ranking or receive a request.
- Separates provider authentication failure, quota exhaustion and runtime privacy denial from timeouts and 429 errors. Authentication/quota failures cool down the affected provider, a runtime privacy denial stops all fallback, and structured response failures can retry another eligible provider within existing R05 bounds.
- Adds a strict R07P semantic output validator to the typed routing seam. An arbitrary model string or unknown JSON fields cannot be treated as a prepared action.
- R07Q's only new callable transport is marked offline_synthetic_fixture, and its privacy class is restricted to public_synthetic. It cannot be used to send customer data. The activation flag stays false, with no endpoint, Firebase or Vercel changes.
- All eligible verified zero-cost records are considered within the existing 300-record bounded registry; not a hardcoded one-model-per-provider list. No live account or quota entitlement was checked or changed.

## Evidence and unresolved release gates

The SHA-bound CI workflow checks TypeScript, synthetic tasks, free/privacy/cost denials, mixed failures, provider cooldown, circuit breaker, structured-output validation, cancellation, fallback and regression for R05/R07P/R07M. CI results must be verified at the final PR head before merge.

**Not proved:** current real-world free model eligibility, provider credentials or limits, actual natural language understanding, realistic end-to-end p95 latency, Cloud IAM/ACL, durable route health shared across independent processes, true provider SDK error translation, physical Safari or T22–T24. There is no live inference or production model call authorization in this milestone.

Next: R07R server-authorized scoped semantic orchestration and real unsaved draft lifecycle; only approved providers and approved QA data can enter later real inference.
