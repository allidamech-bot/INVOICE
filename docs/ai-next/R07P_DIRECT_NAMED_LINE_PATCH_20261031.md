# LOUREX AI Next — Direct Named Draft Line Edits (2026-10-31)

## Delivery and authority
This continues the existing **offline, opt-in, disabled** R07P, R07R,
R07D and R07M conversation workflow. It does not create a new chat,
provider router, finance writer, storage root, Firebase policy or HTTP
entrypoint. Existing financial app and production configuration remain
unchanged.

### Supported bounded utterances
- `خلي كمية عبوات عطر ٢٠ وسعرها ١٥`
- `عدل كمية علب عطر ١٢`
- `غير سعر عبوات عطر ١٧`
- `Set quantity of Premium Bottle to 12 and unit price to 9.5`
- `Set the quantity of Premium Bottle to 12`
- `Set unit price of Premium Bottle to 9.5`

The local grammar requires a **whole sentence match**, a valid explicit
item name and bounded decimal numeric values. A syntactic `line_name`
fact is an untrusted name, NOT a line ID and NOT a permission to mutate.

R07P authorizes server identity, role and business scope first. Its
existing full-audit context reader supplies the active, unsaved,
server-verified R07D quotation with ordered line descriptions and IDs.
The planner verifies that each description maps to the corresponding
trusted line ID and requires **exactly one full normalized name match**.
Normalization is conservative (Unicode, Arabic vowel marks/alef,
case, whitespace). No substring, fuzzy or model-based match. Duplicate
names, missing names, multiple active drafts, no active draft and
unverified descriptions cause clarification without editing.

The verified `line_id` replaces (never supplements) the untrusted
`line_name` before R07R receives the plan. It uses existing R07R
`line_patch`, with both quantity and unit price in **one** guarded
R07D CAS revision and one receipt. R07M journals an authenticated
operation and one verified reply, with same-request idempotent replay
after a crash/restart. A synthetic/model-proposed name is never
converted to a line ID in this new path.

### Security boundaries
- No financial issuance, post, approve, payment or business-record write.
- Malformed or appended-instruction named edits are rejected **before**
  provider interpretation, even if a test fixture/model is configured.
- Viewer/Advisor cannot prepare a draft mutation; Controller authority
  and current server membership are mandatory.
- No client-provided line IDs or name-to-ID claims are accepted.
- Existing optimistic revision/hash and sealed R07D request receipts
  prevent a replay turning into a second edit.
- Existing R07J/R07D roots use receipt-based reconciliation, not a
  fictitious cross-root single database transaction.
- All feature switches remain OFF; no live data or external model calls.

### Verification
Targeted synthetic tests cover Arabic-Indic numerals, exact Arabic
name and English description, quantity/price together, separately
edited fields, one out of three lines, duplicate and unknown names,
fake line IDs / draft revisions, ACL denied, compound instructions,
strict TypeScript, full R07P/R07R/R07M regression, and production
isolation. They prove only bounded offline implementation, **not**
general conversational intelligence or live real-model accuracy.

Still OPEN: authentic provider privacy/zero-cost proof, live IAM/rules,
T22 cross-device encrypted session, T23 physical iPhone Safari,
T24 live authenticated acceptance and controlled production release.
