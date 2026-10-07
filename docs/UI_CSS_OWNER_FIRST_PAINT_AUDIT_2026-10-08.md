# LOUREX — CSS ownership and first-paint audit (2026-10-08)

Repository: `allidamech-bot/INVOICE`. Production site: `invoice-three-puce.vercel.app`.

## Approved baseline — do not redesign

- The existing quotation/invoice template picker displays **two adjacent cards per row on phones**. That is the approved UI.
- Maintain current card artwork, mobile toolbar, bilingual/RTL behavior, light/dark palette and document/PDF output.
- The photo of the vertical, one-column picker is an **obsolete UI state**, not an alternative design.
- A layout that briefly shows obsolete cards (including on the first 0–3 seconds of navigation) is a regression even if the final screenshot looks correct.

## Source-confirmed findings

1. `index.html` still references **78 distinct source CSS files**. The production pipeline concatenates the majority into `app.bundle.css`, but its CSS ownership is not equivalent to a single canonical owner per component.
2. Production intentionally retains standalone document owner styles `v331-draft-scroll-recovery.css` and `v332-critical-documents-deep-closeout.css`, plus final mobile repair `v482-mobile-ux-repair.css`. Do not remove these blindly; current tests and build scripts depend on their output order.
3. The `v331` runtime owner imports `v333` and `v337` and `v337` imports `v364` / `v365`. Browser loading/cascade behavior across these must remain deterministic.
4. `v330-critical-documents-closeout.css` carried an obsolete single-column mobile gallery override while `v365-mobile-editor-scroll-draft-templates.css` carried the approved two-column override. PR #602 makes the approved grid the earlier canonical rule and retires the later generic override.
5. `public/document-entry-v302.js` re-appended stylesheet link nodes on React reconciliations. PR #602 changes it to initialize ordering only once, skipping re-promotion in the production bundle.
6. The React `App.tsx` loading-brand surface is legitimate on initial loading and account transitions; an unexpected logo flash **during template selection** is not explained by the screenshot alone. Investigate reload, app remount, account-transition event, service worker or Safari process eviction with runtime evidence before patching the boot flow.

## Deterministic ownership target

- Application CSS: fixed order before the first interactive render. Feature owners manage their own selectors, not global overrides.
- Template picker: one mobile geometry owner, `v330` (with its shared `TemplateThumbnails` React component); Draft-specific overrides remain scoped under `.ta-draft-studio-workspace`.
- Z-index: central `--lourex-z-*` tokens from PR #601, not independent numeric ladders.
- AI: `tailadmin-ai-v320.css` for conversation/launcher; `tailadmin-ai-finish-v320.css` for dashboard advisor only.
- Startup: `v347-startup-single-layer.css` for boot visuals, never a replacement for ordinary screen layout.

## Acceptance and follow-up

- PR #602: unblock all CI, merge only on green HEAD, and verify the new SHA after deployment.
- This follow-up adds **frame-based, 2.25-second** Chromium/WebKit checks at 390/430 widths in Arabic/English, rather than relying on one final screenshot.
- Inventory remaining active `@import` dependency chains and dynamic stylesheet mutations after compilation; only consolidate a chain after baseline parity checks confirm no regression.
- Trace startup-brand flashes and genuine document page reloads separately from CSS flash.
- Validate mobile 320/390/430, tablet 820/900/901/1024 and desktop 1440, both languages and themes, More/Create, Global Search, modal, AI, document editor, preview and PDF.
- Release verification must inspect actual Production deployment SHA and repeat real-browser checks. Code-green is not equivalent to observed live success.

Do not close Issue #603 before all runtime and visual acceptance points above have evidence.
