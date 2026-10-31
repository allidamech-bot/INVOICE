# LOUREX AI Next — R07P audited named-line follow-up (2026-10-31)

## Scope and objective

Extend the existing OFF-by-default R07P/R07R/R07D/R07M offline
review-draft conversation without adding an independent journal,
new persistence root, finance writer, production route, or model calls.

Previously, a pending quantity correction with two draft lines could
be answered only with "الأول" or "الصنف الثاني". This change accepts a
**clearly prefixed full product name**: "الصنف عبوات عطر", "البند علب عطر",
"item: Premium Bottle" or "the item Premium Bottle". The match is an
exact comparison of normalized strings against **persisted R07D
lineItems.description**, never against a model guess or a client-supplied
line ID. Normalization is conservative: Unicode NFKC, Arabic diacritics
and tatweel removal, Arabic alef variants, case and repeated whitespace.
No translation, partial prefix search, token similarity or fuzzy match.

## Trusted execution path

1. Authorized Controller with one active, unsaved quotation containing
   **2–120 uniquely identified lines** says "لا خلي الكمية 12".
2. Existing R07M completes with a generic clarification, a sealed
   request-binding checkpoint and NO draft edit receipt.
3. The very next same-actor, same-role, same-thread Controller turn
   supplies an explicitly prefixed name such as "الصنف عبوات عطر".
4. R07J's full audited history verifies the last/current and prior
   turns, actor, scope, message, key, completion and clarification
   checkpoint. The prior user text must be an exact deterministic
   quantity-only intent; no compound, missing or inferred field.
5. The trusted R07D draft reader resolves the name by FULL normalized
   equality, with **exactly one matching line**. Duplicate descriptions
   after normalization cause clarification, never arbitrary selection.
   The resolved line ID and earlier requested quantity are bound into
   the existing R07P semantic plan as untrusted user facts subject to
   independent scope and line-ID verification.
6. Existing R07R editor, R07D compare-and-swap receipt and R07M
   verified reply apply at most one unsaved review revision, supporting
   exact same-key replay after restart.

A name by itself without a verified pending question does not become
an edit or trigger fallback model inference. Explicit item name
prefixes are intentional: unprefixed free text remains outside this
narrow feature rather than interpreting every message as a selection.
Potentially executable compound instructions are denied.

## Safety test matrix

- Arabic full-name correction after restart and identical replay;
- exactly one selected line out of three preserved ordered lines;
- same normalized name across two lines => no edit;
- partial/approximate name, nonexistent name => no edit;
- orphan, interrupted, malformed, hostile or delayed replies => no edit;
- model-route suppression for missing pending context;
- forged line IDs, outdated revisions, invalid quantity => reject;
- existing ordinal, price follow-up, semantic router, R07D, R07M and
  production/finance isolation regression checks.

## Important limitations

This is bounded rule-based syntax plus exact trusted data matching,
NOT an unrestricted intelligent conversation model. The assistant's
existing generic clarification message may not yet name each candidate.
No real account/customer/finance mutation, provider calls, Firebase
policy changes or deployment is allowed. All AI Next flags remain OFF.
External model entitlement/privacy, T22 cross-device encrypted sessions,
T23 physical iPhone Safari, T24 authenticated live acceptance and
controlled rollout remain OPEN.
