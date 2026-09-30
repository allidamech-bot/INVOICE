# LOUREX Expansion Batch 3 — AI Assistant Experience + Help System

## Placement freeze

This batch improves discoverability and guidance without adding a new primary workspace.

### AI assistant
- Remains one global LOUREX assistant. No parallel AI-only business screens.
- Mobile: keep the existing floating shell action above the native bottom navigation; do not add AI to Bottom Nav.
- Desktop: keep the existing shell launcher and side panel behavior.
- The launcher must read visually as AI: use the existing `bot` icon, never the LOUREX brand mark.
- Add a subtle attention treatment and a short bilingual coachmark: `Your personal assistant in LOUREX` / `مساعدك الشخصي في LOUREX`.
- Attention treatment must respect `prefers-reduced-motion` and must not continuously distract the user.
- Preserve all current overlay/editor rules that hide the launcher when it could cover document, purchase, create-sheet or preview controls.

### Help and usage guidance
- Expand the existing Help Center instead of adding a new primary route.
- Keep Help under Help & Product Info / More / Settings access points already used by the shell.
- Build task-oriented bilingual guidance for:
  - Home and Action Center
  - Customers and Customer 360
  - Quotations, Proformas, Invoices and Commercial Flow
  - Products & Inventory
  - Purchasing and Supplier 360
  - Finance / Receivables
  - Reports and financial terminology
  - LOUREX AI and review/approval safety
  - Backup, Restore, Cloud Sync and recovery
  - PIN / Security / Account recovery
- Add contextual hints only where they reduce ambiguity. Do not create tutorial clutter or modal tours that interrupt normal work.

## Safety contract
- No expansion of AI mutation authority.
- Existing proposal → review → approval boundaries remain authoritative.
- Deterministic finance, pricing, document, receivables and purchasing engines remain the source of truth.
- No new `schemaVersion` migration is expected for this batch.
- No new primary navigation route.
- No new package dependency.

## Mobile / RTL contract
- iPhone-first; preserve safe areas and 44px minimum interactive targets.
- Coachmark and launcher must remain inside viewport at 320–430px widths.
- Arabic coachmark and Help content align RTL/right; English remains LTR.
- Reduced-motion users receive no pulsing/floating animation.
- AI launcher must not overlap Bottom Nav, create sheets, document editors/previews or purchase editors.

## QA gates
- TypeScript and production build.
- Contract tests for placement/safety and Help scope.
- Mobile Chromium EN/AR geometry checks for launcher/coachmark.
- Existing mobile, business, auth/documents, templates, locales, TailAdmin and v337 current shards remain blocking.
