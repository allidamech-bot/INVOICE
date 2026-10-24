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

All fourteen PRs below were directly rechecked as merged. These are delivered
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
| [1034](https://github.com/allidamech-bot/INVOICE/pull/1034) | Items 11/12: 40-line English/Arabic simultaneous bilingual long invoice and purchase order output over all 18 registered templates; four CI shards passed, 72 browser cases, 36 native PDF cases | `5d46fe1eef22d30c2a261ad3e138fbb6632b17a9` |
| [1036](https://github.com/allidamech-bot/INVOICE/pull/1036) | Item 11: account statement customer/supplier names and posted/payment references with extreme synthetic text; real statement print entry, English/Arabic, Chromium/WebKit, native PDFs plus original statement regression both passed | `7b069f29818132f0c47322dfc221b2fa620e3252` |

Earlier merged financial repairs and acceptance remain delivered as recorded
in the supplied handoff: #942–944, #954–955, #959–960, #966, #968, #976,
#978–979, #982, #984–985, #990, #992, #994–995. Do not restart them.

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
| 6 | Management financial report final output | Performance report path accepted in #1002; no claim that every report view is covered |
| 7 | Tax report final output matching filters and figures | Accepted bounded CSV/PDF cases in #1004 |
| 8 | Treasury reconciliation output, opening/movement/closing/status | Implemented and accepted in #1011; physical device/deployed acceptance separate |
| 9 | Customer statement | Agreed cases closed in #910; do not repeat |
| 10 | Supplier statement | Agreed cases closed in #910; do not repeat |
| 11 | Long names/descriptions in outputs not yet covered | Partial: long issued invoice/PO renderer outputs #1016/#1032/#1034 and short statement extremes #1036 accepted; #1039 adds Chromium actual App print entry for 40 lines only. Other fixed report references, WebKit/iPhone/real deployed access remain separate |
| 12 | Templates not covered by recent acceptance | Partial: registered 18-template EN/AR/bilingual renderer coverage accepted #994/#992/#1016/#1032/#1034; #1039 validates Obsidian invoice and Minimal PO through Chromium App printing only. Do not claim all templates through App or physical Safari acceptance |
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
