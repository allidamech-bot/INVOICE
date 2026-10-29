# LOUREX AI multi-model routing — 2026-10-29

AI track only. Main baseline f31ff06c8143267e65b3e0d6570294cbe344453f. Extends Draft PR #1181; no production configuration, merge or manual deployment.

## Proven failure and change

The supplied iPhone capture records a773cf8e-7f53-4f72-b8be-3e3cb3495872: Groq rate_limit 75ms, Cloudflare timeout 12003ms, total 12078ms. Fallback occurred, but only two private models were eligible. A separate synthetic request succeeded by the 5269ms observation: intermittent, not a universal outage. The capture does not identify which quota was exhausted or prove a broken key.

The router also discarded all but one candidate per vendor and applied every 429 to the whole provider. Multi-model mode now retains alternate models with vendor diversity first. Explicit Groq error wording identifying the requested model permits a model-only cooldown and prioritizes another eligible model of Groq. Unknown/account-wide limits remain provider-wide; no key rotation or quota circumvention. Schema and task-specific result validation remain mandatory.

Natural dialogue fairly divides its existing maximum 26-second budget among usable candidates. Attempt deadlines abort stalled work. At most eight inference attempts per request in multi-model mode; no concurrent fanout. Metadata discovery is included in the request budget. Shorter shared deadlines still win. Existing capability/task filtering and ephemeral validated latency/quality ranking remain; cold starts have a stable prior, not a global fastest-provider guarantee.

## Catalog coverage — do not claim every model is live

- Groq: existing GPT-OSS 120B, Qwen 3.8 27B plus GPT-OSS 20B in multi-model mode. These chat models appear in current published free-tier limits. Guardrail/audio models are not chat answers and are not sent to the chat adapter. Account/project limits still need matching to the production key.
- Cloudflare: all three existing registered text models become eligible under multi-model private routing, subject to their existing declared capabilities. This is not a claim that the entire current Cloudflare catalog has been reviewed or that a paid Workers account is billing-capped.
- Gemini: existing 2.5 Flash-Lite plus 2.5 Flash/Pro; published free-tier text/image/PDF capability. Actual account access, including restrictions on older models, is unverified. Other current Gemini models are not silently assumed free.
- OpenRouter: opt-in metadata-only discovery of ALL returned `:free` chat variants with explicit numeric zero pricing for every supplied price field. Missing, nonnumeric, positive, overridden pricing, funded-only zero-price non-free IDs and non-text output endpoints are rejected. Capabilities come from metadata; unsupported modalities never become upload fallbacks. Retains openrouter/free if discovery fails. Cache 5 minutes after success/30 seconds after failure; 1.5-second discovery bound; fixed HTTPS URL, no credentials/prompts/history/business data sent. Inference additionally sets zero input/output max_price and data_collection deny. This is actual catalog expansion, not one hardcoded OpenRouter model.
- Ollama: official pricing checked today states pay-per-token for every cloud model. Do not expand or activate it under the user's free-only policy without account-specific evidence. Multi-model mode requires both the old verified-free flag and an explicit current zero-cost model list; only the existing gemma4:31b adapter entry can currently be admitted. The old flag alone is insufficient. No new Ollama models are claimed free.

Thus the request to activate every free model across all five vendors is NOT fully closed. OpenRouter discovery and the proven Groq multi-model defect are implemented; account/free/privacy verification and complete Groq/Gemini/Cloudflare catalog coverage remain open. Do not misrepresent an open Draft PR or configured key as production activation.

## Private-data and free-cost controls

Unset LOUREX_AI_APPROVED_PRIVATE_PROVIDERS preserves prior Groq/Cloudflare policy. Only explicit server-side entries gemini,ollama,openrouter expand private destinations. Client body flags cannot grant approval. Kilo/Mistral are not added.

Prepared activation settings (not applied):

```
LOUREX_AI_MULTI_MODEL_ENABLED=true
LOUREX_AI_NEW_PROVIDERS_ENABLED=true
LOUREX_AI_APPROVED_PRIVATE_PROVIDERS=gemini,openrouter
```

Only after independently proving a current zero-cost Ollama allowance, add ollama to the privacy list and verify LOUREX_AI_OLLAMA_FREE_VERIFIED=true plus LOUREX_AI_OLLAMA_ZERO_COST_MODELS=gemma4:31b. Do not set these as a substitute for evidence. Published availability of a free allowance does not prove the connected account cannot incur overage; owner must retain free-plan/no-overage billing controls. No paid models, credit purchases or billing upgrades authorized.

Gemini free-tier content may be used for product improvement. Its business-data approval remains explicit. OpenRouter keeps data_collection deny; if no eligible privacy-preserving free endpoint exists, fail closed. Diagnostic output is verified-owner-only and bounded to provider, model ID, category, model/provider quota scope, cooldown, elapsed time and fallback index; no upstream bodies, keys or company content.

## Validation

Regression first failed: a model-specific GPT-OSS 120B quota was routed to Cloudflare instead of another Groq model. Passes after model-level handoff fix.

71 focused tests passed: 64 across approved pool, zero-price catalog, multi-provider routing, private document isolation and owner diagnostics, plus 7 shared gateway deadline/cancellation regressions. Production build passed against final source. No live inference calls or broad browser suites in this implementation.

## Remaining acceptance and action

Review CI and code; resolve explicit privacy and account-free allowances before owner configuration/deployment. Verify SHA/PWA. Use at most one synthetic acceptance request; success does not certify every vendor. Do not repeatedly force failures. Verify iPhone owner diagnostics stay readable, composer releases on failure and retains the prompt. Full multi-device/cancelled-approval acceptance remains distinct from this provider change.

Official sources checked today:
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/models
- https://openrouter.ai/api/v1/models
- https://openrouter.ai/collections/free-models/
- https://ai.google.dev/gemini-api/docs/pricing
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://ollama.com/pricing (pay-per-token cloud catalog; contrary to assuming all cloud models free)

## Review closeout follow-up

GitHub head 8e0a95e had three failed workflows, all tracing to one historical OpenRouter test that deep-compared the old provider settings and rejected the new zero-price max_price guard. Updated the assertion to require both privacy denial and the zero-price guard; did not remove the guard or relax the contract.

Also reproduced a stale-catalog defect: after a successful catalog load expired, a failed refresh returned [] once but retained old cached prices for the next call. Clear cached metadata on failure. A focused regression failed before and passed after the fix.

80 targeted tests passed in the closeout run, including the previously failing CI contract, all routing/catalog/owner tests, server role/sandbox and provider request contracts. No broad local browser/emulator/PDF suites or live provider calls repeated. Automatic GitHub checks remain authoritative for the new pushed SHA. Production activation and full account-specific catalog coverage remain blocked by the verification items above; no claim of all vendors running for free.

## Focused engineering follow-up — 29 October 2026

After the original SHA, the automatic targeted Actions checks completed successfully. The router review revealed a previously untested failure: with many `:free` OpenRouter candidates, both futureReserve and fairBudget were proportional to every candidate. A 26-second dialogue could allocate only 3 seconds to the first vendor, although a known synthetic answer had taken around 5.3 seconds. This is a budgeting defect, not proof of any provider outage. The fix counts up to four practical opportunities (distinct vendors plus one same-vendor alternative), rather than all discovered model IDs. It preserves the same 26-second total cap and eight-attempt ceiling, and adds a mocked 60-model catalog regression. No live inference call.

Official Gemini API pricing currently advertises free-tier standard text inference for 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite and 3.1 Flash-Lite. Those four are now opt-in candidates alongside 2.5 Flash/Pro/Lite, but **their actual production-key free-tier access is not verified**. Flash-Lite additions are conservatively classified as text-only for the current adapter until file/image support is verified. Gemini's free-tier use of content for product improvement still requires explicit business-data approval. Paid-tier projects are NOT assumed free. References: https://ai.google.dev/gemini-api/docs/pricing and https://ai.google.dev/gemini-api/docs/models.

Verified public pricing distinctions: Cloudflare Workers Free grants 10,000 Neurons/day and blocks use beyond the free allowance, while Workers Paid can bill for excess; verify the connected account before broad activation (https://developers.cloudflare.com/workers-ai/platform/pricing/). Current Ollama cloud pricing is pay-per-token; a $0 subscription price does not prove $0 inference (https://ollama.com/pricing). Groq's published limits are baseline, not production organization/project usage (https://console.groq.com/docs/rate-limits).

Remaining evidence gaps, not closed by code or mocked tests: identify the precise Groq project connected to production, inspect project model/day/minute utilization and input/output tokens; obtain Cloudflare request traces/status and whether model busy/queue/size contributed to the 12003ms timeout; measure live prompt+memory+business evidence byte/token sizes via authorized diagnostics; verify the billing/no-overage controls and privacy approvals for each private provider. No secret values, actual business data, or production configurations were read/changed in this follow-up. No claim of a completed five-vendor free pool.
