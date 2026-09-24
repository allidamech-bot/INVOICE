# LOUREX v320 — TailAdmin Finance full UI migration matrix

This branch replaces the legacy LOUREX visual system with the TailAdmin Finance design language. The migration is intentionally split into batches, but the release is not considered complete until every surface below is marked DONE and reviewed in both Arabic/English and Light/Dark modes.

## Guardrails
- Preserve v318 persistence, iPhone/Safari stability, encrypted vault, PIN, Firebase/Auth, accounting calculations, document lifecycle, PDF and print behavior.
- No direct commits to `main`.
- No production publish before final visual review and verification.
- Preview deployments are manual/intentional only; feature branches must not auto-deploy on every commit.
- TailAdmin Community/MIT assets and patterns may be reused with the required copyright/license notice. Proprietary TailAdmin Finance source is not copied unless a licensed package is supplied.
- v320 is a structural replacement. A surface is not considered migrated merely because a late CSS layer recolors legacy markup.

## Coverage matrix

| Surface | Status | Batch |
| --- | --- | --- |
| Global TailAdmin tokens, typography, buttons, inputs, focus states | IN PROGRESS | 1-2 |
| Desktop shell/sidebar/topbar/search | DONE | 2 |
| Mobile shell/navigation/create menu/more sheet/safe areas | DONE | 2 |
| Home / Finance dashboard | IN PROGRESS | 1-3 |
| Documents register/search/filter/detail | IN PROGRESS | 1-3 |
| Document editor / Draft Studio | TODO | 3 |
| Customers + customer profile | TODO | 4 |
| Products & Inventory | TODO | 4 |
| Purchasing / suppliers / operations | TODO | 5 |
| Finance / receivables / collections / expenses | TODO | 5 |
| Reports / analytics | TODO | 5 |
| Settings / Account / Security / PIN | TODO | 6 |
| Authentication / onboarding / lock screens | TODO | 6 |
| AI surfaces / alerts / assistant | TODO | 6 |
| Modals / popovers / menus / dropdowns / empty states | IN PROGRESS | 2-7 |
| RTL Arabic pass | IN PROGRESS | 2-7 |
| Light/Dark parity pass | IN PROGRESS | 1-7 |
| iPhone/iPad/Safari geometry + safe-area pass | IN PROGRESS | 2-7 |
| Final no-legacy-visual audit | TODO | 8 |
| Final unit/build/visual verification | TODO | 8 |

## Batch 2 structural replacement

The application shell is no longer the old shell with a TailAdmin color overlay. `AppShell.tsx` now renders a dedicated TailAdmin-style hierarchy for the sidebar, grouped navigation, top bar, global search trigger, account affordance, sync state, create-document menu, mobile bottom navigation and mobile More sheet. The v320 bootstrap retires the replaced shell-specific legacy style owners before installing the new structural shell stylesheet.

The shell replacement deliberately keeps the existing callbacks and security/reliability contracts intact: navigation callbacks, Firebase sign-out, encrypted session clearing, cloud-conflict handling, AI navigation, create-document actions, overlay focus trapping and iPhone safe-area behavior remain functionally owned by the existing LOUREX logic.

## Acceptance rule
No partial legacy styling is accepted at release. A page is only DONE when its shell, headings, controls, search, filters, tables/lists, cards, states, overlays, responsive behavior, RTL and dark mode all use the same TailAdmin visual grammar.
