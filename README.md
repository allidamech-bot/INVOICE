# LOUREX Invoice

LOUREX Invoice is a local-first web application for creating, saving, printing, exporting and sharing **Proforma Invoices (quotes)** and **Invoices**. The application is designed for desktop, tablet and mobile use, including iPhone/iPad PWA workflows.

## Architecture

- React + TypeScript, compiled as a static web application.
- IndexedDB is the UID-scoped local cache; Firebase Firestore is authoritative for the current signed-in workspace.
- Firebase Authentication (Google or email/password) is the only interactive sign-in boundary; the current workspace has no separate device PIN.
- Firestore hosts each signed-in user's authoritative `workspace-v2` data and revisioned history under that account's owner-only paths.
- IndexedDB holds a UID-scoped local workspace for fast access and offline operation after the account has been initialized.
- The current business workspace includes documents, customers, saved items, purchasing and finance records; historical encrypted local records are not part of its active sign-in flow.

## Security model

- Access to the current account workspace requires a valid Firebase Authentication session.
- Firebase UID ownership is enforced in client-side storage scoping and Firestore security rules.
- The `workspace-v2` data format is JSON encoded for transport, **not** an application-layer end-to-end encrypted vault. Firebase service transport/storage protections and account access controls are the relevant security boundaries.
- Cloud updates use SHA-256 validation, revision checks and compare-and-swap to detect conflicting writes.
- An exported LOUREX V2 local copy is **not encrypted**; protect it as sensitive business information.
- Historical encrypted record formats and cryptography may remain in the codebase for compatibility. They do not grant account access and must not trigger device PIN screens.

Protect the Firebase account, linked Google/email credentials, connected devices and downloaded business-data copies.

## Documents

The two supported document kinds are:

- Proforma Invoice / Quote
- Invoice

Document numbering is independent (`PI-YYYY-####` and `INV-YYYY-####` by default). Documents can use English, Arabic or bilingual content. Arabic dates remain Gregorian and the printable renderer explicitly isolates LTR/RTL direction from the application interface direction.

The current renderer supports 18 template identifiers:

`executive`, `minimal`, `trade`, `signature`, `obsidian`, `cobalt`, `editorial`, `split`, `prism`, `slate`, `horizon`, `mono`, `aurora`, `ledger`, `noir`, `midnight`, `blackivory`, `carbon`.

Saved documents keep customer/company snapshots so later edits to master customer or company records do not silently alter historical documents.

## PDF, print and share

LOUREX uses the browser's native print/PDF engine so exported documents keep selectable text, A4 sizing, Arabic shaping and multi-page page breaks.

- Desktop browsers use the normal print/PDF flow.
- iPhone/iPad use a gesture-safe PDF bridge that opens the PDF destination from the user's tap before asynchronous finalization work begins.
- The iOS PDF view includes a direct **Save PDF / حفظ PDF** action for Safari's native print/share sheet.
- Printable pages remain physical A4 (`210mm × 297mm`) and phone previews scale the whole sheet rather than shrinking the internal document layout.

## Cloud synchronization

Cloud synchronization stores the current `workspace-v2` snapshot and revision metadata in Firebase Firestore. The client uses bounded writes, SHA-256 validation and revision checks to avoid silently overwriting changes from another device.

An initialized account maintains a UID-scoped local copy for immediate editing. Changes are queued for automatic cloud publication and reconciliation; the app must report a failed sync instead of claiming that an uncommitted change reached another device.

## Backup and restore

The optional local export produces a LOUREX V2 JSON copy that is **not encrypted**. Import validates the chosen V2 copy and requires explicit confirmation before replacing the current cloud workspace. Import does not automatically merge historical data. Legacy encrypted exports are not part of the current import flow.

## Development

Requirements: Node.js 24.x.

```bash
npm ci
npm install --no-save --package-lock=false playwright@1.55.0
npx playwright install chromium webkit
node scripts/verify-local.mjs
```

The production build is written to `dist/`.

For a local static preview:

```bash
npm run dev
```

## Main structure

```text
src/
  app/          Firebase account lifecycle, workspace persistence and cloud coordination
  cloud/        Firebase authentication, versioned workspace storage and sync
  components/   documents, customers, editor, settings and shared UI
  crypto/       historical vault cryptography and compatibility utilities
  lib/          financial calculations, documents, backups, images and utilities
  storage/      UID-scoped IndexedDB, AI cache encryption and concurrent-write merge logic
  templates/    document renderers and template thumbnails
  styles/       application UI, responsive layers and printable A4 templates
  types.ts      shared strict data model
public/
  brand/        LOUREX PWA artwork
  sw.js         offline service worker
  ios-print-bridge.js  iOS PDF/print bridge
```

## Verification

`node scripts/verify-local.mjs` is the mandatory **local** replacement for the retired GitHub Actions workflows. It runs the high-severity dependency audit, LOUREX security gate, TypeScript, production build, current Batch 7 and changed PR contract tests, plus Chromium/WebKit mobile, iPad, document and workspace browser QA.

Run `node scripts/verify-local.mjs --legacy` to include historical, non-blocking diagnostics; `--quick` is development-only and **not sufficient** for merge approval. No GitHub-hosted CI check will appear on Pull Requests, so the final PR head must be verified and signed off manually.

See [local verification and PR signoff](docs/LOCAL_VERIFICATION_NO_ACTIONS.md) for setup and complete instructions.
