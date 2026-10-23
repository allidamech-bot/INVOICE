# Output VAT final-file acceptance — 23 October 2026

Baseline: main `7b8505579bec30303a7896da6d5b5a4bbdb1f098`.
This addresses original checklist item 7's final-output/filter parity for the
existing Output VAT center. It does not add Input VAT or certify statutory filing.

## Confirmed print failure

The real ReportsPage Tax / VAT tab exports CSV, but its print view has no visible
box in the current AppShell. Global invoice print CSS hides `.app-ui`, while
TaxVatCenter remains inside it. Its print selectors also reference the retired
`.ta-shell-main`; the live shell uses `.ta-main`. No financial algorithm defect
was demonstrated by this reproduction.

Only `src/styles/tax-vat-batch10.css` changes application behavior: correct that
print-only selector and restore the real report ancestor chain under
`body.printing-tax-vat-report`. Use a named A4 page, exclude shell/filter controls,
constrain the logo and allow the tax summaries/rate/register tables to paginate
inside the print width. Screen styling, CSV implementation and financial policy
remain unchanged.

## Synthetic acceptance data

Forty invoices, twenty per USD/EUR currency. Per currency, ten invoices at 10%
and ten at 20%, each with a 100.00 taxable base. One explicitly taxable linked
credit per currency has -50.00 base, -5.00 VAT and -55.00 total. Independent
expected summary per currency: taxable 1,950.00, invoice VAT 300.00, credit VAT
-5.00 and net Output VAT 295.00. The 10% rate row is 950.00 / 95.00; the 20% row
is 1,000.00 / 200.00. Draft, voided and future invoices must remain excluded.

`tests/visual/tax-vat-final-output.html` renders the real ReportsPage and AppShell,
including App's nested `.main-content`. Tests use actual UI dates/currency, CSV
download and Print / Save PDF buttons. No real account or customer is involved.

`node tests/visual/run-tax-vat-final-output.cjs` covers English/Arabic and all/USD/
empty-period states on Chromium/WebKit: twelve combinations, twelve actual CSVs,
and six Chromium-native PDFs. Every exported record is matched to independent
expected amounts, date, type, currency and rate, and the visible register. CSV
checks retain BOM, quoted commas/quotes, formula protection and negative numbers.
PDF checks retain each reference once, dates, currency and known totals, no blank
pages or shell sentinel, and the explicit Input VAT exclusion. Source documents
must remain unchanged and afterprint must clear print mode.

Arabic PDF.js output can reorder presentation glyphs differently by installed
font. The test isolates the footer's PDF region using its unique LOUREX baseline,
then compares its complete normalized Arabic character inventory with the actual
rendered footer. The failed CI artifact retained all 103 expected Arabic characters
exactly; the former partial-phrase extraction assertion was too narrow. English
footer text is compared completely. Negative totals retain the explicit minus in
either extracted RTL or LTR order, and CSV values remain exact signed decimals.
These extraction accommodations do not change rendered output or accounting.

## Evidence and limits

Local build and eighteen focused Node tests passed. Six Chromium combinations,
six CSVs and six native PDFs passed. Returning only the tax stylesheet in the
built bundle to its baseline makes the new test fail at the real-print-box
assertion, after its CSV checks pass; the corrected bundle was restored. Long
English/Arabic report pages were visually reviewed. CI must pass the twelve
cases plus the existing tax mobile-screen browser suite before merge.

Native PDF evidence is Chromium only. WebKit is automated print-layout/CSV
acceptance, not physical iPhone Safari/PWA certification. No production data,
Firebase rules, packages, schemas, tax policy or deployment changes.
