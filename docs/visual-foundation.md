# LOUREX Visual Foundation

## Final ownership rule

`src/styles/lourex-visual-foundation.css` is the single product-wide presentation owner.

Its production artifact is `dist/styles/lourex-visual-foundation.css`, emitted by `scripts/visual-foundation-finalize.mjs` as the final stylesheet in the deployed document.

Future palette, hierarchy, spacing, radius, elevation, responsive-shell, Documents, More-sheet, or cross-workspace visual changes must edit this stable file. Do not create a numbered `v486`, `v487`, or similar visual override layer.

## Active ownership map

### Structural/component baseline — retained

The TailAdmin v320 family remains because it defines component geometry and selectors used by the application: shell, dashboard, documents, customers, products, operations, finance, reports, settings, overlays, auth and editor structure. These files are not the final palette owner.

Feature-specific styles remain when they implement a scoped feature or workflow rather than an application-wide theme. Examples include Product OS, commercial flow, secure share, recurring workflows, audit trail, governance and workspace-specific functionality.

### Functional/reliability CSS — retained

`v331-draft-scroll-recovery.css`, `v332-critical-documents-deep-closeout.css`, v363/v364 mobile functional hardening and the TailAdmin reliability bridge remain for reachability, scrolling, safe areas, z-index, overlays, touch targets and WebKit/runtime safety.

The compatibility filename `tailadmin-reliability-bridge-v320.css` is intentionally retained because build/runtime tests locate it, but it no longer imports or owns the executive visual system.

### Historical visual generations — retired from the active cascade

The following generations remain only as repository history/legacy test inputs and are removed or not linked in the production visual cascade:

- Hostinger v353–v359
- Matte Black v360
- Mobile Density v361
- Premium UX v362
- Executive v480
- Premium v481
- v482 presentation CSS
- v483 mobile density presentation
- v484 responsive hierarchy presentation
- v485 visible UI corrections

The production finalizer explicitly strips marked copies of these historical owners from `app.bundle.css` so an old build-stage inclusion cannot silently regain cascade ownership.

### v482 runtime behavior — separated

The safe late-auth account transition that originally shipped in the v482 bundle script is preserved in `scripts/runtime-auth-transition-finalize.mjs`. It is runtime behavior only and does not read or emit visual CSS.

## Semantic system

The canonical foundation exposes semantic roles rather than page-specific colors:

- Canvas: `--app-canvas`, `--app-canvas-soft`
- Surfaces: `--app-surface`, `--app-surface-raised`, `--app-card`, `--app-card-hover`, `--app-input`
- Borders: `--app-border`, `--app-border-strong`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`
- Accent: `--accent`, `--accent-hover`, `--accent-soft`, `--accent-faint`
- State: `--danger`, `--success`, `--warning`, `--info` and their soft variants
- Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32px
- Radius: control / card / large / sheet
- Elevation: card / raised / overlay

Legacy `--ft-*` and `--ta-*` variables are compatibility aliases only. Their `!important` bridge is deliberately centralized at the token boundary because historical TailAdmin token declarations used `!important`; page-level palette overrides should not repeat that pattern.

## Responsive strategy

- **Phone:** below 720px
- **Tablet / iPad:** 720–1199px
- **Desktop:** 1200px and above

The tablet range intentionally hides the desktop sidebar and uses the five-action bottom navigation. This prevents the former breakpoint cliff where 899px behaved as mobile and 901px became a squeezed desktop layout.

## Hierarchy rule

Use visual surfaces only when they communicate hierarchy:

`Canvas → Section → Card → Control`

A DOM wrapper used for layout must remain visually transparent unless it has a real semantic/elevation role. Documents register, list/grid wrappers, toolbar layout wrappers and More-sheet groups follow this rule.

## Documents reference contract

Documents is the reference page for the foundation:

- The hero is a single layout column.
- The complete create-action container is centered geometrically with `margin-inline:auto` and `justify-self:center`.
- The register wrapper has no decorative background, border or shadow.
- Type filters wrap/grid rather than using masked horizontal clipping.
- Phone type filters use a two-column grid.
- Document rows/cards are the primary visual units.

The dedicated browser QA measures the create-group left/right hero gaps using actual `getBoundingClientRect()` values and rejects a difference greater than 3px.

## Validation

`tests/visual-foundation-current.test.mjs` locks the architecture statically.

`tests/visual/run-visual-foundation-current.cjs` captures and validates Dashboard, Documents, Customers, Operations and shell/More across:

- 320px dark Arabic
- 390px dark Arabic
- 390px light Arabic
- 390px dark English
- 768px and 820px iPad portrait dark Arabic
- 1024px and 1180px iPad landscape dark Arabic
- Desktop dark Arabic
- Desktop light Arabic
- Desktop dark English

Completion requires both automated gates and manual inspection of the generated screenshot artifact.
