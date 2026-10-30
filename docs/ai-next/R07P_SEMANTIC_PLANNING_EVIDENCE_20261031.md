# R07P — Scoped Semantic Planning: implementation and release boundary

Date: 2026-10-31. Scope: AI Next only. Pull request: #1224.

## Implemented code

- src/ai-next/router/semantic-planner.ts introduces a disabled authenticated, membership-checked **proposal planner**, not a financial executor.
- Reuses R01 GroundedIntent strict validation and R05 deterministic greeting/empty-quotation recognition.
- Consumes server-scoped context only; rejects foreign scope, malformed output, foreign document IDs, unknown line references, ambiguous "last document", and incomplete-history pronoun targets.
- Always emits executable=false, financialSaved=false and no trusted business/evidence facts from semantic model output.
- Model-dependent path is injected **synthetic fixtures only**. If no synthetic interpreter is explicitly permitted, nonlocal turns report unsupported; no live inference and no paid credits.
- No public route, Firebase rule, financial writer, production flag, or provider credential is changed.

## What this proves — and does not prove

The multilingual benchmark tests **schema interpretation, reference resolution, risk gating and no-write behavior from predetermined synthetic semantic output**. It does **not measure model understanding accuracy** for naturally spoken Arabic/English, nor claim multi-turn integration into the R07M durable task coordinator. The R07P seam has an explicitly separate context-reader interface; a trusted journal adapter and authenticated task coordinator integration are still required in R07R.

R07Q must add provider consent/privacy, verified zero-cost eligibility and structured model routing, never reuse a test-only interpreter for production. R07R must bind an authenticated durable turn, request key, history and review draft repository to the R07P plan. Do not automatically persist or issue financial documents.

## Verification and known blockers

SHA-bound GitHub CI: TypeScript, 16 synthetic Arabic/English benchmark scenarios, adversarial/security negatives, R05/R07M regressions and production isolation. Record exact results in PR checks; do not describe a running job as successful.

Open: real-language NLU accuracy; durable semantic planning/idempotency event integration; actual draft field editing; provider routing; cloud IAM/rules; real business evidence; T22/T23/T24; production deployment and physical iPhone Safari.

Financial track untouched; all AI Next activation flags remain disabled.
