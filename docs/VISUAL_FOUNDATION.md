# LOUREX Visual Foundation

## Canonical owner

`src/styles/lourex-visual-foundation.css` is the only application-wide visual owner.

Future palette, surface hierarchy, spacing, radius, shell, Documents, Customers,
More sheet, mobile navigation, tablet and desktop visual changes must be made in
that file. Do not create another versioned visual closeout stylesheet.

## Ownership audit

### A. Necessary structural / functional CSS

These remain because they own layout primitives or reliability behavior rather
than the final palette:

- `styles/app.css`, `styles/rtl.css`, `styles/tablet-editor.css`
- TailAdmin v320 component styles for shell, dashboard, documents, editor,
  customers, products, finance, operations, settings, auth, overlays and utilities
- v331 draft scroll recovery and v332 critical document reachability
- v363/v364 mobile functional hardening, modal reconciliation and workflow safety
- feature-specific batch styles (products, commercial flow, secure share,
  recurring workflows, governance/workspaces)
- startup-only v347 paint/recovery contract

The canonical foundation provides the final semantic tokens (`--app-*`,
`--text-*`, `--accent*`) and bridges them to the older `--ft-*` variables still
consumed by structural TailAdmin rules.

### B. Obsolete visual generations

The following generations are retired from the production visual cascade:

- Hostinger v353–v359
- Matte Black v360
- Mobile Site Density v361
- Premium UX Coherence v362
- Executive visual owners v480
- Premium visual owners v481
- Mobile visual repair/density/hierarchy layers v482–v485
- v346 application palette owner

The historical files remain in repository history where useful for auditability,
but the production finalizer strips their bundle blocks and does not use their
versioned bundlers.

### C. Conflicts that caused the rebuild

The former build executed consecutive “final owners” (v480, v481, v482, v483,
v484, v485). Several of those layers re-aliased older color variables with
`!important`, while v482–v485 also wrote into a standalone late-loaded stylesheet.
The result was page-specific cascade ownership, duplicated dark surfaces and a
source/production ordering difference.

The v480 source imports are now compatibility stubs only. The last stub imports
the canonical foundation for source/dev. Production removes those imports and
loads the canonical generated stylesheet once after the v331/v332 functional
owners.

### D. Consolidated responsibilities

`lourex-visual-foundation.css` owns:

- semantic dark/light tokens
- canvas → section → card → control hierarchy
- shell, sidebar and topbar presentation
- shared workspace/card/control presentation
- Documents hero/action centering, summary grid, register, filters and cards
- Customers and operational workspace surface grammar
- More sheet hierarchy
- mobile navigation and safe-area clearance
- phone, tablet/iPad and desktop responsive visual rules
- spacing and radius scales

Business logic, storage, Vault, autosave, auth, AI, PDF/share and routing do not
belong to the visual foundation.

## Build contract

`scripts/visual-foundation-finalize.mjs` removes retired visual blocks from the
production bundle, emits `dist/styles/lourex-visual-foundation.css`, rewires the
production HTML/service-worker cache to that canonical artifact, and keeps a
`v482-mobile-ux-repair.css` generated alias only for historical visual QA fixtures.
The alias has no independent source ownership.

The former v482 late-auth hard-reload prevention lives separately in
`scripts/runtime-auth-transition-finalize.mjs`; it emits no CSS.

## Rule for future visual work

1. Change the canonical foundation or the component's structural stylesheet when
   the change is genuinely structural.
2. Do not add a new versioned application-wide CSS owner.
3. Do not solve layout by adding a decorative wrapper surface.
4. Prefer semantic tokens over page-specific colors.
5. Keep responsive behavior within Phone / Tablet / Desktop ranges, adding a
   narrow sub-adjustment only when the shell structure requires it.
6. Validate the actual rendered screenshots; a passing build alone is not visual
   acceptance.
