# R07P→R07M one-line multi-field review edits — 31 October 2026

## Decision and scope
Continue existing **unmounted, disabled** R07P/R07R/R07D/R07M architecture. The
previous implementation understands one field at a time; R07R already supports
a guarded `line_patch` containing quantity and selling unit price, committed
as **one unsaved review-draft revision** by R07D. This PR connects that existing
transaction through an exact, conservative Arabic/English user sentence.
It is **not** general multi-action language understanding, cross-line batch
editing, financial approval, or invoice issuance.

## New positive examples
- `خلي الكمية ١٢ والسعر ١٧`
- `عدل السعر 17 والكمية 12`
- `Set quantity to 12 and unit price to 17`
- `Set the unit price to 17 and the quantity to 12`

Both values must be syntactically complete, positive quantity, bounded
decimal precision, and from the same **unique, server-verified line** in
the active authenticated review draft. The recognizer emits only two R07P
`facts` as uncertain user claims. R07P validates actual membership,
trusted audited thread and draft, line identity, and Controller permission.
R07R validates allowed fields/numeric formats and creates one
`SyntheticDraftEditor.line_patch` change. R07D writes the new revision
with a sealed request receipt; R07M's existing unified turn confirms the
receipt and appends one verified reply. Missing or multiple line matches
trigger clarification with no mutation. No production financial operation
or invoice posting is created.

## Unsafe composites and default-deny behavior
The local parser accepts ONLY full-utterance patterns. Examples that cannot
be silently partially applied:
- `خلي الكمية 12 والسعر 17 واحفظ`: requires separate approval.
- `خلي العميل شركة النور والسعر 17`: separate targets, not a single patch.
- `خلي الكمية 12 والعملة USD`: distinct draft/currency operations.
- `Set quantity to 12 and unit price to 17 and then issue the invoice`:
  must not turn into a simple edit by ignoring the last clause.

For the explicit opt-in local review path, R07P blocks these before any
synthetic/real model fallback to prevent a model from omitting the second
intent. Normal noncomposite unknown prompts remain unsupported or routed
only under their preexisting separately disabled, authorized path.
The local path remains behind `allowDeterministicStructuredIntents`, and
the R07R offline session remains behind its server-owned opt-in switches.
**No production flags are enabled.**

## Cross-turn, replay, and audit assertions
Test an existing conversation: begin quote → set currency → add one
synthetic line → modify quantity and unit price together → restart
coordinator → reopen exact R07D revision → retry original request identity
with original revision/hash → ensure **one** applied revision, one R07M
assistant response, exact task checkpoints, and no additional interpretation.
Changed same-key content must collide. In a two-line draft, same request
must produce clarification and no update. An unsupported compound must
produce clarification before mock inference, with no draft mutation.

The R07D draft and R07M journal are separate persistence roots; their
cross-root recovery remains receipt/reconciliation based, not one
cross-root atomic transaction. The **single R07D line edit** is atomic.
This test is synthetic local storage; no live cloud acceptance or cross
physical device test is claimed.

## Verification and blockers
Require exact-head GitHub Actions: strict TypeScript, targeted parser,
existing R07P/ R07M synthetic tests, unified multi-turn tests and
production/finance isolation checks. No provider or paid credits used.

Actual unrestricted conversational NLU, reviewed external provider
entitlements/zero-cost/privacy, live security IAM/rules, encrypted cloud
persistence, physical iPhone Safari acceptance, T22–T24, and production
approval remain **OPEN**. The user-facing application is unchanged.
