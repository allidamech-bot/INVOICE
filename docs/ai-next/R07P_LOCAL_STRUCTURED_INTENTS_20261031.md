# R07P/R07R deterministic Arabic/English intent handling — 31 Oct 2026

## Scope and truth boundary

This change improves **actual local interpretation of strictly recognized text**,
not real LLM/provider Arabic quality. It does not implement open-ended natural
language understanding. Existing R05 greeting/new-quotation path, R07P audited
scope/semantic planner, R07R guarded unsaved quotation editor, R07D revision
receipts and R07M durable Controller task remain the only authorities.

Production remains OFF; no public route, no provider credentials or billing,
no real customer data, no Firebase live IAM/rules and no finance document
issuance, payment, accounting or inventory mutation were changed.

## What changed

- `recognizeR07PLocalStructuredIntent` handles a bounded, full-utterance
  subset of Arabic (including Levantine corrections and Eastern-Arabic
  digits), English and Arabic/English mixed requests. It emits strict
  R07P candidate schemas for verified-client-name requests, quantity,
  unit price, currency, unit, preview, last quotation, attached file
  clarification, explicit no-save, and request-approval **classification**.
- Numeric corrections use the requested FINAL value rather than the
  obsolete original number. Customer capitalization and original Arabic
  hamza spelling are preserved; names are **not** trusted customer IDs.
- Missing price and unresolved/ordinal item references require
  clarification, not guessed values/IDs.
- Unrecognized, joined/compound, destructive/negative, malformed,
  or excessive requests are not interpreted by this parser. They
  fall back to the existing disabled semantic provider path.
- R07PSemanticPlanner only enables the parser when an independent
  **server-constructor-only** `allowDeterministicStructuredIntents:true`
  is set. Authentication and server membership happen FIRST. It
  subsequently reads/verifies the same fully audited R07P scope context,
  resolves verified drafts and lines, enforces viewer/Advisor write
  restrictions, and returns `executable:false`, `financialSaved:false`,
  `providerCalls:0`.
- The existing R07R synthetic/offline review session permits the new
  server-only `offlineDeterministicStructuredIntents:true` for local
  QA. R07R's receipt-gated preparation bridge accepts a **deterministic
  proposal** with the same stringent draft/permission/revision/field
  checks it used for synthetic-model proposals.
- The existing R07M unified `unsaved_review_edit` task remains the
  only durable task owner, and R07D still owns its guarded revision
  CAS/receipt. There is no new conversational journal, finance writer
  or production activation.

## Tests and limits

- Independent 43-case **synthetic gold** corpus verifies coverage and
  exact candidate schema/slot labels of the rule-based subset. This
  measures rule matching on a fixed corpus, not model intelligence.
- Input negatives cover compounded execution/approval, negative edits,
  overly large numbers, malformed customer aliases, injection strings,
  ambiguous ordinal IDs and explicit execution requests.
- Authenticated R07P planner tests require no provider calls for
  deterministic inputs, test denied roles/Advisor/revoked membership,
  complete history, correct ambiguity response and refusal to guess
  with no provider.
- Receipt-backed R07M synthetic integration checks customer, currency,
  one-line quantity, exact key replay, verified unsaved draft revisions,
  and two-line ambiguity without a mutation.
- Exact-final-head GitHub CI must pass TypeScript, local recognizer,
  R07P/R07R/R07M tests and finance/production isolation before merge.

## Not delivered

The recognizer is not general intelligence, and **production has not
enabled it**. Unknown text, open-domain or multilingual document
questions still require independently verified, private and genuinely
free models. No real model benchmarking, account-specific entitlement
verification, production Firebase rules/IAM proof, cross-device QA,
T22/T23/T24, or physical iPhone Safari acceptance has occurred.
This file does not authorize deployment, public HTTP routes,
financial writes, or use of paid provider credits.
