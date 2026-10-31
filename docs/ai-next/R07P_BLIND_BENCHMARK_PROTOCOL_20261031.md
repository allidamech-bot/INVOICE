# R07P blind multilingual benchmark — pre-live inference gate
**Date:** 2026-10-31. **Track:** LOUREX AI Next Generation only.
**Production flags:** OFF. **Real provider calls performed:** 0.

## Why this exists

PR #1246 introduced honest Arabic/English/mixed scoring of independent candidate captures.
The remaining blind-benchmark gap was that model operators could accidentally see the
gold answer labels, could report only successful cases, and could omit timeouts/rate
limits when describing quality or latency. This change adds a **protocol**, not a
new model router or proof of actual model intelligence.

## Prepare a prompt-only file (zero cost, local)

After TypeScript compilation:

```sh
node scripts/ai-next-semantic-benchmark.mjs export > blind-prompts.json
```

This exports 43 synthetic requests, their case IDs and language tags, and the SHA-256
of the raw independently labelled corpus. **There are no expected actions, facts,
reference labels, or gold answers in this output.** The synthetic corpus is in
the repository and a determined evaluator could still look it up; blind export
prevents accidental leakage, not deliberate answer contamination.

**Do not automatically dispatch these prompts to provider endpoints.** Before
an operator uses any real model, they must independently verify current
account-specific zero-cost entitlements, per-model input/output cost, quota,
privacy consent, data retention/region, and applicable API restrictions.
The existing R05/R07Q authorization gates remain authoritative. Merely
receiving this export is not an authorization to perform inference.
No credentials are accepted by this script.

## Import a single-model, exhaustive external observation capture

The caller-generated `provider-capture.json` must contain exactly:

```json
{
  "schemaVersion": 1,
  "kind": "r07p_provider_capture_v1",
  "corpusSha256": "<raw SHA-256 copied from the blind export>",
  "providerId": "provider-from-independent-operator",
  "modelId": "model-from-independent-operator",
  "runId": "unique-controlled-run-id",
  "observations": [
    {
      "caseId": "ar-draft-01",
      "outcome": "not_attempted",
      "latencyMs": 0
    }
  ]
}
```

This *shape* illustrates one entry; real capture must include **all 43 cases**,
with one and only one observation for each. Valid outcomes:
`ok` (requires `candidate`, a raw strict R07P structured output),
`timeout`, `provider_error`, `rate_limited`, `privacy_denied`,
or `not_attempted` (must have `latencyMs:0`).
Failure outcomes may not contain a candidate; `expected` labels, extra
metadata, unknown IDs and duplicates are all rejected. Observed latency
must be a nonnegative integer not exceeding 50,000 ms.

Run locally after compiling:

```sh
node scripts/ai-next-semantic-benchmark.mjs score provider-capture.json
```

The report calculates per-language and overall **full-corpus-denominator**
quality, explicit success/failure counts, unsafe execution-intent errors,
and p50/p95 latency over **all attempted requests including failures**.
Unattempted requests do not distort the latency distribution and still
reduce coverage/accuracy. Only schema-validated candidates are valid;
a syntactically received but bad candidate remains invalid.

The report **never attests external identity or billing**:
`provenanceVerified:false`, `accountFreeVerified:false`,
`privacyPermissionVerified:false`,
`productionAcceptance:'not_assessed'`. These remain false even for
synthetic fixture scores of 100%, because file contents alone cannot
establish a genuine provider run. No gold utterances or model candidate
values are printed in the results.

## Acceptance / release boundary

CI must exercise the new strict protocol, existing global evaluation tests,
TypeScript compilation and finance/production isolation. Synthetic fixture
tests prove correct *scoring and failure accounting* only.

Real inference benchmarking, independently attested provider account
zero-cost/privacy, actual source provenance, 43 true external predictions,
cross-turn understanding, performance under provider load, live Firebase
IAM/rules, T22–T24, physical Safari/iPhone, and production authorization
are **OPEN**. Do not report measured model accuracy until authentic model
outputs have been independently collected and reviewed. No production
deployment, provider activation, finance mutation or paid call is permitted
by this PR.
