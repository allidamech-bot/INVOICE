# LOUREX Invoice

LOUREX Invoice is a local-first web application for creating, saving, printing, exporting and sharing **Proforma Invoices (quotes)** and **Invoices**. The application is designed for desktop, tablet and mobile use, including iPhone/iPad PWA workflows.

## Architecture

- React + TypeScript, compiled as a static web application.
- IndexedDB is the primary local data store.
- Company data, customers, documents, saved items and settings are stored inside an encrypted local vault.
- Firebase Authentication provides the optional/required LOUREX cloud account flow used by the current product.
- Firestore stores only the encrypted vault payload and security metadata under the authenticated user's owner-only path.
- The application remains usable offline after the PWA shell has been cached.
- No accounting ledger, ERP, inventory accounting or server-side business database is included.

## Security model

- The local PIN is never stored as plaintext.
- PBKDF2-SHA-256 with a random salt derives the local AES-GCM key.
- Business data is encrypted with AES-GCM before it is stored in IndexedDB.
- Cloud synchronization uploads the already-encrypted vault in bounded chunks and verifies the ciphertext with SHA-256 metadata.
- Firestore rules restrict each user's vault path to that authenticated user.
- Encrypted `.lourex-backup` files use their own random salt and IV.
- PIN changes re-encrypt the local vault atomically.

The local PIN protects the encrypted vault on the device. As with any browser application, device security, browser storage and account security remain part of the overall security boundary.

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

Cloud synchronization stores encrypted ciphertext, not the decrypted invoice database. The client splits large encrypted vaults into bounded Firestore writes, validates metadata and ciphertext integrity, and uses revision checks to avoid silently overwriting a changed remote vault.

Manual **Sync Now** performs a full reconciliation. Normal saves are written locally first, then queued for cloud synchronization.

## Backup and restore

Backup creates one encrypted `.lourex-backup` file containing the complete vault. Restore validates and decrypts the selected file before replacing the current local vault. Existing data is not merged during a restore operation.

## Development

Requirements: Node.js 20+.

```bash
npm install
npm run typecheck
npm test
npm run build
```

The production build is written to `dist/`.

For a local static preview:

```bash
npm run dev
```

## Main structure

```text
src/
  app/          application lifecycle, lock state, persistence and cloud coordination
  cloud/        Firebase authentication and encrypted-vault synchronization
  components/   documents, customers, editor, settings and shared UI
  crypto/       Web Crypto PIN/key/encryption layer
  lib/          financial calculations, documents, backups, images and utilities
  storage/      IndexedDB, session handling, migrations and concurrent-write merge logic
  templates/    document renderers and template thumbnails
  styles/       application UI, responsive layers and printable A4 templates
  types.ts      shared strict data model
public/
  brand/        LOUREX PWA artwork
  sw.js         offline service worker
  ios-print-bridge.js  iOS PDF/print bridge
```

## Verification

`npm test` builds the production application and runs regression coverage for fixed-precision financial calculations, independent numbering, document snapshots, conversion/duplication, long-document pagination, encrypted storage, PIN verification, encrypted backup/restore, cloud ownership/integrity, PWA caching, iOS PDF behavior, RTL/LTR output, all template identifiers, mobile editor behavior and concurrent local writes.
