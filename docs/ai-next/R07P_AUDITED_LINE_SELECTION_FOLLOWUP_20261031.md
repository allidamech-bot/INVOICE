# R07P — Audited line-selection follow-up (2026-10-31)

## Implemented scope
Only the existing **disabled/offline** R07P–R07R–R07D–R07M workflow.
This is one narrow clarification type, not unrestricted NLU or execution.

A verified owner/authorized Controller may say `لا خلي الكمية ١٢`
when **exactly two** unsaved quotation lines exist. R07P correctly refuses
to infer which line, and R07M records its existing generic clarification
with one request-binding checkpoint and **no** R07D edit receipt.

If the IMMEDIATELY NEXT user turn in the same authorized thread replies
`الأول`, `الصنف الثاني`, `first item`, or `second`, the server can
recover the previous literal quantity **12** from the full R07J-audited
previous turn, and resolve the selected line ID from the **canonical
ordered R07D lineItems**, not a model or the browser. R07P still applies
scope/role authorization and verifies the current draft, revision,
two unique line identities, and exact current turn key. R07R applies a
single guarded `line_patch`; R07D commits one unsaved revision with its
existing immutable request fingerprint / receipt; R07M seals the verified
response and supports same-key restart/replay without a second write.

## Fail-closed eligibility
The returned ordinal is NEVER an edit without a verified pending
quantity-only clarification. The previous request must be an exact,
fully parsed local `edit_draft` with only `quantity` (no mixed
price, unknown line, compound or inferred source). The full event
journal must verify:
- previous turn is the immediate parent of the current processing turn;
- previous completed R07M unsaved-review task has exactly one
  **generic clarification** assistant reply, exactly one sealed
  request-binding checkpoint and no R07D receipt checkpoint;
- same actor, authenticated scope, role and Controller mode;
- current message ID/idempotency key/text match the audited current turn;
- exactly one active unsaved R07D quotation, exactly **two distinct**
  canonical lines and the current revision is verified.

Unknown ordinals, model-invented IDs, forged/mismatched revisions,
reply after any intervening turn, wrong role, incomplete/corrupted
history, ambiguous drafts, more or fewer than two lines, and attempts
to append approval/issue commands cannot infer a target.
When no pending request exists, the user must state an explicit full
request; the ordinal is blocked **before model interpretation**.

This intentionally does not create a pending-operation database, second
journal, session cache, synthetic editing shortcut, financial writer,
new provider call, or an invoice/payment/approval action.

## Tests and honesty
The offline synthetic R07J + R07D test runs: draft start → currency →
two items → ambiguous quantity → restart → ordinal answer → one
receipt-backed revision → exact-key replay. It verifies only the chosen
line changes, and rejects first/second misbinding, orphan, intervening,
unsafe compounded or multi-field requests. R07P synthetic context
tests also reject foreign line IDs, mismatched draft revision, invalid
quantity and wrong current request binding.

**No production activation.** Tests are synthetic, not live/cloud
acceptance, iPhone Safari verification, real zero-cost provider
entitlement proof or actual model accuracy. T22/T23/T24, Firebase IAM
verification, private model approval and production rollout remain OPEN.
No finance track changes authorized.
