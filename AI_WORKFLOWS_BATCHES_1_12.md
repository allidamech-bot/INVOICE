# LOUREX AI — Batches 1–12 closeout

This branch extends the existing LOUREX AI Core without changing accounting formulas, storage schema, Firebase/Auth/PIN, PDF rendering, or the visual design system.

## Safety contract

- AI endpoints return structured proposals/classifications only.
- API keys remain server-side.
- Uploaded document contents are treated as untrusted DATA; embedded instructions are ignored.
- Same-origin checks, bounded request/file sizes, MIME validation and rate limits are enforced on AI upload endpoints.
- Deterministic LOUREX finance, receivable, profitability, pricing and purchasing engines remain authoritative.
- Currencies are not combined and missing financial values are not invented.
- Record mutations use existing LOUREX mutation paths and require an explicit user confirmation/review step.
- Quotations created from files remain drafts. Supplier imports remain purchase drafts. No AI workflow finalizes, posts, sends, pays, voids or deletes financial records automatically.
- Business Memory is derived/read-only context; no new persistence or database schema was introduced.

## Batch coverage

1. **AI Core + Customer Capture** — multi-source customer extraction, per-field confidence/evidence, conflict review and duplicate detection.
2. **AI Quote Builder** — PDF/image/spreadsheet/text source to review-only quotation draft proposal with explicit quantities/terms and bounded pricing reuse from matching saved products.
3. **Universal AI Inbox** — source classification into customer, supplier purchase, quote request, product catalog or manual review.
4. **Product & Supplier Intelligence** — existing deterministic product pricing, cost-change, duplicate/dormancy and supplier purchasing intelligence surfaced as focused AI workflows; existing product/supplier import review flows are reused.
5. **Contextual AI** — existing workspace-aware LOUREX Advisor remains the single contextual copilot and receives the current workspace/document context.
6. **Accounting Guardian** — focused read-only review prompt over deterministic accounting/business flags; no autonomous entries or fraud claims.
7. **Collections AI** — receivables/aging/payment-behavior prioritization and draft follow-up guidance using deterministic receivable context.
8. **CFO AI** — deterministic sales, collections, receivables, profitability, pricing and purchasing brief with explicit data limitations.
9. **Daily Command Center** — today-vs-previous-day operational and financial brief from LOUREX deterministic daily context.
10. **Business Memory** — read-only derived recurring customer/product/supplier/business patterns with no new storage.
11. **Business Search** — local deterministic search across customers, documents, products, suppliers and purchases.
12. **Voice AI** — browser speech input populates the existing Advisor composer; it never auto-approves or auto-executes an action.

## Integration approach

The additional workflow controls are mounted inside the existing LOUREX Advisor at runtime so primary navigation, page layouts and existing design CSS remain unchanged. Customer and product inbox handoffs use short-lived in-page `File` references only; they are not written to LocalStorage, IndexedDB, Firebase or the encrypted vault.
