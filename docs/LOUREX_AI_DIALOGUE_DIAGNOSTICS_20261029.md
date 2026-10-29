# LOUREX AI dialogue failure diagnostics — 2026-10-29

Baseline: ee5b10fc3e3526bb209ccecec33c2bce7912d69c (main, including financial PR #1172). AI-only changes.

## Evidence and limits

After deployment 3e59485b6f758aada523e22c3ce68347976eaae3, the Controller Arabic fictional notebook prompt produced the public AI timeout message by the 18.386-second observation. This is an observation bound, not precise provider latency. English quotation facts completed in 1.469 seconds via local read; Advisor fictional follow-up completed in 2.155 seconds and retained the fictional context. Those routing fixes remain verified.

Vercel runtime-log access returned HTTP 403. Provider responsibility remains unproven. No provider is removed, added, or granted access to business information in this change.

The code-level observability gap is reproduced: naturalLourexDialogue discarded the router request ID and timings on failure and did not attach an attempt listener. The browser could only display the generic public error.

## Change

On dialogue failure, preserve the router's bounded request ID for support correlation. For the existing diagnostics administrator only, collect at most eight attempts with allowlisted Groq/Cloudflare provider, fixed category, bounded elapsed milliseconds and fallback index. Include bounded total route time. Both ordinary conversation and creation-to-dialogue fallback in ai-core use the verified Firebase UID and existing configured diagnostics owner gate. A client body flag cannot authorize access.

The browser renders only fixed diagnostic fields and a validated request ID. No prompt, response content, history, upstream body, credentials, UID or business record is copied. Success response behavior and provider budgets are unchanged. No new serverless function, persistence, live data change or Firebase Rules change.

## Validation

- Regression first failed because the dialogue failure request ID was undefined.
- Production build completed successfully.
- 52 focused tests passed across owner diagnostics, authorization, dialogue fidelity/negated completion/unified flow, gateway deadline and request cancellation suites.
- Gateway integration uses mocked provider responses: rate limit followed by timeout, correct owner vs other signed-in UID, client authorization spoof rejected, no sensitive fields leaked.
- No live provider calls or broad browser suites performed during this patch.

## Remaining acceptance after review and deployment

1. Verify deployed SHA and refresh the PWA.
2. If the active account is the configured diagnostics administrator, send one synthetic conversation request and inspect failure metadata if it fails. A successful request does not reproduce the intermittent timeout; do not repeatedly call to force failure.
3. Other accounts receive only the correlation ID. If administrator access is unavailable, obtain read-only Vercel logs for that ID through the project owner; do not broaden diagnostics permissions.
4. Use the observed attempt categories/timings to decide the smallest provider/routing fix. This patch diagnoses failures; it does not claim to eliminate timeouts.
5. On iPhone Safari, check that an error's bounded metadata and request ID remain readable and that the composer is enabled with the unsent prompt retained. Multi-device conversation sync and cancelled-approval recovery remain separate open acceptance items from the earlier audit.

Stop at Draft PR; no merge or manual deployment performed for this patch.
