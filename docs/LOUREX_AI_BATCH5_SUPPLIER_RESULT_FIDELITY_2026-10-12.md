# LOUREX AI — Batch 5: Supplier and product result fidelity

## Purpose
Preserve reliable commercial evidence in the natural-language output from the existing local tool orchestration. Do not replace supplier analysis with an oversized JSON block or a deceptively complete five-field card.

## Original issues in the inspected owner
- `__lourexCompactObject` displayed only the first five nonempty fields of every top-level object. For `supplier.getSummary`, these were frequently name, city, country, currency and payment terms, omitting payables and recent purchases.
- Array preview showed three records without indicating the true length or how many rows were omitted.
- `fit` in the tool orchestrator can return `{truncated:true,preview:…}` for oversized data; the conversational formatter previously treated this as ordinary data, risking an incomplete/broken JSON-looking summary.
- The 5,000-character chat response cutoff did not tell the user that information had been removed.
- The prompt headers and detailed keys were not consistently localized to Arabic.

## Changes
- Present up to ten meaningful top-level fields, so supplier payables and recent purchases normally remain visible, without inventing amounts or combining currencies.
- Every shortened array includes its total row count and exact remaining count; additional hidden fields also report how many are not visible.
- Recognize a tool result flagged as truncated and explicitly state that the summary is incomplete, directing the user to the original workspace record rather than presenting the JSON prefix as a valid complete record.
- If the full answer exceeds the bounded response size, append a clear Arabic/English "additional information not shown" notice.
- Provide bilingual labels for supplier, financial, document and product attributes. Technical IDs stay out of natural-language summaries.
- No new provider, data mutation, document creation or tool permission. All original tool/executor/approval guards remain untouched.

## Verified in this authoring environment
- 4/4 isolated executable formatter tests passed, covering supplier financial fields, missing evidence, record/field counts, localization and true zero vs missing values.
- Syntax of the build-time owner script parsed successfully.
- Full npm TypeScript/build/test suite, installed browser execution and Safari live tests NOT RUN because the repository cannot be cloned here. No production release or merge.

## Acceptance before merge
1. Clean checkout: `npm ci`, `npm run typecheck`, `npm run build`, complete Node suite, plus `node --test tests/ai-batch5-tool-result-fidelity.test.mjs`.
2. Ask Advisor to analyze an actual supplier with payables in multiple currencies and recent purchase history. Verify no cross-currency sum, no invented zero, explicit missing fields and concise mobile readability.
3. Ask Controller to prepare supplier and product changes; all writes still require exact review and authorization.
4. Exercise tool outputs longer than `maxResultChars`, arrays longer than three, ten+ object keys and multiple requested tools. Verify accurate omissions and no silent truncation.
5. Verify Arabic vs English, original source records, mobile 320px and iOS Safari, and regression tests across Batch 2 Advisor permission separation.
6. This branch is stacked on Batch 4 PR #713, which is stacked on Batch 3 PR #711. Merge and test in dependency order only.

**Draft / NO-GO; no production deployment.**
