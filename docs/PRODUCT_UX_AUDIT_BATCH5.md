# Batch 5 — AI reliability and trust

Baseline: Batch 4 merged main `9f921ef3c1c00c70765bd158969b9caa49b537f3`.

## Real weaknesses corrected

- Provider timeout formerly ended after response headers, leaving body reads unbounded. The same existing timeout now covers the entire response body and feeds the existing approved-provider fallback. Providers/models, free-only routing, circuit policy and confidential-data-free telemetry remain unchanged.
- Client cancellation is checked immediately after headers, before reading JSON, as well as after JSON. An aborted request cannot proceed into a hanging body reader or become successful.
- Explicit duplicate SKU quantity rows previously passed completeness checks through a Set even when a provider merged two requested lines. Quantity rows and recognized table rows now require matching multiplicity, while incidental repeated references and headings are not treated as extra products.
- The existing local quote parser recognizes conservative EN/AR pipe-column tables with explicit SKU, description, quantity and unit. It preserves order/repeated SKUs, normalizes Arabic/Persian numbers, retains evidence notes and creates only review proposals. Unknown columns, missing/malformed rows, more than 80 lines, mixed currencies and unknown price currency use the existing review/provider path instead of pretending to be a complete local result.
- Explicit decimal input accepts correctly grouped thousands separators, rejects ambiguous decimal commas and malformed Arabic thousands groups. Zero requested quantities, invalid supplied selling/cost values, invalid carton counts and malformed supplier landed-cost extras reject the entire proposal rather than silently disappearing. Unknown values still remain unknown.
- Quantity/product confidence now participates in existing quality fallback. Empty customer identity does not trigger extra provider requests merely because customer confidence is zero.

## Preserved architecture

Existing selectable-PDF text extraction, scanned-PDF native/vision handling, MIME/size limits, evidence/confidence review, matching, deterministic pricing, approval and safe mutation remain canonical. No wholesale Vault transmission, paid dependencies, packages or stored-schema changes. Accounting engines are untouched.

The voice ownership fix already merged in PR #491 was retained. New behavior coverage executes the actual production composer with a mocked native SpeechRecognition lifecycle, including delayed native release, manual stop/final result, repeated session, error/retry, stale callback, panel unmount and missing-onend cleanup. No second recognizer starts while the first owns the microphone.

## QA

TypeScript and production build PASS; static security PASS; dependency audit zero vulnerabilities. Nine new behavior/API contracts plus the existing 17 provider-router, five API/review safety and two source-faithfulness contracts PASS (33 checks across focused runs). Actual composer browser paths PASS in Chromium 390 EN and WebKit 320 AR: eight sessions each, zero overlapping starts, zero provider requests. This behavior runner joins the existing blocking stability job without another build or provider call.

## Limits

No independently available deployment/provider credentials were present, so no live-provider canary is claimed. Mocked SpeechRecognition proves UI/session ownership; it cannot prove a physical Safari microphone or speech-service implementation. Image/scanned-source completeness cannot be deterministically counted like explicit text rows; source evidence and user review remain necessary. The local parser deliberately declines ambiguous layouts instead of guessing.
