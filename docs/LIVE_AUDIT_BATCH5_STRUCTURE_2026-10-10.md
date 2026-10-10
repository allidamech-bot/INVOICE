# LOUREX — Batch 5A: creation and settings structure

Date: 2026-10-10. Repository: `allidamech-bot/INVOICE` only.
Base: Batch 4A commit `f44419a7c64af7afb611c99d6b888e5e9fb65a7f` (draft PR #686).
Status: implementation and local automated verification complete; browser acceptance pending. No merge, deployment, production mutation or Replit operation.

## Verified defects and changes

| Area | Evidence before | Change | Acceptance evidence |
|---|---|---|---|
| Create badges (A05/A06) | `v330-template-contrast-guard.css` maps first item to DR, second to RFQ, third to QT although AppShell renders Quotation, Invoice, Draft | All ten buttons carry canonical `data-kind` from first render; badge and mobile accent selectors use identity, not position | Actual TSX menu rendering in Arabic/English, both menu variants; ten route callbacks; badge contracts |
| Kind recovery | `kindFromMenuButton` guessed kind by item index when label was unknown and trusted any explicit kind | Validate explicit identity; preserve recognized bilingual legacy labels; reject unknown labels without index fallback | Actual runtime function executed with reversed kinds, unknown labels and invalid explicit identity |
| Create organization (IA-001/002) | Ten undifferentiated entries | Sales: quotation, invoice, proforma invoice, delivery; Purchasing: RFQ, PO; Finance and other: receipt, credit note, statement, draft | Four rendered menu cases verify three groups and all ten options; no callbacks occur during rendering |
| Settings structure (A10/IA-005) | Vague tab names and separate Account entry without an internal shortcut | Preferences; Companies; Commercial & banking; Documents & artwork; Team & approvals; Data Center; Security. Bidirectional Account/Settings shortcut retains the current draft and selected tab | Actual scope switch method verifies draft references, dirty snapshots and tab persistence, plus busy/artwork guards |
| Save scope | Generic Save labels conceal persistence boundary: company/profile/artwork/commercial vs app preferences/output/security | Distinct bilingual save labels and accessible names; separate unsaved indicators; existing separate save operations and close confirmation preserved | Actual save-button callbacks and disabled states, dirty close guard, full regression suite |
| Account accessibility | Account hides tab navigation but panel points at a nonexistent settings tab | Account panel has its own accessible label; Settings retains selected-tab linkage | Source review and typecheck; actual screen reader/browser validation pending |
| Security instructions (A16) | Source claims every refresh requires PIN; runtime correction describes valid active sessions differently | Source now matches existing runtime session explanation; Arabic refers to More menu for sign-out | Source/runtime comparison; no change to authentication or PIN enforcement |

No data model, numbering allocation, persistence callback, company artwork value, record set or commercial calculation was changed. Menu route tests verify dispatch identity, not a full real-browser document lifecycle or number-allocation certification.

## Settings map and persistence

Account contains company logo, identity, contact, legal identifiers and session access. Settings links directly to it without closing/reopening the modal. Companies/branches remain in Companies; banking/trade controls remain in Commercial; signature/stamp and numbering/output remain in Documents; roles and approvals remain in Team; backup/activity remain in Data Center; PIN and recovery remain in Security. This retains the existing modal and storage boundaries.

“Save company settings” persists the existing company object, including profile, artwork, commercial controls and default currency across sections. “Save workspace preferences” persists the existing application-settings object, including output/numbering and security preferences. Interface language continues to persist immediately through its existing handler. Moving between sections is not a discard action; closing still checks both dirty snapshots.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed, completed before the full tests.
- `node --test tests/audit-batch5-structure-behavior.test.mjs`: 9 passed, 0 failed, 0 skipped.
- `node --test tests/*.test.mjs`: 2,268 passed, 0 failed, 0 cancelled, 0 skipped.
- `git diff --check`: passed.
- Manual source review: no new packages, persistence operations, document numbering calls or data migration. Direct menu button children are retained for existing keyboard/style owners; shared theme tokens style the group labels.

## Outstanding acceptance and continuation

Batch 4 graphical acceptance is still open. Chromium installation failed: the browser download endpoint returned HTML instead of the ZIP archive. No preexisting Batch 4 preview deployment was returned by the deployment listing. The production alias still identifies commit `37ee61c4b2318cfaae4b455d54143620b01be72d`; it cannot certify these candidate changes. No new preview was deployed. No screenshots of Batch 5 fixes were captured, and no screen is certified visually by this report. Physical iPhone/iPad testing remains excluded by the user.

Continue inventory/finance subtab entry links, Help/More guidance and broader business-screen density in Batch 6 against their actual screens and existing domain routes; do not duplicate inventory/CRM modules or invent routing. Batch 5A is not a declaration that every Batch 5 plan item is closed. Remaining acceptance includes real rendered grouping/overflow in both languages/themes, tab-name and save-button wrapping, focus after scope switches, persisted save/reopen behavior with synthetic records, all document creation paths and numbering, and broader navigation acceptance.

Main was read again before creating this candidate and remained `19e2a48b6ead561b77678d6145740fa8276101f0`. Keep the candidate draft, stacked on Batch 4; merge and deployment remain separate, unapproved steps.
