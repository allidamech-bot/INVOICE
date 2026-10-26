# LOUREX financial work register — 23 October 2026

Owner: this financial/storage/printing conversation only. AI tasks are excluded.
Purpose: stop choosing a fresh engineering round without a traceable requirement.
This is an evidence register, not a replacement forty-item checklist.

Repository baseline verified when creating this register:
`b0819869f2ce1e8fba3b809c41203d72c72dac60`.

## Execution rule

No new application changes until the owner can see the intended requirement,
its current evidence and what is needed to accept it. Every future round must
name one row below or quote a separately authorized requirement. A discovered
defect is recorded against that requirement; it does not silently redefine or
expand the remaining-work count. Merged acceptance does not imply deployment,
physical iPhone acceptance, or closure of other checklist requirements.

## Work actually completed since the supplied handoff

All twenty PRs below were directly rechecked as merged. These are delivered
rounds, not a count of original checklist items.

| PR | Delivered behavior/evidence | Merge SHA |
|---|---|---|
| [998](https://github.com/allidamech-bot/INVOICE/pull/998) | Real browser IndexedDB backup/restore, CAS, account change and protected-data rejection | `c287f416eb03546ed64a5dc0d3bb1c461a7c247b` |
| [999](https://github.com/allidamech-bot/INVOICE/pull/999) | Restore archive transaction abort and two-tab CAS continuity | `d8911584408c33899735bb928e4460c8c39b1c50` |
| [1000](https://github.com/allidamech-bot/INVOICE/pull/1000) | Actual App.persist with real IndexedDB; audit survives reload/backup/restore without false successful saves | `7cddc53538a485ba400d21616d7bcd1d93912c48` |
| [1002](https://github.com/allidamech-bot/INVOICE/pull/1002) | Management performance report no longer prints a blank PDF inside the real shell | `7b8505579bec30303a7896da6d5b5a4bbdb1f098` |
| [1004](https://github.com/allidamech-bot/INVOICE/pull/1004) | Tax report print visibility and actual UI/CSV/PDF parity | `66a18f68c5ed6e7bf4847c2f2a8676b4dabbb8fb` |
| [1011](https://github.com/allidamech-bot/INVOICE/pull/1011) | Read-only treasury period report with per-account opening/closing, late void effects, separate unallocated movements, CSV/PDF | `b5adea05eaceb446cf07d2b04afeac7c56ae26e8` |
| [1013](https://github.com/allidamech-bot/INVOICE/pull/1013) | Real stock transfers correctly labelled separately from adjustments in history and filters | `3f76d5330badd7bbe99d1590f3f3da25686e1548` |
| [1015](https://github.com/allidamech-bot/INVOICE/pull/1015) | Item 5: read-only inventory movement print output, all filtered matches beyond the screen cap, full notes/references/signed quantities/warehouse endpoints; 12 browser cases and 4 native PDFs | `d2f5c77a469939c81ecec6629c4663b90bec71be` |
| [1016](https://github.com/allidamech-bot/INVOICE/pull/1016) | Items 11/12: long final invoices on the other 16 registered templates, 192 Chromium/WebKit cases and 96 native Chromium PDFs; exact amounts, item completeness, no duplicate lines, logos and saved template selection | `b74579adaf56e66fb5e46a8802a7e70d370e24fe` |
| [1032](https://github.com/allidamech-bot/INVOICE/pull/1032) | Items 11/12: remaining sixteen registered long purchase-order templates, 192 Chromium/WebKit cases and 96 native Chromium PDFs; four Playwright shards passed on exact PR head | `60549a30c4a3f58c19df2cb17a03f2a561eca4da` |
| [1034](https://github.com/allidamech-bot/INVOICE/pull/1034) | Items 11/12: bilingual 40-line final invoices and purchase orders across all 18 templates; 72 Chromium/WebKit cases and 36 native PDFs, 4/4 shards passed on exact head after fixing test extraction of Arabic presentation forms | `5d46fe1eef22d30c2a261ad3e138fbb6632b17a9` |
| [1036](https://github.com/allidamech-bot/INVOICE/pull/1036) | Item 11: long customer/supplier/company names and long invoice/purchase/payment references through actual statement search → modal → print → native PDF; focused and existing regression workflows passed; synthetic single-document-and-payment scenarios only | `7b069f29818132f0c47322dfc221b2fa620e3252` |
| [1038](https://github.com/allidamech-bot/INVOICE/pull/1038) | Item 22 bounded mixed-cost evidence: landed receipt history across differing prices/currencies, frozen final-invoice stock cost, one-time issue and no negative inventory; 3 synthetic tests, typecheck/build passed; FIFO/WAC/COGS policy expressly unresolved | `43f4cada73a03cd8e7704bf1c8f4aaf2f8fd7465` |
| [1039](https://github.com/allidamech-bot/INVOICE/pull/1039) | Items 11/12: actual synthetic App.requestPrint on 40-line issued invoice (Obsidian) and PO (Minimal), EN/AR, 4 Chromium browser cases and 4 native A4 PDFs with 7 pages per case; WebKit synthetic harness failed before boot and is not accepted | `5c86ebb8d053909dfaba19a000f59a581342b8a5` |
| [1040](https://github.com/allidamech-bot/INVOICE/pull/1040) | Closed-period settings now default to the device-local calendar day instead of UTC; both offset directions verified in component tests; trusted server, Firestore emulator, owner browser and Vercel trace CI passed. This is not production-service activation or live-device acceptance | `76a198faa3c0d87230fd477f9db96d1b0d7b5e3f` |
| [1041](https://github.com/allidamech-bot/INVOICE/pull/1041) | Items 11/12: fixed WebKit synthetic inline-module 404 (`/tests/visual/src/app/App.js`), enabling actual `App.requestPrint` through 40-line final invoice (Obsidian) and PO (Minimal), both EN/AR: 8 Chromium/WebKit cases, seven A4 pages each; native PDF parsing remains Chromium-only. Physical iPhone and production print remain unverified | `621ed1c9d13cb1fb4ef41bc29c180cfad080d9d1` |
| [1042](https://github.com/allidamech-bot/INVOICE/pull/1042) | Original item 11 partial: fixed real 390px treasury report filter overflow with extreme native account labels (implicit Grid min-content track expanded to 2,867px); constrained Grid track and filters, verified all 4 EN/AR Chromium/WebKit UI+CSV/print cases, 2 native Chromium PDFs, all text sentinels and 140.00 USD unchanged closing balance; existing treasury and Vercel CI passed. No physical iPhone/deployment certification | `f18a281f08873df775c2d42ac4fc136ac2764b26` |
| [1043](https://github.com/allidamech-bot/INVOICE/pull/1043) | Original item 6 bounded UI safety: cancel queued management report native print after report-tab navigation or component unmount; preserve ordinary print/PDF, avoid stale body print state. 8 added Chromium/WebKit EN/AR navigation cases + 12 existing UI/PDF cases, 21 focused report tests; all three exact-head workflows successful. No physical iPhone/deployment certification | `bc81516708f8d9e39cfe06db4ac271e345cff5d5` |
| [1044](https://github.com/allidamech-bot/INVOICE/pull/1044) | Original item 7 output safety: avoid stale Tax / VAT native print when navigating away or unmounting the report; 8 Chromium/WebKit EN/AR navigation cancellation cases alongside 12 existing VAT CSV/print cases and 18 tax/financial Node tests, 2 exact-head CI workflows passed. Accounting and CSV values unchanged. No deployed or physical iPhone acceptance claimed | `9766224c6d50f097a2badced8a3da4e5e1385178` |
| [1046](https://github.com/allidamech-bot/INVOICE/pull/1046) | Follow-up safety for original items 9/10 (previous statement-output cases remain closed): fixed delayed native-print callback surviving customer/supplier statement modal close, account switch or page unmount; 24 EN/AR Chromium/WebKit cancellation cases and 16 prior short/long statements with 8 Chromium PDF parses passed, 21 account Node tests and all 5 exact-head workflows succeeded. Original account/output contract unchanged; no physical iPhone or production certification | `c1811669d9590cade929960cbeb268b04c75d806` |

Earlier merged financial repairs and acceptance remain delivered as recorded
in the supplied handoff: #942–944, #954–955, #959–960, #966, #968, #976,
#978–979, #982, #984–985, #990, #992, #994–995. Do not restart them.

## Read-only production deployment verification — 24 October 2026

**Latest verified snapshot (24 October 2026; supersedes the #1046-only snapshot):**
The Vercel deployment currently attached to the production alias
`invoice-three-puce.vercel.app` is `dpl_6DcuJZjrQbk7Q5wVnrYGgtwHZdAb`,
with status `READY` and GitHub source `main` at
`cd613c4f93f674e72a6930b0ac9dd67cc6d2a4d8` (AI #1051).
The independently queried GitHub main history has advanced to
`4357813eed91542729007327cb95b0d46c89d053`
(financial #1054 merged, after finance test-only #1052 and separate AI #1053).
**Exact source-SHA parity between the inspected production alias and
latest main is not true.** Unlike test-only #1052, financial #1054
changes the runtime report-print safety guards. The production alias
was still serving `cd613c4f...` at this check, so the new guard
has **not** been verified deployed or usable on a physical device.
No production promotion or re-deployment was initiated.

The earlier observed production deployment
`dpl_8gZzZJ7xMWDW1Z4TaoTdSG8h7ePp` at `c1811669...`
(financial #1046) was READY when checked previously, but is **not** the
current production-alias deployment in the latest inspection.

GitHub Actions exact-head verification for #1052:
`40118418013` (Finance Invoice Stock 200 To 180 (Node Only))
completed successfully, including TypeScript compilation and the scoped
200 -> 180 stock/warehouse saved-cycle acceptance. This does not prove
the production UI behavior, a real logged-in customer account, or any
physical iPhone browser acceptance.

Production deployment and browser/account acceptance remain separate.
The `READY` status is a deployment status, not proof of live login,
per-account IndexedDB, Firebase rules, service-worker refresh, mobile
print/share or physical Safari correctness. No release, rollback,
real-account write, cloud-rule change, or physical-device execution
was performed in this evidence update. The owner explicitly requested
no further browser automation.

## New owner-requested tracked-invoice stock acceptance — 24 October 2026

The owner asked to prove that **200 cartons** on hand become **180 cartons**
when a saved commercial invoice for **20 cartons** is finally issued, with
a documented source-linked debit and no repeat issue. This is separate from
the outstanding physical iPhone and deployed browser acceptance gates.

- [#1050](https://github.com/allidamech-bot/INVOICE/pull/1050) merged at
  `1453f593ba6595196d725df61d2ae512e6a51a88`: synthetic posted
  purchase receipts add 200 cartons to the default warehouse, a saved sales
  invoice **draft** leaves 200, first final posting leaves **180** and adds
  exactly one `issue -20.0000` with matching invoice ID/number/SKU/warehouse.
  Vault reload/replay preserves 180 without duplicate issue; selling 181 more
  is rejected without changing the ledger.
- [#1052](https://github.com/allidamech-bot/INVOICE/pull/1052) merged at
  `562e0a0ff5d4f29c71641b5440e004ce4b5fb98f`: strengthened the
  acceptance to drive **actual App.saveDocument and App.persist methods**
  through a compiled source-extracted Node harness. Verified draft saved at
  200, failed compare-and-swap commit leaves draft and 200 unchanged with no
  false issued confirmation, successful retry commits final invoice plus
  one -20 movement leaving 180 in stored/reopened vault.
- The #1052 first CI attempt exposed an inaccurate *test fixture*: the
  synthetic domain-only posted purchase lacked company/branch stamps that
  real App persistence supplies. Corrected the fixture's initial scope
  normalization, without relaxing the immutable posted-purchase guards.
  Corrected exact-head focused CI: **3 passed, 0 failed**, TypeScript
  compilation passed; then the PR was merged.
- **Scope:** financial Node integration only; no modification to live
  business records, no production accounting behavior change, no AI work,
  browser, real multi-device execution, iPhone Safari or actual PDF evidence.
  Do not equate the automated saved-state acceptance with deployed UI
  verification. The owner explicitly asked not to use further browsers.

## New management / VAT queued print source isolation — 24 October 2026

- [#1054](https://github.com/allidamech-bot/INVOICE/pull/1054) merged at
  `4357813eed91542729007327cb95b0d46c89d053`. Actual
  `ReportsPage` and `TaxVatCenter` delayed print callbacks now check
  that originating account-storage UID, input props and selected report state
  remain current before native print. Relevant queued prints are cancelled on
  component updates. No source financial totals or tax calculations changed.
- New scoped Node 24 acceptance transpiles the actual report components and
  checks 12 synthetic cases (ordinary print, duplicate click, storage account
  switch, props/data and filter changes, tab navigation, exception recovery).
  CI `40119772985` passed including TypeScript typecheck. Four existing
  automatic GitHub workflows on the same PR head also passed:
  `40119772983` Vercel Node trace, `40119772950` management PDF,
  `40119772977` tax PDF, `40119772954` financial browser QA.
  These were automatically triggered by repository path rules; no separate
  interactive browser session or customer-account access was initiated.
- Original items **6/7** gain a source-isolation safeguard, **not**
  final live-site, native iPhone or all-report print certification.
  Current production alias was inspected and still served an older main SHA
  after #1054 merge. Deployment and live-account acceptance remain open.

## Long mixed-language fixed-report CSV — 24 October 2026

- [#1056](https://github.com/allidamech-bot/INVOICE/pull/1056) merged at
  `3803dea4faf9c3c5ce634eb071aaa4043f6a7cae` for original item 11
  in the **CSV export** subset of management performance and output VAT.
  Added four read-only synthetic Node cases that transpile and call the
  **actual ReportsPage.exportCsv and TaxVatCenter.exportCsv methods**.
- Accepted scope: very long mixed Arabic/English customer identities and
  tax-document references; exact embedded commas, quotes and CRLF; original
  UTF-8 BOM bytes in the Blob; multiple currencies kept separate; signed
  credit-note VAT amounts; leading formula-like customer/document fields
  prefixed safely; 205 selected test rows exported with none dropped or
  duplicated; source fixtures unchanged.
- Exact-head [run #40120592027](https://github.com/allidamech-bot/INVOICE/actions/runs/40120592027)
  succeeded on `5c1d253ed2d8c7ebed6a16fe4f4d24e1db1b9046`, including
  TypeScript typecheck and previous report print-guard regressions.
  The first test attempt failed because `Blob.text()` removes the UTF-8
  BOM during decoding; the test was corrected to check raw Blob bytes,
  without production changes. This was a fixture error, not evidence of an
  app CSV defect.
- **Boundary:** direct component export methods on synthetic rows only;
  no app navigation, displayed-row search, real account, browser print,
  native PDF, physical iPhone or production deployment acceptance.
  Original item 11 remains **partial**. No AI or financial calculation,
  posting, storage, or production runtime files changed.

## Treasury historical currency guard — 24 October 2026

- [#1057](https://github.com/allidamech-bot/INVOICE/pull/1057)
  merged at `8fac847f11d792b8ba3f34747c9241d5c280646d`
  for original item 8's **read-only treasury report integrity**.
  Older/corrupt ledger entries referencing a cash or bank account in a
  different currency are now rejected, not silently added to opening or
  closing balances under that account's displayed currency. This is a
  report-level check only; entry posting and financial storage are unchanged.
- Scope of guard: selected same-workspace and same-branch account entries
  effective through report end, including earlier entries affecting the
  opening balance and voids occurring within the selected period.
  A future entry, other branch, or a mismatch fully voided before report
  start does not block a clean historical report. No implicit FX conversion.
- Additional Node tests checked pre-period USD/EUR mismatch, mid-period
  mismatch, malformed transfer currency provenance, independent valid EUR
  account, future row, pre-period void and in-period void. Existing treasury
  report Node tests also remained green.
- Exact-head GitHub Actions passed:
  [treasury #40121287597](https://github.com/allidamech-bot/INVOICE/actions/runs/40121287597)
  (TypeScript, production build, full Node accounting regressions,
  existing treasury CSV/browser/native PDF output), and
  [trace #40121287608](https://github.com/allidamech-bot/INVOICE/actions/runs/40121287608).
  These runs were automatically triggered by repository rules;
  no user account, real transaction, AI file or deployment was touched.
- **Acceptance boundary:** historical discrepancy guard is now code-reviewed
  and CI-tested; it does not certify a production data cleanup, live bank
  verification, owner sign-in or physical iPhone. Original item 8's earlier
  output acceptance remains as recorded and must not be counted twice.

## Supplier payment historical amount guard — 24 October 2026

- [#1059](https://github.com/allidamech-bot/INVOICE/pull/1059)
  merged at `59d3c612e10acf29bcb646f8b0673a0b1b654b08`:
  a malformed, zero or negative effective historical supplier payment is no
  longer silently interpreted as zero inside the supplier payable summary,
  payable aging or supplier account statement. Read-only projections instead
  refuse to report an apparently valid outstanding balance until the
  underlying stored payment is reviewed. New payment normalization also
  refuses to propose another payment while an effective earlier settled
  amount is unreadable.
- Future-dated invalid payments remain outside earlier as-of reports.
  Payments voided on/before the selected cutoff are excluded under existing
  historical transaction/void-date policy. Old source rows are **not**
  rewritten, deleted, normalized or revalued.
- Five synthetic Node tests were added for normal, malformed, future,
  voided and duplicate-settlement contexts. Exact PR-head workflows all
  passed: [closed-period #40122257222](https://github.com/allidamech-bot/INVOICE/actions/runs/40122257222),
  [Vercel trace #40122257211](https://github.com/allidamech-bot/INVOICE/actions/runs/40122257211),
  [financial parity #40122257185](https://github.com/allidamech-bot/INVOICE/actions/runs/40122257185)
  (including full Node regression suite), and
  [account statements #40122257165](https://github.com/allidamech-bot/INVOICE/actions/runs/40122257165)
  (existing printed statements).
- Financial safeguard only. Original item 10's already accepted statement
  output is not re-counted or closed a second time. No AI files, invoice
  posting, supplier transaction persistence, real-account data or
  production deployment were modified in this PR. Live-account/iPhone
  acceptance remains separate.

## Historical supplier payment currency consistency — 24 October 2026

- [#1060](https://github.com/allidamech-bot/INVOICE/pull/1060)
  merged at `f2448e965d91125205a2a1e3b31d3fff80d749db`.
  A real source-code gap was confirmed: the legacy
  `supplierPaymentsForPurchase` filtered payments with a mismatched
  currency silently. When used alone to build historical accounts payable,
  this could overstate supplier debt and obscure a linked settlement.
  Reporting and new-payment validation now use an additional scoped,
  effective-history helper that refuses a matching purchase ID but wrong
  currency before calculating a financial balance.
- Dates/scopes preserved: only records from the purchase's company and
  branch are considered; records posted later than the as-of date and
  payments already voided at the cutoff do not contaminate earlier/clean
  periods. Matching legacy lowercase currency codes continue to be
  counted. Historical bytes, audit dates, posting state and settlement
  records are untouched; no automatic FX.
- Six new synthetic tests on the existing #1059 financial test file
  cover wrong-currency reports, future payment cutoffs, historical
  cancellations, colliding IDs from another company/branch, blocking
  another settlement atop a wrong-currency payment and matching lowercase
  currency. Exact-head CI `5a4f827525d5396ecb62f1b38b102063bdb286a6`:
  [settlement parity #40122799577](https://github.com/allidamech-bot/INVOICE/actions/runs/40122799577),
  [closed period #40122799572](https://github.com/allidamech-bot/INVOICE/actions/runs/40122799572),
  [Vercel trace #40122799580](https://github.com/allidamech-bot/INVOICE/actions/runs/40122799580),
  [account statement print #40122799554](https://github.com/allidamech-bot/INVOICE/actions/runs/40122799554)
  all successful. Repository CI launched its own standard browser/PDF
  fixture; no user session/browser automation was initiated separately.
- This is further hardening, **not** a new original checklist item
  or live reconciliation certification. Original item 10 remains already
  accepted for its bounded output tests; real account and physical
  iPhone acceptance remain separate. No AI files or production release.

## Original numbering: preserved without invented missing wording

“Accepted evidence” below describes its bounded tested path, not universal
production certification. An unavailable original sentence is not a new bug.

| Original item | Known requirement / evidence | Current tracking state |
|---|---|---|
| 1 | Saved customer payment receipt; #942/#982 and saved-cycle evidence | Accepted automated path; real-device coverage separate |
| 2 | Saved supplier payment voucher; #942/#982 and saved-cycle evidence | Accepted automated path; historical issuer policy must not be fabricated |
| 3 | Final purchase order output; #935/#992 | Accepted bounded browser/PDF cases |
| 4 | Posted-purchase document output | Deferred: no live independent print route established; old draft branch remains untouched pending explicit reopening |
| 5 | Inventory movement report output, references and quantities | Implemented and accepted in #1015: 12 Chromium/WebKit cases, 4 native Chromium PDFs, 3/40/205 movements, filters/account guard/no writes; physical iPhone separate |
| 6 | Management financial report final output | Performance report path accepted in #1002; #1043 guards stale native print after leaving Performance and passes focused Chromium/WebKit regression. #1054 cancels prints queued before account, data or filter changes. No claim that every report view or physical-device path is covered |
| 7 | Tax report final output matching filters and figures | Accepted bounded CSV/PDF cases in #1004; #1044 adds safe print-timer cancellation on report navigation and tests ordinary printing after return; #1054 guards delayed print against account, data and filter changes |
| 8 | Treasury reconciliation output, opening/movement/closing/status | Implemented and accepted in #1011; #1057 now refuses mixed-currency historical ledger entries that would contaminate a displayed account balance; physical device/deployed acceptance separate |
| 9 | Customer statement | Agreed output cases closed in #910; do not repeat. Follow-up #1046 closes newly identified delayed-print race after modal/account navigation (separate from original acceptance) |
| 10 | Supplier statement | Agreed output cases closed in #910; do not repeat. #1060 rejects hidden mismatched-currency active historical supplier settlements while preserving scoped/as-of results. #1059 adds fail-closed protection against malformed historical supplier settlements in payable and statement projections. Follow-up #1046 closes newly identified delayed-print race after modal/account navigation (separate from original acceptance) |
| 11 | Long names/descriptions in outputs not yet covered | Partial: long issued invoice/PO renderer outputs #1016/#1032/#1034 and short statement extremes #1036 accepted; #1039 adds Chromium actual App print entry for 40 lines only. Other fixed report references, physical iPhone/real deployed access remain separate; #1041 resolves synthetic App WebKit boot and passes four WebKit App print cases; #1042 adds real treasury report's extreme names/references/notes, 390px mobile filter reachability, CSV and Chromium PDF; #1056 adds bounded extreme bilingual names/references and 205-row CSV export acceptance for management/VAT (not native PDF or full UI) |
| 12 | Templates not covered by recent acceptance | Partial: registered 18-template EN/AR/bilingual renderer coverage accepted #994/#992/#1016/#1032/#1034; #1039 validates Obsidian invoice and Minimal PO through Chromium App printing; #1041 adds WebKit App entry for both in EN/AR. Do not claim all templates through App, native WebKit PDF, or physical Safari acceptance |
| 13 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 14 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 15 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 16 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 17 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 18 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 19 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 20 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 21 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 22 | Inventory valuation/cost with differing purchase prices | Partial: #1038 tested distinct landed cost receipt history, issue snapshots, currencies and negative-stock blocking; no FIFO/weighted-average valuation or reconciled inventory COGS policy accepted (see docs/FINANCE_INVENTORY_COST_EVIDENCE_20261024.md) |
| 23 | Accounting policy group; exact individual sentence unavailable | No individual closure asserted |
| 24 | Accounting policy group; exact individual sentence unavailable | No individual closure asserted |
| 25 | Accounting policy group; exact individual sentence unavailable | No individual closure asserted |
| 26 | Accounting policy group; exact individual sentence unavailable | No individual closure asserted |
| 27 | Explicit credit-note VAT policy | Agreed handling completed in #917; no historical migration |
| 28 | Accounting policy group; exact individual sentence unavailable | No individual closure asserted |
| 29 | Draft-deletion audit | Accepted direct-delete/persist/storage continuity evidence, including #955/#985/#990/#1000; do not generalize to unspecified paths |
| 30 | Remaining physical iPhone verification | Open; exact complete original acceptance wording unavailable |
| 31 | iPhone group; exact individual sentence unavailable | Preserve owner-reported tested-path success; broader acceptance not inferred |
| 32 | iPhone group; exact individual sentence unavailable | Preserve owner-reported tested-path success; broader acceptance not inferred |
| 33 | iPhone group; exact individual sentence unavailable | Preserve owner-reported tested-path success; broader acceptance not inferred |
| 34 | Release/production group; exact individual sentence unavailable | No individual closure asserted |
| 35 | Release/production group; exact individual sentence unavailable | No individual closure asserted |
| 36 | Release/production group; exact individual sentence unavailable | No individual closure asserted |
| 37 | Release/production group; exact individual sentence unavailable | No individual closure asserted |
| 38 | Release/production group; exact individual sentence unavailable | No individual closure asserted |
| 39 | Release/production group; exact individual sentence unavailable | No individual closure asserted |
| 40 | Release/production group; exact individual sentence unavailable | No individual closure asserted |

## Acceptance boundaries that must not disappear from the register

- Physical iPhone Safari/PWA printing, saving and sharing still need scoped
  evidence. Linux WebKit is not a physical iPhone result.
- Closed periods have extensive local/emulator and browser evidence; isolated
  deployed acceptance has not been run. No preview or production activation
  is authorized by this register.
- TemplateRenderer acceptance does not prove all App.requestPrint entry points.
- Business documentEvents and server periodOperations are distinct. Reading a
  report archive from backup does not restore server locking authority.
- New historical supplier issuer snapshots require a product decision; do not
  invent old identity data or perform a backfill.

## What is needed for an exact remaining count

The complete original forty-item message is still missing. The older
`CONTINUATION_EVIDENCE_2026-10-21.md`, both Library handoff/audit documents,
and repeated conversation retrieval do not supply its complete sentences.
A retrieval response claiming text exists without actually returning it is
not accepted as evidence. The older 42-scenario inventory is a different list.

Obtain the original message, preserve its numbers and wording, then attach
merged/tested evidence and classify every row as accepted, partial, open or
explicitly deferred. Only then publish the binary remaining total. Do not use
the old “37 remaining”, subtract PR counts, or manufacture a new total by
grouping unknown work into broad headings.

Owner authorized original item 5 after reviewing this register. It is now
merged in #1015 at `d2f5c77a469939c81ecec6629c4663b90bec71be`, tested head
`0aa136a49cee1cfb97e5c115bce264d09d58caef`: all nine checks across six
workflows passed, including 3867 Node tests. No deployment occurred.

On 24 October 2026, #1016 merged on `main` at
`b74579adaf56e66fb5e46a8802a7e70d370e24fe`, after its exact-head
four-shard long-invoice workflow and prior financial document workflow completed
successfully (five jobs; no new test run needed at merge). #1016 changes only
financial test/coverage files, not AI, production accounting or storage.
On 24 October 2026, [#1032](https://github.com/allidamech-bot/INVOICE/pull/1032)
merged on `main` at `60549a30c4a3f58c19df2cb17a03f2a561eca4da`.
Its exact-head, four-shard PO workflow passed: sixteen additional long PO
templates, 192 browser cases and 96 native Chromium PDFs. The original two
Obsidian/Executive PO templates were already covered in #992. This establishes
bounded automated long invoice and long PO coverage across all eighteen
registered templates, not live-device or complete item-11/12 acceptance.
On 24 October 2026, [#1034](https://github.com/allidamech-bot/INVOICE/pull/1034)
merged at `5d46fe1eef22d30c2a261ad3e138fbb6632b17a9` after its four
bilingual financial-output CI shards passed on exact head
`de154978d12457928707dd29362ce035117a422e`: 72 Chromium/WebKit
browser scenarios and 36 native PDFs across 18 registered templates,
for final invoices and purchase orders with 40 long bilingual items.
The test's PDF Arabic presentation-form normalization was corrected; no
production document implementation, AI, accounting or storage files changed.
On 24 October 2026, concurrent financial [#1036](https://github.com/allidamech-bot/INVOICE/pull/1036)
merged as `7b069f29818132f0c47322dfc221b2fa620e3252` with its focused
statement print and prior regression workflows successful at exact head
`8078de484cf615c3545bc284038019a5bf6a04ee`. Scope: long identity and
reference fields for short synthetic customer/supplier statements through
real UI print; 40/100 row-volume scenarios were previously tested only with
ordinary names and must not be represented as combined extreme proof.
Overlapping branch PR #1037 was closed unmerged on 24 October: it changed
the same QA fixtures and would duplicate #1036; no original task is added or
closed by #1037.
Next: other fixed reports' long-name/reference coverage; actual application
commercial-document print entry; physical iPhone Safari/PWA. Item 4 deferred. Item 4 remains explicitly deferred. This update
does not invent an exact remaining total or close missing original wording.

On 24 October 2026, #1034 merged at `5d46fe1eef22d30c2a261ad3e138fbb6632b17a9` after four green CI shards on exact head `de154978d12457928707dd29362ce035117a422e`. No production or AI code changed. The long bilingual acceptance covers 18 templates across invoice/purchase order, 72 browser cases and 36 native PDFs. Items 11/12 remain **partial** because fixed-report extreme text, actual app entry flows, iPhone, and other applicable financial types are not accepted by the renderer-only tests.

On 24 October 2026, #1036 merged at `7b069f29818132f0c47322dfc221b2fa620e3252` after two exact-head workflows passed: dedicated long account statement names/references in actual receipt/payment statement modal-to-PDF routes, and existing short/long statement regression. Two opt-in synthetic fixture scenarios and the test runner/workflow only; no production, AI or actual customer records changed. Original item 11 remains partial because further reports and physical-device/App printing are separate.

On 24 October 2026, [#1038](https://github.com/allidamech-bot/INVOICE/pull/1038) merged at `43f4cada73a03cd8e7704bf1c8f4aaf2f8fd7465` after its exact-head focused workflow passed (3/3 synthetic tests plus typecheck/build). It characterizes historical landed-cost receipt snapshots, final-invoice single stock issue, no oversell and currency provenance. No AI or production logic changed; original item 22 remains partial until explicit costing-method/FX/COGS policy is approved. Do not infer an accounting valuation engine from these tests.

On 24 October 2026, [#1039](https://github.com/allidamech-bot/INVOICE/pull/1039) merged at `5c86ebb8d053909dfaba19a000f59a581342b8a5`; exact-head CI passed on `a4c5db03a09f9075f023df07b7528c8e06111f6b`. The test exercises the actual App.requestPrint function in a synthetic saved-final long invoice and purchase order (2 kinds × 2 languages; four Chromium cases and four native A4 PDFs, seven pages each), no lost/duplicate 40 lines, amount 440.00 preserved. An attempted WebKit expansion failed to bootstrap the standalone test fixture following an HTTP 404; this **does not** prove production Safari failure or success. Scope was transparently limited to Chromium. Physical iPhone Safari/PWA, deployed account and additional real App print entry paths remain unaccepted. No AI, accounting core, App production code, data or deployment changed.

## Alif finance reconciliation supplement — 26 October 2026

This appendix records **Alif Plan execution**, not the unrecovered
literal original forty-item list. Do not manufacture a precise remaining
count by subtracting PRs or by closing broadly named axes.
Last verified GitHub main on 2026-10-26:
`6054a13c8007dec7f5c5234a8460b15d68babcc0`.
The new change after `7536bece` was AI-only; no financial source or financial
CI file changed. No finance PR merge or Vercel release is reported.

### PR-head CI evidence — not post-merge acceptance

| Axis | PR | Last checked workflow result | State |
| --- | --- | --- | --- |
| 24 FX validation and history | [#1075](https://github.com/allidamech-bot/INVOICE/pull/1075) | PASS | Open, unmerged |
| 25 Istanbul date/rounding | [#1076](https://github.com/allidamech-bot/INVOICE/pull/1076) | PASS | Open, unmerged |
| 26/27 VAT and credit note | [#1077](https://github.com/allidamech-bot/INVOICE/pull/1077) | PASS | Open, unmerged |
| 28 draft ledger neutrality | [#1074](https://github.com/allidamech-bot/INVOICE/pull/1074) | PASS after fixing synthetic postedAt cutoff; a prior run failed two cases | Open, unmerged |
| 30 WebKit restore / VAT output | [#1079](https://github.com/allidamech-bot/INVOICE/pull/1079) | PASS | Open, unmerged |
| 31 PDF reopen and share | [#1080](https://github.com/allidamech-bot/INVOICE/pull/1080) | PASS | Open, unmerged |
| 32 editor keyboard autosave / reload | [#1097](https://github.com/allidamech-bot/INVOICE/pull/1097) | PASS | Draft, unmerged |
| 33 long PDF RTL/LTR | [#1086](https://github.com/allidamech-bot/INVOICE/pull/1086) | PASS | Open, unmerged |
| 35-A honest cloud privacy disclosure | [#1073](https://github.com/allidamech-bot/INVOICE/pull/1073) | PASS | Open, unmerged |

Six originally overlapping PRs (#1073/#1074/#1075/#1076/#1077/#1079)
were changed on their own branches so they no longer modify the common
`.github/workflows/financial-document-browser-qa.yml`. Their coverage
is retained in focused workflows; #1079 extends the existing restore
CI and includes the VAT iPhone simulator without duplicate browser jobs.

Axis 32 original PRs [#1084](https://github.com/allidamech-bot/INVOICE/pull/1084)
and [#1085](https://github.com/allidamech-bot/INVOICE/pull/1085)
are CLOSED UNMERGED, superseded by #1097. Verified original test
runner sources equal the #1097 equivalents except for separate result
filenames; the persistence fixture is byte-identical. No original tests
or branches were deleted.

### Still open — important limits

- **Cash/bank acceptance:** voucher generators and ledger write checks
  were read-reviewed, but a coherent signed-in QA scenario linking receipt,
  AR balance, supplier payable, payment void and allocated cash/bank entry
  is not yet proven in an isolated test account.
- **iPhone acceptance:** Chromium/WebKit CI is simulated and cannot substitute
  for physical iPhone Safari/PWA, keyboard, print/share, and authenticated
  cloud persistence checks.
- **35-B/35-C privacy:** checked-in `firestore.rules` describes owner/UID
  access restrictions, but the rules actually deployed to Firebase were not
  retrieved or verified. Cross-UID authenticated denial testing is outstanding.
  Plain workspace Base64 is not end-to-end encryption.
- **B/C-22 costing:** cost-of-goods-sold inventory valuation and FX
  conversion policy require an explicit accounting decision, not an
  automatic speculative migration.
- **Deployment provenance:** current Vercel production SHA was not
  independently obtained through the available API response. Do not
  claim production/main equality without actual deployment evidence.
- **Integration gate:** successful PR-head CI does not prove the
  combined post-merge state. None of the listed finance PRs was merged.

### Proposed controlled acceptance sequence

Read the latest main SHA before each operation. Subject to explicit
merge/release approval, review and integrate one finance PR at a time;
re-evaluate mergeability and focused CI on the resulting main, avoiding
reruns of unchanged passing suites. Keep #1097 Draft until acceptance.
Do not modify LOUREX AI, production Firestore records, live inventory
or account balances through this audit. Resolve 35-B/C, cash/bank QA
and physical-iPhone acceptance separately before production sign-off.

### 26 October addendum — voucher and treasury synthetic QA #1099

- New [PR #1099](https://github.com/allidamech-bot/INVOICE/pull/1099)
  was created from main `6054a13c8007dec7f5c5234a8460b15d68babcc0`
  as a **test-only Draft**. Exact HEAD:
  `66234ced0cc720d14b7b564f30570ca65d93fb19`.
- Focused GitHub Actions run `40346118499`, "Finance voucher and treasury
  reconciliation (Alif QA)", **completed successfully** (typecheck, build,
  five direct in-memory financial tests).
- Scenario: final USD 200 invoice + USD 50 customer collection => AR 150;
  posted USD 120 supplier purchase + USD 30 disbursement => AP 90.
  Beginning cash/bank balance 100; receipts/payments initially remain
  **unallocated**; explicit ledger links change the bank balance to
  100 + 50 - 30 = 120. Once allocated, source appears only once; duplicate
  allocation, amount/currency mismatch, cross-branch posting and voided
  supplier payment linking are rejected. Voiding a treasury link restores
  the unallocated row without changing the original AR/AP settlement.
- Invoice and supplier payment vouchers match their persisted payments.
  Read-only statement/report calculations and no mutation of the fixture
  source records are asserted.
- **Important limits:** this is synthetic in-memory execution of actual
  compiled accounting modules, **not** an authenticated QA-account session,
  Firestore write/rule deployment verification, end-user iPhone Safari,
  post-merge integration or production acceptance. The account-isolated
  cash/bank workflow remains open, and the PR is unmerged. Do not count
  the five tests as five original Alif items.

### 26 October 2026 — Firebase security evidence and 35-B/35-C split

**No Firebase production configuration, Firestore data, secrets, account or deployment
was modified in this audit.** Treat the following as three different evidence classes:

1. **Source policy review (2026-10-26).** Checked-in `firestore.rules`
   restricts `/users/{userId}/{document=**}` reads to the same
   non-anonymous authenticated UID; own-account writes require
   `ownBusinessAccount(userId) && trustedWorkspaceWriter()`; restricted
   roles and wrong workspace-UID claims cannot write the plaintext workspace.
   The public token path has a different, limited and expiring sharing policy.
   File review alone does not prove the published Firestore release.
2. **Local emulator — verified historical CI on 2026-10-21.** Exact
   GitHub Actions run [39583972138](https://github.com/allidamech-bot/INVOICE/actions/runs/39583972138)
   passed both the real Firestore rules emulator checks and real browser
   Auth/Firestore emulator exercise. Browser C signed in as a **different UID**
   and confirmed cross-account reads/writes were denied and local IndexedDB
   data isolated. The [2026-10-20 security gate run 39468709567](https://github.com/allidamech-bot/INVOICE/actions/runs/39468709567)
   also passed. This supports **35-C for local emulation only**, not
   authenticated access control against the current live Firebase release.
3. **Production unsigned, read-only guard — verified historical CI on
   2026-10-17.** [Run 39077268472](https://github.com/allidamech-bot/INVOICE/actions/runs/39077268472)
   logged three Firestore `permission-denied` results for anonymous
   `workspace/meta`, `workspaceHistory`, and `assistantHistory`
   probes against synthetic random UID paths through the deployed application
   SDK. This proves only anonymous denial **at that time**, not matching
   complete current source rules, owner read/write success, or different
   authenticated-account denial.

**35-B remains OPEN:** actual deployed Firestore rules content, publication
revision/date, and source/deployment parity have not been retrieved via an
authorized Firebase console or API session. Do not substitute source code,
local emulator passes or old anonymous-denial results for that evidence.

**35-C split:** historical local two-user Auth/Firestore emulator isolation
is established; current real authenticated cross-UID denial and independent
owner access through the deployed project remain unaccepted. No real customer
identity, owner account or live workspace should be accessed for tests without
separate controlled approval and an isolated QA setup.

**Existing-test reuse / credit discipline:** reuse
`tests/firebase-firestore-rules-emulator.integration.mjs`,
`scripts/qa-cloud-auth-emulator-browser.mjs` and
`.github/workflows/invoice-cloud-security-gate.yml`, rather than creating
duplicate cross-UID coverage. There is an **emulator project ID naming
inconsistency** to reconcile in a future targeted QA patch: the CI CLI uses
`demo-lourex-pinless` but the raw Firestore test's REST/JWT path uses
`demo-lourex-ai-integration-719`. Both existing test workflows passed;
the discrepancy does not prove a production vulnerability. Align the
IDs/guards before relying on a new exact-project emulator gate.
Do not rerun broad suites solely to rediscover previous pass results.

TinyFish's existing Google browser profile could not be used with the
requested low-step execution cap on this account; it requires a beta
feature. A default uncapped metered run was **not** started to avoid
unbounded wallet use. This is an access/tooling block, not evidence about
Firebase deployment state.

### 26 October 2026 — exact-project Firestore emulator security gate #1102

- Created **[PR #1102](https://github.com/allidamech-bot/INVOICE/pull/1102)**,
  Draft, on main `9e02f54f5e381e12a75bceee03071d306ae0cd71`.
  Exact tested HEAD: `a79501d1af43d3fc7ca556f9bbea5267bb91dc74`.
- Scope: **one test file only**,
  `tests/firebase-firestore-rules-emulator.integration.mjs`.
  Its hard-coded Firestore REST/JWT project previously used
  `demo-lourex-ai-integration-719`, different from the
  `--project demo-lourex-pinless` used by the existing GitHub CI.
  The test now uses `demo-lourex-pinless`, requires
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, and checks
  `GCLOUD_PROJECT` if set. No rules or product runtime were changed.
- GitHub Actions run
  **[40372970245](https://github.com/allidamech-bot/INVOICE/actions/runs/40372970245)**
  completed **SUCCESS** at the exact commit. Existing cloud security gate:
  TypeScript/build, company/branch/operator access controls, cloud revision
  and two-device boundaries, financial backup/inventory integrity,
  real local Firestore rules isolation, and browser Auth/Firestore
  cross-account read/write denial all passed.
- This removes a confusing local emulator project-name mismatch and
  verifies existing defenses against the intended local demo namespace;
  it does **not** establish a production security vulnerability was
  previously present. Previous emulator tests had also passed.
- **35-B is still OPEN:** no copy/version/timestamp of deployed Firebase
  rules was obtained or diffed with `firestore.rules`.
  Authenticated cross-UID tests are proven only on local emulators; a
  controlled, separate real-service QA account test is outstanding.
  No live project credentials were used, no customer data accessed, no
  production Firebase or Vercel change and no merge performed.

### 26 October 2026 — treasury movement KPI separation, PR #1103

- **Observed source discrepancy:** `TreasuryLedgerPage` computes bank/cash
  account cards from explicit `treasuryEntries`, but the same screen's
  inflow/outflow/movement-net KPIs passed `treasuryProjection` rows to
  `treasuryTotals` without excluding unallocated customer receipts,
  supplier disbursements, or expenses. This overstates *ledger movement
  KPIs*, although the actual bank/cash account balances were unaffected.
- **[PR #1103](https://github.com/allidamech-bot/INVOICE/pull/1103)**
  is **Draft, unmerged**, based on
  `9e02f54f5e381e12a75bceee03071d306ae0cd71`. It filters
  `treasuryTotals` to account-linked rows only, preserving unallocated
  entries in the separate queue, excluding opening balances from movement
  net, and keeping internal transfers distinct from inflows/outflows.
- Synthetic before/after contract:
  Bank opening USD 100; USD 50 unallocated customer receipt,
  USD 30 unallocated supplier payment and USD 7 unallocated expense
  produce **zero** actual ledger movement. After allocating the receipt
  and supplier payment, bank balance = USD 120 and net ledger movement =
  USD +20. Voiding a linked receipt returns that payment to the
  unallocated queue without counting the voided entry as cash movement.
- The focused exact-head KPI CI workflow
  [40374075544](https://github.com/allidamech-bot/INVOICE/actions/runs/40374075544)
  **PASSED**, and the repo's automatic wider accounting, treasury output,
  and isolated Vercel tracing workflows were also queued on the same PR
  head. Their outcomes must be checked before release sign-off.
- This changes only finance display aggregation, **not** creation, storage,
  allocation, voiding, payment amounts, AR/AP, exchange rates, or
  production data. No merge or deployment authorized.
- Main advanced independently to `dea51b63e90f2934a878cae9a8fc5c6c6acf1ee4`
  through AI-only changed paths while this PR's workflows were running.
  That update does not itself prove combined merge acceptance.
