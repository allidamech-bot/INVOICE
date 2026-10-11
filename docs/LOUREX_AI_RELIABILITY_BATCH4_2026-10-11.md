# LOUREX AI — Batch 4 reliability and consolidated acceptance ledger

Repository: `allidamech-bot/INVOICE` only. Branch: `ai/reliability-intelligence-20261011`.
Authoritative inputs: Master Handoff V1.1 and Batch 1 Prompt read completely. The owner subsequently authorized completing all four phases, then reviewing before merge/release. This PR implements the approved Phase 4 foundation on the existing Phase 3 tree; it does not rebuild the ERP or add services/packages.

## Verified baseline and PR chain

- Main: `00117b9b7109c82e34b9fcc0c8fafe6cd03a4e61`.
- Production alias: https://invoice-three-puce.vercel.app; READY deployment `dpl_4S4bvun6GJPNTQDm7TmhdXs7orBX`, same main SHA. Production is the previous release, not these feature branches.
- Batch 1: PR #693, latest head `f589e1fff18db88926ef2f2e070a9e4292a62518`, includes invalid-operator approval hardening.
- Batch 2: PR #694, head `93558c604110403563b7ce16ca6a786a29702f8b`, base Batch 1 branch.
- Batch 3: PR #695, head `2eb29bfe2c9442869075dfe34e27a14fcccaedce`, base Batch 2 branch; this is the Batch 4 parent. Baseline full regressions: 2,390 passes in UTC.
- All three PRs were open/unmerged. Batch 4 incorporates the exact Batch 1 approval helper/report and retains its two additional safety tests, adapting harness dependencies for the later compiled runtime.

## Implemented behavior and owners

| Capability | Owner / behavior | Business writes |
|---|---|---|
| Scoped business graph | `ai-business-memory-graph.ts`: derived customer/supplier/product/document/purchase/payment nodes; exact stored-ID relationships; company, branch and active account checks; ambiguous names stay distinct; missing links flagged; no product matching by description | None |
| Approved memory provenance | Existing AES-GCM memory store reused. Active, unexpired Business notes of the exact company/branch become declared notes; Personal/foreign notes excluded. Declared notes never become verified financial facts or action authority | Existing explicitly approved note storage only |
| Resume deal | Current encrypted business threads, filtered by account/company/branch; select a known thread through the existing lifecycle; Temporary does not load durable business history | Thread state only |
| Role-limited handoff | Rebuild current records and recheck sender/recipient; exact selected record plus directly related permitted nodes; duplicate/inactive recipient IDs rejected; no contacts, private notes or financial amounts added. UI labels local preview, not sent | No sending, ownership reassignment or synchronization |
| Priority intelligence | `ai-reliability-intelligence.ts`: existing dated finance/business/advisor engines, role-filtered severity and missing-data evidence; highlighted evidence is bounded by the existing advisor contract, not a complete audit | None |
| Reconciliation review | Existing treasury projection at explicit as-of date; unallocated/unreconciled rows, orphan payments and duplicate active source links; future-created records excluded | No reconciliation event or accounting post |
| Cash simulation | Recorded treasury account entries at explicit baseline; explicit dated inflow/outflow assumptions; integer cents, separate currencies, signed result; unknown baseline/projected values without an account; duplicate IDs/source allocations and inconsistent ledger currencies rejected | No forecast posted, inferred collection or automatic FX |
| Diagnostics | `ai-local-diagnostics.ts`: latest 100 measured turn/tool/approval/workspace samples per encrypted thread; count/failure/uncertainty/median/P95; whitelist strips text/IDs/payloads; invalid dates/nonfinite durations rejected; busy no-ops not recorded as successful work | No external telemetry service |
| Presentation | Precompiled `AiReliabilityWorkspace.tsx`, wired into existing AI workspace tabs; paged records/evidence, explicit scenario assumptions, 44px controls, scoped remount keys | Existing guarded commands only |
| Offline/PWA delivery | Final workspace manifest hashes new modules and transitive approval/memory dependencies, retaining independent voice cache identity | No change to storage/encryption model |

The kernel persists selected IDs, local handoff/cash previews and diagnostic samples inside the existing encrypted assistant state. The full relationship graph is derived from current scoped records rather than persisted as an unscoped search index. Current graph evidence and cash assumptions are DATA-only provider context; stale role-restricted selected entities are cleared. Source edge omission is explicitly reported rather than silently truncating.

## Proven problems and corrections

1. Invalid explicitly selected operators could fall back to owner through the legacy governance helper. The exact Batch 1 fix is retained at AI approval preparation and actual guarded mutation; non-AI governance is unchanged.
2. A new timing wrapper initially treated a thrown or structured failed tool result as completed. It now records failure; aborted calls are uncertain and blocked duplicate/busy attempts do not inflate completed counts.
3. Persisted graph references could survive a role downgrade. Context and UI revalidate current roles; graph entities are cleared and cash/handoff facts are hidden or rederived.
4. Duplicate source allocations or mismatched treasury currencies would make naive projected balances unreliable. The cash path reuses existing ledger validators and rejects duplicate identities/source links instead of presenting an invented corrected balance. Read-only review surfaces the anomalies.
5. Scope/thread transitions now also clear volatile memory/thread lists and remount the new local forms by the full scope key. Temporary loads no durable Business thread/history cache and writes no assistant-state record.

Existing bounded source extraction (four sources), manually supplied unverified external quotes, conservative review snapshots, mission limit of five prepared steps and deterministic accounting prohibitions remain in force. No autonomous financial posting, silent approval or untrusted generated code was introduced.

## Data/sync architecture decision

Keep the current local-first encrypted vault and account-scoped persistence. Current team-member records have no company membership field; operator role selection is not a separate authenticated enterprise identity. A handoff preview therefore cannot claim authenticated recipient delivery or cross-device authorization. Implementing shared graph indexes, live staff inbox delivery, independent tenant/team ACLs or device synchronization requires a separate data/sync review. No hosted database, encryption switch, background agent or paid service was added.

## Acceptance evidence

Tests use actual compiled modules and AES-GCM storage with controlled storage/session/provider edges. They include exact-ID graph links, company/branch/account/Personal isolation, untrusted notes as declared data, stale/downgraded/inactive handoffs, dated cash mathematics and mixed currencies, orphan/duplicate source review, telemetry privacy and percentiles, encrypted restart, Temporary non-persistence, tool errors, interrupted approval replay and 100 simultaneous approvals producing one write. A 2,000-customer + 2,000-document fixture retains all 2,000 exact edges; measured local graph build was 15.46 ms in the final full regression process. This is a single synthetic timing, not a provider or device SLO.

The first targeted run had 83/84 passes. Its sole failure expected whole-kernel equality on a denied workspace command, including diagnostics. The test now additionally requires exactly one failed sample while still deeply comparing every business kernel field unchanged. No approval, role, scope, artifact or persistence assertion was removed.

Final validation results and built hashes are appended after execution.

## Live acceptance limits and remaining risks

- No authenticated live model/tool/voice session or physical Windows/iPhone/iPad WebKit fixture was available. Automated behavior tests do not establish those live journeys. No Production data changed.
- Local diagnostics are implemented; Production latency/quota/voice SLOs cannot be claimed before release and live measurement.
- Relationship graph and financial review are local read-only intelligence. Handoff delivery and multi-device sync remain architectural follow-ups as above, with no fake send status.
- Approval journal and business vault are separate encrypted records. Interrupted/uncertain operations block replay and require record review; no atomic cross-store commit is claimed.
- Large ingestion/universal PDF mapping and fully autonomous result-dependent mission construction remain outside the supported existing source/planner contracts.
- Existing local-date versus UTC-created-date business cutoff behavior is retained. Full regressions run in UTC; targeted new AI suites also run in Europe/Istanbul. The earlier timezone-dependent procurement tests reproduced on an unchanged baseline are documented in the Batch 3 ledger; no non-AI payables rewrite was introduced.
- Legacy postbuild installer debt remains. New logic is in first-class TS modules; final built runtime, precache coverage and module hashes are tested.

## Consolidated review sequence

Review Batch 1 through Batch 4 together. Preserve the exact feature trees; when moving from stacked PR review to release, update bases in dependency order and rerun required checks on the resulting main candidate. Do not claim these PRs are deployed. Merge and Production promotion are separate release actions after owner review of the consolidated evidence.

### Final validation

- TypeScript: PASS. Complete ordered production build pipeline: PASS locally.
- `TZ=UTC node --test --test-concurrency=2 tests/*.test.mjs`: **2,419 passed, zero failed/skipped/cancelled**, 59.280 seconds. Includes the original 2,390 Batch 3 cases, two upstream operator tests and 27 new reliability cases.
- `TZ=Europe/Istanbul node --test tests/ai-reliability-intelligence.test.mjs tests/ai-intelligence-foundation.test.mjs tests/ai-conversation-workspace.test.mjs tests/ai-commercial-intelligence.test.mjs`: **87 passed, zero failures/skips**.
- `git diff --check`: PASS.
- Final `AiCopilot.js` SHA-256: `fdb6cdf2741b66e157ead61a2257cba83bceb637903b56da8abe3b938b410f58`.
- New precompiled `AiReliabilityWorkspace.js` SHA-256: `872ea2236bc1ffa8fc1661b2dcfaa3961f8a04b56f5fd4d60b0ffe5e6087a112`.
- Voice composer SHA-256: `3c6b20159ca8f0c2cc30119eba478797e7a2cb899f4ef55b7e5e8aa1b2ea850e`.
- All four phase code paths are exercised together in this feature tree. Remote commit/tree identity is compared with the tested local tree before PR handoff. No merge into main or Production promotion performed.

### Consolidated merge-tree check

Simulated the actual PR dependency order using the verified remote Batch 1 tree and its remote parent, then Batch 2, Batch 3 and Batch 4. All merges were clean and the resulting file tree exactly matched the tested Batch 4 tree. This used local Git objects only; no branch was merged into main and no Production action occurred. Local publication commit metadata differs from remote metadata, so the simulation preserves the verified remote ancestry rather than comparing unrelated local author commits.
