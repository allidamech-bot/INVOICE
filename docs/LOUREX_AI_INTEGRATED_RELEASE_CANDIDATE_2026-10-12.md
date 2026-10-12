# LOUREX AI — Integrated Release Candidate (Batches 1–7)

Date: 2026-10-12
Branch: `integration/ai-batches1-7-qa-20261012`
Target: `allidamech-bot/INVOICE` → protected `main`
Production: https://invoice-three-puce.vercel.app

## Purpose and dependency trace
This candidate includes the source of **voice #709** and **Advisor isolation #710**, plus the chained history/mobile/finance/AI source review changes **#711 → #713 → #714 → #715 → #716**. The two independent heads (#709/#710) were copied into a new integration branch using a Git tree, after checking their substantive application files had not changed from main in the stacked head. This is **not** a merge to main.

Do not mark individual stacked PRs merged or ready for production just because this branch exists. Retarget/rebase individual PRs only after a verified release strategy is selected.

## Included changes
- Voice: cross-owner microphone handoff; proper release/teardown status; bounded startup and active capture; iOS synthetic WebKit regression coverage
- Modes: strict Controller/Advisor execution separation, malformed-mode fallback to Advisor, genuinely conversational Advisor hypotheticals and suggestions
- History: visible compact, searchable, company/branch-filtered conversation list with open/new/delete controls
- Supplier/mobile: compact evidence and readable financial facts, editable mobile product lines with the same approval and revision controls
- AI import: supplier extraction and product review in labelled mobile rows with complete proposed differences
- Tool result fidelity: missing/omitted source fields explicitly labelled and bilingual; no silent truncation
- Firebase: account-specific text history with transactional per-thread merges, UID rules, tombstones, conflict detection and limited Firestore read fanout. No device cache AES key, approval artifact or financial vault goes to cloud

## Validations executed during authoring
1. Batch 1 + 2 voice/Advisor source checks plus server API mode/capability sanitizer probes in the integrated head: **22/22 passed**.
2. Batch 3–6 isolated source/formatter checks in stacked head prior to integration: **16/16 passed**.
3. Batch 7 cloud synchronization behavior exercised with a JavaScript-adapted extract of the current cloud merge functions: **9/9 passed**. Five separate isolated checks of the actual local thread-save function passed, including stable message timestamps, overflow rejection, scope isolation and deletion-ID rejection. After the latest source changes, the merge code rejects same-ID conflicts, accidental resurrection, 31st local thread, 61st unique message, cross-account data and overlong text; a deletion can free a slot for a replacement conversation.
4. Integrated branch release-candidate source-contract checks: **10/10 passed**.
5. **22 authored** Batch 7 Node tests (requiring compiled TypeScript) (two-device merge and conflict, deletion, privacy, retention) exist but have **not** been run against actual TypeScript output.

These are *limited engineering checks*, not a release certification. No full local checkout/CI was possible in the current environment. A read-only Vercel check identified production deployment `c4254d5aa105206e0284f4424019e4c333c9b172` on `main`, and **zero deployments for this integration branch**. GitHub reported **zero workflow runs and zero statuses** for the integrated PR head. Therefore there is no evidenced full build, Vercel preview, browser QA or physical Safari acceptance for this candidate.

## Mandatory release acceptance gates

### Gate A — build and regression
Run from a clean checkout with the project's required Node version:
```bash
npm ci
npm run typecheck
npm run build
node --test tests/ai-batches1-7-release-candidate-contract.test.mjs
node --test tests/ai-batch7-cloud-history.test.mjs
```
Then run the complete repository Node/visual test suite. Record exact test counts, failures and skip reasons. Build-time JS postprocessors must finish without drift-marker errors. Do not run paid GitHub Actions without explicit approval.

### Gate B — authenticated data isolation
Using separate Firebase emulator identities and two independent browser profiles, check: same UID text/creation/open/delete convergence; different UID blocked; separate company/branch blocked; offline edits & tombstones; concurrent same-ID messages rejected if inconsistent; no cached approval replay after new remote text. Confirm Firestore deployed rules match the checked rules.

### Gate C — user workflow
- Controller creates and edits drafts only after clear preview/review/approval; no duplicate write after retry or mode switch.
- Advisor discusses recommendations with no action plan or navigation, and never claims to have modified data.
- Supplier comparison and source import show every relevant price, currency, provenance and diff, with sensible unknown-value warnings.
- History retrieval on a second device shows text and mode only; attempts to perform old tool actions must require a fresh local controller request and approval.
- iPhone Safari 320/375/390/430px: no horizontal overflow, nested modal scroll trap, obscured button or illegible text.
- Physical Apple WebKit voice: >=15 consecutive complete recordings, owner handoff, permissions denied then retried, transcript editable, no stuck listener.
- PDF: A4 pagination, last line, totals, terms, footer and signature all visible.

### Gate D — known blocking product decisions
- **Current retention is bounded:** 30 local threads, 60 messages per thread and 200 cloud metadata records. Excess data **fails safely** but unlimited history is not implemented.
- **History privacy:** Firestore content is readable in account-authorized application storage (not end-to-end encrypted). Verify product consent for retention, deletion and export.
- **Cloud sync cadence:** automatically pushes changed threads; pulls on workspace refresh / reconnect. An always-on realtime listener is not implemented.
- **No real device QA / no provider billing claims** have been evidenced.
- Revisit project costs and quotas for Firestore reads/writes prior to broad roll-out. Outgoing per-turn saves use single-doc transactions to avoid complete collection scans.

## Decision
**NO-GO / Draft.** Do not merge into protected main, publish to Vercel, wipe or migrate production data, or claim 100% readiness until the build, Firebase emulator and real iPhone Safari scenarios pass with documented evidence.
