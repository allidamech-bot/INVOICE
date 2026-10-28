# Plan Alpha — finance evidence and acceptance matrix (28 October 2026)

**Scope:** LOUREX INVOICE financial lane only. **Status:** historical/automated evidence consolidated, **NOT production acceptance**. This document is a dated snapshot of existing references, **not a new audit, test run or a new list of development defects**.

## Fixed release checkpoint and provenance

- GitHub `main` immediately after financial [#1153](https://github.com/allidamech-bot/INVOICE/pull/1153): `4e82f77eee11e6c1497cdd2c4a416f3541b41b93`. Earlier financial [#1152](https://github.com/allidamech-bot/INVOICE/pull/1152): `321f96eb07a10b83f1c3332faedd7caea43a4f52`.
- Vercel alias `invoice-three-puce.vercel.app`, deployment `dpl_7AaybTuXWs7EpSYhRdj1x7NQvVmz`: **READY** and Git source `af028967b6e7308fe2e9ceb971c466c229693a4b`, **not** the current reviewed GitHub commit. This mismatch is a **release-identity blocker**, not a demonstrated user-facing failure.
- Source references: original Library **الخطة ألف — LOUREX INVOICE.md**; `docs/FINANCIAL_WORK_REGISTER_20261023.md` (chronological, older statements superseded by later merges); `docs/FINANCE_ALIF_22_WEIGHTED_AVERAGE_POLICY_20261027.md`; `docs/FINANCE_ALIF_22_FIRESTORE_GL_ATOMIC_QA_20261028.md`; `docs/FINANCE_ALIF_PERIOD_AUTHORITY_DR_RUNBOOK_20261026.md`; and `docs/qa/FINANCE_ALIF_39_40_HUMAN_ACCEPTANCE_20261027.md`.
- Historical original wording for some numbered axes is not recoverable verbatim. The *labels* below are the original plan's **working summaries**, not invented quotations. An original-wording mapping must stay **PARTIAL** until its source is recovered.
- The supplied 26–27 October count of **51 merged financial PRs** includes tests/docs/CI/fixes, **not 51 axes**, and is a separate handoff assertion rather than a newly recomputed merge census.
- All PR references below are prior evidence references; do not infer that each PR SHA, exact-head CI artifact, or independent approval was individually reconfirmed during this matrix update. The original register holds older exact SHAs and run links; production acceptance requires a validated row-level proof index before signing.

## 40 original axes — evidence already delivered vs. external gate

**Shared status rule:** prior merged/automated evidence is preserved, but **QA signoff and production signoff remain unproven** unless independently evidenced against the tested release candidate. Entries do *not* assert that a production defect exists. The one exception, axis **4**, is explicitly **DEFERRED**. No binary count of production-closed axes is claimed.

| Axis | Working requirement summary | Prior source PR(s) / reference | Specific evidence type or scope limit | Still required for acceptance |
|---:|---|---|---|---|
| 1 | Customer receipt / AR | #1099, #1115 | Node/isolated reconciliations | financeCycle, crossUid |
| 2 | Supplier payment / AP | #1059, #1060, #1116, #1122 | Node payment/scope/race tests | financeCycle, twoDevice |
| 3 | Final purchase-order PDF | #992, #1032, #1034 | Browser and native PDF simulations | physicalIphone, financeCycle |
| 4 | Independent posted-purchase document | Owner decision: deferred | No development requested | DEFERRED |
| 5 | Stock movement report | #1015 | Filtered rows/long output automation | financeCycle, physicalIphone |
| 6 | Management reports | #1002, #1043, #1054, #1056 | Report/CSV/print guard automation | financeCycle, physicalIphone |
| 7 | Output VAT report | #1004, #1044, #1056, #1077 | VAT and report automation; output VAT only | financeCycle, physicalIphone |
| 8 | Treasury and bank reconciliation | #1011, #1057, #1099, #1103, #1118, #1120 | Currency and settlement/race Node checks | financeCycle, twoDevice |
| 9 | Customer statement | #1036, #1046, #1115 | Scoped statement/print regressions | financeCycle, physicalIphone |
| 10 | Supplier statement | #1036, #1046, #1059, #1060, #1116 | Supplier balance/statement regressions | financeCycle, physicalIphone |
| 11 | Long and mixed-language documents | #1036, #1042, #1056 | Long text and CSV/browser output checks | physicalIphone |
| 12 | Commercial templates (18) | #1016, #1032, #1034 | Bilingual renderer/browser/native PDF cases | physicalIphone |
| 13 | Period close policy/cutoff | #1040; DR runbook | Date safety/emulator evidence; policy unsigned | authorityRecovery |
| 14 | Owner closing authority | #1112, #1114 | Isolated control/role tests | authorityRecovery, crossUid |
| 15 | Historical data integrity before closing | #1112, #1113 | Fail-closed retained-evidence checks | authorityRecovery |
| 16 | Immutable archived snapshots | #1114; DR runbook | Emulator published report-hash checks | authorityRecovery |
| 17 | Atomic server generation/CAS | #1112–#1114, #1119 | Isolated transaction / conflict evidence | authorityRecovery, twoDevice |
| 18 | Closed-history immutability | #1127–#1130 | Restore and posted-source guards | authorityRecovery, twoDevice |
| 19 | Offline and dual-device conflicts | #1119, #1120, #1122 | Synthetic races; no live devices accepted | twoDevice |
| 20 | Enroll/close/reopen and generations | #1114; DR runbook | Demo emulator lifecycle/retained reports | authorityRecovery |
| 21 | Closing authority after restoration | #1112–#1114 | Demo loss/recovery only; no managed restore | authorityRecovery |
| 22 | Inventory valuation, COGS and General Ledger | #1072, #1131–#1149, #1151, #1152, #1153 | WAC/NRV/GL simulated and isolated Emulator; no posted production GL | costPolicy, publishedRules, authorityRecovery |
| 23 | Stock issue, duplicate and oversell | #1050, #1052 | Saved-cycle draft 200 to issued 180, exactly once | financeCycle, twoDevice |
| 24 | Historical FX and currency separation | #1075, #1118; WAC policy | Input and historical-mismatch guards | financeCycle, costPolicy |
| 25 | Financial rounding and transaction dates | #1076, #1140, #1141 | Boundary and rounding tests; minor-unit policy unsigned | costPolicy, financeCycle |
| 26 | Tax, discount and charges order | #1077; source register | Bounded finance tests; full tax policy not signed | financeCycle, costPolicy |
| 27 | Credit-note output VAT | #1077 | Tax reconciliation regression evidence | financeCycle |
| 28 | Draft neutrality | #1074, #1052 | Draft leaves stock/source state unchanged | financeCycle |
| 29 | Draft deletion / audit history | #998–#1000 | Browser/CAS/audit continuity cases | financeCycle, twoDevice |
| 30 | End-to-end physical iPhone finance | #1079, #1080, #1086, #1097 | Simulator/WebKit plus older user-reported device successes | physicalIphone, financeCycle |
| 31 | Safari saved PDF, Files and Share | #1079, #1080, #1086 | WebKit/browser coverage; no fixed RC phone signoff | physicalIphone |
| 32 | iPhone keyboard and forms | #1097; open #798, #817, #1082 | Simulation and prior owner observations; open PRs not finance-owned | physicalIphone |
| 33 | RTL/LTR and multipage iPhone output | #1034, #1079, #1086 | Bilingual long PDF/WebKit evidence | physicalIphone |
| 34 | 40-source requirement matrix | Original Plan Alpha, old register, this dated matrix | Original wording for multiple axes unavailable verbatim | human source review |
| 35 | Firebase rules and tenant isolation | #1073, #1109, #1149–#1152 | Local Rules/Emulator; full published Rules NOT read | publishedRules, crossUid |
| 36 | Production and runtime parity | GitHub/Vercel checked 2026-10-28 | READY older deployment; not tested RC parity | release parity, publishedRules |
| 37 | Backup / business Vault restore | #998–#1000, #1110, #1127–#1130 | Business Vault and synthetic protected restore | authorityRecovery |
| 38 | Server authority disaster recovery | #1112–#1114; 2026-10-26 runbook | Emulator loss/restore; no managed backup/approved RPO-RTO | authorityRecovery |
| 39 | QA and regression signoff | #1106, #1122, #1153; evidence checker | Bounded evidence and completeness checker only | all seven gates, independent reviewers |
| 40 | Final finance release decision | No signed release dossier | NO-GO: no independent release decision or validated fixed RC | all seven gates, finance/security/release signoff |

## Acceptance classifications — do not collapse these

1. **Implemented:** merged source code or test/document work; identify precise PR and SHA before final acceptance.
2. **Automated evidence:** Node, browser/WebKit or Firebase Emulator results on a specified source. The exact test and its *limitations* must be recorded, not just PASS.
3. **Isolated integrated QA:** authorized QA project, two test users, two independent sessions, verified sources and before/after snapshots. **Not yet independently signed**.
4. **Accounting/security/operations decision:** currency per legal entity, opening evidence, dated movement order, landed-cost/FX/returns, rounding, COA, operator RPO/RTO, live Rules and real authorizations. **Unapproved portions stay blocked**.
5. **Production acceptance:** only independently reviewed immutable proof on one fixed release candidate with owner signoff. **Not asserted for any row** in this matrix.
6. **Deferred:** axis 4 only; not a failure, not part of the current active 39-axis closure.

## Seven named independent evidence gates

`scripts/finance-alif-acceptance-evidence.mjs` checks the **completeness** of a private dossier only; it cannot verify honesty/authenticity of proofs, grant accounting authority, or publish a GO decision.

| Gate | Current boundary / what remains |
|---|---|
| `financeCycle` | Execute F01–F08 against an approved isolated two-identity QA project; independently reconcile stock 200→180, AR 150, AP 1170 and bank 100+50−30=120 without duplicate operations |
| `twoDevice` | Two authenticated sessions, stale-write and double-allocation rejection, conflict and offline behavior; preserve periods |
| `publishedRules` | Authorized read-only published release/ruleset ID, complete current source, date and exact source comparison against `firestore.rules`; no publish |
| `crossUid` | Actually signed-in two-UID live QA read and write denial, own UID access, company/branch and role/session separation |
| `physicalIphone` | Real iPhone Safari on fixed RC; identical preview and saved PDF, Files, Share/Print, multi-page RTL/LTR, keyboard and save |
| `authorityRecovery` | Operational QA backup/restore of trusted server authority, report hashes/receipts/control, independent operator + finance authorization and approved RPO/RTO |
| `costPolicy` | Default **perpetual moving weighted average selected**; specific identification for identified noninterchangeable units; functional currency, opening, FX/returns, valuation, rounding, complete GL mapping/posting and accountant review still separate |

**Next safe sequence:** obtain full published Firestore Rules read-only through an authorized operator; resolve finance policy signatures and trusted GL source; approve isolated QA identities/environment; perform one integrated financial/two-device acceptance; take physical iPhone proof; approve managed DR and RPO/RTO; reconcile the *same* GitHub/Vercel release candidate; only then issue a human GO/NO-GO with distinct finance/security/operations/release approval.

## Exclusions and change control

No new posting API, no Firestore Rules publication, no migration/revaluation, no production-period close/restore, no customer data, no Vercel promotion, no AI Controller/Advisor or AI branches. Older open iPhone PRs #798/#817/#1082 are not automatically financial-track owned. This **documentation-only** matrix neither reruns nor reclassifies previously accepted bounded tests, and cannot be used as a signed release decision.
