# R07S — Scoped Original Source and Evidence Review Bridge

Date: 2026-10-31. AI Next. Disabled server-side integration candidate.

## Implemented

- Introduced a **read-only** handoff between existing R02 document extraction (including its checkpoints, Coverage and DocumentEvidence contracts) and the existing R07P GroundedIntent; no additional parser, storage architecture or coordinator.
- Requires the independently authorized exact nine-field scope on intent, document coverage, checkpoint, evidence and immutable original object store.
- Reads and SHA-256-verifies complete original bytes from an injected R02/R07E-compatible source repository before showing an evidence preview.
- Honors strict source ID selection for up to ten attachments, rejects missing/foreign/extra sources, altered source revisions, wrong checkpoints and duplicate evidence IDs.
- Preserves original page, sheet, row and cell provenance in a bounded preview with explicit omitted-count and truncation warnings. Incomplete/OCR-review sources explicitly remain incomplete.
- All extracted evidence remains untrusted for finance until separately verified by human/business authority. This module NEVER returns approval or execution permission and always states canClaimCompleteDocumentAnswer=false.

## Test scope

Synthetic original-byte, CSV, Arabic numeral, multi-attachment, scanned/OCR-review, missing source, foreign scope, corrupt bytes, altered checkpoint, duplicate evidence, unsafe intent and preview-limit test cases. Reuses R02/R07E regression suites.

## Not implemented / not accepted

This does not activate OCR vendors, verify real scanned document recognition, provision storage buckets, check deployed Cloud IAM/rules, map extracted rows to financial business records, authorize source-to-draft edits, enable private inference or assert that a prompt can fully represent a long original file. No production endpoint or feature flag is enabled. No finance file is edited.

R07S broader work remains OPEN: real file ingestion workflow, secure cloud object authorization, cross-document semantic reasoning, human review, provider privacy and on-device acceptances. T22/T23/T24 and cloud/production gates remain open.

Full measured test results belong to exact-final-head GitHub Actions, not this document.
