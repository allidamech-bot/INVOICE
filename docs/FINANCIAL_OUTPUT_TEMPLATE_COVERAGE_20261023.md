# Financial output and template coverage — original items 11 and 12

Baseline: main `d2f5c77a469939c81ecec6629c4663b90bec71be`.
Scope: financial output outside AI conversations. No production acceptance,
physical iPhone result or complete forty-item closure is inferred here.

## What the existing evidence actually covers

| Output | Existing bounded evidence | Important boundary |
|---|---|---|
| Customer receipt / supplier payment voucher | #982; `run-payment-voucher-long-print.cjs`: 100 note lines, long names/references, English/Arabic, three logo shapes, both engines, native Chromium PDFs | Fixed voucher layout, not 18 selectable commercial templates |
| Purchase order | #992; `run-purchase-order-final-print.cjs`: short and 40-line long descriptions, English/Arabic, long mode three logo shapes; Obsidian/Executive | #1032 accepted the remaining sixteen registered templates with dedicated 40-line browser/native-PDF cases; actual app-entry and device journeys remain separate |
| Invoice | #994; same runner with `--long --invoice`, actual customerSnapshot; 40 long descriptions, English/Arabic, three logo shapes, Obsidian/Executive | #1016 accepted the other sixteen templates; bilingual and actual App.requestPrint are separate |
| Customer statement | #910 and `run-customer-statement-print.cjs`: 1/40 invoices plus partial receipt | Many rows do not prove every long name or reference scenario |
| Supplier statement | #910 and `run-supplier-statement-print.cjs`: 1/100 purchases plus partial payment | Fixed statement layout, not the commercial template selector |
| Management performance report | #1002; 40 customers, currencies/search, browser and native PDF | Does not establish every ReportsPage report or arbitrary long customer names |
| Tax register | #1004; invoice/credit-note filters, UI/CSV/PDF parity | A credit note in the register is not acceptance of the credit-note document itself |
| Treasury period report | #1011; opening/change/closing/status, unallocated rows, CSV/PDF | No claim about physical bank verification or production/iPhone |
| Inventory movement report | #1015; 3/40/205 movements, full notes/references, existing filters, both engines; native PDFs at 3/40 | Fixed report; 205 is browser membership/completeness evidence, not a 205-row native PDF case |
| Posted-purchase document | Original item 4 remains deferred | Old draft branch is untouched; no new print path authorized in this round |

## The 18-template distinction

The actual registry is `src/templates/TemplateThumbnails.tsx`. Existing
`run-quotation-template-design.cjs` defines all eighteen templates with
English/Arabic/bilingual, 4-line showcase and 24-line stress cases, logo/name,
contrast, typography and exported quotation-PDF checks. Its fixture is a
`proforma`, not an invoice or purchase order. This is existing source-defined
coverage; those expensive suites were not rerun for this inventory.

| Registered ID | Existing general quotation design suite | Dedicated long invoice | Dedicated long purchase order |
|---|---|---|---|
| executive | Defined | #994 | #992 |
| minimal | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| trade | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| signature | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| obsidian | Defined | #994 | #992 |
| cobalt | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| editorial | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| split | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| prism | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| slate | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| horizon | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| mono | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| aurora | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| ledger | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| noir | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| midnight | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| blackivory | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |
| carbon | Defined | #1016 merged, four-shard CI passed | #1032 merged, four-shard CI passed |

#1016 and #1032 are merged; the respective exact-head, four-shard CI successes
are the automated long-invoice and long-purchase-order execution evidence.
The table never treats merely having a test as proof of a successful run. The old two-template suite remains a regression
check because the shared fixture/runner changes; it is not counted as new work.

## This bounded round

The new CI matrix selects the sixteen missing invoice templates in four groups.
For each: 40 long item descriptions, English/Arabic, wide/tall/square logos,
Chromium/WebKit; 192 browser cases and 96 native Chromium PDFs in total.
Existing assertions retain exact total 440.00, correct customer/issuer, exact
line identity, full English text and per-item Arabic glyph inventory across
continuation cells, PDF page parity/no blanks, contained logos and no source
mutation. Both the saved template ID and every rendered page's template class
must match the requested template. Unknown or duplicate CLI IDs are rejected.

The fixture previously mapped every non-Executive request to Obsidian. A RED
run selecting Minimal proved the mismatch; that test-only restriction is now
removed using the application's existing template resolver. Production source,
AI files, App.tsx, vault merge, storage, packages and deployment are unchanged.

## What remains after this bounded acceptance

- Bilingual long financial-document native output, separately from existing
  general bilingual quotation design coverage.
- Long-name/reference cases in fixed reports/statements where the scripts
  currently demonstrate row volume rather than those exact text extremes.
- Actual application print-entry journeys outside the isolated renderer and
  physical iPhone Safari/PWA printing/saving/sharing.
- Final acceptance mapping for other commercial kinds/credit-note documents
  requires a documented user-facing path and its own evidence. The type union
  alone does not establish that a feature is required, missing, or accepted.

Items 11 and 12 remain partial. These are concrete coverage boundaries, not
newly invented original tasks or an exact remaining count for the forty items.


## 24 October follow-on: purchase-order matrix (CI passed and merged)

[PR #1016](https://github.com/allidamech-bot/INVOICE/pull/1016) was merged
at `b74579adaf56e66fb5e46a8802a7e70d370e24fe`. Its four groups and
existing native financial document regression completed successfully on the
exact PR head. This establishes automated **long invoice** coverage for all
18 registered templates (two previously and sixteen from #1016); it does not
establish live iPhone or app-entry printing.

[PR #1032](https://github.com/allidamech-bot/INVOICE/pull/1032) added
`.github/workflows/long-purchase-order-template-coverage.yml` to run the
**existing** `--long` purchase-order test route (without `--invoice`) on
the sixteen missing template IDs in four disjoint groups. Each group checks
40 item descriptions, English/Arabic, three logo aspect ratios, both Chromium
and WebKit, and native Chromium PDFs: confirmed matrix **192 browser cases and
96 PDFs**. It reuses existing exact-grand-total, page/description continuity,
PDF item uniqueness, per-template page class, supplier identity in English
PDFs, logo containment and source immutability assertions. No production,
AI, accounting policy or storage code is altered; no unrelated passed suite
is deliberately rerun in these shards.

**Acceptance status: exact-head CI success, four of four shards; merged on main**
at `60549a30c4a3f58c19df2cb17a03f2a561eca4da`. This closes only the
sixteen-template dedicated long purchase-order gap; the
bilingual long-document, fixed-report text extremes, real App print journeys,
physical iPhone and deferred original item 4 remain separate.
