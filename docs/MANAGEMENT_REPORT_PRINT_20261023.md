# Management performance report print acceptance — 23 October 2026

Baseline: main `7cddc53538a485ba400d21616d7bcd1d93912c48`.

The original item 6 requests checking the final management-report output rather
than accepting only its screen. This change addresses the Performance view of
ReportsPage. It does not close every report view or the original forty-item list.

## Confirmed failure and cause

A synthetic fixture rendered the real ReportsPage inside the real AppShell and
application wrappers, then invoked its Print / Save PDF button. Chromium produced
one entirely blank A4 PDF (880 bytes, zero extracted text). The report itself had
a zero-size print box because the global invoice print rule hides `.app-ui`.
The report remains inside that element, unlike invoice print portals. Re-enabling
that ancestor alone leaked navigation and left obsolete report selectors unable
to format the current TailAdmin header, logo and summary fields.

## Scoped correction

Only `src/styles/tailadmin-finance-workspaces-v320.css` changes application
behavior, exclusively under `body.printing-financial-report` and print media.
Restore the real report ancestor chain, remove shell and filter siblings from
print layout, use a named A4 page, and bind the existing report print intent to
current TailAdmin classes. Bound the logo, separate summary labels and values,
and allow the actual customer table to wrap and paginate. Screen styling,
accounting, filtering, source records and invoice portals are unchanged.

## Acceptance

`tests/visual/management-report-print.html` uses forty synthetic customers with
long English/Arabic names, twenty USD and twenty EUR invoices, and partial
collections. Each invoice is 100.00 with 60.00 cost and 25.00 collection: expected
net sales 2,000.00, gross profit 800.00, collection 500.00 and outstanding/overdue
1,500.00 per currency. A future invoice must remain excluded.

`node tests/visual/run-management-report-print.cjs` checks both languages and
three real UI filter states (all currencies, USD, one customer search), on
Chromium and WebKit: twelve browser combinations and six Chromium-native PDFs.
It checks report visibility/width, financial columns, compact logo, known totals,
selected dates/currency, each customer reference exactly once, full English
customer names, absence of blank PDF pages and shell sentinels, source immutability
and afterprint cleanup. Search narrows the customer table while the existing
summary remains period/currency based; the test preserves that behavior.

Local Chromium's six combinations passed. Twenty-one focused report/output Node
tests passed. The source build passed. Removing only the added print CSS from the
built bundle made the new test fail at the real-print-box assertion; the corrected
bundle was restored. WebKit is required in the
new pinned Playwright CI workflow before merge. Native PDF extraction is Chromium
only; WebKit validates print layout, not physical Safari or a native WebKit PDF.
Visual review covers the long English/Arabic report pages and the corrected first
page summaries. No production data, Firebase settings, package changes or deploy.
