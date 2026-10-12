# LOUREX AI — Batch 6 integration, mobile import review and release gate

**Audit date:** 2026-10-12  
**Repository:** allidamech-bot/INVOICE  
**Target:** https://invoice-three-puce.vercel.app  
**Policy:** No paid GitHub Actions, no merge or production deployment without evidence.

## Branch dependency map

- PR #709 — Batch 1 Safari voice + independent voice owner handoff, based on main. **Draft / unmerged.**
- PR #710 — Batch 2 Advisor discussion + server mode security, based on main. **Draft / unmerged.**
- PR #711 — Batch 3 first-class conversation history, based on main. **Draft / unmerged.**
- PR #713 — Batch 4 supplier comparison and editable price-grid density, **base PR #711 branch**.
- PR #714 — Batch 5 incomplete supplier tool result reporting, **base PR #713 branch**.
- Batch 6 branch — this PR, **base PR #714 branch**. Each stacked PR should be rebased and retargeted to main **only after its dependency passes**.

PR #709 and #710 have independently changed AI code. Do not assume they are part of PR #714 or this stack, and do not declare cross-branch integration proven until a combined release candidate is built and tested.

## Additional defects found in Batch 6

1. AI Inbox `SupplierAiProposalReview` displayed extracted field/value/confidence/source in a wide four-column table that was hard to read on 320–430px Safari. The previously upgraded `SupplierComparison` did **not** cover this distinct UI.
2. Product PDF/image/Excel source review displayed a seven-column selection/commercial/match/diff table, independently of the Batch 4 editable price-grid, requiring horizontal panning.
3. Product review hid all change differences after the first eight (`review.diff.slice(0,8)`) **without a count or warning**; this could cause a reviewer to miss proposed changes.

## This PR's changes

- Add explicit bilingual mobile data labels for every supplier evidence field and every selectable product review field.
- Under 720px, present existing modal table rows as compact stacked entries with all original data, confidence, source metadata, radio/checkbox state and review-only save controls preserved. Retain normal tables on desktop.
- Remove the arbitrary product difference cutoff: all extracted old/new comparisons are available for review. No extra mutation path, invented currency, or automatic approval.
- Restrict visual CSS to `.modal.modal-assistant[role='dialog']` and specifically tagged review containers; no site-wide table selectors.
- Add `tests/ai-batch6-mobile-import-integrity.test.mjs` to prevent regression on review fields, selection gates and source metadata.

## Validation actually carried out

**PASS (isolated JavaScript source/formatter test harness):**
- Batch 3 history visibility contract — 4/4.
- Batch 4 compact supplier comparison and mobile price editing contract — 4/4.
- Batch 5 supplier natural-language source/omission formatter behavior — 4/4.
- Batch 6 extracted supplier/product review mobile/source safety contract — 4/4.
- **Total: 16/16 isolated checks** on this branch. They are neither TypeScript compilation nor authenticated browser tests.
- GitHub read-only CI status: PRs #709/#710/#711/#713/#714 returned zero workflow runs and zero status checks at their respective head commits.
- Local checkout attempt was blocked by GitHub DNS resolution, so `npm ci`, `typecheck`, `build`, full Node suite and Playwright could **not** run in this environment.
- Physical iPhone Safari microphone could not be exercised here.

## Mandatory integrated release matrix

| Area | Minimum check | Failure risk |
|---|---|---|
| Build | Clean dependency install, TypeScript no errors, optimized build, full Node suite, visual test suite | P0 if broken |
| Modes | Advisor discusses hypothetical "add supplier/change price"; no navigation, proposals, or write; Controller only prepares actions with explicit consent | P0 on write bypass |
| Switching | Switch while plan pending, network streaming, voice recording and file import; never execute stale action | P0 on stale write |
| Account isolation | Sign out/in different Firebase user, switch workspaces and branch, refresh, open thread; no cross-account documents or chat | P0 on leakage |
| History | New/open/search/persist local threads; safe failure and retry on wrong or unreadable encryption key; never silently delete a business vault | P0 on data loss |
| Supplier compare | 20+ supplier rows, same product with mixed currency and units; same exact records on desktop/mobile, source visible, no invented conversion | P1 |
| Supplier proposal review | Create vs update, duplicate candidates, source PDF page and excerpt, unknown currency blocks new record until provided | P0 on incorrect save |
| Product import | PDF/Excel/images, 0/1/50+ rows, duplicate candidates, missing unit/currency, 9+ diffs, selectively confirm; never hidden changes | P0 on incorrect save |
| Quote editing | 10+ lines, mobile field edit, revision conflict, undo/redo, price precision, confirm/decline; no implicit writes | P0 on financial changes |
| Long outputs | Truncated result marked incomplete, multiple supplier debts preserved by currency, overflow labels clear AR/EN | P1 |
| Voice | Physical iPhone/iPad Safari, 15 consecutive sessions, stop/restart, mic permissions and owner handoff, transcript editable | P1 |
| Viewports | 320/375/390/430px Safari plus iPad and desktop Chrome; no horizontal clipping, nested scroll traps, 44px interactive targets | P1 |
| Document previews | iOS Safari PDF A4 pages, footer, original file viewing, images and attachments; no missing last row or blank pages | P1 |
| Performance | 50-row import on a slow mobile connection; no frozen modal, stale loading indicator or invisible save controls | P1 |

## Unresolved release blockers

1. **Cloud conversation history sync:** `src/storage/assistant-store.ts` still persists `assistant-state` as encrypted local IndexedDB state with hard limits of 30 threads and 60 messages per thread. The new history UI does not establish Firebase cross-device sync or change retention. Do **not** claim cloud history is complete. A separate schema/migration/permissions design is required before using Firebase for this data.
2. **Physical Safari microphone proof:** synthetic recognition is not enough; test on a real Apple device.
3. **Integrated validation:** No combined branch build includes all of #709/#710/#711/#713/#714/Batch 6 yet. Run tests with merged candidate source and document results.
4. **Unverified full build/QA:** no CI, Playwright or authenticated Production browser run evidenced.
5. **Original-source provenance in truncated tool answers:** a compact answer cannot serve as a full audit record. Always retain source records and explicitly show missing/omitted information.

## Acceptance rule

Keep all PRs Draft / **NO-GO** until a clean combined release-candidate checkout passes the build, automated suites, and the relevant real iOS Safari QA. A success in the source-level contract suite must not be represented as complete production readiness. Once the full suite passes, resolve merge/rebase conflicts on the dependent PRs one by one and only then merge with user authorization.

**Current operation:** Source changes staged on a branch. No accounting records, Firebase, production deployment or GitHub Actions were modified.
