# R07V — Groq Free Account / ZDR Synthetic Benchmark Preflight

Reference: 2026-10-31. LOUREX AI Next ONLY. No production activation.
No credential inspection, no live provider request, no use of paid credits,
no financial writes, no Firebase Cloud IAM/rules or financial track changes.

## Public evidence, not proof of *this* account
Official Groq documentation, reviewed 2026-10-31:

- https://console.groq.com/docs/your-data : Inference inputs/outputs
  generally are not retained by default; exceptional reliability/abuse
  logging can retain data up to 30 days. All customers can enable
  Zero Data Retention (ZDR) under organization **Data Controls**.
  Groq still retains usage metadata. Some batch/fine-tuning features
  require retention; disable them if available when requiring ZDR.
- https://console.groq.com/docs/rate-limits : RPM/RPD/TPM limits are
  **organization-level**; check exact current model/organization limits
  inside the account's Limits page. Public values are illustrative,
  not verification of available quota in this account.
- https://console.groq.com/docs/models : Model availability and model
  pricing are not identical to free-tier eligibility. Some listed
  models are priced on paid tiers. Do not assume every listed model
  is free or JSON-schema capable on this organization.
- https://console.groq.com/docs/billing-faqs : Developer tier is
  usage-billed. The review must show the account's exact **Free**
  tier, or the provider stays unapproved for zero-spend testing.
- https://console.groq.com/docs/legal/services-agreement : Model
  inputs/outputs are not used for model training without permission,
  subject to contractual and operational exceptions. Check actual
  organization data controls and regional/contract requirements.

**This repository does not hold current trusted proof of the owner's
Groq organization plan, ZDR setting, eligible free model, per-model
JSON format, quotas or remaining allowance. ALL remain unverified.**

## Concrete operator checks (on phone, without entering commands)

1. Sign into **Groq Console** directly. Under Billing, confirm the
   organization is **Free**, not Developer/paid. Never share API keys,
   billing methods or private identifiers.
2. In organization **Data Controls**, explicitly enable ZDR, and
   confirm retention-dependent features are disabled where relevant.
3. In the organization's **Limits** page, inspect the exact available
   model ID, RPM/RPD/TPM and account-specific quotas.
4. Verify the chosen model accepts strict structured JSON (R07P
   structured candidate shape) and stays zero-charge on the current
   Free organization plan. If cost or quota is uncertain, STOP.
5. Security/privacy approval of actual LOUREX content is **separate**.
   Initial live research should use only the 43+27 existing
   independently labelled SYNTHETIC prompts, never a real quote,
   customer, employee, upload or conversation.

## New zero-network machine check

The CLI requires Node 24, existing TypeScript compilation, and accepts
only **nonsecret manually reviewed console metadata**:

```sh
node scripts/ai-next-groq-readiness.mjs template
node scripts/ai-next-groq-readiness.mjs review <sanitized-local-json>
```

The template deliberately has unknowns and stale date: it is BLOCKED
by default. The review input accepts exactly the documented fields,
with no organization IDs, keys, tokens, links, payment data, notes
or unbounded free-form content. It checks:
- account plan is Free and review is no older than 24 hours;
- selected model listed and explicitly included in Free;
- structured output confirmed;
- positive current organization RPM/RPD/TPM;
- explicit nonbillable usage confirmed;
- ZDR enabled and retention-dependent features disabled;
- synthetic-only and self-reported unverified provenance.

Any missing or negative item returns `blocked` and explicit reasons.
Even a complete input returns only
`pending_independent_account_review`. It deliberately returns
`canInvokeProvider:false`, `accountFreeVerified:false`,
`perModelPriceVerified:false` and
`privacyApprovalVerified:false` **FOREVER**:
self-reported console fields cannot make the trusted R05 provider
registry eligible or authorize the R07Q transport.

This stage does **not** include a live Groq runner. A future controlled
synthetic-only runner, if approved, must be separately wired to an
independent server security/finance authority and keep provider calls
and cost bounded; its successful outputs must be scored with the
existing R07P 43-case and R07T 27-turn blind scoring tools, not with
a cherry-picked subset.

## Test and release boundaries

- Strict schema rejects secrets, untrusted extra keys, forged approval
  flags, invalid model IDs, stale/future timestamps, nonnumeric quota
  entries and unknown privacy settings.
- The CLI uses local files only and prints only codes on parsing error,
  never raw input, credentials or paths.
- No account verification was performed. No real provider latency,
  accuracy, zero-cost proof or privacy attestation was obtained.
- All AI Next runtime flags and production settings remain OFF.
- T22 cloud cross-device, T23 physical iPhone and T24 authenticated
  financial review-to-approval acceptance stay OPEN.
