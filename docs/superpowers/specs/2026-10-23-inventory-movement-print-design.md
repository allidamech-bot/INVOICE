# Inventory movement printed output — original item 5

Print the saved movement history matching the existing search, type, reason,
warehouse and date filters. Include all matches, including beyond the screen's
200-row cap. Show company/branch IDs, exact filters, count, date, historical item
names/SKU, movement ID/type, source ID/number, signed stored quantity, warehouse
endpoints and complete note. Do not infer historical units from today's product
or add unlike product quantities together. Unknown warehouse IDs remain visible.

Approach: a read-only React print portal directly under body, populated from the
same filtered records as the screen. Scoped named A4 print styles hide the app.
A separate window would duplicate document/font lifecycle; printing screen cards
would preserve truncated notes and the 200-row cap. No storage or AI changes.
Print synchronously from the user action; clean up afterprint, exceptions and
unmount; reject a changed active account before invoking the browser.

Acceptance: actual ProductsInventoryWorkspace in AppShell, English/Arabic,
Chromium/WebKit, short/long/empty/filtered and >200 matches; native Chromium PDFs,
references/quantities/full notes preserved, no blank pages/application controls,
no mutations. Linux WebKit is not physical iPhone acceptance.
