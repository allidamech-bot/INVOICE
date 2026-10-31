# R07T — Blind multi-turn semantic quality gate (OFFLINE)

Date: 2026-10-31. **LOUREX AI Next Generation only.**
Production switches stay OFF. No live model calls, credentials, provider
spend, finance writes, Firebase cloud or production UI activation.

## Why this phase exists

R07P had a 43-utterance independent *single-turn* language gold corpus
and a strict external provider-capture scorer. Successful rule-based
commands or synthetic R07M receipts do **not** prove that a language
model can retain meaning across multiple user/assistant turns.

R07T introduces a separate **synthetic 9-dialogue/27-turn**, three-way
Arabic/English/mixed challenge. Its gold labels represent intended
structured semantic *proposals*, never authorized business outcomes.
Scenarios include:
- missing price -> value-only follow-up -> no-save;
- ambiguous two-item correction -> ordinal -> exact-name patch;
- quoted source prompt injection -> refusal of financial execution;
- customer name correction and read-only preview;
- quoted item quantity/price modification with later no-issue;
- unsafe compound invoice issuance and payment posting;
- mixed-language price, unit, and preview;
- duplicate product names -> no fabricated line ID;
- unverified PDF source, unknown free provider, approval instruction.

The exported input includes ordered synthetic conversational history,
but **no gold answer fields**. The evaluator validates coherent
historical prefixes, full case coverage, unique IDs, a SHA-256 of the
exact gold bytes, strict candidate shape, valid time/status, and rejects
oracle fields and extra capture keys.

## Zero-model workflow

After the existing isolated TypeScript compilation:

```sh
node scripts/ai-next-semantic-dialogue.mjs export > blind-dialogue.json
node scripts/ai-next-semantic-dialogue.mjs baseline > local-rule-baseline.json
```

- `export` includes only synthetic prompt text, prior messages, case
  IDs and languages. No provider calls or expected labels.
- `baseline` actually runs the existing deterministic **single-turn
  recognizer** on all 27 turns. Unsupported/contextual responses remain
  **not_attempted** in the denominator. `ruleBasedOnly:true`,
  `contextUsedForInference:false`, `modelCalls:0`. A claimed score
  from this command must NEVER be called AI/model understanding.
- `score` takes an independently supplied, explicit offline JSON
  capture, but does not authenticate its model origin:

```sh
node scripts/ai-next-semantic-dialogue.mjs score provider-dialogue-capture.json
```

Required capture structure: exact top-level
`schemaVersion:1`, `kind:'r07t_dialogue_capture_v1'`,
`corpusSha256`, `runId`, `observations` containing every one of
the 27 pairs `{scenarioId,turnId,outcome,latencyMs,candidate?}`.
An `ok` observation must include a strict R07P semantic candidate;
all failures/skips must omit it. Outcomes:
`ok`, `not_attempted`, `timeout`, `rate_limited`,
`provider_error`, `privacy_denied`. Skipped latency must be zero.

The report scores all turns (failures and missing outputs count as
failures), gives Arabic/English/mixed action and argument diagnostics,
and counts a **whole dialogue as correct only if every single turn
is valid and fully exact**. Financial execution hallucinations are
explicitly flagged. Percentiles cover attempts including timeouts.

`modelOriginVerified:false`, `accountFreeVerified:false`,
`privacyPermissionVerified:false`, and
`productionAcceptance:'not_assessed'` cannot be overridden by any
capture or even a synthetic 100% score.

## Engineering evidence and open gates

The dedicated R07T CI gate runs strict TypeScript and tests for
gold integrity, transcript continuity, blind export, local baseline,
all-skipped zero accuracy, 100% handwritten fake-capture *not*
attested, one failed turn collapsing dialogue correctness, unsafe
execution hallucination, missing/duplicated cases and oracle leakage.

This phase provides **measurement instrumentation**, NOT a demonstrated
live provider quality improvement. It intentionally does not supply a
model, extra deterministic templates, a new controller, broad context
routing or a production integration.

Still OPEN before real provider benchmarking: confirmed per-account
zero-cost/free quota, API access, private business-data processing
consent, storage/retention region, independently collected predictions,
and explicit authorization for any real model call. R07P/Q routed
semantic into a durable R07M guarded review remains a separate
engineering task. Live QA Firestore IAM/rules, T22 cross-device,
T23 physical iPhone Safari, T24 authenticated source-to-review
acceptance and production release are also OPEN.

No financial files, Firebase rules, external provider configuration
or production Vercel setup changed.
