# LOUREX AI Next — R07C Real Binary Parser Acceptance

Date: 2026-10-30
Scope: Offline browser acceptance, no live user data, no AI calls and no financial writes.

## What is genuinely exercised

The new test builds **real PDF binary bytes**, not a mocked `getDocument`. It loads the repository's existing vendored PDF.js runtime and PDF.js worker in both Chromium and WebKit, passes actual bytes through R02 `PdfSourceAdapter` and `ingestDocument`, and verifies 35/35 PDF pages, page locators, full source SHA-256 and preservation of more than 24,000 extracted characters.

An eight-page image-only PDF contains a true PDF image XObject per page. Unconfigured OCR must block every page. The second test uses an *injected synthetic OCR responder*, deliberately returning an unreadable fourth page, to prove no false source completeness or fabricated verification. This is NOT proof of real OCR output quality.

Two real spreadsheet binaries are built with the existing vendored SheetJS runtime: XLSX and legacy BIFF8 XLS. Both pass through R02 `SpreadsheetSourceAdapter` and preserve original worksheets, physical blank rows, repeated product rows, Arabic/Persian digits, empty selling prices and exact cell references. A CSV fixture tests multiline quoted fields and blank rows.

All test formats remain `financialDraftEligible:false`; even complete extraction page coverage is not a business-field verification or permission to issue a quote.

## Known limits

- The PDFs and workbooks are genuine binary files with **synthetically generated business text**. They are not customer files and not broad real-world parser compatibility evidence.
- WebKit is an approved representative test engine here, not a physical iPhone Safari acceptance.
- No live OCR, prompt injection, corrupted workbooks, decompression bomb tests, actual 10-file UI ingestion or data residency acceptance are proven by this stage.
- R07 authoritative company/branch ACL, encrypted durable storage and server source-object backup remain blocked; mocks and in-browser memory are not cross-device persistence.
- Existing finance code, Firestore rules, secrets, paid inference, production deployment and AI feature flags remain unchanged.

A passing R07C CI can move the **narrow real-binary adapter test** portion of T07/T08/T09/T10 forward, not the overall R07 production acceptance.
