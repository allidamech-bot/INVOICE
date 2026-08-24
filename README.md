# LOUREX Invoice

A private, local-first web application for creating **Proforma Invoices** and **Invoices**. It has no backend, no cloud database, no external login, and no accounting/ERP modules.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Production build

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

The production application is written to `dist/`. It can be hosted as a static site on any HTTPS-capable static host. HTTPS is recommended for PWA installation and Web Crypto support.

## Data and security

- All business data is stored locally in **IndexedDB**.
- The PIN is never stored as plain text.
- The vault key is derived with **PBKDF2-SHA-256** using a random salt and 310,000 iterations.
- Local business data is encrypted with **AES-GCM-256**.
- Backups are encrypted `.lourex-backup` files with their own random salt and IV.
- Changing the PIN re-encrypts the local vault atomically.
- Restoring a backup replaces the current local data after validation while keeping the current app PIN.

Because this is intentionally a client-only application, the PIN protects the local encrypted vault but is not a substitute for server-side authentication on a shared or compromised device.

## PDF, print, and share

The application uses the browser's native print/PDF engine for the production PDF path. This preserves real/selectable text, A4 sizing, Arabic shaping, RTL, bilingual content, and multi-page page breaks instead of placing screenshots inside a PDF.

- **Print** opens the system print view with only the document visible.
- **PDF** opens the same document-only print view; choose **Save as PDF**.
- **Share** opens the system document/PDF flow. On iPhone/iPad/Android, the resulting PDF can be shared from the native print/share interface. If the platform does not expose file sharing, save the PDF first and share it normally.

## Editing the design

Central design tokens are in:

- `src/styles/app.css` — application UI, spacing, typography, controls, responsive behavior.
- `src/styles/document.css` — A4 document system and the four invoice templates.

Templates are rendered separately from document data:

- `src/templates/TemplateRenderer.tsx`
- `src/templates/TemplateThumbnails.tsx`

The four V1 templates are `executive`, `minimal`, `trade`, and `signature`. Changing one template does not change saved document data.

## Main structure

```text
src/
  app/          application shell and lock state
  components/   documents, customers, editor, settings, shared UI
  crypto/       Web Crypto PIN/key/encryption layer
  lib/          document logic, calculations, backups, utilities
  storage/      IndexedDB encrypted vault and migrations
  templates/    invoice template renderers
  styles/       app and printable A4 styles
  types.ts      strict shared data model
public/
  brand/        LOUREX logo and PWA icons
  vendor/       local React runtime
  sw.js         offline service worker
```

## Tests

`npm test` builds the production application and checks financial calculations, numbering, snapshots, conversion/duplication logic, 30+ item pagination, PIN verification, encrypted backup/restore, encrypted IndexedDB persistence, PWA production assets, print isolation, and unfinished/external-backend regressions.
