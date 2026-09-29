# LOUREX AI — Batches 1–12 implementation closeout

This branch extends the existing LOUREX AI Core while preserving the current accounting engines, storage schema, Firebase/Auth/PIN, PDF rendering and visual design system.

## Governing rule

**AI understands → LOUREX validates/calculates → user reviews → user approves → LOUREX executes.**

No AI workflow is allowed to bypass the existing deterministic LOUREX engines or silently mutate financial records.

## Safety contract

- API keys remain server-side only.
- Uploaded document contents are treated as untrusted DATA; embedded prompts/instructions are ignored.
- Same-origin checks, bounded body/file sizes, MIME validation and rate limits protect AI upload endpoints.
- The encrypted vault is never sent wholesale to the model.
- Deterministic LOUREX finance, receivable, profitability, pricing, landed-cost and purchasing engines remain authoritative.
- Currencies are never combined or implicitly converted.
- Missing commercial/financial values are never invented.
- Mutations use existing LOUREX safe mutation/storage paths and require explicit user review/confirmation.
- File-generated quotations remain drafts.
- Supplier imports remain purchase drafts.
- No AI workflow autonomously finalizes, posts, sends, pays, voids or deletes a financial record.
- Business Memory is derived/read-only and introduces no new persistence/schema.

## Batch implementation status

### 1 — AI Core + Customer Capture

Implemented:
- PDF, image/screenshot, Excel, CSV and text sources.
- Multi-source customer extraction.
- Structured proposal output with per-field confidence, source and page/evidence where available.
- Explicit blank values when source data is absent.
- Conflict review when sources disagree.
- Duplicate detection using CR, VAT, phone, email and normalized Arabic/English names.
- Explicit Create New vs Update Existing decision; no automatic merge.
- Final save continues through the existing customer save path.

### 2 — AI Quote Builder

Implemented:
- PDF/image/spreadsheet/text RFQ extraction to quotation draft proposal.
- Customer match and handoff to Customer AI when no exact customer exists.
- Product matching using SKU and normalized Arabic/English descriptions.
- Confidence and ambiguous-quantity signals.
- Deterministic cost / last sale / last customer price / pricing-policy review.
- Warnings for unknown product, ambiguous quantity, missing cost, currency mismatch, below cost, below policy and missing selling price.
- Natural pricing instruction → AI intent only (`margin`, `markup`, `raise %`, `last customer price`, `saved sale price`, `company policy`).
- All price calculations are performed locally by LOUREX.
- Result is always a quotation/proforma draft for review.

### 3 — Universal AI Inbox

Implemented:
- Universal file/text intake and document classification.
- Classification covers commercial registration/company file, customer RFQ, supplier quote/invoice, purchase invoice, product catalog, price list and unknown sources.
- Unknown sources never mutate data and require a manual workflow choice.
- Routes to Customer AI, Supplier AI/Purchase Draft, Quote Builder or Product AI.
- Session-only AI Job History with Processing / Needs Review / Completed / Failed / Cancelled states; file contents are not stored in job history.

### 4 — Product AI + Supplier AI + Procurement AI

Implemented:
- Product extraction from Excel/CSV/PDF/image/text.
- Product classifications: Existing Match, Likely Match, New Product, Duplicate Candidate, Needs Review.
- Old → New diff before existing-product updates.
- New products are preselected; existing/likely matches require explicit review; duplicate/needs-review rows are blocked from automatic application.
- Supplier identity capture with confidence/evidence and duplicate detection.
- Supplier quote/invoice extraction to Purchase Draft only.
- Multi-offer comparison for 2–8 supplier offers.
- Same-product / same-currency comparison only.
- Unit cost, landed cost, freight, duty, payment terms, MOQ and lead time review.
- Existing LOUREX landed-cost allocation engine is used.
- Lowest observed cost is presented as an observation, never as an automatic supplier recommendation.
- User selects an offer before a Purchase Draft is created.

### 5 — Contextual LOUREX AI

Implemented on top of the existing single LOUREX Advisor personality:
- Workspace-aware context.
- Active document context includes customer/supplier, currency, language, items, quantities, prices and commercial terms.
- Customer/product/purchasing context bridge for active workspace entities.
- Reports context includes the currently selected From / To period and currency filter.
- No separate AI logic is created per screen; the same orchestrator and safety rules are reused.

### 6 — Accounting Guardian + Smart Review

Implemented deterministic advisory review for commercial documents and purchases.

Commercial-document signals include:
- Missing customer/supplier.
- Zero quantity / zero price.
- Duplicate lines.
- Missing commercial data.
- Extreme discount.
- Suspicious price change.
- Missing cost.
- Currency mismatch.
- Sale below cost / below pricing policy.
- Credit/commercial risk signals already available in LOUREX.

Purchase pre-post Guardian includes:
- Missing supplier.
- Unmatched purchase item.
- Zero/missing unit cost.
- Duplicate purchase line.
- Cost-currency mismatch.
- Abnormal landed-cost change.

The Guardian intercepts the current **Post Purchase** action only for review. After user approval, it returns to the original LOUREX confirmation/posting flow; the posting engine itself is unchanged.

### 7 — Collections AI

Implemented:
- Outstanding / overdue balances with currencies kept separate.
- Aging buckets.
- Oldest open and oldest overdue invoices.
- Average days to pay / average days late from recorded history.
- Open invoice count and last activity.
- Follow-up priority list for today.
- Draft polite reminder / stronger reminder (draft only; never auto-send).
- Show Invoices.
- Open Statement.
- Record Payment through existing Finance actions.

### 8 — LOUREX CFO

Implemented:
- Deterministic CFO brief over sales, collections, receivables, profitability, pricing and purchasing context.
- Explicit limitations when cash/bank ledger or costs are incomplete.
- Existing deterministic advisor calculator for margin/markup/profit/landed-cost calculations.
- Dedicated read-only What-if scenarios for:
  - raise selling price by %;
  - apply discount %;
  - calculate selling price required for target margin %.
- Product prices/costs are read from LOUREX; scenarios never save product changes.
- Margin comparison is withheld when currencies cannot be compared safely.

### 9 — Daily Business Command Center

Implemented `What matters today` using deterministic records and showing only the highest-value alerts (default top 5):
- collection follow-up;
- quotation expiry today/tomorrow;
- purchase drafts needing review;
- selling price below cost / policy;
- supplier/product cost change;
- incomplete product data.

Every alert has a clear review/open action and session-only Ignore option.

### 10 — Business Memory + Proactive Intelligence

Implemented as derived, read-only memory:
- customer patterns;
- product patterns;
- supplier/commercial patterns;
- evidence counts (`Based on N records` concept);
- follow-up opportunities such as stalled quotation/customer activity and cost/price review signals where supported by recorded history.

Patterns are recomputed from approved LOUREX records and are never stored as official master-data facts.

### 11 — AI Business Search + Ask Anything

Implemented deterministic natural business search for:
- latest posted purchase price / landed cost for a product;
- suppliers with posted purchase history for a product;
- customer quotation documents for a requested recent-month window;
- top invoiced product quantities for a recorded customer country;
- general customer/document/product/supplier/purchase record search.

Results are clickable and reuse LOUREX Global Search / canonical navigation.

### 12 — Voice AI

Implemented browser speech input into the existing LOUREX Advisor composer.

Voice becomes text/intent and then uses the exact same Advisor, capability approval, deterministic calculation and safe mutation paths. No separate voice business logic exists.

## Integration approach

Additional workflow controls are mounted inside the existing LOUREX Advisor runtime. Primary navigation, page layout, accounting/storage schema and design CSS are not changed by this work.

Customer/product inbox handoffs use short-lived in-page `File` references only. They are not written to LocalStorage, IndexedDB, Firebase or the encrypted vault.

## Verification state

**Implementation is intentionally stopped before final testing/QA.**

Per project instruction, no further typecheck, build, CI, browser QA or test suite should be started until explicitly requested. The feature branch is preserved and PR #446 is temporarily closed (not merged) so new implementation commits do not automatically trigger pull-request CI. When verification is explicitly requested, reopen the same PR and perform the final verification phase before merge.
