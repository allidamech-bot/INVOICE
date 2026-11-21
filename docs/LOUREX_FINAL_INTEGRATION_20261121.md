# LOUREX INVOICE — Final integration ledger (2026-11-21)

**Owner-authorized scope:** reconcile eight open PRs into a single clean integration release. No live ZATCA, production Firebase, AWS service activation, paid cloud provisioning, or production deployment is authorized by this ledger.

## Immutable audit origin

- Repo: `allidamech-bot/INVOICE`
- Frozen `main`: `006b51a7336974aadbf61432d8b66455112f9237`
- One integration branch: `release/lourex-final-integration`, initially fast-forwarded from audited `#1287` head `e05b79e807825b7de52c561d40ce78134f99721c`.
- Primary handover: PR #1287, [owner integration directive](https://github.com/allidamech-bot/INVOICE/pull/1287#issuecomment-7056120767).
- Check actual HEAD and rerun all applicable release gates before any final merge; previously observed status is evidence, **not approval**.

## Source PR preservation matrix

| Source | Audited SHA | Disposition on integration branch | Risk |
| --- | --- | --- | --- |
| #1287 fiscal, accounting, AWS | `e05b79e807825b7de52c561d40ce78134f99721c` | Complete 139-commit branch history incorporated as integration foundation, 277 original changed paths; no independent fiscal production activation | Very high: 5 source regressions identified in previous CI; isolated QA and authority acceptance incomplete |
| #1289 invoice mode UX | `a29f9733bb3982152faf026bca9eda76cd563e8b` | All 33 changed paths already represented inside #1287; 25 diff patches identical, other 8 contain wider/newer fiscal changes; no competing UI implementation added | Editor's earlier unconditional Saudi issuance rejection is intentionally superseded by gated server issuance; production must stay fail-closed |
| #1288 second invoice mode UX | `3e1b788e5db6da21b0324afe35be5f3391c27765` | 15/16 paths overlap #1287. Unique actual Documents-page/IndexedDB/browser acceptance coverage transferred from `tests/visual/run-commercial-completion-batch6.cjs` | Run Chromium/WebKit against integrated version |
| #1285 iPhone PWA safe area | `15360041ee52cca815309281816ec63496120f13` | Append-only WebKit standalone CSS correction and its independent test transferred; unaffected Safari-tab mode | Run targeted source and mobile browser checks |
| #1265 finance historical clock | `18b4cdc026bbacdd51182658cf397f506f587b75` | Superseded in current `main`: the same three named tests now use Node `t.mock.timers` and time advance, without global Date override | Preserve modern tests; verify current finance suite |
| #1259 Groq safety/preflight | `b82a3223b0151f2c52a523e27c1cdff2a3839eea` | Modern Groq structured/preflight, diagnostics, and API key tests already in #1287/main. Restored missing Preview fail-closed policy for `ai-legacy/groq-*` and this release branch; added tests. Did **not** re-add duplicate legacy CI/build workflows. | Run existing Groq, routing and isolation tests; no paid inference |
| #1082 stale startup recovery overlay | `c06426e63515783c17caef87a14d3ef55d0334e2` | Superseded: main now intentionally omits the old customer overlay; watch-dog only records metadata and static splash retry, avoiding a second overlay observer | Test reusable loading node and Safari startup |
| #817 iOS boot-lock & stage diagnostics | `7ccc23630e45a226cd33a4f2891de4766040219b` | Superseded: `theme-bootstrap-v347.js` currently observes class changes and real UI readiness across replacement gaps; `App.tsx` has private `startupPhase` diagnostics | Test no endless boot lock and no PII in startup traces |

No source PR is to be closed solely on this matrix. Close each with a link to the final verified integration PR/merge and a preservation explanation only **after** final signoff.

## New integration-only commits

- `627d31addfc329de208c86a0af51d87f817921ba`: independently reject DER BasicConstraints `CA:TRUE` disguised as a non-CA EGS certificate, in addition to Node's `X509Certificate.ca`. Protects existing malicious-certificate test.
- `ac562abce66f25f9b999ae09aee74e2e6c5bafef`: align readonly systemd isolation test with the root-managed dedicated Node runtime.
- `3bae760a528d45b8561387787942cbe1565f5499`: align installer test with exact `git -C "$GIT_REPO" sparse-checkout` source.
- `58e2c64d538537e92c8d609d8545c30f7d41283d`: stop offline readonly test falsely flagging SHA256 `.update()` as a remote write; continue disallowing explicit database mutations.
- `f774c3934efe948880b8db36c4aa16c46c791e35`, `d708c264a6db68d48b03b8814bd154a8f6354c75`: carry #1285 standalone safe-area CSS and test.
- `d616af8a3b6c26059da79b374305e137e0de3fac`: preserve #1288's unique actual Documents-page browser regression.
- `935937fd5480f2d82f6c3442992c5ed056ee8623`, `43758c73ad3d5e9dff97211edb0f63040d8b6c3c`: protected Vercel Preview ref check and syntax correction.
- `6557e256cfd175576b3efdb88d8abf774163c355`: negative Groq/release Preview isolation tests and positive local CI controls.

## Release gate and known blockers — NOT YET APPROVED

The original #1287 HEAD had successful production build/type checks on individual workflows and a **failed** full mandatory release gate and failed Node accounting/inventory jobs. The five repeated fiscal tests included: stale pinned probe digest assertion, outdated systemd Node path, unexpected acceptance of CA:TRUE enrollment leaf, outdated installer sparse-checkout assertion, overly-broad offline SHA256 assertion. This integration branch has code/test amendments but **must rerun and confirm**. It must not simply waive any failure.

Previous #1289 full browser gate failed nine suite invocations, including shell navigation, startup overlay, search keyboard, voice, legacy document design fallback, workspace closeout and notification recovery. Distinguish failures inherited from original main against newly introduced regressions; retain mandatory gates. Reproducible defects must be fixed. Previous local browser node tests are not proof of live iPhone support.

ZATCA Developer Sandbox HTTP 200 compliance / operational CSIDs and HTTP 202 CLEARED standard document are **limited diagnostic evidence**. No signed Simulation acceptance, actual licensed taxpayer enrollment, active trusted authority PKIX/CRL, protected real EGS identity, live QA cloud isolation, approved hosted SDK + HSM runtime, protected restoration, or production fiscal authorization is asserted. All live issuance must remain fail-closed where prerequisites are missing.

`vercel.json` currently contains `git.deploymentEnabled: false`; release branch Preview explicitly checks isolated Firebase before building. Linked Vercel projects were not returned for this repository by the available account connector; separately verify effective project-level auto-deploy before any main merge. No service flags, AWS/Google IAM, real customer data, invoices or credentials were modified.

**Required before main merge:** update this ledger with exact integration HEAD, TypeScript/build/unit/integration/browser/security/financial result links, proof main did not move unexpectedly, release deploy isolation status, and disposition of each source PR. On real failure, keep release on HOLD and `main` unchanged. Owner tests manually only after code release signoff.
