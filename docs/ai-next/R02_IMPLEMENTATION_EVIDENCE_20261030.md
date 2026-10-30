# LOUREX AI Next Generation — R02 Review Evidence (2026-10-30)

Work package: R02, isolated Document Intelligence Engine
Branch: feature/ai-next-r02-document-engine
Pull request: #1191, Draft, stacked on R01 Draft PR #1190
Architecture: R00 Draft PR #1189 still pending; baseline blueprint named in plan not present at inspected main SHA.
Status: SOURCE ENGINE ONLY. No production activation, merge, existing chat replacement, financial data access, provider activation or test on live customer files.

## Delivered

1. engine.ts — Verifies source SHA-256 and stores full original bytes through injected storage; produces source-bound DocumentEvidence and Coverage records; distinguishes complete/partial/needs_review/blocked; supports checkpoint restart of failed segments; guards against source mutation, missing rows/pages, invalid scope, duplicates and oversized payloads. Multi-file batch always provides a per-file result in original order.
2. adapters.ts — PDF.js runtime injection, page-by-page selectable text and optional explicit OCR for scans; injected Excel SheetJS-compatible reader preserving physical row/cell locations; strict CSV parser retaining blank rows, quoted cells and duplicates; UTF-8 chunked text and JPEG/PNG OCR callback adapters.
3. corrections.ts — Review-only explicit correction mapping between source evidence records, Arabic/Persian digit normalization, no currency assumptions or inferred selling prices.
4. R02 isolated test suite and GitHub Actions workflow with source-limit, page/row, many-file, cancellation/outage, OCR, price/unit, correction, and cross-scope negative fixtures.

All R02 outputs permanently state financialDraftEligible=false, and no code is allowed to save financial documents.

## Precise coverage definition

Coverage.complete means every declared source segment was read and located. It is not proof every PDF table cell or product line has been correctly understood; OCR is always needs_review until independently verified. For PDFs whose table-row counts cannot be established, do not invent an expected row count and do not promote evidence into quote readiness. A missing/failed page is partial/blocked with its identifier. Original bytes exist separately from shortened LLM context, so the current 12k character prompt limit does not control source retention. Source retries are not automatic financial operations.

## Authorization and security gaps before operational use

- Scope objects passed to R02 are NOT yet authenticated by a dedicated AI-next backend. R03 must supply a verified server scope.
- SyntheticSourceRepository is in-memory only. R03 requires transaction-safe, server-only, account-scoped object store and authenticated checkpoint signatures.
- PDF.js and SheetJS runtimes are injected. Browser wiring to actual PDFs/Excel, iPhone Safari testing, and real file fixtures are NOT performed by this PR.
- OCR is not configured by default. Real image OCR requires owner-approved privacy and vendor/cost policy first.
- No new AI providers or model calls, credentials, rules, storage buckets, business records, financial adapters or production routes are changed.
- Actual ZIP decompression bomb screening and malicious binary attachment scanning must be addressed before real uploads.
- Source correctness, OCR confidence and data extraction do not authorize supplier-cost to selling-price substitution. Quotes must await R04 guarded workflows.

## T01–T24 relevance

T07 PDF page reader: simulated PDF.js adapter; real binary pending.
T08 long source: >24k Unicode source fixture, no 12k rejection.
T09 scanned PDF: 8 simulated scanned pages; needs_review/blocked statuses.
T10 Excel: injected multi-sheet workbook with stable physical row/cell references and inert formulas; real workbook pending.
T11 10 files: explicit per-file result, no dropped source.
T12 corrected quantities: exact evidence ID mapping, review required, no auto-add.
T13 unknown selling prices: preserve blank values.
T14 CTN versus PCS: explicit unit/currency validation.
T17/18 provider outages: simulated OCR failure and recovery statuses.
T19 cancel/retry: per-segment checkpoint tests in-memory, durable proof pending.
T24 complete document-to-quotation workflow: NOT IMPLEMENTED in R02; R04/R07.

## Gate and follow-up

R02 engineering tests/compilation and GitHub CI must be recorded against final head SHA. Mock-based successes do not mean end-to-end acceptance. Keep PR #1191 as Draft. Do not merge or deploy. Resolve R00 blueprint and storage policy, approve privacy/retention, then add durable R03 context/task persistence on a separate branch with verified authorization. Real browser format and iPhone acceptance remains essential before production.
