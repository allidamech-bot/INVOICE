# R07P Clarification Follow-Up — Audited Single-Price Continuation

Reference date: 2026-10-31. Repository: allidamech-bot/INVOICE.
Scope: **only existing AI Next isolated, disabled modules**.

## The specific workflow delivered

1. Authorized Controller has one R07D verified, unsaved quotation containing
   **exactly one line**.
2. In the existing R07M unified review conversation, user says `عدل السعر`.
   The guarded R07R editor finds no price and R07M completes with its
   existing exact clarification, **no R07D edit receipt or mutation**.
3. In the **immediately next same-thread, same-actor Controller turn**, user
   answers `١٧` or `17` (bounded, simple decimal format only).
4. R07P queries **R07J's complete, independently audited, hash-verified**
   history through the existing R07PTrustedHistoryContext. It checks
   the last/current turn's request identity and processing task; the prior
   parent's completed unsaved-review task, literal original request,
   the exact previous clarification reply, a single prior request-binding
   checkpoint, no edit-receipt checkpoint, and the same authenticated actor,
   role and scope. One current draft/one line must still be verified.
5. Only then R07P constructs **one** untrusted `selling_unit_price`
   candidate. Existing R07P ACL/grounding and R07R review editor validate
   it again. R07D commits at most one CAS review revision with the existing
   fingerprinted request receipt; R07M publishes one receipt-verified
   response and supports exact same-key replay after a restart.

No separate pending-intent store, new finance writer, browser flag,
model call, raw financial document save, or production HTTP endpoint.

## Fail-closed constraints

A standalone number **does nothing** without a currently auditable,
immediately preceding qualifying clarification. It never falls back to
a synthetic or real model for interpretation. A non-price request,
intervening message, different actor/role, multiple open drafts, two
draft lines, changed request identity or unverified task/reply/checkpoint
all block the continuation. Number parsing does not accept chained
instructions, sign characters, excessive precision or huge values.

This feature currently supports only the narrowly bound Arabic question
`عدل السعر` then a numeric reply. It is not general pronoun resolution,
open-ended clarification handling, item selection, or guaranteed
cross-device synchronization.

## Trust and release notes

R07J and R07D are still two persistence roots, not a single atomic
cross-root transaction. R07D's guarded draft CAS is atomic; the unified
R07M conversation uses the pre-existing receipt recovery and
idempotency handling. Reviewer must still check current scope and
fresh expected revision/hash on every operation.

Synthetic in-memory Firestore-like tests must verify:
- no edit for incomplete request, then **one edit** after the next
  numeric answer, reopening and same-key replay;
- orphan numeric answer and intervening message do not resurrect a
  previous clarification;
- multiple lines block any inferred line selection;
- forged pending request/draft revision fails the planner without model
  fallback or financial issuance.

All real provider free-tier eligibility, per-account billing,
privacy verification, live Firebase IAM/rules, T22/T23/T24, physical
iPhone Safari and production activation remain **OPEN**. The feature
flags remain OFF. No customer data or paid model calls are permitted
by this change.
