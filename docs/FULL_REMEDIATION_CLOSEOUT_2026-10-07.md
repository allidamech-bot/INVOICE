# LOUREX full remediation closeout audit — 2026-10-07

## Scope

Repository: `allidamech-bot/INVOICE`.

This Batch 4 branch is QA-only. It changes no runtime behavior or visual design. It records the ownership/root-cause findings and adds one closeout contract that verifies the already-merged Batch 2 and Batch 3 remediation invariants.

## Confirmed root causes

- Editor autosave churn: cloned but semantically unchanged CompanySettings could be treated as a new editor input and feed persistence-driven render churn. The editor now compares the company fields used by the editor instead of object identity.
- Bilingual direction: bilingual English/Arabic fragments previously depended on structural position. English and Arabic fragments now carry explicit language/direction identity, while phone/email/identifier/currency/numeric fields are isolated as LTR technical content.
- Selected customer/supplier visual identity: the editor used the generic multi-user glyph and generic customer avatar selector. It now uses a single-person glyph and dedicated `.editor-party-avatar`.
- Mobile LOUREX header mark: the real image was hidden while a smaller background copy rendered inside a larger control. The mobile owner now displays the actual 40px mark and no longer owns the sidebar brand.
- Layer hierarchy: v485 had introduced a second numeric layer namespace. Final application depth now uses the canonical `--lourex-z-*` ladder from the reliability bridge.

## Ownership map

- Semantic application palette/final visual normalization: `v485-visible-ui-corrections.css`.
- TailAdmin component structure: TailAdmin v320 component owners.
- Mobile LOUREX brand geometry: `tailadmin-mobile-header-v322.css`.
- Desktop/sidebar LOUREX brand: `product-os-v451.css`.
- Editor selected-party avatar: `tailadmin-editor-core-v320.css`.
- Overlay numeric hierarchy: `tailadmin-reliability-bridge-v320.css`.
- Domain workspaces: their domain stylesheet is bundled once into `app.bundle.css`; late runtime CSS injection is retired.
- Document/PDF paper: document output/template owners remain isolated from application chrome.
- AI conversation presentation/runtime: existing AI owner chain remains separate; this remediation does not alter AI behavior.

## Canonical depth scale

shell 60 → navigation 120 → editor dock 900 → backdrop 1100 → popover 1120 → sheet 1140 → search 1200 → AI 1220 → modal 1300 → toast 1360 → preview 1400 → critical 1500.

## Required closeout gates

- TypeScript + production build.
- Current contract tests.
- WebKit editor/navigation stability.
- Current TailAdmin/mobile/auth/business/locales/template browser shards.
- Quote Editor Final Lifecycle.
- Document Design Final QA.
- Manual Production publish only to Vercel project `invoice`.
- Post-deploy production SHA verification and live smoke/console/network/overflow audit.
