# R07P multilingual scoring and offline capture ingestion (31 October 2026)

## Intent and hard boundary

This change extends the **existing** R07P offline evaluator without building a competing
semantic planner, turning on an AI provider, changing finance code, or exposing a
production route. It does **not** improve or measure a real model by itself.

Previous merged evidence: 43 independently labelled **synthetic** gold cases for
Arabic/Levantine, English, and mixed Arabic/English requests. Existing global
scoring, missing-prediction denominator, structured-candidate validation, and
unexpected financial execution detection remain authoritative.

## Implemented

- `scoreR07PMultilingualReport` globally validates each prediction before
  separating per-language accuracy, coverage, schema validity, and unsafe
  execution intents. Confusion entries include `missing_prediction` and
  `invalid_candidate`, not just successful model outputs.
- `scripts/ai-next-semantic-report.mjs` reads only a local bounded JSON capture.
  The capture must pin the **raw SHA-256 bytes** of
  `tests/ai-next/r07p-semantic-evaluation-gold.json` to prevent scoring
  predictions against a changed gold version.
- Input has exact keys `schemaVersion`, `captureType`, `corpusSha256`,
  `predictions`. Each prediction has *only* `caseId` and `candidate`;
  `expected`, gold utterances, extra metadata or unknown IDs are rejected.
  Individual malformed structured candidates count as **invalid**, not
  accurate.
- Output includes case IDs, metric counts and categories, but does not print
  the gold utterances or the raw model responses.
- `captureType` is **caller-declared, unverified metadata**. The output
  explicitly reports `captureTypeVerified:false`,
  `modelOriginVerified:false`, and
  `productionAcceptance:'not_assessed'`, even if all submitted candidates
  exactly match the gold.
- The CLI performs **zero HTTP requests**, imports no provider SDK, contacts
  no database and reads no secrets, customer records, or live finance data.

### Capture format

```json
{
  "schemaVersion": 1,
  "captureType": "external_predictions",
  "corpusSha256": "<SHA-256 of raw gold JSON bytes>",
  "predictions": [
    {
      "caseId": "ar-draft-01",
      "candidate": {
        "action": "prepare_quote",
        "reference": "none",
        "subject": null,
        "facts": [],
        "missingFields": [],
        "sourceIds": []
      }
    }
  ]
}
```

The example is only a schema example. Neither a manually entered example
nor a label copied from gold is evidence of real model accuracy.
No source/model authenticity is established by a JSON label.

After TypeScript compilation: `node scripts/ai-next-semantic-report.mjs /path/to/capture.json`.
One JSON report prints to stdout. Invalid input fails closed with a short code
and does not echo file contents.

## Acceptance / future steps

Exact-PR-head CI must pass typecheck, isolated compilation, existing R07P
regression, new language/CLI negative tests, and production-isolation check.
Only then is this instrumentation eligible to merge.

**Still open:** independently collected verified **real** private-model outputs
for all 43 cases, actual model identity/provenance, per-model current verified
zero-cost entitlements, authorized privacy terms, latency/timeout performance,
real cross-turn contextual language understanding, official cloud IAM/rules,
T22–T24, physical iPhone Safari, and production activation. All feature flags
remain OFF. This document is not release authorization.
