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

All seven PRs below were directly rechecked as merged. These are delivered
rounds, not seven invented original checklist items.

| PR | Delivered behavior/evidence | Merge SHA |
|---|---|---|
| [998](https://github.com/allidamech-bot/INVOICE/pull/998) | Real browser IndexedDB backup/restore, CAS, account change and protected-data rejection | `c287f416eb03546ed64a5dc0d3bb1c461a7c247b` |
| [999](https://github.com/allidamech-bot/INVOICE/pull/999) | Restore archive transaction abort and two-tab CAS continuity | `d8911584408c33899735bb928e4460c8c39b1c50` |
| [1000](https://github.com/allidamech-bot/INVOICE/pull/1000) | Actual App.persist with real IndexedDB; audit survives reload/backup/restore without false successful saves | `7cddc53538a485ba400d21616d7bcd1d93912c48` |
| [1002](https://github.com/allidamech-bot/INVOICE/pull/1002) | Management performance report no longer prints a blank PDF inside the real shell | `7b8505579bec30303a7896da6d5b5a4bbdb1f098` |
| [1004](https://github.com/allidamech-bot/INVOICE/pull/1004) | Tax report print visibility and actual UI/CSV/PDF parity | `66a18f68c5ed6e7bf4847c2f2a8676b4dabbb8fb` |
| [1011](https://github.com/allidamech-bot/INVOICE/pull/1011) | Read-only treasury period report with per-account opening/closing, late void effects, separate unallocated movements, CSV/PDF | `b5adea05eaceb446cf07d2b04afeac7c56ae26e8` |
| [1013](https://github.com/allidamech-bot/INVOICE/pull/1013) | Real stock transfers correctly labelled separately from adjustments in history and filters | `3f76d5330badd7bbe99d1590f3f3da25686e1548` |

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
| 5 | Inventory movement report output, references and quantities | Open: no print/export route found in the live movement screen; #1013 fixes a type label only |
| 6 | Management financial report final output | Performance report path accepted in #1002; no claim that every report view is covered |
| 7 | Tax report final output matching filters and figures | Accepted bounded CSV/PDF cases in #1004 |
| 8 | Treasury reconciliation output, opening/movement/closing/status | Implemented and accepted in #1011; physical device/deployed acceptance separate |
| 9 | Customer statement | Agreed cases closed in #910; do not repeat |
| 10 | Supplier statement | Agreed cases closed in #910; do not repeat |
| 11 | Long names/descriptions in outputs not yet covered | Partial: #982/#992/#994 and later report acceptance do not prove all remaining outputs |
| 12 | Templates not covered by recent acceptance | Partial: full required template/output matrix is not finalized |
| 13 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 14 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 15 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 16 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 17 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 18 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 19 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 20 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 21 | Closed-period group; exact individual sentence unavailable | Group implemented/tested; individual final mapping unresolved |
| 22 | Inventory valuation/cost with differing purchase prices | Preliminary policy review inherited; individual final acceptance not established here |
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

Next product task already identified from known wording: item 5, inventory
movement final output. It remains unstarted as an output feature. No new
application implementation is part of this register-only round.
