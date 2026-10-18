# Named customer/product reads — production acceptance repair

Base: `cb51a3783a515e53abfad2be6a3e4469a0900a5b` (merged #799).

## Problem and cause

Production acceptance observed a saved QA customer's balance/history reported as absent or unavailable, while the actual receivables page showed the records. Fresh product-only questions sometimes succeeded from the dialogue catalog. This was not evidence that all AI tools or accounting calculations were broken.

The code contained two demonstrable gaps:

1. `deterministicAiToolPlan` resolved customer reads mainly from the current UI entity. A question naming a customer on Reports had no deterministic named-record plan and depended on external planning or generic dialogue. Names supplied in an ID argument fail the strict local lookup; a stale UI entity could also override a named query. Six focused tests initially returned no grounded local result before this repair.
2. The provider planner's identity/argument instructions were in Controller-only guidance. Advisor received tool descriptions without the explicit name/query-versus-ID contract. In addition, the existing action detector can treat negative safety wording such as Arabic “لا تعدّل” as action intent, causing Advisor to fall back to aggregate dialogue rather than retrieve a customer.

The exact original provider-generated arguments were not captured during live acceptance. Their precise shape remains unknown; the findings above identify and reproduce the vulnerable code path, not an asserted capture of that provider response.

## Change

- Resolve explicitly mentioned exact customer names and product names/SKUs locally from the active company. Customer balance and document/payment history continue to use the existing receivables/statement engines, scoped to the active branch.
- Prefer identities in the current request over a different previously opened UI entity or old conversation claims.
- Strip narrowly recognized negative write instructions only for deciding whether the new **read-only** route applies. Actual write requests retain their existing approval path; the shared action detector and executable lookup behavior are unchanged.
- Duplicate/multiple candidate matches use the existing search/selection flow, never an arbitrary balance. No fuzzy matching or cross-company fallback is added.
- Provide the same explicit read-tool argument guide to Advisor and Controller. The provider still receives no Vault records through the planner.
- Leave attachments, Personal/Temporary scopes, protected financial actions, UI/design, Firebase rules and accounting engines unchanged.

## Validation

Node 24.19.0:

- Six original reproduction tests failed before the repair and passed afterward.
- Ten focused regression tests cover English/Arabic named balances; mixed customer history/product stock; safety disclaimers; stale UI/conversation context; company/branch separation; duplicate names; exact identifier boundaries; multiple currencies; no mutation; and actual server planner instructions in both modes.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, including final generated conversation runtime owners.
- Ten targeted test files: **57 tests passed, 0 failed**, including existing tool guards, attachment authorization, receivables ranking, cache isolation, selection, answer fidelity and generated-runtime locale handoff.
- `node --check api/ai-inbox.js` and `git diff --check`: PASS.

The synthetic fixture reproduces two issued USD invoices (200 and 100), payment 50, outstanding 250, price 100 and stock 7. Foreign-branch invoices are excluded. Separate EUR balances remain separate. No production records were used or changed by these tests.

## Release boundary

This change has not been merged or deployed. The production acceptance finding remains open until an authorized release is deployed and the named customer/history and product questions are checked on that release. No live provider-response or mobile/Safari success is claimed for this unpublished repair. The earlier acceptance limitations concerning independent sessions, monitoring, restoration and logout are outside this repair.
