# LOUREX Invoice — Foundation Hardening Batch 1

This branch hardens the production foundation without changing invoice calculations, document templates, customers, product pricing, or business data semantics.

Implemented:

- Canonical production-source build guard for `allidamech-bot/INVOICE`.
- Runtime deployment identity metadata for diagnostics.
- User-controlled PWA update activation; updates are blocked while the document editor is open.
- Service-worker cache version aligned to v120 and stale control files marked no-cache on Vercel.
- Automatic encrypted safety snapshot before schema migration, restore, and PIN change.
- Privacy-safe `/health.html` system diagnostics page.
- Fatal error diagnostics now include deployment source/commit and link to System Health.
- Regression coverage for the foundation hardening behaviors.

Infrastructure note:

The connected Vercel account currently exposes an existing project linked to `allidamech-bot/lourex-bf110a8a`, not a dedicated Vercel project linked to `allidamech-bot/INVOICE`. The code now refuses a production build from a wrong repository when Vercel Git source metadata is available, but the Vercel project/repository link itself must be created or changed at the platform configuration layer before this repository can be the sole production source.
