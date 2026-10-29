# LOUREX AI approved provider pool and bounded handoff

Baseline: f31ff06c8143267e65b3e0d6570294cbe344453f. AI track only.

## Production evidence

The supplied iPhone screenshot records request a773cf8e-7f53-4f72-b8be-3e3cb3495872: Groq rate_limit in 75ms, Cloudflare timeout in 12003ms, total 12078ms. This proves sequential fallback occurred for this request, but both eligible vendors failed. It does not establish which Groq organization quota was exhausted, whether Cloudflare would have answered with more time, or a universal provider outage.

The original private-data pool admitted only approved Groq/Cloudflare models; Gemini/Ollama keys and general provider enablement did not admit them to business requests. Changing timeout alone would not supply another eligible vendor.

The diagnostic owner account was verified through the existing protected health page. A separate synthetic Controller request succeeded by the 5269ms observation. Thus the failure is intermittent. No additional live inference requests were used for this patch.

## Implementation

- Add an explicit deployment-side privacy approval list: LOUREX_AI_APPROVED_PRIVATE_PROVIDERS. Only literal gemini and ollama entries expand the existing private model allowlist. Unset/empty keeps the prior Groq/Cloudflare policy. Request-body flags and task labels cannot grant approval. OpenRouter/Kilo are not added to private routing.
- Gemini, when approved and keyed, can serve text, images and native PDFs using its existing registered model and adapter. Ollama, when approved, keyed, globally enabled and free-allowance verified, joins general text tasks only. It does not receive image/native PDF or deep-only tasks. Existing local schema and task-specific validation remain mandatory even though Ollama Cloud lacks constrained structured output.
- Natural dialogue divides the existing 26-second maximum inference budget fairly among currently usable vendors, bounded by the caller's 12-second maximum attempt and minimum useful time. Each stalled attempt is aborted before trying the next. No concurrent fanout or hidden same-provider timeout retry is added. Shorter shared deadlines still win; four attempts are not guaranteed on every task.
- Preserve existing task/capability selection, account cooldown on 429, circuit handling and validated latency/quality ranking. Ranking is ephemeral per warm function instance, with a stable cold-start prior, not a global guarantee of the fastest provider. Existing local greetings/actions and financial calculations stay local.
- Owner-only dialogue diagnostics now accept Gemini/Ollama and show bounded quota cooldown milliseconds from the router. No raw upstream body or company data is logged. Cooldown is the router's policy (which can include its default/minimum), not proof of the upstream's exact quota-reset time.

## Validation

Production build passed. 65 targeted tests passed:

- ai-approved-provider-pool (6): observed quota-to-timeout-to-Gemini success; Ollama text fallback; native PDF restriction; fail-closed missing approval; free-allowance gate; three stalls leave the fourth vendor a usable window.
- Existing private document routing, multi-provider router and owner diagnostic suites: together with the new suite, 58 passes.
- Shared gateway deadline and request cancellation: 7 passes.

Tests mock providers and accelerated clocks. No live company data, Firebase Rules, finance files, deployment configuration or inference calls changed.

## Deployment approval and activation

This PR prepares capability; it does not silently authorize new company-data destinations. Before production activation, the project owner must approve the data policy for all affected tenants, verify the account allowance and model access, and set non-secret variables:

```
LOUREX_AI_APPROVED_PRIVATE_PROVIDERS=gemini,ollama
LOUREX_AI_NEW_PROVIDERS_ENABLED=true
LOUREX_AI_OLLAMA_FREE_VERIFIED=true
```

The final flag is a factual assertion about account allowance, not a switch to bypass billing review. Preserve existing keys; never copy them into reports or client code. The health page's configured-key/QA/env-eligible badges do not prove production inference, free billing or privacy approval. Native PDFs require approved Gemini because existing other models cannot accept native PDFs.

Google's Gemini free-tier pricing states content may be used to improve products; paid-tier handling differs. Enabling business-data routing must account for this, especially in a public multi-company application. No billing upgrade is authorized by this change. Sources checked 2026-10-29:
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
- https://console.groq.com/docs/rate-limits
- https://github.com/ollama/ollama/blob/main/docs/cloud.mdx

## Remaining acceptance

After review, approved configuration and owner deployment: verify SHA, refresh PWA, perform at most one synthetic dialogue request, observe real fallback metadata if failure occurs. A success does not prove all providers available. Do not force repeated failures or send business files to new vendors as probes. Gemini 2.5 access and all actual account quotas remain to be verified without an unapproved paid upgrade. For iPhone: ensure the error metadata is readable, composer releases after failure, and text remains; full browser suites need not be repeated manually.

Stop at Draft PR. No merge or manual deployment in this task.
