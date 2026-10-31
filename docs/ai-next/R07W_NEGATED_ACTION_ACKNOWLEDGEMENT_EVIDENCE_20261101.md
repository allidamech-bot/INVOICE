# R07W — Negated financial action / acknowledgement-only regression

Date: 2026-11-01. Scope: **LOUREX AI Next**, isolated, production flags unchanged.

## Reported defect and boundary

The owner observed on the existing **legacy production AI chat**, not Groq Playground, that an explicitly non-executing, synthetic two-line quotation context followed by "do not modify anything; only confirm that you understood" fell into a generic invalid-plan message. The `src/lib/ai-tool-client.ts` action keyword recognizer is a suspected contributor. That production call path is **not** this separate R07P implementation; this change **does not repair or deploy the legacy path**.

## Implemented AI Next-only protection

- After server authentication and membership checks, an **explicit no-write + final acknowledgement-only** instruction receives a deterministic `discuss` reply with zero model/context calls, no financial operation or draft mutation. This does not attempt to parse or verify the supplied amounts.
- An independently validated **negative write constraint** remains binding when a synthetic or future routed model outputs `edit_draft`, `prepare_quote`, `request_approval`, `execute_approved` or `cancel`: the candidate is rejected and clarification requested, never executed.
- `لا، خلي الكمية 12` is **not** treated as `لا تعدل شيئاً`; legitimate corrections still pass through existing, grounded R07P/R07R flows.
- The acknowledgement grammar is deliberately conservative. It is **not** a claim of comprehensive Arabic understanding; ambiguous utterances still require semantic interpretation or clarification.
- Regressions include the witnessed two-line synthetic quotation, English version, untrusted model attempts to override a user's prohibition, and retained affirmative corrections.
- All test model outputs are synthetic injections, **not live provider benchmark results**.

## Provider readiness checkpoint (A1 / A2)

**Owner-reported console screenshots already supplied in project handover:** at observation time the Groq account displayed Free ($0), Global ZDR enabled and Inference API ZDR following the global setting, with Batch and fine-tuning disabled. No repeated screenshot request is necessary.

**Public Groq documentation reviewed 2026-11-01:**

- Structured Outputs / strict JSON schema support lists `openai/gpt-oss-120b` and `openai/gpt-oss-20b`: https://console.groq.com/docs/structured-outputs
- Current model cards indicate JSON Schema capability and published token prices: https://console.groq.com/docs/model/openai/gpt-oss-120b and https://console.groq.com/docs/model/openai/gpt-oss-20b
- Billing distinctions between Free and Developer plans: https://console.groq.com/docs/billing-faqs
- Provider data controls: https://console.groq.com/docs/your-data
- Rate-limit reference: https://console.groq.com/docs/rate-limits

**NOT independently confirmed:** currently active Groq organization/project identity, real Free entitlement for the selected API and schema combination, per-model billability for this account, remaining daily/minute quotas, and authenticated inference access. These are **BLOCKED for live A2**. Account screenshots, public prices and local R07V self-report must **never** elevate `canInvokeProvider`, `accountFreeVerified` or `privacyApprovalVerified`.

No API credentials were requested, stored, tested or sent. No model inference, billable activation, production deployment, feature flag, Firebase rules, customer data or financial data modifications.

## Evidence limitations / acceptance

Exact PR-head TypeScript, focused R07P tests, R07M regression and scope checks must pass in GitHub CI before merge. Only then is this AI Next offline regression stage complete; neither live language quality nor R07M real-model durability, T22, T23, T24 or production release is thereby proven.

## Follow-up

After this isolated guard, continue A3/A4: verify the real routed-model + durable-review end-to-end bridge and enforce the same no-write invariant across all mounted entrypoints. If an urgent production-chat legacy fix is needed, scope a **separate** AI-only PR and require owner approval for deployment.
