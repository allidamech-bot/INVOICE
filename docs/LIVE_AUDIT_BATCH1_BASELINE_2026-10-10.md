# Live audit remediation — Batch 1 integration baseline

Status: candidate prepared and locally verified; no merge or deployment.

## References

- main: `19e2a48b6ead561b77678d6145740fa8276101f0`
- Base PR #676: `88f2ffbf683970c987879eefd41eccfbdb98d7f3`
- Source PR #682: `ba9077021affd7c1b8b3ef4d8f3ebe719a8edb86`
- New branch: `audit/live-remediation-batch1-20261010`

The user approved starting the nine-batch execution plan. Physical iPhone/iPad testing is excluded from this stage. This batch selects production changes from both candidates rather than merging either blindly. The new branch descends from #676; it does not claim #682 ancestry or include all its commits.

## Decisions

- Keep #676 green QA baseline, boot matte-black owner, business-asOf precedence, product CSS, Create ARIA and queued Settings close.
- Bring across #682 busy auth-mode guard, post-cleanup startup recheck, explicit manual logo editor, asset-generation cancellation checks and canonical editor CSS.
- Bring across focused manual-editor and auth/action tests from #682. Preserve #676 foundation checks and add its stronger text-only/privacy diagnostics coverage instead of replacing the existing tests.
- Keep #676 sign-out contract, then execute actual runtime handler behavior for safe, dirty and document-editor cases; no security check is dropped.
- Defer editor accent/source owner differences to Batch 4: copying these now would mix a design-owner change into baseline integration. Both source files remain recorded below.
- Keep historical #676 test reconciliations rather than reverting dozens of contracts to older #682 versions. File-level decisions below record this selection; passing source assertions are not evidence that all product behavior is correct.
- Do not copy branch-specific #682 CI configuration. Local Node 24 validation avoids triggering new Actions jobs or adding infrastructure.

## Validation

- Node `v24.19.0`, npm `11.9.0`; locked `npm ci --no-audit --no-fund`.
- `npm run typecheck`: pass.
- `npm run build`: pass, no deploy.
- Final complete `node --test --test-concurrency=2 tests/*.test.mjs`: **2,186 passed, 0 failed, 0 skipped, 0 cancelled**. Original 2,174 cases retained, plus 11 runtime/component behavior cases and one additional diagnostics case.
- Actual shipped watchdog executed with deferred cleanup: manual navigation when still stalled; no navigation when editor/dirty marker appears or application finishes loading.
- Actual first runtime-safety IIFE executed: sign-out safe path remains available; editor/dirty paths prevent downstream actions.
- Actual component methods transpiled for tests: busy mode switch keeps pending auth/password state; manual logo cancel/late closed result do not overwrite artwork; successful result remains a draft and calls no persistence.
- `git diff --check`: pass.

Limits: deterministic VM fixtures verify selected code behavior, not real Firebase sign-in or graphical logo editing. Build does not certify visual parity. A01 release alignment and all later audit issues remain open until their assigned batches and final acceptance. Production and existing PR refs were not modified.

## Complete direct-tree difference inventory

| Path | Batch 1 decision |
|---|---|
| `.github/workflows/lourex-final-integration-batch-qa.yml` | Keep #676 configuration; no new automated run requested |
| `.github/workflows/lourex-qa-contract-closeout.yml` | Keep #676 configuration; no new automated run requested |
| `public/document-entry-v302.js` | Retain #676: newer approved baseline or runtime contract |
| `public/startup-watchdog-v321.js` | Adopt #682 delta; preserve #676 baseline elsewhere |
| `scripts/v485-bundle-visible-ui.mjs` | Retain #676; review design-owner delta in Batch 4 |
| `src/components/AccountEntryScreen.tsx` | Adopt #682 delta; preserve #676 baseline elsewhere |
| `src/components/AppShell.tsx` | Retain #676: newer approved baseline or runtime contract |
| `src/components/SettingsModal.tsx` | Adopt #682 delta; preserve #676 baseline elsewhere |
| `src/lib/ai-advisor-v2.ts` | Retain #676: newer approved baseline or runtime contract |
| `src/lib/logo-rebuild.ts` | Adopt #682 delta; preserve #676 baseline elsewhere |
| `src/styles/tailadmin-products-v320.css` | Retain #676: newer approved baseline or runtime contract |
| `src/styles/tailadmin-settings-v320.css` | Adopt #682 delta; preserve #676 baseline elsewhere |
| `src/styles/v485-visible-ui-corrections.css` | Retain #676; review design-owner delta in Batch 4 |
| `tests/ai-advisor-asof-batch2.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/editor-color-layer-closeout-v591.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/editor-design-color-layer-owner-v589.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/foundation-hardening-v120.test.mjs` | Keep #676 + add stricter #682 privacy/text-output assertions |
| `tests/items-library-v106.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/ledger-pulse-loading-v250.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/live-document-regressions-v584.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/logo-rebuild-v49.test.mjs` | Adopt #682 delta; preserve #676 baseline elsewhere |
| `tests/luminous-noir-continuity-v225.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/luminous-noir-v224.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/maintenance-v257.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/manual-lock-draft-safety-v240.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/matte-black-v228.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/mobile-more-rtl-v208.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/mobile-more-visual-v204.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/mobile-pdf-v73.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/mobile-preview-fit-v241.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/mobile-safari-chrome-v199.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/mobile-safe-area-v155.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/mobile-ui-recovery-v147.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/mobile-ui-v47.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/more-settings-ia-v248.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/nested-surface-consistency-v229.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/obsidian-dashboard.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/obsidian-settings-v190.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/operations-mobile-tabs-v242.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/operations-v137.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/post-redesign-mobile-geometry-v193.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/post-redesign-production-audit-v192.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/precision-black-foundation-v267.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/precision-black-redesign-v273.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/precision-black-shell-v268.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/premium-smoothness-v99.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/product-category-display-v245.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/product-import-smart-v257.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/product-library-actions-v259.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/product-library-pro-v113.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/product-metadata-assist-v112.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/product-os-v451.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/product-preset-fields-v111.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/profitability-v134.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/receivables-v133.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/reports-v135.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/rtl-financial-fields-v257.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/runtime-contrast-audit-v266.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/saved-items-picker-mobile-v232.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/saved-items-v95.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/security-hardening-v202.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/settings-workspace-v108.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/site-shell-audit-v86.test.mjs` | Adopt #682 delta; preserve #676 baseline elsewhere |
| `tests/startup-watchdog-v321.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/system-closeout-v110.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/system-ui-ux-v144.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/template-design-system-foundation.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/template-qa.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/ux-recovery-v152.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v302-real-pin-doc-entry.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v312-business-document-suite.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v320-release-contract.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v326-access-surfaces.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v326-foundation-recovery.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v330-critical-documents-closeout.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v330-mobile-action-dock.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v331-draft-scroll-account-transition.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v333-critical-documents-visual-functional-closeout.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v338-editor-stability.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v338-more-menu-scroll.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v339-signout-editor-guard.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v351-document-entry-source-contract.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v363-mobile-ux-functional-hardening.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v364-document-template-layout-refinement.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v481-premium-visual-rebuild.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v482-mobile-ux-repair.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v484-responsive-visual-hierarchy.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/v485-visible-ui-corrections.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |
| `tests/workspace-mobile-v94.test.mjs` | Retain #676 current-runtime contract; no blanket rollback or skip |

## Remaining execution order

2. Save/reload/workspace safety; 3. overlays/focus/tabs; 4. design/PDF ownership; 5. information architecture; 6. page polish; 7. AI/voice/files; 8. financial/report consistency; 9. final acceptance and review.

Do not merge or publish without explicit user approval.
